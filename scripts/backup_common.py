"""Shared local-only DR helpers. Requires Docker; never accepts a restore URL."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
IMAGE = os.environ.get("DR_POSTGRES_IMAGE", "postgres:17.6-bookworm")
SCHEMAS = ("public", "private", "auth", "storage")
BACKUP_KINDS = ("synthetic_ci_fixture", "production_read_only_backup")


class SyntheticProgress:
    """Fixed labels only: never format exception messages, commands, names or stderr."""
    STAGES = frozenset((
        "age_identity", "source_start", "fixture_schema", "fixture_migration",
        "fixture_behavior", "source_inspection", "source_dump", "bundle_encrypt",
        "restore_decrypt", "restore_bundle_validate", "restore_manifest_validate",
        "restore_start", "restore_target_prepare", "restore_roles", "restore_extensions",
        "restore_archive", "restore_inspection", "restore_row_counts", "restore_structure",
        "restore_private_rls", "restore_published_rpc", "restore_constraint", "complete",
    ))

    def __init__(self):
        self.current = "age_identity"

    def stage(self, stage):
        if stage not in self.STAGES:
            raise ValueError("Unknown synthetic stage")
        self.current = stage
        print(f"Synthetic DR only: stage={stage} event=start", flush=True)

    def failure(self, error):
        import sys
        classes = (subprocess.CalledProcessError, FileNotFoundError, TimeoutError,
                   json.JSONDecodeError, ValueError, TypeError, KeyError, RuntimeError, OSError)
        error_class = next((cls.__name__ for cls in classes if type(error) is cls), "Error")
        print(f"Synthetic DR only: stage={self.current} event=failed error_class={error_class}; "
              "no production data was read.", file=sys.stderr, flush=True)


def validate_manifest(manifest):
    """Reject malformed scope/labels before starting any disposable target."""
    if not isinstance(manifest, dict) or type(manifest.get("format_version")) is not int or manifest["format_version"] != 1:
        raise ValueError("Unsupported backup format")
    if manifest.get("kind") not in BACKUP_KINDS:
        raise ValueError("Invalid backup kind")
    created_at = manifest.get("created_at")
    if not isinstance(created_at, str):
        raise ValueError("Invalid backup timestamp")
    created = datetime.fromisoformat(created_at)
    if created.tzinfo is None or created.utcoffset() is None:
        raise ValueError("Backup timestamp must include timezone")
    schemas = manifest.get("schemas")
    if not isinstance(schemas, list) or not schemas or any(s not in SCHEMAS for s in schemas) or len(set(schemas)) != len(schemas):
        raise ValueError("Invalid backup schema scope")
    counts, hashes = manifest.get("row_counts"), manifest.get("structure_hashes")
    if not isinstance(counts, dict) or any(not isinstance(k, str) or type(v) is not int or v < 0 for k, v in counts.items()):
        raise ValueError("Invalid row-count metadata")
    if not isinstance(hashes, dict) or any(not isinstance(k, str) or not isinstance(v, str) or len(v) != 64 or any(c not in '0123456789abcdef' for c in v) for k, v in hashes.items()):
        raise ValueError("Invalid structural metadata")
    public_acl = manifest.get("public_schema_acl")
    if not isinstance(public_acl, list) or any(not isinstance(grant, list) or len(grant) != 2 or grant[0] not in ("USAGE", "CREATE") or type(grant[1]) is not bool for grant in public_acl):
        raise ValueError("Missing or invalid public schema ACL baseline")
    if len({grant[0] for grant in public_acl}) != len(public_acl) or ("public" not in schemas and public_acl):
        raise ValueError("Invalid public schema ACL baseline")
    for key, required in (("roles", ("name", "bypassrls")), ("extensions", ("name", "schema", "version"))):
        entries = manifest.get(key)
        if not isinstance(entries, list) or any(not isinstance(e, dict) or any(field not in e for field in required) for e in entries):
            raise ValueError("Invalid restore prerequisites")
        if any(not isinstance(e["name"], str) or not e["name"] or '\x00' in e["name"] for e in entries) or len({e["name"] for e in entries}) != len(entries):
            raise ValueError("Invalid restore prerequisite names")
    if any(type(role["bypassrls"]) is not bool or role["name"] == "postgres" or role["name"].startswith("pg_") for role in manifest["roles"]):
        raise ValueError("Invalid restore role metadata")
    if any(not isinstance(e[field], str) or not e[field] or '\x00' in e[field] for e in manifest["extensions"] for field in ("schema", "version")):
        raise ValueError("Invalid restore extension metadata")


def run(args, *, data=None, env=None, stdout=None):
    return subprocess.run(args, input=data, env=env, stdout=stdout or subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True).stdout


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def metadata_sql(schemas=SCHEMAS):
    chosen = ",".join(sql_literal(s) for s in schemas)
    # No row values or secret-bearing function definitions leave the encrypted bundle.
    # Structure is hashed, preserving exact policies/constraints/functions/ACLs.
    return f"""
