-- Secure RLS policies: restrict profile visibility to owner/self and enforce storage ownership

-- 1. Profiles table: Only allow users to view their own profile (or owner role)
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- 2. Custom bots table: Restrict Personal bots to their creator or owner
DROP POLICY IF EXISTS "Custom bots are viewable by everyone" ON public.custom_bots;
DROP POLICY IF EXISTS "Public bots viewable by all, personal bots viewable by creator and owner" ON public.custom_bots;

CREATE POLICY "Public bots viewable by all, personal bots viewable by creator and owner"
  ON public.custom_bots FOR SELECT
  USING (
    tier != 'Personal'
    OR auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- 3. Storage objects: Enforce user-owned folder restrictions on avatar deletions
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Storage objects: Enforce owner checks on bot-avatars uploads, updates, and deletes
DROP POLICY IF EXISTS "Authenticated can upload bot avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own bot avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own bot avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own bot avatars" ON storage.objects;

CREATE POLICY "Users can upload their own bot avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bot-avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Users can update their own bot avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'bot-avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Users can delete their own bot avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bot-avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );
