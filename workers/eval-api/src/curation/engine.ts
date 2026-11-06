/**
 * 精选推荐引擎（任务书 §五）——纯函数层，不碰网络、不碰 D1，全部可单测。
 *
 * 职责：
 *  - 标准化 GitHub 仓库标识（§5.2）
 *  - 跨来源合并去重（两池只读关联，绝不合并原始数据 §4.3）
 *  - 硬性资格检查（§5.3）
 *  - 100 分制推荐评分 + 可追溯证据（§5.4/§5.5）
 *  - 推荐理由生成（基于真实评分依据）
 *  - 推荐状态机（§六/§八）
 */
import {
  AI_KEYWORDS,
  ALGORITHM_VERSION,
  ALLOWED_LICENSES,
  DIMENSION_LABELS,
  SCORE_WEIGHTS,
  THRESHOLDS,
  type CurationStatus,
  type DimensionKey,
} from "./config";

/* ------------------------------ 池记录类型 ------------------------------ */

/** 自动发现池记录（live_multi.json candidates[]，容量 150，只读） */
export interface PoolAutoRecord {
  id?: string;
  repo_slug?: string;
  repo_url?: string;
  title?: string;
  desc?: string;
  description?: string;
  pushed_at?: string;
  status?: string;
  extra?: {
    confidence?: number;
    suggested_category?: string;
    endpoint_status?: string;
    category_hits?: string[];
    [k: string]: unknown;
  };
}

/** 社区提交池记录（submissions/candidates.json candidates[]，容量 500，只读） */
export interface PoolCommunityRecord {
  submission_id?: string;
  repo_slug?: string;
  repo_url?: string;
  title?: string;
  description?: string;
  language?: string | null;
  license_spdx?: string | null;
  stars?: number | null;
  forks?: number | null;
  topics?: string[];
  archived?: boolean;
  fork?: boolean;
  homepage?: string | null;
  pushed_at?: string;
  created_at?: string;
  review_status?: string;
}

/** 跨来源合并后的候选（一条主记录，多来源关联 §5.2） */
export interface MergedCandidate {
  slug: string;
  url: string;
  title: string;
  description: string;
  auto: PoolAutoRecord | null;
  community: PoolCommunityRecord | null;
  /** 来源类型列表（可同时两个） */
  sources: Array<"auto_discovery" | "community_submission">;
}

/* --------------------------- 标准化仓库标识（§5.2） --------------------------- */

/**
 * 标准化 GitHub 仓库标识：
 *  支持完整 URL / owner/repo 两种输入；统一小写 owner/repo、去 .git、去尾斜杠。
 *  非 github.com 或格式非法 → null。
 */
export function normalizeRepoSlug(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  const urlMatch = s.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i,
  );
  if (urlMatch) {
    const owner = urlMatch[1].toLowerCase();
    const repo = urlMatch[2].replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
    if (!owner || !repo) return null;
    return `${owner}/${repo}`;
  }

  // 裸 owner/repo
  const bare = s.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  if (bare) {
    const repo = bare[2].replace(/\.git$/i, "").replace(/\/+$/, "");
    if (!repo) return null;
    return `${bare[1].toLowerCase()}/${repo.toLowerCase()}`;
  }
  return null;
}

/** slug → 规范仓库 URL */
export function slugToUrl(slug: string): string {
  return `https://github.com/${slug}`;
}

/* ------------------------------ 跨来源合并 ------------------------------ */

/**
 * 合并两个候选池的记录（只读入参）：
 *  同一 slug 同时存在于两池 → 仅一条主记录，sources 同时保留两个来源（§5.2）。
 */
