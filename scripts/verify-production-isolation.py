from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def supabase_request(
    base_url: str,
    path: str,
    key: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
) -> tuple[int, dict]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read().decode("utf-8")
            return response.status, json.loads(data) if data else {}
    except urllib.error.HTTPError as exc:
        data = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(data)
        except json.JSONDecodeError:
            detail = {"message": data[:300]}
        return exc.code, detail


def vercel_curl(
    deployment: str,
    path: str,
    *,
    method: str = "GET",
    token_file: Path | None = None,
    json_payload: dict | None = None,
    upload_file: Path | None = None,
) -> tuple[int, dict | list | str]:
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx is None:
        raise RuntimeError("npx executable was not found")
    command = [
        npx,
        "--yes",
        "vercel@59.5.0",
        "curl",
        path,
        "--deployment",
        deployment,
        "--scope",
        "lizhuofan-currys-projects",
        "--",
        "--silent",
        "--show-error",
        "--request",
        method,
    ]
    if token_file is not None:
        command.extend(["--header", f"@{token_file}"])
    if json_payload is not None:
        command.extend(
            [
                "--header",
                "Content-Type: application/json",
                "--data",
                json.dumps(json_payload, ensure_ascii=False),
            ]
        )
    if upload_file is not None:
        command.extend(
            [
                "--form",
                f"file=@{upload_file};type=text/markdown",
            ]
        )
    command.append("--write-out=__WENQU_STATUS__%{http_code}")
    result = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    if result.returncode != 0:
        safe_stderr = re.sub(
            r"(?i)\bBearer\s+\S+",
            "Bearer [REDACTED]",
            result.stderr,
        )
        raise RuntimeError(
            "Vercel request failed before an HTTP response was returned. "
            f"stderr tail: {safe_stderr[-800:]}"
        )
    response_body, status_text = result.stdout.rsplit("__WENQU_STATUS__", 1)
    status = int(status_text.strip())
    try:
        parsed: dict | list | str = json.loads(response_body)
    except json.JSONDecodeError:
        parsed = response_body[:500]
    return status, parsed


