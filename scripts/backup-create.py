#!/usr/bin/env python3
"""Manual, read-only app-schema backup. All persistent output is age encrypted."""
import argparse
import json
import os
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from backup_common import IMAGE, SCHEMAS, fingerprints, forbid_repository_output, metadata_sql, run


def create_backup(output, recipient, label="production_read_only_backup"):
    import psycopg
    from psycopg import sql
    url = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise ValueError("DATABASE_URL secret must be a PostgreSQL connection URI")
    local = parsed.hostname in ("127.0.0.1", "localhost", "::1")
    if not local and parse_qs(parsed.query).get("sslmode", [""])[0] not in ("require", "verify-ca", "verify-full"):
        raise ValueError("Remote backups require TLS; prefer sslmode=verify-full and trusted CA")
    if not recipient or not recipient.startswith("age1"):
        raise ValueError("AGE_RECIPIENT public key is required")
    output = forbid_repository_output(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError("Refusing to overwrite an existing backup")
    with tempfile.TemporaryDirectory(prefix="wrldline-backup-") as tmp:
        tmp = Path(tmp)
        # One REPEATABLE READ snapshot covers exact row counts and pg_dump.
        with psycopg.connect(url, autocommit=False) as conn:
            conn.execute("set transaction isolation level repeatable read read only")
            metadata = conn.execute(metadata_sql()).fetchone()[0]
            counts = {}
            for schema, table in metadata["tables"]:
                counts[f"{schema}.{table}"] = conn.execute(sql.SQL("select count(*) from {}.{}").format(sql.Identifier(schema), sql.Identifier(table))).fetchone()[0]
            snapshot = conn.execute("select pg_export_snapshot()").fetchone()[0]
            manifest = {"format_version": 1, "kind": label, "created_at": datetime.now(timezone.utc).isoformat(),
                        "postgres_image": IMAGE, "server_version": conn.info.server_version,
                        "schemas": list(SCHEMAS), "row_counts": counts,
                        "structure_hashes": fingerprints(metadata["structure"]),
                        "roles": metadata["roles"], "extensions": metadata["extensions"],
                        "limitations": ["Application-schema logical backup, not provider/PITR backup", "Storage rows do not include bucket object bytes", "External extensions/services/secrets require separate recovery"]}
            (tmp / "manifest.json").write_text(json.dumps(manifest, sort_keys=True))
            env = {**os.environ, "PGDATABASE": url}
            command = ["docker", "run", "--rm", "--network", "host", "--env", "PGDATABASE", IMAGE,
                       "pg_dump", "--format=custom", "--snapshot=" + snapshot]
            command += ["--schema=" + schema for schema in SCHEMAS]
            with (tmp / "database.dump").open("wb") as dump:
                run(command, env=env, stdout=dump)
            conn.rollback()  # export performed no production writes
        with tarfile.open(tmp / "bundle.tar", "w") as archive:
            archive.add(tmp / "manifest.json", arcname="manifest.json")
            archive.add(tmp / "database.dump", arcname="database.dump")
        partial = output.with_name(output.name + ".partial")
        try:
            run(["age", "--encrypt", "--recipient", recipient, "--output", str(partial), str(tmp / "bundle.tar")])
            partial.chmod(0o600)
            partial.replace(output)
        finally:
            partial.unlink(missing_ok=True)
    print(json.dumps({"ok": True, "kind": label, "encrypted_backup": str(output), "schemas": list(SCHEMAS)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="Encrypted .age output OUTSIDE repo")
    args = parser.parse_args()
    create_backup(args.output, os.environ.get("AGE_RECIPIENT", ""))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # libpq errors can reveal a host/user/URL: don't send raw errors to Actions logs.
        print("Backup failed; inspect credentials/tooling privately. No plaintext artifact was saved.", file=__import__('sys').stderr)
        raise SystemExit(1)
