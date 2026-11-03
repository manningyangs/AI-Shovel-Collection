# AI Shovel Eval V1.0 配置
# 七个维度权重总计必须 = 100

SCORING_VERSION = "1.0.1"  # V1.0.1: OSV blocked 区分 + test_evidence 真检测 + 项目类型权重

DIMENSIONS = [
    # (key, label, weight, sub_items)
    ("functionality", "功能完整度", 25, [
        ("core_completeness", "核心能力声明完整性", 5),
        ("coverage", "功能覆盖情况", 5),
        ("schema_completeness", "接口及工具 Schema 完整性", 5),
        ("task_examples", "任务示例和结果说明", 5),
        ("error_handling", "异常处理设计证据", 5),
    ]),
    ("agent_compat", "智能体兼容性", 15, [
        ("protocol_compliance", "MCP 或技能协议规范符合性", 4),
        ("host_support", "主流 Agent 宿主支持声明", 5),
        ("transport_config", "连接配置及传输方式说明", 3),
        ("env_auth", "环境和认证兼容性说明", 3),
    ]),
    ("ease_of_use", "易用性与集成体验", 15, [
        ("install_instructions", "安装说明", 5),
        ("config_env", "配置和环境变量说明", 4),
        ("deploy", "部署方式与依赖要求", 3),
        ("quickstart", "快速开始示例", 3),
    ]),
    ("reliability", "可靠性与运行效率", 15, [
        ("test_evidence", "自动化测试证据", 5),
        ("ci_complete", "CI 流程完整性", 4),
        ("error_mechanism", "错误处理机制说明", 3),
        ("release_stability", "版本发布及稳定性证据", 3),
    ]),
    ("security", "安全性与隐私保护", 15, [
        ("dependency_vulns", "依赖漏洞", 4),
        ("danger_ops", "权限及危险操作声明", 4),
        ("data_access", "数据及网络访问控制证据", 3),
        ("secret_scan", "敏感信息和危险代码扫描", 4),
    ]),
    ("maintenance", "项目维护健康度", 10, [
        ("update_release", "最近更新与 Release", 3),
        ("ci_status", "CI 持续集成", 3),
        ("issue_maintain", "Issue 维护记录", 2),
        ("continuity", "项目持续维护证据", 2),
    ]),
    ("docs", "文档与开发者体验", 5, [
        ("install_deploy_doc", "安装部署文档", 2),
        ("usage_example", "使用示例和接口说明", 2),
        ("license_info", "License 和使用限制", 1),
    ]),
]

# 校验权重之和 = 100
_total_weight = sum(w for _, _, w, _ in DIMENSIONS)
assert _total_weight == 100, f"维度权重之和必须等于 100，当前 {_total_weight}"
_total_sub = sum(sw for _, _, _, subs in DIMENSIONS for _, _, sw in subs)
assert _total_sub == 100, f"子项权重之和必须等于 100，当前 {_total_sub}"

# 评分状态枚举
SCORE_STATUS = {
    "verified": "已有有效验证证据",
    "declared": "项目官方声明",
    "partial": "部分符合",
    "failed": "存在明确失败证据",
    "not_tested": "尚未测试",
    "not_applicable": "不适用",
    "blocked": "受外部环境或授权条件阻断",
}

# 安全红线：发现严重问题时
SEVERE_FINDING_THRESHOLDS = {
    "critical_vuln": True,
    "malware_signature": True,
    "secret_exposure": True,
}

# GitHub API 限流（匿名 60/h，有 Token 5000/h）
API_RATE_LIMIT_ANON = 60
API_RATE_LIMIT_AUTH = 5000

# 下载限制
MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024   # 单文件 2MB
MAX_TOTAL_DOWNLOAD_BYTES = 20 * 1024 * 1024  # 总计 20MB
MAX_FILES_PER_REPO = 500

# 适用 Manifest 文件列表
MANIFEST_FILES = [
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "pyproject.toml", "requirements.txt", "uv.lock", "poetry.lock",
    "Cargo.toml", "go.mod",
    "Dockerfile", "compose.yaml", "docker-compose.yaml",
    "mcp.json", "SKILL.md", "LICENSE", "README.md",
]


# V1.0.1: 按项目类型动态调权重
# 格式: {"ptype": {"dim_key": new_weight}} — 加起来必须 = 100
PTYPE_WEIGHT_OVERRIDES = {
    # Agent Skill: 功能和 Agent 集成是核心，易用性和安全权重降低
    # 30 + 20 + 10 + 15 + 10 + 10 + 5 = 100 ✓
    "agent_skill": {
        "functionality": 30,
        "agent_compat": 20,
        "ease_of_use": 10,
        "reliability": 15,
        "security": 10,
        "maintenance": 10,
        "docs": 5,
    },
}


def get_dimensions_by_ptype(ptype: str) -> list:
    """
    返回指定项目类型的 DIMENSIONS 列表（权重已调整）。
    默认返回标准 DIMENSIONS（MCP / Framework / CLI / Collection / unknown 都用默认）。

    V1.0.1: Agent Skill 权重上调 functionality + agent_compat。
    """
    overrides = PTYPE_WEIGHT_OVERRIDES.get(ptype)
    if not overrides:
        return list(DIMENSIONS)  # 浅拷贝足够（不修改 sub_items）

    result = []
    for key, label, default_weight, subs in DIMENSIONS:
        new_weight = overrides.get(key, default_weight)
        result.append((key, label, new_weight, subs))

    # 安全校验
    total = sum(w for _, _, w, _ in result)
    assert total == 100, f"权重总和必须 = 100，当前 ptype={ptype} 得 {total}"
    return result
