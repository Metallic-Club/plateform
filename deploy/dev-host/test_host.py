"""Host preparation tests use temporary directories and never call Docker."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("dev_host", Path(__file__).with_name("host.py"))
host = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name)
        self.state = self.parent / "private state with spaces"

    def test_repeat_preparation_keeps_every_secret_byte(self):
        host.prepare(self.state)
        before = {p.name: p.read_bytes() for p in (self.state / "secrets").iterdir()}
        self.assertEqual(set(before), set(host.SECRET_NAMES))
        host.prepare(self.state)
        self.assertEqual(before, {p.name: p.read_bytes() for p in (self.state / "secrets").iterdir()})
        if os.name == "posix":
            self.assertEqual(self.state.stat().st_mode & 0o777, 0o700)
            self.assertEqual((self.state / "secrets").stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o444 for p in (self.state / "secrets").iterdir()))

    def test_partial_or_corrupt_secrets_are_not_replaced(self):
        host.prepare(self.state)
        existing = self.state / "secrets" / "hmac_key"
        existing.chmod(0o600)
        existing.write_text("broken", encoding="ascii")
        existing.chmod(0o444)
        with self.assertRaises(host.HostError):
            host.prepare(self.state)
        self.assertEqual(existing.read_text(encoding="ascii"), "broken")

    def test_missing_secret_is_not_regenerated(self):
        host.prepare(self.state)
        missing = self.state / "secrets" / "data_key"
        missing.chmod(0o600)
        missing.unlink()
        with self.assertRaises(host.HostError):
            host.prepare(self.state)
        self.assertFalse(missing.exists())

    def test_state_inside_checkout_or_root_or_parent_traversal_is_rejected(self):
        for path in [host.ROOT / "private", Path(self.state.anchor), self.parent / ".." / "unsafe"]:
            with self.subTest(path=path), self.assertRaises(host.HostError):
                host.prepare(path)

    def test_foreign_directory_is_not_changed(self):
        self.state.mkdir(mode=0o700)
        foreign = self.state / "unrelated"
        foreign.write_text("retain", encoding="ascii")
        with self.assertRaises(host.HostError):
            host.prepare(self.state)
        self.assertEqual(foreign.read_text(encoding="ascii"), "retain")

    @unittest.skipUnless(os.name == "posix", "POSIX symlink and permission contract")
    def test_symlink_components_and_secret_files_are_rejected(self):
        target = self.parent / "target"
        target.mkdir(mode=0o700)
        self.state.symlink_to(target, target_is_directory=True)
        with self.assertRaises(host.HostError):
            host.prepare(self.state / "child")
        self.state.unlink()
        host.prepare(self.state)
        secret = self.state / "secrets" / "data_key"
        secret.unlink()
        secret.symlink_to(target / "missing")
        with self.assertRaises(host.HostError):
            host.prepare(self.state)

    @unittest.skipUnless(os.name == "posix", "POSIX permission contract")
    def test_public_state_directory_is_rejected_without_chmod(self):
        self.state.mkdir(mode=0o755)
        with self.assertRaises(host.HostError):
            host.prepare(self.state)
        self.assertEqual(self.state.stat().st_mode & 0o777, 0o755)

    def test_compose_uses_fixed_file_project_and_no_secret_values(self):
        host.prepare(self.state)
        command, environment = host.compose(self.state, 18080)
        self.assertEqual(command[:2], ["docker", "compose"])
        self.assertIn(str(host.HERE / "compose.yaml"), command)
        self.assertIn("--project-name", command)
        for secret in (self.state / "secrets").iterdir():
            value = secret.read_text(encoding="ascii").strip()
            self.assertNotIn(value, " ".join(command))
            self.assertNotIn(value, str(environment))
        self.assertEqual(environment["METALLIC_DEV_PORT"], "18080")
        self.assertEqual(host.compose(self.state, 18081)[0], command)

    def test_invalid_ports_and_backup_paths_are_rejected(self):
        host.prepare(self.state)
        for port in [0, -1, 65536]:
            with self.assertRaises(host.HostError):
                host.compose(self.state, port)
        for name in ["../outside.dump", "/absolute.dump", "bad name.dump", "a;command.dump"]:
            with self.assertRaises(host.HostError):
                host.backup_path(self.state, name)

    def test_backup_and_restore_do_not_mutate_foreign_or_incomplete_state(self):
        self.state.mkdir(mode=0o700)
        foreign = self.state / "retain"
        foreign.write_text("unchanged", encoding="ascii")
        for operation in (host.backup, host.restore):
            with self.assertRaises(host.HostError):
                operation(self.state, 18080, "fixture.dump")
            self.assertEqual({p.name for p in self.state.iterdir()}, {"retain"})
        self.assertEqual(foreign.read_text(encoding="ascii"), "unchanged")

    def test_sudo_prefix_preserves_only_nonsecret_compose_variables(self):
        host.prepare(self.state)
        command, _ = host.compose(self.state, 18080, sudo=True)
        self.assertEqual(command[:4], ["sudo", "--preserve-env=METALLIC_STATE_DIR,METALLIC_DEV_PORT,METALLIC_PROJECT", "--", "docker"])
        self.assertNotIn("-S", command)
        self.assertNotIn("--preserve-env", command)

    def test_command_failure_does_not_print_captured_stderr(self):
        host.prepare(self.state)
        with patch.object(subprocess, "run", side_effect=subprocess.CalledProcessError(1, ["docker"], stderr=b"secret-fixture")):
            with self.assertRaisesRegex(host.HostError, "Docker command failed") as error:
                host.run_compose(self.state, 18080, ["config", "--quiet"])
        self.assertNotIn("secret-fixture", str(error.exception))

    def test_failed_backup_removes_only_its_new_partial_file(self):
        host.prepare(self.state)
        previous = host.backup_path(self.state, "previous.dump")
        previous.write_bytes(b"retained backup")
        with patch.object(host, "run_compose", side_effect=host.HostError("fixture failure")):
            with self.assertRaises(host.HostError):
                host.backup(self.state, 18080, "new.dump")
        self.assertEqual(previous.read_bytes(), b"retained backup")
        self.assertFalse(previous.with_name("new.dump").exists())
        with self.assertRaises(FileExistsError):
            host.backup(self.state, 18080, "previous.dump")

    def test_restore_refuses_running_api_and_nonempty_database(self):
        host.prepare(self.state)
        archive = host.backup_path(self.state, "fixture.dump")
        archive.write_bytes(b"fixture archive")
        running = subprocess.CompletedProcess([], 0, stdout=b"api\ndb\n")
        stopped = subprocess.CompletedProcess([], 0, stdout=b"db\n")
        nonempty = subprocess.CompletedProcess([], 0, stdout=b"7\n")
        with patch.object(host, "run_compose", return_value=running) as execute:
            with self.assertRaisesRegex(host.HostError, "Stop the API"):
                host.restore(self.state, 18080, "fixture.dump")
            self.assertEqual(execute.call_count, 1)
        with patch.object(host, "run_compose", side_effect=[stopped, nonempty]) as execute:
            with self.assertRaisesRegex(host.HostError, "empty database"):
                host.restore(self.state, 18080, "fixture.dump")
            self.assertEqual(execute.call_count, 2)
        self.assertEqual(archive.read_bytes(), b"fixture archive")

    def test_restore_streams_archive_in_one_transaction_without_clean_or_drop(self):
        host.prepare(self.state)
        archive = host.backup_path(self.state, "fixture.dump")
        archive.write_bytes(b"fixture archive")
        stopped = subprocess.CompletedProcess([], 0, stdout=b"db\n")
        empty = subprocess.CompletedProcess([], 0, stdout=b"0\n")
        with patch.object(host, "run_compose", side_effect=[stopped, empty, None]) as execute:
            host.restore(self.state, 18080, "fixture.dump")
            arguments = execute.call_args.args[2]
            self.assertIn("--single-transaction", arguments)
            self.assertIn("--exit-on-error", arguments)
            self.assertIn("--role=metallic", arguments)
            self.assertNotIn("--clean", arguments)
            self.assertNotIn("--create", arguments)

    def test_sudo_prompt_is_not_captured_and_launch_stops_at_failed_step(self):
        host.prepare(self.state)
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as execute:
            host.run_compose(self.state, 18080, ["ps"], sudo=True, stderr=subprocess.PIPE)
            self.assertIsNone(execute.call_args.kwargs["stderr"])
            self.assertNotIn("input", execute.call_args.kwargs)
        with patch.object(host, "require_engine"), patch.object(host, "run_compose", side_effect=[None, host.HostError("fixture failure")]) as execute, patch.object(host, "probe") as probe:
            with self.assertRaises(host.HostError):
                host.launch(self.state, 18080, sudo=True)
            self.assertEqual(execute.call_count, 2)
            probe.assert_not_called()

    def test_launch_orders_build_database_migration_start_then_readiness(self):
        host.prepare(self.state)
        observed = []
        with patch.object(host, "require_engine"), patch.object(host, "run_compose", side_effect=lambda *args, **kwargs: observed.append(args[2])), patch.object(host, "probe", side_effect=lambda *args: observed.append(["probe"])):
            host.launch(self.state, 18080)
        self.assertEqual([command[0] for command in observed], ["build", "up", "--profile", "up", "probe"])
        self.assertEqual(observed[2][-1], "migrate")
        self.assertEqual(observed[3][-1], "api")

    def test_running_engine_version_must_support_localhost_isolation(self):
        host.prepare(self.state)
        for version in [b"27.5.1\n", b"", b"not-a-version"]:
            with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout=version)), self.assertRaises(host.HostError):
                host.require_engine(self.state, 18080)
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout=b"28.0.4\n")):
            host.require_engine(self.state, 18080)


if __name__ == "__main__":
    unittest.main()
