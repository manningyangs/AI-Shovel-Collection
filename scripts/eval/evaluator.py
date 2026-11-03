#!/usr/bin/env python3
"""
AI Shovel Eval V1.0 — 静态评测主入口

使用：
    python -m scripts.eval.evaluator https://github.com/owner/repo
    python scripts/eval/evaluator.py https://github.com/owner/repo --output report.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# 确保 scripts/ 在 sys.path 里（无论从哪里运行）
# evaluator.py 在 repo/scripts/eval/ → parent 是 repo/scripts/
_HERE = Path(__file__).resolve().parent
_SCRIPTS_DIR = _HERE.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from eval.config import DIMENSIONS, SCORING_VERSION, get_dimensions_by_ptype  # noqa: E402
from eval.github_client import GitHubClient  # noqa: E402
from eval.manifest_detector import (  # noqa: E402
    detect_agent_compatibility,
    detect_project_type,
)
from eval.maintenance_checker import check_security_tools, check_repo_health  # noqa: E402
from eval.readme_parser import check_config_env_vars, check_license, parse_readme  # noqa: E402
from eval.report_validator import report_id_from, validate_report  # noqa: E402
from eval.scoring_engine import compute_preliminary_score  # noqa: E402
from eval.security_scanner import (  # noqa: E402
    extract_dependency_versions,
    query_osv_dependencies,
    scan_code,
)
from eval.url_validator import validate_github_repo_url  # noqa: E402


MAX_FILES = 500
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024  # 20MB
SINGLE_FILE_BYTES = 2 * 1024 * 1024


def run(url: str, token: str | None = None, verbose: bool = False) -> dict:
    """
    执行一次完整的静态评测，返回 report dict。
    """
    # === 1. URL 校验 ===
    v = validate_github_repo_url(url)
    owner, repo = v["owner"], v["repo"]

    if verbose:
        print(f"[1/7] URL 校验通过：{owner}/{repo}")

    # === 2. 拉取 GitHub 元数据 ===
    client = GitHubClient(token=token)
    repo_data = client.get_repo(owner, repo)
    if not repo_data:
        raise RuntimeError(f"仓库不存在或无法访问：{owner}/{repo}（404）")

    commit_sha = repo_data.get("default_branch") or "main"
    # 拿确切 commit SHA（用于 report_id 锚定）
    try:
        branches = client._get(f"/repos/{owner}/{repo}/branches/{repo_data.get('default_branch', 'main')}")
        if branches and branches.get("commit"):
            commit_sha = branches["commit"]["sha"]
    except Exception:
        pass

    if verbose:
        print(f"[2/7] 元数据：Stars={repo_data.get('stargazers_count')} Language={repo_data.get('language')}")

    # === 3. 拉取 repo tree + 下载关键文件 ===
    tree = client.get_repo_tree(owner, repo, repo_data.get("default_branch", "main")) or []
    tree_files = [t["path"] for t in tree if t.get("type") == "blob"][:MAX_FILES]

    # 只下载关键文件（manifest + README + LICENSE + 安全扫描目标）
    manifest_paths = _collect_manifest_paths(tree_files)
    target_paths = manifest_paths[:80]  # 限制下载数量

    if verbose:
        print(f"[3/7] 拉取 repo tree：{len(tree_files)} 文件，重点下载 {len(target_paths)} 个")

    contents = {}
    total_bytes = 0
    for path in target_paths:
        if total_bytes > MAX_DOWNLOAD_BYTES:
            break
        try:
            text = client.get_content(owner, repo, path)
            if text and len(text) <= SINGLE_FILE_BYTES:
                contents[path] = text
                total_bytes += len(text.encode("utf-8", errors="replace"))
        except Exception:
            contents[path] = None

    if verbose:
        print(f"      已下载 {len([c for c in contents.values() if c])} 个文件（{total_bytes // 1024}KB）")

    # === 4. 静态分析 ===
    if verbose:
        print("[4/7] 静态分析中…")

    # Manifest → 项目类型
    ptype = detect_project_type(tree_files, contents)

    # V1.0.1 P1-2: 按项目类型重建 DIMENSIONS_DICT（Agent Skill 用 30/20/10/15/10/10/5）
    _rebuild_dimensions_dict(ptype.get("type", "unknown"))
    if verbose and ptype.get("type") in ("agent_skill",):
        print(f"      [ptype] {ptype.get('type')} → 应用专属权重")

    # Agent 兼容性
    agent_compat = detect_agent_compatibility(tree_files, contents)

    # README 解析
    readme_result = parse_readme(contents.get("README.md"))

    # License
    license_result = check_license(contents)

    # 环境变量
    env_result = check_config_env_vars(contents)

    # 维护健康度
    health = check_repo_health(repo_data, client)

    # 安全工具自检
    sec_tools = check_security_tools(tree_files)

    # 代码扫描（危险模式 + 敏感信息）
    code_scan = scan_code(tree_files, contents)

    # 依赖版本提取 + OSV 查询
    deps = extract_dependency_versions(tree_files, contents)
    if verbose:
        print(f"      提取 {len(deps)} 个依赖版本，查询 OSV…")
    osv_result = query_osv_dependencies(deps)  # V1.0.1: 带状态字典
    osv_vulns = osv_result.get("vulns", [])
    osv_meta = {
        "query_status": osv_result.get("query_status", "success"),
        "error": osv_result.get("error"),
        "deps_queried": osv_result.get("deps_queried", 0),
    }
    if verbose and osv_meta["query_status"] != "success":
        print(f"      [OSV] status={osv_meta['query_status']} error={osv_meta.get('error')}")

    # === 5. 构建评分 ===
    if verbose:
        print("[5/7] 评分中…")

    sub_scores = _build_sub_scores(
        ptype, agent_compat, readme_result, license_result, env_result,
        health, sec_tools, code_scan, osv_vulns, deps, tree_files, osv_meta, contents,
    )
    prelim = compute_preliminary_score(sub_scores)

    # === V1.0.1 重要修正 ===
    # 静态分析不能自动升级到 L2/L3 —— L2 需要真实运行测试，L3 需要 Agent 端到端
    level = "L1"  # 全部报告强制 L1 · 静态分析
    score_status = "preliminary"  # 静态初评，非正式认证
    evaluation_mode = "static"  # 明确标注评测模式

    # === 6. 构建完整报告 ===
    report_id = report_id_from(owner, repo, commit_sha, SCORING_VERSION)

    # 评级（仅作为参考，静态初评阶段显示但必须标注非正式）
    ps = prelim["preliminary_score"]
    if ps >= 90:
        grade = "S"
    elif ps >= 80:
        grade = "A"
    elif ps >= 70:
        grade = "B"
    elif ps >= 60:
        grade = "C"
    elif ps >= 40:
        grade = "D"
    else:
        grade = "E"

    # 建议
    recommendations = _build_recommendations(
        readme_result, license_result, health, code_scan, osv_vulns, sec_tools,
    )

    # 证据
    evidence = _build_evidence(ptype, agent_compat, readme_result, code_scan, osv_vulns)

    # 限制
    limitations = []
    limitations.append("⚠️ 本报告为纯静态分析（L1），未执行被测仓库中的任何代码")
    limitations.append("⚠️ 静态初评 · 非正式认证 — 评分不能等同于真实运行表现")
    limitations.append(f"⚠️ 覆盖率仅 {prelim['coverage']}%，未测试项目不计零分")
    if not license_result["has_license"]:
        limitations.append("⚠️ 无法确认 License 类型")
    if health.get("archived"):
        limitations.append("⚠️ 项目已归档")
    if osv_meta["query_status"] == "blocked":
        limitations.append(f"⚠️ OSV 漏洞查询被阻断：{osv_meta.get('error') or 'API 不可用'} — 依赖安全项未评分")
    elif osv_meta["query_status"] == "partial":
        limitations.append(f"⚠️ OSV 部分查询失败 — 依赖安全结果可能不完整")

    report = {
        "schema_version": "1.0",
        "report_id": report_id,
        "repository": {
            "owner": owner,
            "name": repo,
            "url": f"https://github.com/{owner}/{repo}",
            "commit_sha": commit_sha,
            "language": repo_data.get("language"),
            "license": license_result.get("detected_type"),
            "license_file": license_result.get("license_file"),
            "stars": repo_data.get("stargazers_count", 0),
            "forks": repo_data.get("forks_count", 0),
            "archived": repo_data.get("archived", False),
        },
        "evaluation": {
            "evaluation_version": "1.0",
            "scoring_version": SCORING_VERSION,
            "evaluation_mode": evaluation_mode,
            "evaluation_level": level,
            "level": level,
            "score_status": score_status,
            "preliminary_score": prelim["preliminary_score"],
            "official_score": None,  # v1.0.1 暂不接入人工认证分数
            "grade": grade,
            "coverage": prelim["coverage"],
            "evaluated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "report_generated_by": "AI Shovel Eval",
            "disclaimer": "静态初评 · 非正式认证 · 不能作为项目真实运行能力的担保",
        },
        "project_type": ptype,
        "dimensions": _build_dimensions(sub_scores),
        "agent_compatibility": agent_compat,
        "security_findings": _format_security_findings(code_scan, osv_vulns),
        "recommendations": recommendations,
        "evidence": evidence[:30],
        "limitations": limitations,
    }

    # === 7. 校验报告 ===
    valid, err = validate_report(report)
    if not valid:
        print(f"[WARN] 报告校验失败：{err}", file=sys.stderr)

    if verbose:
        print(f"[6/7] 报告生成：ID={report_id} Score={prelim['preliminary_score']} Level={level}")
        print("[7/7] 完成 ✅")

    return report


def _collect_manifest_paths(tree_files: list[str]) -> list[str]:
    """收集关键文件路径。"""
    priority = [
        "package.json", "pyproject.toml", "requirements.txt", "Cargo.toml",
        "go.mod", "pom.xml", "Gemfile",
        "README.md", "LICENSE", "LICENSE.md", "COPYING",
        ".env.example", ".env.sample",
        ".github/workflows/",
        "mcp.json", "SKILL.md",
    ]
    result = []
    for p in tree_files:
        for pri in priority:
            if p.endswith(pri) or p.startswith(pri):
                result.append(p)
                break
        # 源码文件也要扫描（安全扫描）
        ext = "." + p.rsplit(".", 1)[-1].lower() if "." in p else ""
        if ext in (".py", ".js", ".ts", ".go", ".rs", ".java", ".sh", ".yml", ".yaml"):
            result.append(p)
    # 去重，保持顺序
    seen = set()
    out = []
    for p in result:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _build_sub_scores(ptype, agent_compat, readme, license_result, env_result, health, sec_tools, code_scan, osv_vulns, deps,
                     tree_files=None, osv_meta=None, contents=None):
    """
    把分析结果映射到七个维度的子项评分（0-5）。
    每个子项给出 level(0-5) + status + evidence。

    V1.0.1 关键修正：
      - test_evidence 真检测 tree_files（不再传空列表）
      - OSV blocked/partial 时 dependency_vulns 不再给满分
    """
    tree_files = tree_files or []
    osv_meta = osv_meta or {"query_status": "success"}
    contents = contents or {}
    scores = []

    # === 功能完整度 (25分) ===
    # core_completeness 5分 → README 核心章节（usage/examples）
    core_level = 3 if readme.get("sections_found") and ("usage" in readme["sections_found"] or "api" in readme["sections_found"]) else 1
    scores.append({"dim_key": "functionality", "sub_key": "core_completeness", "weight": 5, "level": core_level, "status": "verified" if readme.get("sections_found") else "partial"})

    # coverage 5分 → 项目类型识别置信度
    cov_level = min(5, max(1, int(ptype.get("confidence", 0.3) * 5)))
    scores.append({"dim_key": "functionality", "sub_key": "coverage", "weight": 5, "level": cov_level, "status": "verified"})

    # schema_completeness 5分 → 有多少依赖声明
    schema_level = 4 if len(deps) >= 3 else (2 if deps else 0)
    scores.append({"dim_key": "functionality", "sub_key": "schema_completeness", "weight": 5, "level": schema_level, "status": "verified" if deps else "partial"})

    # task_examples 5分 → README code_blocks_count
    examples_level = min(5, max(1, readme.get("code_blocks_count", 0)))
    scores.append({"dim_key": "functionality", "sub_key": "task_examples", "weight": 5, "level": examples_level, "status": "verified"})

    # error_handling 5分 → 暂无直接证据（V1.0 静态分析局限）→ 按 0 分但 not_tested
    scores.append({"dim_key": "functionality", "sub_key": "error_handling", "weight": 5, "level": 0, "status": "not_tested"})

    # === 智能体兼容性 (15分) ===
    checks = agent_compat.get("checks", {})
    mcp_level = 4 if checks.get("mcp_protocol_deps") else 1
    scores.append({"dim_key": "agent_compat", "sub_key": "protocol_compliance", "weight": 4, "level": mcp_level, "status": "verified" if checks.get("mcp_protocol_deps") else "partial"})

    host_hits = sum(1 for k in checks if k.startswith("host_"))
    host_level = min(5, host_hits + 1)
    scores.append({"dim_key": "agent_compat", "sub_key": "host_support", "weight": 5, "level": host_level, "status": "verified" if host_hits else "partial"})

    transport_level = 3 if checks.get("transport_methods") else 1
    scores.append({"dim_key": "agent_compat", "sub_key": "transport_config", "weight": 3, "level": transport_level, "status": "verified" if checks.get("transport_methods") else "declared"})

    auth_level = 3 if checks.get("auth_methods") else 2
    scores.append({"dim_key": "agent_compat", "sub_key": "env_auth", "weight": 3, "level": auth_level, "status": "verified" if checks.get("auth_methods") else "declared"})

    # === 易用性 (15分) ===
    install_level = 4 if readme.get("install_commands") else (2 if "install" in readme.get("sections_found", []) else 0)
    scores.append({"dim_key": "ease_of_use", "sub_key": "install_instructions", "weight": 5, "level": install_level, "status": "verified"})

    config_level = 3 if env_result.get("count", 0) > 0 else 1
    scores.append({"dim_key": "ease_of_use", "sub_key": "config_env", "weight": 4, "level": config_level, "status": "verified" if env_result.get("count", 0) > 0 else "partial"})

    deploy_level = 3 if "docker" in str(ptype).lower() or env_result.get("count", 0) > 2 else 1
    scores.append({"dim_key": "ease_of_use", "sub_key": "deploy", "weight": 3, "level": deploy_level, "status": "declared"})

    qs_level = 3 if readme.get("sections_found") and ("install" in readme["sections_found"] or "usage" in readme["sections_found"]) else 0
    scores.append({"dim_key": "ease_of_use", "sub_key": "quickstart", "weight": 3, "level": qs_level, "status": "verified"})

    # === 可靠性 (15分) ===
    # V1.0.1 P1-1 修正：test_evidence 真检测（之前传空列表 → 永远 level=1）
    test_level, test_status = _detect_test_evidence(tree_files, contents)
    scores.append({"dim_key": "reliability", "sub_key": "test_evidence", "weight": 5, "level": test_level, "status": test_status})

    ci_level = 5 if health.get("ci_present") else 0
    scores.append({"dim_key": "reliability", "sub_key": "ci_complete", "weight": 4, "level": ci_level, "status": "verified" if health.get("ci_present") else "failed"})

    err_level = 2  # V1.0 静态局限
    scores.append({"dim_key": "reliability", "sub_key": "error_mechanism", "weight": 3, "level": err_level, "status": "not_tested"})

    days = health.get("days_since_push")
    if days is not None:
        if days < 30: rel_level = 5
        elif days < 90: rel_level = 4
        elif days < 180: rel_level = 3
        else: rel_level = 1
    else:
        rel_level = 0
    if health.get("archived"):
        rel_level = 0
    scores.append({"dim_key": "reliability", "sub_key": "release_stability", "weight": 3, "level": rel_level, "status": "verified" if days is not None else "partial"})

    # === 安全性 (15分) ===
    vuln_count = len(osv_vulns)
    critical_vulns = sum(1 for v in osv_vulns if v.get("severity") == "critical")

    # V1.0.1 P0-5 修正：OSV blocked 时不能假装"无漏洞" → level=0, status=blocked
    if osv_meta.get("query_status") == "blocked":
        dep_level = 0
        dep_status = "blocked"
    elif osv_meta.get("query_status") == "partial":
        dep_level = 3 if vuln_count == 0 else (2 if critical_vulns == 0 else 0)
        dep_status = "partial"
    else:
        dep_level = 5 if vuln_count == 0 else (2 if critical_vulns == 0 else 0)
        dep_status = "verified"
    scores.append({"dim_key": "security", "sub_key": "dependency_vulns", "weight": 4, "level": dep_level, "status": dep_status})

    dangerous_count = len(code_scan.get("dangerous_findings", []))
    danger_level = 5 if dangerous_count == 0 else max(0, 4 - dangerous_count)
    scores.append({"dim_key": "security", "sub_key": "danger_ops", "weight": 4, "level": danger_level, "status": "verified"})

    data_level = 3  # V1.0 局限
    scores.append({"dim_key": "security", "sub_key": "data_access", "weight": 3, "level": data_level, "status": "partial"})

    secrets_count = len(code_scan.get("secret_findings", []))
    secret_level = 5 if secrets_count == 0 else 0
    scores.append({"dim_key": "security", "sub_key": "secret_scan", "weight": 4, "level": secret_level, "status": "verified"})

    # === 维护健康度 (10分) ===
    push_days = health.get("days_since_push")
    if push_days is not None:
        upd_level = 5 if push_days < 30 else (3 if push_days < 180 else 1)
    else:
        upd_level = 0
    scores.append({"dim_key": "maintenance", "sub_key": "update_release", "weight": 3, "level": upd_level, "status": "verified"})

    ci_maint_level = 5 if health.get("ci_present") else 1
    scores.append({"dim_key": "maintenance", "sub_key": "ci_status", "weight": 3, "level": ci_maint_level, "status": "verified"})

    issue_activity = health.get("issue_activity", {})
    issue_level = 4 if issue_activity.get("total_open", 0) is not None else 2
    scores.append({"dim_key": "maintenance", "sub_key": "issue_maintain", "weight": 2, "level": issue_level, "status": "partial"})

    cont_level = 4 if not health.get("archived") and (health.get("stars", 0) > 100) else 2
    scores.append({"dim_key": "maintenance", "sub_key": "continuity", "weight": 2, "level": cont_level, "status": "verified"})

    # === 文档 (5分) ===
    install_doc = readme.get("sections_found", [])
    has_install = "install" in install_doc
    readme_level = 5 if health.get("has_wiki") or has_install else (3 if readme.get("has_readme") else 0)
    scores.append({"dim_key": "docs", "sub_key": "install_deploy_doc", "weight": 2, "level": readme_level, "status": "verified" if readme.get("has_readme") else "partial"})

    usage_level = 4 if ("usage" in install_doc or "api" in install_doc) else 1
    scores.append({"dim_key": "docs", "sub_key": "usage_example", "weight": 2, "level": usage_level, "status": "verified"})

    lic_level = 5 if license_result.get("has_license") else 0
    scores.append({"dim_key": "docs", "sub_key": "license_info", "weight": 1, "level": lic_level, "status": "verified" if license_result.get("has_license") else "failed"})

    return scores


def _build_dimensions(sub_scores):
    """把 sub_scores 按维度聚合，输出完整维度对象。"""
    dims = {}
    for dim_key in set(s["dim_key"] for s in sub_scores):
        subs = [s for s in sub_scores if s["dim_key"] == dim_key]
        label = DIMENSIONS_DICT.get(dim_key, {}).get("label", dim_key)
        dim_weight = DIMENSIONS_DICT.get(dim_key, {}).get("dim_weight", 0)

        # 计算该维度加权得分（子项 level × 子项权重 归一化）
        weighted = sum(s["weight"] * (s["level"] / 5) for s in subs if s["status"] not in ("not_tested", "not_applicable"))
        weight_total = sum(s["weight"] for s in subs if s["status"] not in ("not_tested", "not_applicable"))
        score = round(weighted / weight_total * 100) if weight_total > 0 else 0
        weighted_score = round(score * dim_weight / 100, 2)

        # 计算子项覆盖率
        applicable_subs = [s for s in subs if s["status"] not in ("not_applicable", "blocked")]
        tested_subs = [s for s in applicable_subs if s["status"] not in ("not_tested",)]
        sub_coverage = round(len(tested_subs) / max(len(applicable_subs), 1) * 100)

        dims[dim_key] = {
            "label": label,
            "score": score,
            "max_score": 100,
            "weight": dim_weight,
            "weighted_score": weighted_score,
            "sub_coverage": sub_coverage,
            "sub_items": subs,
        }
    return dims


# 维度字典（V1.0.1: 运行时按 ptype 动态重建，initial import 时为空）
DIMENSIONS_DICT: dict = {}


def _rebuild_dimensions_dict(ptype: str = "unknown"):
    """V1.0.1: 按项目类型重建 DIMENSIONS_DICT（全局变量）。"""
    global DIMENSIONS_DICT
    dims = get_dimensions_by_ptype(ptype)
    DIMENSIONS_DICT = {}
    for key, label, dim_weight, subs in dims:
        DIMENSIONS_DICT[key] = {
            "label": label,
            "dim_weight": dim_weight,
            "sub_weights": [sw for _, _, sw in subs],
            "sub_names": [name for name, _, _ in subs],
        }


def _format_security_findings(code_scan, osv_vulns) -> list[dict]:
    """合并代码扫描和 OSV 漏洞为统一格式。"""
    findings = []
    for f in code_scan.get("dangerous_findings", []):
        findings.append({
            "type": "dangerous_pattern",
            "severity": f["severity"],
            "message": f"发现 {f['pattern_name']}: {f['match']}",
            "location": f"{f['file']}:{f['line']}",
        })
    for f in code_scan.get("secret_findings", []):
        findings.append({
            "type": "secret_exposure",
            "severity": "critical",
            "message": f"发现疑似 {f['pattern_name']}: {f['match']}",
            "location": f"{f['file']}:{f['line']}",
        })
    for v in osv_vulns:
        findings.append({
            "type": "osv_vulnerability",
            "severity": v.get("severity", "medium"),
            "message": f"依赖 {v['package']}@{v['version']} 存在 {v.get('osv_id', '')}：{v.get('summary', '')}",
            "aliases": v.get("aliases", []),
        })
    # 按 severity 排序
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: sev_order.get(f["severity"], 4))
    return findings


def _build_recommendations(readme, license_result, health, code_scan, osv_vulns, sec_tools) -> list[str]:
    """基于评测结果生成改进建议。"""
    recs = []

    if not readme.get("has_readme"):
        recs.append("添加 README.md，至少包含项目简介、安装步骤、基本用法")
    else:
        missing = readme.get("sections_missing", [])
        if "install" in missing:
            recs.append("README 添加安装说明章节（Quick Start / Getting Started）")
        if "usage" in missing and "api" in missing:
            recs.append("README 添加使用示例章节（Usage / Examples）")
        if "config" in missing:
            recs.append("README 添加配置和环境变量说明")

    if not license_result.get("has_license"):
        recs.append("添加 LICENSE 文件（MIT / Apache 2.0 / BSD 推荐）")

    if not health.get("ci_present"):
        recs.append("配置 GitHub Actions CI（lint + test）")

    if health.get("days_since_push") and health["days_since_push"] > 90:
        recs.append("最近 3 个月未活跃更新，建议维护或明确 deprecation 状态")

    if health.get("archived"):
        recs.append("项目已归档，fork 后维护或联系 owner")

    critical_vulns = [v for v in osv_vulns if v.get("severity") == "critical"]
    if critical_vulns:
        recs.append(f"修复 {len(critical_vulns)} 个严重依赖漏洞（OSV 查询）")

    high_vulns = [v for v in osv_vulns if v.get("severity") == "high"]
    if high_vulns:
        recs.append(f"修复 {len(high_vulns)} 个高危依赖漏洞")

    if not sec_tools.get("has_security_tools"):
        recs.append("配置 Dependabot 或 OSV-Scanner 做自动化安全扫描")

    dangerous = code_scan.get("dangerous_findings", [])
    if dangerous:
        recs.append(f"修复 {len(dangerous)} 处危险代码模式（subprocess/shell, eval, pickle, yaml.load 等）")

    secrets = code_scan.get("secret_findings", [])
    if secrets:
        recs.append(f"移除 {len(secrets)} 处硬编码敏感信息（Grep GitHub Secrets / GitGuardian 清理）")

    return recs[:20]


def _build_evidence(ptype, agent_compat, readme, code_scan, osv_vulns) -> list[str]:
    """构建证据链。"""
    ev = []
    if ptype.get("evidence"):
        for dim, files in ptype["evidence"].items():
            for f in files[:2]:
                ev.append(f"[{dim}] manifest 识别证据: {f}")
    if readme.get("sections_found"):
        ev.append(f"[docs] README 章节覆盖: {', '.join(readme['sections_found'])}")
    if readme.get("install_commands"):
        ev.append(f"[ease] README 安装命令示例: {readme['install_commands'][0][:60]}")
    if readme.get("code_blocks_count", 0):
        ev.append(f"[docs] README 含 {readme['code_blocks_count']} 个代码块")
    if code_scan.get("files_scanned", 0):
        ev.append(f"[security] 扫描 {code_scan['files_scanned']} 个源码文件")
    ev.append(f"[osv] 查询 {len(osv_vulns)} 个依赖漏洞")
    return ev


def _detect_test_evidence(tree_files: list[str], contents: dict) -> tuple[int, str]:
    """
    V1.0.1 P1-1: 真检测测试证据（之前传空列表永远 level=1）。
    检测维度：
      1. 真实测试文件存在（tests/ 目录、test_*.py、*.test.js 等）
      2. 测试框架配置（pytest.ini、jest.config.*、vitest.config.*）
      3. CI workflow 里有 test 步骤

    返回 (level 0-5, status)
    """
    test_dir_markers = ("tests/", "test/", "__tests__/", "test_suite/", "spec/")
    test_file_patterns = (
        "test_", "_test.py", "_test.go", ".test.", ".spec.",
    )
    test_config_files = (
        "pytest.ini", "conftest.py", "setup.cfg", "tox.ini",
        "jest.config", "vitest.config", "mocha.opts", ".nycrc",
        "phpunit.xml",
    )

    has_real_test_files = False
    has_test_dir = False
    has_test_config = False
    has_ci_test_step = False
    test_files_found = []

    # 1. 检测目录和文件
    for f in tree_files:
        fl = f.lower()
        # 测试目录
        if any(marker in fl for marker in test_dir_markers):
            has_test_dir = True
        # 测试文件命名
        if any(pat in fl for pat in test_file_patterns):
            has_real_test_files = True
            if len(test_files_found) < 5:
                test_files_found.append(f)
        # 测试框架配置
        if any(fl.endswith(cfg) for cfg in test_config_files) or "pytest" in fl or "jest.config" in fl:
            has_test_config = True

    # 2. CI workflow 检测（看 contents 里的 yml 有没有 test 相关 step）
    for fpath, text in contents.items():
        if not text:
            continue
        fl = fpath.lower()
        if ".github/workflows/" in fl and fl.endswith((".yml", ".yaml")):
            tl = text.lower()
            if any(kw in tl for kw in ("run:.*test", "pytest", "jest", "vitest", "npm test", "go test", "unittest", "make test")):
                has_ci_test_step = True
                break

    # 3. 综合评分
    evidence_parts = []
    score = 0

    if has_real_test_files:
        score += 3  # 真实测试文件 = 核心证据
        evidence_parts.append(f"{len(test_files_found)}+ 测试文件")
    if has_test_dir:
        score += 1
        evidence_parts.append("tests/ 目录")
    if has_test_config:
        score += 1
        evidence_parts.append("测试框架配置")
    if has_ci_test_step:
        score += 1
        evidence_parts.append("CI test step")

    # 判定 level 和 status
    if score >= 4:
        level = 5
        status = "verified"
    elif score >= 3:
        level = 4
        status = "verified"
    elif score >= 2:
        level = 3
        status = "partial"
    elif score >= 1:
        level = 2
        status = "declared" if has_ci_test_step else "partial"
    else:
        level = 0
        status = "not_tested"

    return level, status


def main():
    parser = argparse.ArgumentParser(description="AI Shovel Eval — 静态评测主入口")
    # V1.0.1 fix: 同时支持位置参数和 --repo-url 命名参数（GitHub Actions workflow 用命名参数）
    url_group = parser.add_mutually_exclusive_group()
    url_group.add_argument("url", nargs="?", help="GitHub 仓库 URL（位置参数）")
    url_group.add_argument("--repo-url", help="GitHub 仓库 URL（命名参数，GitHub Actions 用）")
    parser.add_argument("--output", "-o", help="输出 JSON 文件路径（默认 stdout）")
    parser.add_argument("--token", "-t", help="GitHub Token（可选，提高 API 限流额度）")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    url = args.repo_url or args.url
    if not url:
        parser.error("必须提供仓库 URL（位置参数或 --repo-url）")

    token = args.token or os.environ.get("GITHUB_TOKEN")

    try:
        report = run(url, token=token, verbose=args.verbose)
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

    # 输出
    out_json = json.dumps(report, indent=2, ensure_ascii=False, default=str)
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(out_json, encoding="utf-8")
        if args.verbose:
            print(f"输出已写入：{args.output}")
    else:
        print(out_json)


if __name__ == "__main__":
    main()
