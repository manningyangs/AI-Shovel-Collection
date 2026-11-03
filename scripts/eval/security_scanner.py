"""
安全扫描器（V1.0 核心模块）
纯静态：不执行任何命令、不 pip install、不 npm install、不 docker build
  - 依赖版本硬编码（>= x.y.z）
  - 已知危险代码模式（subprocess/eval/exec/shell=True/反序列化等）
  - 敏感信息暴露（API Key / Token / Secret / 密码硬编码）
  - OSV API 公开漏洞数据库查询（异步，GitHub Actions 超时可控）
"""
from __future__ import annotations

import json
import re
from typing import Any

import requests


# 危险代码模式
DANGEROUS_PATTERNS = [
    # Python
    {"name": "eval() / exec()", "pattern": re.compile(r"\b(?:eval|exec)\s*\("), "severity": "high", "lang": "py"},
    {"name": "subprocess with shell=True", "pattern": re.compile(r"subprocess\.(?:run|Popen|call|check_output)\s*\([^)]*shell\s*=\s*True"), "severity": "high", "lang": "py"},
    {"name": "os.system()", "pattern": re.compile(r"\bos\.system\s*\("), "severity": "high", "lang": "py"},
    {"name": "pickle.loads / pickle.load", "pattern": re.compile(r"pickle\.(?:loads?|Unpickler)"), "severity": "high", "lang": "py"},
    {"name": "yaml.load without SafeLoader", "pattern": re.compile(r"yaml\.load\s*\([^)]*\)(?![^(]*SafeLoader)"), "severity": "high", "lang": "py"},
    {"name": "requests.get with verify=False", "pattern": re.compile(r"requests\.(?:get|post|put|delete|request)\s*\([^)]*verify\s*=\s*False"), "severity": "medium", "lang": "py"},
    # JS / Node
    {"name": "eval() / Function()", "pattern": re.compile(r"\b(?:eval|new\s+Function)\s*\("), "severity": "high", "lang": "js"},
    {"name": "child_process.exec / execSync", "pattern": re.compile(r"child_process\.(?:exec|execSync|spawn|spawnSync)\s*\("), "severity": "medium", "lang": "js"},
    {"name": "child_process with shell: true", "pattern": re.compile(r"shell\s*:\s*true"), "severity": "medium", "lang": "js"},
    {"name": "dangerouslySetInnerHTML", "pattern": re.compile(r"dangerouslySetInnerHTML"), "severity": "medium", "lang": "js"},
    {"name": "document.write / innerHTML with variable", "pattern": re.compile(r"document\.(?:write|writeln)\s*\("), "severity": "low", "lang": "js"},
]

