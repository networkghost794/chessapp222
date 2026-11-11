-- ============================================================
-- LOVABLE SECURITY SCANNER FIXES MIGRATION
-- Fixes:
-- 1. Removes claim_owner_role PIN exploit
-- 2. Restricts has_role enumeration
-- 3. Locks down bot win counters & custom_bots lifetime updates
-- 4. Protects sensitive profile fields (elo, wins, losses, draws) via triggers & RPCs
-- 5. Removes broad storage.objects SELECT listing policies
-- 6. Maintains public SELECT for custom_bots, title_colors, app_settings & public_profiles view
-- ============================================================

-- 1. REMOVE HARDCODED OWNER PIN EXPLOIT
DROP FUNCTION IF EXISTS public.claim_owner_role(text);


-- 2. RESTRICT HAS_ROLE ENUMERATION
-- Non-owners can only check their own user ID (_uid = auth.uid())
CREATE OR REPLACE FUNCTION public.has_role(_uid uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Non-owners can only query their own user ID
  IF _uid != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'::public.app_role
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = _role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;


-- 3. LOCK DOWN BOT WIN COUNTERS (increment_bot_lifetime)
-- Verify authentication & clamp increment values
CREATE OR REPLACE FUNCTION public.increment_bot_lifetime(_bot_id UUID, _wins INT, _losses INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate increment amounts (max 1 win or 1 loss per match call)
  IF COALESCE(_wins, 0) < 0 OR COALESCE(_wins, 0) > 1 OR
     COALESCE(_losses, 0) < 0 OR COALESCE(_losses, 0) > 1 OR
     (COALESCE(_wins, 0) + COALESCE(_losses, 0)) > 1 THEN
    RAISE EXCEPTION 'Invalid match result increment';
  END IF;

  UPDATE public.custom_bots
    SET lifetime_wins = lifetime_wins + COALESCE(_wins, 0),
        lifetime_losses = lifetime_losses + COALESCE(_losses, 0)
    WHERE id = _bot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_bot_lifetime(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_bot_lifetime(UUID, INT, INT) TO authenticated;

-- Trigger to prevent direct client UPDATE on custom_bots lifetime counters
CREATE OR REPLACE FUNCTION public.protect_custom_bots_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::public.app_role) THEN
    NEW.lifetime_wins = OLD.lifetime_wins;
    NEW.lifetime_losses = OLD.lifetime_losses;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_custom_bots_counters ON public.custom_bots;
CREATE TRIGGER tr_protect_custom_bots_counters
  BEFORE UPDATE ON public.custom_bots
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_custom_bots_counters();


-- 4. PROTECT SENSITIVE FIELDS ON PROFILES & CREATE SECURE VIEW
-- Trigger to prevent direct client UPDATE on profile ratings and win/loss/draw records
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::public.app_role) THEN
    NEW.elo_rating = OLD.elo_rating;
    NEW.wins = OLD.wins;
    NEW.losses = OLD.losses;
    NEW.draws = OLD.draws;
    NEW.placement_done = OLD.placement_done;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_profile_fields ON public.profiles;
CREATE TRIGGER tr_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();

-- SECURITY DEFINER RPCs for recording match results and placement tests safely
CREATE OR REPLACE FUNCTION public.record_user_match_result(_result text, _elo_change int DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _result = 'win' THEN
    UPDATE public.profiles
      SET wins = wins + 1,
          elo_rating = GREATEST(100, LEAST(3200, elo_rating + COALESCE(_elo_change, 15)))
      WHERE id = auth.uid();
  ELSIF _result = 'loss' THEN
    UPDATE public.profiles
      SET losses = losses + 1,
          elo_rating = GREATEST(100, LEAST(3200, elo_rating - COALESCE(ABS(_elo_change), 15)))
      WHERE id = auth.uid();
  ELSIF _result = 'draw' THEN
    UPDATE public.profiles
      SET draws = draws + 1
      WHERE id = auth.uid();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_match_result(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_match_result(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_placement_test(_elo int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles
    SET elo_rating = GREATEST(100, LEAST(3200, _elo)),
        placement_done = true
    WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.complete_placement_test(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_placement_test(int) TO authenticated;

-- Restrict SELECT on profiles to owner and self
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Create secure public_profiles view for public viewing
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    id,
    username,
    avatar_url,
    elo_rating,
    wins,
    losses,
    draws,
    placement_done,
    profile_icon,
    title_badge,
    created_at
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;


-- 5. FIX STORAGE BUCKET LISTING (storage.objects)
-- Drop broad SELECT policies on storage.objects that allow listing bucket files.
-- Public bucket URLs still serve assets automatically without needing a SELECT policy on storage.objects.
DROP POLICY IF EXISTS "Avatar files are readable by anyone" ON storage.objects;
DROP POLICY IF EXISTS "Bot avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Opening books are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Avatar files are readable by anyone with the path" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;


-- 6. ENSURE PUBLIC READ ACCESS ON GAME ASSETS (custom_bots, title_colors, app_settings)
-- Public bots viewable by all; Personal bots restricted to creator & owner
DROP POLICY IF EXISTS "Public bots viewable by all, personal bots viewable by creator and owner" ON public.custom_bots;

CREATE POLICY "Public bots viewable by all, personal bots viewable by creator and owner"
  ON public.custom_bots FOR SELECT
  USING (
    tier != 'Personal'
    OR auth.uid() = created_by
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Title colors public SELECT
DROP POLICY IF EXISTS "anyone can read title colors" ON public.title_colors;
CREATE POLICY "anyone can read title colors"
  ON public.title_colors FOR SELECT
  USING (true);

-- App settings public SELECT
DROP POLICY IF EXISTS "anyone reads app settings" ON public.app_settings;
CREATE POLICY "anyone reads app settings"
  ON public.app_settings FOR SELECT
  USING (true);
