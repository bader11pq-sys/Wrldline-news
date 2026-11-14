-- The daily briefing is newsroom content as well; it follows the same gate.
drop policy if exists "Public can read daily global briefings" on public.daily_news_briefings;
drop policy if exists "Authenticated read daily global briefings" on public.daily_news_briefings;
create policy "Authenticated read daily global briefings" on public.daily_news_briefings
  for select to authenticated using (true);
grant select on public.daily_news_briefings to authenticated;
revoke all on public.daily_news_briefings from anon;
