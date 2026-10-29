# AI 铲子大全（AI Shovels）

> 面向 AI 大模型、Agent、MCP 客户端与自动化工作流的工具发现目录。目标是发现能让 AI **访问数据、操作软件、执行任务、转换文件、调用专业工具或完成行业工作**的开源项目。
>
> 维护方式：先收集、再分类、后核验。欢迎通过 Issue / Pull Request 补充仓库、纠正分类或标记失效项目。

- [按行业/领域检索 GitHub](#按行业领域检索-github)
- [已收录的铲子仓库](#已收录的铲子仓库)
- [上游目录与索引](#上游目录与索引)
- [收录与质量规则](#收录与质量规则)
- [贡献方式](#贡献方式)

## 目录说明

这里的“铲子”采用宽口径，不限于 MCP。可收录：

- **MCP Server / Client**：把软件、数据源或设备能力暴露给 AI。
- **Agent Skills / 插件 / 扩展**：给 Agent 增加专业流程、知识、脚本或软件内操作能力。
- **CLI / SDK / API 适配器**：适合 Agent 可靠调用的命令行工具、软件开发套件和接口桥接。
- **自动化工作流 / RPA / 桌面控制**：帮助 Agent 操作网页、桌面应用、业务系统或设备。
- **专业文件工具 / 数据工具**：PDF、Office、CAD、GIS、音视频、科研数据等解析、编辑和转换工具。

本清单是**持续维护的发现目录，不声称当前已经穷尽整个 GitHub**。GitHub 上相关仓库数量极大、每天都在变化；以下“GitHub 搜索”链接是按关键词生成的实时检索入口，可以查看最新结果和更多分页。被收录不代表项目安全、活跃、可商用或质量已经背书；使用前请自行检查许可证、维护状态、权限和数据安全。

## 按行业/领域检索 GitHub

点击“GitHub 搜索”可继续查找该领域与 MCP、Agent Skills、AI agent 工具相关的公开仓库。分类是工作目录，交叉领域的项目可能同时出现于多个类别。

| 领域 | GitHub 搜索入口 |
|---|---|
| AI Agent、MCP、Skills、插件与工具目录 | [MCP repositories](https://github.com/search?q=MCP&type=repositories) · [Agent Skills](https://github.com/search?q=agent+skills&type=repositories) · [AI agent tools](https://github.com/search?q=AI+agent+tools&type=repositories) |
| AI 基础设施、模型、推理、RAG、记忆与向量检索 | [GitHub 搜索](https://github.com/search?q=MCP+RAG+vector+memory+inference&type=repositories) |
| 软件开发、代码理解、IDE、Git、API、测试与 CI/CD | [GitHub 搜索](https://github.com/search?q=MCP+developer+tools+Git+IDE+testing+CI+CD&type=repositories) |
| 浏览器、网页自动化、网页抓取与搜索 | [GitHub 搜索](https://github.com/search?q=MCP+browser+automation+web+scraping+search&type=repositories) |
| 办公软件、Word、Excel、PowerPoint、PDF、电子签名 | [GitHub 搜索](https://github.com/search?q=MCP+Office+Excel+Word+PowerPoint+PDF&type=repositories) |
| 文件管理、OCR、文档解析、格式转换、知识库 | [GitHub 搜索](https://github.com/search?q=MCP+document+OCR+PDF+conversion&type=repositories) |
| 数据库、数据仓库、SQL、ETL、BI、报表与可视化 | [GitHub 搜索](https://github.com/search?q=MCP+database+SQL+analytics+BI&type=repositories) |
| 云平台、服务器、容器、DevOps、SRE、可观测性 | [GitHub 搜索](https://github.com/search?q=MCP+cloud+DevOps+Docker+Kubernetes+monitoring&type=repositories) |
| 邮件、即时通信、日历、会议、团队协作 | [GitHub 搜索](https://github.com/search?q=MCP+email+calendar+messaging+meeting&type=repositories) |
| 项目管理、任务、工单、知识管理与个人效率 | [GitHub 搜索](https://github.com/search?q=MCP+project+management+tasks+productivity&type=repositories) |
| 财务、会计、记账、发票、支付、银行与保险 | [GitHub 搜索](https://github.com/search?q=MCP+accounting+finance+invoice+payment+insurance&type=repositories) |
| 投资、股票、量化、加密资产与区块链 | [GitHub 搜索](https://github.com/search?q=MCP+stocks+trading+crypto+blockchain&type=repositories) |
| 企业管理、ERP、CRM、HRM、供应链与采购 | [GitHub 搜索](https://github.com/search?q=MCP+ERP+CRM+HRM+supply+chain+procurement&type=repositories) |
| 电商、零售、POS、商品、订单、库存与平台卖家 | [GitHub 搜索](https://github.com/search?q=MCP+ecommerce+retail+POS+inventory+orders&type=repositories) |
| 营销、SEO、广告、网站分析、增长与客户运营 | [GitHub 搜索](https://github.com/search?q=MCP+SEO+marketing+advertising+analytics&type=repositories) |
| 社交媒体、社群、内容分发与公众号/博客发布 | [GitHub 搜索](https://github.com/search?q=MCP+social+media+publishing+content&type=repositories) |
| 设计、UI/UX、Figma、设计系统与原型 | [GitHub 搜索](https://github.com/search?q=MCP+design+Figma+UI+UX&type=repositories) |
| 图片、视频、音频、字幕、语音与多媒体制作 | [GitHub 搜索](https://github.com/search?q=MCP+video+audio+image+media+editing&type=repositories) |
| CAD、3D、BIM、建筑、工程、施工与室内设计 | [GitHub 搜索](https://github.com/search?q=MCP+CAD+BIM+Revit+architecture+construction&type=repositories) |
| 电子设计自动化、PCB、芯片、嵌入式与硬件开发 | [GitHub 搜索](https://github.com/search?q=MCP+KiCad+EDA+PCB+embedded+hardware&type=repositories) |
| 制造业、工业软件、PLC、SCADA、OPC UA、MES 与设备维护 | [GitHub 搜索](https://github.com/search?q=MCP+industrial+PLC+SCADA+OPC+UA+manufacturing&type=repositories) |
| 机器人、ROS、无人机、自动驾驶与具身智能 | [GitHub 搜索](https://github.com/search?q=MCP+robotics+ROS+drone+autonomous&type=repositories) |
| 汽车、车载软件、CAN/OBD、诊断与车队管理 | [GitHub 搜索](https://github.com/search?q=MCP+automotive+CAN+OBD+vehicle+diagnostics&type=repositories) |
| 医疗、临床、医院信息系统、健康数据与医学影像 | [GitHub 搜索](https://github.com/search?q=MCP+healthcare+medical+FHIR+DICOM&type=repositories) |
| 生物信息、化学、制药、实验室、科研与论文 | [GitHub 搜索](https://github.com/search?q=MCP+bioinformatics+chemistry+laboratory+research&type=repositories) |
| 教育、教学、LMS、课程、学习与学术资源 | [GitHub 搜索](https://github.com/search?q=MCP+education+LMS+learning+course&type=repositories) |
| 法律、法规、合同、合规、专利与知识产权 | [GitHub 搜索](https://github.com/search?q=MCP+legal+law+contract+compliance+patent&type=repositories) |
| 政府、政务、公共数据、公共安全与城市服务 | [GitHub 搜索](https://github.com/search?q=MCP+government+civic+open+data&type=repositories) |
| 网络安全、渗透测试、漏洞、威胁情报、SIEM 与隐私 | [GitHub 搜索](https://github.com/search?q=MCP+cybersecurity+pentest+SIEM+threat+intelligence&type=repositories) |
| GIS、地图、遥感、测绘、地理空间与导航 | [GitHub 搜索](https://github.com/search?q=MCP+GIS+QGIS+geospatial+mapping&type=repositories) |
| 天气、气候、环境、碳排放、水务与自然资源 | [GitHub 搜索](https://github.com/search?q=MCP+weather+climate+environment+energy&type=repositories) |
| 农业、种植、畜牧、食品与农业科技 | [GitHub 搜索](https://github.com/search?q=MCP+agriculture+farming+crop+livestock&type=repositories) |
| 能源、电力、光伏、储能、楼宇与能源管理 | [GitHub 搜索](https://github.com/search?q=MCP+energy+electricity+solar+battery+building&type=repositories) |
| 物流、运输、仓储、快递、航运、航空与车队 | [GitHub 搜索](https://github.com/search?q=MCP+logistics+shipping+warehouse+fleet+aviation&type=repositories) |
| 酒店、餐饮、旅游、订票、外卖与服务业 | [GitHub 搜索](https://github.com/search?q=MCP+hospitality+restaurant+hotel+travel+booking&type=repositories) |
| 房地产、物业、建筑运维与空间资产 | [GitHub 搜索](https://github.com/search?q=MCP+real+estate+property+facility+management&type=repositories) |
| 招聘、简历、求职、绩效、排班与人力资源 | [GitHub 搜索](https://github.com/search?q=MCP+HR+recruiting+resume+payroll+jobs&type=repositories) |
| 智能家居、IoT、家庭自动化、网络设备与消费电子 | [GitHub 搜索](https://github.com/search?q=MCP+Home+Assistant+IoT+smart+home&type=repositories) |
| 游戏开发、Unity、Unreal、Godot 与游戏数据 | [GitHub 搜索](https://github.com/search?q=MCP+Unity+Unreal+Godot+game+development&type=repositories) |
| 无障碍、辅助技术、移动端、桌面操作系统与设备控制 | [GitHub 搜索](https://github.com/search?q=MCP+accessibility+assistive+technology+desktop+automation&type=repositories) |
| 翻译、本地化、语言、图书、档案、百科与知识检索 | [GitHub 搜索](https://github.com/search?q=MCP+translation+localization+library+archive&type=repositories) |
| 中国本土平台：飞书、语雀、钉钉、企微、微信生态、Gitee、国内电商 | [GitHub 搜索](https://github.com/search?q=MCP+飞书+语雀+钉钉+企微+微信+Gitee&type=repositories) |
| 专业垂直工具：营养、体育、影音库、收藏、博物馆等 | [GitHub 搜索](https://github.com/search?q=MCP+specialized+tools+domain&type=repositories) |

## 已收录的铲子仓库

以下是首轮检索的**种子目录**。名称优先写成“项目/铲子名称”，后面链接到 GitHub 仓库；多数项目属于 MCP，也包含 Agent Skills、CLI、行业索引或通用适配器。分类不是质量排名。机器可读清单见 [`catalog.csv`](catalog.csv)，字段为分类、铲子名称、GitHub 仓库链接。

### 1. 目录、Skills 与通用 AI 工具适配

- [Awesome MCP（自动更新的 MCP 目录）](https://github.com/abordage/awesome-mcp)
- [Awesome MCP Servers（MCP 服务器总目录）](https://github.com/mcpHQ/awesome-mcp-servers)
- [Anthropic Agent Skills（官方示例 Skills，含文档、设计、开发流程）](https://github.com/anthropics/skills)
- [Awesome Hardware Skills（硬件、工业、嵌入式 Agent 工具目录）](https://github.com/chopinfeng/awesome-hardware-skills)
- [Awesome AEC MCP（建筑、工程、施工、BIM、CAD 目录）](https://github.com/Daviidro/awesome-aec-mcp)
- [Geospatial MCP Servers（GIS、地图、遥感工具目录）](https://github.com/sparkgeo/geo-mcp-servers)
- [Awesome SEO MCP Servers（SEO、营销 Skills 与 MCP 目录）](https://github.com/sharozdawa/awesome-seo-mcp-servers)
- [MCP Reference Servers（MCP 协议参考实现）](https://github.com/modelcontextprotocol/servers)
- [FastMCP（构建 MCP Server/Client 的 Python 框架）](https://github.com/PrefectHQ/fastmcp)
- [OpenAPI to MCP（把 OpenAPI API 暴露为 MCP 工具）](https://github.com/automation-ai-labs/mcp-link)
- [FastAPI MCP（把 FastAPI 接口暴露给 MCP）](https://github.com/tadata-org/fastapi_mcp)
- [WordPress MCP Adapter（把 WordPress Abilities 暴露为 MCP）](https://github.com/WordPress/mcp-adapter)

### 2. 浏览器、网页检索、抓取与自动化

- [Playwright MCP（浏览器控制与网页自动化）](https://github.com/microsoft/playwright-mcp)
- [BrowserMCP（浏览器控制）](https://github.com/BrowserMCP/mcp)
- [Firecrawl MCP Server（网页抓取与搜索，输出适合 LLM 的内容）](https://github.com/firecrawl/firecrawl-mcp-server)
- [Apify MCP Server（网页抓取与数据提取）](https://github.com/apify/apify-mcp-server)
- [Bright Data MCP（网页数据访问与抓取）](https://github.com/brightdata/brightdata-mcp)
- [ScrapeGraphAI（AI 驱动的网页数据抓取）](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
- [Fetcher MCP（使用 Playwright 获取网页内容）](https://github.com/jae-jae/fetcher-mcp)
- [MCP Read Website Fast（网页转 Markdown）](https://github.com/just-every/mcp-read-website-fast)
- [Website Downloader（下载网站内容）](https://github.com/pskill9/website-downloader)

### 3. 文件、Office、PDF、文档与出版

- [Markdownify MCP（把多种内容转成 Markdown）](https://github.com/zcaceres/markdownify-mcp)
- [Pandoc MCP（文档格式转换）](https://github.com/vivekVells/mcp-pandoc)
- [Unstructured MCP（文档解析与结构化）](https://github.com/Unstructured-IO/UNS-MCP)
- [PDF Tools MCP（PDF 合并、提取与处理）](https://github.com/danielkennedy1/pdf-tools-mcp)
- [PDF Reader MCP（PDF 文本提取和搜索）](https://github.com/gpetraroli/mcp_pdf_reader)
- [Paperless-ngx MCP（文档归档系统接口）](https://github.com/baruchiro/paperless-mcp)
- [Typst MCP（Typst 排版与技术文档）](https://github.com/johannesbrandenburger/typst-mcp)
- [Anthropic Document Skills（Word、Excel、PowerPoint、PDF Skills）](https://github.com/anthropics/skills)

### 4. 编程、代码库、Git 与开发者工作流

- [GitHub MCP Server（GitHub 官方 MCP）](https://github.com/github/github-mcp-server)
- [Git MCP（通过 MCP 访问 GitHub 仓库内容）](https://github.com/idosal/git-mcp)
- [GitHub MCP Ingest（读取并整理 GitHub 仓库内容）](https://github.com/adhikasp/mcp-git-ingest)
- [Context7（为模型提供较新的开发文档）](https://github.com/upstash/context7)
- [Microsoft Learn MCP（Microsoft 技术文档检索）](https://github.com/MicrosoftDocs/mcp)
- [Apple Developer Docs MCP（Apple 开发者文档）](https://github.com/kimsungwhee/apple-docs-mcp)
- [Octocode（代码语义搜索与上下文生成）](https://github.com/bgauryy/octocode)
- [SonarQube MCP Server（代码质量与安全检查）](https://github.com/SonarSource/sonarqube-mcp-server)
- [Jupyter MCP Server（Notebook 操作）](https://github.com/datalayer/jupyter-mcp-server)
- [MCP Server Chart（AI 调用图表可视化工具）](https://github.com/antvis/mcp-server-chart)
- [MCP Mermaid（生成 Mermaid 图表）](https://github.com/hustcc/mcp-mermaid)
- [Code Runner MCP（在 Docker 容器中运行代码）](https://github.com/axliupore/mcp-code-runner)

### 5. 数据库、数据分析、BI 与可视化

- [ClickHouse MCP（ClickHouse 数据查询）](https://github.com/ClickHouse/mcp-clickhouse)
- [MotherDuck / DuckDB MCP（本地与云端 DuckDB 数据访问）](https://github.com/motherduckdb/mcp-server-motherduck)
- [DuckDB MCP Server（DuckDB 查询工具）](https://github.com/ktanaka101/mcp-server-duckdb)
- [BigQuery MCP Server（Google BigQuery 数据访问）](https://github.com/ergut/mcp-bigquery-server)
- [Snowflake MCP（Snowflake 数据与 Cortex 能力）](https://github.com/Snowflake-Labs/mcp)
- [OpenMetadata MCP（数据目录与元数据管理）](https://github.com/yangkyeongmo/mcp-server-openmetadata)
- [Datawrapper MCP（生成数据图表）](https://github.com/palewire/datawrapper-mcp)
- [ECharts MCP（ECharts 图表生成）](https://github.com/hustcc/mcp-echarts)
- [Vega-Lite MCP（Vega-Lite 数据可视化）](https://github.com/isaacwasserman/mcp-vegalite-server)
- [Apache Airflow MCP（工作流编排与调度）](https://github.com/yangkyeongmo/mcp-server-apache-airflow)

### 6. 云平台、DevOps、监控与基础设施

- [AWS MCP（AWS 官方开源 MCP 服务器集合）](https://github.com/awslabs/mcp)
- [Terraform MCP Server（Terraform / IaC 工作流）](https://github.com/hashicorp/terraform-mcp-server)
- [Portainer MCP（容器管理）](https://github.com/portainer/portainer-mcp)
- [Kubernetes MCP Server（Kubernetes 集群管理）](https://github.com/reza-gholizade/k8s-mcp-server)
- [Docker Hub MCP（Docker Hub 操作）](https://github.com/docker/hub-mcp)
- [Grafana MCP（监控面板、数据与告警）](https://github.com/grafana/mcp-grafana)
- [Sentry Agentic Toolkit（错误与应用监控数据）](https://github.com/getsentry/toolkit)
- [Zabbix MCP Server（监控告警和运维）](https://github.com/mpeirone/zabbix-mcp-server)
- [VictoriaMetrics MCP（时序监控数据）](https://github.com/VictoriaMetrics/mcp-victoriametrics)
- [1Panel MCP（服务器面板管理）](https://github.com/1Panel-dev/mcp-1panel)

### 7. 邮件、通信、日历与团队协作

- [Inbox Zero（AI 邮件管理助手）](https://github.com/elie222/inbox-zero)
- [Fastmail MCP（Fastmail 邮件 API）](https://github.com/MadLlama25/fastmail-mcp)
- [Email MCP（带附件邮件操作，支持多个邮箱类型）](https://github.com/Shy2593666979/mcp-server-email)
- [WhatsApp MCP（WhatsApp 消息访问）](https://github.com/lharries/whatsapp-mcp)
- [Telegram MCP（Telegram 消息与会话操作）](https://github.com/chigwell/telegram-mcp)
- [LINE Bot MCP（LINE Messaging API）](https://github.com/line/line-bot-mcp-server)
- [Feishu / Lark MCP（飞书 OAuth 与文档管理）](https://github.com/ztxtxwd/open-feishu-mcp-server)
- [iMCP（macOS 信息、联系人和提醒事项）](https://github.com/mattt/iMCP)
- [Monday.com MCP（项目与工作数据）](https://github.com/mondaycom/mcp)
- [Linear MCP（工单与项目跟踪）](https://github.com/jerhadf/linear-mcp-server)
- [Asana MCP（任务与项目管理）](https://github.com/roychri/mcp-server-asana)
- [ClickUp MCP Server（项目和任务）](https://github.com/taazkareem/clickup-mcp-server)
- [Trello MCP（看板与任务管理）](https://github.com/m0xai/trello-mcp-server)
- [EduBase MCP（学习管理平台）](https://github.com/EduBase/MCP)

### 8. 财务、会计、投资与区块链

- [Xero MCP Server（云会计系统）](https://github.com/XeroAPI/xero-mcp-server)
- [Lunch Money MCP（个人预算与财务数据）](https://github.com/akutishevsky/lunchmoney-mcp)
- [hledger MCP（命令行复式记账）](https://github.com/iiAtlas/hledger-mcp)
- [Ledger MCP（Ledger CLI 记账）](https://github.com/minhyeoky/mcp-server-ledger)
- [Mifos X MCP（金融服务平台）](https://github.com/openMF/mcp-mifosx)
- [QuantConnect MCP（量化研究与交易工作流）](https://github.com/QuantConnect/mcp-server)
- [Binance MCP Server（交易所数据接口）](https://github.com/ethancod1ng/binance-mcp-server)
- [EVM MCP Server（EVM 区块链交互）](https://github.com/mcpdotdirect/evm-mcp-server)
- [Web3 Research MCP（加密资产与链上研究）](https://github.com/aaronjmars/web3-research-mcp)

### 9. 电商、零售、营销与社交媒体

- [Shopify MCP / CLI（商品、订单、客户、库存和分析）](https://github.com/callobuzz/cob-shopify-mcp)
- [E-commerce MCP Server（多个电商和市场平台的统一入口）](https://github.com/HelpCode-ai/ecommerce-mcp-server)
- [WooCommerce（电商系统；仓库内含 MCP 集成文档）](https://github.com/woocommerce/woocommerce)
- [NotFair Plugin（SEO、GEO、广告和分析工作流）](https://github.com/nowork-studio/notfair-plugin)
- [Meta Ads MCP（Facebook / Instagram 广告）](https://github.com/pipeboard-co/meta-ads-mcp)
- [Google Analytics MCP（GA4 数据访问）](https://github.com/surendranb/google-analytics-mcp)
- [Google Tag Manager MCP（GTM 管理）](https://github.com/stape-io/google-tag-manager-mcp-server)
- [SEO MCP（基于 Ahrefs 数据的 SEO 工具）](https://github.com/cnych/seo-mcp)
- [Awesome SEO MCP Servers（SEO 行业工具索引）](https://github.com/sharozdawa/awesome-seo-mcp-servers)
- [Awesome China MCP（中国本土平台适配索引）](https://github.com/zackchewa/awesome-china-mcp)
- [RedNote MCP（小红书数据访问）](https://github.com/iFurySt/RedNote-MCP)
- [Reddit MCP Buddy（Reddit 搜索和结构化数据）](https://github.com/karanb192/reddit-mcp-buddy)
- [Facebook MCP Server（帖子、评论和洞察自动化）](https://github.com/HagaiHen/facebook-mcp-server)
- [X/Twitter Scraper（搜索、资料与媒体获取）](https://github.com/Xquik-dev/x-twitter-scraper)
- [Ghost MCP（Ghost 内容管理系统）](https://github.com/MFYDev/ghost-mcp)
- [Webflow MCP Server（Webflow 网站数据接口）](https://github.com/webflow/mcp-server)

### 9A. 中国本土平台适配（单独列出）

这一类对中文用户特别重要。部分项目只是个人维护的适配器，需核对授权方式、数据访问范围、接口稳定性和安全风险。

- [Awesome China MCP（中文应用 MCP 索引）](https://github.com/zackchewa/awesome-china-mcp)
- [中国电商 MCP（抖店、淘宝、京东、快手、小红书、微信小店等入口）](https://github.com/TonyWang-hub/mcp-cn-commerce) — 项目 README 明确说明：部分 SDK 的 `live_verified` 为 `false`，工具注册数不代表已经完成真实商家验收；请按平台、操作逐项核验。
- [Lark OpenAPI MCP（飞书开放接口）](https://github.com/larksuite/lark-openapi-mcp)
- [Open Feishu MCP（飞书 OAuth 与文档管理）](https://github.com/ztxtxwd/open-feishu-mcp-server)
- [Yuque MCP Server（语雀知识库读写与检索）](https://github.com/yuque/yuque-mcp-server)
- [Yuque AI Ecosystem（语雀 MCP + Skills + 插件）](https://github.com/yuque/yuque-ecosystem)
- [Yuque AI MCP（语雀适配器）](https://github.com/yehuoshun/yuque-ai-mcp)
- [DingTalk Docs MCP（钉钉文档相关工具）](https://github.com/hykfft/mcp-dingtalk-doc)
- [Quick DingTalk MCP（钉钉 CLI 包装与用户身份）](https://github.com/keithyt06/quick-dingtalk-mcp)
- [DingTalk Bot MCP（钉钉群机器人）](https://github.com/Shawyeok/mcp-dingding-bot)
- [WeCom Bot MCP（企业微信群机器人）](https://github.com/gotoolkits/mcp-wecombot-server)
- [WeCom Bot MCP Server（企业微信机器人，支持更多消息类型）](https://github.com/loonghao/wecom-bot-mcp-server)
- [ZenOps（面向运维场景的钉钉、飞书、企微机器人入口）](https://github.com/opsre/ZenOps)
- [Flomo MCP（浮墨笔记写入）](https://github.com/chatmcp/mcp-server-flomo)
- [Wolai MCP（我来知识库读写）](https://github.com/LittlePeter52012/wolai-mcp)
- [Rush Shimo CLI（石墨文档读取，CLI / SDK / MCP）](https://github.com/kanyun-inc/rush-shimo-cli)
- [MCP Gitee（Gitee 仓库访问）](https://github.com/oschina/mcp-gitee)
- [md2wechat-skill（微信公众号文章排版、图片与草稿工作流）](https://github.com/geekjourneyx/md2wechat-skill)

### 10. 设计、图片、视频、音频与创意生产

- [Figma Context MCP（向 AI 提供 Figma 设计上下文）](https://github.com/GLips/Figma-Context-MCP)
- [Talk to Figma MCP（Figma 与 Agent 协作）](https://github.com/grab/cursor-talk-to-figma-mcp)
- [Magic MCP（面向前端 UI 生成的工具）](https://github.com/21st-dev/magic-mcp)
- [Blender MCP（Blender 3D 软件控制）](https://github.com/ahujasid/blender-mcp)
- [Video Editing MCP（FFmpeg 视频编辑、字幕和导出）](https://github.com/mfortne/mcp-video-editing)
- [Ableton Live MCP（音乐制作软件控制）](https://github.com/Simon-Kansara/ableton-live-mcp-server)
- [REAPER MCP（音频工程与项目操作）](https://github.com/dschuler36/reaper-mcp-server)
- [Fal MCP Server（图片、视频和音乐生成 API）](https://github.com/luminarylane/fal-mcp-server)
- [YouTube Video Summarizer MCP（视频字幕与摘要）](https://github.com/nabid-pf/youtube-video-summarizer-mcp)
- [YouTube MCP（频道、视频、播放列表检索）](https://github.com/tubeagentkit/youtube-mcp)
- [Unsplash MCP（图片检索）](https://github.com/hellokaton/unsplash-mcp-server)
- [VideoDB Agent Toolkit（视频数据库工具）](https://github.com/video-db/agent-toolkit)

### 11. CAD、BIM、工程、地理空间与地图

- [Awesome AEC MCP（建筑工程行业总目录）](https://github.com/Daviidro/awesome-aec-mcp)
- [Revit MCP（Revit 2023–2027 BIM 操作与校验）](https://github.com/HorizunGroup/horizun-revit-mcp)
- [Revit MCP（Revit API 与 BIM/GIS 工作流）](https://github.com/zymorel/revit-mcp)
- [Architectural Editor（本地 3D 建筑编辑器，含 CLI/MCP）](https://github.com/pascalorg/editor)
- [QGIS MCP（QGIS 桌面 GIS 控制）](https://github.com/jjsantos01/qgis_mcp)
- [GIS MCP（GIS 能力接口）](https://github.com/mahdin75/gis-mcp)
- [GeoServer MCP（GeoServer 地理空间接口）](https://github.com/mahdin75/geoserver-mcp)
- [GDAL MCP（地理空间数据处理）](https://github.com/JordanGunn/gdal-mcp)
- [STAC MCP（遥感与地球观测数据检索）](https://github.com/BnJam/stac-mcp)
- [Baidu Maps MCP（百度地图服务）](https://github.com/baidu-maps/mcp)
- [Mapbox MCP（地图、地点和地理 API）](https://github.com/mapbox/mcp-server)
- [OpenStreetMap MCP（开放地图数据）](https://github.com/jagan-shanmugam/open-streetmap-mcp)
- [TomTom Maps MCP（地点、路线和导航）](https://github.com/tomtom-international/tomtom-maps-mcp)
- [Geo MCP Servers（GIS、气象和遥感工具索引）](https://github.com/sparkgeo/geo-mcp-servers)
- [Weather MCP（天气数据）](https://github.com/isdaniel/mcp_weather_server)

### 12. 医疗、健康、生物信息与实验室科研

- [BioMCP（生物医学数据检索）](https://github.com/genomoncology/biomcp)
- [Apple Health MCP（健康数据查询）](https://github.com/the-momentum/apple-health-mcp-server)
- [FHIR MCP Server（医疗互操作标准接口）](https://github.com/wso2/fhir-mcp-server)
- [Medical MCP（医疗数据处理工具）](https://github.com/JamesANZ/medical-mcp)
- [DICOM MCP（DICOM / PACS 医学影像系统）](https://github.com/ChristianHinge/dicom-mcp)
- [OMOP MCP（OMOP 医疗数据标准）](https://github.com/OHNLP/omop_mcp)
- [ChatSpatial（空间转录组数据与自然语言分析）](https://github.com/cafferychen777/ChatSpatial)
- [LabMate MCP（文献、化合物、合成、实验室与论文工作流）](https://github.com/JonasRackl/labmate-mcp)
- [Google Scholar MCP（学术搜索）](https://github.com/mochow13/google-scholar-mcp)
- [Open Nutrition MCP（营养数据检索和分析）](https://github.com/deadletterq/mcp-opennutrition)

### 13. 工业制造、PLC、IoT、硬件与机器人

- [Awesome Hardware Skills（硬件与工业 Agent 工具索引）](https://github.com/chopinfeng/awesome-hardware-skills)
- [EdgeCore（Modbus、BACnet、OPC UA 等工业边缘运行时）](https://github.com/anviod/edgeCore)
- [Studio 5000 MCP（Rockwell / Allen-Bradley PLC 项目解析）](https://github.com/Nodeblue-AI/studio5000-mcp-server)
- [Siemens TIA Portal Openness MCP（西门子工程软件接口）](https://github.com/chewcw/tia-portal-openness-mcpserver)
- [OPC UA MCP（工业 OPC UA 数据访问）](https://github.com/kukapay/opcua-mcp)
- [Modbus MCP（工业寄存器与设备数据）](https://github.com/kukapay/modbus-mcp)
- [CODESYS MCP Toolkit（工业自动化工程平台）](https://github.com/johannesPettersson80/codesys-mcp-toolkit)
- [Predictive Maintenance MCP（预测性维护与故障诊断）](https://github.com/LGDiMaggio/predictive-maintenance-mcp)
- [Home Assistant MCP（智能家居控制）](https://github.com/tevonsb/homeassistant-mcp)
- [HA MCP Server（Home Assistant 控制与状态查询）](https://github.com/driin0/ha-mcp-server)
- [ESP MCP（ESP32 开发与设备控制）](https://github.com/horw/esp-mcp)
- [ROS MCP Server（ROS 机器人控制）](https://github.com/robotmcp/ros-mcp-server)
- [ROS 2 MCP（ROS 2 机器人接口）](https://github.com/wise-vision/ros2_mcp)
- [Isaac Sim MCP（机器人仿真）](https://github.com/omni-mcp/isaac-sim-mcp)
- [Unitree Go2 MCP（四足机器人控制）](https://github.com/lpigeon/unitree-go2-mcp-server)

### 14. 汽车、车辆诊断与游戏开发

- [MCP-CAN（CAN、OBD-II、UDS、J1939 诊断与模拟）](https://github.com/farzadnadiri/MCP-CAN)
- [Peykan（虚拟车辆、CAN/OBD 与 AI 诊断）](https://github.com/farzadnadiri/peykan)
- [Unity MCP（操作 Unity 编辑器、场景、资源和脚本）](https://github.com/CoplayDev/unity-mcp)
- [GameDev MCP Server（Unity、Godot、Unreal 通用游戏开发工具）](https://github.com/IvanMurzak/GameDev-MCP-Server)
- [Unity MCP Integration（Unity AI 工具集成）](https://github.com/quazaai/UnityMCPIntegration)
- [MCP for Riot Games（Riot 游戏数据接口）](https://github.com/jifrozen0110/mcp-riot)

### 15. 政务、法律、公共数据、专利与安全

- [Civic Data MCP（公共部门与政府开放数据 API）](https://github.com/EricGrill/mcp-civic-data)
- [OpenDataMCP（将开放数据接入 LLM）](https://github.com/OpenDataMCP/OpenDataMCP)
- [US Legal MCP（美国法律与法规数据）](https://github.com/JamesANZ/us-legal-mcp)
- [Congress MCP（美国国会数据）](https://github.com/amurshak/congressMCP)
- [Patent MCP Server（专利数据检索）](https://github.com/riemannzeta/patent_mcp_server)
- [Burp MCP Server（Burp Suite 安全测试工具）](https://github.com/PortSwigger/mcp-server)
- [Shodan MCP（互联网资产与设备检索）](https://github.com/w0h1v/mcp-shodan)
- [CVE Search MCP（漏洞数据库查询）](https://github.com/roadwy/cve-search_mcp)
- [MCP Guardian（MCP 代理与安全控制）](https://github.com/eqtylab/mcp-guardian)
- [MCP Watch（MCP 安全扫描）](https://github.com/kapilduraphe/mcp-watch)
- [SecOps MCP（安全运维测试工具箱）](https://github.com/securityfortech/secops-mcp)
- [Wazuh MCP（SIEM / 安全告警查询）](https://github.com/gbrigandi/mcp-server-wazuh)

### 16. 物流、航空、旅游、招聘与其他垂直应用

- [AviationStack MCP（航空与航班数据）](https://github.com/Pradumnasaraf/aviationstack-mcp)
- [FlightRadar24 MCP（航班跟踪数据）](https://github.com/sunsetcoder/flightradar24-mcp-server)
- [DoorDash MCP（配送平台集成）](https://github.com/JordanDalton/DoorDash-MCP-Server)
- [Campground MCP（露营地查询和预订）](https://github.com/campertunity/mcp-server)
- [Job Searchoor（根据需求搜索职位）](https://github.com/0xDAEF0F/job-searchoor)
- [Himalayas MCP（职位、候选人和薪资数据）](https://github.com/Himalayas-App/himalayas-mcp)
- [CV Forge（ATS 简历、求职信与邮件）](https://github.com/thechandanbhagat/cv-forge)
- [MCP Open Library（图书与作者检索）](https://github.com/8enSmith/mcp-open-library)
- [Wikipedia MCP（百科数据检索）](https://github.com/Rudra-ravi/wikipedia-mcp)
- [MCP Stockfish（国际象棋引擎）](https://github.com/sonirico/mcp-stockfish)

## 上游目录与索引

这些仓库适合作为后续全量扩展的主要入口。它们自身也可能收录重复、停更或质量不同的项目，不能直接视作经过本目录逐一核验的结果。

- [abordage/awesome-mcp](https://github.com/abordage/awesome-mcp) — 持续更新的 MCP 项目目录，覆盖开发、数据、金融、安全、医疗、地图、媒体、社交等多个分类。
- [mcpHQ/awesome-mcp-servers](https://github.com/mcpHQ/awesome-mcp-servers) — MCP Server 综合目录，含开发、浏览器、文件、云、通信、AI、数据、法律、安全、金融和商业应用。
- [anthropics/skills](https://github.com/anthropics/skills) — Agent Skills 示例项目。
- [awesome-mcp-servers topic](https://github.com/topics/mcp-server) — GitHub MCP Server 主题页。
- [agent-skills topic](https://github.com/topics/agent-skills) — GitHub Agent Skills 主题页。
- [ai-agent-tools topic](https://github.com/topics/ai-agent-tools) — GitHub AI Agent 工具主题页。
- [awesome-hardware-skills](https://github.com/chopinfeng/awesome-hardware-skills) — 硬件、工业与嵌入式专业目录。
- [awesome-aec-mcp](https://github.com/Daviidro/awesome-aec-mcp) — AEC / CAD / BIM 专业目录。
- [geo-mcp-servers](https://github.com/sparkgeo/geo-mcp-servers) — GIS / 地图 / 遥感专业目录。
- [awesome-seo-mcp-servers](https://github.com/sharozdawa/awesome-seo-mcp-servers) — SEO / 数字营销专业目录。

## 收录与质量规则

后续每个条目建议维护以下字段：

1. **名称**：工具名或项目名，尽量不写营销化描述。
2. **GitHub 仓库**：直接链接到源仓库。
3. **领域**：行业大类与细分场景；允许多标签。
4. **铲子类型**：MCP、Skill、CLI、插件、SDK/API、自动化、数据/文件处理。
5. **主要能力**：一句话说明 AI 实际能做什么。
6. **状态**：最近提交日期、是否归档、Issues 响应、是否可以运行；需检查后才能标记。
7. **许可证**：许可证类型；不清楚时标记“未核验”，不得默认可商用。
8. **运行与成本**：本地/云端、是否需密钥、是否产生 API 费用。
9. **安全级别**：只读、可写、可执行命令、可访问敏感数据；危险操作需特别标注。

不因项目只支持 MCP 就自动收录，也不因为仓库名字中有 AI/MCP 就默认收录。优先选择能完成明确任务的工具，并逐步去重、检查可运行性、许可证、最后提交时间与安全权限。

## 贡献方式

欢迎提交 Issue 或 Pull Request。新增条目请按以下格式添加，并附上项目真实用途：

```markdown
- [铲子名称（具体用途）](https://github.com/owner/repository)
```

请勿提交只有教程截图、已失效链接、纯 prompt 集合（除非其 Skills / workflow 可直接执行）、或无法确认来源的二进制下载链接。涉及安全、医疗、金融、工控和真实设备控制的项目，需要明确标注风险与权限。

## 来源与更新时间

- 本轮初始检索整理日期：2026-10-29。
- 项目发现入口以 GitHub 仓库和 GitHub Topics 为主，包括 `abordage/awesome-mcp`、`mcpHQ/awesome-mcp-servers`、`anthropics/skills`、以及 GIS / AEC / SEO / Hardware 等专业目录。
- 目录中的仓库名称和用途为初步分类；每个项目的当前维护状态、许可证、安装方式与安全性仍需按仓库最新页面复核。
