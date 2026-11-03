from .config import DIMENSIONS, SCORE_STATUS


# 子项评分：0-5 分 + 状态
SCORE_LEVELS = {0: "failed", 1: "poor", 2: "partial", 3: "pass", 4: "good", 5: "excellent"}


def compute_preliminary_score(sub_scores: list[dict]) -> dict:
    """
    静态初评计算（任务书 §7.11）：
      已评测得分 = Σ (子项权重 × 子项评分 / 5)
      静态初评 = 已评测得分 / 已评测权重 × 100
      评测覆盖率 = 已评测权重 / 适用总权重 × 100

    sub_scores: [{dim_key, sub_key, weight, level(0-5), status}]
    """
    evaluated_score = 0.0
    evaluated_weight = 0.0
    total_weight = sum(sub["weight"] for d in DIMENSIONS for _, _, sw in d[3] for sub in [{"weight": sw}])

    for s in sub_scores:
        status = s.get("status", "not_tested")
        weight = s["weight"]
        level = s["level"]

        # 不适用 → 不计入
        if status == "not_applicable":
            continue

        # 未测试 → 不计入（不自动按零分）
        if status == "not_tested":
            continue

        # 已评测 → 得分 + 计入权重
        evaluated_score += weight * (level / 5)
        evaluated_weight += weight

    # 静态初评（归一化）
    if evaluated_weight == 0:
        preliminary = 0
    else:
        preliminary = round(evaluated_score / evaluated_weight * 100)

    coverage = round(evaluated_weight / total_weight * 100) if total_weight > 0 else 0

    # 覆盖率不足 80% 时，不产生正式评级
    level_label = "provisional" if coverage < 80 else "official"

    return {
        "preliminary_score": preliminary,
        "evaluated_score": round(evaluated_score, 1),
        "evaluated_weight": round(evaluated_weight, 1),
        "total_weight": total_weight,
        "coverage": coverage,
        "score_level": level_label,
        "rating_locked": coverage < 80,
    }


def validate_weights() -> bool:
    """自检：七个维度权重之和必须 = 100"""
    total = sum(w for _, _, w, _ in DIMENSIONS)
    return total == 100