def expect_status(actual: int, expected: int, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {actual}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create disposable users and verify uploaded-material ownership isolation."
    )
    parser.add_argument("--deployment", required=True)
    parser.add_argument("--allow-production-writes", action="store_true")
    args = parser.parse_args()
    if not args.allow_production_writes:
        parser.error("refusing to create test users without --allow-production-writes")

    env = load_env(ROOT / ".env.local")
    supabase_url = env["SUPABASE_URL"]
    service_key = env["SUPABASE_SERVICE_ROLE_KEY"]
    public_key = env.get("SUPABASE_PUBLISHABLE_KEY") or env["SUPABASE_ANON_KEY"]
    marker = f"{int(time.time())}-{secrets.token_hex(3)}"
    password = f"Codex-{secrets.token_urlsafe(24)}-aA1!"
    users: list[str] = []
    material_id: str | None = None

    with tempfile.TemporaryDirectory(prefix="wenqu-isolation-") as temp_dir:
        temp = Path(temp_dir)
        token_files = [temp / "a.headers", temp / "b.headers"]
        material_file = temp / "isolation-check.md"
        material_file.write_text(
            "# 隔离检查\n\n这是一份短期测试材料，只用于验证账号之间的材料所有权隔离。",
            encoding="utf-8",
        )
        try:
            access_tokens: list[str] = []
            for label in ("a", "b"):
                email = f"codex-wenqu-{label}-{marker}@example.invalid"
                status, created = supabase_request(
                    supabase_url,
                    "/auth/v1/admin/users",
                    service_key,
                    method="POST",
                    payload={
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "user_metadata": {"display_name": f"Codex isolation {label.upper()}"},
                    },
                )
                expect_status(status, 200, f"create temporary user {label.upper()}")
                users.append(str(created["id"]))
                status, signed_in = supabase_request(
                    supabase_url,
                    "/auth/v1/token?grant_type=password",
                    public_key,
                    method="POST",
                    payload={"email": email, "password": password},
                )
                expect_status(status, 200, f"sign in temporary user {label.upper()}")
                access_tokens.append(str(signed_in["access_token"]))

            for token_file, token in zip(token_files, access_tokens):
                token_file.write_text(f"Authorization: Bearer {token}\n", encoding="utf-8")

            status, uploaded = vercel_curl(
                args.deployment,
                "/api/materials/upload",
                method="POST",
                token_file=token_files[0],
                upload_file=material_file,
            )
            expect_status(status, 201, "user A upload")
            if not isinstance(uploaded, dict) or not uploaded.get("id"):
                raise AssertionError("upload response did not contain a material id")
            material_id = str(uploaded["id"])

            status, owner_list = vercel_curl(
                args.deployment, "/api/materials", token_file=token_files[0]
            )
            expect_status(status, 200, "user A list")
            status, other_list = vercel_curl(
                args.deployment, "/api/materials", token_file=token_files[1]
            )
            expect_status(status, 200, "user B list")
            owner_ids = {row.get("id") for row in owner_list if isinstance(row, dict)}
            other_ids = {row.get("id") for row in other_list if isinstance(row, dict)}
            if material_id not in owner_ids or material_id in other_ids:
                raise AssertionError("material list ownership isolation failed")

            status, _ = vercel_curl(
                args.deployment,
                f"/api/materials/{material_id}",
                token_file=token_files[0],
            )
            expect_status(status, 200, "user A material detail")
            status, owner_session = vercel_curl(
                args.deployment,
                "/api/sessions",
                method="POST",
                token_file=token_files[0],
                json_payload={"material_id": material_id, "persona_id": "huangfeng"},
            )
            expect_status(status, 201, "user A create session")
            if not isinstance(owner_session, dict) or not owner_session.get("id"):
                raise AssertionError("session response did not contain an id")

            checks = [
                ("GET", f"/api/materials/{material_id}", None),
                ("DELETE", f"/api/materials/{material_id}", None),
                ("POST", f"/api/materials/{material_id}/regenerate", None),
                (
                    "POST",
                    "/api/sessions",
                    {"material_id": material_id, "persona_id": "huangfeng"},
                ),
                (
                    "POST",
                    f"/api/sessions/{owner_session['id']}/evaluate",
                    {
                        "answers": [
                            {"question_id": f"q{i}", "response": "隔离测试回答"}
                            for i in range(1, 4)
                        ],
                        "retelling": "这是一段只用于验证账号隔离的临时复述内容。",
                        "material_id": material_id,
                        "persona_id": "huangfeng",
                    },
                ),
            ]
            for method, path, payload in checks:
                status, _ = vercel_curl(
                    args.deployment,
                    path,
                    method=method,
                    token_file=token_files[1],
                    json_payload=payload,
                )
                expect_status(status, 404, f"user B denied {method} {path}")

            status, _ = vercel_curl(
                args.deployment,
                f"/api/materials/{material_id}",
                method="DELETE",
                token_file=token_files[0],
            )
            expect_status(status, 200, "user A cleanup material")
            material_id = None
            print("ISOLATION_CHECK_OK: disposable A/B users were isolated and cleanup succeeded")
            return 0
        finally:
            if material_id and token_files[0].exists():
                try:
                    vercel_curl(
                        args.deployment,
                        f"/api/materials/{material_id}",
                        method="DELETE",
                        token_file=token_files[0],
                    )
                except Exception:
                    pass
            cleanup_errors = []
            for user_id in reversed(users):
                status, _ = supabase_request(
                    supabase_url,
                    f"/auth/v1/admin/users/{user_id}",
                    service_key,
                    method="DELETE",
                )
                if status not in (200, 204):
                    cleanup_errors.append(status)
            if cleanup_errors:
                raise RuntimeError("temporary user cleanup failed")


if __name__ == "__main__":
    raise SystemExit(main())
