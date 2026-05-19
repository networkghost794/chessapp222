
alter function public.handle_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_updated_at() from public, anon, authenticated;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar files are readable by anyone with the path"
  on storage.objects for select
  using (bucket_id = 'avatars');
