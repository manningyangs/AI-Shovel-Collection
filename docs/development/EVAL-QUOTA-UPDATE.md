# AI Shovel Eval — 每日额度调整与剩余时间倒计时 — 交付报告

**日期：** 2026-11-05
**Commit SHA：** `9337a332a282c3ddc8e6d07f8a72f3a4f8c9b7d1`
**修改范围：** 仅 6 个文件（4 Worker 后端 + 1 wrangler 配置 + 1 前端页面）

---

## 1. 修改文件清单

| # | 文件 | 类型 | 改动量 |
|---|---|---|---|
| 1 | `workers/eval-api/wrangler.jsonc` | 配置 | `"RATE_DAILY_PER_USER": "3"` → `"5"` |
| 2 | `workers/eval-api/src/types.ts` | 类型 | ApiError 加 `extra?: Record<string, unknown>`；`errJson` 自动 spread |
| 3 | `workers/eval-api/src/db.ts` | D1 查询 | 新增 `getRecentTaskWindow(env, requesterId, sinceSecondsAgo)` — 返回 `{count, earliestCreatedAt}` 联合查询 |
| 4 | `workers/eval-api/src/evaluation-service.ts` | 限额逻辑 | daily 429 block 改用 `getRecentTaskWindow`；计算 `retry_after_seconds = earliest + 86400 - now`；抛 ApiError 带 limit/retry_after_seconds/next_available_at；code 从 `RATE_DAILY_LIMIT` 改为 `DAILY_LIMIT_EXCEEDED` |
| 5 | `workers/eval-api/src/index.ts` | HTTP 响应 | `onError` spread `apiErr.extra` 到 `error` 对象 |
| 6 | `astro/src/pages/evaluate.astro` | 前端 | api() 扩传 extra 字段到 err 对象；429 + DAILY_LIMIT_EXCEEDED 分支启动倒计时；倒计时函数（每秒 tick / sessionStorage 恢复 / 到期释放按钮）；clearSession 清 quota storage；submitRow 下插入 `.quota-block` DOM；`.quota-*` CSS |

**未修改：** pages-astro.yml / evaluate-shovel.yml / live-data.yml / 工具地图 / 评测算法 / 报告 schema / D1 表结构

---

## 2. 额度调整

| 项 | 原值 | 新值 |
|---|---|---|
| `RATE_DAILY_PER_USER`（wrangler.jsonc） | `"3"` | `"5"` |
| 每日额度（滚动 24h） | 3 次 | 5 次 |

**保留机制：**
- 滚动 24h（非自然日零点）
- 失败任务计入次数
- 幂等键重复请求不重复创建
- 每用户最多 2 个进行中任务（不变）
- 同用户同仓库最多 1 个进行中任务（不变）

**注意：** wrangler.jsonc 只是默认值，**Cloudflare Dashboard 里可能也有同名 env 变量覆盖**。部署前必须确认生产环境生效值为 5（wrangler secret list / Dashboard Workers → Settings → Variables）。

---

## 3. 滚动窗口计算方式

**D1 字段：** `evaluation_tasks.created_at` 是 **Unix 秒**（worker/db.ts `countRecentTasks` 里 `Math.floor(Date.now()/1000) - 86400` 印证）

**新查询（db.ts getRecentTaskWindow）：**
```sql
SELECT COUNT(*) AS n, MIN(created_at) AS earliest
FROM evaluation_tasks
WHERE requester_github_id = ? AND created_at >= ?
```
其中 `?` = `floor(Date.now()/1000) - 86400`

**retry_after_seconds 公式（evaluation-service.ts）：**
```
now = floor(Date.now() / 1000)
retry_after_seconds = max(0, earliest_created_at + 86400 - now)
next_available_at    = ISO(now + retry_after_seconds)
```

**示例（任务书 §四.3）：** 5 次任务创建时间分别是 09:00/10:00/12:00/14:00/16:00。次日 08:00 提交时：
- earliest = 09:00（第 1 次）
- retry_after = 09:00 + 86400 - 08:00 = **3600 秒 ≈ 1 小时**
- 不是第二天 00:00 统一重置

---

## 4. HTTP 429 响应示例

```jsonc
// 旧版（原 RATE_DAILY_LIMIT）：
{ "success": false, "error": { "code": "RATE_DAILY_LIMIT", "message": "今日评测提交次数已达上限（3 次/天），请明天再试" } }

// 新版（DAILY_LIMIT_EXCEEDED）：
{
  "success": false,
  "error": {
    "code": "DAILY_LIMIT_EXCEEDED",
    "message": "过去 24 小时内已使用 5/5 次评测额度，请在倒计时结束后再试",
    "limit": 5,
    "retry_after_seconds": 30720,
    "next_available_at": "2026-11-06T00:32:00Z",
    "window_seconds": 86400
  }
}
```

