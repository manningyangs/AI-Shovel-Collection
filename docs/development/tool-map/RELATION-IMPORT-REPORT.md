# 94 条关系候选导入报告（RELATION-IMPORT-REPORT）

> 由 `scripts/analyze_tool_relations.py` 生成于 2026-11-04T08:29:39Z；输入：`docs/development/tool-map/ai-shovel-tool-relationship-candidates.json` + `astro/public/catalog.csv`；输出：`astro/src/data/tool-map/relation-candidates.json`。生产关系库 `relations.json` 未被修改。

## 总量统计

| 指标 | 数量 |
|---|---|
| 候选关系总数 | 94 |
| 两端均成功匹配 catalog（精确 owner/repo） | 93 |
| source 无法匹配 | 0 |
| target 无法匹配 | 1 |
| 候选内部重复（同无序端点对，多余条目） | 0 |
| 与现有 relations.json 重复 | 25 |
| 无效关系（自环/非法类型/非法证据/端点缺失） | 1 |
| **最终进入候选文件** | **68** |

## 候选构成（总数内）

| 维度 | 数量 |
|---|---|
| 替代关系（alternative） | 31 |
| 互补关系（complementary） | 63 |
| documented 候选 | 19 |
| inferred 候选 | 75 |
| 进入候选文件的关系涉及工具数 | 99 |

## 分类口径

- 匹配 = 候选 source/target 与 catalog.csv 解析出的 `owner/repo` **精确一致**（大小写敏感）；名称相似不视为匹配。
- 重复：同一无序端点对在候选内出现多次，仅保留首条；与 `relations.json` 已有端点对相同的不再进入候选。
- 无效：自环、关系类型不属 {integration, protocol, complementary, alternative}、证据等级不属 {verified, documented, inferred, unverified}、任一端点缺失。
- 候选文件保持原始 evidenceLevel，未做任何升级；documented 候选在进入生产关系库前仍需重新核验官方 README。

## source 无法匹配明细

（无）

## target 无法匹配明细

| id | target | similar |
|---|---|---|
| candidate-060 | jagan-shanmugam/open-street-map-mcp | 同 owner 相似 ID → jagan-shanmugam/open-streetmap-mcp（需人工确认，未自动匹配） |

## 候选内部重复明细

（无）

## 与现有关系重复明细

| id | type | pair |
|---|---|---|
| candidate-001 | alternative | microsoft/playwright-mcp ↔ BrowserMCP/mcp |
| candidate-002 | alternative | microsoft/playwright-mcp ↔ jae-jae/fetcher-mcp |
| candidate-003 | alternative | firecrawl/firecrawl-mcp-server ↔ apify/apify-mcp-server |
| candidate-004 | alternative | firecrawl/firecrawl-mcp-server ↔ brightdata/brightdata-mcp |
| candidate-005 | alternative | apify/apify-mcp-server ↔ brightdata/brightdata-mcp |
| candidate-006 | alternative | danielkennedy1/pdf-tools-mcp ↔ gpetraroli/mcp_pdf_reader |
| candidate-007 | alternative | motherduckdb/mcp-server-motherduck ↔ ktanaka101/mcp-server-duckdb |
| candidate-008 | alternative | github/github-mcp-server ↔ idosal/git-mcp |
| candidate-009 | alternative | yuque/yuque-mcp-server ↔ yehuoshun/yuque-ai-mcp |
| candidate-010 | alternative | yuque/yuque-mcp-server ↔ yuque/yuque-ecosystem |
| candidate-011 | alternative | ztxtxwd/open-feishu-mcp-server ↔ larksuite/lark-openapi-mcp |
| candidate-012 | alternative | gotoolkits/mcp-wecombot-server ↔ loonghao/wecom-bot-mcp-server |
| candidate-013 | alternative | CoplayDev/unity-mcp ↔ quazaai/UnityMCPIntegration |
| candidate-014 | alternative | CoplayDev/unity-mcp ↔ IvanMurzak/GameDev-MCP-Server |
| candidate-015 | alternative | GLips/Figma-Context-MCP ↔ grab/cursor-talk-to-figma-mcp |
| candidate-016 | alternative | antvis/mcp-server-chart ↔ hustcc/mcp-mermaid |
| candidate-017 | alternative | palewire/datawrapper-mcp ↔ hustcc/mcp-echarts |
| candidate-018 | alternative | hustcc/mcp-echarts ↔ isaacwasserman/mcp-vegalite-server |
| candidate-019 | alternative | automation-ai-labs/mcp-link ↔ tadata-org/fastapi_mcp |
| candidate-020 | alternative | HorizunGroup/horizun-revit-mcp ↔ zymorel/revit-mcp |
| candidate-021 | alternative | robotmcp/ros-mcp-server ↔ wise-vision/ros2_mcp |
| candidate-022 | alternative | tevonsb/homeassistant-mcp ↔ driin0/ha-mcp-server |
| candidate-023 | complementary | firecrawl/firecrawl-mcp-server ↔ Unstructured-IO/UNS-MCP |
| candidate-031 | complementary | github/github-mcp-server ↔ SonarSource/sonarqube-mcp-server |
| candidate-053 | complementary | tubeagentkit/youtube-mcp ↔ nabid-pf/youtube-video-summarizer-mcp |

## 无效关系明细

| id | problems |
|---|---|
| candidate-060 | ['端点不在 catalog'] |

## 进入候选文件的关系（按类型/证据）

- accepted by type: {'complementary': 60, 'alternative': 8}
- accepted by evidenceLevel: {'inferred': 68}

## 后续审核要求

1. documented 候选进入 `relations.json` 前必须重新核验官方文档证据 URL。
2. inferred 候选仅作工作流逻辑提示，禁止展示为真实集成。
3. alternative 不得作为工作流前后步骤的连接依据。