export function mergePools(
  autoRecords: PoolAutoRecord[],
  communityRecords: PoolCommunityRecord[],
): MergedCandidate[] {
  const map = new Map<string, MergedCandidate>();

  for (const a of autoRecords) {
    const slug = normalizeRepoSlug(a.repo_slug || a.repo_url);
    if (!slug) continue; // 非法标识跳过（不进入推荐层）
    const existing = map.get(slug);
    if (existing) {
      existing.auto = a;
      if (!existing.sources.includes("auto_discovery")) existing.sources.push("auto_discovery");
      continue;
    }
    map.set(slug, {
      slug,
      url: slugToUrl(slug),
      title: a.title || slug,
      description: (a.desc || a.description || "").trim(),
      auto: a,
      community: null,
      sources: ["auto_discovery"],
    });
  }

  for (const c of communityRecords) {
    const slug = normalizeRepoSlug(c.repo_slug || c.repo_url);
    if (!slug) continue;
    const url = slugToUrl(slug);
    const existing = map.get(slug);
    if (existing) {
      existing.community = c;
      if (!existing.sources.includes("community_submission")) {
        existing.sources.push("community_submission");
      }
      // 社区池字段更完整时补足展示信息
      if (!existing.description && c.description) existing.description = c.description.trim();
      if (c.title) existing.title = c.title;
      existing.url = url;
      continue;
    }
    map.set(slug, {
      slug,
      url,
      title: c.title || slug,
      description: (c.description || "").trim(),
      auto: null,
      community: c,
      sources: ["community_submission"],
    });
  }

  return [...map.values()];
}

/* ------------------------------ 评分事实输入 ------------------------------ */

/** 评分所需的仓库事实（池数据 + 可选 GitHub API 补充） */
export interface RepoFacts {
  slug: string;
  url: string;
  name: string;
  description: string;
  topics: string[];
  language: string | null;
  licenseSpdx: string | null;
  stars: number | null;
  forks: number | null;
  pushedAt: string | null;
  createdAt: string | null;
  archived: boolean;
  forkFlag: boolean;
  homepage: string | null;
  sizeKb: number | null;
  /** 仓库存在性：unknown=未查 API；false=确认 404 */
  exists: "unknown" | true | false;
  /** 是否已在正式精选库 catalog.csv */
  inCatalog: boolean;
  fromAuto: boolean;
  fromCommunity: boolean;
  /** 自动发现池置信度（extra.confidence，0-10） */
  poolConfidence: number | null;
  /** 自动发现池端点实测（extra.endpoint_status === 'ok'） */
  endpointVerified: boolean;
  suggestedCategory: string | null;
}

/** 从合并候选 + 可选 API 数据构造事实 */
export function buildFacts(
  merged: MergedCandidate,
  api: {
    exists: boolean;
    description?: string | null;
    topics?: string[];
    language?: string | null;
    licenseSpdx?: string | null;
    stars?: number;
    forks?: number;
    pushedAt?: string | null;
    createdAt?: string | null;
    archived?: boolean;
    fork?: boolean;
    homepage?: string | null;
    sizeKb?: number;
  } | null,
  inCatalog: boolean,
): RepoFacts {
  const a = merged.auto;
  const c = merged.community;
  const fromAuto = !!a;
  const fromCommunity = !!c;

  // 字段优先级：GitHub API > 社区池（提交时已校验） > 自动发现池
  const desc =
    (api?.description ?? null) ?? c?.description ?? a?.desc ?? a?.description ?? "";

  let stars: number | null = c?.stars ?? null;
  if (api && typeof api.stars === "number") stars = api.stars;

  let licenseSpdx: string | null = c?.license_spdx ?? null;
  if (api && api.licenseSpdx !== undefined && api.licenseSpdx !== null) {
    licenseSpdx = api.licenseSpdx;
  }

  const topics =
    (api?.topics && api.topics.length > 0 ? api.topics : null) ?? c?.topics ?? [];

  let pushedAt = c?.pushed_at ?? a?.pushed_at ?? null;
  if (api?.pushedAt) pushedAt = api.pushedAt;

  const endpointVerified = a?.extra?.endpoint_status === "ok";
  const poolConfidence =
    typeof a?.extra?.confidence === "number" ? a.extra.confidence : null;

  return {
    slug: merged.slug,
    url: merged.url,
    name: merged.title,
    description: desc.trim(),
    topics: topics.map((t) => String(t).toLowerCase()),
    language: (api?.language ?? c?.language ?? null) as string | null,
    licenseSpdx: licenseSpdx,
    stars,
    forks: api?.forks ?? c?.forks ?? null,
    pushedAt,
    createdAt: api?.createdAt ?? c?.created_at ?? null,
    archived: api?.archived ?? c?.archived ?? false,
    forkFlag: api?.fork ?? c?.fork ?? false,
    homepage: api?.homepage ?? c?.homepage ?? null,
    sizeKb: api?.sizeKb ?? null,
    exists: api ? (api.exists ? true : false) : "unknown",
    inCatalog,
    fromAuto,
    fromCommunity,
    poolConfidence,
    endpointVerified,
    suggestedCategory: a?.extra?.suggested_category ?? null,
  };
}

