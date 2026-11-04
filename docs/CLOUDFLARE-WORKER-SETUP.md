# Cloudflare Worker 评测系统操作手册

> AI Shovel Eval V2 — 无 Issue 评测链路：前端 GitHub 登录 → 站内提交 → Worker 触发
> `workflow_dispatch` → Actions 八阶段进度回调 → Pages 部署 → 报告上线。
>
> 本文按任务书要求的 **24 步顺序** 编排，每步同时给出 **Windows PowerShell** 与
> **Git Bash** 两种命令。所有 `<>` 占位符按你的实际值替换。
>
> **安全约定：任何密钥（Client Secret、私钥、HMAC 密钥）都只需要在你自己的终端里输入，
> 不要粘贴给 Trae、ChatGPT 或任何 AI 对话工具。**

## 目录

- [架构总览](#架构总览)
- [第 1–7 步：Cloudflare 账户与 Worker 部署](#第-17-步cloudflare-账户与-worker-部署)
- [第 8–12 步：创建 GitHub App 并安装](#第-812-步创建-github-app-并安装)
- [第 13–18 步：配置并重新部署 Worker](#第-1318-步配置并重新部署-worker)
- [第 19 步：接入 Astro 前端](#第-19-步接入-astro-前端)
- [第 20–24 步：端到端测试](#第-2024-步端到端测试)
- [最终配置项清单](#最终配置项清单)
- [回滚方案](#回滚方案)
- [故障排查](#故障排查)

---

## 架构总览

```
evaluate.astro（登录/提交/八阶段进度）
   │  ① /auth/github/start → GitHub 授权（PKCE + state）
   │  ② callback → Worker 换 user token → 一次性 ticket → /auth/callback
   │  ③ POST /api/evaluations（session + Origin + 频率限制 + 幂等）
   ▼
Cloudflare Worker（workers/eval-api，Hono + D1）
   │  ④ GitHub App Installation Token → workflow_dispatch（固定仓库/固定 workflow）
   ▼
evaluate-shovel.yml（八阶段评测，HMAC 回调 /internal/progress）
   │  ⑤ commit 报告 → 显式 dispatch pages-astro.yml
   ▼
pages-astro.yml（build → deploy → 报告页 200 校验 → /internal/finalize）
   ▼
Worker 置 completed ← 前端轮询 GET /api/evaluations/:id 显示结果
```

关键安全设计：

- 被测仓库代码**永不执行**（纯静态分析，evaluator 只读 checkout，`persist-credentials: false`）。
- GitHub App 私钥 / Client Secret / Installation Token / EVAL_PROGRESS_SECRET 只存在于 Worker Secret 与 Actions Secret。
- 进度回调 HMAC-SHA256 签名（`ts + "." + 原始请求体`），5 分钟时间窗，常数时间比较。
- CORS 白名单不含 `*`；内部接口携带浏览器 Origin 直接 403。
- 频率限制：每用户每日 3 次、同仓库 1 个进行中、每用户 2 个排队/运行中。
- 回滚锚点（Stage 0 已建，勿删）：tag `pre-worker-eval-20261104-100319-e822077` 与 `v2.2.0`。

---

## 第 1–7 步：Cloudflare 账户与 Worker 部署

### 1. 注册 Cloudflare 免费账户

打开 <https://dash.cloudflare.com/sign-up> 注册（免费计划即可，无需绑卡）。

### 2. 设置 workers.dev 子域名

Dashboard → Workers & Pages → 首次进入会提示选择一个 `*.workers.dev` 子域名（如 `<你的子域名>`），确认即可。

### 3. 创建 D1 数据库

```powershell
# PowerShell
cd repo\workers\eval-api
npm install
npx wrangler d1 create ai-shovel-eval
```

```bash
# Git Bash
cd repo/workers/eval-api
npm install
npx wrangler d1 create ai-shovel-eval
```

### 4. 将数据库 ID 填入 wrangler.jsonc

复制命令输出中的 `database_id`，替换 `wrangler.jsonc` 里 `d1_databases[0].database_id`
（仓库内已预填一个 ID，若你创建的是新库必须替换）。

### 5. 执行 D1 迁移

```powershell
# PowerShell
npx wrangler d1 migrations apply ai-shovel-eval --local
npx wrangler d1 migrations apply ai-shovel-eval --remote
```

```bash
# Git Bash
npx wrangler d1 migrations apply ai-shovel-eval --local
npx wrangler d1 migrations apply ai-shovel-eval --remote
```

### 6. Wrangler 登录

```powershell
# PowerShell
npx wrangler login    # 浏览器打开授权；注销用 npx wrangler logout
```

```bash
# Git Bash
npx wrangler login
```

### 7. 首次部署 Worker，获得真实 Worker URL

此时 Secret 尚未配置，登录/提交等链路还不可用，但可以先拿到 URL：

```powershell
# PowerShell
npx wrangler deploy
# 记录输出的 URL：https://<WORKER_SUBDOMAIN>.workers.dev
```

```bash
# Git Bash
npx wrangler deploy
```

快速检查：

```powershell
# PowerShell
Invoke-RestMethod https://<WORKER_SUBDOMAIN>.workers.dev/health
```

```bash
# Git Bash
curl -s https://<WORKER_SUBDOMAIN>.workers.dev/health
```

预期返回 `{"success":true,"service":"ai-shovel-eval-api","status":"ok",...}`。

---

## 第 8–12 步：创建 GitHub App 并安装

### 8. 创建 GitHub App

1. 打开 <https://github.com/settings/apps/new>（建议个人账号创建）。
2. 填写：
   - **GitHub App name**：`AI Shovel Eval Bot`（全局唯一）
   - **Homepage URL**：`https://manningyangs.github.io/AI-Shovel-Collection/evaluate/`
   - **Webhook URL**：留空（本系统不用 Webhook）
   - **Request user authorization (OAuth) during installation**：✅ 勾选（登录流程需要）
3. **Repository permissions**（最小化）：

   | 权限 | Access | 用途 |
   |---|---|---|
   | Actions | **Read and write** | 触发 `workflow_dispatch`、查询 runs |
   | Metadata | Read-only | 必需（默认） |

4. **Where can this GitHub App be installed?** → `Only on this account` → Create app。
5. 创建后在页面顶部 **About** 区记录：
   - **App ID** → 对应 `GITHUB_APP_ID`
   - **Client ID** → 对应 `GITHUB_APP_CLIENT_ID`
6. **Private keys** → Generate a private key → 下载 `*.pem`（对应 `GITHUB_APP_PRIVATE_KEY`，不要提交进仓库）。

### 9. 设置 App Callback URL

GitHub App 页面 → **Callback URL** → 填：

```
https://<WORKER_SUBDOMAIN>.workers.dev/auth/github/callback
```

（第 7 步已拿到 Worker URL；如是先建 App 后部署，此处先占位、部署后回填。）

同时记录 **Setup URL** 可留空。

### 10. 配置 Actions Read & Write 权限

即第 8 步权限表；若沿用已有 App，到 App → Permissions 确认 Actions = Read and write，修改后 **Install app** 重新安装使权限生效。

### 11. 安装 App 到 AI-Shovel-Collection 仓库

App 页面 → **Install App** → 选择账号 → 只勾选 `manningyangs/AI-Shovel-Collection`（或 All repositories）→ Install。

### 12. 获得 Installation ID

安装完成后浏览器地址栏形如 `https://github.com/settings/installations/<数字>`，记录该数字 → `GITHUB_APP_INSTALLATION_ID`。

### （提前准备）生成 GitHub App Client Secret

GitHub App 页面 → **Client secret** → Generate a new client secret → 复制生成的值
（只显示一次）→ 对应 `GITHUB_APP_CLIENT_SECRET`。**保存在你自己的密码管理器，不要发给 AI。**

### （提前准备）生成 EVAL_PROGRESS_SECRET

```powershell
# PowerShell
python -c "import secrets;print(secrets.token_hex(32))"
```

```bash
# Git Bash
python -c "import secrets;print(secrets.token_hex(32))"
```

记下输出的 64 位 hex —— 稍后 Worker 与 GitHub Actions 两侧必须填**完全相同**的值。

---

## 第 13–18 步：配置并重新部署 Worker

### 13. 将 App ID、Client ID、Installation ID 填入 Worker 配置

- **App ID**（非敏感）→ 编辑 `workers/eval-api/wrangler.jsonc` → `vars.GITHUB_APP_ID`
- **Client ID / Installation ID**（敏感，走 Secret）→ 第 14–16 步用 `wrangler secret put` 输入。

```powershell
# PowerShell（编辑 wrangler.jsonc）
notepad wrangler.jsonc
```

```bash
# Git Bash
nano wrangler.jsonc   # 或 code wrangler.jsonc
```

### 14. 配置 GitHub App Private Key 与 Client ID

```powershell
# PowerShell —— 交互式粘贴，值不会进命令历史/日志
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
# 私钥：把 .pem 文件全部内容（含 -----BEGIN/END----- 行，\n 转义保留原样）整体粘贴
```

```bash
# Git Bash —— 交互式粘贴
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY < /path/to/your-key.pem
# 或交互式：npx wrangler secret put GITHUB_APP_PRIVATE_KEY 后粘贴全文
```

再设置 Installation ID：

```powershell
# PowerShell（值替换为你的实际 ID）
12345678 | npx wrangler secret put GITHUB_APP_INSTALLATION_ID
```

```bash
# Git Bash
echo -n "12345678" | npx wrangler secret put GITHUB_APP_INSTALLATION_ID
```

### 15. 配置 GitHub App Client Secret

```powershell
# PowerShell
npx wrangler secret put GITHUB_APP_CLIENT_SECRET    # 粘贴「（提前准备）生成 GitHub App Client Secret」一节生成的值
```

```bash
# Git Bash
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
```

### 16. 生成并配置 EVAL_PROGRESS_SECRET

用「（提前准备）生成 EVAL_PROGRESS_SECRET」一节生成的 64 位 hex：

```powershell
# PowerShell
npx wrangler secret put EVAL_PROGRESS_SECRET
```

```bash
# Git Bash
npx wrangler secret put EVAL_PROGRESS_SECRET
```

验证已写入：

```powershell
# PowerShell
npx wrangler secret list
```

```bash
# Git Bash
npx wrangler secret list
```

预期包含：`GITHUB_APP_CLIENT_ID`、`GITHUB_APP_CLIENT_SECRET`、`GITHUB_APP_PRIVATE_KEY`、
`GITHUB_APP_INSTALLATION_ID`、`EVAL_PROGRESS_SECRET`。

### 17. GitHub 仓库 Actions 侧添加相同的 EVAL_PROGRESS_SECRET

仓库 → Settings → Secrets and variables → Actions → **New repository secret**：

| Name | Value |
|---|---|
| `EVAL_PROGRESS_SECRET` | 与上一步 Worker 侧 `wrangler secret put EVAL_PROGRESS_SECRET` **完全相同**的 64 位 hex |

同时在 **Variables** 标签页添加：

| Name | Value |
|---|---|
| `EVAL_PROGRESS_URL` | `https://<WORKER_SUBDOMAIN>.workers.dev` |
| `PUBLIC_EVAL_API_BASE` | `https://<WORKER_SUBDOMAIN>.workers.dev` |

> 两个 variable 留空时系统优雅降级（进度 no-op、前端显示"评测服务未接入"），不破坏现有功能。

### 18. 重新部署 Worker

```powershell
# PowerShell
npx wrangler deploy
```

```bash
# Git Bash
npx wrangler deploy
```

确认 Callback URL 已回填为 `https://<WORKER_SUBDOMAIN>.workers.dev/auth/github/callback`（第 9 步）。

---

## 第 19 步：接入 Astro 前端

`PUBLIC_EVAL_API_BASE` 已在第 17 步配置为 Actions variable，Pages 构建时注入前端。
触发一次重新构建（push 一个 `astro/**` 下的文件，或在 Actions 里手动 Run `pages-astro.yml`）。

前端代码位置：

- `repo/astro/src/pages/evaluate.astro` — 登录、提交、八阶段进度面板
- `repo/astro/src/pages/auth/callback.astro` — OAuth 回调（`#ticket=` 兑换 session）

---

## 第 20–24 步：端到端测试

### 20. 测试 GitHub 登录

1. 打开 `https://manningyangs.github.io/AI-Shovel-Collection/evaluate/`。
2. 点「使用 GitHub 登录」→ GitHub 授权 → 自动返回 → 徽章变 **已登录**。
3. 失败排查：Callback URL 是否精确等于 Worker 回调地址；App 是否已安装到目标仓库。

### 21. 测试 Workflow Dispatch

1. 输入 `https://github.com/<owner>/<repo>`（先用自己的小公开仓库）→ 申请评测。
2. Worker 日志 `npx wrangler tail` 观察 dispatch；GitHub → Actions 应出现
   `AI Shovel Eval · EV-xxxxxxxx` 运行（run-name 含 request_id）。
3. 未登录提交 → 401；错误 Origin → 403；同仓库已有进行中任务 → 409；每日超 3 次 → 429。

### 22. 测试进度回调

1. 页面八阶段进度在 5 秒轮询下推进（阶段点变色 + 最新文案）。
2. Actions 日志里 progress_client 输出回调成功；旧 `seq` 重放被忽略（状态不回退）。
3. 伪造回调：不带签名 / 错误签名 / 过期时间戳 → 401；签名正确但 `request_id` 不存在 → 404。

### 23. 测试报告发布和 Pages 部署

1. 全绿后出现「查看完整报告」。
2. Actions 中 `pages-astro.yml` 被显式触发，notify-eval 轮询报告页 200 后回调 finalize。
3. 打开报告详情页，确认 URL 真实返回 **200**，`GET /api/evaluations/:id` 状态为 `completed`。

### 24. 测试用户刷新页面恢复任务

1. 进度进行中时刷新页面 → 任务与进度恢复（sessionStorage 中的 task_id + 登录态）。
2. 关闭标签页后重新打开 evaluate 页 → 从「历史记录」或活动任务恢复轮询。
3. GitHub Actions 失败 → 前端显示失败（阶段红叉）；报告发布失败 → 不显示完成。

### 安全验收清单（逐条确认）

- [ ] 未登录提交、错误 Origin、伪造进度、重复任务、非法 URL 全部被正确拒绝。
- [ ] Ticket 只能兑换一次（第二次 409 `TICKET_USED`）。
- [ ] Session 只存 token 的 sha256 hash；登出即失效。
- [ ] 任务只能由所属用户查看（他人 404）。
- [ ] 内部接口要求 HMAC，且拒绝携带浏览器 Origin。
- [ ] GitHub App 私钥不在仓库；`wrangler secret list` 五项齐全。
- [ ] 报告 URL 前缀校验 + 真实 200 校验（防 SSRF）；不存在任意 Workflow 调用代理。

---

## 最终配置项清单

```text
Cloudflare：
  Account                          （你的账户）
  workers.dev 子域名                <你的子域名>
  Worker URL                       https://<WORKER_SUBDOMAIN>.workers.dev
  D1 Database ID                   wrangler.jsonc → d1_databases[0].database_id

GitHub App：
  App ID                           wrangler.jsonc → vars.GITHUB_APP_ID
  Client ID                        wrangler secret GITHUB_APP_CLIENT_ID
  Client Secret                    wrangler secret GITHUB_APP_CLIENT_SECRET（不进仓库）
  Installation ID                  wrangler secret GITHUB_APP_INSTALLATION_ID
  Private Key                      wrangler secret GITHUB_APP_PRIVATE_KEY（.pem 不进仓库）

Worker Variables（wrangler.jsonc [vars]，非敏感）：
  GITHUB_APP_ID
  GITHUB_API_REPOSITORY            = manningyangs/AI-Shovel-Collection
                                    （任务书中的 GITHUB_OWNER + GITHUB_REPO）
  GITHUB_WORKFLOW_FILE             = evaluate-shovel.yml
  PUBLIC_SITE_BASE_URL             = https://manningyangs.github.io/AI-Shovel-Collection
                                    （任务书中的 FRONTEND_ORIGIN + FRONTEND_BASE_PATH）
  ALLOWED_SITE_ORIGINS             = https://manningyangs.github.io,http://localhost:4321
                                    （任务书中的 FRONTEND_ORIGIN，CORS 白名单）
  RATE_DAILY_PER_USER / RATE_MAX_ACTIVE_PER_REPO / RATE_MAX_QUEUED_PER_USER / SESSION_TTL_SECONDS

Worker Secrets（wrangler secret put）：
  GITHUB_APP_CLIENT_ID
  GITHUB_APP_CLIENT_SECRET
  GITHUB_APP_PRIVATE_KEY
  GITHUB_APP_INSTALLATION_ID       （任务书中的 GITHUB_INSTALLATION_ID）
  EVAL_PROGRESS_SECRET

GitHub Actions Secrets：
  EVAL_PROGRESS_SECRET             （与 Worker 侧完全相同）

GitHub Actions Variables：
  EVAL_PROGRESS_URL                = Worker URL
  PUBLIC_EVAL_API_BASE             = Worker URL（Astro 构建期注入）

Astro Build Variable：
  PUBLIC_EVAL_API_BASE             （由上面的 Actions variable 提供，构建时读取）

固定值（代码内）：
  GITHUB_REF = "main"              （dispatch ref，github-app.ts）
```

---

## 回滚方案

| 场景 | 操作 |
|---|---|
| 代码级回滚 | `git switch -c rollback/<date> pre-worker-eval-20261104-100319-e822077 && git push -u origin rollback/<date>`，合并/快进 main 后 Pages 自动重建；或 `git revert <commits>` |
| Worker 下线 | `npx wrangler delete`（或 Dashboard 删除）；D1 数据保留可随时重建绑定 |
| 前端降级 | 未配置 `PUBLIC_EVAL_API_BASE` 时 evaluate 页显示"评测服务未接入"，不影响浏览报告 |
| GitHub App 撤销 | Settings → Developer settings → GitHub Apps → Suspend / Delete；同时删除 Actions Secret `EVAL_PROGRESS_SECRET` |

回滚不影响已有评测报告（`evaluations/` 目录独立于评测链路）。

## 故障排查

| 症状 | 排查点 |
|---|---|
| 前端"评测服务未接入" | Actions variable `PUBLIC_EVAL_API_BASE` 未设置，或设置后未重新构建 |
| 登录回调"兑换失败" | Callback URL 是否精确等于 `https://<WORKER>/auth/github/callback`；App 是否安装到目标仓库 |
| 提交后无进度 | Actions 的 `EVAL_PROGRESS_URL` / `EVAL_PROGRESS_SECRET` 是否与 Worker 一致；`npx wrangler tail` 看签名报错 |
| 任务卡在 `dispatching` | `wrangler tail` 查 Installation Token / dispatch 报错；`GITHUB_APP_INSTALLATION_ID` 是否正确；App 是否 Actions read/write；私钥是否 PKCS#1（Worker 会自动转 PKCS#8） |
| 任务卡在 `publishing` | pages-astro.yml 是否收到 dispatch；notify-eval 是否报报告页 404 |
| `'iss' claim must be an Integer` | `GITHUB_APP_ID` 未回填真实值（仍为 `REPLACE_AFTER_APP_CREATED`） |
| 频率限制误伤 | 调整 `wrangler.jsonc` [vars] 的 RATE_* |
| 进度阶段错乱 | seq 单调规则 `stage_index*10+kind`，failed=99999，finalize=100000；查 D1 `evaluation_tasks.progress_seq` |
| 本地开发 | `cp .dev.vars.example .dev.vars` 填 5 个值 → `npx wrangler d1 migrations apply ai-shovel-eval --local` → `npm run dev` |
