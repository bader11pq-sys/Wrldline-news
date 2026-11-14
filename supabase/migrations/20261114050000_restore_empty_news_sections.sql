create or replace function public.flag_explicit_exclusive_headline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.title,'') ~* '^[[:space:]]*(exclusive[[:space:]]*[:|-]|حصري[[:space:]]*[:：-])' then
    new.is_exclusive := true;
    new.exclusive_type := coalesce(new.exclusive_type,'exclusive_scoop');
    new.exclusive_reason := coalesce(new.exclusive_reason,'Publisher explicitly labels headline EXCLUSIVE; this records the source label, not independent verification.');
    new.exclusive_confidence := greatest(coalesce(new.exclusive_confidence,0),0.90);
  elsif tg_op = 'UPDATE' and old.exclusive_reason = 'Publisher explicitly labels headline EXCLUSIVE; this records the source label, not independent verification.' then
    new.is_exclusive := false;
    new.exclusive_type := null;
    new.exclusive_reason := null;
    new.exclusive_confidence := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flag_explicit_exclusive_headline on public.articles;
create trigger trg_flag_explicit_exclusive_headline
before insert or update of title on public.articles
for each row execute function public.flag_explicit_exclusive_headline();

update public.articles
set is_exclusive = true,
    exclusive_type = coalesce(exclusive_type,'exclusive_scoop'),
    exclusive_reason = coalesce(exclusive_reason,'Publisher explicitly labels headline EXCLUSIVE; this records the source label, not independent verification.'),
    exclusive_confidence = greatest(coalesce(exclusive_confidence,0),0.90)
where editorial_status='published'
  and coalesce(title,'') ~* '^[[:space:]]*(exclusive[[:space:]]*[:|-]|حصري[[:space:]]*[:：-])';

create index if not exists articles_exclusive_published_idx
on public.articles(published_at desc)
where is_exclusive = true and editorial_status='published';