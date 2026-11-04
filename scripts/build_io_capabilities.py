#!/usr/bin/env python3
"""工具输入输出能力画像生成脚本（Phase 1 / 任务书 §五）。

原则：
  - 只用可核验来源：官方 README（raw.githubusercontent.com）+ GitHub 仓库描述（live_multi.json）；
  - 确定性关键词规则，不接 LLM、不按工具名称脑补；
  - 严格搭配（verb-context collocation）：token 必须出现在 input/output 动词上下文同一行内才算显式证据；
  - profile 证据等级：输入+输出均有显式证据 → documented；有部分信号/仅操作派生 → inferred；无任何信号 → unverified；
  - 未知字段保留为空数组（= unknown），宁可 unknown 也不虚报。

输入：
  - astro/public/catalog.csv        工具 ID 权威来源
  - astro/public/live_multi.json    官方仓库描述
  - README 缓存目录（无缓存则联网抓取）

输出：
  - astro/src/data/tool-map/io-capabilities.json
  - docs/development/tool-map/CAPABILITY-PROFILE-REPORT.md
"""
from __future__ import annotations

import csv
import io as _io
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
ASTRO = ROOT / "astro"
SRC_DATA = ASTRO / "src" / "data" / "tool-map"
OUT_JSON = SRC_DATA / "io-capabilities.json"
OUT_REPORT = ROOT / "docs" / "development" / "tool-map" / "CAPABILITY-PROFILE-REPORT.md"
CACHE_DIR = ROOT.parent / "_cache" / "readme"  # 仓库外缓存，不入库

# ---------------- 词表（与前端 types.ts / connectionChecker.ts 保持一致） ----------------
IO_VOCAB = [
    "url", "html", "text", "markdown", "json", "csv", "pdf", "office_doc",
    "image", "video", "audio", "code", "git_repo", "api_spec", "sql",
    "geojson", "chart", "report", "file", "alert",
]
PROTOCOL_VOCAB = ["mcp_server", "mcp_client", "mcp", "rest_api", "graphql", "websocket", "webhook", "cli", "stdio", "grpc"]
OP_VOCAB = [
    "web_scraping", "browser_automation", "document_parsing", "pdf_processing",
    "code_analysis", "data_query", "chart_generation", "file_conversion",
    "summarization", "search", "messaging", "monitoring", "translation",
    "ocr", "vector_search", "geospatial", "scheduling", "testing",
]
CONSTRAINT_VOCAB = ["requires_api_key", "requires_self_host", "requires_cloud_account", "requires_browser", "requires_gpu"]

# ---------------- 强证据短语规则（宁缺勿滥：只有明确 I/O 句式才算显式证据） ----------------
# token 的显示形态（用于正文匹配）
IO_TOKENS: dict[str, str] = {
    "url": r"\burls?\b",
    "html": r"\bhtml\b",
    "text": r"\b(?:plain[- ]?)?text\b",
    "markdown": r"\bmarkdown\b|\bmd\b",
    "json": r"\bjson\b",
    "csv": r"\bcsv\b",
    "pdf": r"\bpdfs?\b",
    "office_doc": r"\bdocx\b|\bxlsx\b|\bpptx\b|\bword documents?\b|excel spreadsheets?",
    "image": r"\bimages?\b|\bpngs?\b|\bjpe?g\b|screenshots?",
    "video": r"\bvideos?\b",
    "audio": r"\baudios?\b|\bmp3\b|\bwav\b|podcasts?",
    "code": r"source code|code (?:files?|snippets?|blocks?)|\bdiffs?\b|\bpatches\b",
    "git_repo": r"git(?:hub)? repositor\w+|repo urls?|\brepositories\b",
    "api_spec": r"openapi|swagger|api specificat\w+",
    "sql": r"\bsql\b",
    "geojson": r"\bgeojson\b|shapefiles?|\bgpkg\b",
    "file": r"\bfiles?\b",
    "chart": r"\bcharts?\b|diagrams?|\bmermaid\b|\becharts\b",
    "report": r"\breports?\b",
    "alert": r"\balerts?\b|notifications?",
}

# 强证据短语：只有明确的 I/O 句式才算显式证据（宁缺勿滥）
def input_phrase(tok: str) -> str:
    t = rf"(?:{tok})"  # 必须包组：token 内含 | 会污染顶层分支，导致裸词误匹配
    return (
        rf"(?:inputs?|accepts?|takes?|reads?|pars(?:e|es|ing)|loads?)\s*[:\-]?\s*(?:a |an |the )?{t}\b"
        rf"|(?:{t}\s+(?:input|as input)\b)"
        rf"|(?:support(?:s|ed)?\s+(?:a |an |the )?{t}\s+(?:input|format)s?\b)"
    )