**并发限制 409 不触发倒计时（天然隔离）：**
- 并发限制返回 HTTP 409（QUEUE_LIMIT / ACTIVE_REPO_EXISTS）
- 前端 catch 里 409 分支先匹配 → 不走到 429 DAILY_LIMIT_EXCEEDED 分支
- 即使未来并发限制也返回 429，只要 code 不是 DAILY_LIMIT_EXCEEDED，前端也不会显示倒计时

---

## 5. 前端倒计时实现

### 5.1 api() 扩展（evaluate.astro L402-425）
fetch 非 OK 响应时，将 Worker error 对象里的 `retry_after_seconds / next_available_at / limit` 字段挂到 err 上（只认 number/string 类型，避免 null 污染）。

### 5.2 倒计时主循环（startQuotaCountdown）
- 输入：`nextAtIso`（Worker 返回 UTC ISO）
- 基准点：`nextMs = new Date(nextAtIso).getTime()` + 本地 `Date.now()` 差值（避免时钟漂移）
- `setInterval` 1s tick，计算 `remain = floor((nextMs - Date.now()) / 1000)`
- `remain <= 0` 时：停 timer、清 sessionStorage、显示 `quotaDone` 块、**恢复提交按钮可操作**（不自动提交）
- 期间禁用提交按钮（`els.submitBtn.disabled = true`）

### 5.3 sessionStorage 恢复（restoreQuotaFromStorage）
- key：`EVAL_QUOTA_NEXT_AT`，value：`{"next": next_available_at_iso, "receivedAt": epoch_ms}`
- 页面 load 时（init → api("/api/me") 成功 → showLoggedIn → loadHistory → **restoreQuotaFromStorage**）恢复
- 恢复前校验 `nextMs > Date.now()`；已过期则静默丢弃
- **注意：** 客户端倒计时到期 ≠ 后端额度真的释放——用户重新提交仍由 Worker 权威校验（任务书 §五.3）

### 5.4 不显示倒计时的场景
- **409 并发限制**：走到 catch 里 `409 && /EXIST|ACTIVE|QUEUE/.test(err.code)` 分支 → 只显示 err.message，不启动 countdown
- **auth 过期 401**：清 session + 重登
- **其他 4xx/5xx**：通用 "提交失败：xxx"

---

## 6. Worker 部署

**本机无 wrangler CLI + 无 Cloudflare 凭据，需手动部署。**

### 6.1 安装 + 登录
```bash
npm i -g wrangler
wrangler login
```

### 6.2 检查现有 env 覆盖
wrangler.jsonc 里 `RATE_DAILY_PER_USER = "5"` 是默认值。如果 Dashboard Workers → eval-api → Settings → Variables 里也配置了同名变量，**Dashboard 值会覆盖文件值**。必须两边都改为 5：
```bash
wrangler secret list     # 看 secret 列表（确认 RATE_DAILY_PER_USER 是否在 secrets 里）
# 如果是 secret，删掉后重新创建：
wrangler secret delete RATE_DAILY_PER_USER -e production
wrangler secret put RATE_DAILY_PER_USER -e production   # 输入 5
```

或者在 Dashboard 直接改：Workers & Pages → eval-api → Settings → Variables → edit RATE_DAILY_PER_USER → 5 → Save。

### 6.3 部署
```bash
cd workers/eval-api
wrangler deploy -e production          # 或 wrangler deploy（默认环境）
wrangler deploy --dry-run             # 可选：预览变更
```

### 6.4 部署后验证
```bash
# 用真实账号登录后调用接口（需 AUTH header）：
curl -X POST <EVAL_API_BASE>/api/evaluations \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"repo_url":"https://github.com/owner/repo","idempotency_key":"test-429"}' \
  -w "\nHTTP_STATUS=%{http_code}\n"
# 连续提交 6 次：前 5 次应 2xx，第 6 次应 429 + DAILY_LIMIT_EXCEEDED + retry_after_seconds + next_available_at
```

---

## 7. GitHub Pages 部署

Worker 代码 push 到 main 后，**Astro 页面不会自动触发 Pages 重新部署**（同 live-data 问题——GITHUB_TOKEN push 跳过 on: push）。

但我们之前已经修复了这个链路：`live-data.yml` 的 `dispatch-pages` Job 在每次 sync 成功后显式 dispatch `pages-astro.yml`。**Worker 代码 push 后，等下一次定时同步（每 6h）或手动触发 live-data.yml，Pages 就会自动部署。**

**如果要立即部署前端页面**，手动触发 `pages-astro.yml` 的 `workflow_dispatch`：
```bash
gh workflow run pages-astro.yml --ref main
# 或 GitHub Actions 页面：Deploy Astro site to GitHub Pages → Run workflow
```

---

## 8. 验收测试

### A. Worker 后端（部署后验证）

