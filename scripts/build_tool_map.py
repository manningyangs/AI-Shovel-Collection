#!/usr/bin/env python3
"""AI Tool Map 数据生成脚本（阶段2）。

读取现有工具目录与动态数据 → 校验 → 生成地图 JSON + 数据核验报告。
输入（全部复用现有数据，不复制维护）：
  - astro/public/catalog.csv        节点源（名称/分类/GitHub URL）
  - astro/public/live_multi.json    stars/lang/更新时间/状态
  - evaluations/index.json          评测报告索引
  - astro/src/data/tool-map/*.json  capabilities / annotations / relations / layout
输出：
  - astro/public/data/tool-map.json
  - docs/development/TOOL-MAP-VERIFY.md
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASTRO = ROOT / "astro"
DATA_DIR = ASTRO / "src" / "data" / "tool-map"
OUT_JSON = ASTRO / "public" / "data" / "tool-map.json"
OUT_REPORT = ROOT / "docs" / "development" / "TOOL-MAP-VERIFY.md"
BASE = "/AI-Shovel-Collection"

VALID_REL_TYPES = {"integration", "protocol", "complementary", "alternative"}
VALID_EVIDENCE = {"verified", "documented", "inferred", "unverified"}
URL_RE = re.compile(r"^https?://(www\.)?github\.com/([^/\s]+/[^/\s]+?)(\.git)?/?$")


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def repo_from_url(url: str) -> str | None:
    m = URL_RE.match(url.strip())
    return m.group(2) if m else None


def main() -> int:
    # ---------- 读取输入 ----------
    catalog_raw = (ASTRO / "public" / "catalog.csv").read_text(encoding="utf-8-sig")
    rows = [r for r in csv.reader(io.StringIO(catalog_raw)) if r and any(c.strip() for c in r)]
    if rows and rows[0][0].strip().startswith("分类"):
        rows = rows[1:]

    live = load_json(ASTRO / "public" / "live_multi.json")
    live_curated = live.get("curated") or {}
    if isinstance(live_curated, list):
        live_by_key = {}
        for e in live_curated:
            slug = (e.get("repo_slug") or e.get("repo_url") or "").replace(
                "https://github.com/", ""
            ).replace(".git", "")
            if slug:
                live_by_key[slug.lower()] = e
    else:
        live_by_key = {k.lower(): v for k, v in live_curated.items()}

    eval_index_path = ROOT / "evaluations" / "index.json"
    eval_by_key = {}
    if eval_index_path.exists():
        for rep in load_json(eval_index_path).get("reports", []) or []:
            owner, name = rep.get("owner"), rep.get("name")
            if owner and name:
                eval_by_key[f"{owner}/{name}".lower()] = rep

    capabilities = load_json(DATA_DIR / "capabilities.json")["capabilities"]
    annotations = load_json(DATA_DIR / "annotations.json").get("tools", {})
    relations_doc = load_json(DATA_DIR / "relations.json")
    layout = load_json(DATA_DIR / "layout.json")
    anchors = layout["anchors"]
    cluster = layout["cluster"]
    explicit_pos = layout.get("tools", {})

    # ---------- 节点构建与校验 ----------
    invalid_rows, dupes, nodes = [], [], []
    seen: dict[str, str] = {}
    dir_record_count = len(rows)
    for idx, row in enumerate(rows, start=2):  # 行号含表头
        cat = (row[0] if len(row) > 0 else "").strip()
        name_full = (row[1] if len(row) > 1 else "").strip()
        url = (row[2] if len(row) > 2 else "").strip()
        repo = repo_from_url(url)
        if not repo:
            invalid_rows.append({"line": idx, "url": url, "name": name_full})
            continue
        key = repo.lower()
        if key in seen:
            dupes.append({"repo": repo, "first_seen": seen[key]})
            continue
        seen[key] = name_full

        cap = None
        # 分类前缀匹配（"1." "9A." 等）
        prefix = re.match(r"^(\d+[A-Za-z]?)\.", cat.strip())
        if prefix:
            for c in capabilities:
                if c["category"].rstrip(". ") == prefix.group(1):
                    cap = c
                    break

        lv = live_by_key.get(key, {})
        ev = eval_by_key.get(key)
        anno = annotations.get(repo, {})

        node = {
            "id": repo,
            "name": name_full,
            "category": re.sub(r"^\d+[A-Za-z]?\.\s*", "", cat),
            "capability": (cap or {}).get("id", "uncategorized"),
            "desc": lv.get("desc") or "",
            "stars": lv.get("stars"),
            "lang": lv.get("lang") or "",
            "pushedAt": lv.get("pushed_at") or "",
            "status": lv.get("status") or "",
            "eval": (
                {
                    "score": ev.get("preliminary_score") if ev.get("score_status") == "preliminary" else ev.get("score"),
                    "grade": ev.get("grade"),
                    "level": ev.get("level"),
                    "status": ev.get("score_status"),
                    "reportId": ev.get("report_id"),
                }
                if ev
                else None
            ),
            "detailUrl": f"{BASE}/tools/{repo.replace('/', '-')}/",
            "capabilities": sorted(
                {cap["id"] if cap else "uncategorized"} | set(anno.get("capabilities", []))
            ),
            "mapGroup": anno.get("mapGroup") or (cap or {}).get("id", "uncategorized"),
            "summary": anno.get("summary") or "",
        }
        nodes.append(node)

    # ---------- 关系校验 ----------
    node_ids = {n["id"].lower() for n in nodes}
    rel_invalid, relations = [], []
    for r in relations_doc.get("relations", []):
        problems = []
        if r.get("type") not in VALID_REL_TYPES:
            problems.append(f"非法类型 {r.get('type')}")
        if r.get("evidenceLevel") not in VALID_EVIDENCE:
            problems.append(f"非法证据等级 {r.get('evidenceLevel')}")
        if (r.get("source") or "").lower() not in node_ids:
            problems.append(f"起点不存在 {r.get('source')}")
        if (r.get("target") or "").lower() not in node_ids:
            problems.append(f"终点不存在 {r.get('target')}")
        if (r.get("source") or "").lower() == (r.get("target") or "").lower():
            problems.append("自环")
        if problems:
            rel_invalid.append({"id": r.get("id"), "problems": problems})
        else:
            relations.append(r)

    # ---------- 确定性布局 ----------
    group_members: dict[str, list[str]] = {}
    for n in nodes:
        group_members.setdefault(n["mapGroup"], []).append(n)
    for gid, members in group_members.items():
        anchor = anchors.get(gid) or {"x": 0, "y": 4000}
        for i, n in enumerate(members):
            if n["id"] in explicit_pos:
                n["position"] = explicit_pos[n["id"]]
                continue
            col = i % cluster["nodesPerRow"]
            row = i // cluster["nodesPerRow"]
            n["position"] = {
                "x": anchor["x"] + col * cluster["nodeColGap"],
                "y": anchor["y"] + row * cluster["nodeRowGap"],
            }

    # ---------- 统计 ----------
    related_ids = {r["source"].lower() for r in relations} | {r["target"].lower() for r in relations}
    ev_count = {e: sum(1 for r in relations if r["evidenceLevel"] == e) for e in VALID_EVIDENCE}
    type_count = {t: sum(1 for r in relations if r["type"] == t) for t in sorted(VALID_REL_TYPES)}
    stats = {
        "catalogRecords": dir_record_count,
        "validRepoUrls": dir_record_count - len(invalid_rows),
        "uniqueTools": len(nodes),
        "mapNodes": len(nodes),
        "toolsWithRelations": len(related_ids),
        "relationTotal": len(relations),
        "relationByEvidence": {k: v for k, v in ev_count.items() if v},
        "relationByType": {t: c for t, c in type_count.items() if c},
        "invalidRows": len(invalid_rows),
        "duplicates": len(dupes),
        "invalidRelations": len(rel_invalid),
        "evaluatedTools": sum(1 for n in nodes if n["eval"]),
    }

    # ---------- 输出 JSON ----------
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": "scripts/build_tool_map.py",
        "stats": stats,
        "capabilities": capabilities,
        "nodes": nodes,
        "relations": relations,
    }
    OUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # ---------- 输出核验报告 ----------
    lines = [
        "# AI Tool Map 数据核验报告（TOOL-MAP-VERIFY）",
        "",
        f"> 由 `scripts/build_tool_map.py` 生成于 {payload['generatedAt']}；输入：catalog.csv / live_multi.json / evaluations/index.json。",
        "",
        "## 数量统计",
        "",
        "| 指标 | 数值 |",
        "|---|---|",
        f"| 目录记录数（除表头） | {stats['catalogRecords']} |",
        f"| 有效 GitHub 项目数 | {stats['validRepoUrls']} |",
        f"| 去重后工具数 | {stats['uniqueTools']} |",
        f"| 成功生成地图节点数 | {stats['mapNodes']} |",
        f"| 有可靠关系的工具数 | {stats['toolsWithRelations']} |",
        f"| 关系总数 | {stats['relationTotal']} |",
        f"| 已验证关系（verified） | {ev_count['verified']} |",
        f"| 文档支持关系（documented） | {ev_count['documented']} |",
        f"| 推断关系（inferred） | {ev_count['inferred']} |",
        f"| 证据不足关系（unverified，已剔除） | {ev_count['unverified']} |",
        f"| 已有评测报告的工具数 | {stats['evaluatedTools']} |",
        "",
        "## 关系类型分布",
        "",
        "| 类型 | 数量 |",
        "|---|---|",
        *[f"| {t} | {c} |" for t, c in stats["relationByType"].items()],
        "",
        "## 校验结果",
        "",
        f"- 无效仓库地址行：{len(invalid_rows)}" + ("" if not invalid_rows else f" → `{invalid_rows}`"),
        f"- 重复节点：{len(dupes)}" + ("" if not dupes else f" → `{dupes}`"),
        f"- 失效关系（已剔除）：{len(rel_invalid)}" + ("" if not rel_invalid else f" → `{rel_invalid}`"),
        "",
        "## 说明",
        "",
        "- 节点数 = 去重后有效工具数；关系只保留两端节点存在且类型/证据合法的条目。",
        "- `inferred` 关系在前端默认弱化展示，`unverified` 不进入生成结果。",
        "- 评测/Stars 等字段为空即如实缺省，不造数。",
    ]
    OUT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"[tool-map] nodes={stats['mapNodes']} relations={stats['relationTotal']} "
          f"invalid_rows={len(invalid_rows)} dupes={len(dupes)} invalid_rels={len(rel_invalid)}")
    print(f"[tool-map] wrote {OUT_JSON.relative_to(ROOT)} and {OUT_REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