def output_phrase(tok: str) -> str:
    t = rf"(?:{tok})"
    return (
        rf"(?:outputs?|returns?|produces?|generates?|exports?|writes?)\s*[:\-]?\s*(?:a |an |the )?{t}\b"
        rf"|(?:convert(?:s|ed|ing)?[^.\n]{{0,40}}to\s+(?:a |an |the )?{t}\b)"
        rf"|(?:{t}\s+output\b)"
    )


INPUT_RULES: dict[str, str] = {k: input_phrase(v) for k, v in IO_TOKENS.items()}
OUTPUT_RULES: dict[str, str] = {k: output_phrase(v) for k, v in IO_TOKENS.items()}

PROTOCOL_RULES: list[tuple[str, str]] = [
    ("mcp_server", r"mcp[- ]servers?|model context protocol servers?|server[^.\n]{0,40}\bvia mcp\b|an? mcp (?:server|tool)|implements?[^.\n]{0,40}mcp"),
    ("mcp_client", r"(?:is|as|being)\s+(?:an?\s+|your\s+)?mcp[- ]clients?|mcp[- ]clients?\s+for\b|connect(?:s|ing)?\s+to\s+(?:an? |your |the )?mcp[- ]?servers?|works? with any mcp|any mcp servers|add\s+(?:any |your )?mcp[- ]?servers?"),
    ("mcp", r"\bmodel context protocol\b|\bmcp\b"),
    ("rest_api", r"rest api|restful|http api|openapi"),
    ("graphql", r"\bgraphql\b"),
    ("websocket", r"\bwebsocket\b"),
    ("webhook", r"\bwebhooks?\b"),
    ("stdio", r"\bstdio\b"),
    ("grpc", r"\bgrpc\b"),
    ("cli", r"command[- ]line|\bcli\b"),
]

# 操作类型规则（比 I/O 宽松一档：仅用于操作标注与 inferred 派生）
OP_RULES: dict[str, str] = {
    "web_scraping": r"scrap(?:e|er|ing)|crawl(?:er|ing)? (?:the )?web|web (?:scraping|extraction|crawler)",
    "browser_automation": r"playwright|puppeteer|selenium|browser automation|headless (?:browser|chrome)",
    "document_parsing": r"document pars|pars(?:e|es|ing)\s+[^.\n]{0,20}(?:pdfs?|documents?|docx|html|files?)|extract(?:ing|ion)? text from",
    "pdf_processing": r"(?:pars|convert|extract|read|process|merge|split|edit|create|generat|annotat)[^.\n]{0,30}\bpdfs?\b|\bpdfs?\b[^.\n]{0,30}(?:pars|convert|extract|process|to )",
    "code_analysis": r"code quality|static analysis|code review|lint(?:er|ing)?|\bsonar|security (?:scan|analysis)|vulnerabilit",
    "data_query": r"database quer|query (?:the )?(?:database|data)|\bsql\b[^.\n]{0,30}(?:quer|statement|run)|run[^.\n]{0,20}\bsql\b",
    "chart_generation": r"(?:generat|creat|render|build|produc)[^.\n]{0,30}\b(?:charts?|graphs?|visuali)|data visuali|visuali[sz](?:e|ation)|\becharts\b|\bmermaid\b",
    "file_conversion": r"convert\w*\s+[^.\n]{0,40}\b(?:to|into|between|formats?)|format conversion",
    "summarization": r"summariz|summaries of (?:the )?(?:video|article|document|content|page|paper)",
    "search": r"search(?:ing)? (?:the )?(?:web|internet|repositories|papers|documentation)|semantic search|full[- ]text search",
    "messaging": r"send (?:a )?(?:message|notification|alert)|slack channel|telegram bot|email notify|notify (?:users?|via)",
    "monitoring": r"monitor(?:ing)?|\bobservability\b|\bmetrics?\b|\balerts?\b|\btraces?\b",
    "translation": r"\btranslat(?:e|ed|ion|or)\b",
    "ocr": r"\bocr\b|optical character",
    "vector_search": r"(?:vector|embedding)[^.\n]{0,30}(?:store|search|database|index|memory)|\brag\b",
    "geospatial": r"geospatial|\bgis\b|geojson|openstreetmap|geocod|shapefile|\bqgis\b|\bgdal\b|latitude|longitude",
    "scheduling": r"calendar|meeting schedul|schedul\w+ (?:meetings?|events?|appointments?)|\breminders?\b",
    "testing": r"e2e test|test automation|automated (?:ui |e2e )?tests?|playwright tests?",
}

