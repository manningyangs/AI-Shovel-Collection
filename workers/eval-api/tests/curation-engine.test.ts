/**
 * 精选推荐引擎单测（任务书 §三/§五；阶段一验收：去重、硬性检查、评分可追溯、状态机）
 */
import { describe, expect, it } from "vitest";
import {
  buildFacts,
  mergePools,
  nextStatus,
  normalizeRepoSlug,
  runHardCheck,
  scoreRepo,
  type MergedCandidate,
  type PoolAutoRecord,
  type PoolCommunityRecord,
} from "../src/curation/engine";
import { ALGORITHM_VERSION, SCORE_WEIGHTS, THRESHOLDS } from "../src/curation/config";
import { parseCatalogSlugs } from "../src/curation/service";

/* ------------------------------ 标准化 ------------------------------ */

describe("normalizeRepoSlug（§5.2 仓库标识标准化）", () => {
  it("接受 URL 并统一大小写 / 去 .git / 去尾斜杠", () => {
    expect(normalizeRepoSlug("https://github.com/Owner/Repo")).toBe("owner/repo");
    expect(normalizeRepoSlug("http://www.github.com/owner/Repo.git")).toBe("owner/repo");
    expect(normalizeRepoSlug("https://github.com/owner/repo/")).toBe("owner/repo");
    expect(normalizeRepoSlug("github.com/Owner/Repo")).toBe("owner/repo");
  });

  it("接受裸 owner/repo", () => {
    expect(normalizeRepoSlug("owner/repo")).toBe("owner/repo");
    expect(normalizeRepoSlug("Owner/Repo.git")).toBe("owner/repo");
  });

  it("拒绝非 GitHub 与非法输入", () => {
    expect(normalizeRepoSlug("https://gitlab.com/a/b")).toBeNull();
    expect(normalizeRepoSlug("")).toBeNull();
    expect(normalizeRepoSlug(null)).toBeNull();
    expect(normalizeRepoSlug("just-a-name")).toBeNull();
  });
});

/* ------------------------------ 跨来源合并去重 ------------------------------ */

describe("mergePools（跨来源合并：同一仓库仅一条主记录）", () => {
  const auto: PoolAutoRecord[] = [
    { repo_slug: "Foo/Bar", title: "foo/bar", desc: "auto desc", extra: { confidence: 8, endpoint_status: "ok" } },
    { repo_slug: "solo/auto", title: "solo/auto", desc: "only auto" },
    { repo_url: "https://not-github.example/x", title: "bad" },
  ];
  const community: PoolCommunityRecord[] = [
    { submission_id: "s-1", repo_slug: "foo/bar", title: "Foo Bar", description: "community desc", stars: 100 },
    { submission_id: "s-2", repo_slug: "solo/community", title: "solo community", description: "d" },
  ];

  const merged = mergePools(auto, community);

  it("两池同仓库 → 只产生一条主记录，sources 含两个来源", () => {
    const dup = merged.filter((m) => m.slug === "foo/bar");
    expect(dup).toHaveLength(1);
    expect(dup[0].sources).toEqual(expect.arrayContaining(["auto_discovery", "community_submission"]));
    expect(dup[0].auto).not.toBeNull();
    expect(dup[0].community).not.toBeNull();
  });

  it("单来源候选正常保留，非法标识被跳过", () => {
    expect(merged.find((m) => m.slug === "solo/auto")?.sources).toEqual(["auto_discovery"]);
    expect(merged.find((m) => m.slug === "solo/community")?.sources).toEqual(["community_submission"]);
    expect(merged.some((m) => m.url.includes("not-github"))).toBe(false);
  });
});

describe("parseCatalogSlugs（精选库查重集合）", () => {
  it("从 catalog.csv 解析标准化 slug", () => {
    const csv = [
      "分类,全名,URL",
      "1. Foo,1. Foo 工具,https://github.com/Foo/Tool.git",
      "2. Bar,2. Bar 工具,https://github.com/owner/repo/",
      "",
      "3. Bad,3. 非法,https://gitlab.com/a/b",
    ].join("\n");
    const set = parseCatalogSlugs(csv);
    expect(set.has("foo/tool")).toBe(true);
    expect(set.has("owner/repo")).toBe(true);
    expect(set.size).toBe(2);
  });
});

