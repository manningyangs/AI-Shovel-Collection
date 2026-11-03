"""
README / 文档解析器（V1.0 核心模块）
纯静态：不下载外链、不渲染 Markdown、只做文本模式匹配
"""
from __future__ import annotations

import re
from typing import Any


SECTION_PATTERNS = {
    "install": [
        r"##?\s*(?:installation|install|getting\s+started|quick\s*start|快速开始|安装)",
    ],
    "usage": [
        r"##?\s*(?:usage|examples?|how\s+to\s+use|使用|示例)",
    ],
    "api": [
        r"##?\s*(?:api|reference|接口|参考)",
    ],
    "config": [
        r"##?\s*(?:configuration|config|环境变量|配置)",
    ],
    "license": [
        r"##?\s*(?:license|许可)",
    ],
    "troubleshooting": [
        r"##?\s*(?:troubleshooting|faq|常见问题|故障排除)",
    ],
    "contributing": [
        r"##?\s*(?:contributing|贡献|development|开发)",
    ],
    "security": [
        r"##?\s*(?:security|安全)",
    ],
}

# 代码块检测
CODE_BLOCK_RE = re.compile(r"```[\w-]*\n.*?```", re.DOTALL)
BASH_CODE_RE = re.compile(r"```(?:bash|shell|sh|zsh)\n(.*?)```", re.DOTALL)


def parse_readme(text: str | None) -> dict[str, Any]:
    """
    解析 README.md，返回章节结构和完整性评分。
    """
    if not text or not text.strip():
        return {
            "has_readme": False,
            "sections_found": [],
            "sections_missing": list(SECTION_PATTERNS.keys()),
            "code_blocks": [],
            "install_commands": [],
            "completeness_score": 0,
        }

    # 提取章节
    sections_found = []
    for sec_name, patterns in SECTION_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                sections_found.append(sec_name)
                break

    sections_missing = [s for s in SECTION_PATTERNS if s not in sections_found]

    # 代码块提取
    code_blocks = CODE_BLOCK_RE.findall(text)

    # bash / install 命令
    install_commands = []
    for match in BASH_CODE_RE.findall(text):
        for line in match.strip().split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                install_commands.append(line)
        if len(install_commands) > 10:
            break

    # 计算文档完整度（基于章节覆盖）
    total_sections = len(SECTION_PATTERNS)
    found_count = len(sections_found)
    completeness = round(found_count / total_sections * 100)

    # 额外加分
    if code_blocks:
        completeness = min(100, completeness + 5)
    if any("pip" in c or "npm" in c or "cargo" in c or "go install" in c for c in install_commands):
        completeness = min(100, completeness + 5)

    return {
        "has_readme": True,
        "sections_found": sections_found,
        "sections_missing": sections_missing,
        "code_blocks_count": len(code_blocks),
        "install_commands": install_commands[:10],
        "completeness_score": completeness,
        "total_lines": len(text.split("\n")),
    }


def check_license(contents: dict[str, str | None]) -> dict[str, Any]:
    """
    检查 LICENSE 文件存在性和内容。
    """
    for path in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"):
        content = contents.get(path)
        if content:
            content_lower = content.lower()
            detected = None
            for lic in ["mit", "apache", "gpl", "lgpl", "mpl", "bsd", "isc", "unlicense", "cc0"]:
                if lic in content_lower:
                    detected = lic.upper()
                    break
            return {
                "has_license": True,
                "license_file": path,
                "detected_type": detected,
                "first_line": content.split("\n")[0][:100] if content else "",
            }
    return {"has_license": False, "license_file": None, "detected_type": None}


def check_config_env_vars(contents: dict[str, str | None]) -> dict[str, Any]:
    """
    从 README / .env.example / docs 中提取环境变量声明。
    """
    found = {}

    # .env.example / .env.sample
    for path in (".env.example", ".env.sample", ".env.template", "sample.env"):
        content = contents.get(path)
        if content:
            for line in content.split("\n"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    name = line.split("=", 1)[0].strip()
                    if name and re.match(r"^[A-Z][A-Z0-9_]*$", name):
                        found[name] = {"file": path, "default": line.split("=", 1)[1][:80]}

    # README 中的环境变量表格/列表扫描（简单模式匹配）
    readme = contents.get("README.md") or ""
    env_var_pattern = re.compile(r"`([A-Z][A-Z0-9_]{2,})`")
    for m in env_var_pattern.finditer(readme):
        name = m.group(1)
        if name not in found:
            found[name] = {"file": "README.md", "default": None}

    return {"count": len(found), "variables": found}
