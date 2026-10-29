# 多源 Pipeline：从 MCP 官方 Registry / GitHub REST API / npm / crates.io
# 拉取 AI 铲子候选，统一字段、按优先级去重，输出 live_multi.json + candidates.json。
#
# 设计原则：
#   - GitHub REST 配额金贵（匿名 60/h / 鉴权 5000/h），**只拉** catalog.csv 里
#     精选的仓库；候选源（MCP Registry / npm / crates）只输出已有元数据，
#     不反查 GitHub，避免本地/CI 被限流。
#   - 候选按 confidence 评分截断到 CANDIDATE_LIMIT 条。
#   - 全部只用 Python 标准库。
#
# 数据源优先级（同一条被多个源命中时，高优先级 source 的非空字段覆盖低优先级空字段）：
#   mcp_registry > github_rest > npm / crates（同级先到先填）> catalog.csv
#
# 输出：
#   live_multi.json  : { updated_at, curated: {slug: Entry_json}, candidates: [Entry_json], source_counts }

import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from typing import Optional

TOKEN = os.environ.get("GITHUB_TOKEN", "")
CATALOG = "catalog.csv"
OUTPUT = "live_multi.json"
SEEN_STATE = "scripts/.state/seen_candidates.json"  # 持久化已处理候选主键
INBOX_DIR = "_inbox"                              # 每轮 inbox 输出目录
INBOX_THRESHOLD = 6                               # confidence ≥ 此值才进 inbox；candidates 不反查 GitHub stars，封顶 6-7 分

CANDIDATE_LIMIT = 150
SLEEP_GITHUB = 0.18
SLEEP_REGISTRY = 0.05
SLEEP_INDEX = 0.35
HTTP_TIMEOUT = 25

MCP_KEYWORDS = [
    "mcp-server", "modelcontextprotocol", "model-context-protocol",
]
AGENT_KEYWORDS = [
    "agent-tool", "agent-skill", "ai-tool", "ai-automation",
]

