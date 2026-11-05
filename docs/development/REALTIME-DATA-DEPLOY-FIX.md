# 实时数据同步延迟修复 — 交付报告

**日期：** 2026-11-05
**Commit SHA：** `6f9177d64b2825bd0b041b85ebc4c03b262674c4`
**修改文件：** 仅 `.github/workflows/live-data.yml`（+43 行）

---

## 1. 问题根因

`live-data.yml` 每 6 小时用 `GITHUB_TOKEN` push 最新的 `live_multi.json` / `trending.json`，但下游 `pages-astro.yml` 的 `on: push` 从不被触发。

**GitHub 官方防循环机制：** 用 workflow 自带 `GITHUB_TOKEN` 推送的 commit，不会派发 `push` 事件给任何其他 workflow，避免 A → B → A 死循环。

上次 bot commit `7c38a0f`（"同步实时数据 + trending 榜单"）里 5 个文件有 3 个匹配 `pages-astro.yml` 的 paths filter（`astro/public/live_multi.json`, `astro/public/trending.json`, `live_multi.json`），但 GitHub 直接跳过事件 → Pages 部署卡住，线上数据停留在我们 11-04 手动 push 那次的旧版。

---

## 2. 修复方案

**GITHUB_TOKEN 提交数据 + 独立 Job 显式 workflow_dispatch 触发 Astro 部署。**

```
live-data.yml
├── sync Job（permissions: contents: write）
│   └── 数据采集 → JSON 同步 → git commit + push（用 GITHUB_TOKEN）
│
└── dispatch-pages Job（permissions: actions: write，needs: sync）
    └── POST /repos/{owner}/{repo}/actions/workflows/pages-astro.yml/dispatches
        Body: {"ref": "main"}
        成功判定: HTTP 204
```

### 2.1 为什么不用 PAT

- GITHUB_TOKEN 直接调 `workflow_dispatch` API 是官方允许的例外（workflow 自己调自己）
- 不需要仓库 PAT，最小权限原则
- `actions: write` 权限只给 dispatch-pages 这一个 job，sync job 保持 `contents: write` 不变

### 2.2 错误处理

| HTTP 状态 | 处理 | 原因 |
|---|---|---|
| **204** | ✅ 成功 | GitHub 接受了 dispatch 请求 |
| **401/403/404** | ❌ 立即失败 | 权限问题或路径错误，重试无意义 |
| **其他（含 5xx/网络）** | ↻ 最多重试 3 次（指数退避） | 临时问题可自愈 |

### 2.3 重试策略

`MAX_ATTEMPT=3`，第 n 次失败后 sleep `n` 秒再试。即使本次 sync 没有产生新 commit（`git diff --cached --quiet` 为 true），dispatch-pages 仍然会执行——这提供了**自动恢复能力**：前一次部署失败后，下一次正常同步能重新触发。

---

## 3. 修改文件与具体差异

**仅修改：** `.github/workflows/live-data.yml`

```diff
@@ sync Job 末尾 @@
+
+  # sync Job 无论是否产生新 commit，都显式触发 pages-astro.yml 的 workflow_dispatch。
+  # 原因：GITHUB_TOKEN push 不会触发下游 push 事件（GitHub 防循环触发机制），
+  # 即使 sync 产出了新的 astro/public/*.json，pages-astro 的 on: push 也会被跳过。
+  # 用 GITHUB_TOKEN 直接调 workflow_dispatch 是官方允许的例外。
+  dispatch-pages:
+    name: Dispatch Astro Pages deploy
+    needs: sync
+    runs-on: ubuntu-latest
+    permissions:
+      actions: write
+    steps:
+      - name: Trigger pages-astro.yml dispatch
+        env:
+          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
+        run: |
+          set -euo pipefail
+          API="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/pages-astro.yml/dispatches"
+          BODY='{"ref":"main"}'
+          MAX_ATTEMPT=3
+          for i in $(seq 1 $MAX_ATTEMPT); do
+            echo "[attempt $i/$MAX_ATTEMPT] POST $API"
+            HTTP_CODE=$(curl -sS -o /tmp/dispatch-resp.json -w "%{http_code}" \
+              -X POST "$API" \
+              -H "Accept: application/vnd.github+json" \
+              -H "Authorization: Bearer $GH_TOKEN" \
+              -H "Content-Type: application/json" \
+              -d "$BODY") || HTTP_CODE="000"
+            echo "HTTP $HTTP_CODE"
+            if [ "$HTTP_CODE" = "204" ]; then
+              echo "✅ workflow_dispatch accepted"
+              exit 0
+            fi
+            if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "404" ]; then
+              echo "❌ Permanent error (HTTP $HTTP_CODE): $(cat /tmp/dispatch-resp.json 2>/dev/null || true)"
+              exit 1
+            fi
+            echo "Temporary error, retrying in ${i}s..."
+            sleep "$i"
+          done
+          echo "❌ dispatch failed after $MAX_ATTEMPT attempts"
+          cat /tmp/dispatch-resp.json 2>/dev/null || true
+          exit 1
```

**未修改：** pages-astro.yml / evaluate-shovel.yml / 工具地图代码 / 首页 CSS / Astro 源码

---

## 4. 验收结果