with tables as (
 select c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.relowner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ({chosen}) and c.relkind in ('r','p')
), structure as (
 select 'table:'||nspname||'.'||relname k,
 jsonb_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
     pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a
     left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
 'acl',(select coalesce(jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
     x.privilege_type,x.is_grantable) order by case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]') from aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) x where x.grantee<>t.relowner),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated) order by conname),'[]') from pg_constraint where conrelid=t.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check) order by policyname),'[]') from pg_policies where schemaname=t.nspname and tablename=t.relname),
 'indexes',(select coalesce(jsonb_agg(indexdef order by indexname),'[]') from pg_indexes where schemaname=t.nspname and tablename=t.relname),
 'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(oid) order by tgname),'[]') from pg_trigger where tgrelid=t.oid and not tgisinternal)) v from tables t
 union all select 'schema:'||n.nspname,
 jsonb_build_object('acl',(select coalesce(jsonb_agg(jsonb_build_array(
 case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable)
 order by case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]')
 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x where x.grantee<>n.nspowner))
 from pg_namespace n where n.nspname in ({chosen})
 union all select 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',
 (select coalesce(jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable)
 order by case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type),'[]') from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee<>p.proowner))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ({chosen}) and p.prokind in ('f','p')
)
select jsonb_build_object('tables',(select coalesce(jsonb_agg(jsonb_build_array(nspname,relname) order by nspname,relname),'[]') from tables),
 'structure',(select coalesce(jsonb_object_agg(k,v),'{{}}') from structure),
 'roles',(select coalesce(jsonb_agg(jsonb_build_object('name',rolname,'bypassrls',rolbypassrls) order by rolname),'[]') from pg_roles where rolname !~ '^pg_' and rolname<>'postgres'),
 'extensions',(select coalesce(jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion) order by e.extname),'[]') from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname<>'plpgsql'));
"""


def psql(container, sql, database="postgres"):
    return run(["docker", "exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], data=sql.encode()).decode().strip()


def inspect_local(container, schemas=SCHEMAS):
    metadata = json.loads(psql(container, metadata_sql(schemas)))
    counts = {}
    for schema, table in metadata["tables"]:
        relation = '"' + schema.replace('"','""') + '"."' + table.replace('"','""') + '"'
        counts[f"{schema}.{table}"] = int(psql(container, f"select count(*) from {relation};"))
    return metadata, counts


def fingerprints(structure):
    return {name: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            for name, value in structure.items()}


def public_schema_acl(metadata):
    # pg_dump's schema-filtered archive may omit public's implicit initdb grant.
    # Preserve exactly the source PUBLIC privileges, encrypted with the manifest.
    return [grant[1:] for grant in metadata["structure"].get("schema:public", {"acl": []})["acl"]
            if grant[0] == "PUBLIC"]


def forbid_repository_output(output):
    resolved = Path(output).resolve()
    if resolved == ROOT or ROOT in resolved.parents:
        raise ValueError("Backup output must be outside the repository; never commit production exports")
    return resolved


def start_container(name):
    # No ports, mounts, connection URLs, or external network. Target is unconditionally disposable.
    run(["docker", "run", "--detach", "--rm", "--network", "none", "--label", "wrldline.dr=throwaway",
         "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE])
    import time
    for _ in range(60):
        try:
            psql(name, "select 1;")
            return
        except subprocess.CalledProcessError:
            time.sleep(1)
    raise RuntimeError("Disposable Postgres did not become ready")


def stop_container(name):
    subprocess.run(["docker", "rm", "--force", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
