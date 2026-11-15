#!/usr/bin/env python3
"""Decrypt and validate a backup in throwaway local Docker; production targets impossible."""
import argparse
import json
import os
import subprocess
import tarfile
import tempfile
import uuid
from pathlib import Path
from backup_common import fingerprints, inspect_local, psql, run, sql_literal, start_container, stop_container


def restore_drill(backup, identity, require_real=False):
    name = "wrldline-restore-" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="wrldline-restore-") as temporary:
        tmp = Path(temporary)
        run(["age", "--decrypt", "--identity", str(identity), "--output", str(tmp / "bundle.tar"), str(backup)])
        with tarfile.open(tmp / "bundle.tar", "r") as archive:
            members = archive.getmembers()
            if sorted(member.name for member in members) != ["database.dump", "manifest.json"] or any(not member.isfile() for member in members):
                raise ValueError("Invalid backup bundle members")
            for member in members:
                with archive.extractfile(member) as source, (tmp / member.name).open("wb") as target:
                    import shutil
                    shutil.copyfileobj(source, target)
        manifest = json.loads((tmp / "manifest.json").read_text())
        if manifest.get("format_version") != 1:
            raise ValueError("Unsupported backup format")
        if require_real and manifest.get("kind") != "production_read_only_backup":
            raise ValueError("Synthetic drill is not a production backup")
        try:
            start_container(name)
            # Recreate required names WITHOUT passwords, login capability, or superuser.
            for role in manifest["roles"]:
                role_name = '"' + role['name'].replace('"','""') + '"'
                psql(name, f"create role {role_name} nologin {'bypassrls' if role['bypassrls'] else 'nobypassrls'};")
            for extension in manifest["extensions"]:
                schema = '"' + extension['schema'].replace('"','""') + '"'
                ext = '"' + extension['name'].replace('"','""') + '"'
                psql(name, f"create schema if not exists {schema}; create extension if not exists {ext} with schema {schema} version {sql_literal(extension['version'])};")
            # stdin avoids mounting any host directory and cannot write to an external DB.
            with (tmp / "database.dump").open("rb") as dump:
                subprocess.run(["docker", "exec", "-i", name, "pg_restore", "--exit-on-error", "--dbname=postgres", "--username=postgres"],
                               stdin=dump, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            metadata, counts = inspect_local(name, manifest["schemas"])
            if counts != manifest["row_counts"]:
                raise ValueError("Row-count comparison failed")
            actual = fingerprints(metadata["structure"])
            if actual != manifest["structure_hashes"]:
                raise ValueError("Schema/RLS/policy/ACL/constraint/function/index/trigger comparison failed")
            result = {"ok": True, "kind": manifest["kind"], "restored_tables": len(counts),
                      "restored_rows": sum(counts.values()), "structural_objects_verified": len(actual),
                      "checks": ["row_counts", "columns", "rls", "policies", "grants", "constraints", "functions", "indexes", "triggers"],
                      "target": "throwaway_local_container", "production_restored": False}
            if manifest["kind"] == "synthetic_ci_fixture":
                # Behavioral checks supplement structural equality, including published-only
                # RPC projection and protected private rows.
                psql(name, "begin; set local role anon; select public.published_news(); rollback;")
                visible = psql(name, "begin; set local role anon; select count(*) from public.private_account_fixture; rollback;")
                if visible.strip() != "0": raise ValueError("Private-row RLS behavior failed")
                count = psql(name, "select count(*) from public.published_news();")
                if count.strip() != "1": raise ValueError("Published-only projection behavior failed")
                try:
                    psql(name, "insert into public.articles(id,title,editorial_status) values('00000000-0000-0000-0000-000000000099','invalid','bad');")
                    raise ValueError("Invalid status passed CHECK constraint")
                except subprocess.CalledProcessError:
                    pass
                result["checks"] += ["private_row_isolation", "published_rpc_projection", "constraint_rejection"]
            return result
        finally:
            stop_container(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True)
    parser.add_argument("--identity", required=True, help="Age identity file, never commit it")
    parser.add_argument("--require-real", action="store_true")
    args = parser.parse_args()
    print(json.dumps(restore_drill(args.backup, args.identity, args.require_real)))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print("Restore drill failed; target was disposable, production was not touched. Review tooling/extensions privately.", file=__import__('sys').stderr)
        raise SystemExit(1)
