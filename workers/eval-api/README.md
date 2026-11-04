# ai-shovel-eval-api

AI Shovel Eval 的 Cloudflare Worker 后端：GitHub App OAuth 登录、站内提交评测任务、
`workflow_dispatch` 触发、接收 Actions 八阶段进度回调、报告发布后收尾。

架构与部署步骤见 [`docs/CLOUDFLARE-WORKER-SETUP.md`](../../docs/CLOUDFLARE-WORKER-SETUP.md)。

## 目录结构

```
workers/eval-api/
├── src/
│   ├── index.ts               # Hono 应用入口：路由、CORS、/health、错误处理
│   ├── types.ts               # Env 绑定、TaskStatus、ApiError、AppEnv
│   ├── security.ts            # 仓库 URL 校验、HMAC 验签、CORS 白名单、ID/哈希工具
│   ├── db.ts                  # D1 访问层（task 查询/插入/条件更新、taskToApi）
│   ├── sessions.ts            # Session 创建/校验/吊销（只存 sha256 hash）
│   ├── oauth.ts               # OAuth PKCE 授权、callback、ticket→session 兑换、/me、登出
│   ├── github-app.ts          # App JWT、Installation Token、workflow_dispatch、PKCS1→PKCS8
│   ├── evaluation-service.ts  # 用户侧 API：创建/查询/列表，频率限制与幂等
│   └── progress-service.ts    # 内部 API：/internal/progress、/internal/finalize
├── migrations/
│   └── 0001_initial_schema.sql  # 5 张表：evaluation_tasks / sessions / login_tickets / oauth_states / oauth_pkce
├── tests/
│   ├── security.test.ts       # URL 校验、HMAC、CORS 白名单、哈希（36 例）
│   └── github-app.test.ts     # PKCS1→PKCS8 私钥转换与验签（4 例）
├── wrangler.jsonc             # Worker 名、D1 绑定、非敏感 vars
├── .dev.vars.example          # 本地 Secret 模板（复制为 .dev.vars，不进版本库）
└── README.md
```

## 配置的实际分布

任务书建议的 `src/config.ts` 与部分变量名未原样采用，实际分布如下：

| 内容 | 实际位置 |
|---|---|
| Secret（5 个） | `src/types.ts` 的 `Env` 接口声明；本地值在 `.dev.vars`，线上用 `wrangler secret put` |
| 非敏感变量 | `wrangler.jsonc` 的 `[vars]`（GITHUB_APP_ID、GITHUB_API_REPOSITORY、GITHUB_WORKFLOW_FILE、PUBLIC_SITE_BASE_URL、ALLOWED_SITE_ORIGINS、RATE_*、SESSION_TTL_SECONDS） |
| D1 绑定与 database_id | `wrangler.jsonc` 的 `d1_databases` |
| 路由与 CORS 策略 | `src/index.ts` |

### 任务书变量名 → 本实现变量名映射

| 任务书 | 本实现 | 说明 |
|---|---|---|
| `GITHUB_INSTALLATION_ID` | `GITHUB_APP_INSTALLATION_ID`（Secret） | 与 `GITHUB_APP_` 前缀保持一致 |
| `GITHUB_OWNER` + `GITHUB_REPO` | `GITHUB_API_REPOSITORY="owner/repo"`（var） | 一个变量表达固定目标仓库 |
| `GITHUB_REF` | 固定 `"main"`（`github-app.ts` dispatch body） | dispatch ref 与评测仓库分支无关 |
| `FRONTEND_ORIGIN` + `FRONTEND_BASE_PATH` | `PUBLIC_SITE_BASE_URL`（完整站点根 URL）+ `ALLOWED_SITE_ORIGINS`（CORS 白名单，逗号分隔） | 回调地址校验用前者，CORS 用后者 |
| `GITHUB_CLIENT_ID` | `GITHUB_APP_CLIENT_ID`（Secret） | 同上 |

## 常用命令

```powershell
# PowerShell（Windows）
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run dev           # wrangler dev → http://127.0.0.1:8787
npx wrangler d1 migrations apply ai-shovel-eval --local
npm run deploy
```

```bash
# Git Bash / Linux / macOS
npm install
npm run typecheck
npm test
npm run dev
npx wrangler d1 migrations apply ai-shovel-eval --local
npm run deploy
```

## 安全要点

- 用户 API 需 Bearer session（只存 token 的 sha256 hash，8 小时过期）。
- 内部回调需 `X-Eval-Timestamp` + `X-Eval-Signature`：`HMAC-SHA256(secret, ts + "." + 原始请求体)`，5 分钟时间窗，常数时间比较。
- 创建任务必须携带白名单 Origin；CORS 白名单不含 `*`，且 `/api/*` 拒绝非白名单 Origin（403）。
- 仓库 URL 只允许 `https://github.com/<owner>/<repo>` 两段路径，拒绝 `.git`、query、userinfo、保留后缀 → 防 SSRF 与任意 Workflow 代理。
- `finalize` 的 report_url 必须以 `PUBLIC_SITE_BASE_URL + "/evaluations/"` 开头，且真实 GET 返回 200 才置 `completed`。
- 进度 `seq` 单调递增（`stage_index*10+kind`，failed=99999，finalize=100000），旧事件不可回退；首个回调绑定 `workflow_run_id`，后续不匹配 → 409。
- GitHub App 私钥、Client Secret、HMAC 密钥只经 Secret 注入，不进仓库、不进日志。
