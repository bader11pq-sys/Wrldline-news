#!/usr/bin/env python3
"""Synthetic test ONLY. Never reads production, never substitutes for real backup evidence."""
import importlib.util
import json
import tarfile
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from backup_common import IMAGE, SCHEMAS, ROOT, SyntheticProgress, fingerprints, inspect_local, psql, public_schema_acl, run, start_container, stop_container


def drill(progress=None):
    progress = progress or SyntheticProgress()
    container = 'wrldline-fixture-' + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix='wrldline-synthetic-') as temporary:
        tmp = Path(temporary)
        progress.stage('age_identity')
        run(['age-keygen', '-o', str(tmp / 'identity')])
        recipient = run(['age-keygen', '-y', str(tmp / 'identity')]).decode().strip()
        try:
            progress.stage('source_start')
            start_container(container)
            progress.stage('fixture_schema')
            fixture = (ROOT / 'tests/reliability-fixture.sql').read_text()
            psql(container, fixture)
            progress.stage('fixture_migration')
            psql(container, (ROOT / 'supabase/migrations/20261115050000_source_freshness.sql').read_text())
            progress.stage('fixture_behavior')
            psql(container, (ROOT / 'tests/reliability-freshness-sql.sql').read_text())
            progress.stage('source_inspection')
            metadata, counts = inspect_local(container)
            manifest = {'format_version':1,'kind':'synthetic_ci_fixture','created_at':datetime.now(timezone.utc).isoformat(),
                        'schemas':list(SCHEMAS),'postgres_image':IMAGE,'row_counts':counts,
                        'structure_hashes':fingerprints(metadata['structure']),'roles':metadata['roles'],'extensions':metadata['extensions'],
                        'public_schema_acl':public_schema_acl(metadata)}
            (tmp / 'manifest.json').write_text(json.dumps(manifest))
            progress.stage('source_dump')
            with (tmp / 'database.dump').open('wb') as dump:
                run(['docker','exec',container,'pg_dump','-U','postgres','-d','postgres','--format=custom'] + ['--schema='+s for s in SCHEMAS], stdout=dump)
            progress.stage('bundle_encrypt')
            with tarfile.open(tmp / 'bundle.tar','w') as archive:
                for filename in ('manifest.json','database.dump'): archive.add(tmp / filename, arcname=filename)
            run(['age','-r',recipient,'-o',str(tmp / 'backup.age'),str(tmp / 'bundle.tar')])
        finally:
            stop_container(container)
        spec = importlib.util.spec_from_file_location('restore_drill', ROOT / 'scripts/restore-drill.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        result = module.restore_drill(tmp / 'backup.age',tmp / 'identity', progress=progress)
        progress.stage('complete')
        return result


def main():
    progress = SyntheticProgress()
    try:
        print(json.dumps(drill(progress)))
    except Exception as error:
        progress.failure(error)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
