/* =========================================================
   AI Shovel Collection — i18n 国际化核心
   支持 zh-CN（简体中文）/ en（English）/ zh-TW（繁體中文）
   ========================================================= */
(function () {
  'use strict';

  var CATEGORY_TRANSLATIONS = {
    'en': {
      '1. 目录、Skills 与通用 AI 工具适配': 'Directory, Skills & General AI Tools',
      '2. 浏览器、网页检索、抓取与自动化': 'Browser, Web Search, Scraping & Automation',
      '3. 文件、Office、PDF、文档与出版': 'Files, Office, PDF, Documents & Publishing',
      '4. 编程、代码库、Git 与开发者工作流': 'Coding, Repos, Git & Dev Workflow',
      '5. 数据库、数据分析、BI 与可视化': 'Database, Data Analysis, BI & Visualization',
      '6. 云平台、DevOps、监控与基础设施': 'Cloud, DevOps, Monitoring & Infrastructure',
      '7. 邮件、通信、日历与团队协作': 'Email, Messaging, Calendar & Collaboration',
      '8. 财务、会计、投资与区块链': 'Finance, Accounting, Investment & Blockchain',
      '9. 电商、零售、营销与社交媒体': 'E-commerce, Retail, Marketing & Social',
      '9A. 中国本土平台适配（单独列出）': 'China-Native Platform Adapters',
      '10. 设计、图片、视频、音频与创意生产': 'Design, Images, Video, Audio & Creative',
      '11. CAD、BIM、工程、地理空间与地图': 'CAD, BIM, Engineering, Geospatial & Maps',
      '12. 医疗、健康、生物信息与实验室科研': 'Healthcare, Bioinformatics & Lab Research',
      '13. 工业制造、PLC、IoT、硬件与机器人': 'Industrial, PLC, IoT, Hardware & Robotics',
      '14. 汽车、车辆诊断与游戏开发': 'Automotive, Vehicle Diagnostics & Game Dev',
      '15. 政务、法律、公共数据、专利与安全': 'Gov, Legal, Public Data, Patents & Security',
      '16. 物流、航空、旅游、招聘与其他垂直应用': 'Logistics, Aviation, Travel, HR & Other Vertical Apps'
    },
    'zh-TW': {
      '1. 目录、Skills 与通用 AI 工具适配': '目錄、Skills 與通用 AI 工具適配',
      '2. 浏览器、网页检索、抓取与自动化': '瀏覽器、網頁檢索、抓取與自動化',
      '3. 文件、Office、PDF、文档与出版': '檔案、Office、PDF、文件與出版',
      '4. 编程、代码库、Git 与开发者工作流': '程式、程式碼庫、Git 與開發者工作流',
      '5. 数据库、数据分析、BI 与可视化': '資料庫、資料分析、BI 與視覺化',
      '6. 云平台、DevOps、监控与基础设施': '雲平台、DevOps、監控與基礎設施',
      '7. 邮件、通信、日历与团队协作': '郵件、通信、日曆與團隊協作',
      '8. 财务、会计、投资与区块链': '財務、會計、投資與區塊鏈',
      '9. 电商、零售、营销与社交媒体': '電商、零售、行銷與社交媒體',
      '9A. 中国本土平台适配（单独列出）': '中國本土平台適配（單獨列出）',
      '10. 设计、图片、视频、音频与创意生产': '設計、圖片、影片、音訊與創意生產',
      '11. CAD、BIM、工程、地理空间与地图': 'CAD、BIM、工程、地理空間與地圖',
      '12. 医疗、健康、生物信息与实验室科研': '醫療、健康、生物資訊與實驗室科研',
      '13. 工业制造、PLC、IoT、硬件与机器人': '工業製造、PLC、IoT、硬體與機器人',
      '14. 汽车、车辆诊断与游戏开发': '汽車、車輛診斷與遊戲開發',
      '15. 政务、法律、公共数据、专利与安全': '政務、法律、公共資料、專利與安全',
      '16. 物流、航空、旅游、招聘与其他垂直应用': '物流、航空、旅遊、招聘與其他垂直應用'
    }
  };

  function tCategory(rawCat, lang) {
    if (!rawCat) return rawCat;
    if (!lang || lang === 'zh-CN') return rawCat;
    var map = CATEGORY_TRANSLATIONS[lang];
    if (!map) return rawCat;
    return map[rawCat] || rawCat;
  }

  var UI = {
    // === Meta ===
    'meta.title': {
      'zh-CN': 'AI 铲子大全 · AI Shovel Collection — 开放的 AI 工具与能力目录',
      'en': 'AI Shovel Collection — The Open Directory for AI Tools & Capabilities',
      'zh-TW': 'AI 鏟子大全 · AI Shovel Collection — 開放的 AI 工具與能力目錄'
    },
    'meta.desc': {
      'zh-CN': 'AI Shovel Collection — 社区精选 + Pipeline 自动发现 + 端点实测的开放 AI 工具目录。每 6 小时同步。',
      'en': 'AI Shovel Collection — An open directory of AI tools: community-curated + pipeline-discovered + endpoint-verified. Synced every 6h.',
      'zh-TW': 'AI Shovel Collection — 社區精選 + Pipeline 自動發現 + 端點實測的開放 AI 工具目錄。每 6 小時同步。'
    },

    // === Navbar ===
    'nav.skip': { 'zh-CN': '跳到主要内容', 'en': 'Skip to main content', 'zh-TW': '跳到主要內容' },
    'nav.aria': { 'zh-CN': '主导航', 'en': 'Main navigation', 'zh-TW': '主導航' },
    'nav.brand': { 'zh-CN': 'AI Shovel Collection', 'en': 'AI Shovel Collection', 'zh-TW': 'AI Shovel Collection' },
    'nav.home': { 'zh-CN': '🏠 首页', 'en': '🏠 Home', 'zh-TW': '🏠 首頁' },
    'nav.curated': { 'zh-CN': '📦 已收录', 'en': '📦 Curated', 'zh-TW': '📦 已收錄' },
    'nav.candidates': { 'zh-CN': '🧭 候选', 'en': '🧭 Candidates', 'zh-TW': '🧭 候選' },
    'nav.domains': { 'zh-CN': '🌍 领域检索', 'en': '🌍 Domain Search', 'zh-TW': '🌍 領域檢索' },
    'nav.submit': { 'zh-CN': '📥 提交收录', 'en': '📥 Submit', 'zh-TW': '📥 提交收錄' },
    'nav.github': { 'zh-CN': 'GitHub ↗', 'en': 'GitHub ↗', 'zh-TW': 'GitHub ↗' },
    'nav.githubSr': { 'zh-CN': '（在新标签页打开）', 'en': '(opens in new tab)', 'zh-TW': '（在新標籤頁打開）' },
    'nav.langTitle': { 'zh-CN': '语言 / Language / 語言', 'en': 'Language', 'zh-TW': '語言' },

    // === Hero ===
    'hero.eyebrow': {
      'zh-CN': '⛏️ Discover · Verify · Community — 开放的 AI 工具与能力目录',
      'en': '⛏️ Discover · Verify · Community — The Open Directory for AI Tools & Capabilities',
      'zh-TW': '⛏️ Discover · Verify · Community — 開放的 AI 工具與能力目錄'
    },
    'hero.h1': {
      'zh-CN': '发现让 AI 真正<span class="grad">动手干活</span>的铲子',
      'en': 'Find the shovels that make AI <span class="grad">actually do work</span>',
      'zh-TW': '發現讓 AI 真正<span class="grad">動手幹活</span>的鏟子'
    },
    'hero.sub': {
      'zh-CN': '社区精选 <b id="heroCount">{count}</b> 条 + Pipeline 自动发现候选 · 端点实测验证 · 每 6 小时同步 stars、更新时间、语言与端点状态。',
      'en': '<b id="heroCount">{count}</b> community-curated entries + pipeline-discovered candidates · Endpoint-verified · Stars, push-time, language synced every 6h.',
      'zh-TW': '社區精選 <b id="heroCount">{count}</b> 條 + Pipeline 自動發現候選 · 端點實測驗證 · 每 6 小時同步 stars、更新時間、語言與端點狀態。'
    },
    'hero.searchPlaceholder': {
      'zh-CN': '你想让 AI 做什么？搜索工具或具体任务……',
      'en': 'What do you want AI to do? Search tools or tasks…',
      'zh-TW': '你想讓 AI 做什麼？搜索工具或具體任務……'
    },
    'hero.tryIt': { 'zh-CN': '试试：', 'en': 'Try:', 'zh-TW': '試試：' },
    'hero.ex1': { 'zh-CN': '自动制作 PPT', 'en': 'Auto-make PPT', 'zh-TW': '自動製作 PPT' },
    'hero.ex2': { 'zh-CN': '分析 Excel', 'en': 'Analyze Excel', 'zh-TW': '分析 Excel' },
    'hero.ex3': { 'zh-CN': '画 CAD / 3D', 'en': 'CAD / 3D drawing', 'zh-TW': '畫 CAD / 3D' },
    'hero.ex4': { 'zh-CN': '部署 Docker', 'en': 'Deploy Docker', 'zh-TW': '部署 Docker' },
    'hero.ex5': { 'zh-CN': '浏览器自动化', 'en': 'Browser automation', 'zh-TW': '瀏覽器自動化' },
    'hero.ex6': { 'zh-CN': '接飞书 / 钉钉', 'en': 'Feishu / DingTalk adapter', 'zh-TW': '接飛書 / 釘釘' },
    'hero.taskTitle': { 'zh-CN': '🙋 你希望 AI 帮你完成什么工作？', 'en': '🙋 What do you want AI to help with?', 'zh-TW': '🙋 你希望 AI 幫你完成什麼工作？' },
    'hero.taskHint': { 'zh-CN': '按任务跳转对应分类，不需要先懂 MCP', 'en': 'Jump by task, no need to know MCP first', 'zh-TW': '按任務跳轉對應分類，不需要先懂 MCP' },

    // === Stats ===
    'stats.curatedLabel': { 'zh-CN': '已收录工具', 'en': 'Curated Tools', 'zh-TW': '已收錄工具' },
    'stats.syncedLabel': { 'zh-CN': 'GitHub 已同步', 'en': 'GitHub Synced', 'zh-TW': 'GitHub 已同步' },
    'stats.candLabel': { 'zh-CN': '自动发现候选', 'en': 'Candidates', 'zh-TW': '候選' },
    'stats.verifyLabel': { 'zh-CN': '端点实测通过', 'en': 'Verified', 'zh-TW': '端點實測' },
    'stats.starsLabel': { 'zh-CN': '累计 Stars', 'en': 'Total Stars', 'zh-TW': '累計 Stars' },
    'stats.catsLabel': { 'zh-CN': '细分分类', 'en': 'Categories', 'zh-TW': '細分分類' },
    'stats.legend': {
      'zh-CN': '统计口径：目录收录 {n} · 已同步 {s} · 候选 {c} · 实测 {v}，随数据文件动态计算。',
      'en': 'Stats: Curated {n} · Synced {s} · Candidates {c} · Verified {v}. All dynamic.',
      'zh-TW': '統計口徑：目錄收錄 {n} · 已同步 {s} · 候選 {c} · 實測 {v}，隨資料檔案動態計算。'
    },

    // === Tabs ===
    'tab.curated': { 'zh-CN': '📦 精选工具', 'en': '📦 Curated', 'zh-TW': '📦 精選' },
    'tab.candidates': { 'zh-CN': '🧭 自动发现', 'en': '🧭 Candidates', 'zh-TW': '🧭 候選' },
    'tab.live': { 'zh-CN': '🌐 GitHub 实时搜索', 'en': '🌐 GitHub Live', 'zh-TW': '🌐 GitHub 即時' },

    // === Sort ===
    'sort.label': { 'zh-CN': '排序', 'en': 'Sort', 'zh-TW': '排序' },
    'sort.default': { 'zh-CN': '默认（按分类）', 'en': 'Default (by category)', 'zh-TW': '預設（按分類）' },
    'sort.stars': { 'zh-CN': '⭐ Stars 最多', 'en': '⭐ Most Stars', 'zh-TW': '⭐ Stars 最多' },
    'sort.recent': { 'zh-CN': '🆕 最近更新', 'en': '🆕 Recently Updated', 'zh-TW': '🆕 最近更新' },
    'sort.verified': { 'zh-CN': '✅ 已核验优先', 'en': '✅ Verified First', 'zh-TW': '✅ 已核驗優先' },

    // === Chips / Meta filters ===
    'chip.all': { 'zh-CN': '全部', 'en': 'All', 'zh-TW': '全部' },
    'chip.recent': { 'zh-CN': '🆕 近 7 天更新', 'en': '🆕 Updated 7 days', 'zh-TW': '🆕 近 7 天更新' },
    'chip.recentTitle': {
      'zh-CN': '最近 7 天内有提交/新发布的工具，每 6 小时同步后自动更新',
      'en': 'Tools with commits/releases in last 7 days, auto-updated every 6h sync',
      'zh-TW': '最近 7 天內有提交/新發布的工具，每 6 小時同步後自動更新'
    },
    'chip.toggle': { 'zh-CN': '🏷️ 折叠分类', 'en': '🏷️ Collapse', 'zh-TW': '🏷️ 折疊' },
    'chip.toggleExpand': { 'zh-CN': '📂 展开分类', 'en': '📂 Expand', 'zh-TW': '📂 展開' },

    'mf.lang': { 'zh-CN': '语言', 'en': 'Language', 'zh-TW': '語言' },
    'mf.langAll': { 'zh-CN': '全部', 'en': 'All', 'zh-TW': '全部' },
    'mf.stars': { 'zh-CN': 'Stars', 'en': 'Stars', 'zh-TW': 'Stars' },
    'mf.starsAll': { 'zh-CN': '不限', 'en': 'Any', 'zh-TW': '不限' },
    'mf.starsOpt100': { 'zh-CN': '≥ 100 ⭐', 'en': '≥ 100 ⭐', 'zh-TW': '≥ 100 ⭐' },
    'mf.starsOpt1k': { 'zh-CN': '≥ 1,000 ⭐', 'en': '≥ 1,000 ⭐', 'zh-TW': '≥ 1,000 ⭐' },
    'mf.starsOpt5k': { 'zh-CN': '≥ 5,000 ⭐', 'en': '≥ 5,000 ⭐', 'zh-TW': '≥ 5,000 ⭐' },
    'mf.fresh': { 'zh-CN': '更新时间', 'en': 'Last update', 'zh-TW': '更新時間' },
    'mf.freshAll': { 'zh-CN': '不限', 'en': 'Any', 'zh-TW': '不限' },
    'mf.freshOpt7': { 'zh-CN': '近 7 天', 'en': '7 days', 'zh-TW': '近 7 天' },
    'mf.freshOpt30': { 'zh-CN': '近 30 天', 'en': '30 days', 'zh-TW': '近 30 天' },
    'mf.freshOpt90': { 'zh-CN': '近 90 天', 'en': '90 days', 'zh-TW': '近 90 天' },
    'mf.reset': { 'zh-CN': '↺ 重置', 'en': '↺ Reset', 'zh-TW': '↺ 重置' },

    // === Curated section ===
    'curated.h2': { 'zh-CN': '📦 已收录的铲子', 'en': '📦 Curated Shovels', 'zh-TW': '📦 已收錄的鏟子' },
    'curated.unverified': { 'zh-CN': '👤 人工筛选', 'en': '👤 Human-curated', 'zh-TW': '👤 人工篩選' },
    'curated.syncing': { 'zh-CN': '实时数据同步中…', 'en': 'Syncing live data…', 'zh-TW': '即時資料同步中…' },

    // === Candidates ===
    'cand.h2': { 'zh-CN': '🧭 自动发现的候选', 'en': '🧭 Auto-discovered', 'zh-TW': '🧭 自動發現候選' },
    'cand.apply': { 'zh-CN': '🔍 申请入精选', 'en': '🔍 Apply for curation', 'zh-TW': '🔍 申請入精選' },
    'cand.new': { 'zh-CN': '🆕 新增', 'en': '🆕 New', 'zh-TW': '🆕 新增' },

    // === Buttons ===
    'btn.detail': { 'zh-CN': '详情', 'en': 'Detail', 'zh-TW': '詳情' },
    'btn.cfg': { 'zh-CN': '📋 配置', 'en': '📋 Config', 'zh-TW': '📋 配置' },

    // === Count / status text ===
    'count.all': { 'zh-CN': '条', 'en': 'entries', 'zh-TW': '條' },
    'count.zero': { 'zh-CN': '无结果', 'en': 'No results', 'zh-TW': '無結果' },
    'count.found': { 'zh-CN': '找到 {n} 条', 'en': '{n} found', 'zh-TW': '找到 {n} 條' },

    // === Empty states ===
    'empty.curated': {
      'zh-CN': '本地目录没有匹配 <b>{q}</b> 的工具 —— 试试切换到「自动发现」或「GitHub 实时搜索」？',
      'en': 'No tools match <b>{q}</b> —— try Candidates tab or GitHub Live Search?',
      'zh-TW': '本地目錄沒有匹配 <b>{q}</b> 的工具 —— 試試切換到「自動發現」或「GitHub 即時搜索」？'
    },
    'empty.candidates': { 'zh-CN': '没有匹配的候选条目', 'en': 'No matching candidates', 'zh-TW': '沒有匹配的候選條目' },
    'empty.noCand': { 'zh-CN': '暂时没有自动发现的候选条目', 'en': 'No auto-discovered candidates yet', 'zh-TW': '暫無候選條目' },

    // === Config modal tier titles ===
    'cfg.title': { 'zh-CN': '📋 生成 MCP 配置', 'en': '📋 Generate MCP Config', 'zh-TW': '📋 生成 MCP 配置' },
    'cfg.copyJson': { 'zh-CN': '复制 JSON', 'en': 'Copy JSON', 'zh-TW': '複製 JSON' },
    'cfg.tier.ok': { 'zh-CN': '✅ 已验证配置', 'en': '✅ Verified Config', 'zh-TW': '✅ 已驗證配置' },
    'cfg.tier.auth': { 'zh-CN': '🔑 端点需鉴权', 'en': '🔑 Auth Required', 'zh-TW': '🔑 端點需鑑權' },
    'cfg.tier.fail': { 'zh-CN': '❌ 端点无响应', 'en': '❌ Endpoint Unreachable', 'zh-TW': '❌ 端點無響應' },
    'cfg.tier.auto': { 'zh-CN': '⚠️ 自动推断配置（请核对 README）', 'en': '⚠️ Auto-inferred (check README)', 'zh-TW': '⚠️ 自動推斷配置（請核對 README）' },
    'cfg.auth': {
      'zh-CN': '⚠️ 此端点可能需要 API Key。JSON 包含占位符，使用前请替换。',
      'en': '⚠️ This endpoint may require an API key. JSON contains a placeholder.',
      'zh-TW': '⚠️ 此端點可能需要 API Key。JSON 包含佔位符，使用前請替換。'
    },
    'cfg.fail': {
      'zh-CN': '⚠️ Pipeline 实测此端点当前不可用。生成的配置仅供参考。',
      'en': '⚠️ Pipeline found this endpoint unreachable. Config is for reference only.',
      'zh-TW': '⚠️ Pipeline 實測此端點當前不可用。生成的配置僅供參考。'
    },
    'cfg.autoInfer': {
      'zh-CN': '⚠️ 端点状态未实测，配置由 Pipeline 自动推断，可能不准确。',
      'en': '⚠️ Endpoint status unknown. Config auto-inferred — may be inaccurate.',
      'zh-TW': '⚠️ 端點狀態未實測，配置由 Pipeline 自動推斷，可能不準確。'
    },
    'cfg.noEndpoint': {
      'zh-CN': '此工具未检测到 MCP 端点 — 无法自动生成配置。请查看项目 README。',
      'en': 'No MCP endpoint detected — cannot auto-generate config. See project README.',
      'zh-TW': '此工具未檢測到 MCP 端點 — 無法自動生成配置。請查看專案 README。'
    },

    // === Drawer ===
    'drawer.title': { 'zh-CN': '工具详情', 'en': 'Tool Details', 'zh-TW': '工具詳情' },
    'drawer.source': { 'zh-CN': '来源', 'en': 'Source', 'zh-TW': '來源' },
    'drawer.category': { 'zh-CN': '分类', 'en': 'Category', 'zh-TW': '分類' },
    'drawer.endpoint': { 'zh-CN': '端点', 'en': 'Endpoint', 'zh-TW': '端點' },
    'drawer.endpointEmpty': { 'zh-CN': '（未检测到 MCP 端点）', 'en': '(No MCP endpoint)', 'zh-TW': '（未檢測到 MCP 端點）' },
    'drawer.lang': { 'zh-CN': '语言', 'en': 'Language', 'zh-TW': '語言' },
    'drawer.stars': { 'zh-CN': 'Stars', 'en': 'Stars', 'zh-TW': 'Stars' },
    'drawer.updated': { 'zh-CN': '最后更新', 'en': 'Last Updated', 'zh-TW': '最後更新' },
    'drawer.license': { 'zh-CN': '许可证', 'en': 'License', 'zh-TW': '許可證' },
    'drawer.deploySection': { 'zh-CN': '部署与使用提示', 'en': 'Deployment & Usage', 'zh-TW': '部署與使用提示' },
    'drawer.endpointOk': { 'zh-CN': '端点实测 ✓ 在线', 'en': 'Endpoint ✓ Online', 'zh-TW': '端點實測 ✓ 在線' },
    'drawer.endpointFail': { 'zh-CN': '端点实测 ✗ 不可用', 'en': 'Endpoint ✗ Unreachable', 'zh-TW': '端點實測 ✗ 不可用' },
    'drawer.endpointAuth': { 'zh-CN': '端点需鉴权', 'en': 'Auth required', 'zh-TW': '端點需鑑權' },
    'drawer.endpointUnknown': { 'zh-CN': '端点状态未知', 'en': 'Endpoint unknown', 'zh-TW': '端點狀態未知' },
    'drawer.endpointClickCopy': { 'zh-CN': '点击复制', 'en': 'Click to copy', 'zh-TW': '點擊複製' },
    'drawer.deployMethod': { 'zh-CN': '部署方式', 'en': 'Deployment', 'zh-TW': '部署方式' },
    'drawer.deployRemote': { 'zh-CN': '🖥️ 远程端点（免安装，粘贴配置即用）', 'en': '🖥️ Remote endpoint (no install, paste config)', 'zh-TW': '🖥️ 遠端端點（免安裝，貼上配置即用）' },
    'drawer.deployLocalPy': { 'zh-CN': '💻 本地（uvx / uv）— 无远程端点', 'en': '💻 Local (uvx / uv) — no remote endpoint', 'zh-TW': '💻 本地（uvx / uv）— 無遠端端點' },
    'drawer.deployLocalNpx': { 'zh-CN': '💻 本地（按 README，通常 npx）', 'en': '💻 Local (per README, typically npx)', 'zh-TW': '💻 本地（按 README，通常 npx）' },
    'drawer.deployLocalUnknown': { 'zh-CN': '💻 本地（请查看项目 README）', 'en': '💻 Local (see project README)', 'zh-TW': '💻 本地（請查看專案 README）' },

    // === Live search status ===
    'live.searching': { 'zh-CN': '🔍 正在请求 GitHub Search API…', 'en': '🔍 Querying GitHub…', 'zh-TW': '🔍 正在請求 GitHub…' },
    'live.noMore': { 'zh-CN': 'GitHub 全站没有更多未收录的匹配', 'en': 'No more uncurated matches on GitHub', 'zh-TW': 'GitHub 全站沒有更多未收錄的匹配' },
    'live.total': { 'zh-CN': '共 {n} 条，展示前 {s} 条', 'en': '{n} total, showing top {s}', 'zh-TW': '共 {n} 條，展示前 {s} 條' },
    'live.rateLimited': { 'zh-CN': 'GitHub 免费搜索限流（每分钟 10 次），请稍后再试', 'en': 'GitHub rate-limited (10/min). Wait and retry.', 'zh-TW': 'GitHub 免費搜索限流（每分鐘 10 次），請稍後再試' },
    'live.h2': { 'zh-CN': '🌐 GitHub 实时搜索', 'en': '🌐 GitHub Live', 'zh-TW': '🌐 GitHub 即時搜索' },
    'live.btn': { 'zh-CN': '🌐 搜索 GitHub 全站', 'en': '🌐 Search GitHub Live', 'zh-TW': '🌐 搜索 GitHub 全站' },

    // === Source badges (JS-rendered) ===
    'src.catalog': { 'zh-CN': '👤 精选', 'en': '👤 Curated', 'zh-TW': '👤 精選' },
    'src.registry': { 'zh-CN': '📋 Registry', 'en': '📋 Registry', 'zh-TW': '📋 Registry' },
    'src.github': { 'zh-CN': '🔍 GitHub', 'en': '🔍 GitHub', 'zh-TW': '🔍 GitHub' },
    'src.npm': { 'zh-CN': '📦 npm', 'en': '📦 npm', 'zh-TW': '📦 npm' },
    'src.crates': { 'zh-CN': '🦀 crates.io', 'en': '🦀 crates.io', 'zh-TW': '🦀 crates.io' },
    'src.inbox': { 'zh-CN': '✉️ Inbox', 'en': '✉️ Inbox', 'zh-TW': '✉️ Inbox' },

    // === Endpoint pills ===
    'ep.ok': { 'zh-CN': '端点 ✓ 在线', 'en': 'Endpoint ✓', 'zh-TW': '端點 ✓ 在線' },
    'ep.fail': { 'zh-CN': '端点 ✗ 不可用', 'en': 'Endpoint ✗', 'zh-TW': '端點 ✗ 不可用' },
    'ep.auth': { 'zh-CN': '端点需鉴权', 'en': 'Auth required', 'zh-TW': '端點需鑑權' },
    'ep.unknown': { 'zh-CN': '端点状态未知', 'en': 'Endpoint unknown', 'zh-TW': '端點狀態未知' },

    // === Activity badges ===
    'act.active': { 'zh-CN': '🟢 活跃', 'en': '🟢 Active', 'zh-TW': '🟢 活躍' },
    'act.warm': { 'zh-CN': '🟡 转凉', 'en': '🟡 Cooling', 'zh-TW': '🟡 轉涼' },
    'act.cold': { 'zh-CN': '⚪ 沉寂', 'en': '⚪ Dormant', 'zh-TW': '⚪ 沉寂' },
    'act.archived': { 'zh-CN': '🪦 归档', 'en': '🪦 Archived', 'zh-TW': '🪦 歸檔' },

    // === Task chips ===
    'task.browser': { 'zh-CN': '🌐 浏览器自动化', 'en': '🌐 Browser automation', 'zh-TW': '🌐 瀏覽器自動化' },
    'task.file': { 'zh-CN': '📄 文件 / PDF', 'en': '📄 Files / PDF', 'zh-TW': '📄 檔案 / PDF' },
    'task.code': { 'zh-CN': '💻 编程 / Git', 'en': '💻 Coding / Git', 'zh-TW': '💻 程式 / Git' },
    'task.db': { 'zh-CN': '🗄️ 数据库', 'en': '🗄️ Database', 'zh-TW': '🗄️ 資料庫' },
    'task.cloud': { 'zh-CN': '☁️ 云 / DevOps', 'en': '☁️ Cloud / DevOps', 'zh-TW': '☁️ 雲 / DevOps' },
    'task.comm': { 'zh-CN': '📧 邮件 / 协作', 'en': '📧 Email / Collab', 'zh-TW': '📧 郵件 / 協作' },
    'task.finance': { 'zh-CN': '💰 金融', 'en': '💰 Finance', 'zh-TW': '💰 金融' },
    'task.ecom': { 'zh-CN': '🛒 电商', 'en': '🛒 E-commerce', 'zh-TW': '🛒 電商' },
    'task.design': { 'zh-CN': '🎨 设计 / 音视频', 'en': '🎨 Design / AV', 'zh-TW': '🎨 設計 / 音影片' },
    'task.engineering': { 'zh-CN': '🔧 CAD / 工程 / 工业', 'en': '🔧 CAD / Eng / Ind', 'zh-TW': '🔧 CAD / 工程 / 工業' },

    // === Footer ===
    'footer.disclaimer': {
      'zh-CN': '被收录不代表项目安全、活跃、可商用或质量已背书；使用前请自行检查许可证、维护状态、权限和数据安全。欢迎通过 Issue / PR 补充与纠错。',
      'en': 'Inclusion does not imply safety, activity, fitness for commercial use, or quality endorsement. Check license, maintenance, permissions yourself. Contributions welcome.',
      'zh-TW': '被收錄不代表專案安全、活躍、可商用或質量已背書；使用前請自行檢查許可證、維護狀態、權限和資料安全。歡迎透過 Issue / PR 補充與糾錯。'
    }
  };

  // -------- 核心 --------
  var STORAGE_KEY = 'ai-shovels:lang';
  var SUPPORTED = ['zh-CN', 'en', 'zh-TW'];

  function detectBrowserLang() {
    if (!navigator.languages || !navigator.languages.length) return 'zh-CN';
    for (var i = 0; i < navigator.languages.length; i++) {
      var raw = navigator.languages[i];
      if (raw.indexOf('zh') === 0) {
        if (raw.indexOf('TW') !== -1 || raw.indexOf('HK') !== -1 || raw.indexOf('MO') !== -1) return 'zh-TW';
        return 'zh-CN';
      }
      if (raw.indexOf('en') === 0) return 'en';
    }
    return 'zh-CN';
  }

  function getLang() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    return detectBrowserLang();
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;
    I18n.currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyLang(lang);
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    var sel = document.getElementById('langSelect');
    if (sel && sel.value !== lang) sel.value = lang;
    applyDataI18n(lang);
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: lang } }));
  }

  function _t(key, params, opts) {
    var entry = UI[key];
    if (!entry) return key;
    var lang = (opts && opts.lang) || I18n.currentLang || getLang();
    var text = entry[lang] || entry['zh-CN'] || key;
    if (params && typeof params === 'object') {
      text = text.replace(/\{(\w+)\}/g, function (_, k) {
        return params[k] !== undefined ? params[k] : '';
      });
    }
    return text;
  }

  function applyDataI18n(lang) {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute('data-i18n');
      var entry = UI[key];
      if (!entry) continue;
      var text = entry[lang] || entry['zh-CN'] || key;
      var attr = node.getAttribute('data-i18n-attr');
      if (attr) {
        node.setAttribute(attr, text);
      } else if (node.getAttribute('data-i18n-html') === 'true') {
        node.innerHTML = text;
      } else {
        node.textContent = text;
      }
    }
    document.title = _t('meta.title');
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = _t('meta.desc');
    var ghSr = document.querySelector('.gh .sr-only');
    if (ghSr) ghSr.textContent = _t('nav.githubSr');
    var hitImg = document.querySelector('.hits-badge');
    if (hitImg) hitImg.alt = _t('nav.langTitle');
    var sel = document.getElementById('langSelect');
    if (sel) {
      sel.title = _t('nav.langTitle');
      sel.setAttribute('aria-label', _t('nav.langTitle'));
    }
  }

  function init() {
    var lang = getLang();
    I18n.currentLang = lang;
    applyLang(lang);
  }

  var I18n = {
    currentLang: 'zh-CN',
    supported: SUPPORTED,
    getLang: getLang,
    setLang: setLang,
    _t: _t,
    tCategory: tCategory,
    init: init,
    applyDataI18n: applyDataI18n,
    detectBrowserLang: detectBrowserLang,
    UI: UI
  };

  window._t = _t;
  window.I18n = I18n;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
