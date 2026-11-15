-- Private Web Push keys live in Vault, not browser JS or version control.
-- Environment variables can override these values in the Edge Functions.
create or replace function public.notification_runtime_config()
returns jsonb language sql security definer stable set search_path=pg_catalog,public,vault as $$
  select jsonb_build_object(
    'vapid_public_key',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_vapid_public_key' limit 1),
    'vapid_private_key',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_vapid_private_key' limit 1),
    'vapid_subject',(select decrypted_secret from vault.decrypted_secrets where name='wrldline_vapid_subject' limit 1)
  )
$$;
revoke all on function public.notification_runtime_config() from public,anon,authenticated;
grant execute on function public.notification_runtime_config() to service_role;
