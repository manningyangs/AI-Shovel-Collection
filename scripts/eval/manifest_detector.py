"""
静态 Manifest 识别器（V1.0 核心模块）
只读分析：读取 package.json / pyproject.toml / Cargo.toml / SKILL.md 等文件，不执行任何 setup.py / npm install / docker build
"""
from __future__ import annotations

import json
import re
from typing import Any

# MCP 相关关键词
MCP_KEYWORDS = [
    "modelcontextprotocol", "mcp-server", "mcp_server", "mcp_server_python",
    "@modelcontextprotocol", "fastmcp", "mcp",
]

# Agent Skill / OpenClaw 相关
SKILL_KEYWORDS = [
    "SKILL.md", "skill.yaml", "skill.json", "agent-skill", "agent_skill",
    "openclaw", "clawhub", "skill-registry",
]

# Framework
FRAMEWORK_KEYWORDS = [
    "langchain", "llamaindex", "autogen", "crewai", "mastra", "open-agents",
    "smolagents", "semantic-kernel", "dotnet-ai", "copilot-sdk",
]

# CLI / SDK
CLI_KEYWORDS = [
    "click", "typer", "argparse", "cobra", "cli: true", "bin/", "executable",
    "commander", "oclif",
]


def detect_project_type(tree_files: list[str], contents: dict[str, str | None]) -> dict[str, Any]:
    """
    基于静态 Manifest 推断项目类型。
    tree_files: 仓库顶层/递归文件列表
    contents: 已下载的文件内容 { path: text }
    """
    scores = {"mcp_server": 0, "agent_skill": 0, "framework": 0, "cli_sdk_api": 0, "collection": 0}
    evidence = {"mcp_server": [], "agent_skill": [], "framework": [], "cli_sdk_api": [], "collection": []}

    # 1. Manifest 文件存在性
    paths_lower = [f.lower() for f in tree_files]

    # package.json
    if "package.json" in paths_lower:
        data = _safe_json(contents.get("package.json"))
        if data:
            # dependencies / devDependencies 搜索
            for deps_key in ("dependencies", "devDependencies"):
                deps = data.get(deps_key, {})
                for dep in deps:
                    dlow = dep.lower()
                    for kw in MCP_KEYWORDS:
                        if kw in dlow:
                            scores["mcp_server"] += 3
                            evidence["mcp_server"].append(f"package.json.{deps_key}.{dep}")
                    for kw in FRAMEWORK_KEYWORDS:
                        if kw in dlow:
                            scores["framework"] += 3
                            evidence["framework"].append(f"package.json.{deps_key}.{dep}")
                    for kw in CLI_KEYWORDS:
                        if kw in dlow:
                            scores["cli_sdk_api"] += 2
                            evidence["cli_sdk_api"].append(f"package.json.{deps_key}.{dep}")
            # 检查 bin 字段 → CLI
            if data.get("bin"):
                scores["cli_sdk_api"] += 3
                evidence["cli_sdk_api"].append("package.json.bin")

    # pyproject.toml / requirements.txt
    if "pyproject.toml" in paths_lower or "requirements.txt" in paths_lower:
        content = contents.get("pyproject.toml") or contents.get("requirements.txt") or ""
        clow = content.lower()
        for kw in MCP_KEYWORDS:
            if kw in clow:
                scores["mcp_server"] += 3
                evidence["mcp_server"].append(f"pyproject/requirements 含 {kw}")
        for kw in FRAMEWORK_KEYWORDS:
            if kw in clow:
                scores["framework"] += 3
                evidence["framework"].append(f"pyproject/requirements 含 {kw}")
        if re.search(r"\[project\.scripts\]", content):
            scores["cli_sdk_api"] += 2
            evidence["cli_sdk_api"].append("pyproject.toml [project.scripts]")

    # SKILL.md / skill.yaml → Agent Skill
    skill_files = [f for f in tree_files if f.lower().endswith("skill.md") or "skill" in f.lower()]
    if skill_files:
        scores["agent_skill"] += 5
        evidence["agent_skill"].extend(skill_files[:3])

    # Cargo.toml
    if "cargo.toml" in paths_lower:
        content = contents.get("Cargo.toml", "")
        if any(kw in content.lower() for kw in MCP_KEYWORDS):
            scores["mcp_server"] += 3
            evidence["mcp_server"].append("Cargo.toml deps")

    # README.md 关键词扫描（权重低但覆盖广）
    readme = contents.get("README.md", "") or ""
    if readme:
        rlow = readme.lower()
        mcp_hits = sum(1 for kw in MCP_KEYWORDS if kw in rlow)
        if mcp_hits >= 2:
            scores["mcp_server"] += 1
            evidence["mcp_server"].append(f"README 含 MCP 关键词 x{mcp_hits}")
        for kw in FRAMEWORK_KEYWORDS[:5]:
            if kw in rlow:
                scores["framework"] += 1
                evidence["framework"].append(f"README 含 {kw}")

    # Collection 特征：多 README、多子目录、tools/skills 目录
    collection_signals = 0
    for f in tree_files:
        if f.count("/") >= 3 and f.lower().endswith("readme.md"):
            collection_signals += 1
    if any("tools/" in f.lower() or "skills/" in f.lower() for f in tree_files):
        collection_signals += 2
    if collection_signals >= 3:
        scores["collection"] += 3
        evidence["collection"].append(f"collection_signals={collection_signals}")

    # 决定类型
    if not any(scores.values()):
        return {"type": "unknown", "confidence": 0.0, "scores": scores, "evidence": {}}

    best = max(scores.items(), key=lambda x: x[1])
    total = sum(scores.values())
    confidence = round(best[1] / max(total, 1), 2) if total else 0

    return {
        "type": best[0],
        "confidence": confidence,
        "scores": scores,
        "evidence": evidence,
        "detected_via_manifest": True,
    }


