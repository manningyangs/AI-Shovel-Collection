# AI Tool Map 工作流搭建器开发前基线（TOOL-MAP-WORKFLOW-BASELINE）

> 本次改造（关系体系升级 + 工作流搭建器 + 连接合理性检查）的开发前基线记录。生成时间：2026-11-04，仓库根：`repo/`。

## 1. 当前项目状态（现场保护）

| 项目 | 值 |
|---|---|
| 基线 HEAD Commit | `bfce1d5f36273be6efe529eea1fcf84a177df4c6`（feat(tool-map): 首页地图入口移至评测报告下方/工具分类上方） |
| 工作区状态 | clean（`git status`: nothing to commit），无未提交修改 |
| 基线分支 | `main`，与 `origin/main` 同步 |
| 本次开发分支 | `feature/tool-map-workflow-builder`（自 main 创建） |
| 保护 Tag | `backup/before-workflow-builder` → 基线 HEAD（另有既有 tag `backup-before-ai-tool-map-20261104`） |
| 远端仓库 | `origin https://github.com/manningyangs/AI-Shovel-Collection.git` |
| GitHub Pages | 仅 push 到 main 触发 `pages-astro.yml`；本分支合并前不影响线上 |

恢复方式：`git checkout main`（回原状）；或 `git checkout backup/before-workflow-builder`（回基线代码）。工作区全程无需要 stash 的修改。

## 2. 当前地图功能（关系探索，已实现）

- 页面：`astro/src/pages/tool-map.astro` → `ToolMapApp`（`client:only="react"`，仅本页加载 React Flow）。
- 节点展示（193 个工具，按能力领域聚类布局）、搜索、能力/语言/评测/Stars 过滤。
- 关系连线（四类：integration / protocol / complementary / alternative，颜色线型见 `types.ts` REL_STYLE）。
- 关系类型过滤、推断（inferred）关系弱化显示、关系证据浮层（点击连线看 description + evidence URL）。
- 节点详情（右栏）、上下游关系列表、只看相关网络、MiniMap / Controls / 全屏、移动端抽屉与底部面板。
- 首页入口与 `ToolMapPreview` 点阵预览（`client:visible`）。

尚无：双模式切换、工作流画布、用户自定义连线、撤销重做、本地保存/导入导出、连接合理性检查器、候选关系展示层。

## 3. 当前数据文件

| 文件 | 说明 |
|---|---|
| `astro/public/catalog.csv`（根 `catalog.csv` 镜像） | 权威工具目录，193 行有效、无重复；字段：分类/铲子名称/GitHub仓库链接；ID = URL 提取 `owner/repo` |
| `astro/src/data/tool-map/relations.json` | 生产关系库：27 条（alternative 22 / complementary 5；documented 22 / inferred 5；verified 0）。schema：`{id, source, target, type, evidenceLevel, description, evidence:[{type,url}], updatedAt}` |
| `astro/src/data/tool-map/capabilities.json` | 17 个能力领域定义（与 catalog 分类一一对应） |
| `astro/src/data/tool-map/annotations.json` / `layout.json` | 节点标注 / 布局锚点 |
| `astro/public/data/tool-map.json` | `scripts/build_tool_map.py` 生成物：nodes + relations + stats，前端唯一 fetch 来源 |
| `docs/development/tool-map/` | 本次导入的 94 条候选源文件 + `RELATION-IMPORT-REPORT.md` |
| `astro/src/data/tool-map/relation-candidates.json` | 校验后的候选关系（与生产关系库隔离，displayByDefault=false） |

关键事实（`TOOL-MAP-VERIFY.md` 实测）：193 目录记录 → 193 有效仓库 → 193 去重节点，0 无效行、0 重复、0 失效关系。

## 4. 依赖版本

| 依赖 | 版本 |
|---|---|
| astro | 4.16.19（不得擅自升级主版本） |
| @astrojs/react | ^3.6.3 |
| react / react-dom | ^18.3.1 |
| @xyflow/react | ^12.12.1 |
| Node（构建用） | v20.18.1（`e:\desktop\wechat_sync\.tools\node-v20.18.1-win-x64`；系统 PATH 默认 Node 14 不满足 engines >=18.17） |
| Python（脚本用） | 3.12.10（`py` 启动器） |

npm scripts：`dev` / `build` / `preview` / `astro`（无独立 lint/typecheck 脚本，以 `astro build` 内置检查为准）。站点 `base: '/AI-Shovel-Collection'`，所有静态 JSON 用 `import.meta.env.BASE_URL` 拼接。

## 5. 本次准备修改的文件

**新增：**

- `scripts/analyze_tool_relations.py` — 候选导入校验（已创建）
- `astro/src/data/tool-map/relation-candidates.json` — 候选关系数据（已生成）
- `docs/development/tool-map/*` — 候选源文件与导入报告（已生成）
- `astro/src/data/tool-map/io-capabilities.json` — 工具输入输出能力画像（待建）
- `astro/src/components/ToolMap/WorkflowBuilder.*` / `ConnectionChecker.*` — 工作流画布与检查器（待建）
- `docs/development/TOOL-MAP-WORKFLOW-ACCEPTANCE.md` — 最终交付报告（待建）

**修改：**

- `scripts/build_tool_map.py` — 附加候选关系层 + 能力画像进生成物
- `astro/src/components/ToolMap/ToolMapApp.tsx` — 增加模式切换、关系过滤增强（不删现有能力）
- `astro/src/components/ToolMap/types.ts` — 扩展候选/检查结果类型
- `astro/src/components/ToolMap/tool-map.css` — 双模式与检查器样式
- `astro/src/pages/tool-map.astro` — 无必要则不动（组件内部改造）

**禁止改动：** `relations.json` 只读追加式审核（本次不覆盖）、catalog、首页布局、Astro 主版本。

## 6. 数据隔离约定（本次沿用任务书 §九）

- 公共关系：`relations.json`（正式）；候选：`relation-candidates.json`（默认不作公共事实展示）；用户工作流：localStorage，独立 key，绝不写入公共关系库。
