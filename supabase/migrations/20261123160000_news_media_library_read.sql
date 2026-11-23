begin;

-- Editors can browse the existing public news-media library from the protected editor UI.
-- Uploads remain governed by the existing insert policy; this policy does not grant writes.
drop policy if exists "WRLDLINE editors read news media" on storage.objects;
create policy "WRLDLINE editors read news media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'news-media'
  and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
);

notify pgrst, 'reload schema';
commit;