def _safe_json(text: str | None) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def detect_agent_compatibility(tree_files: list[str], contents: dict[str, str | None]) -> dict[str, Any]:
    """
    检测智能体兼容性：MCP 协议、宿主声明、传输方式等。
    """
    evidence = []
    checks = {}

    # MCP 协议：检查是否有 mcp 相关 manifest
    package_json = _safe_json(contents.get("package.json")) or {}
    pyproject = contents.get("pyproject.toml", "") or ""

    deps = {}
    deps.update(package_json.get("dependencies", {}))
    deps.update(package_json.get("devDependencies", {}))
    deps.update(package_json.get("peerDependencies", {}))

    mcp_deps_found = [d for d in deps if "mcp" in d.lower() or "modelcontextprotocol" in d.lower()]
    checks["mcp_protocol_deps"] = len(mcp_deps_found) > 0
    if mcp_deps_found:
        evidence.append(f"package.json deps 含 MCP: {mcp_deps_found[:5]}")

    # pyproject.toml 里 MCP deps
    if re.search(r"(mcp|modelcontextprotocol|fastmcp)", pyproject, re.IGNORECASE):
        checks["mcp_protocol_deps"] = True
        evidence.append("pyproject.toml 含 MCP 依赖")

    # README 中宿主声明（Cursor / Trae / Copilot / Claude Desktop 等）
    readme = (contents.get("README.md") or "").lower()
    host_keywords = {
        "cursor": ["cursor", ".cursor"],
        "claude_desktop": ["claude desktop", "claude-desktop"],
        "copilot": ["github copilot", "copilot"],
        "trae": ["trae"],
        "openclaw": ["openclaw", "clawhub"],
        "cline": ["cline"],
    }
    for host, kws in host_keywords.items():
        if any(kw in readme for kw in kws):
            checks[f"host_{host}"] = True
            evidence.append(f"README 提及 {host}")

    # 传输方式：stdio / sse / streamable-http
    transport_hits = []
    for kw in ["stdio", "sse", "streamable-http", "http", "websocket"]:
        if kw in readme:
            transport_hits.append(kw)
    if transport_hits:
        checks["transport_methods"] = transport_hits
        evidence.append(f"README 提及传输: {transport_hits}")

    # 认证方式
    auth_hits = []
    for kw in ["api key", "apikey", "api_key", "oauth", "token", "bearer"]:
        if kw in readme:
            auth_hits.append(kw)
    checks["auth_methods"] = auth_hits
    if auth_hits:
        evidence.append(f"README 提及认证: {auth_hits}")

    return {"checks": checks, "evidence": evidence}
