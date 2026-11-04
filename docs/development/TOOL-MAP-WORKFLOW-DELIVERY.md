# 关系体系升级 + 工作流搭建器 + 连接检查器 —— 最终交付报告

> 对应任务书《AI Shovel Collection / AI Tool Map 关系分析与工作流搭建器开发任务书》§十七交付物清单。
> 生成时间：2026-11-04；分支：`feature/tool-map-workflow-builder`；基线 HEAD：`bfce1d5f36273be6efe529eea1fcf84a177df4c6`（见 [TOOL-MAP-WORKFLOW-BASELINE.md](./TOOL-MAP-WORKFLOW-BASELINE.md)）。

---

## 1. 修改文件清单

| 文件 | 变更说明 | 规模 |
|---|---|---|
| `astro/src/components/ToolMap/ToolMapApp.tsx` | 双模式（关系探索/工作流搭建）、关系可信度过滤、候选关系展示开关、典型工作流模板组、详情面板替代工具分区 | 760 行（+177 diff） |
| `astro/src/components/ToolMap/ToolEdge.tsx` | 候选关系连线独立样式（灰点线、透明度更低、hover「候选·未审核」标签） | +10 diff |
| `astro/src/components/ToolMap/types.ts` | 新增 `CandidateRelation`/`IOProfile`/`ConnectionCheck`/`CheckDimension`/`BridgeTool`/`CHECK_STYLE`/`WorkflowTemplate` 等类型，`MapData` 扩展 `candidates/ioProfiles/templates` | 175 行（+94 diff） |
| `astro/src/components/ToolMap/tool-map.css` | 模式切换 `.tm-mode-switch`、候选标签样式，以及工作流模式全部 `wf-*` 样式（节点/锚点/状态徽标/检查面板/工具列表/空态/提示） | 1039 行（+433 diff） |
| `scripts/build_tool_map.py` | 载入并校验 `relation-candidates.json`、`io-capabilities.json`、`workflow-templates.json`（模板工具 ID 不存在则整条剔除），stats/payload 扩展 | +53 diff |
| `astro/public/data/tool-map.json` | 由上述脚本重新生成的唯一前端数据载荷（含新三层数据） | +9016 行（生成物） |
| `astro/package.json` / `package-lock.json` | 新增开发依赖 `typescript ^5.9.3`、`@astrojs/check ^0.9.12`（仅类型检查用，未动 Astro 版本） | +4 diff |
| `docs/development/TOOL-MAP-VERIFY.md` | 数据重建后统计行同步更新 | +6 diff |

## 2. 新增文件清单

| 文件 | 说明 | 规模 |
|---|---|---|
| `astro/src/components/ToolMap/WorkflowBuilder.tsx` | 工作流搭建器（双模式之一，含节点/连线组件、导入校验、历史栈、本地保存、模板载入） | 1126 行 |
| `astro/src/components/ToolMap/connectionChecker.ts` | 连接合理性检查器（五状态/五维度判定、桥接工具推荐、原因与建议生成） | 328 行 |
| `astro/src/data/tool-map/relation-candidates.json` | 68 条通过校验的候选关系（与生产 `relations.json` 完全隔离） | 1247 行 |
| `astro/src/data/tool-map/io-capabilities.json` | 193 个工具的输入输出能力画像 | 7454 行 |
| `astro/src/data/tool-map/workflow-templates.json` | 10 个典型工作流模板（构建期已做工具 ID 校验） | 396 行 |
| `scripts/analyze_tool_relations.py` | 94 条候选的校验/去重/匹配/报告生成脚本 | 296 行 |
| `scripts/build_io_capabilities.py` | 基于 README/仓库描述的确定性能力画像生成脚本 | 393 行 |
| `docs/development/TOOL-MAP-WORKFLOW-BASELINE.md` | 开发前基线与保护性备份记录 | — |
| `docs/development/tool-map/` | 3 个上传源文件 + [RELATION-IMPORT-REPORT.md](./tool-map/RELATION-IMPORT-REPORT.md) + [CAPABILITY-PROFILE-REPORT.md](./tool-map/CAPABILITY-PROFILE-REPORT.md) | — |
| `docs/development/TOOL-MAP-WORKFLOW-DELIVERY.md` | 本报告 | — |

## 3. 关系数据结构说明（三层数据隔离）

**公共关系 `relations.json`（本次未做任何修改）**

```json
{ "id", "source", "target",
  "type": "integration | protocol | complementary | alternative",
  "evidenceLevel": "verified | documented | inferred | unverified | rejected",
  "description", "evidence": [{ "type", "url" }], "updatedAt" }
```