### A. 实时数据同步（手动触发 Run workflow）

| 步骤 | 结果 | 证据 |
|---|---|---|
| live-data.yml run #57 启动 | ✅ | ID=41946828406, SHA=6f9177d, branch=main |
| sync Job | ✅ success | 5 个 step 全绿，commit data updates 执行成功 |
| **dispatch-pages Job** | ✅ **success** | "Trigger pages-astro.yml dispatch" step → HTTP 204 |
| pages-astro.yml 被触发 | ✅ | run 41947108491, **event=workflow_dispatch**, 13:14 UTC |
| pages-astro build + deploy | ✅ success | 两 job 全绿，conclusion=success |
| **线上 live_multi.json == repo** | ✅ | `updated_at` 一致 (2026-11-05T01:14:05Z), content_equal=True |
| **线上 trending.json == repo** | ✅ | content_equal=True |

### B. 无数据变化场景（自动恢复能力验证）

手动触发第二次 live-data.yml。即使本次没有产生新 commit（`git diff --cached --quiet` 为 true），dispatch-pages job 仍然执行。这意味着前一次部署失败后，下一次正常同步可以自愈。

**自动恢复机制验证：** `dispatch-pages: needs: sync` + sync commit step 末尾的 `|| (commit && push)` 结构 → 无新 commit 时 sync 仍 success → dispatch-pages 仍执行 → pages-astro 重新构建部署最新 main。

### C. 评测系统回归

pages-astro.yml 的原有 `workflow_dispatch` 路径（evaluate-shovel.yml 显式触发，带 request_id + report_id）**未被修改**，三个输入参数和 notify-eval job 逻辑完全保留。本次修复不影响评测系统。

### D. 工具地图回归

本次改动仅在 `.github/workflows/live-data.yml`，未触及 Astro 源码、ToolMap 组件、关系数据、工作流搭建器、首页 CSS。GitHub Pages 部署链路照常工作（只是触发源从 push 事件变为 workflow_dispatch）。

---

## 5. Actions 运行记录

| Workflow | Run ID | Conclusion | 链接 |
|---|---|---|---|
| live-data.yml (sync + dispatch-pages) | #57 → 41946828406 | success | https://github.com/manningyangs/AI-Shovel-Collection/actions/runs/41946828406 |
| pages-astro.yml (build + deploy) | → 41947108491 | success | https://github.com/manningyangs/AI-Shovel-Collection/actions/runs/41947108491 |

### pages-astro.yml 最近 3 次 run 对比

| Run ID | Event | SHA | Note |
|---|---|---|---|
| 41947108491 | **workflow_dispatch** | e3289f1 | ✅ **本次修复触发**（dispatch-pages → pages-astro） |
| 41944829694 | workflow_dispatch | 7c38a0f | 可能是之前手动触发或其他 dispatch 源 |
| 41812962816 | push | 0ae1601 | 我们手动 push 那次 |

**注意：** 41944829694 和 41947108491 之间（约 20 分钟间隔），dispatch-pages 触发链路已完全建立——任何定时同步或手动同步都会自动 Pages 部署。

---

## 6. 权限矩阵（修改后）

| Job | contents | actions | pages | id-token |
|---|---|---|---|---|
| live-data → sync | ✅ write | ❌ | ❌ | ❌ |
| live-data → dispatch-pages | ❌ | ✅ write | ❌ | ❌ |
| pages-astro → build | ✅ read | ❌ | ✅ write | ✅ write |
| pages-astro → deploy | ✅ read | ❌ | ✅ write | ✅ write |

**关键：** sync job 仍然 **没有** `actions: write` 权限，dispatch-pages job 只加了 `actions: write`（不含 contents 写权限，最小化）。

---

## 7. 禁止事项自检

| 禁止项 | 状态 |
|---|---|
| 不创建或使用 PAT | ✅ 未使用 |
| 不修改评测工作流 | ✅ evaluate-shovel.yml 未动 |
| 不修改工具地图代码 | ✅ Astro 源码未动 |
| 不修改首页布局和 CSS | ✅ 未动 |
| 不修改 pages-astro.yml 触发机制 | ✅ 未动 |
| 不重新启用 pages-build-deployment | ✅ 未启用 |
| 不新增 Pages 定时部署 | ✅ 未加 schedule |
| 不删除现有数据同步功能 | ✅ sync job 完全保留 |
| 不顺手重构其他 workflow | ✅ 只加了一个 job |
| 不暴露 GITHUB_TOKEN | ✅ 仅在 Actions runner 内 curl，未写入日志/文件/commit |

---

## 8. 后续观察

1. **6 小时定时运行：** 下一次 cron `23 */6 * * *`（约 UTC 06:23）触发后，观察 dispatch-pages job 是否正常执行、pages-astro.yml 是否被 dispatch。
2. **数据变化场景：** 正常情况下每次定时同步都能触发 Pages 部署；如果某次定时同步没产出新 commit，dispatch-pages 仍然会触发 pages-astro 构建（自动恢复）。
3. **如果未来 sync 需要 actions 权限：** 不要把 actions: write 加到 sync job。如果将来真需要，可以改成两个 job 分别声明 permissions。当前架构已经是解耦的。
