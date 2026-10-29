# AI Shovels — A Curated Directory of AI Agent Tools

<div align="center">

**[🇨🇳 中文](README.md)** · **[🇬🇧 English](README.en.md)**

[![Views](https://hits.sh/github.com/manningyangs/AI-Shovel-Collection.svg)](https://hits.sh/github.com/manningyangs/AI-Shovel-Collection/)

</div>

> A curated directory of open-source tools that enable AI models to **access data, operate software, execute tasks, convert files, call professional tooling, or complete domain work**.
>
> Maintenance model: collect first, categorize second, verify third. Contributions welcome via Issues / Pull Requests — add repos, fix categorizations, or flag stale projects.

- [Browse GitHub by Industry / Domain](#browse-github-by-industry--domain)
- [Curated Shovel Repositories](#curated-shovel-repositories)
- [Upstream Directories & Indexes](#upstream-directories--indexes)
- [Inclusion & Quality Criteria](#inclusion--quality-criteria)
- [Contributing](#contributing)

## What goes in here

The term "shovel" is used broadly — not limited to MCP. This directory may include:

- **MCP Server / Client**: Exposes software, data sources, or device capabilities to AI.
- **Agent Skills / Plugins / Extensions**: Adds specialized workflows, knowledge, scripts, or in-app operations to agents.
- **CLI / SDK / API Adapters**: Command-line tools, SDKs, and API bridges suitable for reliable agent invocation.
- **Automation / RPA / Desktop Control**: Helps agents operate browsers, desktop apps, business systems, and devices.
- **Specialized File / Data Tools**: Parsing, editing, and conversion tools for PDF, Office, CAD, GIS, audio/video, scientific data, etc.

This list is a **continuously maintained discovery directory** and does not claim to exhaust GitHub. The landscape of relevant repositories on GitHub is massive and changes daily; the "GitHub Search" links below are real-time keyword-generated entry points to explore the latest results and additional pages. Inclusion does not imply that a project is secure, active, commercially usable, or quality-endorsed — always check the license, maintenance status, permissions, and data security before using.

## Browse GitHub by Industry / Domain

Click "GitHub Search" to find more public repositories related to MCP, Agent Skills, and AI agent tools in that domain. Categories are working directories — cross-domain projects may appear in multiple categories.

| Domain | GitHub Search |
|---|---|
| AI Agents, MCP, Skills, Plugins & Tool Directories | [MCP repositories](https://github.com/search?q=MCP&type=repositories) · [Agent Skills](https://github.com/search?q=agent+skills&type=repositories) · [AI agent tools](https://github.com/search?q=AI+agent+tools&type=repositories) |
| AI Infrastructure, Models, Inference, RAG, Memory & Vector Search | [GitHub Search](https://github.com/search?q=MCP+RAG+vector+memory+inference&type=repositories) |
| Software Development, Code Understanding, IDEs, Git, APIs, Testing & CI/CD | [GitHub Search](https://github.com/search?q=MCP+developer+tools+Git+IDE+testing+CI+CD&type=repositories) |
| Browser Automation, Web Scraping & Search | [GitHub Search](https://github.com/search?q=MCP+browser+automation+web+scraping+search&type=repositories) |
| Office, Word, Excel, PowerPoint, PDF, E-Signature | [GitHub Search](https://github.com/search?q=MCP+Office+Excel+Word+PowerPoint+PDF&type=repositories) |
| File Management, OCR, Document Parsing, Conversion, Knowledge Bases | [GitHub Search](https://github.com/search?q=MCP+document+OCR+PDF+conversion&type=repositories) |
| Databases, Data Warehouses, SQL, ETL, BI, Reporting & Visualization | [GitHub Search](https://github.com/search?q=MCP+database+SQL+analytics+BI&type=repositories) |
| Cloud Platforms, Servers, Containers, DevOps, SRE & Observability | [GitHub Search](https://github.com/search?q=MCP+cloud+DevOps+Docker+Kubernetes+monitoring&type=repositories) |
| Email, Messaging, Calendar, Meetings & Team Collaboration | [GitHub Search](https://github.com/search?q=MCP+email+calendar+messaging+meeting&type=repositories) |
| Project Management, Tasks, Tickets, Knowledge Management & Productivity | [GitHub Search](https://github.com/search?q=MCP+project+management+tasks+productivity&type=repositories) |
| Finance, Accounting, Invoicing, Payments, Banking & Insurance | [GitHub Search](https://github.com/search?q=MCP+accounting+finance+invoice+payment+insurance&type=repositories) |
| Investments, Stocks, Quant, Crypto & Blockchain | [GitHub Search](https://github.com/search?q=MCP+stocks+trading+crypto+blockchain&type=repositories) |
| Enterprise Management, ERP, CRM, HRM, Supply Chain & Procurement | [GitHub Search](https://github.com/search?q=MCP+ERP+CRM+HRM+supply+chain+procurement&type=repositories) |
| E-commerce, Retail, POS, Products, Orders, Inventory & Marketplaces | [GitHub Search](https://github.com/search?q=MCP+ecommerce+retail+POS+inventory+orders&type=repositories) |
| Marketing, SEO, Advertising, Web Analytics, Growth & Customer Ops | [GitHub Search](https://github.com/search?q=MCP+SEO+marketing+advertising+analytics&type=repositories) |
| Social Media, Communities, Content Distribution & Publishing | [GitHub Search](https://github.com/search?q=MCP+social+media+publishing+content&type=repositories) |
| Design, UI/UX, Figma, Design Systems & Prototyping | [GitHub Search](https://github.com/search?q=MCP+design+Figma+UI+UX&type=repositories) |
| Image, Video, Audio, Subtitles, Voice & Multimedia Production | [GitHub Search](https://github.com/search?q=MCP+video+audio+image+media+editing&type=repositories) |
| CAD, 3D, BIM, Architecture, Engineering & Construction | [GitHub Search](https://github.com/search?q=MCP+CAD+BIM+Revit+architecture+construction&type=repositories) |
| EDA, PCB, Chips, Embedded Systems & Hardware Development | [GitHub Search](https://github.com/search?q=MCP+KiCad+EDA+PCB+embedded+hardware&type=repositories) |
| Manufacturing, Industrial Software, PLC, SCADA, OPC UA, MES & Maintenance | [GitHub Search](https://github.com/search?q=MCP+industrial+PLC+SCADA+OPC+UA+manufacturing&type=repositories) |
| Robotics, ROS, Drones, Autonomous Driving & Embodied AI | [GitHub Search](https://github.com/search?q=MCP+robotics+ROS+drone+autonomous&type=repositories) |
| Automotive, In-Vehicle Software, CAN/OBD, Diagnostics & Fleet Mgmt | [GitHub Search](https://github.com/search?q=MCP+automotive+CAN+OBD+vehicle+diagnostics&type=repositories) |
| Healthcare, Clinical, HIS, Health Data & Medical Imaging | [GitHub Search](https://github.com/search?q=MCP+healthcare+medical+FHIR+DICOM&type=repositories) |
| Bioinformatics, Chemistry, Pharma, Labs, Research & Papers | [GitHub Search](https://github.com/search?q=MCP+bioinformatics+chemistry+laboratory+research&type=repositories) |
| Education, Teaching, LMS, Courses, Learning & Academic Resources | [GitHub Search](https://github.com/search?q=MCP+education+LMS+learning+course&type=repositories) |
| Legal, Regulation, Contracts, Compliance, Patents & IP | [GitHub Search](https://github.com/search?q=MCP+legal+law+contract+compliance+patent&type=repositories) |
| Government, Civic, Open Data, Public Safety & City Services | [GitHub Search](https://github.com/search?q=MCP+government+civic+open+data&type=repositories) |
| Cybersecurity, Pentesting, Vulnerabilities, Threat Intel, SIEM & Privacy | [GitHub Search](https://github.com/search?q=MCP+cybersecurity+pentest+SIEM+threat+intelligence&type=repositories) |
| GIS, Maps, Remote Sensing, Surveying, Geospatial & Navigation | [GitHub Search](https://github.com/search?q=MCP+GIS+QGIS+geospatial+mapping&type=repositories) |
| Weather, Climate, Environment, Carbon, Water & Natural Resources | [GitHub Search](https://github.com/search?q=MCP+weather+climate+environment+energy&type=repositories) |
| Agriculture, Farming, Livestock, Food & AgriTech | [GitHub Search](https://github.com/search?q=MCP+agriculture+farming+crop+livestock&type=repositories) |
| Energy, Electricity, Solar, Storage, Building & Energy Management | [GitHub Search](https://github.com/search?q=MCP+energy+electricity+solar+battery+building&type=repositories) |
| Logistics, Shipping, Warehousing, Express, Aviation & Fleet | [GitHub Search](https://github.com/search?q=MCP+logistics+shipping+warehouse+fleet+aviation&type=repositories) |
| Hospitality, Restaurants, Travel, Booking, Food Delivery & Services | [GitHub Search](https://github.com/search?q=MCP+hospitality+restaurant+hotel+travel+booking&type=repositories) |
| Real Estate, Property, Facility Management & Space Assets | [GitHub Search](https://github.com/search?q=MCP+real+estate+property+facility+management&type=repositories) |
| Recruiting, Resumes, Hiring, Performance, Scheduling & HR | [GitHub Search](https://github.com/search?q=MCP+HR+recruiting+resume+payroll+jobs&type=repositories) |
| Smart Home, IoT, Home Automation, Networking & Consumer Electronics | [GitHub Search](https://github.com/search?q=MCP+Home+Assistant+IoT+smart+home&type=repositories) |
| Game Dev, Unity, Unreal, Godot & Game Data | [GitHub Search](https://github.com/search?q=MCP+Unity+Unreal+Godot+game+development&type=repositories) |
| Accessibility, Assistive Tech, Mobile, Desktop OS & Device Control | [GitHub Search](https://github.com/search?q=MCP+accessibility+assistive+technology+desktop+automation&type=repositories) |
| Translation, Localization, Languages, Libraries, Archives & Knowledge Retrieval | [GitHub Search](https://github.com/search?q=MCP+translation+localization+library+archive&type=repositories) |
| China Platforms: Feishu, Yuque, DingTalk, WeCom, WeChat Ecosystem, Gitee | [GitHub Search](https://github.com/search?q=MCP+飞书+语雀+钉钉+企微+微信+Gitee&type=repositories) |
| Vertical Tools: Nutrition, Sports, Media Libraries, Collections, Museums | [GitHub Search](https://github.com/search?q=MCP+specialized+tools+domain&type=repositories) |

## Curated Shovel Repositories

Below is the seed list from the initial round of discovery. Names use "project / shovel" convention with links to the GitHub repository; most are MCP but also include Agent Skills, CLIs, domain indexes, and general adapters. Categories are not quality rankings. For the machine-readable manifest see [`catalog.csv`](catalog.csv) with columns: category, shovel name, GitHub repo URL.

### 1. Directories, Skills & General AI Tooling

- [Awesome MCP (auto-updating MCP directory)](https://github.com/abordage/awesome-mcp)
- [Awesome MCP Servers (comprehensive MCP server directory)](https://github.com/mcpHQ/awesome-mcp-servers)
- [Anthropic Agent Skills (official example skills with docs, design, dev workflows)](https://github.com/anthropics/skills)
- [Awesome Hardware Skills (hardware, industrial, embedded agent tool directory)](https://github.com/chopinfeng/awesome-hardware-skills)
- [Awesome AEC MCP (architecture, engineering, construction, BIM, CAD directory)](https://github.com/Daviidro/awesome-aec-mcp)
- [Geospatial MCP Servers (GIS, mapping, remote sensing tools)](https://github.com/sparkgeo/geo-mcp-servers)
- [Awesome SEO MCP Servers (SEO, marketing skills & MCP directory)](https://github.com/sharozdawa/awesome-seo-mcp-servers)
- [MCP Reference Servers (official MCP protocol reference implementations)](https://github.com/modelcontextprotocol/servers)
- [FastMCP (Python framework for building MCP servers/clients)](https://github.com/PrefectHQ/fastmcp)
- [OpenAPI to MCP (expose OpenAPI APIs as MCP tools)](https://github.com/automation-ai-labs/mcp-link)
- [FastAPI MCP (expose FastAPI endpoints to MCP)](https://github.com/tadata-org/fastapi_mcp)
- [WordPress MCP Adapter (expose WordPress abilities as MCP)](https://github.com/WordPress/mcp-adapter)

### 2. Browsers, Web Search, Scraping & Automation

- [Playwright MCP (browser control & web automation)](https://github.com/microsoft/playwright-mcp)
- [BrowserMCP (browser control)](https://github.com/BrowserMCP/mcp)
- [Firecrawl MCP Server (web scraping & search, LLM-ready output)](https://github.com/firecrawl/firecrawl-mcp-server)
- [Apify MCP Server (web scraping & data extraction)](https://github.com/apify/apify-mcp-server)
- [Bright Data MCP (web data access & scraping)](https://github.com/brightdata/brightdata-mcp)
- [ScrapeGraphAI (AI-driven web data scraping)](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
- [Fetcher MCP (Playwright-based web content retrieval)](https://github.com/jae-jae/fetcher-mcp)
- [MCP Read Website Fast (web-to-markdown)](https://github.com/just-every/mcp-read-website-fast)
- [Website Downloader (download website content)](https://github.com/pskill9/website-downloader)

### 3. Files, Office, PDF, Documents & Publishing

- [Markdownify MCP (convert various content to Markdown)](https://github.com/zcaceres/markdownify-mcp)
- [Pandoc MCP (document format conversion)](https://github.com/vivekVells/mcp-pandoc)
- [Unstructured MCP (document parsing & structuring)](https://github.com/Unstructured-IO/UNS-MCP)
- [PDF Tools MCP (PDF merge, extraction & processing)](https://github.com/danielkennedy1/pdf-tools-mcp)
- [PDF Reader MCP (PDF text extraction & search)](https://github.com/gpetraroli/mcp_pdf_reader)
- [Paperless-ngx MCP (document archive system interface)](https://github.com/baruchiro/paperless-mcp)
- [Typst MCP (Typst typesetting for technical docs)](https://github.com/johannesbrandenburger/typst-mcp)
- [Anthropic Document Skills (Word, Excel, PowerPoint, PDF skills)](https://github.com/anthropics/skills)

### 4. Programming, Code Repos, Git & Developer Workflows

- [GitHub MCP Server (official GitHub MCP)](https://github.com/github/github-mcp-server)
- [Git MCP (access GitHub repo content via MCP)](https://github.com/idosal/git-mcp)
- [GitHub MCP Ingest (read & organize GitHub repo content)](https://github.com/adhikasp/mcp-git-ingest)
- [Context7 (up-to-date dev docs for models)](https://github.com/upstash/context7)
- [Microsoft Learn MCP (Microsoft technical doc search)](https://github.com/MicrosoftDocs/mcp)
- [Apple Developer Docs MCP (Apple developer documentation)](https://github.com/kimsungwhee/apple-docs-mcp)
- [Octocode (code semantic search & context generation)](https://github.com/bgauryy/octocode)
- [SonarQube MCP Server (code quality & security checks)](https://github.com/SonarSource/sonarqube-mcp-server)
- [Jupyter MCP Server (Notebook operations)](https://github.com/datalayer/jupyter-mcp-server)
- [MCP Server Chart (AI-invoked chart visualization)](https://github.com/antvis/mcp-server-chart)
- [MCP Mermaid (generate Mermaid diagrams)](https://github.com/hustcc/mcp-mermaid)
- [Code Runner MCP (run code in Docker containers)](https://github.com/axliupore/mcp-code-runner)

### 5. Databases, Data Analysis, BI & Visualization

- [ClickHouse MCP (ClickHouse data queries)](https://github.com/ClickHouse/mcp-clickhouse)
- [MotherDuck / DuckDB MCP (local & cloud DuckDB access)](https://github.com/motherduckdb/mcp-server-motherduck)
- [DuckDB MCP Server (DuckDB query tools)](https://github.com/ktanaka101/mcp-server-duckdb)
- [BigQuery MCP Server (Google BigQuery access)](https://github.com/ergut/mcp-bigquery-server)
- [Snowflake MCP (Snowflake data & Cortex)](https://github.com/Snowflake-Labs/mcp)
- [OpenMetadata MCP (data catalog & metadata)](https://github.com/yangkyeongmo/mcp-server-openmetadata)
- [Datawrapper MCP (generate data charts)](https://github.com/palewire/datawrapper-mcp)
- [ECharts MCP (ECharts chart generation)](https://github.com/hustcc/mcp-echarts)
- [Vega-Lite MCP (Vega-Lite data visualization)](https://github.com/isaacwasserman/mcp-vegalite-server)
- [Apache Airflow MCP (workflow orchestration & scheduling)](https://github.com/yangkyeongmo/mcp-server-apache-airflow)

### 6. Cloud, DevOps, Monitoring & Infrastructure

- [AWS MCP (official open-source AWS MCP servers)](https://github.com/awslabs/mcp)
- [Terraform MCP Server (Terraform / IaC workflows)](https://github.com/hashicorp/terraform-mcp-server)
- [Portainer MCP (container management)](https://github.com/portainer/portainer-mcp)
- [Kubernetes MCP Server (Kubernetes cluster management)](https://github.com/reza-gholizade/k8s-mcp-server)
- [Docker Hub MCP (Docker Hub operations)](https://github.com/docker/hub-mcp)
- [Grafana MCP (dashboards, data & alerts)](https://github.com/grafana/mcp-grafana)
- [Sentry Agentic Toolkit (error & app monitoring)](https://github.com/getsentry/toolkit)
- [Zabbix MCP Server (monitoring alerts & ops)](https://github.com/mpeirone/zabbix-mcp-server)
- [VictoriaMetrics MCP (time-series monitoring)](https://github.com/VictoriaMetrics/mcp-victoriametrics)
- [1Panel MCP (server panel management)](https://github.com/1Panel-dev/mcp-1panel)

### 7. Email, Messaging, Calendar & Team Collaboration

- [Inbox Zero (AI email management assistant)](https://github.com/elie222/inbox-zero)
- [Fastmail MCP (Fastmail email API)](https://github.com/MadLlama25/fastmail-mcp)
- [Email MCP (multi-provider email with attachments)](https://github.com/Shy2593666979/mcp-server-email)
- [WhatsApp MCP (WhatsApp message access)](https://github.com/lharries/whatsapp-mcp)
- [Telegram MCP (Telegram message & conversation ops)](https://github.com/chigwell/telegram-mcp)
- [LINE Bot MCP (LINE Messaging API)](https://github.com/line/line-bot-mcp-server)
- [Feishu / Lark MCP (Feishu OAuth & doc management)](https://github.com/ztxtxwd/open-feishu-mcp-server)
- [iMCP (macOS contacts, messages, reminders)](https://github.com/mattt/iMCP)
- [Monday.com MCP (project & work data)](https://github.com/mondaycom/mcp)
- [Linear MCP (issues & project tracking)](https://github.com/jerhadf/linear-mcp-server)
- [Asana MCP (task & project management)](https://github.com/roychri/mcp-server-asana)
- [ClickUp MCP Server (projects & tasks)](https://github.com/taazkareem/clickup-mcp-server)
- [Trello MCP (boards & task management)](https://github.com/m0xai/trello-mcp-server)
- [EduBase MCP (learning management platform)](https://github.com/EduBase/MCP)

### 8. Finance, Accounting, Investing & Blockchain

- [Xero MCP Server (cloud accounting)](https://github.com/XeroAPI/xero-mcp-server)
- [Lunch Money MCP (personal budget & finance)](https://github.com/akutishevsky/lunchmoney-mcp)
- [hledger MCP (CLI double-entry bookkeeping)](https://github.com/iiAtlas/hledger-mcp)
- [Ledger MCP (Ledger CLI accounting)](https://github.com/minhyeoky/mcp-server-ledger)
- [Mifos X MCP (financial services platform)](https://github.com/openMF/mcp-mifosx)
- [QuantConnect MCP (quant research & trading workflows)](https://github.com/QuantConnect/mcp-server)
- [Binance MCP Server (exchange data API)](https://github.com/ethancod1ng/binance-mcp-server)
- [EVM MCP Server (EVM blockchain interaction)](https://github.com/mcpdotdirect/evm-mcp-server)
- [Web3 Research MCP (crypto & on-chain research)](https://github.com/aaronjmars/web3-research-mcp)

### 9. E-commerce, Retail, Marketing & Social Media

- [Shopify MCP / CLI (products, orders, customers, inventory, analytics)](https://github.com/callobuzz/cob-shopify-mcp)
- [E-commerce MCP Server (unified entry for multiple marketplaces)](https://github.com/HelpCode-ai/ecommerce-mcp-server)
- [WooCommerce (repo includes MCP integration docs)](https://github.com/woocommerce/woocommerce)
- [NotFair Plugin (SEO, GEO, ads & analytics workflows)](https://github.com/nowork-studio/notfair-plugin)
- [Meta Ads MCP (Facebook / Instagram ads)](https://github.com/pipeboard-co/meta-ads-mcp)
- [Google Analytics MCP (GA4 data access)](https://github.com/surendranb/google-analytics-mcp)
- [Google Tag Manager MCP (GTM management)](https://github.com/stape-io/google-tag-manager-mcp-server)
- [SEO MCP (Ahrefs-based SEO tools)](https://github.com/cnych/seo-mcp)
- [Awesome SEO MCP Servers (SEO industry index)](https://github.com/sharozdawa/awesome-seo-mcp-servers)
- [Awesome China MCP (China platform adapters index)](https://github.com/zackchewa/awesome-china-mcp)
- [RedNote MCP (Xiaohongshu data access)](https://github.com/iFurySt/RedNote-MCP)
- [Reddit MCP Buddy (Reddit search & structured data)](https://github.com/karanb192/reddit-mcp-buddy)
- [Facebook MCP Server (posts, comments, insights automation)](https://github.com/HagaiHen/facebook-mcp-server)
- [X/Twitter Scraper (search, profile & media retrieval)](https://github.com/Xquik-dev/x-twitter-scraper)
- [Ghost MCP (Ghost CMS)](https://github.com/MFYDev/ghost-mcp)
- [Webflow MCP Server (Webflow site data API)](https://github.com/webflow/mcp-server)

### 9A. China Platform Adapters (separate list)

This section is especially important for Chinese-speaking users. Some projects are personal adapters — verify authorization, data scope, API stability, and security risks.

- [Awesome China MCP (Chinese app MCP index)](https://github.com/zackchewa/awesome-china-mcp)
- [China E-commerce MCP (Douyin, Taobao, JD, Kuaishou, Xiaohongshu, WeChat Shop)](https://github.com/TonyWang-hub/mcp-cn-commerce)
- [Lark OpenAPI MCP (Feishu open API)](https://github.com/larksuite/lark-openapi-mcp)
- [Open Feishu MCP (Feishu OAuth & doc management)](https://github.com/ztxtxwd/open-feishu-mcp-server)
- [Yuque MCP Server (Yuque knowledge base read/write)](https://github.com/yuque/yuque-mcp-server)
- [Yuque AI Ecosystem (Yuque MCP + Skills + Plugins)](https://github.com/yuque/yuque-ecosystem)
- [Yuque AI MCP (Yuque adapter)](https://github.com/yehuoshun/yuque-ai-mcp)
- [DingTalk Docs MCP (DingTalk doc tools)](https://github.com/hykfft/mcp-dingtalk-doc)
- [Quick DingTalk MCP (DingTalk CLI wrapper & identity)](https://github.com/keithyt06/quick-dingtalk-mcp)
- [DingTalk Bot MCP (DingTalk group bot)](https://github.com/Shawyeok/mcp-dingding-bot)
- [WeCom Bot MCP (WeCom group bot)](https://github.com/gotoolkits/mcp-wecombot-server)
- [WeCom Bot MCP Server (WeCom bot, more message types)](https://github.com/loonghao/wecom-bot-mcp-server)
- [ZenOps (DingTalk, Feishu, WeCom bot entry for ops)](https://github.com/opsre/ZenOps)
- [Flomo MCP (Flomo notes write)](https://github.com/chatmcp/mcp-server-flomo)
- [Wolai MCP (Wolai knowledge base read/write)](https://github.com/LittlePeter52012/wolai-mcp)
- [Rush Shimo CLI (Shimo doc read, CLI / SDK / MCP)](https://github.com/kanyun-inc/rush-shimo-cli)
- [MCP Gitee (Gitee repo access)](https://github.com/oschina/mcp-gitee)
- [md2wechat-skill (WeChat article formatting & draft workflow)](https://github.com/geekjourneyx/md2wechat-skill)

### 10. Design, Image, Video, Audio & Creative Production

- [Figma Context MCP (Figma design context for AI)](https://github.com/GLips/Figma-Context-MCP)
- [Talk to Figma MCP (Figma & agent collaboration)](https://github.com/grab/cursor-talk-to-figma-mcp)
- [Magic MCP (front-end UI generation)](https://github.com/21st-dev/magic-mcp)
- [Blender MCP (Blender 3D control)](https://github.com/ahujasid/blender-mcp)
- [Video Editing MCP (FFmpeg editing, subtitles, export)](https://github.com/mfortne/mcp-video-editing)
- [Ableton Live MCP (Ableton Live control)](https://github.com/Simon-Kansara/ableton-live-mcp-server)
- [REAPER MCP (audio engineering & project ops)](https://github.com/dschuler36/reaper-mcp-server)
- [Fal MCP Server (image, video & music generation API)](https://github.com/luminarylane/fal-mcp-server)
- [YouTube Video Summarizer MCP (subtitles & summaries)](https://github.com/nabid-pf/youtube-video-summarizer-mcp)
- [YouTube MCP (channels, videos, playlists)](https://github.com/tubeagentkit/youtube-mcp)
- [Unsplash MCP (image search)](https://github.com/hellokaton/unsplash-mcp-server)
- [VideoDB Agent Toolkit (video database tools)](https://github.com/video-db/agent-toolkit)

### 11. CAD, BIM, Engineering, Geospatial & Maps

- [Awesome AEC MCP (AEC industry directory)](https://github.com/Daviidro/awesome-aec-mcp)
- [Revit MCP (Revit 2023–2027 BIM ops & validation)](https://github.com/HorizunGroup/horizun-revit-mcp)
- [Revit MCP (Revit API & BIM/GIS workflows)](https://github.com/zymorel/revit-mcp)
- [Architectural Editor (local 3D architecture editor with CLI/MCP)](https://github.com/pascalorg/editor)
- [QGIS MCP (QGIS desktop GIS control)](https://github.com/jjsantos01/qgis_mcp)
- [GIS MCP (GIS capability interfaces)](https://github.com/mahdin75/gis-mcp)
- [GeoServer MCP (GeoServer geospatial API)](https://github.com/mahdin75/geoserver-mcp)
- [GDAL MCP (geospatial data processing)](https://github.com/JordanGunn/gdal-mcp)
- [STAC MCP (remote sensing & Earth observation)](https://github.com/BnJam/stac-mcp)
- [Baidu Maps MCP (Baidu map services)](https://github.com/baidu-maps/mcp)
- [Mapbox MCP (maps, places & geocoding)](https://github.com/mapbox/mcp-server)
- [OpenStreetMap MCP (open map data)](https://github.com/jagan-shanmugam/open-streetmap-mcp)
- [TomTom Maps MCP (places, routes & navigation)](https://github.com/tomtom-international/tomtom-maps-mcp)
- [Geo MCP Servers (GIS, weather, remote sensing index)](https://github.com/sparkgeo/geo-mcp-servers)
- [Weather MCP (weather data)](https://github.com/isdaniel/mcp_weather_server)

### 12. Healthcare, Bioinformatics & Lab Research

- [BioMCP (biomedical data search)](https://github.com/genomoncology/biomcp)
- [Apple Health MCP (health data queries)](https://github.com/the-momentum/apple-health-mcp-server)
- [FHIR MCP Server (healthcare interoperability standard)](https://github.com/wso2/fhir-mcp-server)
- [Medical MCP (medical data processing)](https://github.com/JamesANZ/medical-mcp)
- [DICOM MCP (DICOM / PACS medical imaging)](https://github.com/ChristianHinge/dicom-mcp)
- [OMOP MCP (OMOP medical data standard)](https://github.com/OHNLP/omop_mcp)
- [ChatSpatial (spatial transcriptomics & NL analysis)](https://github.com/cafferychen777/ChatSpatial)
- [LabMate MCP (literature, compounds, synthesis, lab & paper workflows)](https://github.com/JonasRackl/labmate-mcp)
- [Google Scholar MCP (academic search)](https://github.com/mochow13/google-scholar-mcp)
- [Open Nutrition MCP (nutrition data search & analysis)](https://github.com/deadletterq/mcp-opennutrition)

### 13. Manufacturing, PLC, IoT, Hardware & Robotics

- [Awesome Hardware Skills (hardware & industrial agent tool index)](https://github.com/chopinfeng/awesome-hardware-skills)
- [EdgeCore (Modbus, BACnet, OPC UA industrial edge runtime)](https://github.com/anviod/edgeCore)
- [Studio 5000 MCP (Rockwell / Allen-Bradley PLC project parsing)](https://github.com/Nodeblue-AI/studio5000-mcp-server)
- [Siemens TIA Portal Openness MCP (Siemens engineering software API)](https://github.com/chewcw/tia-portal-openness-mcpserver)
- [OPC UA MCP (industrial OPC UA data access)](https://github.com/kukapay/opcua-mcp)
- [Modbus MCP (industrial register & device data)](https://github.com/kukapay/modbus-mcp)
- [CODESYS MCP Toolkit (industrial automation platform)](https://github.com/johannesPettersson80/codesys-mcp-toolkit)
- [Predictive Maintenance MCP (predictive maintenance & fault diagnosis)](https://github.com/LGDiMaggio/predictive-maintenance-mcp)
- [Home Assistant MCP (smart home control)](https://github.com/tevonsb/homeassistant-mcp)
- [HA MCP Server (Home Assistant control & status)](https://github.com/driin0/ha-mcp-server)
- [ESP MCP (ESP32 dev & device control)](https://github.com/horw/esp-mcp)
- [ROS MCP Server (ROS robot control)](https://github.com/robotmcp/ros-mcp-server)
- [ROS 2 MCP (ROS 2 robot interface)](https://github.com/wise-vision/ros2_mcp)
- [Isaac Sim MCP (robot simulation)](https://github.com/omni-mcp/isaac-sim-mcp)
- [Unitree Go2 MCP (quadruped robot control)](https://github.com/lpigeon/unitree-go2-mcp-server)

### 14. Automotive, Diagnostics & Game Dev

- [MCP-CAN (CAN, OBD-II, UDS, J1939 diagnostics & simulation)](https://github.com/farzadnadiri/MCP-CAN)
- [Peykan (virtual vehicle, CAN/OBD & AI diagnostics)](https://github.com/farzadnadiri/peykan)
- [Unity MCP (Unity editor, scene, asset & script ops)](https://github.com/CoplayDev/unity-mcp)
- [GameDev MCP Server (Unity, Godot, Unreal game dev tools)](https://github.com/IvanMurzak/GameDev-MCP-Server)
- [Unity MCP Integration (Unity AI tool integration)](https://github.com/quazaai/UnityMCPIntegration)
- [MCP for Riot Games (Riot game data API)](https://github.com/jifrozen0110/mcp-riot)

### 15. Government, Legal, Open Data, Patents & Security

- [Civic Data MCP (public sector & government open data API)](https://github.com/EricGrill/mcp-civic-data)
- [OpenDataMCP (connect open data to LLMs)](https://github.com/OpenDataMCP/OpenDataMCP)
- [US Legal MCP (US law & regulation data)](https://github.com/JamesANZ/us-legal-mcp)
- [Congress MCP (US Congress data)](https://github.com/amurshak/congressMCP)
- [Patent MCP Server (patent data search)](https://github.com/riemannzeta/patent_mcp_server)
- [Burp MCP Server (Burp Suite security testing)](https://github.com/PortSwigger/mcp-server)
- [Shodan MCP (internet asset & device search)](https://github.com/w0h1v/mcp-shodan)
- [CVE Search MCP (vulnerability DB queries)](https://github.com/roadwy/cve-search_mcp)
- [MCP Guardian (MCP proxy & security control)](https://github.com/eqtylab/mcp-guardian)
- [MCP Watch (MCP security scanning)](https://github.com/kapilduraphe/mcp-watch)
- [SecOps MCP (security ops test toolkit)](https://github.com/securityfortech/secops-mcp)
- [Wazuh MCP (SIEM / security alert queries)](https://github.com/gbrigandi/mcp-server-wazuh)

### 16. Logistics, Aviation, Travel, Recruiting & Other Vertical Apps

- [AviationStack MCP (aviation & flight data)](https://github.com/Pradumnasaraf/aviationstack-mcp)
- [FlightRadar24 MCP (flight tracking data)](https://github.com/sunsetcoder/flightradar24-mcp-server)
- [DoorDash MCP (delivery platform integration)](https://github.com/JordanDalton/DoorDash-MCP-Server)
- [Campground MCP (campsite search & booking)](https://github.com/campertunity/mcp-server)
- [Job Searchoor (job search by requirements)](https://github.com/0xDAEF0F/job-searchoor)
- [Himalayas MCP (jobs, candidates & salary data)](https://github.com/Himalayas-App/himalayas-mcp)
- [CV Forge (ATS resumes, cover letters & emails)](https://github.com/thechandanbhagat/cv-forge)
- [MCP Open Library (books & authors search)](https://github.com/8enSmith/mcp-open-library)
- [Wikipedia MCP (encyclopedia data search)](https://github.com/Rudra-ravi/wikipedia-mcp)
- [MCP Stockfish (chess engine)](https://github.com/sonirico/mcp-stockfish)

## Upstream Directories & Indexes

These repositories serve as primary entry points for full-spectrum expansion. They may contain duplicates, stale projects, or variable quality — they are not individually verified by this directory.

- [abordage/awesome-mcp](https://github.com/abordage/awesome-mcp) — continuously updated MCP directory covering development, data, finance, security, healthcare, maps, media, social, and more.
- [mcpHQ/awesome-mcp-servers](https://github.com/mcpHQ/awesome-mcp-servers) — comprehensive MCP server directory with development, browser, file, cloud, communication, AI, data, legal, security, financial, and business applications.
- [anthropics/skills](https://github.com/anthropics/skills) — Agent Skills example projects.
- [awesome-mcp-servers topic](https://github.com/topics/mcp-server) — GitHub MCP Server topic page.
- [agent-skills topic](https://github.com/topics/agent-skills) — GitHub Agent Skills topic page.
- [ai-agent-tools topic](https://github.com/topics/ai-agent-tools) — GitHub AI Agent Tools topic page.
- [awesome-hardware-skills](https://github.com/chopinfeng/awesome-hardware-skills) — hardware, industrial, and embedded specialized directory.
- [awesome-aec-mcp](https://github.com/Daviidro/awesome-aec-mcp) — AEC / CAD / BIM specialized directory.
- [geo-mcp-servers](https://github.com/sparkgeo/geo-mcp-servers) — GIS / maps / remote sensing specialized directory.
- [awesome-seo-mcp-servers](https://github.com/sharozdawa/awesome-seo-mcp-servers) — SEO / digital marketing specialized directory.

## Inclusion & Quality Criteria

Each entry should ideally maintain the following fields:

1. **Name**: Tool or project name, avoid marketing-style descriptions.
2. **GitHub Repository**: Direct link to the source repo.
3. **Domain**: Industry category and sub-scenarios; multi-label allowed.
4. **Shovel Type**: MCP, Skill, CLI, Plugin, SDK/API, Automation, Data/File Processing.
5. **Core Capability**: One-sentence description of what the AI can actually do.
6. **Status**: Recent commit date, archived or not, issue responsiveness, runnable or not — must verify before marking.
7. **License**: License type; mark as "unverified" when unclear — never assume commercial usability.
8. **Run & Cost**: Local/cloud, requires secrets, generates API charges.
9. **Security Level**: Read-only, write-capable, command-executing, sensitive-data-access; dangerous operations need special flags.

Projects are not auto-included just because they support MCP, nor default-included because the repo name contains AI/MCP. Prioritize tools that accomplish clear tasks, then deduplicate, verify runnability, check license, last commit time, and security permissions.

## Contributing

Issues and Pull Requests welcome. To add an entry, use this format and describe its real-world use case:

```markdown
- [Shovel Name (specific use case)](https://github.com/owner/repository)
```

Do not submit tutorial-only screenshots, broken links, pure prompt collections (unless their skills/workflow execute directly), or unverifiable binary download links. Projects involving security, healthcare, finance, industrial control, or real device control need explicit risk and permission annotations.

## Source & Timeline

- Initial discovery & curation round: 2026-10-29.
- Discovery entry points are primarily GitHub repos and GitHub Topics, including `abordage/awesome-mcp`, `mcpHQ/awesome-mcp-servers`, `anthropics/skills`, plus specialized directories for GIS / AEC / SEO / Hardware.
- Repository names and purposes in this directory are provisional categorizations; each project's current maintenance status, license, installation method, and security still needs verification against the latest repo page.
