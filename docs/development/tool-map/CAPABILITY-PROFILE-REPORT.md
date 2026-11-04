# 工具能力画像建设报告（CAPABILITY-PROFILE-REPORT）

> 由 `scripts/build_io_capabilities.py` 生成于 2026-11-04T08:47:14Z；来源：官方 README（raw.githubusercontent.com）+ 仓库描述（live_multi.json）。README 缓存：`../_cache/readme/`（仓库外）。

## 覆盖统计

| 指标 | 数量 | 占比 |
|---|---|---|
| 工具总数 | 193 | 100% |
| README 抓取成功（本次新抓） | 0 | 0% |
| README 缓存命中 | 191 | — |
| README 缺失（仅仓库描述可用） | 2 | 1% |
| 具备输入画像 | 149 | 77% |
| 具备输出画像 | 146 | 76% |
| 输入+输出均具备 | 145 | 75% |
| 输入+输出均为文档显式证据 | 15 | 8% |
| 具备协议标注 | 191 | 99% |
| 具备操作标注 | 145 | 75% |
| 具备约束标注 | 121 | 63% |

## 证据等级分布

| 等级 | 数量 | 判定条件 |
|---|---|---|
| documented | 15 | 输入与输出均有 I/O 动词上下文的显式命中 |
| inferred | 176 | 仅单侧显式，或仅操作规则派生 |
| unverified | 2 | 无任何有效信号（无 README 且描述无信息） |

## 协议侧写

- MCP Server 声明（严格搭配）：182
- MCP Client 声明（严格搭配）：20

## 规则说明与限制

- 严格搭配：token 必须与 input/output 动词（accept/parse/read/input/return/generate/convert…）同行且 ≤60 字符，避免 README 顺带提及造成虚报。
- `explicitInputs/explicitOutputs` = 文档显式证据；`OP_IO` 操作派生部分为 inferred。
- 空 `inputs/outputs` = 未知，前端检查器必须按 unknown 处理，不得当作兼容或冲突。
- 画像只服务于连线检查提示，不能单独作为关系 documented/verified 的依据。
- 词表/规则全部在脚本内可复核；重新运行脚本可复现（README 缓存命中则不重复联网）。