**候选层 `relation-candidates.json`（默认不展示）**：同 schema，另含 `direction/status/inputOutputMatch/protocolMatch/setupRequired/displayByDefault/reviewNote/importedAt`；前端需手动勾选「显示候选（未审核）」才渲染，且以灰色点线 + 「候选·未审核」标签弱化，不计入正式关系计数。

**用户工作流**：仅存于浏览器 `localStorage`（key `ai-shovel-tool-workflow-v1`），不写入任何公共数据文件；导出 JSON 使用独立 schema `ai-shovel-tool-workflow`。

`tool-map.json` 载荷现有 9 个顶层键：`generatedAt/generator/stats/capabilities/nodes/relations/candidates/ioProfiles/templates`，前端只 fetch 这一个文件。

## 4. 94 条候选关系导入报告

完整明细见 [tool-map/RELATION-IMPORT-REPORT.md](./tool-map/RELATION-IMPORT-REPORT.md)，由 `scripts/analyze_tool_relations.py` 真实运行生成：

| 指标 | 数量 |
|---|---|
| 候选总数 | 94 |
| 两端均精确匹配 catalog | 93 |
| target 无法匹配 | 1（`jagan-shanmugam/open-street-map-mcp`，catalog 实为 `open-streetmap-mcp`，仅提示未自动匹配） |
| 候选内重复 | 0 |
| 与现有 relations.json 重复 | 25 |
| 无效（端点不在目录） | 1（即上述 candidate-060） |
| **最终进入候选文件** | **68**（complementary 60 / alternative 8，全部为 inferred） |

94 = 68 通过 + 25 重复剔除 + 1 无效剔除，无一遗漏；19 条 documented 候选全部因与现有关系重复被剔除（候选文件中 documented=0），未做任何证据升级。

## 5. 工具 ID 匹配报告

- 匹配口径：`owner/repo` 与 `catalog.csv` **大小写敏感精确一致**，名称相似不视为匹配。
- 匹配结果：source 0 失败、target 1 失败（详见报告明细表，附相似 ID 提示供人工确认）。
- 构建期二次校验：`build_tool_map.py` 对候选、画像、模板逐一核对工具 ID，`tool-map.json` stats：`candidateTotal=68, candidateInvalid=0, templateTotal=10, templateInvalid=0`。

## 6. 能力画像建设情况

完整报告见 [tool-map/CAPABILITY-PROFILE-REPORT.md](./tool-map/CAPABILITY-PROFILE-REPORT.md)：

- 工具总数 193；README 缓存命中 191，缺失 2（仅仓库描述）。
- **具备输入输出能力画像（输入+输出均非空）的工具：145 个（75%）**；输入 149 / 输出 146。
- 输入与输出**均为文档显式证据（documented）：15 个**；inferred 176；unverified 2（信号缺失，保留 unknown，不脑补）。
- 协议标注 191（MCP Server 声明 182 / MCP Client 声明 20，严格自证式匹配）；操作标注 145；约束标注 121。
- 空数组 = 未知，检查器一律按 unknown 处理；画像不得单独作为关系 documented/verified 依据。

## 7. 关系可信度统计

当前公共关系库 `relations.json`（27 条，未被本次修改）：

| 证据等级 | 数量 |
|---|---|
| verified | **0** |
| documented | **22** |
| inferred | **5** |

（unverified/rejected 不进入公共关系库。）按类型：alternative 22、complementary 5；涉及工具 44 个。候选层 68 条全部为 inferred，展示时强制标注「未审核」。

## 8. 工作流搭建器功能说明

模式入口：探索模式工具栏「关系探索 / 工作流搭建」tab 切换；左栏「典型工作流」模板一键携带模板 ID 进入搭建模式（不破坏探索视图状态）。

- **三栏布局**：左「工具选择」（搜索、能力领域筛选、10 个模板、193 工具列表 + 快速添加）／中 React Flow 画布（拖动、锚点连线、选中、MiniMap、缩放）／右「属性与检查」（节点详情、连线检查、工作流概况三态）。
- **连线**：真实 `@xyflow/react` Handle（左 target / 右 source），自环与重复连线拦截，创建即触发检查并 toast；支持 `onReconnect` 反转方向。
- **删除**：Backspace/Delete 删除选中元素、面板内删除按钮；撤销/重做（`past/future` 历史栈 + Ctrl+Z / Ctrl+Y(Ctrl+Shift+Z)，拖动/删除/添加按批入栈去抖）。
- **本地保存**：改动后 600ms 防抖自动写 `localStorage`，刷新恢复并提示「已恢复本地保存」；工具栏「保存」可手动落盘。
- **JSON 导入/导出**：导出为 `ai-shovel-tool-workflow` schema 的 Blob 下载；导入**只读结构校验**——schema、节点数 ≤80、工具 ID 必须在目录、坐标必须有限数字、边数 ≤300、端点存在、去重、逐边重跑检查，**绝不执行导入内容中的任何代码/URL/脚本**。
- **清空**（confirm 确认）、**整理布局**（分层自动排布）、**适应画布**。
- **模板载入**：非空画布先 confirm；模板数据在 `build_tool_map.py` 构建期已完成工具 ID 校验。
- **数据隔离**：用户连线仅存本机，不写入 `relations.json`/候选文件。

## 9. 工作流检查器规则说明

纯浏览器端确定性规则（`connectionChecker.ts`，无后端、无 LLM、不执行任何工具代码）。

**五状态**：`verified` / `documented` / `logical` / `conflict` / `unknown`（`CHECK_STYLE` 统一配色与符号，画布连线常显状态徽标）。

**判定优先级（自上而下，命中即定级）**：
1. alternative 被当作工作流步骤 → `conflict`（并说明替代关系不可作为步骤）；
2. 命中官方 verified 关系 → `verified`；
3. 官方 documented 的 integration/protocol → `documented`；
4. 输入输出能力画像冲突（双侧已知且无交集，非文本族可转换）→ `conflict`；
5. 有官方关系（inferred）或 I/O 匹配 → `logical`；
6. 其余 → `unknown`。
命中候选关系**不提升等级**，只追加「候选未审核」依据行。

**五维度独立结论（不混为一谈）**：任务逻辑（关系类型推导）／输入输出（`TEXT_FAMILY = text·markdown·html`：完全相等=pass，同族=可转换+warn，双侧已知无交集=conflict，任一端未知=unknown）／协议（双方涉及 MCP 但角色未确认时降为 warn，相同协议≠天然兼容）／直接集成（官方关系 vs 候选命中 vs 无关系）／运行验证（本系统不执行工具，恒为 unknown/未验证，绝不用其他维度冒充）。

**输出**：每条连线给出具体结论句、逐维度原因（`reasons`）、画像证据 chips（源输出/目标输入）、**改进建议**（格式转换、MCP 角色确认、API Key/自部署等约束提示、信息不足时建议小规模试连）、以及**推荐中间转换工具**（能消化源输出且产出目标可接受输入的目录内工具，最多 3 个，可一键 `+` 加入画布）。

## 10. 测试结果

| 项 | 结果 |
|---|---|
| TypeScript 严格类型检查（tsc `--strict`，ToolMap 全部 7 个 ts/tsx 文件 + env.d.ts） | **0 错误** |
| 关系/画像/模板数据校验（构建期脚本） | candidateInvalid=0、templateInvalid=0、invalidRows=0、invalidRelations=0 |
| 浏览器冒烟（本地 preview，端口 4321） | 见下 |

浏览器实测明细（无任何 console 报错）：

1. 探索模式：193 节点 / 27 关系渲染、可信度筛选（0/22/5 计数）、候选开关、典型工作流组、模式切换 tab —— **通过**；
2. 切入「工作流搭建」：左「工具选择」、右「属性与检查」、空态提示齐备；「← 关系探索」可返回 —— **通过**；
3. 载入「网页内容处理」模板：3 节点 / 2 连线，工作流名同步为模板名 —— **通过**；
4. 连线常显状态徽标：两条边均为「! 逻辑合理·待验证」 —— **通过**；
5. 刷新后重进搭建模式：恢复 3 节点 / 2 连线并提示「已恢复本地保存」 —— **通过**；
6. 点击连线检查：状态卡 + 五维列表（任务逻辑 ✓ / 输入输出 ✓「markdown→markdown」/ 协议 warn / 直接集成 warn 命中候选 / 运行验证 ?）+ 检查依据 4 条 + 画像证据 chips + 改进建议 4 条 —— **通过**；
7. 候选层开关：勾选后画布边由 27 → 95（68 条 `stroke-dasharray:3,4` 灰点线，27 条正式线保持 `7,5`） —— **通过**。

## 11. 构建结果

