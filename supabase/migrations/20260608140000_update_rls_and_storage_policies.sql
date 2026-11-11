-- ============================================================
-- Complete RLS & Storage Policies Security Update
-- Restricts modification (INSERT, UPDATE, DELETE) to authenticated creators/owners
-- Keeps SELECT open for public profiles, bots, stats, and game assets.
-- ============================================================

-- 1. PROFILES TABLE
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Anyone (public / authenticated) can read public profiles for leaderboards
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Only authenticated user can create their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Only authenticated user (or owner) can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'owner'::public.app_role));

-- 2. CUSTOM BOTS TABLE
ALTER TABLE public.custom_bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Custom bots are viewable by everyone" ON public.custom_bots;
DROP POLICY IF EXISTS "Public bots viewable by all, personal bots viewable by creator and owner" ON public.custom_bots;
DROP POLICY IF EXISTS "Authenticated can insert bots" ON public.custom_bots;
DROP POLICY IF EXISTS "Creators can update their bots" ON public.custom_bots;
DROP POLICY IF EXISTS "Creators can delete their bots" ON public.custom_bots;
DROP POLICY IF EXISTS "Owners can update any bot" ON public.custom_bots;
DROP POLICY IF EXISTS "Owners can delete any bot" ON public.custom_bots;

-- Public bots viewable by all; Personal bots restricted to creator & owner
CREATE POLICY "Public bots viewable by all, personal bots viewable by creator and owner"
  ON public.custom_bots FOR SELECT
  USING (
    tier != 'Personal'
    OR auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Only authenticated user can insert bots (with created_by = auth.uid())
CREATE POLICY "Authenticated users can create bots"
  ON public.custom_bots FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Creators or Owners can update their bots
CREATE POLICY "Creators or owners can update bots"
  ON public.custom_bots FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Creators or Owners can delete their bots
CREATE POLICY "Creators or owners can delete bots"
  ON public.custom_bots FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- 3. BOT STATS TABLE
ALTER TABLE public.bot_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own bot stats" ON public.bot_stats;
DROP POLICY IF EXISTS "Public bot stats viewable by everyone" ON public.bot_stats;
DROP POLICY IF EXISTS "Users insert own bot stats" ON public.bot_stats;
DROP POLICY IF EXISTS "Users update own bot stats" ON public.bot_stats;

-- Anyone can read bot stats
CREATE POLICY "Public bot stats viewable by everyone"
  ON public.bot_stats FOR SELECT
  USING (true);

-- Users can only insert/update their own bot stats
CREATE POLICY "Users insert own bot stats"
  ON public.bot_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own bot stats"
  ON public.bot_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. APP SETTINGS TABLE
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads app settings" ON public.app_settings;
DROP POLICY IF EXISTS "owner inserts app settings" ON public.app_settings;
DROP POLICY IF EXISTS "owner updates app settings" ON public.app_settings;
DROP POLICY IF EXISTS "owner deletes app settings" ON public.app_settings;

CREATE POLICY "anyone reads app settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "owner inserts app settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "owner updates app settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "owner deletes app settings"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));


-- ============================================================
-- STORAGE BUCKETS & POLICIES
-- Buckets: avatars, bot-avatars, opening-books
-- Public SELECT for gameplay; restricted INSERT/UPDATE/DELETE to authenticated owner
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('bot-avatars', 'bot-avatars', true),
  ('opening-books', 'opening-books', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars policies
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Avatar files are readable by anyone with the path" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Avatar files are readable by anyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

-- Bot Avatars policies
DROP POLICY IF EXISTS "Bot avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload bot avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own bot avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own bot avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own bot avatars" ON storage.objects;

CREATE POLICY "Bot avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bot-avatars');

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

-- Opening Books (.bin files) policies
DROP POLICY IF EXISTS "Opening books are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload opening books" ON storage.objects;
DROP POLICY IF EXISTS "Users can update opening books" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete opening books" ON storage.objects;

CREATE POLICY "Opening books are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'opening-books');

CREATE POLICY "Users can upload opening books"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'opening-books'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Users can update opening books"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'opening-books'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Users can delete opening books"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'opening-books'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );
