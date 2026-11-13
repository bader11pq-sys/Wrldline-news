create or replace function public.verify_wrldline_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select coalesce(bool_or(decrypted_secret = p_secret), false)
  from vault.decrypted_secrets
  where name = 'wrldline_news_cron_secret_20261113';
$$;

revoke all on function public.verify_wrldline_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_wrldline_cron_secret(text) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'article_translations'
  ) then
    alter publication supabase_realtime add table public.article_translations;
  end if;
end
$$;