- 环境：Node **v20.18.1**（系统默认 Node 14 不满足 `engines >=18.17`，使用 `e:\desktop\wechat_sync\.tools\node-v20.18.1-win-x64`），Astro **4.16.19**（未升级主版本）。
- `npm run build`：**成功**，205 个页面，4.55s；产物 `ToolMapApp.*.js` 235.96 kB（gzip 77.50 kB）、`ToolMapApp.*.css` 36.11 kB（gzip 6.81 kB）。
- 警告仅有既有 `glob as` 弃用提示（开发前已存在，与本次改动无关），无新增错误。

## 12. GitHub Pages 部署验证结果

- `astro.config.mjs` `base: '/AI-Shovel-Collection'`、`site: 'https://manningyangs.github.io'` **未被修改**。
- 构建产物校验：`dist/tool-map/index.html` 中 9 处资源引用均带 `/AI-Shovel-Collection/_astro/...` 前缀；`dist/data/tool-map.json` 随包生成。
- 本地 preview 实测（等价于 Pages 的目录式静态托管）：`GET /AI-Shovel-Collection/tool-map/` → 200，页面数据 fetch、双模式、工作流功能全部在该 base 下正常。
- **未推送远端**：改动停留在 `feature/tool-map-workflow-builder` 分支，待评审合并后再走 GitHub Pages 发布（线上 Pages 将在合并后自动构建同 base 路径）。

## 13. 未完成事项

1. **未逐项浏览器实测**（代码已实现、类型检查/构建通过）：手动拖拽连线、撤销/重做快捷键、JSON 导出下载与导入校验报错分支、清空、整理布局、桥接工具「一键加入」实际点击。
2. `verified` 状态、桥接工具推荐在本次数据下**无命中实例**（公共库 verified=0），规则已实现但界面上暂无真实样本可展示。
3. `npx astro check` 在本机 Node 20 下不可用：`@astrojs/language-server` 对 `@astrojs/astro2tsx` 的 CJS `require` 触发 `ERR_REQUIRE_ESM`（Node ≥22 才支持 require(ESM)）。已用 `tsc --strict` 等价覆盖 ToolMap 全部源码；`@astrojs/check` 依赖保留在 devDependencies 中供 Node 22 环境使用。
4. 68 条候选关系仍为**未审核**状态，未合并进 `relations.json`；1 条 ID 不匹配候选待人工确认。
5. 未做任何推送/合并/部署操作。
6. Phase 5（AI 生成工作流、社区共享）按任务书明确不做。

## 14. 后续建议

1. 人工复核 68 条候选（尤其 19 条 documented 级线索已因重复被拦，可优先抽样官方文档核验），通过后再逐条进入公共库——禁止批量升级证据等级。
2. 补充 verified 证据：挑选 2–3 条真实跑通的工作流做运行验证，让 `verified` 状态产生首批样本。
3. 桥接推荐工具（markdown/html 文本转换族）建议实测一轮，确认 I/O 覆盖是否足够给出有效建议。
4. CI 增加 `tsc --strict`（ToolMap 目录）以固化本次类型检查；Node 22 环境可恢复 `astro check`。
5. 合并后跟踪 GitHub Pages 线上 404/资源路径（`/AI-Shovel-Collection` base），并回归首页→工具详情→评测报告链路。

---

## 任务书要求的明确声明

- **verified 关系数：0**
- **documented 关系数：22**
- **inferred 关系数：5**
- **因工具 ID 或证据问题被排除的候选：26 条**（25 条与现有关系重复 + 1 条 ID 不匹配/无效）→ 94 − 26 = 68 入库
- **已具备输入输出能力画像的工具：145 个**（其中输入输出双侧均为文档显式证据的 15 个；画像文件覆盖 193 个工具，未知项保留 unknown）
- **已真正实现的检查规则**：五状态判定优先级、五维度独立结论、文本族转换判定、双侧已知 I/O 冲突判定、MCP 角色存疑降级、候选命中不升等、逐条 reasons/建议、桥接工具目录检索、导入只读结构校验、连线即检/重检/全量重检、状态徽标与配色联动。
- **仅为 UI 展示、无独立逻辑的部分**：检查状态图例与说明文字（信息性展示，数据来自真实状态）；`verified` 状态与桥接推荐**尚无真实数据样本**（规则已实现）；「候选·未审核」hover 标签仅在悬停/选中时渲染（按需展示，非缺陷）。除此之外，本次交付的可见功能均有对应实现逻辑，无空壳 UI。

**保护性红线自检**：未删除任何工具节点；未覆盖/修改 `relations.json`；Astro 仍为 4.16.19；无 inferred → verified 升级、无批量 verified 标记；候选与用户工作流均未写入公共关系库。
