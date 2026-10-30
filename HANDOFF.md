# AI-Shovel-Collection · 新账号接活说明书

**生成时间**: 2026-10-30 15:40 UTC+8  
**最后 commit**: `395d30a` (feat: 统计口径统一 + 任务导向入口 + 核验分级 + 静态兜底 + fix task-chip --brand)  
**仓库**: https://github.com/manningyangs/AI-Shovel-Collection  
**Pages**: https://manningyangs.github.io/AI-Shovel-Collection/  
**Pipeline 状态**: ✅ 每 6h schedule 自动跑（Run #13 首次成功 cron，已闭环）  
**本地 HTTP**: `http://127.0.0.1:8765/`（用 `python -m http.server 8765` 在 repo/ 目录起）

---

## 一、项目定位（**先读这个**）

> **不要做成第二个 Awesome MCP（96,198 个服务器）。** 要做：
>
> 1. **回答三个问题**：我想让 AI 干活 → 用什么工具？→ 真的能用吗？→ 怎么接入？
> 2. **差异化不是规模，是可执行性**：端点实测（MCP initialize 握手）+ 可粘贴配置块（Claude Desktop / Cursor / VS Code）
> 3. **精选 191 + 候选 150 双轨**：精选是人工信任层，候选是自动发现层

参考两轮 AI 深度意见：
- **DeepSeek**: "价值是精选与可执行性，不是规模"，提出端点实测 + 配置块（已做）
- **GPT**: 回答三个问题 + 从"仓库目录"升级为"可检索、可判断、可接入的 AI 工具门户"

---

## 二、架构全景

```
┌────────────────────────────────────────────────────────────┐
│  GitHub Actions (cron "23 */6 * * *" = 每6小时)           │
│  live-data.yml                                             │
│    ├─ push catalog.csv / scripts/*.py  → 立即触发          │
│    └─ schedule  每6h 自动跑                                │
└──────────────┬─────────────────────────────────────────────┘
               │ python scripts/update_live_data.py
               ▼
┌────────────────────────────────────────────────────────────┐
│  Pipeline (update_live_data.py, ~617 行)                  │
│  四源并行抓取:                                              │
│    ├─ MCP Registry (limit=100, 308+ 条)                   │
│    ├─ GitHub REST (catalog 精选的 stars/pushed_at — 有     │
│    │   token 才跑，本地匿名跳过)                           │
│    ├─ npm (关键词搜索)                                      │
│    ├─ crates.io (关键词搜索)                                │
│  端点实测 (每轮全量重测):                                   │
│    MCP initialize 握手 (并发10, 超时8s) → 三态             │
│    ✅ ok / 🔑 auth / ❌ fail                               │
│  confidence 评分 (封顶10):                                 │
│    MCP Registry+3, stars≥2k+1, ≥500+1, ≥50+1,             │
│    活跃+1, 端点+1, 实测ok+1, 有repo_slug+1                │
│  seen_candidates.json 持久化 (新ID进seen, 二次跑不重复)   │
└──────────────┬─────────────────────────────────────────────┘
               │ 写 live_multi.json + 推到 main
               ▼
┌────────────────────────────────────────────────────────────┐
│  GitHub Pages → index.html (纯前端)                        │
│  三层数据:                                                  │
│    1. 已收录 191 (catalog.csv 人工精选)                    │
│    2. 自动发现候选 150 (Pipeline Top 150)                  │
│    3. GitHub 实时搜索 (前端调 Search API, 用户主动触发)    │
│  已收录 + 候选各自有:                                       │
│    ├─ 活跃度徽章 (活跃/转凉/沉寂/归档 基于 pushed_at)       │
│    ├─ 端点实测徽章 (仅候选有端点时)                         │
│    ├─ 📋 配置块弹窗 (三端 JSON + 一键复制)                 │
│    └─ source 徽章 + confidence x/10                         │
└────────────────────────────────────────────────────────────┘
```

---

## 三、关键文件

