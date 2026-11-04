/**
 * 安全工具单测（任务书 §17 / §18 边界用例）。
 * 覆盖：仓库 URL 严格校验、HMAC 验签（有效/篡改/过期/缺头）、CORS 白名单、任务 ID 格式。
 */
import { describe, expect, it } from "vitest";
import {
  allowedOrigins,
  corsHeadersFor,
  newTaskId,
  sha256Hex,
  validateRepoUrl,
  verifyHmacSignature,
} from "../src/security";
import { ApiError } from "../src/types";

describe("validateRepoUrl — 合法地址", () => {
  it("标准两段地址", () => {
    expect(validateRepoUrl("https://github.com/manningyangs/AI-Shovel-Collection")).toEqual({
      owner: "manningyangs",
      repo: "AI-Shovel-Collection",
    });
  });

  it("结尾斜杠 / 前后空白允许", () => {
    expect(validateRepoUrl("https://github.com/foo/bar/")).toEqual({ owner: "foo", repo: "bar" });
    expect(validateRepoUrl("  https://github.com/foo/bar  ")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });

  it("允许 . 后缀之外的常规字符（数字下划线点连字符）", () => {
    expect(validateRepoUrl("https://github.com/org_1/my.repo-x_2")).toEqual({
      owner: "org_1",
      repo: "my.repo-x_2",
    });
  });
});

describe("validateRepoUrl — 拒绝（§17.4 / §18）", () => {
  const bad: [string, unknown][] = [
    ["http 非 https", "http://github.com/foo/bar"],
    ["非 github 主机", "https://gitlab.com/foo/bar"],
    ["子域伪装", "https://evil.github.com/foo/bar"],
    ["带 query", "https://github.com/foo/bar?x=1"],
    ["带 fragment", "https://github.com/foo/bar#readme"],
    ["凭据混淆", "https://user:pass@github.com/foo/bar"],
    ["三段路径 blob", "https://github.com/foo/bar/blob/main/README.md"],
    ["三段路径 pull", "https://github.com/foo/bar/pull/1"],
    ["三段路径 issues", "https://github.com/foo/bar/issues/3"],
    [".git 后缀", "https://github.com/foo/bar.git"],
    ["PR 保留后缀", "https://github.com/foo/bar.pr"],
    ["issues 保留后缀", "https://github.com/foo/bar.issues"],
    ["gist 保留名", "https://github.com/gist/bar"],
    ["settings 保留名", "https://github.com/settings/bar"],
    ["单段", "https://github.com/foo"],
    ["非字符串", 123 as unknown],
    ["空串", ""],
    ["非 URL", "foo/bar"],
    ["超长", `https://github.com/foo/${"a".repeat(400)}`],
    ["前导点仓库名", "https://github.com/foo/.hidden"],
  ];
  it.each(bad)("拒绝：%s", (_label, input) => {
    expect(validateRepoUrl(input)).toBeNull();
  });
});

/* ------------------------------ HMAC 验签 ------------------------------ */

async function sign(secret: string, ts: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}.${body}`),
  );
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SECRET = "unit-test-secret";
const BODY = JSON.stringify({ request_id: "EV-abc123", status: "running", seq: 20 });

describe("verifyHmacSignature", () => {
  it("有效签名通过", async () => {
    const now = 1_800_000_000;
    const sig = await sign(SECRET, now, BODY);
    await expect(
      verifyHmacSignature(SECRET, BODY, String(now), sig, now),
    ).resolves.toBeUndefined();
  });

  it("篡改消息体 → 401", async () => {
    const now = 1_800_000_000;
    const sig = await sign(SECRET, now, BODY);
    await expect(
      verifyHmacSignature(SECRET, BODY + "x", String(now), sig, now),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_SIGNATURE" });
  });

  it("错误密钥 → 401", async () => {
    const now = 1_800_000_000;
    const sig = await sign("other-secret", now, BODY);
    await expect(
      verifyHmacSignature(SECRET, BODY, String(now), sig, now),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_SIGNATURE" });
  });

  it("时间戳过期（>5 分钟）→ 401 STALE_TIMESTAMP", async () => {
    const now = 1_800_000_000;
    const sig = await sign(SECRET, now - 301, BODY);
    await expect(
      verifyHmacSignature(SECRET, BODY, String(now - 301), sig, now),
    ).rejects.toMatchObject({ status: 401, code: "STALE_TIMESTAMP" });
  });

  it("未来时间戳 → 401", async () => {
    const now = 1_800_000_000;
    const sig = await sign(SECRET, now + 301, BODY);
    await expect(
      verifyHmacSignature(SECRET, BODY, String(now + 301), sig, now),
    ).rejects.toMatchObject({ status: 401, code: "STALE_TIMESTAMP" });
  });

  it("缺签名头 → 401 MISSING_SIGNATURE", async () => {
    await expect(
      verifyHmacSignature(SECRET, BODY, undefined, undefined),
    ).rejects.toMatchObject({ status: 401, code: "MISSING_SIGNATURE" });
    await expect(
      verifyHmacSignature(SECRET, BODY, "123", undefined),
    ).rejects.toMatchObject({ status: 401, code: "MISSING_SIGNATURE" });
  });

  it("签名头非 hex/垃圾值 → 401", async () => {
    const now = 1_800_000_000;
    await expect(
      verifyHmacSignature(SECRET, BODY, String(now), "not-a-signature", now),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

/* -------------------------------- CORS -------------------------------- */

describe("CORS 白名单（§17.7 禁 '*'）", () => {
  const allow = allowedOrigins(
    "https://manningyangs.github.io, http://localhost:4321",
  );

  it("解析并规整白名单（去尾斜杠）", () => {
    expect(allow).toEqual(["https://manningyangs.github.io", "http://localhost:4321"]);
  });

  it("白名单 Origin 回显 + Vary", () => {
    const h = corsHeadersFor("https://manningyangs.github.io", allow);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://manningyangs.github.io");
    expect(h["Vary"]).toBe("Origin");
    expect(JSON.stringify(h)).not.toContain('"*"');
  });

  it("非白名单 Origin 不回显 Allow-Origin", () => {
    const h = corsHeadersFor("https://evil.example.com", allow);
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(h["Vary"]).toBe("Origin");
  });

  it("无 Origin（curl）→ 无 Allow-Origin", () => {
    const h = corsHeadersFor(undefined, allow);
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

/* ------------------------------ 杂项工具 ------------------------------ */

describe("工具函数", () => {
  it("sha256Hex 标准向量", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("newTaskId 格式为 EV- + base36", () => {
    const id = newTaskId();
    expect(id).toMatch(/^EV-[a-z0-9]{8}$/);
    expect(newTaskId()).not.toBe(id); // 随机不重复（抽样）
  });
});
