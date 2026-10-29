# 拉取 catalog.csv 中所有仓库的实时状态（stars / 最近更新 / 归档 / 许可证 / 语言），
# 写入 live.json 供静态页面展示。由 GitHub Actions 每 6 小时及 catalog.csv 变更时触发。
import csv
import json
import os
import re
import time
import urllib.error
import urllib.request

TOKEN = os.environ.get("GITHUB_TOKEN", "")
CATALOG = "catalog.csv"
OUTPUT = "live.json"
API = "https://api.github.com/repos/"


def api_get(slug):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ai-shovels-live-sync",
    }
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(API + slug, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[404] {slug}")
        elif e.code in (403, 429):
            retry = int(e.headers.get("Retry-After", "10"))
            print(f"[{e.code}] {slug} 限流，等待 {retry}s 重试")
            time.sleep(retry)
            try:
                with urllib.request.urlopen(req, timeout=25) as resp:
                    return json.load(resp)
            except Exception as e2:
                print(f"[retry-fail] {slug}: {e2}")
        else:
            print(f"[{e.code}] {slug}")
    except Exception as e:
        print(f"[err] {slug}: {e}")
    return None


def collect_slugs():
    slugs = set()
    with open(CATALOG, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if len(row) < 3:
                continue
            m = re.search(r"github\.com/([^/\s#?]+)/([^/\s#?]+)", row[2])
            if m:
                repo = m.group(2).removesuffix(".git")
                slugs.add(f"{m.group(1)}/{repo}")
    return sorted(slugs)


def main():
    slugs = collect_slugs()
    print(f"共 {len(slugs)} 个唯一仓库待同步")
    repos = {}
    for i, slug in enumerate(slugs, 1):
        data = api_get(slug)
        if data and "full_name" in data:
            license_info = data.get("license") or {}
            repos[slug] = {
                "stars": data.get("stargazers_count", 0),
                "forks": data.get("forks_count", 0),
                "pushed_at": data.get("pushed_at"),
                "archived": bool(data.get("archived")),
                "desc": (data.get("description") or "")[:200],
                "license": license_info.get("spdx_id"),
                "lang": data.get("language"),
            }
        else:
            repos[slug] = None  # 仓库已删除或改名
        if i % 20 == 0:
            print(f"进度 {i}/{len(slugs)}")
        time.sleep(0.1)  # 限速，避免触发二级限额

    payload = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "repos": repos,
    }
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=0)
    ok = sum(1 for v in repos.values() if v)
    print(f"完成：成功 {ok}，失败 {len(repos) - ok}，已写入 {OUTPUT}")


if __name__ == "__main__":
    main()