| 文件 | 作用 | 备注 |
|---|---|---|
| `catalog.csv` | **唯一人工精选入口**，3 列：分类/名称(GitHub repo描述)/GitHub URL | 191 条 |
| `scripts/update_live_data.py` | Pipeline 主文件，617 行 | 改了会触发 workflow push 路径 |
| `.github/workflows/live-data.yml` | Actions，schedule + push(paths: catalog.csv, scripts/*.py) | **index.html 不触发 workflow** |
| `index.html` | 单文件前端（~1800 行内联 CSS+JS） | 改前端不触发 pipeline |
| `live_multi.json` | 数据源（curated + candidates + inbox + source_counts） | **已从 .gitignore 移除**（Run #10 之前加过一次被我误推成无 token 版，后来修了） |
| `scripts/.state/seen_candidates.json` | Pipeline 持久化，**已加入 .gitignore** | 运行产物，不进版本库 |
| `_inbox/YYYYMMDD.json` | 每轮 inbox 输出，**已加入 .gitignore** | Pages 不部署 |
| `.gitignore` | 要排除：`scripts/.state/`、`_inbox/`、本地 `.pyc` | **特别注意**：`live_multi.json` 必须在仓库！ |

**本地开发注意**：
```bash
cd repo/
python scripts/update_live_data.py   # 重新生成 live_multi.json（本地无 token，GitHub REST 跳过，curated=11）
python -m http.server 8765           # 起静态服务
# Pipeline 生成的 live_multi.json 是无 token 版，提交前记得 git checkout -- live_multi.json
```

---

## 四、Pipeline 核心逻辑

### CLASSIFY_RULES（17 分类推断，每类 15-18 英文/中文关键词）
分类是 pipeline 自动推断的，基于 title/desc/name/source_code 中关键词命中数

### confidence 评分（封顶 10）
```
MCP 官方注册          +3
GitHub Stars ≥ 2000   +1
GitHub Stars ≥ 500    +1  
GitHub Stars ≥ 50     +1
最近 90 天活跃        +1
有远程 endpoint       +1
端点实测 ✅ ok         +1
有 GitHub repo_slug   +1
```

### INBOX_THRESHOLD = 6（**之前 7 被我改成 6 了**）
confidence ≥ 6 的候选进 inbox

### 端点实测
对所有 candidates 里带 `endpoint` 的发一次 MCP `initialize` POST：
- HTTP 200 且响应有 `protocolVersion` → ✅ ok  
- 401/403 → 🔑 auth  
- 其他或超时 → ❌ fail  
- 每轮全量重测，`verified_at` 覆盖旧时间戳

### 活跃度徽章（所有条目都有）
```
pushed_at < 90天    → 🟢 活跃
90天 ~ 1年          → 🟡 转凉  
> 1年               → 🔴 沉寂
archived            → 🪦 归档
```

---

## 五、前端核心功能（已实现清单）

### 导航与筛选
- [x] Hero 统计 6 卡：目录收录 / 已同步元数据 / 候选 / 端点实测 ok/total / Stars / 分类
- [x] 17 分类 chips（`all` + `__recent` 近7天 + 分类）
- [x] 滚动紧凑化（>120px toolbar 191→54px）+ **🏷️ 分类**按钮手动强制展开
- [x] 元数据组合筛选：语言（动态生成）+ Stars（≥100…≥10k）+ 更新（24h…半年）
- [x] **🙋 任务导向入口**（10 个任务 chip，前缀匹配分类号，与搜索框互斥）
- [x] **🧭 候选**按钮（搜索框右侧）+ localStorage 记忆

### 卡片渲染
- [x] 已收录（👤 人工筛选蓝标签）+ 候选（🤖 自动发现灰标签，未核验）
- [x] **端点实测三态徽章**（✅ok 🔑auth ❌fail + "非功能实测" 诚实说明）
- [x] 活跃度徽章（🟢🟡🔴🪦）
- [x] confidence x/10（**封顶10，之前 /9 已修正**）
- [x] 📋 **配置块弹窗**（Claude Desktop / Cursor / VS Code 三端 JSON + 一键复制 + clipboard 降级）
- [x] 端点胶囊（🔗）+ source 徽章 + Stars + 🔍 申请入精选（GitHub issue 模板）
- [x] 🆕 近 7 天更新 chip（虚线绿色）+ 候选 🆕 新增标签

### 其他
- [x] 实时 GitHub 搜索（独立 strip，按 Stars 排序，已收录去重）
- [x] Inbox banner（✨ N 条高置信候选 + 批量打开）
- [x] SEO 元标签（og:title/description/image/url + twitter:card + canonical）
- [x] **静态兜底**（HTML 预填 191/189/150，`<noscript>` 提示）
- [x] **核验分级诚实说明**（已收录=人工筛选≠功能实测；端点实测=握手≠功能可用）
- [x] **统计口径明示**（底部一行说清四个数字来自不同口径）
- [x] 访问量统计（hits.sh badge: README 顶部 + Pages navbar）
- [x] 中英文 README 双语切换
- [x] `/` 快捷键聚焦搜索框 + 实时过滤 + 结果高亮
- [x] 跳过链接 + 键盘 Tab 可达 + aria-label
- [x] 移动端自适应（stats-grid 3 列自动换行）

---

## 六、已踩的坑（千万别再踩）

| 坑 | 根因 | 修复 |
|---|---|---|
| MCP Registry limit=200 报 422 | API enforce ≤100 | `limit=100` |
| Pipeline `AttributeError: 'str' object has no attribute 'name'` | `for f in self.__dataclass_fields__` 返回 key | `for f in .values()` |
| cursor 分页无限循环 | 空批次没 break | `if not next_cursor or next_cursor == cursor or batch == 0: break` |
| normalize_repo_url 漏 git+ 前缀 | npm 输出 `git+https://...` | 正则剥 git+ / ssh://git@ |
| workflow push rejected 冲突 | Actions bot 快照过期 | `fetch + rebase --autostash + push --force-with-lease` |
| GitHub REST 本地匿名 403 | 本地跑耗光 60/h | `if TOKEN:` 才跑，否则跳过 |
| walrus 在 dict 里 SyntaxError | `json.loads()` 里不能 `now :=` | 先赋值再放 dict |
| **我把 live_multi.json 加进 .gitignore 后 force push** | Run #8 正确版被本地无 token 覆盖，curated 189→11 | 移除 .gitignore 里的 live_multi.json + 触发 Run #9 重生成 |
| **task-chip active 透明/空了** | 写 CSS 时用了未定义的 `var(--brand)`，全站实际用 `--primary: #2563eb` | `sed 's/--brand/--primary/g'` |
| **本地 Pipeline 覆盖 live_multi.json** | 无 token 版 curated=11 被我误 commit | 每次 `git checkout -- live_multi.json` 再提交 |
| **本地网络 SSL 随机 EOF** | Windows PowerShell + 公司网络 | 重跑通常解决；Actions 环境不受影响 |

---

## 七、gitignore 清单（必须保持）

```
scripts/.state/          # seen_candidates.json 等持久化
_inbox/                  # Pipeline 每轮 inbox 输出
__pycache__/
*.pyc
.DS_Store
# live_multi.json 绝对不能加！Pages 数据源
# catalog.csv 绝对不能加！
```

---

## 八、Actions workflow 要点

```yaml
on:
  schedule:
    - cron: "23 */6 * * *"   # UTC 每 6 小时 = 北京时间 06:23/12:23/18:23/次日 00:23
  workflow_dispatch:          # 手动触发
  push:
    paths:
      - catalog.csv           # 人工改精选 → 立即同步
      - scripts/update_live_data.py

permissions:
  contents: write            # 才能 commit push live_multi.json

# 必须带 GITHUB_TOKEN，否则 GitHub REST 跳过
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# push 后要 fetch + rebase --autostash + force-with-lease，防 bot commit 冲突
```

**特别**：`index.html` 改动不会触发 pipeline（不在 push.paths 里），前端部署后不需要手动触发。

---

## 九、JS 语法校验模板（每次改完跑）

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((s,i)=>{try{new Function(s.replace(/<\/?script>/g,''))}catch(e){console.log('script#'+i+' FAIL: '+e.message);process.exit(1)}});console.log('OK, scripts:',m.length)"
```

## 十、Python 语法校验

```bash
py -m py_compile scripts/update_live_data.py
```

## 十一、浏览器测试模板（Agent 用）

```
打开 http://127.0.0.1:8765/
核心验证项：
1. .stats-grid 6 卡 3 列 + 文本正确
2. #taskBar 10 个 .task-chip，点击分类正确过滤、再点取消、与搜索互斥
3. #candidateGrid .vfy.ok/.auth/.fail 三态数量 + .ok title 含"非功能实测"
4. 近 7 天 chip 虚线绿边框
5. .card-live 第一个子元素是徽章（活跃度 / 端点实测）
6. browser_console_messages 无 error
```

---

## 十二、待办清单（按优先级）

### P0（如果现在就要做）
- [ ] **本地 Pipeline 覆盖 live_multi.json 的保护**：加 pre-commit hook 或在 workflow 里校验文件不为空 token 版（或者在 `.gitignore` 加 `live_multi.json` 但 workflow 里强制 commit 它 —— 这个权衡要想清楚）
- [ ] **工具类型 tool_type 标注**（GPT 建议第 1 点）：189 条精选手工标"工具本体/适配器/框架/技能/集合目录"，加 tool_type 筛选 chip。工作量主要在人工标注
- [ ] **端点实测升级：真实 MCP 客户端握手**（现在是 HTTP POST initialize，部分 server 不走这个路径）。可选：mcp Python client 做真握手，但 Actions 里要装依赖

### P1（中优先级）
- [ ] **目录详情页**（单页拆分或 hash route）：每条工具点进去一个详情视图，显示端点状态历史、最近更新趋势
- [ ] **客户端兼容性真筛选**（不是全标"支持"，而是从 README 里解析实际支持的客户端列表）
- [ ] **本地 Pipeline 的 GitHub REST 在无 token 时也能部分跑**（60 次/小时够跑 catalog）

### P2（长期，架构升级）
- [ ] **任务型决策页**（GPT 建议第 3 点，P2 但价值高）："让 AI 操作 Excel" → 一个小页面说清几个工具的取舍
- [ ] **domains.json 独立**（现在从 README 表格解析，脆弱）
- [ ] **catalog.csv → 结构化 JSON**（字段多到 CSV 装不下时再迁）
- [ ] **Sponsored 赞助位**（README + 侧栏，必须显式标注不影响排序）

### 暂时不做
- ❌ 拼收录数量到 1000+ —— DeepSeek/GPT 都明确说没胜算
- ❌ "AI 根据一句话推荐工具组合" —— 静态站做不了真 AI，假推荐损害信任
- ❌ 自定义域名 + Cloudflare + CSP/HSTS —— 只读站收益极低
- ❌ 自动生成 README 里每个工具的"让 AI 能做什么"描述 —— 纯内容工程，不是代码

---

## 十三、当前数据快照（Run #14，本地）

```
curated_count:      189  （目录收录 191 中，189 成功同步 GitHub 元数据）
candidates_count:   150  （Pipeline Top 150）
inbox_count:          5  （confidence ≥ 6）
endpoint_status 分布  48 ok / 39 auth / 55 fail  （142 端点，本地网络）
stars 累计          701k+
```

**线上 Run #14+ 端点实测 ok 数应更高**（Actions 网络无本地 SSL/防火墙干扰）。

---

## 十四、快速接活 Checklist

切换账号后，第一件事：

1. **`cd e:\desktop\AI-Shovel-Collection\repo`**
2. **`git status`** 确认没有脏文件
3. **`git pull origin main`** 确保最新（Actions 可能又推了数据）
4. **`python -m http.server 8765`** 起本地服务
5. **`python scripts/update_live_data.py`** 重跑 Pipeline 生成最新 live_multi.json（**记得提交前 checkout 掉它**）
6. 读本文件 **HANDOFF.md** 一、二、三、五、六 节 —— 够接活了

---

**祝交接顺利，别让白字透明 bug 重演。** 🛠️
