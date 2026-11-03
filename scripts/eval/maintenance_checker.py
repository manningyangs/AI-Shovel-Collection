"""
维护健康度检查（V1.0 核心模块）
用 GitHub API 拉元数据 + Issue/PR 活跃度，不执行任何代码
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any


def check_repo_health(repo_data: dict | None, client) -> dict[str, Any]:
    """
    基于 GitHub API 返回的 repo 元数据计算维护健康度指标。
    repo_data: GET /repos/{owner}/{repo} 响应
    client: GitHubClient 实例
    """
    if not repo_data:
        return {"available": False}

    now = datetime.now(timezone.utc)

    # 基础字段
    pushed_at = _parse_iso(repo_data.get("pushed_at"))
    updated_at = _parse_iso(repo_data.get("updated_at"))
    created_at = _parse_iso(repo_data.get("created_at"))

    # 最近推送时间
    days_since_push = (now - pushed_at).days if pushed_at else None
    days_since_update = (now - updated_at).days if updated_at else None

    # 是否归档
    archived = repo_data.get("archived", False)

    # Stars / Forks
    stars = repo_data.get("stargazers_count", 0)
    forks = repo_data.get("forks_count", 0)

    # Issue 活跃度（只读，拉最近 30 条 open issues）
    issue_activity = _check_issue_activity(repo_data.get("full_name", ""), client)

    # CI 状态：检查有没有 workflow 文件
    ci_present = False
    workflows_count = 0
    try:
        tree = client.get_repo_tree(
            repo_data["owner"]["login"],
            repo_data["name"],
        )
        if tree:
            for item in tree:
                path = item.get("path", "")
                if path.startswith(".github/workflows/") and path.endswith(".yml"):
                    ci_present = True
                    workflows_count += 1
    except Exception:
        pass

    return {
        "available": True,
        "archived": archived,
        "stars": stars,
        "forks": forks,
        "open_issues": repo_data.get("open_issues_count", 0),
        "pushed_at": pushed_at.isoformat() if pushed_at else None,
        "days_since_push": days_since_push,
        "updated_at": updated_at.isoformat() if updated_at else None,
        "days_since_update": days_since_update,
        "created_at": created_at.isoformat() if created_at else None,
        "has_wiki": repo_data.get("has_wiki", False),
        "has_pages": repo_data.get("has_pages", False),
        "is_fork": repo_data.get("fork", False),
        "language": repo_data.get("language"),
        "default_branch": repo_data.get("default_branch", "main"),
        "ci_present": ci_present,
        "workflows_count": workflows_count,
        "issue_activity": issue_activity,
        "network_count": repo_data.get("network_count", 0),
        "subscribers_count": repo_data.get("subscribers_count", 0),
    }


def _check_issue_activity(full_name: str, client) -> dict[str, Any]:
    """
    简化版 Issue 活跃度：只看 open issues 数量和最近 updated_at。
    不执行任何 API 分页循环（限流敏感场景）。
    """
    try:
        resp = client._get(
            f"/search/issues?q=repo:{full_name}+is:open&sort=updated&order=desc&per_page=5",
        )
        if not resp:
            return {"open_count": 0, "total_open": 0}
        total = resp.get("total_count", 0)
        items = resp.get("items", [])
        recent_dates = []
        for item in items[:5]:
            updated = _parse_iso(item.get("updated_at"))
            if updated:
                recent_dates.append((datetime.now(timezone.utc) - updated).days)
        avg_days = sum(recent_dates) / len(recent_dates) if recent_dates else None
        return {
            "total_open": total,
            "recent_updated_days_ago": avg_days,
        }
    except Exception:
        return {"total_open": None}


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        # GitHub 返回 2026-10-29T15:30:00Z 格式
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


# OSV-Scanner 集成检测
def check_security_tools(tree_files: list[str]) -> dict[str, Any]:
    """检查仓库是否自己配置了安全扫描工具（OSV, dependabot, codeql 等）。"""
    tools = {
        "dependabot": any(f.endswith(".yml") and "dependabot" in f.lower() for f in tree_files)
                      or any(f.endswith(".yaml") and "dependabot" in f.lower() for f in tree_files),
        "codeql": any("codeql" in f.lower() for f in tree_files),
        "semgrep": any("semgrep" in f.lower() for f in tree_files),
        "grype": any("grype" in f.lower() for f in tree_files),
    }
    return {
        "has_security_tools": any(tools.values()),
        "tools": tools,
    }