# 17 分类关键词推断规则（候选 → 精选时的自动分类建议）
CLASSIFY_RULES = [
    ("1. 目录、Skills 与通用 AI 工具适配",
     ["awesome", "directory", "catalog", "registry", "skill", "skills", "reference server",
      "reference", "collection", "list", "framework", "adapter", "wrapper"]),
    ("2. 浏览器、网页检索、抓取与自动化",
     ["playwright", "browser", "firecrawl", "apify", "bright", "scrape", "crawler", "fetch",
      "website", "scraper", "chromium", "puppeteer", "网页", "抓取", "浏览器", "automation"]),
    ("3. 文件、Office、PDF、文档与出版",
     ["pdf", "docx", "markdown", "pandoc", "unstructured", "office", "document", "doc",
      "文件", "文档", "出版", "format", "convert", "parsing", "parser"]),
    ("4. 编程、代码库、Git 与开发者工作流",
     ["git", "github", "code", "coding", "compiler", "ide", "repository", "repo",
      "devops", "terminal", "cli", "developer", "编程", "代码", "git hub"]),
    ("5. 数据库、数据分析、BI 与可视化",
     ["database", "sql", "postgres", "mysql", "sqlite", "clickhouse", "duckdb", "bigquery",
      "analytics", "bi", "visualization", "plot", "chart", "dashboard", "数据库", "数据"]),
    ("6. 云平台、DevOps、监控与基础设施",
     ["aws", "azure", "gcp", "docker", "kubernetes", "k8s", "terraform", "ansible",
      "cloud", "monitor", "observability", "infra", "infrastructure", "prometheus",
      "grafana", "devops", "云", "监控", "容器"]),
    ("7. 邮件、通信、日历与团队协作",
     ["email", "mail", "slack", "discord", "teams", "calendar", "gmail", "outlook",
      "im", "chat", "messenger", "邮件", "日历", "团队"]),
    ("8. 财务、会计、投资与区块链",
     ["finance", "accounting", "investment", "stock", "crypto", "blockchain", "bitcoin",
      "wallet", "trading", "portfolio", "财务", "会计", "投资", "区块链"]),
    ("9. 电商、零售、营销与社交媒体",
     ["ecommerce", "shopify", "amazon", "woo", "retail", "marketing", "seo", "social",
      "instagram", "tiktok", "twitter", "x.com", "linkedin", "电商", "营销", "零售"]),
    ("9A. 中国本土平台适配（单独列出）",
     ["wechat", "weixin", "微信", "飞书", "feishu", "douyin", "抖音", "baidu", "百度",
      "taobao", "淘宝", "jingdong", "京东", "小红书", "zhihu", "知乎", "bilibili", "b站"]),
    ("10. 设计、图片、视频、音频与创意生产",
     ["image", "photo", "picture", "imagegen", "generative", "stable diffusion", "dall-e",
      "video", "audio", "music", "design", "adobe", "figma", "midjourney", "设计", "视频", "图片"]),
    ("11. CAD、BIM、工程、地理空间与地图",
     ["cad", "bim", "revit", "gis", "geospatial", "map", "maps", "mapping", "autocad",
      "engineering", "coordinate", "spatial", "cadastre", "geo", "mapbox", "openstreetmap",
      "工程", "地图", "地理"]),
    ("12. 医疗、健康、生物信息与实验室科研",
     ["medical", "health", "bio", "biology", "genome", "protein", "clinical", "lab",
      "research", "pharmaceutical", "drug", "molecular", "healthcare", "医疗", "健康", "生物"]),
    ("13. 工业制造、PLC、IoT、硬件与机器人",
     ["iot", "plc", "industrial", "robot", "hardware", "manufacturing", "factory",
      "raspberry", "arduino", "microcontroller", "sensor", "device", "工业", "硬件", "机器人"]),
    ("14. 汽车、车辆诊断与游戏开发",
     ["automotive", "car", "vehicle", "obd", "diagnostic", "game", "unity", "unreal",
      "godot", "bevy", "game engine", "游戏", "汽车"]),
    ("15. 政务、法律、公共数据、专利与安全",
     ["government", "gov", "legal", "law", "patent", "court", "public data", "compliance",
      "security", "vulnerability", "threat", "privacy", "政务", "法律", "安全"]),
    ("16. 物流、航空、旅游、招聘与其他垂直应用",
     ["logistics", "airline", "travel", "booking", "hotel", "recruitment", "job", "hr",
      "delivery", "shipping", "supply chain", "物流", "航空", "旅游", "招聘"]),
]