| # | 测试项 | 方法 | 期望 |
|---|---|---|---|
| A1 | 限额 5 | 创建测试账号连续提交 6 次 | 第 6 次 429，limit=5 |
| A2 | retry_after 计算 | 查数据库里该用户最早一笔任务 created_at | retry_after = earliest + 86400 - now |
| A3 | next_available_at | ISO UTC 格式 | 与 retry_after 时间一致 |
| A4 | 并发隔离 | 同时 2 个进行中任务 + 第 3 次提交 | 409 QUEUE_LIMIT，**不是** 429 |
| A5 | 幂等键 | 相同 idempotency_key 两次提交 | 第二次不新增计数 |

### B. 前端（build 已过，Pages 部署后浏览器验证）

| # | 测试项 | 方法 | 期望 |
|---|---|---|---|
| B1 | 429 触发倒计时 | 让 Worker 对某用户返回 429 DAILY_LIMIT_EXCEEDED | `.quota-block` 显示、按钮禁用 |
| B2 | 每秒更新 | 观察 DOM | `quota-time` 数字每秒 -1 |
| B3 | 刷新恢复 | 倒计时进行中 F5 | 恢复剩余时间（不重新从 0 开始） |
| B4 | 倒计时到期 | 等剩余时间归零 | `.quota-time` 隐藏、`.quota-done` 显示、按钮恢复 |
| B5 | 并发不触发 | Worker 返回 409 | 只显示 "已有进行中任务"，不显示倒计时 |
| B6 | 重新提交仍权威 | 倒计时到期后提交 | Worker 重新校验，可能仍 429（返回新 retry_after） |

### C. 回归

| 模块 | 验证点 |
|---|---|
| 评测系统 | GitHub OAuth / 仓库地址校验 / 评测触发 / 报告生成 / evaluations/index.json 更新 |
| 工具地图 | 首页入口 / 独立地图页面 / 节点连线 / 工作流编辑 / 连接检查 |
| 实时数据 | live-data.yml → dispatch-pages → pages-astro 链路 |
| 评测发布 | evaluate-shovel.yml → pages-astro 的 workflow_dispatch 参数透传 |

---

## 9. 回滚步骤

### 9.1 Worker 回滚
```bash
cd workers/eval-api
git revert HEAD^   # 撤掉 evaluation-service.ts / db.ts / types.ts / index.ts 的改动
git revert HEAD    # 撤掉 wrangler.jsonc 的 5→3
# 或直接改回 wrangler.jsonc: RATE_DAILY_PER_USER = "3"
wrangler deploy -e production
```

### 9.2 前端回滚
```bash
git revert <astro-commit-sha>
# push main 后，等 live-data dispatch-pages 自动触发 pages-astro
```

### 9.3 紧急回滚 Dashboard
如果不想改代码也能先救：Cloudflare Dashboard → Workers → eval-api → Settings → Variables → `RATE_DAILY_PER_USER` 改回 `"3"`（Dashboard 值覆盖文件值）。

---

## 10. 严格禁止自检

| 禁止项 | 状态 |
|---|---|
| 不引入 PAT | ✅ 未使用 |
| 不修改 GitHub App 权限 | ✅ 未动 |
| 不修改 OAuth | ✅ 未动 |
| 不改 D1 schema | ✅ 未动（只加了查询函数） |
| 不清历史记录 | ✅ 未动 |
| 不改评分算法 | ✅ 未动 |
| 不改报告 schema | ✅ 未动 |
| 不改评测 workflow | ✅ evaluate-shovel.yml 未动 |
| 不改实时数据 workflow | ✅ live-data.yml 未动 |
| 不改工具地图 | ✅ 未动 |
| 不改首页无关样式 | ✅ 未动 |

---

## 11. 最终状态

1. ✅ 每用户过去 24h 额度代码已改 5（wrangler.jsonc），**Cloudflare Dashboard env 需手动同步**
2. ✅ Worker 429 响应已返回 retry_after_seconds + next_available_at + limit
3. ✅ retry_after 基于滚动窗口最早一笔 created_at 计算，非零点重置
4. ✅ 前端倒计时每秒 tick，sessionStorage 可恢复，到期自动释放按钮
5. ✅ 倒计时到期后重新提交仍由 Worker 权威校验
6. ✅ 并发限制（409）不触发每日额度倒计时
7. ✅ 编译构建全绿：Worker TSC 0 错误、Astro 206 页 5.80s

### 待人工完成
- [ ] 安装 wrangler CLI + Cloudflare 登录
- [ ] 确认 Dashboard RATE_DAILY_PER_USER env 同步为 5
- [ ] wrangler deploy 生产 eval-api
- [ ] 手动触发 live-data.yml 或 pages-astro.yml 让 Pages 重新部署前端
- [ ] 生产环境用测试账号验证 A1-A5 / B1-B6
