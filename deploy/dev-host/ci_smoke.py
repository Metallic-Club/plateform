#!/usr/bin/env python3
"""Ephemeral CI-only Docker smoke; cleanup removes only the explicitly selected project's volumes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import secrets
import subprocess
import tempfile
import time
import urllib.request

import host


def capture(state, arguments):
    return host.run_compose(state, 18080, arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def require_ci(state):
    runner = os.environ.get("RUNNER_TEMP")
    if os.environ.get("GITHUB_ACTIONS") != "true" or not runner:
        raise host.HostError("The ephemeral smoke/volume cleanup is restricted to GitHub Actions.")
    runner = host.checked_path(runner)
    state = host.checked_path(state)
    if runner not in state.parents:
        raise host.HostError("Ephemeral CI state must be strictly inside RUNNER_TEMP.")


def cleanup(state):
    require_ci(state)
    if (state / "secrets").is_dir():
        capture(state, ["--profile", "tools", "down", "--volumes", "--remove-orphans"])


def ready(port=18080):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/readyz", timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(1)
    raise RuntimeError("API did not become ready within 60 seconds.")


def sql(state, statement):
    return capture(state, ["exec", "-T", "db", "psql", "--username=postgres", "--dbname=metallic", "-Atc", statement]).strip()


def request(port, path, body=None, cookie=None):
    headers = {"Origin": "http://localhost:3000"}
    if cookie:
        headers["Cookie"] = cookie
    data = None if body is None else json.dumps(body).encode("utf8")
    if data is not None:
        headers["Content-Type"] = "application/json"
    query = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, headers=headers)
    with urllib.request.urlopen(query, timeout=10) as response:
        return json.load(response), response.headers.get("Set-Cookie", "").split(";", 1)[0]


def smoke(state):
    require_ci(state)
    host.require_engine(state, 18080)
    model = json.loads(capture(state, ["config", "--format", "json"]))
    api, database = model["services"]["api"], model["services"]["db"]
    assert not database.get("ports"), "Database must not publish ports"
    assert database["healthcheck"]["test"] == ["CMD", "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres"]
    assert api["ports"][0]["host_ip"] == "127.0.0.1"
    assert len(api["ports"]) == 1 and int(api["ports"][0]["target"]) == 8080
    for service in (api, database):
        assert float(service["cpus"]) == 2 and service["mem_limit"] == 2147483648
        assert service["pids_limit"] == 256
        assert service["logging"]["options"] == {"max-size": "10m", "max-file": "3"}
    assert api["read_only"] and api["user"] == "10001:10001"
    assert any(mount["target"] == "/var/lib/postgresql" for mount in database["volumes"])
    ready()
    for service in ("api", "db"):
        container = capture(state, ["ps", "--quiet", service]).decode("ascii").strip()
        # Inspect selected networking data only, never complete container configuration or environment.
        ports = json.loads(subprocess.check_output(["docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", container]))
        if service == "db":
            assert not ports
        else:
            assert ports == {"8080/tcp": [{"HostIp": "127.0.0.1", "HostPort": "18080"}]}
    assert capture(state, ["exec", "-T", "api", "id", "-u"]).strip() == b"10001"
    assert sql(state, "SHOW fsync; SHOW synchronous_commit; SHOW full_page_writes") == b"on\non\non"
    assert sql(state, "SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='metallic'") == b"f"
    password = "ci-" + secrets.token_hex(32)
    _, cookie = request(18080, "/v1/auth/signup", {"username": "host_smoke", "email": "host-smoke@example.com", "birthDate": "1990-01-01", "acceptTerms": True, "password": password})
    original_me, _ = request(18080, "/v1/users/me", cookie=cookie)
    assert original_me["emailMasked"] != "***", "Encrypted synthetic email must decrypt before backup"
    sql(state, "CREATE TABLE public.host_smoke(id integer PRIMARY KEY); INSERT INTO public.host_smoke VALUES (42)")
    fingerprints = {p.name: hashlib.sha256(p.read_bytes()).digest() for p in (state / "secrets").iterdir()}
    capture(state, ["restart", "db", "api"])
    ready()
    assert sql(state, "SELECT id FROM public.host_smoke") == b"42"
    host.prepare(state)
    assert fingerprints == {p.name: hashlib.sha256(p.read_bytes()).digest() for p in (state / "secrets").iterdir()}
    host.backup(state, 18080, "smoke.dump")
    # Restore into a different private project with retained keys, never into the original populated database.
    with tempfile.TemporaryDirectory(prefix="metallic-restore-", dir=state.parent) as directory:
        restored = Path(directory)
        shutil.copytree(state / "secrets", restored / "secrets")
        host.prepare(restored)
        assert fingerprints == {p.name: hashlib.sha256(p.read_bytes()).digest() for p in (restored / "secrets").iterdir()}
        private_backups = restored / "backups"
        private_backups.mkdir(mode=0o700)
        shutil.copy2(state / "backups/smoke.dump", private_backups / "smoke.dump")
        try:
            capture(restored, ["up", "--detach", "--wait", "db"])
            host.restore(restored, 18080, "smoke.dump")
            assert sql(restored, "SELECT id FROM public.host_smoke") == b"42"
            restored_model = json.loads(capture(restored, ["config", "--format", "json"]))
            subprocess.run(["docker", "image", "tag", api["image"], restored_model["services"]["api"]["image"]], check=True)
            host.run_compose(restored, 18081, ["up", "--detach", "--no-build", "api"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            ready(18081)
            _, restored_cookie = request(18081, "/v1/auth/login", {"login": "host-smoke@example.com", "password": password})
            recovered_me, _ = request(18081, "/v1/users/me", cookie=restored_cookie)
            assert recovered_me["id"] == original_me["id"]
            assert recovered_me["emailMasked"] == original_me["emailMasked"], "Retained data key must decrypt restored synthetic email"
        finally:
            cleanup(restored)
    print("Private-development Docker smoke passed: isolation, caps, identity, durability, stable keys and encrypted-data restore.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["run", "cleanup"])
    parser.add_argument("--state-dir", type=Path, required=True)
    args = parser.parse_args()
    state = host.checked_path(args.state_dir)
    if args.action == "cleanup":
        cleanup(state)
    else:
        smoke(state)
