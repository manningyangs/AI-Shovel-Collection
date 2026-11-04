"""AI Shovel Eval — 进度回调客户端。

向 Cloudflare Worker 的内部进度接口发送八阶段评测进度。

安全约束：
- 密钥只从环境变量读取，绝不打印、绝不写入命令行参数。
- 回调失败只告警，绝不影响评测主流程（不抛异常）。
- 环境变量缺失时整体 no-op（本地运行 / 旧工作流不受影响）。

环境变量：
    EVAL_PROGRESS_URL      Worker 基地址（如 https://xxx.workers.dev），缺失则 no-op
    EVAL_PROGRESS_SECRET   HMAC 共享密钥
    EVAL_REQUEST_ID        评测任务 ID（EV-xxxxxxxx）
    GITHUB_RUN_ID          当前 Workflow Run ID（Actions 自动注入）
    GITHUB_RUN_ATTEMPT     当前 Run Attempt（Actions 自动注入）

用法（Workflow 内）：
    python3 -m eval.progress_client progress --stage 7 --status completed --message "报告校验通过"
    python3 -m eval.progress_client finalize --report-id RID --report-url URL
    python3 -m eval.progress_client fail --stage 4 --message "静态分析失败"
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request

STAGE_TOTAL = 8

# 进度事件 seq 规则：stage_index * 10 + kind
# kind: 0=started, 1=completed, 2=failed  → 天然按阶段单调递增
_KIND = {"running": 0, "started": 0, "completed": 1, "failed": 2}
# failed 作为终态事件使用超大 seq，保证不会被任何进行中事件覆盖
_SEQ_FAILED = 99999


def _enabled() -> bool:
    return bool(
        os.environ.get("EVAL_PROGRESS_URL")
        and os.environ.get("EVAL_PROGRESS_SECRET")
        and os.environ.get("EVAL_REQUEST_ID")
    )


def _sign(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(
        secret.encode("utf-8"), f"{timestamp}.".encode("utf-8") + body, hashlib.sha256
    ).hexdigest()


def _post(path: str, payload: dict, retries: int = 2) -> bool:
    """发送 POST，带 HMAC 签名。失败返回 False，不抛异常。"""
    if not _enabled():
        return False

    url = os.environ["EVAL_PROGRESS_URL"].rstrip("/") + path
    secret = os.environ["EVAL_PROGRESS_SECRET"]
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    timestamp = str(int(time.time()))
    signature = _sign(secret, timestamp, body)

    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Eval-Timestamp": timestamp,
            "X-Eval-Signature": signature,
            "User-Agent": "AI-Shovel-Eval-Progress-Client",
        },
    )

    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    return True
                print(
                    f"[progress] 回调 HTTP {resp.status}（attempt {attempt + 1}）",
                    file=sys.stderr,
                )
        except urllib.error.HTTPError as e:
            # 4xx（如 seq 过期被忽略）不重试
            if 400 <= e.code < 500:
                print(f"[progress] 回调被拒绝 HTTP {e.code}，忽略", file=sys.stderr)
                return False
            print(f"[progress] 回调 HTTP {e.code}（attempt {attempt + 1}）", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — 网络异常一律吞掉，只告警
            print(f"[progress] 回调失败（attempt {attempt + 1}）: {e}", file=sys.stderr)
        if attempt < retries:
            time.sleep(1.5 * (attempt + 1))
    return False


def _base_payload(stage_index: int, status: str, message: str, seq: int | None = None) -> dict:
    if seq is None:
        if status == "failed":
            seq = _SEQ_FAILED
        else:
            seq = stage_index * 10 + _KIND.get(status, 0)
    return {
        "request_id": os.environ.get("EVAL_REQUEST_ID", ""),
        "workflow_run_id": int(os.environ.get("GITHUB_RUN_ID") or 0) or None,
        "run_attempt": int(os.environ.get("GITHUB_RUN_ATTEMPT") or 1),
        "seq": seq,
        "stage_index": stage_index,
        "stage_total": STAGE_TOTAL,
        "status": status,
        "message": message[:200],
    }


def report_progress(stage_index: int, status: str, message: str, seq: int | None = None) -> bool:
    """上报某阶段进度。status: running / completed / failed。"""
    return _post("/internal/progress", _base_payload(stage_index, status, message, seq))


def report_failure(stage_index: int, message: str) -> bool:
    """上报失败（终态）。"""
    return report_progress(stage_index, "failed", message)


def finalize_report(report_id: str, report_url: str, status: str = "completed", message: str = "") -> bool:
    """报告发布 + Pages 部署完成后的终态回调（需报告 URL 真实可访问）。"""
    payload = {
        "request_id": os.environ.get("EVAL_REQUEST_ID", ""),
        "workflow_run_id": int(os.environ.get("GITHUB_RUN_ID") or 0) or None,
        "run_attempt": int(os.environ.get("GITHUB_RUN_ATTEMPT") or 1),
        "report_id": report_id,
        "report_url": report_url,
        "status": status,
        "message": (message or ("评测完成，报告已发布" if status == "completed" else "报告发布失败"))[:200],
    }
    return _post("/internal/finalize", payload)


def _cli(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    cmd = argv[0]

    def opt(name: str, default: str = "") -> str:
        if name in argv:
            i = argv.index(name)
            if i + 1 < len(argv):
                return argv[i + 1]
        return default

    if cmd == "progress":
        stage = int(opt("--stage", "0"))
        status = opt("--status", "running")
        message = opt("--message", "")
        report_progress(stage, status, message)
    elif cmd == "fail":
        stage = int(opt("--stage", "8"))
        message = opt("--message", "评测失败")
        report_failure(stage, message)
    elif cmd == "finalize":
        report_id = opt("--report-id", "")
        report_url = opt("--report-url", "")
        status = opt("--status", "completed")
        message = opt("--message", "")
        if not report_id or not report_url:
            print("finalize 需要 --report-id 与 --report-url", file=sys.stderr)
            return 1
        finalize_report(report_id, report_url, status, message)
    else:
        print(f"未知子命令: {cmd}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
