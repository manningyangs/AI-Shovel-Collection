# URL 校验：仅允许公开 GitHub 仓库
import re


GITHUB_REPO_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+?)(?:\.git)?/?$"
)


class UrlValidationError(ValueError):
    pass


def validate_github_repo_url(url: str) -> dict:
    """校验 GitHub 仓库 URL，返回 owner/repo 或抛错。"""
    if not url or not isinstance(url, str):
        raise UrlValidationError("URL 不能为空")

    # 拒绝非 https（允许 http 但提示）
    if not url.startswith(("http://", "https://")):
        raise UrlValidationError("URL 必须以 http:// 或 https:// 开头")

    # 拒绝路径穿越和可疑字符
    if any(x in url for x in ["..", "%00", "\x00", "\\"]):
        raise UrlValidationError("URL 包含可疑字符")

    # 只匹配纯仓库 URL
    m = GITHUB_REPO_RE.match(url.strip())
    if not m:
        raise UrlValidationError(
            "不是有效的 GitHub 仓库 URL。"
            "支持格式：https://github.com/owner/repo"
            " 或 https://github.com/owner/repo.git"
        )

    owner = m.group(1)
    repo = m.group(2)

    # 拒绝 github.com 子路径（如 /issues/、/blob/）——正则已经不匹配，但双重保险
    if any(x in url.lower() for x in ["/issues/", "/pull/", "/blob/", "/tree/", "/releases/", "/actions/", "/wiki/", "/gist/"]):
        raise UrlValidationError("URL 不是仓库主页，包含子路径")

    return {
        "owner": owner,
        "repo": repo,
        "normalized": f"https://github.com/{owner}/{repo}",
    }
