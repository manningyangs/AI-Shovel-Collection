/**
 * GitHub App 凭证链（任务书 §十一）：
 *   App RS256 JWT（私钥签名）→ Installation Token（内存缓存）→ 固定 Workflow Dispatch。
 *
 * 约束：
 *  - 只使用固定 Installation ID / 仓库 / Workflow（不接受任何前端入参）。
 *  - Token 只存本模块内存缓存，不入 D1、不回浏览器、不打印（§17.6）。
 *  - 目标仓库与 Workflow 永远来自服务端配置（GITHUB_API_REPOSITORY / GITHUB_WORKFLOW_FILE）。
 */
import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "./types";
import { ApiError } from "./types";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const JWT_TTL_SECONDS = 540; // 9 分钟（GitHub 上限 10 分钟）
const TOKEN_REFRESH_MARGIN = 120; // 到期前 2 分钟刷新

interface CachedToken {
  token: string;
  expiresAt: number; // epoch 秒
}

// 模块级缓存（同一 isolate 内跨请求复用；Worker isolate 生命周期短，不会长期驻留）
let jwtCache: { token: string; expiresAt: number } | null = null;
let installationTokenCache: CachedToken | null = null;

/** 私钥来自 Secret；兼容单行粘贴（字面 \n）与多行两种形态 */
function normalizePem(raw: string): string {
  const key = raw.trim().replace(/\\n/g, "\n");
  if (!key.includes("-----BEGIN")) {
    throw new ApiError(500, "PRIVATE_KEY_INVALID", "App 私钥格式错误");
  }
  return key;
}

function pemToDer(pem: string, label: string): Uint8Array {
  const re = new RegExp(`-----BEGIN ${label}-----[\\s\\S]+?-----END ${label}-----`);
  const m = re.exec(pem);
  if (!m) throw new ApiError(500, "PRIVATE_KEY_INVALID", `缺少 ${label} PEM 段`);
  const b64 = m[0].replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function derToPem(der: Uint8Array, label: string): string {
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`;
}

/** DER 长度编码（DER 要求最短形式） */
function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x100) return [0x81, n];
  return [0x82, (n >> 8) & 0xff, n & 0xff];
}

/**
 * GitHub App 下发的 .pem 是 PKCS#1（BEGIN RSA PRIVATE KEY），
 * 而 jose 只接受 PKCS#8 —— 与 @octokit/auth-app 相同的转换处理。
 */
export function pkcs1ToPkcs8(pem: string): string {
  const inner = pemToDer(pem, "RSA PRIVATE KEY");
  const algId = [
    0x30, 0x0d, // SEQUENCE, len 13
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption OID
    0x05, 0x00, // NULL
  ];
  const version = [0x02, 0x01, 0x00]; // INTEGER 0
  const octet = [0x04, ...derLen(inner.length), ...inner];
  const body = [...version, ...algId, ...octet];
  const der = new Uint8Array([0x30, ...derLen(body.length), ...body]);
  return derToPem(der, "PRIVATE KEY");
}

/** 兼容 PKCS#1 / PKCS#8 两种 App 私钥格式 */
async function importAppPrivateKey(pem: string) {
  const key = /BEGIN RSA PRIVATE KEY/.test(pem) ? pkcs1ToPkcs8(pem) : pem;
  return importPKCS8(key, "RS256");
}

/** 生成 GitHub App JWT（RS256，9 分钟有效） */
export async function appJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && jwtCache.expiresAt - now > 60) return jwtCache.token;

  const key = await importAppPrivateKey(normalizePem(env.GITHUB_APP_PRIVATE_KEY));
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.GITHUB_APP_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(key);

  jwtCache = { token, expiresAt: now + JWT_TTL_SECONDS };
  return token;
}

/** 获取 Installation Token（内存缓存，按过期时间刷新） */
export async function installationToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (installationTokenCache && installationTokenCache.expiresAt - now > TOKEN_REFRESH_MARGIN) {
    return installationTokenCache.token;
  }

  const jwt = await appJwt(env);
  const res = await fetch(
    `${GITHUB_API}/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "ai-shovel-eval-worker",
      },
    },
  );
  if (!res.ok) {
    // 响应可能含错误信息，但绝不含 Token；只回传状态与 GitHub 错误码
    const detail = await res.text().catch(() => "");
    throw new ApiError(
      502,
      "INSTALLATION_TOKEN_FAILED",
      `获取 Installation Token 失败（HTTP ${res.status}）：${detail.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  const expiresAt = Math.floor(new Date(data.expires_at).getTime() / 1000) || now + 3600;
  installationTokenCache = { token: data.token, expiresAt };
  return data.token;
}

function repoParts(env: Env): { owner: string; repo: string } {
  const [owner, repo] = env.GITHUB_API_REPOSITORY.split("/");
  if (!owner || !repo) throw new ApiError(500, "CONFIG_INVALID", "GITHUB_API_REPOSITORY 配置错误");
  return { owner, repo };
}

async function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await installationToken(env);
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "ai-shovel-eval-worker",
      ...(init.headers || {}),
    },
  });
}

export interface DispatchResult {
  /** dispatch 响应直接携带的 run id（GitHub 新版 dispatch API 会返回；旧版 204 无 body） */
  runId: number | null;
  /** 是否成功送达 GitHub（HTTP 2xx） */
  accepted: boolean;
}

/**
 * 触发固定评测 Workflow（workflow_dispatch）。
 * 目标仓库 / Workflow / Ref 全部来自服务端配置，绝不接受外部输入。
 */
export async function dispatchEvalWorkflow(
  env: Env,
  repoUrl: string,
  requestId: string,
): Promise<DispatchResult> {
  const { owner, repo } = repoParts(env);
  const res = await gh(
    env,
    `/repos/${owner}/${repo}/actions/workflows/${env.GITHUB_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: "main",
        inputs: { repo_url: repoUrl, request_id: requestId },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(
      502,
      "DISPATCH_FAILED",
      `触发评测工作流失败（HTTP ${res.status}）：${detail.slice(0, 300)}`,
    );
  }

  // 新版 API：200 + {workflow_run_id / run_url / html_url}；经典 API：204 无 body
  let runId: number | null = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = data?.workflow_run_id ?? data?.run_id ?? (data?.workflow_run as { id?: number })?.id;
    if (typeof raw === "number") runId = raw;
  }
  return { runId, accepted: true };
}

/**
 * 按 request_id 从 Workflow Runs 中反查 run（任务书 §18.1 恢复路径）。
 * workflow run 的 name 来自 run-name："AI Shovel Eval · <request_id>"。
 * 找不到返回 null（调用方置 dispatch_unknown，绝不盲目重触发）。
 */
export async function findRunByRequestId(
  env: Env,
  requestId: string,
  attempts = 3,
  delayMs = 400,
): Promise<{ runId: number; attempt: number; status: string } | null> {
  const { owner, repo } = repoParts(env);
  const path =
    `/repos/${owner}/${repo}/actions/workflows/${env.GITHUB_WORKFLOW_FILE}/runs` +
    `?event=workflow_dispatch&per_page=10&branch=main`;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await gh(env, path);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        workflow_runs?: { id: number; name?: string; run_attempt?: number; status?: string }[];
      };
      const hit = (data.workflow_runs || []).find((r) => (r.name || "").includes(requestId));
      if (hit) {
        return { runId: hit.id, attempt: hit.run_attempt ?? 1, status: hit.status ?? "queued" };
      }
    } catch {
      // 网络瞬断 → 继续重试
    }
  }
  return null;
}