# 敏感信息模式
SECRET_PATTERNS = [
    {"name": "GitHub Personal Access Token", "pattern": re.compile(r"ghp_[A-Za-z0-9]{36}")},
    {"name": "GitHub OAuth Token", "pattern": re.compile(r"gho_[A-Za-z0-9]{36}")},
    {"name": "AWS Access Key ID", "pattern": re.compile(r"AKIA[0-9A-Z]{16}")},
    {"name": "AWS Secret Key", "pattern": re.compile(r"aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}")},
    {"name": "Stripe Secret Key", "pattern": re.compile(r"sk_live_[A-Za-z0-9]{16,}")},
    {"name": "Slack Token", "pattern": re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")},
    {"name": "Google API Key", "pattern": re.compile(r"AIza[0-9A-Za-z\-_]{35}")},
    {"name": "Private Key Block", "pattern": re.compile(r"-----BEGIN\s+(?:RSA|EC|DSA|OpenSSH|PGP|ENCRYPTED)\s+PRIVATE\s+KEY-----")},
    {"name": "Hardcoded Password", "pattern": re.compile(r"(?:password|passwd|pwd)\s*[:=]\s*['\"]([^'\"]{4,})['\"]")},
]


# 白名单：这些文件/目录中的匹配忽略（第三方库、测试 fixtures、文档示例）
WHITELIST_PATHS = re.compile(
    r"(?:node_modules/|\.git/|\.github/|tests?/|spec/|fixtures?/|__pycache__/"
    r"|dist/|build/|vendor/|\.tox/|\.venv/|site-packages/"
    r"|\.lock$|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)"
)

# 要扫描的文件扩展名
SCAN_EXTENSIONS = {
    ".py", ".pyi", ".js", ".jsx", ".mjs", ".cjs",
    ".ts", ".tsx",
    ".go", ".rs", ".java", ".kt",
    ".sh", ".bash", ".zsh",
    ".yml", ".yaml", ".json",
}


def scan_code(tree_files: list[str], contents: dict[str, str | None]) -> dict[str, Any]:
    """
    扫描代码文件中的危险模式和敏感信息。
    """
    dangerous_findings = []
    secret_findings = []
    files_scanned = 0

    for path in tree_files:
        # 跳过白名单
        if WHITELIST_PATHS.search(path):
            continue

        # 检查扩展名
        ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
        if ext not in SCAN_EXTENSIONS:
            continue

        content = contents.get(path)
        if not content:
            continue

        files_scanned += 1

        # 危险模式
        for pat_def in DANGEROUS_PATTERNS:
            # 简单语言过滤（不是硬限制，只是减少误报）
            if pat_def["lang"] == "py" and ext not in (".py", ".pyi"):
                continue
            if pat_def["lang"] == "js" and ext not in (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"):
                continue

            for m in pat_def["pattern"].finditer(content):
                line_no = content[:m.start()].count("\n") + 1
                dangerous_findings.append({
                    "file": path,
                    "line": line_no,
                    "match": m.group()[:120],
                    "pattern_name": pat_def["name"],
                    "severity": pat_def["severity"],
                })

        # 敏感信息
        for pat_def in SECRET_PATTERNS:
            for m in pat_def["pattern"].finditer(content):
                line_no = content[:m.start()].count("\n") + 1
                secret_findings.append({
                    "file": path,
                    "line": line_no,
                    "match": _mask_secret(m.group()),
                    "pattern_name": pat_def["name"],
                })

    return {
        "files_scanned": files_scanned,
        "dangerous_findings": dangerous_findings,
        "secret_findings": secret_findings,
        "total_findings": len(dangerous_findings) + len(secret_findings),
    }


def _mask_secret(match: str) -> str:
    """对敏感信息做脱敏，只显示前后几位。"""
    if len(match) <= 8:
        return "***"
    return match[:4] + "***" + match[-4:]


# OSV API 公开漏洞数据库查询
# 文档：https://osv.dev/docs/api/
def query_osv_dependencies(deps: list[dict[str, str]]) -> list[dict[str, Any]]:
    """
    对依赖包版本查询 OSV（Open Source Vulnerabilities）。
    deps: [{name, version, ecosystem}, ...]
    返回漏洞列表 [{package, version, severity, osv_id, summary}, ...]
    """
    vulns = []
    batch_size = 100  # OSV API 单次最多 100 个

    for i in range(0, len(deps), batch_size):
        batch = deps[i:i + batch_size]
        payload = {
            "package": {"name": "*"},
            "version": "*",
            "query": [
                {"package": {"name": d["name"], "ecosystem": d.get("ecosystem", "")}, "version": d["version"]}
                for d in batch if d.get("version")
            ],
        }

        # 但 OSV 的批量查询用 POST /v1/querybatch 更高效
        # 这里简化：对每个 dep 单独查（V1.0 可以接受，V2.0 换成 querybatch）
        for dep in batch:
            try:
                result = _osv_query_single(dep["name"], dep.get("version", ""), dep.get("ecosystem", "PyPI"))
                for v in result:
                    vulns.append({
                        "package": dep["name"],
                        "version": dep["version"],
                        "ecosystem": dep.get("ecosystem", ""),
                        "osv_id": v.get("id", ""),
                        "severity": _osv_severity(v),
                        "summary": v.get("summary", "") or v.get("details", "")[:120],
                        "aliases": v.get("aliases", []),
                    })
            except Exception:
                # 单个失败不影响整体
                continue

    return vulns


def _osv_query_single(name: str, version: str, ecosystem: str) -> list[dict]:
    """查单个包的漏洞。"""
    if not version:
        return []
    payload = {
        "package": {"name": name, "ecosystem": ecosystem},
        "version": version,
    }
    try:
        resp = requests.post(
            "https://api.osv.dev/v1/query",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        result = resp.json()
        return result.get("vulns", []) or []
    except (requests.RequestException, TimeoutError, OSError):
        return []


def _osv_severity(vuln: dict) -> str:
    """从 OSV 响应中提取 severity（兼容不同字段）。"""
    # 新格式：severity[]
    for s in vuln.get("severity", []):
        score = s.get("score", "")
        if score:
            if score.startswith("CVSS_V3") or score.startswith("CVSS_V4") or score.startswith("CVSS_V2"):
                num = float(score.split(":", 1)[1]) if ":" in score else 0
                if num >= 9.0: return "critical"
                if num >= 7.0: return "high"
                if num >= 4.0: return "medium"
                return "low"
    # 旧格式 database_specific
    ds = vuln.get("database_specific", {}) or {}
    sev = (ds.get("severity") or "").lower()
    if sev in ("critical", "high", "medium", "low"):
        return sev
    return "medium"  # 默认为 medium


def extract_dependency_versions(tree_files: list[str], contents: dict[str, str | None]) -> list[dict[str, str]]:
    """
    从 manifest 文件中提取依赖名和版本。
    返回 [{name, version, ecosystem}, ...]
    """
    deps = []

    # package.json
    pkg = _safe_json(contents.get("package.json"))
    if pkg:
        for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            for name, ver in (pkg.get(key) or {}).items():
                clean_ver = re.sub(r"^[\^~>=<]+", "", str(ver)).split("||")[0].strip()
                if clean_ver and re.match(r"^\d+\.\d", clean_ver):
                    deps.append({"name": name, "version": clean_ver, "ecosystem": "npm"})

    # requirements.txt
    req = contents.get("requirements.txt", "") or ""
    for line in req.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        m = re.match(r"^([A-Za-z0-9_\-\.]+)\s*([><=!~]+)\s*([\d\.\w]+)", line)
        if m:
            deps.append({"name": m.group(1), "version": m.group(3), "ecosystem": "PyPI"})

    # pyproject.toml [project.dependencies] — 简化正则
    pyproject = contents.get("pyproject.toml", "") or ""
    for m in re.finditer(r'"([A-Za-z0-9_\-\.]+)(?:\[.*?\])?\s*([><=!~]+)\s*([\d\.\w]+)[,\"]', pyproject):
        deps.append({"name": m.group(1), "version": m.group(3), "ecosystem": "PyPI"})

    return deps


def _safe_json(text):
    if not text:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
