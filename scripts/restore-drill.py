#!/usr/bin/env python3
"""Decrypt and validate a backup in throwaway local Docker; production targets impossible."""
import argparse
import json
import subprocess
import tarfile
import tempfile
import uuid
from pathlib import Path
from backup_common import fingerprints, inspect_local, psql, run, sql_literal, start_container, stop_container, validate_manifest


def restore_drill(backup, identity, require_real=False, *, progress=None):
    # Progress is opt-in from the synthetic runner, never enabled by backup metadata.
    def stage(label):
        if progress is not None:
            progress.stage(label)

    name = "wrldline-restore-" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="wrldline-restore-") as temporary:
        tmp = Path(temporary)
        stage("restore_decrypt")
        run(["age", "--decrypt", "--identity", str(identity), "--output", str(tmp / "bundle.tar"), str(backup)])
        stage("restore_bundle_validate")
        with tarfile.open(tmp / "bundle.tar", "r") as archive:
            members = archive.getmembers()
            if sorted(member.name for member in members) != ["database.dump", "manifest.json"] or any(not member.isfile() for member in members):
                raise ValueError("Invalid backup bundle members")
            for member in members:
                with archive.extractfile(member) as source, (tmp / member.name).open("wb") as target:
                    import shutil
                    shutil.copyfileobj(source, target)
        stage("restore_manifest_validate")
        manifest = json.loads((tmp / "manifest.json").read_text())
        if not isinstance(manifest, dict) or manifest.get("format_version") != 1:
            raise ValueError("Unsupported backup format")
        if require_real and manifest.get("kind") != "production_read_only_backup":
            raise ValueError("Synthetic drill is not a production backup")
        validate_manifest(manifest)
        if progress is not None and manifest["kind"] != "synthetic_ci_fixture":
            raise ValueError("Synthetic progress requires a synthetic backup")
        try:
            stage("restore_start")
            start_container(name)
            stage("restore_roles")
            # Recreate required names WITHOUT passwords, login capability, or superuser.
            for role in manifest["roles"]:
                role_name = '"' + role['name'].replace('"','""') + '"'
                psql(name, f"create role {role_name} nologin {'bypassrls' if role['bypassrls'] else 'nobypassrls'};")
            stage("restore_extensions")
            for extension in manifest["extensions"]:
                schema = '"' + extension['schema'].replace('"','""') + '"'
                ext = '"' + extension['name'].replace('"','""') + '"'
                psql(name, f"create schema if not exists {schema}; create extension if not exists {ext} with schema {schema} version {sql_literal(extension['version'])};")
            stage("restore_archive")
            # Schema-filtered pg_dump includes CREATE SCHEMA public; initdb already
            # created it. Clean ONLY this throwaway target, then replay every archive
            # entry (including owners/ACLs). Do not use --no-owner/--no-acl or ignore errors.
            # stdin avoids host mounts and cannot target an external database.
            with (tmp / "database.dump").open("rb") as dump:
                subprocess.run(["docker", "exec", "-i", name, "pg_restore", "--clean", "--if-exists", "--exit-on-error", "--dbname=postgres", "--username=postgres"],
                               stdin=dump, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            stage("restore_target_prepare")
            # Recreating public loses initdb's implicit PUBLIC USAGE. The filtered
            # dump need not encode this grant. Replay the EXACT encrypted source
            # PUBLIC privileges (including an empty/revoked ACL), never assume USAGE.
            # Full schema ACL fingerprints below still verify every non-owner grant.
            if "public" in manifest["schemas"]:
                psql(name, "revoke all on schema public from public;")
                for privilege, grantable in manifest["public_schema_acl"]:
                    psql(name, f"grant {privilege} on schema public to public{' with grant option' if grantable else ''};")
            stage("restore_inspection")
            metadata, counts = inspect_local(name, manifest["schemas"])
            stage("restore_row_counts")
            if counts != manifest["row_counts"]:
                raise ValueError("Row-count comparison failed")
            stage("restore_structure")
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
                stage("restore_private_rls")
                visible = psql(name, "begin; set local role anon; select count(*) from public.private_account_fixture; rollback;")
                if visible.strip() != "0":
                    raise ValueError("Private-row RLS behavior failed")
                stage("restore_published_rpc")
                count = psql(name, "begin; set local role anon; select count(*) from public.published_news(); rollback;")
                if count.strip() != "1":
                    raise ValueError("Published-only projection behavior failed")
                stage("restore_constraint")
                # Check the SQLSTATE inside PostgreSQL, not just any psql failure:
                # a missing table/function or denied permission must not count as rejection.
                psql(name, """do $$ begin
                  begin
                    insert into public.articles(id,title,editorial_status)
                    values('00000000-0000-0000-0000-000000000099','invalid','bad');
                  exception when check_violation then return;
                  end;
                  raise exception 'Invalid status passed CHECK constraint';
                end $$;""")
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
