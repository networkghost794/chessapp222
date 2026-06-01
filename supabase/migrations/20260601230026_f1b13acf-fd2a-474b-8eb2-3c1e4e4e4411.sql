-- ============ Roles (server-side ownership) ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_uid uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = _role);
$$;

-- Owner claim with PIN check happens server-side
CREATE OR REPLACE FUNCTION public.claim_owner_role(_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _pin = '774152' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'owner')
    ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- ============ App updates (owner-only writes) ============
CREATE TABLE IF NOT EXISTS public.app_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  title text,
  content text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_updates TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.app_updates TO authenticated;
GRANT ALL ON public.app_updates TO service_role;
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published or owner" ON public.app_updates;
CREATE POLICY "Published or owner" ON public.app_updates
  FOR SELECT USING (published = true OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Owner insert" ON public.app_updates;
CREATE POLICY "Owner insert" ON public.app_updates
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Owner update" ON public.app_updates;
CREATE POLICY "Owner update" ON public.app_updates
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Owner delete" ON public.app_updates;
CREATE POLICY "Owner delete" ON public.app_updates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER app_updates_set_updated_at
  BEFORE UPDATE ON public.app_updates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============ Per-user seen updates ============
CREATE TABLE IF NOT EXISTS public.user_seen_updates (
  user_id uuid NOT NULL,
  version text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, version)
);
GRANT SELECT, INSERT ON public.user_seen_updates TO authenticated;
GRANT ALL ON public.user_seen_updates TO service_role;
ALTER TABLE public.user_seen_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own seen" ON public.user_seen_updates;
CREATE POLICY "Users view own seen" ON public.user_seen_updates
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users mark own seen" ON public.user_seen_updates;
CREATE POLICY "Users mark own seen" ON public.user_seen_updates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
