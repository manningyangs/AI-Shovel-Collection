import json


REPORT_SCHEMA = {
    "type": "object",
    "required": ["schema_version", "report_id", "repository", "evaluation", "project_type"],
    "properties": {
        "schema_version": {"type": "string", "pattern": "^\\d+\\.\\d+$"},
        "report_id": {"type": "string", "minLength": 4, "maxLength": 64},
        "repository": {
            "type": "object",
            "required": ["owner", "name", "url", "commit_sha"],
            "properties": {
                "owner": {"type": "string", "maxLength": 64},
                "name": {"type": "string", "maxLength": 64},
                "url": {"type": "string", "pattern": "^https://github\\.com/"},
                "commit_sha": {"type": "string", "pattern": "^[0-9a-f]{7,40}$"},
                "language": {"type": ["string", "null"]},
                "license": {"type": ["string", "null"]},
                "stars": {"type": "integer", "minimum": 0},
            },
        },
        "evaluation": {
            "type": "object",
            "required": ["evaluation_version", "scoring_version", "preliminary_score", "coverage", "evaluated_at"],
            "properties": {
                "evaluation_version": {"type": "string"},
                "scoring_version": {"type": "string"},
                "level": {"type": "string", "enum": ["L1", "L2", "L3"]},
                "score_status": {"type": "string", "enum": ["provisional", "official", "failed"]},
                "preliminary_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "official_score": {"type": ["integer", "null"]},
                "coverage": {"type": "integer", "minimum": 0, "maximum": 100},
                "evaluated_at": {"type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T"},
            },
        },
        "project_type": {"type": "object"},
        "dimensions": {"type": "object"},
        "agent_compatibility": {"type": "array"},
        "security_findings": {"type": "array"},
        "recommendations": {"type": "array"},
        "evidence": {"type": "array"},
        "limitations": {"type": "array"},
    },
}


def validate_report(report: dict) -> tuple[bool, str]:
    """
    简易 JSON Schema 校验（不依赖 jsonschema 库）。
    返回 (valid, error_message)。
    """
    # 必填顶层字段
    for field in REPORT_SCHEMA["required"]:
        if field not in report:
            return False, f"缺少必填字段: {field}"

    # schema_version 格式
    sv = report.get("schema_version", "")
    if not isinstance(sv, str) or not sv.replace(".", "").isdigit():
        return False, "schema_version 必须是 x.y 格式"

    # report_id 长度
    rid = report.get("report_id", "")
    if not (4 <= len(rid) <= 64):
        return False, f"report_id 长度 {len(rid)}，应在 4-64 之间"

    # repository.owner/name
    repo = report.get("repository", {})
    if not isinstance(repo.get("owner"), str):
        return False, "repository.owner 必须是字符串"
    if not isinstance(repo.get("name"), str):
        return False, "repository.name 必须是字符串"

    # commit_sha 格式（允许 7-40 位 hex）
    sha = repo.get("commit_sha", "")
    if not sha or not all(c in "0123456789abcdef" for c in sha.lower()) or len(sha) < 7:
        return False, f"commit_sha 格式无效: {sha}"

    # evaluation.preliminary_score 范围
    ev = report.get("evaluation", {})
    ps = ev.get("preliminary_score", -1)
    if not (0 <= ps <= 100):
        return False, f"preliminary_score 超出范围 [0,100]: {ps}"

    cov = ev.get("coverage", -1)
    if not (0 <= cov <= 100):
        return False, f"coverage 超出范围 [0,100]: {cov}"

    return True, ""


def report_id_from(owner: str, repo: str, commit_sha: str, scoring_version: str) -> str:
    """基于 owner/repo/commit/scoring_version 生成稳定 ID。"""
    import hashlib
    raw = f"{owner}/{repo}@{commit_sha[:12]}#v{scoring_version}"
    h = hashlib.sha256(raw.encode()).hexdigest()[:12]
    return f"{owner}-{repo}-{h}"
