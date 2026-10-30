#!/usr/bin/env python3
"""Private Linux development-host controls; standard library only, no secret output."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SECRET_NAMES = ("db_password", "pg_admin_password", "hmac_key", "data_key", "server_secret")
INIT_SHA256 = "c7d3831b5c59ab0a65df64d88289ac3927a024078b853585a2e222fbe9a38206"


class HostError(Exception):
    pass


def checked_path(value):
    path = Path(value).expanduser()
    if ".." in path.parts:
        raise HostError("Parent traversal is not allowed in the state path.")
    path = path.absolute()
    for component in [*reversed(path.parents), path]:
        if component.is_symlink():
            raise HostError("Symlinks are not allowed in the state path.")
    if path == Path(path.anchor) or path == ROOT or ROOT in path.parents or path in ROOT.parents:
        raise HostError("State must be outside the checkout and cannot be a filesystem root.")
    return path


def private_directory(path, create=False):
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink() or not path.is_dir():
        raise HostError("Expected a private regular directory.")
    if os.name == "posix":
        info = path.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise HostError("State directories must belong to this account with mode 0700.")


def validate_secrets(state):
    private_directory(state)
    directory = state / "secrets"
    private_directory(directory)
    if {item.name for item in directory.iterdir()} != set(SECRET_NAMES):
        raise HostError("Incomplete secret set; restore the original set, never regenerate individual keys.")
    for name in SECRET_NAMES:
        path = directory / name
        if path.is_symlink() or not path.is_file():
            raise HostError("Secret entries must be regular files.")
        if os.name == "posix":
            info = path.stat()
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o444:
                raise HostError("Secret files must belong to this account with mode 0444 inside the private directory.")
        try:
            value = path.read_text(encoding="ascii").strip()
            if name in ("hmac_key", "data_key"):
                valid = len(base64.b64decode(value, validate=True)) == 32
            else:
                valid = re.fullmatch(r"[0-9a-f]{64}", value) is not None
        except (ValueError, UnicodeError):
            valid = False
        if not valid:
            raise HostError("Invalid existing secret; restore the original set without rotation.")


def prepare(value):
    state = checked_path(value)
    private_directory(state, create=True)
    if (state / "secrets").exists() or (state / "secrets").is_symlink():
        validate_secrets(state)
        prepare_bootstrap(state)
        return state
    if any(state.iterdir()):
        raise HostError("Refusing to initialize a nonempty state directory without its original secrets.")
    # Publish the complete set as one directory; an interruption never publishes a partial key set.
    staging = Path(tempfile.mkdtemp(prefix=".prepare-", dir=state))
    try:
        for name in SECRET_NAMES:
            value = base64.b64encode(secrets.token_bytes(32)).decode("ascii") if name in ("hmac_key", "data_key") else secrets.token_hex(32)
            with (staging / name).open("x", encoding="ascii") as output:
                output.write(value + "\n")
                output.flush()
                os.fsync(output.fileno())
            (staging / name).chmod(0o444)
        sync_directory(staging)
        staging.rename(state / "secrets")
        sync_directory(state)
    finally:
        if staging.exists():
            for path in staging.iterdir():
                path.chmod(0o600)
                path.unlink()
            staging.rmdir()
    validate_secrets(state)
    prepare_bootstrap(state)
    return state


def sync_directory(path):
    if os.name == "posix":
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def bootstrap_source():
    source = HERE / "init.sql"
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 65536:
        raise HostError("Bootstrap source must be the reviewed regular SQL file.")
    content = source.read_bytes()
    if hashlib.sha256(content).hexdigest() != INIT_SHA256:
        raise HostError("Bootstrap source differs from its reviewed checksum.")
    return content


def validate_bootstrap(state):
    path = state / "init.sql"
    content = bootstrap_source()
    if path.is_symlink() or not path.is_file() or path.stat().st_size != len(content):
        raise HostError("Run prepare to install the reviewed regular bootstrap copy; foreign paths are refused.")
    if path.read_bytes() != content:
        raise HostError("Existing bootstrap differs; preserve it for review rather than overwriting it.")
    if os.name == "posix":
        info = path.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o444:
            raise HostError("Bootstrap copy must belong to this account with mode 0444.")


def prepare_bootstrap(state):
    path = state / "init.sql"
    if path.exists() or path.is_symlink():
        validate_bootstrap(state)
        return
    content = bootstrap_source()
    # Exclusive creation never replaces an existing path. Compose validates complete content before use.
    with path.open("xb") as output:
        output.write(content)
        output.flush()
        path.chmod(0o444)
        os.fsync(output.fileno())
    sync_directory(state)
    validate_bootstrap(state)


def docker_prefix(sudo=False):
    return ["sudo", "--preserve-env=METALLIC_STATE_DIR,METALLIC_DEV_PORT,METALLIC_PROJECT", "--", "docker"] if sudo else ["docker"]


def compose(value, port, sudo=False):
    state = checked_path(value)
    validate_secrets(state)
    validate_bootstrap(state)
    if not 1 <= port <= 65535:
        raise HostError("Port must be between 1 and 65535.")
    project = "metallic-dev-" + hashlib.sha256(os.fsencode(state)).hexdigest()[:12]
    environment = os.environ.copy()
    environment.update(METALLIC_STATE_DIR=str(state), METALLIC_DEV_PORT=str(port), METALLIC_PROJECT=project)
    command = docker_prefix(sudo) + ["compose", "--project-name", project, "--project-directory", str(HERE), "--file", str(HERE / "compose.yaml")]
    return command, environment


def run_compose(state, port, arguments, sudo=False, **kwargs):
    command, environment = compose(state, port, sudo=sudo)
    if sudo:
        # An operator's sudo prompt must remain on their terminal; never read or capture a password.
        kwargs["stderr"] = None
    try:
        return subprocess.run(command + arguments, env=environment, check=True, **kwargs)
    except (subprocess.CalledProcessError, OSError) as error:
        # Do not echo Docker diagnostics that could include rendered configuration or credentials.
        raise HostError("Docker command failed; inspect this project's state locally without sharing secret output.") from error


def backup_path(state, name):
    state = checked_path(state)
    validate_secrets(state)
    validate_bootstrap(state)
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,100}\.dump", name) is None:
        raise HostError("Backup name must be a plain ASCII .dump filename.")
    directory = state / "backups"
    private_directory(directory, create=True)
    path = directory / name
    if path.is_symlink():
        raise HostError("Backup symlinks are not allowed.")
    return path


def backup(state, port, name, sudo=False):
    path = backup_path(state, name)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            run_compose(state, port, ["exec", "-T", "db", "pg_dump", "--username=postgres", "--dbname=metallic", "--format=custom", "--no-owner"], sudo=sudo, stdout=output, stderr=subprocess.PIPE)
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        path.unlink()
        raise


def restore(state, port, name, sudo=False):
    path = backup_path(state, name)
    if not path.is_file():
        raise HostError("Backup is not a regular local file.")
    active = run_compose(state, port, ["ps", "--status", "running", "--services"], sudo=sudo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if "api" in active.stdout.decode("ascii").split():
        raise HostError("Stop the API before restoring.")
    query = (
        "SELECT (SELECT count(*) FROM pg_catalog.pg_namespace "
        "WHERE NOT starts_with(nspname,'pg_') AND nspname NOT IN ('public','information_schema')) "
        "+ (SELECT count(*) FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_namespace n ON n.oid=d.refobjid "
        "WHERE d.refclassid='pg_catalog.pg_namespace'::regclass AND n.nspname='public')"
    )
    empty = run_compose(state, port, ["exec", "-T", "db", "psql", "--username=postgres", "--dbname=metallic", "-Atc", query], sudo=sudo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if empty.stdout.strip() != b"0":
        raise HostError("Restore requires an empty database; existing data will not be overwritten.")
    with path.open("rb") as source:
        run_compose(state, port, ["exec", "-T", "db", "pg_restore", "--username=postgres", "--dbname=metallic", "--role=metallic", "--no-owner", "--exit-on-error", "--single-transaction"], sudo=sudo, stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def probe(state, port):
    compose(state, port)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/readyz", timeout=3) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    raise HostError("API readiness did not succeed within 60 seconds.")


def require_engine(state, port, sudo=False):
    _, environment = compose(state, port)
    try:
        result = subprocess.run(docker_prefix(sudo) + ["version", "--format", "{{.Server.Version}}"], env=environment, check=True, stdout=subprocess.PIPE, stderr=None if sudo else subprocess.PIPE)
        major = int(result.stdout.decode("ascii").strip().split(".")[0])
    except (OSError, subprocess.CalledProcessError, ValueError, UnicodeError) as error:
        raise HostError("Cannot verify the running Docker Engine version.") from error
    if major < 28:
        raise HostError("Docker Engine 28 or later is required for localhost-only port publishing.")


def launch(state, port, sudo=False):
    # Launch is explicit; preparation/config alone never starts Docker or migrates a database.
    require_engine(state, port, sudo=sudo)
    for arguments in (["build", "api"], ["up", "--detach", "--wait", "db"], ["--profile", "tools", "run", "--rm", "migrate"], ["up", "--detach", "--no-build", "api"]):
        run_compose(state, port, arguments, sudo=sudo, stderr=None if arguments[0] == "build" else subprocess.PIPE)
    probe(state, port)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "config", "launch", "build", "database", "migrate", "start", "stop", "status", "probe", "backup", "restore"])
    parser.add_argument("--state-dir", type=Path, default=Path.home() / ".local/share/metallic-dev-host")
    parser.add_argument("--port", type=int, default=18080)
    parser.add_argument("--backup", help="Plain .dump filename inside this state's private backups directory")
    parser.add_argument("--sudo-docker", action="store_true", help="Let sudo prompt locally for Docker only; run this Python helper as the ordinary account")
    args = parser.parse_args()
    if os.name != "posix":
        parser.error("Host controls require Linux; unit tests can run separately on Windows.")
    try:
        state = checked_path(args.state_dir)
        if args.action == "prepare":
            prepare(state)
        elif args.action == "probe":
            probe(state, args.port)
        elif args.action == "launch":
            launch(state, args.port, sudo=args.sudo_docker)
        elif args.action == "backup":
            name = args.backup or datetime.now(timezone.utc).strftime("backup-%Y%m%dT%H%M%SZ-") + secrets.token_hex(4) + ".dump"
            backup(state, args.port, name, sudo=args.sudo_docker)
            print("Backup saved in the selected private backups directory: " + name)
        elif args.action == "restore":
            if not args.backup:
                raise HostError("Restore requires an explicit --backup filename and an empty database.")
            restore(state, args.port, args.backup, sudo=args.sudo_docker)
        else:
            commands = {
                "config": ["config", "--quiet"],
                "build": ["build", "api"],
                "database": ["up", "--detach", "--wait", "db"],
                "migrate": ["--profile", "tools", "run", "--rm", "migrate"],
                "start": ["up", "--detach", "--no-build", "api"],
                "stop": ["stop"],
                "status": ["ps", "--all"],
            }
            if args.action == "start":
                require_engine(state, args.port, sudo=args.sudo_docker)
            run_compose(state, args.port, commands[args.action], sudo=args.sudo_docker, stdout=subprocess.DEVNULL if args.action == "config" else None, stderr=None if args.action == "build" else subprocess.PIPE)
        print("Completed private development-host action: " + args.action)
        return 0
    except (HostError, OSError) as error:
        print("Private development-host action failed: " + (str(error) if isinstance(error, HostError) else "local filesystem operation failed"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
