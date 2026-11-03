# AI Shovel Eval V1.0 配置
# 七个维度权重总计必须 = 100

SCORING_VERSION = "1.0"

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
