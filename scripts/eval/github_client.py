# GitHub REST API 客户端（只读）
import json
import os
import urllib.request
import urllib.error


API_BASE = "https://api.github.com"


class GitHubClient:
    def __init__(self, token: str | None = None):
        self.token = token or os.environ.get("GITHUB_TOKEN", "")
        self._cache: dict[str, dict] = {}

    def _headers(self) -> dict:
        h = {"Accept": "application/vnd.github+json", "User-Agent": "ai-shovel-eval/1.0"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _get(self, path: str) -> dict | None:
        if path in self._cache:
            return self._cache[path]
        url = API_BASE + path
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                self._cache[path] = data
                return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def get_repo(self, owner: str, repo: str) -> dict | None:
        return self._get(f"/repos/{owner}/{repo}")

    def get_repo_topics(self, owner: str, repo: str) -> list[str]:
        data = self._get(f"/repos/{owner}/{repo}/topics")
        return data.get("names", []) if data else []

    def get_repo_tree(self, owner: str, repo: str, sha: str = "HEAD") -> list[dict] | None:
        data = self._get(f"/repos/{owner}/{repo}/git/trees/{sha}?recursive=1")
        return data.get("tree") if data else None

    def get_content(self, owner: str, repo: str, path: str) -> str | None:
        # 用 raw.githubusercontent.com（更稳定）
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}"
        req = urllib.request.Request(url, headers={"User-Agent": "ai-shovel-eval/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
                if len(raw) > 2 * 1024 * 1024:  # 单文件上限 2MB
                    return None
                return raw.decode("utf-8", errors="replace")
        except urllib.error.HTTPError:
            return None