/* ------------------------------ 硬性资格检查（§5.3） ------------------------------ */

function factsOf(overrides: Partial<Parameters<typeof buildFacts>[0]> = {}): ReturnType<typeof buildFacts> {
  const merged: MergedCandidate = {
    slug: "acme/ai-tool",
    url: "https://github.com/acme/ai-tool",
    title: "acme/ai-tool",
    description: "An AI agent tool that automates workflows for developers with MCP support",
    auto: null,
    community: null,
    sources: ["community_submission"],
    ...(overrides as object),
  };
  return buildFacts(
    merged,
    {
      exists: true,
      description: "An AI agent tool that automates workflows for developers with MCP support",
      topics: ["ai", "agent", "mcp"],
      language: "TypeScript",
      licenseSpdx: "MIT",
      stars: 500,
      forks: 40,
      pushedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      createdAt: "2024-01-01T00:00:00Z",
      archived: false,
      fork: false,
      homepage: "https://example.com",
      sizeKb: 320,
    },
    false,
  );
}

describe("runHardCheck（硬性资格检查）", () => {
  it("正常仓库全部通过（含重复检查）", () => {
    const r = runHardCheck(factsOf());
    expect(r.passed).toBe(true);
    expect(r.blockReason).toBeNull();
    expect(r.checks.find((c) => c.key === "duplicate")?.result).toBe("pass");
  });

  it("已存在精选库 → fail 并给出拦截原因（§12.1.5 幂等保护）", () => {
    const f = factsOf();
    const r = runHardCheck({ ...f, inCatalog: true });
    expect(r.passed).toBe(false);
    expect(r.blockReason).toContain("精选库");
  });

  it("仓库 404 → fail", () => {
    const f = factsOf();
    const r = runHardCheck({ ...f, exists: false });
    expect(r.passed).toBe(false);
    expect(r.blockReason).toContain("404");
  });

  it("完全无 AI 信号 → fail（非 AI 工具不能进入推荐）", () => {
    const f = factsOf();
    const noAi = {
      ...f,
      name: "markdown-notes",
      description: "A simple markdown note taking app",
      topics: ["notes", "markdown"],
      suggestedCategory: null,
      fromAuto: false,
      auto: null,
      poolConfidence: null,
      endpointVerified: false,
    };
    const r = runHardCheck(noAi as never);
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.key === "ai_relevance")?.result).toBe("fail");
  });

  it("许可证缺失 → 仅 warn「待核实」，不 fail（§5.3 禁止负面定性）", () => {
    const f = factsOf();
    const r = runHardCheck({ ...f, licenseSpdx: null });
    expect(r.passed).toBe(true);
    const lic = r.checks.find((c) => c.key === "license");
    expect(lic?.result).toBe("warn");
    expect(lic?.detail).toContain("待核实");
  });

  it("空仓库 → fail", () => {
    const f = factsOf();
    const r = runHardCheck({ ...f, sizeKb: 0, stars: 0, description: "", topics: [] });
    expect(r.passed).toBe(false);
  });
});

/* ------------------------------ 评分（§5.4/§5.5） ------------------------------ */

