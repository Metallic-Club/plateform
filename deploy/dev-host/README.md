# Private development host

This bundle hosts one canonical P1 development API and its database on Linux/amd64. It uses the development mailer
and the literal development captcha token. It is for private testing through a local connection or SSH tunnel.
It is not a production service, a website, a multiplayer game server or a game-process allocator. Do not put real
accounts or personal data here. Canonical source base: `653a42241f29e9949f272e60fedd52a76870dc09`; pending connection,
refresh-family, Unicode-password and handoff-expiry PR implementations are excluded.

## Prerequisites and boundaries

- Linux/amd64, Python 3.10+, Docker Engine 28+ and Compose 2.34+. Use the ordinary account that owns the checkout/state.
- Docker access is administrator access. An operator may use `--sudo-docker` to prompt locally for Docker commands
  only; do not run the whole Python helper under sudo or send an assistant a password. No persistent group change
  or passwordless sudo rule is required by this bundle. Site-specific sudo policy can still deny this command.
- The default host API socket is `127.0.0.1:18080`. PostgreSQL publishes no host port. Do not add a public proxy,
  public firewall rule or non-loopback mapping to this development bundle. Internal API routes must stay private.
  Launch/start verify the running daemon's version before publishing the API: older Docker releases could expose
  localhost-published ports to other machines on the same layer-2 network. An installed client version is insufficient.
- The API and database each have limits of two CPUs, 2 GiB memory/no extra swap and 256 PIDs. Logs rotate at 10 MiB with
  three files per container. The API runs as UID/GID 10001 with all capabilities dropped, a read-only root filesystem
  and 64 MiB temporary storage. These are initial development limits, not measured capacity claims. Build uses four
  Cargo jobs; runtime limits do not constrain Docker's image builder. Check host headroom before building.
- Rate limits/presence are in memory; run one API. Startup outside `dev` is refused by canonical source until real
  mail/captcha providers exist. No production restriction is bypassed here.

## Prepare and review before an administrator starts anything

Run from the checkout root as its ordinary account. The default private state is under that account's
`~/.local/share/metallic-dev-host`, outside the checkout. The helper never prints keys or renders secret values in
Compose configuration. `config` is daemon-free and quiet; it does not pull, build, start, migrate or install anything.

```sh
python3 deploy/dev-host/host.py prepare
python3 deploy/dev-host/host.py config
python3 -I -m unittest discover -s deploy/dev-host -p test_host.py -v
```

To choose another writable location, pass the same absolute `--state-dir` on every command. Spaces are supported;
symlinks, parent traversal, checkout paths, foreign nonempty directories and filesystem roots are refused. The state
directory's absolute path identifies its Compose project and durable volume: do not rename/move it casually.
The helper does not create or change permissions on an administrator's storage directory.

Preparation publishes a complete random secret set atomically. Repeating it validates and preserves every byte.
Missing/corrupt keys cause refusal, never implicit rotation. State/secrets directories are 0700; individual files
are 0444 so the non-root container can read its explicitly granted read-only mounts. Other host accounts cannot
traverse the parent. Compose file-backed secrets use bind mounts; its requested UID/GID/mode fields cannot remap
these file permissions. Docker administrators and host root can read them. The entrypoint loads four files into
the API's process environment because canonical P1 currently supports environment configuration only; this is not
an encrypted secret manager. No secret is a Docker build argument or image/config value.

Preparation also creates a nonsecret 0444 `init.sql` copy beneath the 0700 state directory. PostgreSQL mounts that
individual copy, so its non-root initialization process can read it even when a private checkout keeps source files
at 0600. The source and mounted copy must match the reviewed checksum in `host.py`; symlinks and unknown existing
copies are refused without replacement. Repeating preparation preserves the copy and every secret byte. If a later
review changes the initialization SQL, update its reviewed checksum too; preparation will refuse a stale copy.
The administrator must retain that old file for review and explicitly replace only the bootstrap copy before
preparing again. This does not rerun first-boot scripts on an existing database or rotate keys.

## Explicit launch, migration and lifecycle

After source/configuration review, the administrator can run this single command in their own SSH terminal:

```sh
python3 deploy/dev-host/host.py launch --sudo-docker
```

It builds the pinned image, starts only this project's database, runs the explicit migration container, starts the
API and waits up to 60 seconds for `/v1/readyz`. Sudo prompts stay on the operator's terminal; the helper preserves
only three nonsecret Compose variables through sudo. If the account already has authorized Docker access, omit
the switch. This command is intentionally separate from preparation and configuration; nothing is automatically
seeded or made public. A failed step stops the sequence, retaining state for inspection.

The same actions are available separately:

```sh
python3 deploy/dev-host/host.py build --sudo-docker
python3 deploy/dev-host/host.py database --sudo-docker
python3 deploy/dev-host/host.py migrate --sudo-docker
python3 deploy/dev-host/host.py start --sudo-docker
python3 deploy/dev-host/host.py probe
python3 deploy/dev-host/host.py status --sudo-docker
python3 deploy/dev-host/host.py stop --sudo-docker
```

