# AI Tool Map 数据核验报告（TOOL-MAP-VERIFY）

> 由 `scripts/build_tool_map.py` 生成于 2026-11-04T07:00:04Z；输入：catalog.csv / live_multi.json / evaluations/index.json。

## 数量统计

| 指标 | 数值 |
|---|---|
| 目录记录数（除表头） | 193 |
| 有效 GitHub 项目数 | 193 |
| 去重后工具数 | 193 |
| 成功生成地图节点数 | 193 |
| 有可靠关系的工具数 | 44 |
| 关系总数 | 27 |
| 已验证关系（verified） | 0 |
| 文档支持关系（documented） | 22 |
| 推断关系（inferred） | 5 |
| 证据不足关系（unverified，已剔除） | 0 |
| 已有评测报告的工具数 | 5 |

## 关系类型分布

| 类型 | 数量 |
|---|---|
| alternative | 22 |
| complementary | 5 |

## 校验结果

- 无效仓库地址行：0
- 重复节点：0
- 失效关系（已剔除）：0

## 说明

- 节点数 = 去重后有效工具数；关系只保留两端节点存在且类型/证据合法的条目。
- `inferred` 关系在前端默认弱化展示，`unverified` 不进入生成结果。
- 评测/Stars 等字段为空即如实缺省，不造数。
