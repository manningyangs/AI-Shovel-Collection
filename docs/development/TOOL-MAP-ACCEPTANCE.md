# AI Tool Map 验收报告（TOOL-MAP-ACCEPTANCE）

> 阶段 5 交付物。验收时间：2026-11-04。
> 关联文档：[TOOL-MAP-BASELINE.md](./TOOL-MAP-BASELINE.md)（阶段0） · [TOOL-MAP-VERIFY.md](./TOOL-MAP-VERIFY.md)（阶段2 数据核验）

## 1. 交付清单（任务书 §16）

| # | 交付项 | 状态 | 证据 |
|---|---|---|---|
| 1 | 可独立访问的地图页面 | ✅ | `https://manningyangs.github.io/AI-Shovel-Collection/tool-map/` HTTP 200；直刷/直链无 404（本地与线上均验证） |
| 2 | 首页新增地图入口 + 导航入口 | ✅ | 首页 HTML 含 3 处 `tool-map/` 链接（桌面 nav `🗺️ 地图`、移动菜单、预览 CTA） |
| 3 | 静态 JSON 地图数据 | ✅ | `astro/public/data/tool-map.json`（147 KB，线上 200：193 节点 / 27 关系 / 17 能力域） |
| 4 | 构建脚本与数据校验 | ✅ | [scripts/build_tool_map.py](file:///e:/desktop/AI-Shovel-Collection/repo/scripts/build_tool_map.py)：无效 URL/重复节点/失效关系全 0；报告见 TOOL-MAP-VERIFY.md |
| 5 | 搜索、分类、关系过滤、节点详情 | ✅ | 浏览器实测：搜索 "playwright" 193→2 节点；能力域复选 193→12；节点点击右侧详情含"查看完整工具详情" |
| 6 | 关系连线、类型、图例、证据 | ✅ | 4 类颜色/线型（蓝实/绿实/紫虚/橙虚）+ 图例；hover 显示关系说明；点边弹证据浮层（27 条边实测）；证据等级徽章 |
| 7 | 移动端适配 | ✅ | `scrollWidth 623 ≤ innerWidth 638`（首页与地图页均无横向溢出）；☰ 抽屉、节点→底部面板 `.tm-right.open` 实测开合 |
| 8 | 不破坏现有工具目录、评测系统、首页 | ✅ | 首页回归：搜索 #count 193条→输入PPT→清空恢复、tabs/nav/Trending/评测 链接齐全、`/evaluate/` 200、控制台零报错 |
| 9 | GitHub Pages 线上部署验证 | ✅ | Actions `Deploy Astro site to GitHub Pages` run 41795311242 conclusion=success；线上 4 URL 全 200 |
| 10 | 全部开发文档 | ✅ | TOOL-MAP-BASELINE / TOOL-MAP-VERIFY / TOOL-MAP-ACCEPTANCE 三份 |

## 2. 地图数据核验（不虚构承诺）

- 节点数 **193 = 有效 GitHub 数 = 去重数**（无无法映射、无重复、无假 ID）
- 关系 **27**：`documented 22`（同平台/同功能替代，证据=双方官方仓库）+ `inferred 5`（互补工作流推断，前端弱化虚线展示）+ `verified 0` + `unverified 0`（失效关系在生成阶段剔除，实时剔除数 0）
- 关系类型：`alternative 22` / `complementary 5` / `integration 0` / `protocol 0`（第一版如实为 0，Phase 2 待官方文档核实后补充）
- 已有评测报告的工具 5 个（评测分数/等级真实关联 evaluations/index.json）
- 未生成关系的 166 个工具如实显示为独立节点（详情面板明示"独立节点也是地图的一部分"）

## 3. 测试记录

### 3.1 地图桌面端（浏览器实测，9 项全过）

页面加载 193 节点零报错 → 搜索过滤 → 能力域过滤 → 关系类型过滤（27→5）→ 节点详情+上下游高亮弱化 → 关系 ⓘ 浮层 → 点边浮层 → 重置视图清状态 → 缩放稳定。修复记录：初版"重置视图"未清选中态与浮层，已修复并复测通过。

### 3.2 首页回归（浏览器实测）

导航三项入口齐全；预览横幅渲染 **193 个真实点位 SVG**（client:visible 懒加载，JS 仅 2.9 KB）；搜索/计数/tabs/评测区块无回归；控制台零报错。

### 3.3 移动端（≤768px 媒体查询）

首页与地图页均无横向溢出；筛选抽屉开/关与遮罩关闭正常（合成点击多轮验证）；点击节点底部面板 `.tm-right.open` 正常（真实点击）。说明：测试环境浏览器窗口尺寸波动（461↔638 宽、高 310），点击工具出现过坐标定位偏差（事件日志显示点击落在相邻按钮），经逐层插桩确认为**自动化工具定位问题而非页面缺陷**（DOM 命中测试与合成事件均正确）。

### 3.4 已知限制（如实记录）

1. **首页 CTA 在极小视口（<450px 高）可能被吸顶工具条覆盖**：首页 `.toolbar` 为既有 sticky（z-60，chips 展开态高约 388px），属既有首页行为；正常视口（≥667 高）滚动即可露出，且常驻 nav `🗺️ 地图` 入口不受影响。
2. `integration` / `protocol` 关系第一版为 0 —— 未找到目录内工具间的可核实铁证，宁缺毋滥，Phase 2 补充。

## 4. 产物体积（可接受）

| 产物 | 体积 | 加载范围 |
|---|---|---|
| `ToolMapApp.js`（React18 + React Flow） | 198.3 KB | 仅 `/tool-map/` |
| `ToolMapApp.css` | 26.6 KB | 仅 `/tool-map/` |
| `tool-map.json` | 147.4 KB | 仅 `/tool-map/`（按需 fetch） |
| 首页 `ToolMapPreview.js` | 2.9 KB | 首页，client:visible 进视口才水合 |
| 首页 HTML | 342 KB（新增点阵 props 约 6 KB） | — |

首页不加载 React Flow；无 React 依赖的页面产物不受影响（React 集成仅 `client:*` 指令组件引入）。

## 5. 现场与流程状态

- 保护 Tag：`backup-before-ai-tool-map-20261104` → `42ad848`（已推送）✅
- 开发分支：`feature/ai-tool-map`（阶段 1-4 提交全部在分支，阶段 5 测试通过后合入）✅
- 合入记录：`7edf7cb`（--no-ff 合并）+ `bb37316`（拉取远端实时数据同步 `d831b54` 后合并推送）
- main 部署：run 41795311242 success；本地构建 205 页 / sitemap 196 URL
- 未触碰：评测系统、工具目录逻辑、Actions workflow、既有首页功能代码（仅在 nav 与 main 顶部插入入口）

## 6. Phase 2 后续建议

1. 关系扩充：为 MCP 集成类工具核实 `integration` / `protocol` 证据（需官方文档逐条核实）
2. `annotations.json` 人工标注摘要与能力标签（当前空，脚本自动派生）
3. 关系按证据等级的展示开关精细化（verified 置顶）
4. 布局精调：`layout.json` 手动锚点微调（现为 17 集群确定性网格）