Stop preserves the database volume, images and keys. No operator command runs `down -v`, deletes a volume or
overwrites another project's data. Containers restart after a daemon/host restart unless explicitly stopped.
The API receives SIGINT for canonical graceful shutdown. Back up before updating source/migrations; stop the old
API before an upgrade and review new image digests/migrations. Do not regenerate keys to solve startup errors.
If PostgreSQL initialization fails, its official first-run scripts do not automatically rerun on a nonempty volume;
inspect and recover with the administrator rather than deleting data or rotating secrets.

For a private connection from another machine, forward a local port through your own saved SSH configuration:

```sh
ssh -N -L 18080:127.0.0.1:18080 <your-ssh-alias>
```

Then readiness is `http://127.0.0.1:18080/v1/readyz`. Use only synthetic development credentials. The web origin is
fixed to `http://localhost:3000` for an optional separately run local web client; the bundle includes no web client.

## Durability, backup and restore

The official PostgreSQL 18 image stores `PGDATA` under `/var/lib/postgresql/18/docker`; the named volume is mounted
at `/var/lib/postgresql`. Default `fsync`, `synchronous_commit` and `full_page_writes` stay on. The local Windows
test-cluster script with `fsync=off` is not used. The application database role owns its database but has no
superuser, role-creation or database-creation privilege; the separate administrator password is not mounted in API.

```sh
python3 deploy/dev-host/host.py backup --sudo-docker --backup review-backup.dump
```

This streams a custom-format logical dump into this state's 0700 `backups` directory with mode 0600. It refuses an
existing filename and removes only its own new partial file if the command fails. It does not back up the cluster's
roles or encryption keys. Preserve the complete original secret set separately through the administrator's encrypted
backup channel. A database dump without its data/HMAC keys is not sufficient to recover encrypted account data.
Backups may contain sensitive data; do not upload them, print them or commit them. A named volume is not a backup.

Restore is deliberately limited to an empty application database with the API stopped. Restore only your own
trusted dump: PostgreSQL archives execute SQL. For a drill, use a different private state path/project and copy the
complete original secret set and selected dump into its protected `secrets`/`backups` directories, retaining their
permissions. Run `prepare` to validate that retained set, then `database` to initialize a separate empty database.
Do not run migrations before restoring a full dump.

```sh
python3 deploy/dev-host/host.py restore --state-dir <separate-private-state> --sudo-docker --backup review-backup.dump
```

The helper verifies this state's complete keys, refuses a running API or populated target, and runs `pg_restore`
with `--single-transaction --exit-on-error --no-owner --role=metallic`. It never uses `--clean`, `--create`, DROP or
volume deletion. Failure rolls the transaction back. The ordinary `start` and `probe` actions can then verify the
restored instance; choose an unused loopback `--port` for a second API. Keep the original deployment unchanged.

## Verification and image maintenance

`test_host.py` tests preparation/idempotency, corrupt/partial-state refusal, path and permission handling, secret
output boundaries, sudo prompting, launch sequencing and non-destructive backup/restore controls without Docker.
The narrow PR workflow builds the actual Linux image, starts an isolated project, checks effective ports/caps and
UID, probes readiness, verifies durable data and stable keys across restart, then exercises dump/restore into a
different empty project. Only this ephemeral CI smoke deletes its explicitly selected projects' volumes. It does
not push an image or deploy a host; its token has only `contents:read` and checkout credentials are not retained.
The smoke and destructive cleanup refuse to run outside GitHub Actions or outside its validated `RUNNER_TEMP`;
they cannot be used as ordinary host lifecycle commands. Helper tests run with both restrictive and usual umasks.
The workflow makes the checkout SQL file 0600 before preparation to exercise the protected bootstrap mount.

Image tags and multi-platform manifest digests were verified through the public Docker registry on 2026-10-30:

| Image | Pinned manifest digest |
|---|---|
| `rust:1.99.1-bookworm` | `sha256:9181b56c2a21ab1d5e73cffe04fc762426d30aa7fac3c91141dd033f49a7fc8b` |
| `debian:bookworm-slim` | `sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3` |
| `postgres:18.6-bookworm` | `sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8` |

Rust builds canonical source with `--release --locked -j4`; runtime contains no compiler or package installation
step. Image/digest updates require review and a fresh smoke run; PostgreSQL major upgrades need a separate data
migration plan. This bundle does not patch arbitrary host packages or configure the host's Docker data root.

Primary sources: [official Rust image tags](https://github.com/docker-library/official-images/blob/master/library/rust),
[official PostgreSQL image, storage and secrets rules](https://github.com/docker-library/docs/blob/master/postgres/README.md),
[Compose secret mounts and file ownership limits](https://docs.docker.com/reference/compose-file/services/#secrets),
[Compose resource/port controls](https://docs.docker.com/reference/compose-file/services/),
[Docker localhost port-publishing version boundary](https://docs.docker.com/engine/network/port-publishing/),
[PostgreSQL durability settings](https://www.postgresql.org/docs/18/runtime-config-wal.html).