/* ------------------------------ 硬性资格检查（§5.3） ------------------------------ */

export interface HardCheckItem {
  key: string;
  label: string;
  result: "pass" | "warn" | "fail";
  detail: string;
}

export interface HardCheckResult {
  passed: boolean;
  checks: HardCheckItem[];
  /** passed=false 时的拦截原因（→ blocked 状态） */
  blockReason: string | null;
}

function hasAiSignal(f: RepoFacts): { hit: boolean; matched: string[] } {
  const matched: string[] = [];
  const hay = [
    ...f.topics,
    f.description.toLowerCase(),
    f.name.toLowerCase(),
    f.suggestedCategory?.toLowerCase() || "",
  ].join(" ");

  for (const kw of AI_KEYWORDS) {
    const needle = kw.toLowerCase();
    // 词边界匹配短关键词（避免 'ai' 命中 'air' / 'mail'）
    const re =
      needle.length <= 3
        ? new RegExp(`(^|[^a-z0-9])${needle.replace(".", "\\.")}([^a-z0-9]|$)`)
        : null;
    if (re ? re.test(hay) : hay.includes(needle)) {
      matched.push(kw);
    }
    if (matched.length >= 5) break;
  }
  // 自动发现池本身来自 AI 工具发现管线 → 视为一个信号
  if (f.fromAuto && f.poolConfidence !== null && f.poolConfidence >= 6) {
    matched.push("auto_discovery_pipeline");
  }
  if (f.endpointVerified) matched.push("verified_mcp_endpoint");
  return { hit: matched.length > 0, matched };
}

/**
 * 硬性资格检查（§5.3）。任一 fail → 不能进入公开精选推荐（状态 blocked）。
 * 许可证缺失只记 warn「待核实」，不得描述为恶意或违法（§5.3）。
 */
export function runHardCheck(f: RepoFacts): HardCheckResult {
  const checks: HardCheckItem[] = [];

  // 1. 仓库存在
  checks.push(
    f.exists === false
      ? { key: "exists", label: "仓库存在", result: "fail", detail: "GitHub 返回 404，仓库不可访问或已删除" }
      : f.exists === "unknown"
        ? { key: "exists", label: "仓库存在", result: "warn", detail: "未经 GitHub API 实时核验（以池内记录为准，待复检）" }
        : { key: "exists", label: "仓库存在", result: "pass", detail: "GitHub API 确认可访问" },
  );

  // 2. 重复检查：已在正式精选库（§5.3 重复检查 / §12.1.5）
  checks.push(
    f.inCatalog
      ? { key: "duplicate", label: "重复检查", result: "fail", detail: "已存在于正式精选库 catalog.csv" }
      : { key: "duplicate", label: "重复检查", result: "pass", detail: "未在精选库中发现相同仓库" },
  );

  // 3. AI 相关性
  const ai = hasAiSignal(f);
  checks.push(
    ai.hit
      ? { key: "ai_relevance", label: "AI 相关性", result: "pass", detail: `命中 AI 信号：${ai.matched.slice(0, 5).join(", ")}` }
      : { key: "ai_relevance", label: "AI 相关性", result: "fail", detail: "描述、Topics、分类信息中均未发现 AI 相关信号" },
  );

  // 4. 项目真实性：空仓库 / 占位项目
  const emptyRepo =
    f.sizeKb === 0 ||
    (f.sizeKb === null && f.stars === 0 && !f.description && f.topics.length === 0);
  checks.push(
    emptyRepo
      ? { key: "authenticity", label: "项目真实性", result: "fail", detail: "疑似空仓库或占位项目（无内容证据）" }
      : f.sizeKb !== null && f.sizeKb < 10
        ? { key: "authenticity", label: "项目真实性", result: "warn", detail: `仓库体积仅 ${f.sizeKb}KB，内容较少` }
        : { key: "authenticity", label: "项目真实性", result: "pass", detail: "非空仓库" },
  );

  // 5. 用途明确
  checks.push(
    !f.description && f.topics.length === 0
      ? { key: "purpose", label: "用途明确", result: "fail", detail: "描述与 Topics 均为空，无法识别工具用途" }
      : !f.description
        ? { key: "purpose", label: "用途明确", result: "warn", detail: "缺少描述，仅能依据 Topics 推断用途" }
        : { key: "purpose", label: "用途明确", result: "pass", detail: "存在仓库描述" },
  );

  // 6. 项目可用性
  const usable =
    (f.sizeKb !== null && f.sizeKb > 0) ||
    f.endpointVerified ||
    (f.stars !== null && f.stars > 0) ||
    (!!f.description && f.sizeKb === null);
  checks.push(
    usable
      ? { key: "usability", label: "项目可用性", result: "pass", detail: f.endpointVerified ? "存在已实测可用的 MCP 端点" : "存在代码/内容或使用迹象" }
      : { key: "usability", label: "项目可用性", result: "fail", detail: "无任何可用性证据" },
  );

  // 7. 许可证（缺失→待核实 warn，不判恶意 §5.3）
  checks.push(
    f.licenseSpdx
      ? ALLOWED_LICENSES.includes(f.licenseSpdx)
        ? { key: "license", label: "许可证", result: "pass", detail: `开源许可证 ${f.licenseSpdx}（在收录认可列表）` }
        : { key: "license", label: "许可证", result: "warn", detail: `许可证 ${f.licenseSpdx} 不在常用开源列表，收录前需人工核实` }
      : { key: "license", label: "许可证", result: "warn", detail: "许可证待核实（GitHub 未返回 SPDX 标识）" },
  );

  // 8. 数据完整性
  const complete = !!(f.slug && f.url && f.name);
  checks.push(
    complete
      ? { key: "completeness", label: "数据完整性", result: "pass", detail: "仓库标识、地址、名称齐全" }
      : { key: "completeness", label: "数据完整性", result: "fail", detail: "必要字段缺失" },
  );

  const failed = checks.filter((c) => c.result === "fail");
  return {
    passed: failed.length === 0,
    checks,
    blockReason: failed.length > 0 ? failed.map((c) => `${c.label}：${c.detail}`).join("；") : null,
  };
}

