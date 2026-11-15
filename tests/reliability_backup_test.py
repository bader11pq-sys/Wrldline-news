import copy
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import backup_common
from backup_common import SyntheticProgress, forbid_repository_output, metadata_sql, start_container, fingerprints, validate_manifest

AGE_AVAILABLE = shutil.which('age') and shutil.which('age-keygen')
PG_BIN = Path('/usr/lib/postgresql/16/bin')
NATIVE_AVAILABLE = AGE_AVAILABLE and os.geteuid() != 0 and all((PG_BIN / command).is_file() for command in ('initdb', 'pg_ctl', 'psql', 'pg_dump', 'pg_restore'))


def load_script(filename):
    spec = importlib.util.spec_from_file_location(filename.replace('-', '_').replace('.', '_'), ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def valid_manifest():
    return {'format_version': 1, 'kind': 'synthetic_ci_fixture',
            'created_at': '2026-11-15T00:00:00+00:00', 'schemas': ['public', 'private', 'auth', 'storage'],
            'row_counts': {}, 'structure_hashes': {}, 'roles': [], 'extensions': [],
            'public_schema_acl': [['USAGE', False]]}


@contextmanager
def native_synthetic_transport(module):
    """Test ONLY: two native Unix-socket clusters, never an alternate restore CLI target.

    Patch only Docker transport; run real fixture SQL, pg_dump/pg_restore and age.
    This is native database evidence, NOT a full Docker/container drill.
    """
    real_run = subprocess.run
    clusters = {}
    with tempfile.TemporaryDirectory(prefix='wrldline-pg-test-', dir='/tmp') as temporary:
        directory = Path(temporary)
        native_env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}

        def start(name):
            target = directory / str(len(clusters))
            target.mkdir()
            data, sock = target / 'data', target / 'sock'
            sock.mkdir()
            real_run([str(PG_BIN / 'initdb'), '-D', str(data), '-U', 'postgres', '--auth=trust', '--no-locale'],
                     env=native_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=30)
            clusters[name] = (data, sock)
            # Empty listen_addresses means NO TCP listeners. Different socket directories
            # isolate both clusters; no real/provider database URL is ever consumed.
            real_run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-l', str(target / 'server.log'),
                      '-o', f"-k {sock} -c listen_addresses=''", '-w', 'start'],
                     env=native_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=30)

        def stop(name):
            if name in clusters:
                real_run([str(PG_BIN / 'pg_ctl'), '-D', str(clusters[name][0]), '-m', 'immediate', '-w', 'stop'],
                         env=native_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=30)

        def transport(args, **kwargs):
            if args and args[0] == 'docker':
                if args[1] != 'exec':
                    raise AssertionError('Unexpected Docker operation in native synthetic test')
                index = 3 if args[2] == '-i' else 2
                name, command = args[index], args[index + 1:]
                if name not in clusters or command[0] not in ('psql', 'pg_dump', 'pg_restore'):
                    raise AssertionError('Unexpected native synthetic command')
                env = {**native_env, 'PGHOST': str(clusters[name][1]), 'PGUSER': 'postgres', 'PGDATABASE': 'postgres'}
                return real_run([str(PG_BIN / command[0])] + command[1:], env=env,
                                **{key: value for key, value in kwargs.items() if key != 'env'})
            return real_run(args, **kwargs)

        try:
            with patch.object(subprocess, 'run', side_effect=transport), \
                 patch.object(backup_common, 'start_container', side_effect=start), \
                 patch.object(backup_common, 'stop_container', side_effect=stop), \
                 patch.object(module, 'start_container', side_effect=start), \
                 patch.object(module, 'stop_container', side_effect=stop):
                yield
        finally:
            for name in clusters:
                stop(name)


