/* =========================================================
   AI Shovel Collection — i18n 国际化核心
   支持 zh-CN（简体中文）/ en（English）/ zh-TW（繁體中文）
   ========================================================= */

(function () {
  'use strict';

  // --------- 1. 分类名翻译映射 ---------
  // key = catalog.csv 中的原始中文分类名（含编号前缀）
  var CATEGORY_TRANSLATIONS = {
    // en
    'en': {
      '1. 目录、Skills 与通用 AI 工具适配': 'Directory, Skills & General AI Tools',
      '2. 浏览器、网页检索、抓取与自动化': 'Browser, Web Search, Scraping & Automation',
      '3. 文件、Office、PDF、文档与出版': 'Files, Office, PDF, Documents & Publishing',
      '4. 编程、代码库、Git 与开发者工作流': 'Coding, Repositories, Git & Dev Workflow',
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
    // zh-TW
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

  /**
   * 翻译分类名
   * @param {string} rawCat - catalog.csv 原始分类（含编号，如 "2. 浏览器..."）
   * @param {string} lang - 目标语言
   * @returns {string} 翻译后的分类名（保留编号前缀）
   */
  function tCategory(rawCat, lang) {
    if (!rawCat) return rawCat;
    if (!lang || lang === 'zh-CN') return rawCat; // 简体原文直接返回
    var map = CATEGORY_TRANSLATIONS[lang];
    if (!map) return rawCat;
    var translated = map[rawCat];
    return translated || rawCat;
  }

  // --------- 2. UI 文案翻译字典 ---------
  // 格式：{ "key": { "zh-CN": "...", "en": "...", "zh-TW": "..." } }
  var UI = {
    // === Meta ===
    'meta.title': {
      'zh-CN': 'AI 铲子大全 · AI Shovel Collection — 开放的 AI 工具与能力目录',
      'en': 'AI Shovel Collection — The Open Directory for AI Tools & Capabilities',
      'zh-TW': 'AI 鏟子大全 · AI Shovel Collection — 開放的 AI 工具與能力目錄'
    },
    'meta.desc': {
      'zh-CN': 'AI Shovel Collection — 社区精选 + Pipeline 自动发现 + 端点实测的开放 AI 工具目录。发现让 AI 动手干活的 MCP Server、Agent Skills、CLI 与自动化工具，每 6 小时同步元数据与端点状态。',
      'en': 'AI Shovel Collection — An open directory of AI tools: community-curated + pipeline-discovered + endpoint-verified. Find MCP Servers, Agent Skills, CLIs and automation tools that let AI actually get work done. Synced every 6 hours.',
      'zh-TW': 'AI Shovel Collection — 社區精選 + Pipeline 自動發現 + 端點實測的開放 AI 工具目錄。發現讓 AI 動手幹活的 MCP Server、Agent Skills、CLI 與自動化工具，每 6 小時同步元資料與端點狀態。'
    },

    // === Navbar ===
    'nav.brand': { 'zh-CN': 'AI Shovel Collection', 'en': 'AI Shovel Collection', 'zh-TW': 'AI Shovel Collection' },
    'nav.home': { 'zh-CN': '🏠 首页', 'en': '🏠 Home', 'zh-TW': '🏠 首頁' },
    'nav.curated': { 'zh-CN': '📦 已收录', 'en': '📦 Curated', 'zh-TW': '📦 已收錄' },
    'nav.candidates': { 'zh-CN': '🧭 候选', 'en': '🧭 Candidates', 'zh-TW': '🧭 候選' },
    'nav.domains': { 'zh-CN': '🌍 领域检索', 'en': '🌍 Domain Search', 'zh-TW': '🌍 領域檢索' },
    'nav.submit': { 'zh-CN': '📥 提交收录', 'en': '📥 Submit', 'zh-TW': '📥 提交收錄' },
    'nav.github': { 'zh-CN': 'GitHub ↗', 'en': 'GitHub ↗', 'zh-TW': 'GitHub ↗' },
    'nav.openMenu': { 'zh-CN': '打开导航菜单', 'en': 'Open navigation', 'zh-TW': '打開導航選單' },
    'nav.closeMenu': { 'zh-CN': '关闭导航菜单', 'en': 'Close navigation', 'zh-TW': '關閉導航選單' },

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
      'zh-CN': '社区精选 {n} 条 + Pipeline 自动发现候选 · 端点实测验证（ok / fail / 鉴权） · 每 6 小时同步 stars、更新时间、语言与端点状态 · <b>本地实时过滤</b> + <b>GitHub 全站实时搜索</b>双引擎。',
      'en': '{n} community-curated entries + pipeline-discovered candidates · Endpoint-verified (ok / fail / auth-required) · Stars, push-time, language & endpoint status synced every 6 hours · <b>Real-time local filter</b> + <b>GitHub full-site live search</b>.',
      'zh-TW': '社區精選 {n} 條 + Pipeline 自動發現候選 · 端點實測驗證（ok / fail / 鑑權） · 每 6 小時同步 stars、更新時間、語言與端點狀態 · <b>本地即時過濾</b> + <b>GitHub 全站即時搜索</b>雙引擎。'
    },
    'hero.searchPlaceholder': {
      'zh-CN': '你想让 AI 做什么？搜索工具或具体任务……',
      'en': 'What do you want AI to do? Search tools or specific tasks…',
      'zh-TW': '你想讓 AI 做什麼？搜索工具或具體任務……'
    },
    'hero.searchAria': {
      'zh-CN': '搜索已收录的工具',
      'en': 'Search curated tools',
      'zh-TW': '搜索已收錄的工具'
    },
    'hero.clear': { 'zh-CN': '清空', 'en': 'Clear', 'zh-TW': '清空' },
    'hero.clearAria': { 'zh-CN': '清空搜索框', 'en': 'Clear search box', 'zh-TW': '清空搜索框' },

    // === Stats ===
    'stats.curatedLabel': { 'zh-CN': '已收录工具（目录）', 'en': 'Curated Tools', 'zh-TW': '已收錄工具（目錄）' },
    'stats.curatedTitle': { 'zh-CN': 'catalog.csv 中的人工精选行数（目录收录口径）', 'en': 'Human-curated rows in catalog.csv', 'zh-TW': 'catalog.csv 中的人工精選行數（目錄收錄口徑）' },
    'stats.syncedLabel': { 'zh-CN': '已同步 GitHub 元数据', 'en': 'GitHub Metadata Synced', 'zh-TW': '已同步 GitHub 元資料' },
    'stats.syncedTitle': { 'zh-CN': 'live_multi.json 中成功同步 GitHub 元数据的条目数', 'en': 'Entries in live_multi.json with successful GitHub metadata sync', 'zh-TW': 'live_multi.json 中成功同步 GitHub 元資料的條目數' },
    'stats.candLabel': { 'zh-CN': '自动发现候选', 'en': 'Auto-discovered Candidates', 'zh-TW': '自動發現候選' },
    'stats.candTitle': { 'zh-CN': 'Pipeline 从 MCP Registry / npm / crates.io 自动发现的候选条目', 'en': 'Pipeline-discovered candidates from MCP Registry / npm / crates.io', 'zh-TW': 'Pipeline 從 MCP Registry / npm / crates.io 自動發現的候選條目' },
    'stats.verifyLabel': { 'zh-CN': '端点实测通过', 'en': 'Endpoints Verified', 'zh-TW': '端點實測通過' },
    'stats.verifyTitle': { 'zh-CN': 'MCP initialize 握手实测通过的端点数（仅代表端点在线）', 'en': 'MCP initialize handshake passed (endpoint online only, not functionality verified)', 'zh-TW': 'MCP initialize 握手實測通過的端點數（僅代表端點在線）' },
    'stats.starsLabel': { 'zh-CN': '累计 GitHub Stars', 'en': 'Total GitHub Stars', 'zh-TW': '累計 GitHub Stars' },
    'stats.starsTitle': { 'zh-CN': '已收录仓库的 GitHub Stars 累加，每 6 小时同步', 'en': 'Sum of GitHub stars across curated repos, synced every 6h', 'zh-TW': '已收錄倉庫的 GitHub Stars 累加，每 6 小時同步' },
    'stats.catsLabel': { 'zh-CN': '细分分类', 'en': 'Sub-categories', 'zh-TW': '細分分類' },
    'stats.catsTitle': { 'zh-CN': '目录内的细分工具类型', 'en': 'Sub-tool types in the directory', 'zh-TW': '目錄內的細分工具類型' },
    'stats.legend': {
      'zh-CN': '统计口径：<b>目录收录 {n}</b>（catalog.csv 行数）· <b>已同步元数据 {s}</b> · <b>候选 {c}</b> · <b>端点实测 {v}</b>，四个数字口径不同，全部随数据文件动态计算。',
      'en': 'Stats: <b>Curated {n}</b> (catalog.csv rows) · <b>Synced {s}</b> · <b>Candidates {c}</b> · <b>Verified {v}</b>. All computed dynamically from data files.',
      'zh-TW': '統計口徑：<b>目錄收錄 {n}</b>（catalog.csv 行數）· <b>已同步元資料 {s}</b> · <b>候選 {c}</b> · <b>端點實測 {v}</b>，四個數字口徑不同，全部隨資料檔案動態計算。'
    },

    // === Chip / Tab ===
    'chip.all': { 'zh-CN': '全部', 'en': 'All', 'zh-TW': '全部' },
    'chip.recent': { 'zh-CN': '🆕 近 7 天更新', 'en': '🆕 Updated in 7 days', 'zh-TW': '🆕 近 7 天更新' },
    'chip.recentTitle': {
      'zh-CN': '最近 7 天内有提交/新发布的工具，每 6 小时同步后自动更新',
      'en': 'Tools with commits/releases in the last 7 days, auto-updated after each 6h sync',
      'zh-TW': '最近 7 天內有提交/新發布的工具，每 6 小時同步後自動更新'
    },
    'chip.toggle': { 'zh-CN': '🏷️ 分类折叠', 'en': '🏷️ Collapse categories', 'zh-TW': '🏷️ 分類摺疊' },
    'chip.toggleExpand': { 'zh-CN': '📂 分类展示', 'en': '📂 Show categories', 'zh-TW': '📂 分類展示' },

    'tab.curated': { 'zh-CN': '📦 精选工具', 'en': '📦 Curated', 'zh-TW': '📦 精選工具' },
    'tab.candidates': { 'zh-CN': '🧭 自动发现', 'en': '🧭 Candidates', 'zh-TW': '🧭 自動發現' },
    'tab.live': { 'zh-CN': '🌐 GitHub 实时搜索', 'en': '🌐 GitHub Live Search', 'zh-TW': '🌐 GitHub 即時搜索' },

    // === Sort ===
    'sort.label': { 'zh-CN': '排序', 'en': 'Sort', 'zh-TW': '排序' },
    'sort.default': { 'zh-CN': '默认（按分类）', 'en': 'Default (by category)', 'zh-TW': '預設（按分類）' },
    'sort.stars': { 'zh-CN': '⭐ Stars 最多', 'en': '⭐ Most Stars', 'zh-TW': '⭐ Stars 最多' },
    'sort.recent': { 'zh-CN': '🆕 最近更新', 'en': '🆕 Recently Updated', 'zh-TW': '🆕 最近更新' },
    'sort.verified': { 'zh-CN': '✅ 已核验优先', 'en': '✅ Verified First', 'zh-TW': '✅ 已核驗優先' },

    // === Meta Filters ===
    'mf.lang': { 'zh-CN': '按编程语言筛选', 'en': 'Filter by language', 'zh-TW': '按程式語言篩選' },
    'mf.langAll': { 'zh-CN': '全部语言', 'en': 'All languages', 'zh-TW': '全部語言' },
    'mf.stars': { 'zh-CN': '按 GitHub Stars 数量筛选', 'en': 'Filter by GitHub Stars', 'zh-TW': '按 GitHub Stars 數量篩選' },
    'mf.starsAll': { 'zh-CN': '不限 Stars', 'en': 'Any Stars', 'zh-TW': '不限 Stars' },
    'mf.starsOpt100': { 'zh-CN': '≥ 100 ⭐', 'en': '≥ 100 ⭐', 'zh-TW': '≥ 100 ⭐' },
    'mf.starsOpt1k': { 'zh-CN': '≥ 1,000 ⭐', 'en': '≥ 1,000 ⭐', 'zh-TW': '≥ 1,000 ⭐' },
    'mf.starsOpt5k': { 'zh-CN': '≥ 5,000 ⭐', 'en': '≥ 5,000 ⭐', 'zh-TW': '≥ 5,000 ⭐' },
    'mf.fresh': { 'zh-CN': '按最近更新时间筛选', 'en': 'Filter by last update', 'zh-TW': '按最近更新時間篩選' },
    'mf.freshAll': { 'zh-CN': '不限时间', 'en': 'Any time', 'zh-TW': '不限時間' },
    'mf.freshOpt7': { 'zh-CN': '近 7 天', 'en': '7 days', 'zh-TW': '近 7 天' },
    'mf.freshOpt30': { 'zh-CN': '近 30 天', 'en': '30 days', 'zh-TW': '近 30 天' },
    'mf.freshOpt90': { 'zh-CN': '近 90 天', 'en': '90 days', 'zh-TW': '近 90 天' },
    'mf.reset': { 'zh-CN': '↺ 重置', 'en': '↺ Reset', 'zh-TW': '↺ 重置' },
    'mf.resetAria': { 'zh-CN': '清空全部筛选条件', 'en': 'Clear all filters', 'zh-TW': '清空全部篩選條件' },
    'mf.hint': { 'zh-CN': '组合筛选只作用于「已收录」列表', 'en': 'Combined filters only apply to the curated list', 'zh-TW': '組合篩選只作用於「已收錄」列表' },

    // === Curated Section ===
    'curated.h2': { 'zh-CN': '📦 已收录的铲子', 'en': '📦 Curated Shovels', 'zh-TW': '📦 已收錄的鏟子' },
    'curated.unverified': { 'zh-CN': '👤 人工筛选', 'en': '👤 Human-curated', 'zh-TW': '👤 人工篩選' },
    'curated.unverifiedTitle': {
      'zh-CN': '人工筛选入库：仓库存在、用途明确、分类经人工确认；尚未逐项功能实测',
      'en': 'Manually curated: repo exists, purpose clear, category confirmed by human; not yet functionally tested item by item',
      'zh-TW': '人工篩選入庫：倉庫存在、用途明確、分類經人工確認；尚未逐項功能實測'
    },
    'curated.hint': {
      'zh-CN': '分类不是质量排名，收录不代表背书 · <b>已收录 = 人工筛选入库</b>（未逐项功能实测）',
      'en': 'Categories are not quality rankings, inclusion is not endorsement · <b>Curated = human-curated</b> (not functionally tested)',
      'zh-TW': '分類不是質量排名，收錄不代表背書 · <b>已收錄 = 人工篩選入庫</b>（未逐項功能實測）'
    },
    'curated.syncing': { 'zh-CN': '实时数据同步中…', 'en': 'Syncing live data…', 'zh-TW': '即時資料同步中…' },
    'curated.syncTitle': {
      'zh-CN': '仓库 stars / 更新时间由 GitHub Actions 每 6 小时同步',
      'en': 'Stars / last-update synced by GitHub Actions every 6 hours',
      'zh-TW': '倉庫 stars / 更新時間由 GitHub Actions 每 6 小時同步'
    },

    // === Candidates Section ===
    'cand.h2': { 'zh-CN': '🧭 自动发现的候选铲子', 'en': '🧭 Auto-discovered Candidates', 'zh-TW': '🧭 自動發現的候選鏟子' },
    'cand.unverified': { 'zh-CN': '🤖 自动发现', 'en': '🤖 Auto-discovered', 'zh-TW': '🤖 自動發現' },
    'cand.unverifiedTitle': {
      'zh-CN': '机器检索入库：分类与可用性未经人工核验。confidence 是自动匹配分（算法推断可信度），不是工具质量评分',
      'en': 'Machine-indexed: category and usability not human-verified. confidence is algorithm-matched score, not a quality rating',
      'zh-TW': '機器檢索入庫：分類與可用性未經人工核驗。confidence 是自動匹配分（演算法推斷可信度），不是工具質量評分'
    },
    'cand.hint': {
      'zh-CN': 'Pipeline 自动发现的候选，分类由算法推断 · <b>点「🔍 申请入精选」</b> 可提交人工审核',
      'en': 'Pipeline-discovered candidates, category inferred by algorithm · <b>Click "🔍 Apply for curation"</b> to submit for human review',
      'zh-TW': 'Pipeline 自動發現的候選，分類由演算法推斷 · <b>點「🔍 申請入精選」</b>可提交人工審核'
    },
    'cand.apply': { 'zh-CN': '🔍 申请入精选', 'en': '🔍 Apply for curation', 'zh-TW': '🔍 申請入精選' },
    'cand.inbox': { 'zh-CN': '✨ Inbox', 'en': '✨ Inbox', 'zh-TW': '✨ Inbox' },
    'cand.new': { 'zh-CN': '🆕 新增', 'en': '🆕 New', 'zh-TW': '🆕 新增' },

    // === Live Search ===
    'live.h2': { 'zh-CN': '🌐 GitHub 全站实时搜索', 'en': '🌐 GitHub Full-site Live Search', 'zh-TW': '🌐 GitHub 全站即時搜索' },
    'live.hint': {
      'zh-CN': '由 GitHub Search API 实时返回，按 Stars 排序，已收录的仓库自动去重',
      'en': 'Live results from GitHub Search API, sorted by stars, curated repos auto-deduplicated',
      'zh-TW': '由 GitHub Search API 即時返回，按 Stars 排序，已收錄的倉庫自動去重'
    },
    'live.btn': { 'zh-CN': '🌐 立即实时搜索 GitHub 全站', 'en': '🌐 Search GitHub Live Now', 'zh-TW': '🌐 立即即時搜索 GitHub 全站' },
    'live.strip': { 'zh-CN': '点击下方按钮在 GitHub 全站几十亿级仓库中搜索', 'en': 'Click the button below to search billions of repos on GitHub', 'zh-TW': '點擊下方按鈕在 GitHub 全站數十億級倉庫中搜索' },
    'live.noMore': { 'zh-CN': 'GitHub 全站也没有更多未收录的匹配结果', 'en': 'No more uncurated matches found on GitHub', 'zh-TW': 'GitHub 全站也沒有更多未收錄的匹配結果' },

    // === Buttons in Cards ===
    'btn.detail': { 'zh-CN': '详情', 'en': 'Detail', 'zh-TW': '詳情' },
    'btn.cfg': { 'zh-CN': '📋 配置', 'en': '📋 Config', 'zh-TW': '📋 配置' },
    'btn.cfgTitle': {
      'zh-CN': '生成 Claude Desktop / Cursor / VS Code 配置片段',
      'en': 'Generate Claude Desktop / Cursor / VS Code config snippet',
      'zh-TW': '生成 Claude Desktop / Cursor / VS Code 配置片段'
    },
    'btn.source': { 'zh-CN': '来源 ↗', 'en': 'Source ↗', 'zh-TW': '來源 ↗' },
    'btn.github': { 'zh-CN': 'GitHub ↗', 'en': 'GitHub ↗', 'zh-TW': 'GitHub ↗' },

    // === Empty States ===
    'empty.curated': {
      'zh-CN': '本地目录没有匹配 <b>{q}</b> 的工具 —— 试试切换到「自动发现」Tab 或「GitHub 实时搜索」Tab？',
      'en': 'No tools in the local directory match <b>{q}</b> —— try switching to the Candidates tab or GitHub Live Search?',
      'zh-TW': '本地目錄沒有匹配 <b>{q}</b> 的工具 —— 試試切換到「自動發現」Tab 或「GitHub 即時搜索」Tab？'
    },
    'empty.candidates': { 'zh-CN': '没有匹配的候选自动发现条目', 'en': 'No matching candidate entries', 'zh-TW': '沒有匹配的候選自動發現條目' },
    'empty.noCand': { 'zh-CN': '暂时没有自动发现的候选条目', 'en': 'No auto-discovered candidates yet', 'zh-TW': '暫時沒有自動發現的候選條目' },

    // === Count text ===
    'count.all': { 'zh-CN': '条', 'en': 'entries', 'zh-TW': '條' },
    'count.zero': { 'zh-CN': '无结果', 'en': 'No results', 'zh-TW': '無結果' },
    'count.found': { 'zh-CN': '找到 {n} 条', 'en': '{n} found', 'zh-TW': '找到 {n} 條' },

    // === Config modal tier titles ===
    'cfg.tier.ok': { 'zh-CN': '✅ 已验证配置', 'en': '✅ Verified Config', 'zh-TW': '✅ 已驗證配置' },
    'cfg.tier.auth': { 'zh-CN': '🔑 端点需鉴权', 'en': '🔑 Auth Required', 'zh-TW': '🔑 端點需鑑權' },
    'cfg.tier.fail': { 'zh-CN': '❌ 端点无响应', 'en': '❌ Endpoint Unreachable', 'zh-TW': '❌ 端點無響應' },
    'cfg.tier.auto': { 'zh-CN': '⚠️ 自动推断配置（请核对 README）', 'en': '⚠️ Auto-inferred (check README)', 'zh-TW': '⚠️ 自動推斷配置（請核對 README）' },

    // === Live search status ===
    'live.searching': { 'zh-CN': '🔍 正在请求 GitHub Search API…', 'en': '🔍 Querying GitHub Search API…', 'zh-TW': '🔍 正在請求 GitHub Search API…' },
    'live.noMore': { 'zh-CN': 'GitHub 全站也没有更多未收录的匹配结果', 'en': 'No more uncurated matches on GitHub', 'zh-TW': 'GitHub 全站也沒有更多未收錄的匹配結果' },
    'live.total': { 'zh-CN': '共 {n} 条，展示前 {s} 条', 'en': '{n} total, showing top {s}', 'zh-TW': '共 {n} 條，展示前 {s} 條' },
    'live.rateLimited': { 'zh-CN': 'GitHub 免费搜索限流（每分钟 10 次），请稍等片刻再试', 'en': 'GitHub rate-limited (10/min). Wait and retry.', 'zh-TW': 'GitHub 免費搜索限流（每分鐘 10 次），請稍等片刻再試' },

    // === Source badges (in JS render) ===
    'src.catalog': { 'zh-CN': '👤 精选', 'en': '👤 Curated', 'zh-TW': '👤 精選' },
    'src.registry': { 'zh-CN': '📋 Registry', 'en': '📋 Registry', 'zh-TW': '📋 Registry' },
    'src.github': { 'zh-CN': '🔍 GitHub', 'en': '🔍 GitHub', 'zh-TW': '🔍 GitHub' },
    'src.npm': { 'zh-CN': '📦 npm', 'en': '📦 npm', 'zh-TW': '📦 npm' },
    'src.crates': { 'zh-CN': '🦀 crates.io', 'en': '🦀 crates.io', 'zh-TW': '🦀 crates.io' },
    'src.inbox': { 'zh-CN': '✉️ Inbox', 'en': '✉️ Inbox', 'zh-TW': '✉️ Inbox' },

    // === Drawer (Detail Panel) ===
    'drawer.closeAria': { 'zh-CN': '关闭详情抽屉', 'en': 'Close detail panel', 'zh-TW': '關閉詳情抽屜' },
    'drawer.title': { 'zh-CN': '工具详情', 'en': 'Tool Details', 'zh-TW': '工具詳情' },
    'drawer.aria': { 'zh-CN': '工具详情抽屉', 'en': 'Tool detail panel', 'zh-TW': '工具詳情抽屜' },
    'drawer.source': { 'zh-CN': '来源', 'en': 'Source', 'zh-TW': '來源' },
    'drawer.category': { 'zh-CN': '分类', 'en': 'Category', 'zh-TW': '分類' },
    'drawer.endpoint': { 'zh-CN': '端点', 'en': 'Endpoint', 'zh-TW': '端點' },
    'drawer.endpointEmpty': { 'zh-CN': '（未检测到 MCP 端点）', 'en': '(No MCP endpoint detected)', 'zh-TW': '（未檢測到 MCP 端點）' },
    'drawer.lang': { 'zh-CN': '语言', 'en': 'Language', 'zh-TW': '語言' },
    'drawer.stars': { 'zh-CN': 'Stars', 'en': 'Stars', 'zh-TW': 'Stars' },
    'drawer.updated': { 'zh-CN': '最后更新', 'en': 'Last Updated', 'zh-TW': '最後更新' },
    'drawer.license': { 'zh-CN': '许可证', 'en': 'License', 'zh-TW': '許可證' },
    'drawer.deploySection': { 'zh-CN': '部署与使用提示', 'en': 'Deployment & Usage Tips', 'zh-TW': '部署與使用提示' },
    'drawer.endpointOk': { 'zh-CN': '端点实测 ✓ 在线', 'en': 'Endpoint verified ✓ Online', 'zh-TW': '端點實測 ✓ 在線' },
    'drawer.endpointFail': { 'zh-CN': '端点实测 ✗ 不可用', 'en': 'Endpoint ✗ Unreachable', 'zh-TW': '端點實測 ✗ 不可用' },
    'drawer.endpointAuth': { 'zh-CN': '端点需鉴权', 'en': 'Endpoint requires auth', 'zh-TW': '端點需鑑權' },
    'drawer.endpointUnknown': { 'zh-CN': '端点状态未知', 'en': 'Endpoint status unknown', 'zh-TW': '端點狀態未知' },
    'drawer.authHint': {
      'zh-CN': '此端点需要 API Key 或其他认证信息，检查项目 README 获取配置方式。',
      'en': 'This endpoint requires an API key or other auth. Check the project README for setup.',
      'zh-TW': '此端點需要 API Key 或其他認證資訊，檢查專案 README 取得配置方式。'
    },
    'drawer.failHint': {
      'zh-CN': 'Pipeline 实测此端点不可用。可能是临时故障或需要特殊网络环境。',
      'en': 'Pipeline found this endpoint unreachable. May be temporary or require a specific network environment.',
      'zh-TW': 'Pipeline 實測此端點不可用。可能是臨時故障或需要特殊網路環境。'
    },
    'drawer.noLiveData': { 'zh-CN': '暂无实时候选数据', 'en': 'No live candidate data', 'zh-TW': '暫無即時候選資料' },
    'drawer.notice': { 'zh-CN': '人工筛选收录，尚未逐项功能实测', 'en': 'Human-curated, not yet functionally tested', 'zh-TW': '人工篩選收錄，尚未逐項功能實測' },

    // === Config Modal ===
    'cfg.title': { 'zh-CN': '📋 生成 MCP 配置', 'en': '📋 Generate MCP Config', 'zh-TW': '📋 生成 MCP 配置' },
    'cfg.closeAria': { 'zh-CN': '关闭配置弹窗', 'en': 'Close config dialog', 'zh-TW': '關閉配置彈窗' },
    'cfg.aria': { 'zh-CN': 'MCP 配置弹窗', 'en': 'MCP config dialog', 'zh-TW': 'MCP 配置彈窗' },
    'cfg.claudeDesc': {
      'zh-CN': '在 <code>~/.claude/settings.json</code> 的 <code>mcpServers</code> 中添加',
      'en': 'Add to <code>mcpServers</code> in <code>~/.claude/settings.json</code>',
      'zh-TW': '在 <code>~/.claude/settings.json</code> 的 <code>mcpServers</code> 中新增'
    },
    'cfg.cursorDesc': {
      'zh-CN': '在 Cursor 设置 JSON 的 <code>mcp.servers</code> 中添加',
      'en': 'Add to <code>mcp.servers</code> in Cursor settings JSON',
      'zh-TW': '在 Cursor 設定 JSON 的 <code>mcp.servers</code> 中新增'
    },
    'cfg.vscodeDesc': {
      'zh-CN': '在 VS Code MCP 设置中添加',
      'en': 'Add in VS Code MCP settings',
      'zh-TW': '在 VS Code MCP 設定中新增'
    },
    'cfg.copyJson': { 'zh-CN': '复制 JSON', 'en': 'Copy JSON', 'zh-TW': '複製 JSON' },
    'cfg.copyOk': { 'zh-CN': '✓ 已复制', 'en': '✓ Copied', 'zh-TW': '✓ 已複製' },
    'cfg.copyFail': { 'zh-CN': '已选中，Ctrl+C 复制', 'en': 'Selected, press Ctrl+C to copy', 'zh-TW': '已選中，Ctrl+C 複製' },
    'cfg.noEndpoint': {
      'zh-CN': '此工具未检测到 MCP 端点，无法自动生成配置。请查看项目 README 获取安装说明。',
      'en': 'No MCP endpoint detected for this tool — cannot auto-generate config. See project README for setup.',
      'zh-TW': '此工具未檢測到 MCP 端點，無法自動生成配置。請查看專案 README 取得安裝說明。'
    },
    'cfg.auth': {
      'zh-CN': '⚠️ 检测到此端点可能需要 API Key。下面的 JSON 包含占位符，使用前请替换。',
      'en': '⚠️ This endpoint may require an API key. The JSON below contains a placeholder — replace it before using.',
      'zh-TW': '⚠️ 檢測到此端點可能需要 API Key。下面的 JSON 包含佔位符，使用前請替換。'
    },
    'cfg.fail': {
      'zh-CN': '⚠️ Pipeline 实测此端点当前不可用。生成的配置仅供参考，请确认端点状态后使用。',
      'en': '⚠️ Pipeline found this endpoint unreachable. Generated config is for reference only — verify endpoint status before using.',
      'zh-TW': '⚠️ Pipeline 實測此端點當前不可用。生成的配置僅供參考，請確認端點狀態後使用。'
    },
    'cfg.autoInfer': {
      'zh-CN': '⚠️ 此端点状态未实测，下面的配置由 Pipeline 根据仓库元数据自动推断，可能不准确。',
      'en': '⚠️ Endpoint status unknown. Config below is auto-inferred from repo metadata — may be inaccurate.',
      'zh-TW': '⚠️ 此端點狀態未實測，下面的配置由 Pipeline 根據倉庫元資料自動推斷，可能不準確。'
    },

    // === Footer ===
    'footer.source': {
      'zh-CN': '数据来源：',
      'en': 'Source: ',
      'zh-TW': '資料來源：'
    },
    'footer.disclaimer': {
      'zh-CN': '被收录不代表项目安全、活跃、可商用或质量已背书；使用前请自行检查许可证、维护状态、权限和数据安全。欢迎通过 Issue / PR 补充与纠错。',
      'en': 'Inclusion does not imply safety, activity, fitness for commercial use, or quality endorsement. Check license, maintenance, permissions, and data security yourself. Contributions welcome via Issues / PRs.',
      'zh-TW': '被收錄不代表專案安全、活躍、可商用或質量已背書；使用前請自行檢查許可證、維護狀態、權限和資料安全。歡迎透過 Issue / PR 補充與糾錯。'
    },

    // === Language Switch ===
    'lang.zh-CN': { 'zh-CN': '简体中文', 'en': '简体中文', 'zh-TW': '简体中文' },
    'lang.en': { 'zh-CN': 'English', 'en': 'English', 'zh-TW': 'English' },
    'lang.zh-TW': { 'zh-CN': '繁體中文', 'en': '繁體中文', 'zh-TW': '繁體中文' },
    'lang.button': { 'zh-CN': '🌐 语言', 'en': '🌐 Lang', 'zh-TW': '🌐 語言' },
    'lang.currentPrefix': { 'zh-CN': '🌐 ', 'en': '🌐 ', 'zh-TW': '🌐 ' },

    // === NOSCRIPT ===
    'noscript': {
      'zh-CN': '⚠️ 当前浏览器未启用 JavaScript：下方列表需 JS 渲染，请直接查看 <a href="https://github.com/manningyangs/AI-Shovel-Collection/blob/main/catalog.csv">catalog.csv</a>（{n} 条精选）或 <a href="live_multi.json">live_multi.json</a>（含候选与端点实测数据）。',
      'en': '⚠️ JavaScript is disabled: the list below requires JS rendering. View <a href="https://github.com/manningyangs/AI-Shovel-Collection/blob/main/catalog.csv">catalog.csv</a> directly ({n} curated entries) or <a href="live_multi.json">live_multi.json</a> (includes candidates & endpoint data).',
      'zh-TW': '⚠️ 當前瀏覽器未啟用 JavaScript：下方列表需 JS 渲染，請直接查看 <a href="https://github.com/manningyangs/AI-Shovel-Collection/blob/main/catalog.csv">catalog.csv</a>（{n} 條精選）或 <a href="live_multi.json">live_multi.json</a>（含候選與端點實測資料）。'
    },

    // === Live search status (JS) ===
    'status.rateLimited': {
      'zh-CN': 'GitHub 免费搜索限流（每分钟 10 次），请稍等片刻再试',
      'en': 'GitHub free search rate-limited (10/min). Please wait and try again.',
      'zh-TW': 'GitHub 免費搜索限流（每分鐘 10 次），請稍等片刻再試'
    },
    'status.liveOk': {
      'zh-CN': '找到 {n} 条实时结果（已收录的自动去重）',
      'en': 'Found {n} live results (curated repos auto-deduplicated)',
      'zh-TW': '找到 {n} 條即時結果（已收錄的自動去重）'
    },
    'status.liveEmpty': {
      'zh-CN': 'GitHub 全站没有更多未收录的匹配结果',
      'en': 'No more uncurated matches found on GitHub',
      'zh-TW': 'GitHub 全站沒有更多未收錄的匹配結果'
    },
    'status.searching': {
      'zh-CN': '🔍 正在搜索 GitHub 全站…',
      'en': '🔍 Searching GitHub…',
      'zh-TW': '🔍 正在搜索 GitHub 全站…'
    },
    'status.localZero': {
      'zh-CN': '本地目录没有匹配 — 正在尝试 GitHub 全站实时搜索…',
      'en': 'No local match — trying GitHub Live Search…',
      'zh-TW': '本地目錄沒有匹配 — 正在嘗試 GitHub 全站即時搜索…'
    },

    // === Task chips (10 quick filters) ===
    'task.browser': { 'zh-CN': '🌐 浏览器自动化', 'en': '🌐 Browser automation', 'zh-TW': '🌐 瀏覽器自動化' },
    'task.file': { 'zh-CN': '📄 文件/PDF', 'en': '📄 Files / PDF', 'zh-TW': '📄 檔案 / PDF' },
    'task.code': { 'zh-CN': '💻 编程/Git', 'en': '💻 Coding / Git', 'zh-TW': '💻 程式 / Git' },
    'task.db': { 'zh-CN': '🗄️ 数据库', 'en': '🗄️ Database', 'zh-TW': '🗄️ 資料庫' },
    'task.cloud': { 'zh-CN': '☁️ 云/DevOps', 'en': '☁️ Cloud / DevOps', 'zh-TW': '☁️ 雲 / DevOps' },
    'task.comm': { 'zh-CN': '📧 邮件/协作', 'en': '📧 Email / Collab', 'zh-TW': '📧 郵件 / 協作' },
    'task.finance': { 'zh-CN': '💰 金融', 'en': '💰 Finance', 'zh-TW': '💰 金融' },
    'task.ecom': { 'zh-CN': '🛒 电商', 'en': '🛒 E-commerce', 'zh-TW': '🛒 電商' },
    'task.design': { 'zh-CN': '🎨 设计/音视频', 'en': '🎨 Design / Audio-Video', 'zh-TW': '🎨 設計 / 音影片' },
    'task.engineering': { 'zh-CN': '🔧 CAD/工程/工业', 'en': '🔧 CAD / Eng / Industrial', 'zh-TW': '🔧 CAD / 工程 / 工業' },

    // === Live status badges ===
    'badge.recentOk': { 'zh-CN': '近 7 天更新 · 端点实测 ✓', 'en': 'Updated 7d · Endpoint ✓', 'zh-TW': '近 7 天更新 · 端點實測 ✓' },
    'badge.recentFail': { 'zh-CN': '近 7 天更新 · 端点 ✗', 'en': 'Updated 7d · Endpoint ✗', 'zh-TW': '近 7 天更新 · 端點 ✗' },
    'badge.recentAuth': { 'zh-CN': '近 7 天更新 · 端点需鉴权', 'en': 'Updated 7d · Auth required', 'zh-TW': '近 7 天更新 · 端點需鑑權' },
    'badge.recentCold': { 'zh-CN': '近 7 天更新', 'en': 'Updated 7d', 'zh-TW': '近 7 天更新' },
    'badge.recentSilent': { 'zh-CN': '近 7 天更新', 'en': 'Updated 7d', 'zh-TW': '近 7 天更新' },
    'badge.recentArchived': { 'zh-CN': '近 7 天更新 · 仓库已归档', 'en': 'Updated 7d · Archived', 'zh-TW': '近 7 天更新 · 倉庫已歸檔' },

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

    // === Source badges ===
    'src.catalog': { 'zh-CN': '👤 精选', 'en': '👤 Curated', 'zh-TW': '👤 精選' },
    'src.registry': { 'zh-CN': '📋 Registry', 'en': '📋 Registry', 'zh-TW': '📋 Registry' },
    'src.github': { 'zh-CN': '🔍 GitHub', 'en': '🔍 GitHub', 'zh-TW': '🔍 GitHub' },
    'src.npm': { 'zh-CN': '📦 npm', 'en': '📦 npm', 'zh-TW': '📦 npm' },
    'src.crates': { 'zh-CN': '🦀 crates.io', 'en': '🦀 crates.io', 'zh-TW': '🦀 crates.io' },
    'src.inbox': { 'zh-CN': '✉️ Inbox', 'en': '✉️ Inbox', 'zh-TW': '✉️ Inbox' }
  };

  // --------- 3. 核心函数 ---------

  var STORAGE_KEY = 'ai-shovels:lang';
  var SUPPORTED = ['zh-CN', 'en', 'zh-TW'];

  /**
   * 检测浏览器语言
   */
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
    return 'zh-CN'; // 默认简体
  }

  /**
   * 获取当前语言（优先 localStorage > 浏览器检测）
   */
  function getLang() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    return detectBrowserLang();
  }

  /**
   * 设置语言（持久化 + 触发全页重新应用）
   */
  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;
    I18n.currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyLang(lang);
  }

  /**
   * 应用语言到页面
   */
  function applyLang(lang) {
    document.documentElement.lang = lang;
    // 同步语言切换 select 的 value（刷新后恢复选择状态）
    var sel = document.getElementById('langSelect');
    if (sel && sel.value !== lang) sel.value = lang;
    // 1. 批量替换 data-i18n 标注的文本
    applyDataI18n(lang);
    // 2. 触发全局事件让业务层（render / matches / catLabel 等）重新计算
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: lang } }));
  }

  /**
   * 翻译函数（支持占位符 {key} 和 HTML）
   */
  function _t(key, params, opts) {
    var entry = UI[key];
    if (!entry) return key;
    var lang = (opts && opts.lang) || I18n.currentLang || getLang();
    // 简化 fallback 链：目标语言 → zh-CN 原文 → key 本身
    var text = entry[lang] || entry['zh-CN'] || key;
    if (params && typeof params === 'object') {
      text = text.replace(/\{(\w+)\}/g, function (_, k) {
        return params[k] !== undefined ? params[k] : '';
      });
    }
    return text;
  }

  /**
   * 批量扫描 DOM 上 [data-i18n] 并替换文本 / html / placeholder / title / aria-label
   */
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
        // 只替换直接文本，不破坏子元素结构
        // 但 hero.h1 这种带 <span> 的用 data-i18n-html
        node.textContent = text;
      }
    }
    // 同步 document.title
    document.title = _t('meta.title');
    // 同步 <meta name="description">
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = _t('meta.desc');
  }

  /**
   * 初始化语言系统
   */
  function init() {
    var lang = getLang();
    I18n.currentLang = lang;
    applyLang(lang);
  }

  // --------- 4. 导出全局 ---------
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

  // 兼容简写
  window._t = _t;
  window.I18n = I18n;

  // DOMReady 自动初始化（如果 index.html 还没手动调用的话）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