/* ------------------------------ 评分（§5.4/§5.5） ------------------------------ */

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  weight: number;
  score: number; // 0..weight
  evidence: string[]; // 可追溯依据（§5.5）
  confidence: "ok" | "partial" | "insufficient";
}

export interface ScoreResult {
  total: number;
  dimensions: DimensionScore[];
  reason: string;
  dataConfidence: "ok" | "partial" | "insufficient";
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** 线性映射：x 在 [a,b] → [0,1]（越界截断） */
function lin(x: number, a: number, b: number): number {
  if (b === a) return 1;
  const v = (x - a) / (b - a);
  return Math.max(0, Math.min(1, v));
}

/**
 * 100 分制评分。每个维度必须给出 evidence（§5.5 禁止无依据评分）；
 * 数据缺失 → confidence=insufficient + 中性分（不得视为严重负面 §5.5）。
 */
export function scoreRepo(f: RepoFacts): ScoreResult {
  const dims: DimensionScore[] = [];

  /* --- ai_value 20：AI 价值与相关性 --- */
  {
    const ai = hasAiSignal(f);
    const kwHits = ai.matched.filter(
      (m) => m !== "auto_discovery_pipeline" && m !== "verified_mcp_endpoint",
    );
    const evidence: string[] = [];
    let base = 0;
    if (kwHits.length >= 3) { base = 18; evidence.push(`命中多个 AI 关键词（${kwHits.slice(0, 4).join(", ")}）`); }
    else if (kwHits.length >= 1) { base = 14; evidence.push(`命中 AI 关键词：${kwHits.slice(0, 3).join(", ")}`); }
    else if (f.fromAuto) { base = 12; evidence.push("来自 AI 工具自动发现管线"); }
    else { base = 10; evidence.push("与 AI 领域的关联证据有限"); }

    if (f.poolConfidence !== null) {
      const bump = Math.round(lin(f.poolConfidence, 0, 10) * 2); // 0-2
      base += bump;
      evidence.push(`自动发现管线置信度 ${f.poolConfidence}/10（+${bump}）`);
    }
    if (f.endpointVerified) {
      base += 2;
      evidence.push("MCP 端点实测可用（+2）");
    }
    const score = Math.min(SCORE_WEIGHTS.ai_value, base);
    dims.push({
      key: "ai_value", label: DIMENSION_LABELS.ai_value, weight: SCORE_WEIGHTS.ai_value,
      score, evidence,
      confidence: kwHits.length >= 1 || f.fromAuto ? "ok" : "partial",
    });
  }

  /* --- completeness 20：功能完整度（README/文档/字段证据） --- */
  {
    const evidence: string[] = [];
    let s = 0;
    if (f.description) { s += 6; evidence.push("仓库描述完整（+6）"); }
    if (f.topics.length >= 3) { s += 4; evidence.push(`Topics ${f.topics.length} 个（+4）`); }
    else if (f.topics.length >= 1) { s += 2; evidence.push(`Topics ${f.topics.length} 个（+2）`); }
    if (f.sizeKb !== null) {
      if (f.sizeKb >= 50) { s += 5; evidence.push(`仓库内容 ${f.sizeKb}KB（+5）`); }
      else if (f.sizeKb > 0) { s += 3; evidence.push(`仓库内容 ${f.sizeKb}KB（+3）`); }
    } else {
      evidence.push("仓库体积未获取（以池内记录为准）");
    }
    if (f.homepage) { s += 2; evidence.push("提供项目主页（+2）"); }
    if (f.language) { s += 2; evidence.push(`主要语言 ${f.language}（+2）`); }
    if (f.endpointVerified) { s += 1; evidence.push("附带可用端点信息（+1）"); }

    const conf: DimensionScore["confidence"] =
      f.description && (f.sizeKb !== null || f.topics.length >= 1) ? "ok" : "partial";
    if (!f.description && f.topics.length === 0) {
      evidence.length = 0;
      evidence.push("文档与描述证据不足");
      dims.push({
        key: "completeness", label: DIMENSION_LABELS.completeness, weight: SCORE_WEIGHTS.completeness,
        score: 4, evidence, confidence: "insufficient",
      });
    } else {
      dims.push({
        key: "completeness", label: DIMENSION_LABELS.completeness, weight: SCORE_WEIGHTS.completeness,
        score: Math.min(SCORE_WEIGHTS.completeness, s), evidence, confidence: conf,
      });
    }
  }

  /* --- practical 15：实用价值 --- */
  {
    const evidence: string[] = [];
    let s = 0;
    if (f.endpointVerified) { s += 6; evidence.push("端点已实测可用，可直接接入（+6）"); }
    const dlen = f.description.length;
    if (dlen >= 80) { s += 5; evidence.push(`描述详尽（${dlen} 字符，+5）`); }
    else if (dlen >= 40) { s += 3; evidence.push(`描述清晰（${dlen} 字符，+3）`); }
    else if (dlen > 0) { s += 1; evidence.push("描述较简短（+1）"); }
    if (f.suggestedCategory) { s += 2; evidence.push(`已识别适用场景：${f.suggestedCategory}（+2）`); }
    else if (f.topics.length >= 2) { s += 2; evidence.push(`Topics 指向明确应用场景（+2）`); }
    if (f.homepage) { s += 2; evidence.push("有官网/文档主页（+2）"); }

    const conf: DimensionScore["confidence"] =
      dlen >= 40 || f.endpointVerified ? "ok" : dlen > 0 ? "partial" : "insufficient";
    if (dlen === 0 && !f.endpointVerified) {
      evidence.length = 0;
      evidence.push("用途描述证据不足，无法判断实际价值");
    }
    dims.push({
      key: "practical", label: DIMENSION_LABELS.practical, weight: SCORE_WEIGHTS.practical,
      score: Math.max(0, Math.min(SCORE_WEIGHTS.practical, s)), evidence, confidence: conf,
    });
  }

  /* --- activity 15：项目活跃度（最近提交时间） --- */
  {
    const days = daysSince(f.pushedAt);
    const evidence: string[] = [];
    if (days === null) {
      evidence.push("最近提交时间缺失（不作负面判定，待补充）");
      dims.push({
        key: "activity", label: DIMENSION_LABELS.activity, weight: SCORE_WEIGHTS.activity,
        score: Math.round(SCORE_WEIGHTS.activity * 0.4), evidence, confidence: "insufficient",
      });
    } else {
      let s: number;
      if (days <= 30) s = 15;
      else if (days <= 90) s = 12;
      else if (days <= 180) s = 9;
      else if (days <= 365) s = 5;
      else if (days <= 730) s = 2;
      else s = 0;
      evidence.push(`最近提交于 ${f.pushedAt}（${days} 天前，${s}/15）`);
      if (f.archived) evidence.push("仓库已归档（活跃度视为终止）");
      dims.push({
        key: "activity", label: DIMENSION_LABELS.activity, weight: SCORE_WEIGHTS.activity,
        score: f.archived ? 0 : s, evidence, confidence: "ok",
      });
    }
  }

  /* --- maturity 10：技术成熟度（架构/文档/部署质量的静态证据） --- */
  {
    const evidence: string[] = [];
    let s = 0;
    if (!f.archived) { s += 3; evidence.push("仓库未归档（+3）"); }
    else { evidence.push("仓库已归档（0）"); }
    if (f.licenseSpdx) { s += 2; evidence.push(`许可证明确 ${f.licenseSpdx}（+2）`); }
    if (f.description.length >= 40) { s += 3; evidence.push("README 摘要式描述完整（+3）"); }
    else if (f.description) { s += 1; evidence.push("有基本描述（+1）"); }
    const ageDays = daysSince(f.createdAt);
    if (ageDays !== null && ageDays >= 180) { s += 2; evidence.push(`项目已存续 ${ageDays} 天（+2）`); }
    else if (ageDays !== null) { evidence.push(`项目较新（${ageDays} 天）`); }
    if (f.forkFlag) { s = Math.max(0, s - 2); evidence.push("为 Fork 项目（-2）"); }

    dims.push({
      key: "maturity", label: DIMENSION_LABELS.maturity, weight: SCORE_WEIGHTS.maturity,
      score: Math.min(SCORE_WEIGHTS.maturity, s), evidence,
      confidence: f.createdAt || f.description ? "ok" : "partial",
    });
  }

  /* --- community 10：社区认可度（Stars/Fork，对数刻度） --- */
  {
    const evidence: string[] = [];
    if (f.stars === null) {
      evidence.push("Stars 数据未获取（不作负面判定，待补充）");
      dims.push({
        key: "community", label: DIMENSION_LABELS.community, weight: SCORE_WEIGHTS.community,
        score: 4, evidence, confidence: "insufficient",
      });
    } else {
      // 对数刻度：0★=0 分，10★≈3.5，100★≈5.9，1k★≈7.9，10k★=10
      const starScore = Math.min(8, (Math.log10(f.stars + 1) / 4) * 8);
      const forkScore = Math.min(2, Math.log10((f.forks ?? 0) + 1));
      const s = Math.round(starScore + forkScore);
      evidence.push(`${f.stars} Stars / ${f.forks ?? 0} Forks（${s}/10）`);
      dims.push({
        key: "community", label: DIMENSION_LABELS.community, weight: SCORE_WEIGHTS.community,
        score: Math.max(0, Math.min(SCORE_WEIGHTS.community, s)), evidence, confidence: "ok",
      });
    }
  }

  /* --- license 10：许可证与可持续性 --- */
  {
    const evidence: string[] = [];
    if (f.licenseSpdx && ALLOWED_LICENSES.includes(f.licenseSpdx)) {
      evidence.push(`开源许可证 ${f.licenseSpdx} 在认可列表（+10）`);
      dims.push({
        key: "license", label: DIMENSION_LABELS.license, weight: SCORE_WEIGHTS.license,
        score: 10, evidence, confidence: "ok",
      });
    } else if (f.licenseSpdx) {
      evidence.push(`许可证 ${f.licenseSpdx} 需人工核实是否符合收录要求（+5）`);
      dims.push({
        key: "license", label: DIMENSION_LABELS.license, weight: SCORE_WEIGHTS.license,
        score: 5, evidence, confidence: "partial",
      });
    } else {
      evidence.push("许可证待核实（缺失不等于违规，收录前需确认；中性分 4/10）");
      dims.push({
        key: "license", label: DIMENSION_LABELS.license, weight: SCORE_WEIGHTS.license,
        score: 4, evidence, confidence: "insufficient",
      });
    }
  }

  const total = dims.reduce((acc, d) => acc + d.score, 0);
  const insufficientCount = dims.filter((d) => d.confidence === "insufficient").length;
  const dataConfidence: ScoreResult["dataConfidence"] =
    insufficientCount >= 2 ? "insufficient" : insufficientCount === 1 ? "partial" : "ok";

  return { total, dimensions: dims, reason: buildReason(f, dims, total), dataConfidence };
}

/** 推荐理由：基于真实评分依据生成（§5.5 禁止编造；§7.3 推荐理由必须基于评分依据） */
function buildReason(f: RepoFacts, dims: DimensionScore[], total: number): string {
  const top = [...dims]
    .sort((a, b) => b.score / b.weight - a.score / a.weight)
    .slice(0, 2);

  const parts: string[] = [];
  for (const d of top) {
    const firstEvidence = d.evidence.find((e) => !e.includes("不足") && !e.includes("缺失"));
    parts.push(`${d.label}表现突出${firstEvidence ? `（${firstEvidence.replace(/（\+\d+.*$/, "").replace(/，\d+\/\d+）$/, "")}）` : ""}`);
  }

  const srcBits: string[] = [];
  if (f.fromAuto) srcBits.push("自动发现");
  if (f.fromCommunity) srcBits.push("社区提交");

  const meta: string[] = [];
  if (f.stars !== null) meta.push(`${f.stars} Stars`);
  if (f.pushedAt) meta.push(`最近更新 ${String(f.pushedAt).slice(0, 10)}`);

  const conf =
    total >= THRESHOLDS.PUBLIC_MIN
      ? "综合评分达到公开推荐门槛"
      : total >= THRESHOLDS.WATCH_MIN
        ? "综合评分进入观察区间"
        : "综合评分暂未达标";

  return [
    `${conf}（${total} 分）。${parts.join("；")}。`,
    `来源：${srcBits.join(" + ") || "未知"}${meta.length ? `；${meta.join("，")}` : ""}。`,
  ].join("");
}

/* ------------------------------ 状态机（§六/§八） ------------------------------ */

export interface StatusDecision {
  status: CurationStatus;
  reason: string;
  changed: boolean;
}

/**
 * 由硬性检查 + 评分决定下一次状态（仅算法侧；人工状态 review/approve 由阶段三写入）。
 * 规则（§六/§八）：
 *  - promoted / rejected 为终态，评估不覆盖（§八.6 已收录不受淘汰影响）
 *  - 硬性失败 → blocked（历史保留）
 *  - ≥80 且证据充分 → 公开（维持已有人工推进态；新记录 recommended）
 *  - ≥80 但证据不足 → watching（§5.5 证据不足进入观察）
 *  - 70-79 → watching（§八.4 跌破 80 撤销公开）
 *  - <70 → not_recommended
 */
export function nextStatus(
  current: CurationStatus,
  hard: HardCheckResult,
  score: ScoreResult,
): StatusDecision {
  const mk = (status: CurationStatus, reason: string): StatusDecision => ({
    status,
    reason,
    changed: status !== current,
  });

  if (current === "promoted") {
    return mk("promoted", "已正式收录，不参与推荐淘汰（§八.6）");
  }
  if (current === "rejected") {
    return mk("rejected", "人工审核已拒绝，保留历史");
  }
  if (!hard.passed) {
    return mk("blocked", hard.blockReason || "硬性资格检查未通过");
  }

  if (score.total >= THRESHOLDS.PUBLIC_MIN) {
    if (score.dataConfidence === "insufficient") {
      return mk("watching", `综合 ${score.total} 分但证据不足（≥2 维度数据缺失），进入观察待补充`);
    }
    // 人工推进中的状态（reviewing / approved）与已推荐态保持，分数达标不回退
    if (current === "reviewing" || current === "approved" || current === "recommended") {
      return mk(current, `综合 ${score.total} 分，保持公开状态 ${current}`);
    }
    // pending_review（待评估）/ watching / not_recommended / blocked → 算法首次或恢复推荐
    return mk("recommended", `综合 ${score.total} 分达到公开推荐门槛且硬性检查通过`);
  }

  if (score.total >= THRESHOLDS.WATCH_MIN) {
    // 70-79 观察区间（§八.4：跌破 80 撤销公开，移入观察状态）
    return mk("watching", `综合 ${score.total} 分低于公开门槛 80，移入观察状态（§八.4）`);
  }

  return mk("not_recommended", `综合 ${score.total} 分低于观察门槛 70，不推荐`);
}