# ---------- HTTP ----------
def http_get(url, headers=None, decode=True):
    h = {"User-Agent": "ai-shovels-pipeline/1.0", "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            body = resp.read()
            if decode:
                return json.loads(body.decode("utf-8", errors="replace"))
            return body
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            retry = int(e.headers.get("Retry-After", "5"))
            print(f"  [rate-limit] {url[:90]}… 等 {retry}s")
            time.sleep(retry + 1)
            try:
                with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                    return json.loads(resp.read().decode("utf-8", errors="replace"))
            except Exception as e2:
                print(f"  [retry-fail] {url[:60]}… : {e2}")
        elif e.code == 404:
            return None
        else:
            print(f"  [http-{e.code}] {url[:60]}…")
        return None
    except Exception as e:
        print(f"  [net] {url[:60]}… : {e}")
        return None


def normalize_repo_url(url):
    if not url:
        return None
    # 去掉常见前缀前缀 git+ / svn+ / git@ / ssh://
    u = url.strip()
    m = re.match(r"^[a-zA-Z+]+:", u)
    if m:
        proto = m.group(0).lower()
        if proto in ("git+https://", "git+http://", "git+git://", "svn+https://", "svn+http://"):
            u = u[len(proto):]
        elif proto.startswith("git@"):
            u = u.replace(":", "/", 1).replace("git@", "")
        elif proto.startswith("ssh://git@"):
            u = u.replace("ssh://git@", "https://")
        elif proto in ("https://", "http://", "git://"):
            pass
        else:
            u = re.sub(r"^[a-zA-Z+]+://", "", u)

    u = u.removesuffix(".git").strip("/")
    u = re.sub(r"^https?://", "", u, flags=re.I)
    u = re.sub(r"^www\.", "", u, flags=re.I)
    m = re.match(r"^github\.com/([^/\s#?]+)/([^/\s#?]+)", u, re.I)
    if m:
        return f"github.com/{m.group(1).lower()}/{m.group(2).lower()}"
    return u.lower() if u else None


def repo_slug_from_url(url):
    if not url:
        return None
    m = re.search(r"github\.com/([^/\s#?]+)/([^/\s#?]+)", url, re.I)
    if m:
        return f"{m.group(1)}/{m.group(2).removesuffix('.git')}".lower()
    return None


# ---------- Entry ----------
@dataclass
class Entry:
    id: str
    source: str
    title: str
    desc: str = ""
    repo_url: Optional[str] = None
    repo_slug: Optional[str] = None
    registry_url: Optional[str] = None
    endpoint: Optional[str] = None
    protocol: Optional[str] = None
    version: Optional[str] = None
    stars: Optional[int] = None
    forks: Optional[int] = None
    downloads: Optional[int] = None
    published_at: Optional[str] = None
    pushed_at: Optional[str] = None
    status: str = "unknown"
    lang: Optional[str] = None
    license: Optional[str] = None
    headers_req: Optional[list] = None
    extra: dict = field(default_factory=dict)

    def merge_from(self, other: "Entry"):
        for f in self.__dataclass_fields__.values():
            if f.name in ("source", "id"):
                continue
            cur = getattr(self, f.name)
            new = getattr(other, f.name)
            if (cur in (None, "", [], {}, "unknown")) and new not in (None, "", [], {}, "unknown"):
                setattr(self, f.name, new)

    def to_json(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v not in (None, "", [], {}, "unknown")}


# ---------- Fetcher 抽象 ----------
class FetcherBase:
    name = "base"
    priority = 0

    def fetch(self) -> list:
        raise NotImplementedError


# ---------- MCP Registry ----------
class MCPRegistryFetcher(FetcherBase):
    name = "mcp_registry"
    priority = 5
    BASE = "https://registry.modelcontextprotocol.io/v0/servers?limit=100"

    def fetch(self) -> list:
        print("[mcp_registry] 拉取官方 MCP Registry…")
        entries, seen_ids, pages = [], set(), 0
        cursor = None
        while pages < 25:
            url = self.BASE + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
            data = http_get(url)
            if not data or "servers" not in data:
                break
            batch = 0
            for s in data["servers"]:
                sv = s.get("server", {})
                meta = s.get("_meta", {}).get("io.modelcontextprotocol.registry/official", {})
                active = meta.get("status", "unknown")
                rid = f"reg:{sv.get('name','')}".lower()
                if rid in seen_ids:
                    continue  # 按 registry 名称去重：同 name 多 version 只保留最新遇到的那个
                seen_ids.add(rid)

                repo = sv.get("repository") or {}
                repo_url = repo.get("url") if isinstance(repo, dict) else None
                slug = repo_slug_from_url(repo_url)

                remotes = sv.get("remotes", []) or []
                endpoints = [r.get("url") for r in remotes if r.get("url")]
                ep_types = {r.get("type") for r in remotes if r.get("type")}
                headers_req = []
                for r in remotes:
                    for h in (r.get("headers") or []):
                        d = h.get("description", "")
                        if d and d not in headers_req:
                            headers_req.append(d)

                eid = normalize_repo_url(repo_url) or rid
                entries.append(Entry(
                    id=eid, source=self.name,
                    title=sv.get("title") or sv.get("name", ""),
                    desc=(sv.get("description") or "")[:240],
                    repo_url=repo_url, repo_slug=slug,
                    registry_url=f"https://registry.modelcontextprotocol.io/?search={urllib.parse.quote(sv.get('name',''))}",
                    endpoint=endpoints[0] if endpoints else None,
                    protocol="mcp" if ep_types else None,
                    version=sv.get("version"),
                    published_at=meta.get("publishedAt"),
                    pushed_at=meta.get("updatedAt"),
                    status="active" if active == "active" else active if active else "unknown",
                    headers_req=headers_req or None,
                    extra={"registry_name": sv.get("name"), "remotes_count": len(remotes)},
                ))
                batch += 1
            pages += 1
            print(f"    mcp_registry: page {pages} +{batch}  累计 {len(entries)}")
            next_cursor = data.get("metadata", {}).get("nextCursor")
            # 没 nextCursor 或 cursor 没推进 → 结束
            if not next_cursor or next_cursor == cursor or batch == 0:
                break
            cursor = next_cursor
            time.sleep(SLEEP_REGISTRY)
        print(f"[mcp_registry] 完成：{len(entries)} 条，{pages} 页")
        return entries


# ---------- GitHub REST（只拉 catalog 精选） ----------
class GitHubRESTFetcher(FetcherBase):
    name = "github_rest"
    priority = 4

    def __init__(self, slugs: list):
        self.slugs = list(dict.fromkeys(slugs))

    def fetch(self) -> list:
        print(f"[github_rest] 拉取 catalog.csv 精选 {len(self.slugs)} 个仓库…")
        entries = []
        h = {"Accept": "application/vnd.github+json"}
        if TOKEN:
            h["Authorization"] = "Bearer " + TOKEN
        elif len(self.slugs) > 55:
            print(f"  ⚠️ 无 GITHUB_TOKEN，匿名限额 60/h 可能被耗尽；建议配置 token")
        for i, slug in enumerate(self.slugs, 1):
            url = f"https://api.github.com/repos/{slug}"
            data = http_get(url, headers=h)
            if data and "full_name" in data:
                lic = (data.get("license") or {}).get("spdx_id")
                entries.append(Entry(
                    id=normalize_repo_url(data.get("html_url")) or f"github.com/{slug.lower()}",
                    source=self.name, title=data.get("name", slug),
                    desc=(data.get("description") or "")[:240],
                    repo_url=data.get("html_url"), repo_slug=slug.lower(),
                    stars=data.get("stargazers_count", 0),
                    forks=data.get("forks_count", 0),
                    pushed_at=data.get("pushed_at"),
                    status="archived" if data.get("archived") else "active",
                    lang=data.get("language"), license=lic,
                ))
            if i % 20 == 0:
                print(f"    github_rest: {i}/{len(self.slugs)}")
            time.sleep(SLEEP_GITHUB)
        print(f"[github_rest] 完成：{len(entries)}/{len(self.slugs)}")
        return entries


# ---------- npm ----------
class NpmFetcher(FetcherBase):
    name = "npm"
    priority = 2

    def fetch(self) -> list:
        print("[npm] 搜索 npm registry…")
        entries, seen = [], set()
        hay_kw = ("mcp server", "mcp", "agent tool", "agent skill", "ai tool", "ai automation")
        for kw in MCP_KEYWORDS + AGENT_KEYWORDS:
            q = urllib.parse.quote(kw)
            url = f"https://registry.npmjs.org/-/v1/search?text={q}&size=250"
            data = http_get(url)
            hits = (data or {}).get("objects", [])
            for h in hits:
                pkg = h.get("package", {})
                name = pkg.get("name", "")
                if not name or name in seen:
                    continue
                hay = f"{name} {(pkg.get('description') or '')}".lower().replace("-", " ").replace("_", " ")
                if not any(k in hay for k in hay_kw):
                    continue
                seen.add(name)
                links = pkg.get("links") or {}
                repo_url = links.get("repository")
                slug = repo_slug_from_url(repo_url)
                entries.append(Entry(
                    id=normalize_repo_url(repo_url) or f"npm:{name.lower()}",
                    source=self.name, title=name,
                    desc=(pkg.get("description") or "")[:240],
                    repo_url=repo_url, repo_slug=slug,
                    registry_url=f"https://www.npmjs.com/package/{name}",
                    published_at=pkg.get("date"),
                    version=pkg.get("version"),
                    downloads=(h.get("downloads") or {}).get("weekly"),
                    status="active", lang="JavaScript",
                ))
            time.sleep(SLEEP_INDEX)
        print(f"[npm] 完成：{len(entries)} 条")
        return entries


# ---------- crates.io ----------
class CratesFetcher(FetcherBase):
    name = "crates"
    priority = 2

    def fetch(self) -> list:
        print("[crates] 搜索 crates.io…")
        entries, seen = [], set()
        for kw in MCP_KEYWORDS + AGENT_KEYWORDS[:3]:
            q = urllib.parse.quote(kw)
            url = f"https://crates.io/api/v1/crates?q={q}&per_page=100&sort=recent-downloads"
            data = http_get(url)
            for c in ((data or {}).get("crates") or []):
                name = c.get("name", "")
                if not name or name in seen:
                    continue
                desc = (c.get("description") or "").lower()
                if not any(k in f"{name} {desc}" for k in ("mcp", "agent-tool", "ai-tool", "automation")):
                    continue
                seen.add(name)
                repo_url = c.get("repository")
                slug = repo_slug_from_url(repo_url)
                entries.append(Entry(
                    id=normalize_repo_url(repo_url) or f"crates:{name.lower()}",
                    source=self.name, title=name,
                    desc=(c.get("description") or "")[:240],
                    repo_url=repo_url, repo_slug=slug,
                    registry_url=c.get("project_url"),
                    published_at=c.get("updated_at"), version=c.get("max_version"),
                    downloads=c.get("recent_downloads"), status="active", lang="Rust",
                ))
            time.sleep(SLEEP_INDEX)
        print(f"[crates] 完成：{len(entries)} 条")
        return entries


# ---------- Pipeline ----------
def load_catalog() -> tuple:
    slugs, ids = set(), set()
    with open(CATALOG, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if len(row) < 3:
                continue
            s = repo_slug_from_url(row[2])
            if s:
                slugs.add(s)
                ids.add(f"github.com/{s}")
    return sorted(slugs), ids


def run_pipeline() -> dict:
    catalog_slugs, catalog_ids = load_catalog()
    print(f"\ncatalog.csv：{len(catalog_slugs)} 条人工精选\n")

    fetchers: list[FetcherBase] = [
        MCPRegistryFetcher(),
        NpmFetcher(),
        CratesFetcher(),
    ]
    all_entries: list[Entry] = []
    for f in fetchers:
        try:
            all_entries.extend(f.fetch())
        except Exception as e:
            print(f"[{f.name}] 崩溃：{e}", file=sys.stderr)

    # GitHub REST：只有带 token 时才跑（匿名本地容易被限流 403）
    if TOKEN:
        print(f"\n[github_rest] 带 token 模式，拉 catalog.csv 精选 {len(catalog_slugs)} 个仓库…")
        gh_entries = GitHubRESTFetcher(catalog_slugs).fetch()
        all_entries.extend(gh_entries)
    else:
        print(f"\n[github_rest] 无 GITHUB_TOKEN，跳过 catalog 精选 REST 拉取（线上 Actions 会带 token 跑）")
        print(f"[github_rest] 当前匿名环境下，curated 会只合并到 npm/crates/registry 能覆盖的 catalog 条目")
        gh_entries = []

    # ---- 按 id 去重合并 ----
    name_pri = {f.name: f.priority for f in fetchers + [GitHubRESTFetcher([])]}
    sources = sorted({e.source for e in all_entries},
                     key=lambda s: name_pri.get(s, 0), reverse=True)
    index: dict[str, Entry] = {}
    for src in sources:
        for e in [x for x in all_entries if x.source == src]:
            key = e.id
            if key in index:
                index[key].merge_from(e)
            else:
                index[key] = e

    merged = list(index.values())

    # ---- 分桶 ----
    curated = [e for e in merged if e.id in catalog_ids]
    candidates = [e for e in merged if e.id not in catalog_ids]

    # ---- Phase 2: confidence + 分类推断 + seen 过滤 + inbox 输出 ----
    def classify_candidate(entry: Entry) -> tuple:
        """返回 (分类名, 分类命中分, 命中关键词列表)。最高分为第一候选分类。"""
        hay = f"{entry.title} {entry.desc} {entry.repo_slug or ''} {entry.repo_url or ''} {entry.registry_url or ''}".lower()
        best = None  # (score, cat_name, hits)
        for cat_name, kws in CLASSIFY_RULES:
            score, hits = 0, []
            for kw in kws:
                if kw.lower() in hay:
                    # 长关键词权重更高
                    score += 3 if len(kw) >= 8 else 2
                    hits.append(kw)
            if score > 0:
                if best is None or score > best[0]:
                    best = (score, cat_name, hits)
        return (best[1], best[0], best[2]) if best else ("1. 目录、Skills 与通用 AI 工具适配", 0, [])

    for e in candidates:
        # confidence 评分（保留原逻辑，略调权重）
        score = 0
        if e.source == "mcp_registry": score += 3
        if e.stars:
            if e.stars >= 50: score += 2
            if e.stars >= 500: score += 1
            if e.stars >= 2000: score += 1
        if e.status == "active": score += 1
        if e.endpoint: score += 1
        if e.downloads: score += 1
        # 有 GitHub 仓库比纯 npm/crates 包更可信（更容易直接进 catalog）
        if e.repo_slug: score += 1
        # 综合 bonus：四要素齐全（官方 Registry 源 + 活跃 + 有端点 + 有 GitHub 仓库）
        # 这是候选能直接进 catalog 的最强信号，+1 把封顶推到 7
        if (e.source == "mcp_registry" and e.status == "active"
                and e.endpoint and e.repo_slug):
            score += 1
        e.extra["confidence"] = score

        # 分类推断
        cat_name, cat_score, hits = classify_candidate(e)
        e.extra["suggested_category"] = cat_name
        e.extra["category_confidence"] = cat_score
        e.extra["category_hits"] = hits

    candidates.sort(key=lambda e: e.extra.get("confidence", 0), reverse=True)
    candidates = candidates[:CANDIDATE_LIMIT]

    # 生成 catalog.csv 行模板（供人类审核时复制粘贴）
    def catalog_row_template(entry: Entry, cat_name: str) -> str:
        # 铲子名用 title；描述用 desc（截断到自然结尾）；URL 优先 repo_url，其次 registry_url
        title = entry.title.strip()
        desc = (entry.desc or "").strip()
        if len(desc) > 40:
            # 截断到最后一个自然标点
            last_punct = max([desc.rfind(p) for p in ("。", ".", "；", ";", ",", "，")])
            if last_punct > 25:
                desc = desc[:last_punct + 1]
        clean_title = re.sub(r"[（(][^）)]*[）)]", "", title).strip()  # 去括号描述
        if clean_title:
            clean_title = re.sub(r"^[A-Za-z0-9_\-./@]+", "", clean_title).strip(" -·")
        display_title = f"{title}（{desc or '—'}）"
        display_title = re.sub(r"\s+", " ", display_title).strip()
        url = entry.repo_url or entry.registry_url or ""
        return f"{cat_name},{display_title},{url}"

    # ---- seen_candidates 持久化（Experience 2376165 教训：闭环不能拆） ----
    seen = set()
    if os.path.exists(SEEN_STATE):
        try:
            with open(SEEN_STATE, encoding="utf-8") as f:
                seen = set(json.load(f))
        except Exception:
            seen = set()

    new_seen = set(seen)

    # ---- inbox 输出 ----
    inbox_dir = os.path.join(os.path.dirname(OUTPUT), INBOX_DIR)
    os.makedirs(inbox_dir, exist_ok=True)
    inbox_entries = []

    for e in candidates:
        if e.id in seen:
            continue  # 已经见过了，无论入精选还是 reject，不再重复上报
        if e.extra.get("confidence", 0) < INBOX_THRESHOLD:
            # confidence 不够但也是"新"候选，只进 seen 不进 inbox（避免噪声）
            new_seen.add(e.id)
            continue
        if not (e.repo_url or e.registry_url):
            continue  # 没有可指向的仓库或注册表，无法入精选
        cat = e.extra.get("suggested_category", "1. 目录、Skills 与通用 AI 工具适配")
        row = catalog_row_template(e, cat)
        inbox_entries.append({
            "id": e.id,
            "source": e.source,
            "title": e.title,
            "repo_url": e.repo_url,
            "repo_slug": e.repo_slug,
            "registry_url": e.registry_url,
            "endpoint": e.endpoint,
            "stars": e.stars,
            "downloads": e.downloads,
            "confidence": e.extra.get("confidence", 0),
            "suggested_category": cat,
            "category_confidence": e.extra.get("category_confidence", 0),
            "category_hits": e.extra.get("category_hits", []),
            "catalog_row": row,
            "human_decision": None,  # 人类 review 后填 "accept" / "reject"
        })
        new_seen.add(e.id)

    # 写 _inbox/YYYYMMDD.json
    if inbox_entries:
        date_tag = time.strftime("%Y%m%d", time.gmtime())
        inbox_path = os.path.join(inbox_dir, f"{date_tag}.json")
        inbox_generated = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        inbox_payload = {
            "generated_at": inbox_generated,
            "inbox_count": len(inbox_entries),
            "new_seen_count": len(new_seen) - len(seen),
            "threshold": INBOX_THRESHOLD,
            "candidates": inbox_entries,
        }
        with open(inbox_path, "w", encoding="utf-8") as f:
            json.dump(inbox_payload, f, ensure_ascii=False, indent=2)
        print(f"\n[inbox] 新候选 {len(inbox_entries)} 条（confidence ≥ {INBOX_THRESHOLD}）→ {inbox_path}")
    else:
        print(f"\n[inbox] 本轮无新候选（confidence ≥ {INBOX_THRESHOLD} 但 seen 全部覆盖）")

    # 写 seen_candidates.json（永远更新，哪怕本轮没有 inbox 条目）
    state_dir = os.path.dirname(SEEN_STATE)
    os.makedirs(state_dir, exist_ok=True)
    with open(SEEN_STATE, "w", encoding="utf-8") as f:
        json.dump(sorted(new_seen), f, ensure_ascii=False, indent=2)
    print(f"[seen] {len(new_seen)} 条已持久化 → {SEEN_STATE}（本轮新增 {len(new_seen) - len(seen)} 条）")

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sc = {s: sum(1 for e in merged if e.source == s) for s in name_pri}

    payload = {
        "updated_at": now,
        "curated_count": len(curated),
        "candidates_count": len(candidates),
        "inbox_count": len(inbox_entries),
        "curated": {e.repo_slug or e.id: e.to_json() for e in curated},
        "candidates": [e.to_json() for e in candidates],
        "inbox": inbox_entries,  # 高置信候选（confidence ≥ THRESHOLD），含建议分类 + catalog.csv 行模板
        "source_counts": sc,
    }
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=0)

    print(f"\n==== Pipeline 完成 ====")
    print(f"curated 精选: {len(curated)}")
    print(f"candidates 候选: {len(candidates)}（confidence 截断 Top {CANDIDATE_LIMIT}）")
    print(f"inbox 高置信: {len(inbox_entries)}（confidence ≥ {INBOX_THRESHOLD}）")
    for s, c in sc.items():
        print(f"  {s:20s}: {c}")
    print(f"写入 {OUTPUT}")
    return payload


if __name__ == "__main__":
    run_pipeline()
