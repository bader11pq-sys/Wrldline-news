#!/usr/bin/env python3
"""Synthetic test ONLY. Never reads production, never substitutes for real backup evidence."""
import importlib.util
import json
import tarfile
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from backup_common import IMAGE, SCHEMAS, ROOT, fingerprints, inspect_local, psql, run, start_container, stop_container


def drill():
    container = 'wrldline-fixture-' + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix='wrldline-synthetic-') as temporary:
        tmp = Path(temporary)
        run(['age-keygen', '-o', str(tmp / 'identity')])
        recipient = run(['age-keygen', '-y', str(tmp / 'identity')]).decode().strip()
        try:
            start_container(container)
            fixture = (ROOT / 'tests/reliability-fixture.sql').read_text()
            psql(container, fixture)
            psql(container, (ROOT / 'supabase/migrations/20261115050000_source_freshness.sql').read_text())
            psql(container, (ROOT / 'tests/reliability-freshness-sql.sql').read_text())
            metadata, counts = inspect_local(container)
            manifest = {'format_version':1,'kind':'synthetic_ci_fixture','created_at':datetime.now(timezone.utc).isoformat(),
                        'schemas':list(SCHEMAS),'postgres_image':IMAGE,'row_counts':counts,
                        'structure_hashes':fingerprints(metadata['structure']),'roles':metadata['roles'],'extensions':metadata['extensions']}
            (tmp / 'manifest.json').write_text(json.dumps(manifest))
            with (tmp / 'database.dump').open('wb') as dump:
                run(['docker','exec',container,'pg_dump','-U','postgres','-d','postgres','--format=custom'] + ['--schema='+s for s in SCHEMAS], stdout=dump)
            with tarfile.open(tmp / 'bundle.tar','w') as archive:
                for filename in ('manifest.json','database.dump'): archive.add(tmp / filename, arcname=filename)
            run(['age','-r',recipient,'-o',str(tmp / 'backup.age'),str(tmp / 'bundle.tar')])
        finally:
            stop_container(container)
        spec = importlib.util.spec_from_file_location('restore_drill', ROOT / 'scripts/restore-drill.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module.restore_drill(tmp / 'backup.age',tmp / 'identity')

if __name__ == '__main__':
    try: print(json.dumps(drill()))
    except Exception:
        print('Synthetic DR drill failed; no production data was read.',file=__import__('sys').stderr)
        raise SystemExit(1)