# 操作类型 → 默认 I/O（规则派生，evidenceLevel=inferred 的依据）
OP_IO: dict[str, dict[str, list[str]]] = {
    "web_scraping": {"inputs": ["url"], "outputs": ["html", "text"]},
    "browser_automation": {"inputs": ["url", "text"], "outputs": ["text", "html", "image"]},
    "document_parsing": {"inputs": ["pdf", "office_doc", "html"], "outputs": ["text", "json"]},
    "pdf_processing": {"inputs": ["pdf"], "outputs": ["pdf", "text"]},
    "code_analysis": {"inputs": ["code", "git_repo"], "outputs": ["report", "json"]},
    "data_query": {"inputs": ["sql", "text"], "outputs": ["json"]},
    "chart_generation": {"inputs": ["json", "csv"], "outputs": ["chart", "image"]},
    "file_conversion": {"inputs": ["pdf", "office_doc", "markdown", "html"], "outputs": ["pdf", "markdown", "html", "office_doc"]},
    "summarization": {"inputs": ["text", "video", "audio", "markdown"], "outputs": ["text", "markdown"]},
    "search": {"inputs": ["text", "url"], "outputs": ["json", "text"]},
    "messaging": {"inputs": ["text", "json"], "outputs": ["alert"]},
    "monitoring": {"inputs": ["json"], "outputs": ["json", "alert", "report"]},
    "translation": {"inputs": ["text"], "outputs": ["text"]},
    "ocr": {"inputs": ["image"], "outputs": ["text", "json"]},
    "vector_search": {"inputs": ["text"], "outputs": ["json"]},
    "geospatial": {"inputs": ["geojson", "csv", "url"], "outputs": ["geojson", "json", "image"]},
    "scheduling": {"inputs": ["text", "json"], "outputs": ["alert", "json"]},
    "testing": {"inputs": ["url", "code"], "outputs": ["report", "json"]},
}

CONSTRAINT_RULES: dict[str, str] = {
    "requires_api_key": r"api[-_ ]?keys?|apikey|tokens? (?:is )?required|authentication required",
    "requires_self_host": r"self[- ]host|docker (?:run|compose|container)|deploy (?:your own|locally)|localhost:\d+",
    "requires_cloud_account": r"cloud (?:account|service)|\bsaas\b|sign ?up (?:for|to)",
    "requires_browser": r"requires? (?:a )?browser|chrome(?:rium)? (?:browser|install)",
    "requires_gpu": r"\bgpus?\b|\bcuda\b",
}

URL_RE = re.compile(r"^https?://(www\.)?github\.com/([^/\s]+/[^/\s]+?)(\.git)?/?$")


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def catalog_repo_ids() -> list[str]:
    raw = (ASTRO / "public" / "catalog.csv").read_text(encoding="utf-8-sig")
    rows = [r for r in csv.reader(_io.StringIO(raw)) if r and any(c.strip() for c in r)]
    if rows and rows[0][0].strip().startswith("分类"):
        rows = rows[1:]
    ids = []
    for row in rows:
        url = (row[2] if len(row) > 2 else "").strip()
        m = URL_RE.match(url)
        if m and m.group(2) not in ids:
            ids.append(m.group(2))
    return ids


