#!/usr/bin/env python3
"""94 条工具关系候选导入校验脚本（Phase 1）。

输入：
  - docs/development/tool-map/ai-shovel-tool-relationship-candidates.json（用户提供的候选清单）
  - astro/public/catalog.csv（权威工具目录，owner/repo 为稳定 ID）
  - astro/src/data/tool-map/relations.json（生产关系库，只读，绝不覆盖）

输出：
  - astro/src/data/tool-map/relation-candidates.json（schema 对齐后的候选关系，与正式关系隔离）
  - docs/development/tool-map/RELATION-IMPORT-REPORT.md（真实统计的导入报告）

规则：
  - source/target 必须与 catalog 解析出的 owner/repo 精确匹配（大小写敏感），相似不认定为匹配；
  - 自环、非法关系类型、非法证据等级一律排除；
  - 候选内部重复（同一无序端点对出现多次）只保留首条；
  - 已存在于 relations.json 的关系（同一无序端点对）不再进入候选文件；
  - 不把 inferred 升级为 documented，不生成 verified。
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASTRO = ROOT / "astro"
SRC_DATA = ASTRO / "src" / "data" / "tool-map"
CANDIDATES_IN = ROOT / "docs" / "development" / "tool-map" / "ai-shovel-tool-relationship-candidates.json"
OUT_JSON = SRC_DATA / "relation-candidates.json"
OUT_REPORT = ROOT / "docs" / "development" / "tool-map" / "RELATION-IMPORT-REPORT.md"

VALID_REL_TYPES = {"integration", "protocol", "complementary", "alternative"}
VALID_EVIDENCE = {"verified", "documented", "inferred", "unverified"}
URL_RE = re.compile(r"^https?://(www\.)?github\.com/([^/\s]+/[^/\s]+?)(\.git)?/?$")


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def catalog_repo_ids() -> set[str]:
    """与 build_tool_map.py 相同的解析口径：从 GitHub URL 提取 owner/repo。"""
    raw = (ASTRO / "public" / "catalog.csv").read_text(encoding="utf-8-sig")
    rows = [r for r in csv.reader(io.StringIO(raw)) if r and any(c.strip() for c in r)]
    if rows and rows[0][0].strip().startswith("分类"):
        rows = rows[1:]
    ids: set[str] = set()
    for row in rows:
        url = (row[2] if len(row) > 2 else "").strip()
        m = URL_RE.match(url)
        if m:
            ids.add(m.group(2))
    return ids


def pair_key(a: str, b: str) -> tuple[str, str]:
    a, b = a.lower(), b.lower()
    return (a, b) if a <= b else (b, a)


def evidence_str_to_list(raw: str, evidence_type: str) -> list[dict]:
    out = []
    for part in re.split(r"[;\s]+", raw or ""):
        part = part.strip().rstrip(",，")
        if part.startswith("http"):
            out.append({"type": evidence_type or "official_repository", "url": part})
    return out


def main() -> int:
    catalog_ids = catalog_repo_ids()
    catalog_lower = {i.lower(): i for i in catalog_ids}
    existing_rels = load_json(SRC_DATA / "relations.json").get("relations", [])
    existing_pairs = {pair_key(r["source"], r["target"]) for r in existing_rels}
    existing_exact = {(r["source"].lower(), r["target"].lower(), r["type"]) for r in existing_rels}

    doc = load_json(CANDIDATES_IN)
    cands = doc.get("relations", [])

    total = len(cands)
    src_miss: list[dict] = []
    tgt_miss: list[dict] = []
    case_fix: list[dict] = []
    invalid: list[dict] = []
    self_loops: list[dict] = []
    dup_in_cands: list[dict] = []
    dup_existing: list[dict] = []
    accepted: list[dict] = []

    seen_pairs: dict[tuple[str, str], str] = {}

    for c in cands:
        cid, src, tgt = c.get("id"), c.get("source", ""), c.get("target", "")
        problems = []

        src_ok, tgt_ok = src in catalog_ids, tgt in catalog_ids
        # 诊断：大小写不一致 / 同 owner 相似 ID（仅提示，不作为匹配成功）
        for side, ok, miss_list in (("source", src_ok, src_miss), ("target", tgt_ok, tgt_miss)):
            val = src if side == "source" else tgt
            if not ok:
                entry = {"id": cid, side: val}
                if val.lower() in catalog_lower:
                    entry["similar"] = f"仅大小写不同 → {catalog_lower[val.lower()]}"
                else:
                    owner, _, repo = val.partition("/")
                    norm = repo.replace("-", "").lower()
                    hits = [
                        c for c in catalog_ids
                        if c.lower().startswith(owner.lower() + "/")
                        and c.lower() != val.lower()
                        and (
                            c.split("/", 1)[1].replace("-", "").lower() == norm
                            or norm in c.split("/", 1)[1].replace("-", "").lower()
                            or c.split("/", 1)[1].replace("-", "").lower() in norm
                        )
                    ]
                    if hits:
                        entry["similar"] = "同 owner 相似 ID → " + ", ".join(hits) + "（需人工确认，未自动匹配）"
                miss_list.append(entry)

        if c.get("type") not in VALID_REL_TYPES:
            problems.append(f"非法关系类型 {c.get('type')}")
        if c.get("evidenceLevel") not in VALID_EVIDENCE:
            problems.append(f"非法证据等级 {c.get('evidenceLevel')}")
        if src.lower() == tgt.lower():
            problems.append("自环")
            self_loops.append({"id": cid, "pair": f"{src} → {tgt}"})
        if not src_ok or not tgt_ok:
            problems.append("端点不在 catalog")

        if problems:
            invalid.append({"id": cid, "problems": problems})
            continue

        # 候选内重复：同一无序端点对
        key = pair_key(src, tgt)
        if key in seen_pairs:
            dup_in_cands.append({"id": cid, "duplicates": seen_pairs[key], "pair": f"{src} ↔ {tgt}"})
            continue
        seen_pairs[key] = cid

        # 与现有生产关系重复
        if key in existing_pairs:
            dup_existing.append({"id": cid, "pair": f"{src} ↔ {tgt}", "type": c.get("type")})
            continue

        accepted.append(
            {
                "id": cid,
                "source": src,
                "target": tgt,
                "type": c.get("type"),
                "evidenceLevel": c.get("evidenceLevel"),
                "description": c.get("description", ""),
                "evidence": evidence_str_to_list(c.get("evidence", ""), c.get("evidenceType", "")),
                "direction": c.get("direction"),
                "status": c.get("status"),
                "inputOutputMatch": c.get("inputOutputMatch", "unknown"),
                "protocolMatch": c.get("protocolMatch", "unknown"),
                "setupRequired": c.get("setupRequired", "unknown"),
                "displayByDefault": bool(c.get("displayByDefault", False)),
                "reviewNote": c.get("reviewNote", ""),
                "sourceFile": "ai-shovel-tool-relationship-candidates.json",
                "importedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            }
        )

    matched_both = total - len({e["id"] for e in src_miss} | {e["id"] for e in tgt_miss})
    type_count = Counter(c.get("type") for c in cands)
    ev_count = Counter(c.get("evidenceLevel") for c in cands)
    matched_tools = sorted(
        {t for c in accepted for t in (c["source"], c["target"])}
    )

    counts = {
        "total": total,
        "matchedBothEnds": matched_both,
        "sourceMissing": len(src_miss),
        "targetMissing": len(tgt_miss),
        "duplicatesInCandidates": len(dup_in_cands),
        "duplicatesWithExisting": len(dup_existing),
        "invalid": len(invalid),
        "accepted": len(accepted),
        "alternative": type_count.get("alternative", 0),
        "complementary": type_count.get("complementary", 0),
        "documented": ev_count.get("documented", 0),
        "inferred": ev_count.get("inferred", 0),
        "toolsInvolved": len(matched_tools),
    }

    # ---------- 输出候选文件（与生产 relations.json 严格隔离） ----------
    payload = {
        "version": 1,
        "note": "候选关系清单（非公共事实）。由 scripts/analyze_tool_relations.py 校验导入；displayByDefault=false；未经人工审核前不在地图默认展示，不得写入 relations.json。",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sourceFile": "docs/development/tool-map/ai-shovel-tool-relationship-candidates.json",
        "counts": counts,
        "candidates": accepted,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ---------- 输出导入报告 ----------
    def rows(items, keys):
        if not items:
            return ["（无）"]
        lines = ["| " + " | ".join(keys) + " |", "|" + "---|" * len(keys)]
        for it in items:
            lines.append("| " + " | ".join(str(it.get(k, "")) for k in keys) + " |")
        return lines

    lines = [
        "# 94 条关系候选导入报告（RELATION-IMPORT-REPORT）",
        "",
        f"> 由 `scripts/analyze_tool_relations.py` 生成于 {payload['generatedAt']}；"
        "输入：`docs/development/tool-map/ai-shovel-tool-relationship-candidates.json` + `astro/public/catalog.csv`；"
        "输出：`astro/src/data/tool-map/relation-candidates.json`。生产关系库 `relations.json` 未被修改。",
        "",
        "## 总量统计",
        "",
        "| 指标 | 数量 |",
        "|---|---|",
        f"| 候选关系总数 | {counts['total']} |",
        f"| 两端均成功匹配 catalog（精确 owner/repo） | {counts['matchedBothEnds']} |",
        f"| source 无法匹配 | {counts['sourceMissing']} |",
        f"| target 无法匹配 | {counts['targetMissing']} |",
        f"| 候选内部重复（同无序端点对，多余条目） | {counts['duplicatesInCandidates']} |",
        f"| 与现有 relations.json 重复 | {counts['duplicatesWithExisting']} |",
        f"| 无效关系（自环/非法类型/非法证据/端点缺失） | {counts['invalid']} |",
        f"| **最终进入候选文件** | **{counts['accepted']}** |",
        "",
        "## 候选构成（总数内）",
        "",
        "| 维度 | 数量 |",
        "|---|---|",
        f"| 替代关系（alternative） | {counts['alternative']} |",
        f"| 互补关系（complementary） | {counts['complementary']} |",
        f"| documented 候选 | {counts['documented']} |",
        f"| inferred 候选 | {counts['inferred']} |",
        f"| 进入候选文件的关系涉及工具数 | {counts['toolsInvolved']} |",
        "",
        "## 分类口径",
        "",
        "- 匹配 = 候选 source/target 与 catalog.csv 解析出的 `owner/repo` **精确一致**（大小写敏感）；名称相似不视为匹配。",
        "- 重复：同一无序端点对在候选内出现多次，仅保留首条；与 `relations.json` 已有端点对相同的不再进入候选。",
        "- 无效：自环、关系类型不属 {integration, protocol, complementary, alternative}、证据等级不属 {verified, documented, inferred, unverified}、任一端点缺失。",
        "- 候选文件保持原始 evidenceLevel，未做任何升级；documented 候选在进入生产关系库前仍需重新核验官方 README。",
        "",
        "## source 无法匹配明细",
        "",
        *rows(src_miss, ["id", "source", "similar"]),
        "",
        "## target 无法匹配明细",
        "",
        *rows(tgt_miss, ["id", "target", "similar"]),
        "",
        "## 候选内部重复明细",
        "",
        *rows(dup_in_cands, ["id", "duplicates", "pair"]),
        "",
        "## 与现有关系重复明细",
        "",
        *rows(dup_existing, ["id", "type", "pair"]),
        "",
        "## 无效关系明细",
        "",
        *rows(invalid, ["id", "problems"]),
        "",
        "## 进入候选文件的关系（按类型/证据）",
        "",
        f"- accepted by type: {dict(Counter(c['type'] for c in accepted))}",
        f"- accepted by evidenceLevel: {dict(Counter(c['evidenceLevel'] for c in accepted))}",
        "",
        "## 后续审核要求",
        "",
        "1. documented 候选进入 `relations.json` 前必须重新核验官方文档证据 URL。",
        "2. inferred 候选仅作工作流逻辑提示，禁止展示为真实集成。",
        "3. alternative 不得作为工作流前后步骤的连接依据。",
    ]
    OUT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"[relations] total={total} matched={counts['matchedBothEnds']} "
          f"src_miss={counts['sourceMissing']} tgt_miss={counts['targetMissing']} "
          f"dup_in={counts['duplicatesInCandidates']} dup_existing={counts['duplicatesWithExisting']} "
          f"invalid={counts['invalid']} accepted={counts['accepted']}")
    print(f"[relations] wrote {OUT_JSON.relative_to(ROOT)} and {OUT_REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
