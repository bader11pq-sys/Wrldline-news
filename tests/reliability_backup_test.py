import importlib.util
import io
import json
import shutil
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from backup_common import forbid_repository_output, metadata_sql, start_container, fingerprints

class BackupSafety(unittest.TestCase):
    def encrypted_fixture(self, temporary, members):
        from backup_common import run
        directory = Path(temporary)
        run(['age-keygen','-o',str(directory / 'identity')])
        recipient = run(['age-keygen','-y',str(directory / 'identity')]).decode().strip()
        with tarfile.open(directory / 'bundle.tar','w') as archive:
            for name, content in members.items():
                data = content.encode(); member = tarfile.TarInfo(name); member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        run(['age','-r',recipient,'-o',str(directory / 'backup.age'),str(directory / 'bundle.tar')])
        spec = importlib.util.spec_from_file_location('restore_drill_tests',ROOT / 'scripts/restore-drill.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module, directory / 'backup.age', directory / 'identity'

    @unittest.skipUnless(shutil.which('age') and shutil.which('age-keygen'),'age encryption tooling unavailable')
    def test_encrypted_traversal_bundle_rejected_before_container_start(self):
        with tempfile.TemporaryDirectory(prefix='wrldline-bundle-test-') as temporary:
            module, backup, identity = self.encrypted_fixture(temporary,{'../escape':'fixture'})
            with patch.object(module,'start_container') as start:
                with self.assertRaisesRegex(ValueError,'Invalid backup bundle'): module.restore_drill(backup,identity)
                start.assert_not_called()

    @unittest.skipUnless(shutil.which('age') and shutil.which('age-keygen'),'age encryption tooling unavailable')
    def test_synthetic_ciphertext_cannot_be_reported_as_real_backup(self):
        with tempfile.TemporaryDirectory(prefix='wrldline-label-test-') as temporary:
            manifest = json.dumps({'format_version':1,'kind':'synthetic_ci_fixture'})
            module, backup, identity = self.encrypted_fixture(temporary,{'manifest.json':manifest,'database.dump':'fixture'})
            with patch.object(module,'start_container') as start:
                with self.assertRaisesRegex(ValueError,'Synthetic drill'): module.restore_drill(backup,identity,True)
                start.assert_not_called()

    def test_production_exports_cannot_enter_repository(self):
        with self.assertRaises(ValueError): forbid_repository_output(ROOT / 'docs' / 'backup.age')
        self.assertEqual(forbid_repository_output('/tmp/wrldline-backup.age'), Path('/tmp/wrldline-backup.age'))

    def test_restore_target_never_has_ports_or_network(self):
        with patch('backup_common.run', return_value=b'') as command, patch('backup_common.psql', return_value='1'):
            start_container('wrldline-test')
            args = command.call_args.args[0]
            self.assertEqual(args[args.index('--network') + 1], 'none')
            self.assertNotIn('-p', args)
            self.assertNotIn('--volume', args)
            self.assertIn('wrldline.dr=throwaway', args)

    def test_structural_checks_cover_rls_constraints_functions_and_grants(self):
        sql = metadata_sql()
        for item in ['relrowsecurity','relforcerowsecurity','pg_policies','pg_get_constraintdef','pg_get_functiondef','aclexplode','pg_get_triggerdef']:
            self.assertIn(item, sql)
        self.assertEqual(fingerprints({'fixture': {'b': 2, 'a': 1}}), fingerprints({'fixture': {'a': 1, 'b': 2}}))

    def test_restore_cli_cannot_accept_target_database_url(self):
        source = (ROOT / 'scripts/restore-drill.py').read_text()
        self.assertNotIn('DATABASE_URL', source)
        self.assertNotIn('--database-url', source)
        self.assertIn('--require-real', source)
        self.assertIn('production_restored', source)
        self.assertIn('stop_container(name)', source)

    def test_dump_uses_consistent_read_only_snapshot_and_age(self):
        source = (ROOT / 'scripts/backup-create.py').read_text()
        for item in ['repeatable read read only','pg_export_snapshot','--snapshot=', 'conn.rollback()', 'age', 'forbid_repository_output']:
            self.assertIn(item, source)
        self.assertNotIn('pg_dumpall', source)

if __name__ == '__main__': unittest.main()
