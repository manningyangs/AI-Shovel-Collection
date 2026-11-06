/**
 * 安全工具：GitHub 仓库 URL 严格校验、HMAC-SHA256 验签、随机数/哈希。
 *
 * 约束（任务书 §17.4 / §18）：
 *  - URL 仅接受 https://github.com/owner/repo 精确两段路径；
 *    拒绝 gist / PR / issue / blob / tree / commit / .actions 路径、带凭据、query、fragment。
 *  - HMAC 签名基于原始请求体字节，5 分钟时间窗。
 */
import { ApiError } from "./types";

export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_REPO_RE = /^[A-Za-z0-9_.-]+$/;
// 显式拒绝任务书 §17.4 列出的危险/无意义后缀与保留名
const RESERVED_REPO_RE = /\.(actions|pr|pull|issues|blob|tree|commit|gist)$/i;
const RESERVED_NAMES = new Set(["gist", "settings", "notifications", "marketplace", "orgs", "users"]);

/**
 * 严格解析仓库地址。返回 null 表示拒绝（调用方转 400）。
 */
export function validateRepoUrl(input: unknown): RepoRef | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  // 拒绝 userinfo（https://user:pass@github.com/... 防凭据混淆）
  if (u.username || u.password) return null;
  // 拒绝 query / fragment（任务书 §18 明确列举 https://github.com/o/r?x=1 非法）
  if (u.search || u.hash) return null;
  if (u.hostname.toLowerCase() !== "github.com") return null;

  const segs = u.pathname.split("/").filter((s) => s.length > 0);
  if (segs.length !== 2) return null; // 精确两段；/pull/1、/blob/... 均为 3+ 段

  const [owner, repo] = segs;
  if (!OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo)) return null;
  if (repo.toLowerCase().endsWith(".git")) return null;
  if (RESERVED_REPO_RE.test(repo)) return null;
  if (RESERVED_NAMES.has(owner.toLowerCase())) return null;
  if (owner.startsWith(".") || repo.startsWith(".")) return null;

  return { owner, repo };
}

export function toRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}

/* ------------------------------- 随机与哈希 ------------------------------- */

const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url 随机串（URL 安全，无 padding） */
export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += B64URL_ALPHABET[b & 63];
  return out;
}

/** 任务 ID：EV- + 12 位 base36（小写字母+数字，任务书 §11 前缀约定） */
export function newTaskId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += (b % 36).toString(36);
  return `EV-${s}`;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* --------------------------------- HMAC --------------------------------- */

const HMAC_WINDOW_SECONDS = 300; // 5 分钟

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 验证内部回调签名：HMAC(secret, timestamp + "." + rawBody)。
 * 校验顺序：签名 → 时间窗（±5 分钟）。
 * 失败抛 ApiError(401)。
 */
export async function verifyHmacSignature(
  secret: string,
  rawBody: string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  // Secret 未配置时 fail-closed：不允许以空密钥验签（空 HMAC 键可能被伪造）
  if (!secret) {
    throw new ApiError(503, "SERVICE_NOT_CONFIGURED", "服务尚未配置回调密钥");
  }
  if (!timestampHeader || !signatureHeader) {
    throw new ApiError(401, "MISSING_SIGNATURE", "缺少回调签名头");
  }
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > HMAC_WINDOW_SECONDS) {
    throw new ApiError(401, "STALE_TIMESTAMP", "签名时间戳超出 5 分钟窗口");
  }
  const expected = await hmacSha256Hex(secret, `${timestampHeader}.${rawBody}`);
  if (!timingSafeEqual(expected.toLowerCase(), signatureHeader.toLowerCase())) {
    throw new ApiError(401, "INVALID_SIGNATURE", "回调签名校验失败");
  }
}

/* --------------------------------- CORS --------------------------------- */

export function allowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * 只允许配置白名单内的站点源；拒绝 '*'（任务书 §17.5）。
 */
export function corsHeadersFor(origin: string | undefined, allowList: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowList.includes(origin.replace(/\/+$/, ""))) {
    headers["Access-Control-Allow-Origin"] = origin;
    // /curation 管理接口走 HttpOnly Cookie（跨站凭据请求），必须显式允许凭据
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