class BackupSafety(unittest.TestCase):
    def encrypted_fixture(self, temporary, members):
        directory = Path(temporary)
        backup_common.run(['age-keygen', '-o', str(directory / 'identity')])
        recipient = backup_common.run(['age-keygen', '-y', str(directory / 'identity')]).decode().strip()
        self.assertTrue(recipient.startswith('age1'))
        with tarfile.open(directory / 'bundle.tar', 'w') as archive:
            for name, content in members.items():
                data = content.encode()
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        backup_common.run(['age', '-r', recipient, '-o', str(directory / 'backup.age'), str(directory / 'bundle.tar')])
        return load_script('restore-drill.py'), directory / 'backup.age', directory / 'identity'

    @unittest.skipUnless(AGE_AVAILABLE, 'age encryption tooling unavailable')
    def test_encrypted_traversal_bundle_rejected_before_container_start(self):
        with tempfile.TemporaryDirectory(prefix='wrldline-bundle-test-') as temporary:
            module, backup, identity = self.encrypted_fixture(temporary, {'../escape': 'fixture'})
            with patch.object(module, 'start_container') as start:
                with self.assertRaisesRegex(ValueError, 'Invalid backup bundle'):
                    module.restore_drill(backup, identity)
                start.assert_not_called()

    @unittest.skipUnless(AGE_AVAILABLE, 'age encryption tooling unavailable')
    def test_duplicate_and_symlink_archive_members_rejected(self):
        for symlink in (False, True):
            with self.subTest(symlink=symlink), tempfile.TemporaryDirectory(prefix='wrldline-members-test-') as temporary:
                module, backup, identity = self.encrypted_fixture(temporary, {'manifest.json': '{}', 'database.dump': 'fixture'})
                directory = Path(temporary)
                with tarfile.open(directory / 'bundle.tar', 'a') as archive:
                    member = tarfile.TarInfo('manifest.json')
                    if symlink:
                        member.type, member.linkname = tarfile.SYMTYPE, '../escape'
                    archive.addfile(member)
                backup.unlink()
                recipient = backup_common.run(['age-keygen', '-y', str(identity)]).decode().strip()
                backup_common.run(['age', '-r', recipient, '-o', str(backup), str(directory / 'bundle.tar')])
                with patch.object(module, 'start_container') as start:
                    with self.assertRaisesRegex(ValueError, 'Invalid backup bundle'):
                        module.restore_drill(backup, identity)
                    start.assert_not_called()

    @unittest.skipUnless(AGE_AVAILABLE, 'age encryption tooling unavailable')
    def test_synthetic_ciphertext_cannot_be_reported_as_real_backup(self):
        with tempfile.TemporaryDirectory(prefix='wrldline-label-test-') as temporary:
            manifest = json.dumps({'format_version': 1, 'kind': 'synthetic_ci_fixture'})
            module, backup, identity = self.encrypted_fixture(temporary, {'manifest.json': manifest, 'database.dump': 'fixture'})
            with patch.object(module, 'start_container') as start:
                with self.assertRaisesRegex(ValueError, 'Synthetic drill'):
                    module.restore_drill(backup, identity, True)
                start.assert_not_called()

    @unittest.skipUnless(AGE_AVAILABLE, 'age encryption tooling unavailable')
    def test_invalid_manifest_rejected_before_target_start(self):
        invalid = valid_manifest()
        invalid['kind'] = 'unrecognized_kind'
        with tempfile.TemporaryDirectory(prefix='wrldline-manifest-test-') as temporary:
            module, backup, identity = self.encrypted_fixture(temporary, {'manifest.json': json.dumps(invalid), 'database.dump': 'fixture'})
            with patch.object(module, 'start_container') as start:
                with self.assertRaisesRegex(ValueError, 'Invalid backup kind'):
                    module.restore_drill(backup, identity)
                start.assert_not_called()

    def test_manifest_rejects_invalid_enums_dates_and_restore_metadata(self):
        validate_manifest(valid_manifest())
        malformed = [
            ('format_version', True), ('kind', 'other'), ('created_at', 'not-a-date'),
            ('created_at', '2026-11-15T00:00:00'), ('schemas', ['untrusted_schema']),
            ('schemas', ['public', 'public']), ('row_counts', {'public.fixture': True}),
            ('row_counts', {'public.fixture': -1}), ('structure_hashes', {'schema:public': 'bad'}),
            ('public_schema_acl', None), ('public_schema_acl', [['SELECT', False]]),
            ('public_schema_acl', [['USAGE', 'false']]),
            ('roles', [{'name': 'postgres', 'bypassrls': False}]),
            ('roles', [{'name': 'anon', 'bypassrls': 'false'}]),
            ('extensions', [{'name': 'fixture', 'schema': 'public', 'version': None}]),
        ]
        for field, value in malformed:
            with self.subTest(field=field, value=value):
                manifest = valid_manifest()
                manifest[field] = value
                with self.assertRaises((ValueError, TypeError)):
                    validate_manifest(manifest)

    def test_production_exports_cannot_enter_repository(self):
        with self.assertRaises(ValueError):
            forbid_repository_output(ROOT / 'docs' / 'backup.age')
        self.assertEqual(forbid_repository_output('/tmp/wrldline-backup.age'), Path('/tmp/wrldline-backup.age'))

    def test_restore_target_never_has_ports_or_network(self):
        with patch('backup_common.run', return_value=b'') as command, patch('backup_common.psql', return_value='1'):
            start_container('wrldline-test')
            args = command.call_args.args[0]
            self.assertEqual(args[args.index('--network') + 1], 'none')
            for forbidden in ('-p', '--publish', '-P', '--publish-all', '--volume', '-v', '--mount'):
                self.assertNotIn(forbidden, args)
            self.assertIn('--rm', args)
            self.assertIn('wrldline.dr=throwaway', args)

    def test_structural_checks_cover_schema_acl_rls_constraints_functions_and_grants(self):
        sql = metadata_sql()
        for item in ['n.nspacl', "'schema:'", 'relrowsecurity', 'relforcerowsecurity', 'pg_policies', 'pg_get_constraintdef', 'pg_get_functiondef', 'aclexplode', 'pg_get_triggerdef']:
            self.assertIn(item, sql)
        self.assertEqual(fingerprints({'fixture': {'b': 2, 'a': 1}}), fingerprints({'fixture': {'a': 1, 'b': 2}}))
        self.assertNotEqual(fingerprints({'schema:public': {'acl': [['PUBLIC', 'USAGE', False]]}}), fingerprints({'schema:public': {'acl': []}}))

    def test_restore_cli_cannot_accept_target_database_url(self):
        source = (ROOT / 'scripts/restore-drill.py').read_text()
        self.assertNotIn('DATABASE_URL', source)
        self.assertNotIn('--database-url', source)
        self.assertIn('--require-real', source)
        self.assertIn('production_restored', source)
        self.assertIn('stop_container(name)', source)
        self.assertNotIn('--no-owner', [line.strip() for line in source.splitlines() if line.strip().startswith('command')])

    def test_dump_uses_consistent_read_only_snapshot_and_age(self):
        source = (ROOT / 'scripts/backup-create.py').read_text()
        for item in ['repeatable read read only', 'pg_export_snapshot', '--snapshot=', 'conn.rollback()', 'age', 'forbid_repository_output']:
            self.assertIn(item, source)
        self.assertNotIn('pg_dumpall', source)

    def test_export_cannot_be_mislabeled_synthetic(self):
        module = load_script('backup-create.py')
        with self.assertRaisesRegex(ValueError, 'production backup label'):
            module.create_backup('/tmp/not-created.age', 'age1fixture', label='synthetic_ci_fixture')

    def test_synthetic_error_output_is_stage_and_allowlisted_class_only(self):
        secret = 'DO-NOT-LOG-DSN-PASSWORD-OR-ROW'
        errors = [subprocess.CalledProcessError(1, [secret], output=secret.encode(), stderr=secret.encode()),
                  ValueError(secret), type(secret, (Exception,), {})(secret)]
        for error in errors:
            with self.subTest(error_type=type(error)), redirect_stdout(io.StringIO()) as output, redirect_stderr(io.StringIO()) as errors_output:
                progress = SyntheticProgress()
                progress.stage('restore_archive')
                progress.failure(error)
                combined = output.getvalue() + errors_output.getvalue()
                self.assertIn('Synthetic DR only: stage=restore_archive', combined)
                self.assertIn('event=failed error_class=', combined)
                self.assertNotIn(secret, combined)
        with self.assertRaises(ValueError):
            SyntheticProgress().stage(secret)

    def test_synthetic_main_returns_failure_without_traceback_or_exception_text(self):
        module = load_script('backup-synthetic-drill.py')
        secret = 'NEVER-PRINT-THIS'
        def fail(progress):
            progress.stage('fixture_migration')
            raise subprocess.CalledProcessError(1, [secret], stderr=secret.encode())
        with patch.object(module, 'drill', side_effect=fail), redirect_stdout(io.StringIO()) as output, redirect_stderr(io.StringIO()) as errors_output:
            self.assertEqual(module.main(), 1)
        self.assertIn('stage=fixture_migration event=failed error_class=CalledProcessError', errors_output.getvalue())
        self.assertNotIn(secret, output.getvalue() + errors_output.getvalue())
        self.assertNotIn('Traceback', errors_output.getvalue())

    @unittest.skipUnless(AGE_AVAILABLE, 'age encryption tooling unavailable')
    def test_restore_full_archive_acl_order_and_comparisons_fail_closed(self):
        for failure in (None, 'counts', 'structure'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory(prefix='wrldline-restore-unit-') as temporary:
                manifest = valid_manifest()
                structure = {'schema:public': {'acl': [['PUBLIC', 'USAGE', False]]}}
                manifest['structure_hashes'] = fingerprints(structure)
                module, backup, identity = self.encrypted_fixture(temporary, {'manifest.json': json.dumps(manifest), 'database.dump': 'fixture'})
                real_run, events = subprocess.run, []
                def command(args, **kwargs):
                    if args[0] == 'docker':
                        events.append(args)
                        return subprocess.CompletedProcess(args, 0, b'', b'')
                    return real_run(args, **kwargs)
                def sql(name, query):
                    events.append(query)
                    if 'private_account_fixture' in query:
                        return '0'
                    if 'count(*) from public.published_news()' in query:
                        return '1'
                    return ''
                metadata = {'structure': copy.deepcopy(structure)}
                if failure == 'structure':
                    metadata['structure']['schema:public']['acl'] = []
                counts = {'public.fixture': 1} if failure == 'counts' else {}
                with patch.object(module, 'start_container'), patch.object(module, 'stop_container') as stop, \
                     patch.object(module, 'psql', side_effect=sql), patch.object(module, 'inspect_local', return_value=(metadata, counts)), \
                     patch.object(subprocess, 'run', side_effect=command):
                    if failure:
                        with self.assertRaisesRegex(ValueError, 'comparison failed'):
                            module.restore_drill(backup, identity)
                    else:
                        self.assertTrue(module.restore_drill(backup, identity)['ok'])
                    stop.assert_called_once()
                commands = [event for event in events if isinstance(event, list)]
                self.assertEqual(len(commands), 1)
                self.assertFalse(any(arg.startswith('--section=') for arg in commands[0]))
                self.assertIn('--clean', commands[0])
                self.assertIn('--if-exists', commands[0])
                self.assertLess(events.index(commands[0]), events.index('revoke all on schema public from public;'))
                self.assertLess(events.index('revoke all on schema public from public;'), events.index('grant USAGE on schema public to public;'))
                for args in commands:
                    self.assertIn('--exit-on-error', args)
                    self.assertNotIn('--no-owner', args)
                    self.assertNotIn('--no-acl', args)
                if failure is None:
                    constraint = next(event for event in events if isinstance(event, str) and 'check_violation' in event)
                    self.assertIn('raise exception', constraint)

    @unittest.skipUnless(NATIVE_AVAILABLE, 'native PG16 binaries/age unavailable, or initdb cannot run as root')
    def test_native_pg16_dump_encrypt_restore_all_original_checks(self):
        module = load_script('backup-synthetic-drill.py')
        with redirect_stdout(io.StringIO()) as output, native_synthetic_transport(module):
            result = module.drill()
        self.assertTrue(result['ok'])
        self.assertEqual(result['kind'], 'synthetic_ci_fixture')
        self.assertFalse(result['production_restored'])
        self.assertEqual(result['restored_tables'], 7)
        self.assertEqual(result['restored_rows'], 9)
        self.assertEqual(result['structural_objects_verified'], 14)
        self.assertTrue({'private_row_isolation', 'published_rpc_projection', 'constraint_rejection', 'grants'} <= set(result['checks']))
        self.assertIn('stage=complete', output.getvalue())

    @unittest.skipUnless(NATIVE_AVAILABLE, 'native PG16 binaries/age unavailable, or initdb cannot run as root')
    def test_native_restore_preserves_source_public_usage_revocation(self):
        module = load_script('backup-synthetic-drill.py')
        inspect = module.inspect_local
        def revoked_source(name):
            # Explicit actor USAGE is separate from PUBLIC access. The restored dump
            # must retain the PUBLIC revocation, not blindly add usage after ACL replay.
            backup_common.psql(name, 'revoke usage on schema public from public; grant usage on schema public to anon, authenticated, service_role;')
            metadata, counts = inspect(name)
            self.assertNotIn(['PUBLIC', 'USAGE', False], metadata['structure']['schema:public']['acl'])
            return metadata, counts
        with redirect_stdout(io.StringIO()), native_synthetic_transport(module), patch.object(module, 'inspect_local', side_effect=revoked_source):
            result = module.drill()
        self.assertTrue(result['ok'])
        self.assertEqual(result['structural_objects_verified'], 14)


if __name__ == '__main__':
    unittest.main()
