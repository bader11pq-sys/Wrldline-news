-- Regression fix: authenticated readers should see every published article.
-- Source-specific filtering remains in the newsroom queries and normalizers.
drop policy if exists "Authenticated read published or editorial articles" on public.articles;
create policy "Authenticated read published or editorial articles" on public.articles
  for select to authenticated
  using (
    editorial_status = 'published'
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('editor','admin')
  );
