# AI Tool Map 开发前基线报告（TOOL-MAP-BASELINE）

> 阶段 0 交付物。生成时间：2026-11-04，仓库根：`repo/`。

## 1. 现场保护状态

| 项目 | 值 |
|---|---|
| 当前 HEAD Commit | `42ad848578b71becd8b798bf5d02d022557a5bf1`（chore(security): 全局忽略私钥/密钥/环境变量文件） |
| 保护 Tag | `backup-before-ai-tool-map-20261104` |
| Tag 类型 | annotated，Tag object `714b593c9fc1f91fa0f1b1600adec7fe505e44dc` → HEAD `42ad848` |
| Tag 远端状态 | 已推送 origin ✓ |
| 开发分支 | `feature/ai-tool-map`（自 main 创建） |
| 工作区状态 | clean（`git status`: nothing to commit），无未提交修改需要额外保护 |
| 暂存区 | 空 |
| 远程仓库 | `origin https://github.com/manningyangs/AI-Shovel-Collection.git`，main 与 origin/main 同步 |
| GitHub Pages 部署状态 | main 最新提交已由 `pages-astro.yml` 部署，线上站点正常 |

最近提交记录（基线时点）：

```text
42ad848 chore(security): 全局忽略私钥/密钥/环境变量文件，防止未来误提交
a99577a chore: 同步实时数据 + trending 榜单
e5dda75 fix(web): 退出登录按钮文字不可见
6ffc476 🤖 AI Shovel Eval V1.0.1: publish WordPress-mcp-adapter-7358e571a6f7
d24508b fix(pages): 构建时把根 evaluations/ 权威数据同步进部署产物
```

## 2. 运行环境

| 项目 | 值 |
|---|---|
| Node（系统默认 PATH） | v14.15.3（不满足 engines >=18.17，构建须前置 Node 20） |
| Node（构建用） | v20.18.1（`e:\desktop\wechat_sync\.tools\node-v20.18.1-win-x64`） |
| npm scripts | `dev` / `build` / `preview` / `astro` |

## 3. Astro 版本与配置

- Astro **4.16.19**（`astro/package.json`，name: `astro-shovel-collection` v2.0.0，engines node >=18.17.0）
- 唯一运行时依赖：`astro`；**当前无 React / React DOM / @xyflow/react**
- 集成：仅自定义 `sitemapPlugin`（`src/scripts/sitemap.mjs`，因 @astrojs/sitemap v3 兼容问题替换）
- `astro.config.mjs`：`site: https://manningyangs.github.io`，`base: '/AI-Shovel-Collection'`，`output: 'static'`，`build.format: 'directory'`，dev server base 同步、port 4321

## 4. 当前首页组件结构（index.astro）

导航与内容均为 `src/pages/index.astro` 单文件内联（组件目录仅有 `EvaluationFeatured.astro`）：

- 导航：桌面 `.nav-links`（line 95–113）+ 移动折叠 `.nav-mobile-menu`（line 115–124）；当前项：首页 / 已收录 / 候选 / 领域检索 / Trending / 评测 / 提交收录 / hits 徽章 / GitHub
- 主体顺序：Hero+搜索框 → 任务分类 chips → 四组统计卡片 → Stars/趋势 Top 3 → 最新评测报告（`EvaluationFeatured`）→ 工具目录（`#tools` 筛选栏+卡片）→ 自动发现候选（`#candidates`）→ GitHub 实时搜索 → Footer（`.footer-links-v21`）
- 数据读取：`import.meta.glob('../../public/catalog.csv')`（raw）+ `../../public/live_multi.json`（json）+ `../../public/README.md`（领域检索表）+ 内联 `src/scripts/app.js`
- 详情页链接：`detailHref(slug) = /AI-Shovel-Collection/tools/{owner-repo 换 / 为 -}/`

## 5. 当前工具数据来源

| 数据 | 路径（双份镜像） | 职责 |
|---|---|---|
| 工具目录 | 根 `catalog.csv` ↔ `astro/public/catalog.csv` | 分类、名称、GitHub URL；slug = URL 去协议去 .git |
| 动态数据 | 根 `live_multi.json` ↔ `astro/public/live_multi.json` | `curated` 对象（key=owner/repo）：stars、lang、pushed_at、endpoint 等 |
| 评测索引 | `evaluations/index.json`（根，构建时同步进 dist） | 报告列表，当前 `total_reports: 7` |

数据质量核验（阶段 0 实测）：

- 目录记录数（除表头）：**193**
- 有效 GitHub 仓库地址：**193**
- 按 owner/repo 去重后：**193**（无重复）

## 6. 工具详情页路由

- 路由：`src/pages/tools/[slug].astro` → `/AI-Shovel-Collection/tools/{slug}/`
- `getStaticPaths`：解析 catalog.csv 每行，`slug = URL 去协议/.git 后把 / 换成 -`，`repoSlug`（owner/repo 原样）用于查 `live_multi.json`
- 因此地图节点主键 `owner/repo` → 详情页链接 = `owner/repo` 把 `/` 换 `-`，与首页 `detailHref` 一致

## 7. 当前 GitHub Actions 工作流

| Workflow | 触发 | 说明 |
|---|---|---|
| `pages-astro.yml` | push → main，paths：`astro/**`、`catalog.csv`、`live_multi.json`、`package*​.json`、`evaluations/**`、workflow 自身 | Astro 构建 → 同步 evaluations 进 dist → 部署 GitHub Pages；另有 Python 任务 |
| `live-data.yml` | cron `23 */6 * * *` + push（catalog.csv、scripts/update_live_data.py 等） | 多源实时数据 Pipeline，同步到 astro/public 并回写提交 |
| `evaluate-shovel.yml` | （Eval V2：workflow_dispatch + Worker 回调） | 八阶段评测、报告发布、显式触发 Pages 部署 |

**注意：Pages 仅由 push 到 main 触发**；`feature/ai-tool-map` 分支合并前不会触发线上部署。

## 8. 构建与部署验证结果

- 本地基线构建（Node v20.18.1，`npm run build`）：**成功**，`204 page(s) built in 2.98s`，`sitemap.xml: 196 URLs`
- 页面清单：`index` / `trending` / `evaluate` / `auth/callback` / `evaluations/[id]` / `tools/[slug]`（约 193 个详情页）
- 线上部署：main@`42ad848` 已部署 GitHub Pages，首页与 evaluate 页线上验证通过（前序任务 e2e）

## 9. 阶段 0 结论

- 现场已完整保护：工作区 clean + annotated tag 已推送 + 独立开发分支已创建。
- 现有架构与任务书一致点：Astro 4.16.19 SSG、base `/AI-Shovel-Collection`、静态 JSON 数据、无后端。
- 差异点（最小侵入处理）：
  1. 首页导航/主体内联在 `index.astro`，无独立 Nav 组件 → 预览组件新建于 `src/components/ToolMap/`，导航仅在 `index.astro` 两处插入一项。
  2. `astro/src/data/` 已存在（含 catalog.csv、live_multi.json 镜像）→ 地图数据放 `astro/src/data/tool-map/`，与镜像文件职责分离。
  3. 当前无 React 依赖 → 阶段 1 安装 `@astrojs/react` + React 18 + `@xyflow/react`，仅地图页 `client:only` 加载。
  4. 构建须使用 Node 20（本地 PATH 默认 Node 14）。