def fetch_readme(repo_id: str) -> tuple[str | None, bool]:
    """返回 (readme_text, from_cache)。HEAD → main → master 依次尝试；负缓存空文件。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / (repo_id.replace("/", "__") + ".md")
    if cache.exists():
        txt = cache.read_text(encoding="utf-8", errors="replace")
        return (txt if txt.strip() else None), True
    for branch in ("HEAD", "main", "master"):
        url = f"https://raw.githubusercontent.com/{repo_id}/{branch}/README.md"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ai-shovel-relation-analysis"})
            with urllib.request.urlopen(req, timeout=15) as r:
                text = r.read().decode("utf-8", errors="replace")
            if text.strip():
                cache.write_text(text, encoding="utf-8")
                return text, False
        except Exception:
            continue
    cache.write_text("", encoding="utf-8")
    return None, False


def first_hits(rules: dict[str, str], text: str) -> list[str]:
    return [k for k, pat in rules.items() if re.search(pat, text)]


def extract(repo_id: str, readme: str | None, desc: str) -> dict:
    body = (readme or "") + "\n" + (desc or "")
    low = body.lower()
    desc_low = (desc or "").lower()

    protocols = [p for p, pat in PROTOCOL_RULES if re.search(pat, low)]
    if ("mcp_server" in protocols or "mcp_client" in protocols) and "mcp" in protocols:
        protocols.remove("mcp")
    if not protocols and re.search(r"\bmcp\b", desc_low):
        protocols.append("mcp")

    operations = [op for op, pat in OP_RULES.items() if re.search(pat, low)]

    explicit_in = first_hits(INPUT_RULES, low)
    explicit_out = first_hits(OUTPUT_RULES, low)
    # 描述字段短且官方，直接参与严格搭配匹配（同规则）
    explicit_in = sorted(set(explicit_in) | set(first_hits(INPUT_RULES, desc_low)))
    explicit_out = sorted(set(explicit_out) | set(first_hits(OUTPUT_RULES, desc_low)))

    derived_in: set[str] = set()
    derived_out: set[str] = set()
    for op in operations:
        derived_in |= set(OP_IO.get(op, {}).get("inputs", []))
        derived_out |= set(OP_IO.get(op, {}).get("outputs", []))
    derived_in -= set(explicit_in)
    derived_out -= set(explicit_out)

    inputs = explicit_in + sorted(derived_in)
    outputs = explicit_out + sorted(derived_out)
    constraints = [k for k, pat in CONSTRAINT_RULES.items() if re.search(pat, low)]

    has_any_signal = bool(explicit_in or explicit_out or derived_in or derived_out or protocols or operations)
    if explicit_in and explicit_out:
        evidence_level = "documented"       # 输入+输出均有文档级显式证据
    elif has_any_signal:
        evidence_level = "inferred"         # 部分显式或仅操作派生
    else:
        evidence_level = "unverified"       # 无任何有效信号

    evidence = []
    if readme:
        evidence.append({"type": "readme", "url": f"https://github.com/{repo_id}#readme"})
    if desc:
        evidence.append({"type": "repo_description", "url": f"https://github.com/{repo_id}"})
    if not evidence:
        evidence.append({"type": "official_repository", "url": f"https://github.com/{repo_id}"})

    return {
        "repo": repo_id,
        "operations": operations,
        "inputs": inputs,
        "outputs": outputs,
        "protocols": protocols,
        "constraints": constraints,
        "explicitInputs": explicit_in,
        "explicitOutputs": explicit_out,
        "evidence": evidence,
        "evidenceLevel": evidence_level,
        "summary": (desc[:160] if desc else ""),
    }


def main() -> int:
    ids = catalog_repo_ids()
    live = load_json(ASTRO / "public" / "live_multi.json").get("curated") or {}
    if isinstance(live, list):
        desc_by_key = {}
        for e in live:
            slug = (e.get("repo_slug") or e.get("repo_url", "").replace("https://github.com/", "")).lower()
            if slug:
                desc_by_key[slug] = e.get("desc") or ""
    else:
        desc_by_key = {k.lower(): (v.get("desc") or "") for k, v in live.items()}

    results: dict[str, dict] = {}
    fetch_new = fetch_cached = fetch_fail = 0

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_readme, r): r for r in ids}
        done = 0
        for f in as_completed(futs):
            rid = futs[f]
            readme, from_cache = f.result()
            if readme:
                if from_cache:
                    fetch_cached += 1
                else:
                    fetch_new += 1
            else:
                fetch_fail += 1
            results[rid] = extract(rid, readme, desc_by_key.get(rid.lower(), ""))
            done += 1
            if done % 50 == 0:
                print(f"[io] {done}/{len(ids)} processed", flush=True)

    profiles = {rid: results[rid] for rid in ids}

    stats = {
        "tools": len(profiles),
        "readmeFetched": fetch_new,
        "readmeCached": fetch_cached,
        "readmeMissing": fetch_fail,
        "withInputs": sum(1 for p in profiles.values() if p["inputs"]),
        "withOutputs": sum(1 for p in profiles.values() if p["outputs"]),
        "withIoBoth": sum(1 for p in profiles.values() if p["inputs"] and p["outputs"]),
        "withExplicitIoBoth": sum(1 for p in profiles.values() if p["explicitInputs"] and p["explicitOutputs"]),
        "withProtocols": sum(1 for p in profiles.values() if p["protocols"]),
        "withOperations": sum(1 for p in profiles.values() if p["operations"]),
        "withConstraints": sum(1 for p in profiles.values() if p["constraints"]),
        "byEvidenceLevel": {
            lv: sum(1 for p in profiles.values() if p["evidenceLevel"] == lv)
            for lv in ("documented", "inferred", "unverified")
        },
        "mcpServers": sum(1 for p in profiles.values() if "mcp_server" in p["protocols"]),
        "mcpClients": sum(1 for p in profiles.values() if "mcp_client" in p["protocols"]),
    }

    payload = {
        "version": 1,
        "note": "工具输入输出能力画像。仅依据官方 README/仓库描述做确定性严格搭配分析：explicit*=I/O 动词上下文直接命中（documented 需输入+输出双侧显式），操作派生 I/O 为 inferred，无信号为 unverified；空数组=unknown，禁止按工具名脑补。",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "vocabulary": {"io": IO_VOCAB, "protocols": PROTOCOL_VOCAB, "operations": OP_VOCAB, "constraints": CONSTRAINT_VOCAB},
        "stats": stats,
        "profiles": profiles,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    t = stats["tools"]
    lines = [
        "# 工具能力画像建设报告（CAPABILITY-PROFILE-REPORT）",
        "",
        f"> 由 `scripts/build_io_capabilities.py` 生成于 {payload['generatedAt']}；来源：官方 README（raw.githubusercontent.com）+ 仓库描述（live_multi.json）。README 缓存：`../_cache/readme/`（仓库外）。",
        "",
        "## 覆盖统计",
        "",
        "| 指标 | 数量 | 占比 |",
        "|---|---|---|",
        f"| 工具总数 | {t} | 100% |",
        f"| README 抓取成功（本次新抓） | {stats['readmeFetched']} | {stats['readmeFetched']/t:.0%} |",
        f"| README 缓存命中 | {stats['readmeCached']} | — |",
        f"| README 缺失（仅仓库描述可用） | {stats['readmeMissing']} | {stats['readmeMissing']/t:.0%} |",
        f"| 具备输入画像 | {stats['withInputs']} | {stats['withInputs']/t:.0%} |",
        f"| 具备输出画像 | {stats['withOutputs']} | {stats['withOutputs']/t:.0%} |",
        f"| 输入+输出均具备 | {stats['withIoBoth']} | {stats['withIoBoth']/t:.0%} |",
        f"| 输入+输出均为文档显式证据 | {stats['withExplicitIoBoth']} | {stats['withExplicitIoBoth']/t:.0%} |",
        f"| 具备协议标注 | {stats['withProtocols']} | {stats['withProtocols']/t:.0%} |",
        f"| 具备操作标注 | {stats['withOperations']} | {stats['withOperations']/t:.0%} |",
        f"| 具备约束标注 | {stats['withConstraints']} | {stats['withConstraints']/t:.0%} |",
        "",
        "## 证据等级分布",
        "",
        "| 等级 | 数量 | 判定条件 |",
        "|---|---|---|",
        f"| documented | {stats['byEvidenceLevel']['documented']} | 输入与输出均有 I/O 动词上下文的显式命中 |",
        f"| inferred | {stats['byEvidenceLevel']['inferred']} | 仅单侧显式，或仅操作规则派生 |",
        f"| unverified | {stats['byEvidenceLevel']['unverified']} | 无任何有效信号（无 README 且描述无信息） |",
        "",
        "## 协议侧写",
        "",
        f"- MCP Server 声明（严格搭配）：{stats['mcpServers']}",
        f"- MCP Client 声明（严格搭配）：{stats['mcpClients']}",
        "",
        "## 规则说明与限制",
        "",
        "- 严格搭配：token 必须与 input/output 动词（accept/parse/read/input/return/generate/convert…）同行且 ≤60 字符，避免 README 顺带提及造成虚报。",
        "- `explicitInputs/explicitOutputs` = 文档显式证据；`OP_IO` 操作派生部分为 inferred。",
        "- 空 `inputs/outputs` = 未知，前端检查器必须按 unknown 处理，不得当作兼容或冲突。",
        "- 画像只服务于连线检查提示，不能单独作为关系 documented/verified 的依据。",
        "- 词表/规则全部在脚本内可复核；重新运行脚本可复现（README 缓存命中则不重复联网）。",
    ]
    OUT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"[io] tools={stats['tools']} new={stats['readmeFetched']} cached={stats['readmeCached']} "
          f"missing={stats['readmeMissing']} both_io={stats['withIoBoth']} explicit_both={stats['withExplicitIoBoth']} "
          f"levels={stats['byEvidenceLevel']} mcp_s={stats['mcpServers']} mcp_c={stats['mcpClients']}")
    print(f"[io] wrote {OUT_JSON.relative_to(ROOT)} and {OUT_REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