describe("scoreRepo（100 分制评分与证据）", () => {
  it("七维权重合计 100，总分 = 各维之和", () => {
    const f = factsOf();
    const s = scoreRepo(f);
    const weightSum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(weightSum).toBe(100);
    expect(s.dimensions).toHaveLength(7);
    const dimSum = s.dimensions.reduce((a, d) => a + d.score, 0);
    expect(s.total).toBe(dimSum);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it("每个维度都有 evidence（可追溯）", () => {
    const s = scoreRepo(factsOf());
    for (const d of s.dimensions) {
      expect(d.evidence.length).toBeGreaterThan(0);
      expect(d.weight).toBeGreaterThan(0);
    }
    expect(s.reason).toContain("分");
  });

  it("数据缺失 → confidence 降级 + 中性分（不作严重负面 §5.5）", () => {
    const f = factsOf();
    const sparse = { ...f, stars: null, licenseSpdx: null, pushedAt: null, language: null };
    const s = scoreRepo(sparse as never);
    expect(s.dataConfidence).toBe("insufficient"); // ≥2 维度缺数据
    const community = s.dimensions.find((d) => d.key === "community");
    expect(community?.confidence).toBe("insufficient");
    expect(community?.score).toBeGreaterThan(0); // 中性分而非 0
    const activity = s.dimensions.find((d) => d.key === "activity");
    expect(activity?.score).toBeGreaterThan(0);
  });

  it("活跃度随时间衰减：7 天前满分、2 年前近零", () => {
    const fresh = scoreRepo({
      ...factsOf(),
      pushedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    } as never).dimensions.find((d) => d.key === "activity")!;
    const stale = scoreRepo({
      ...factsOf(),
      pushedAt: new Date(Date.now() - 800 * 86400000).toISOString(),
    } as never).dimensions.find((d) => d.key === "activity")!;
    expect(fresh.score).toBe(15);
    expect(stale.score).toBeLessThan(3);
  });

  it("Stars 对数刻度：高星项目社区维度得分更高", () => {
    const low = scoreRepo({ ...factsOf(), stars: 2 } as never).dimensions.find((d) => d.key === "community")!;
    const high = scoreRepo({ ...factsOf(), stars: 5000 } as never).dimensions.find((d) => d.key === "community")!;
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.score).toBeLessThanOrEqual(10);
  });
});

/* ------------------------------ 状态机（§六/§八） ------------------------------ */

function evalAt(score: number, confidence: "ok" | "partial" | "insufficient" = "ok") {
  const f = factsOf();
  const hard = runHardCheck(f);
  const s = scoreRepo(f);
  s.total = score;
  s.dataConfidence = confidence;
  return { hard, score: s };
}

describe("nextStatus（推荐状态机）", () => {
  it("≥80 且证据充分 → recommended（新候选）", () => {
    const e = evalAt(85);
    const d = nextStatus("pending_review", e.hard, e.score);
    expect(d.status).toBe("recommended");
    expect(d.changed).toBe(true);
  });

  it("70-79 → watching（§八.4 跌破门槛撤销公开）", () => {
    const e = evalAt(75);
    expect(nextStatus("recommended", e.hard, e.score).status).toBe("watching");
  });

  it("<70 → not_recommended", () => {
    const e = evalAt(60);
    expect(nextStatus("recommended", e.hard, e.score).status).toBe("not_recommended");
  });

  it("≥80 但证据不足 → watching（§5.5）", () => {
    const e = evalAt(88, "insufficient");
    expect(nextStatus("pending_review", e.hard, e.score).status).toBe("watching");
  });

  it("硬性失败 → blocked（历史保留）", () => {
    const f = factsOf();
    const hard = runHardCheck({ ...f, inCatalog: true });
    const s = scoreRepo(f);
    expect(nextStatus("recommended", hard, s).status).toBe("blocked");
  });

  it("promoted 终态不被评分淘汰（§八.6）", () => {
    const e = evalAt(10);
    const d = nextStatus("promoted", e.hard, e.score);
    expect(d.status).toBe("promoted");
    expect(d.changed).toBe(false);
  });

  it("rejected 终态保留", () => {
    const e = evalAt(95);
    expect(nextStatus("rejected", e.hard, e.score).status).toBe("rejected");
  });

  it("reviewing/approved 人工推进态在分数达标时保持", () => {
    const e = evalAt(90);
    expect(nextStatus("reviewing", e.hard, e.score).status).toBe("reviewing");
    expect(nextStatus("approved", e.hard, e.score).status).toBe("approved");
  });

  it("算法版本与门槛集中配置（§5.4）", () => {
    expect(ALGORITHM_VERSION).toMatch(/^curation-/);
    expect(THRESHOLDS.PUBLIC_MIN).toBe(80);
    expect(THRESHOLDS.WATCH_MIN).toBe(70);
  });
});
