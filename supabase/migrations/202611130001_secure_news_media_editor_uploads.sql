-- Restrict WRLDLINE media uploads to authenticated editorial accounts.
drop policy if exists "Allow anon uploads" on storage.objects;
drop policy if exists "WRLDLINE editors upload news media" on storage.objects;

create policy "WRLDLINE editors upload news media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news-media'
  and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
);

update storage.buckets
set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/gif','image/avif',
    'video/mp4','video/webm','video/quicktime'
  ]
where id = 'news-media';
