
-- custom_bots table
CREATE TABLE public.custom_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  elo INTEGER NOT NULL DEFAULT 1500,
  profile_pic_url TEXT,
  quote TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'Intermediate',
  middlegame_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  endgame_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  opening_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifetime_wins INTEGER NOT NULL DEFAULT 0,
  lifetime_losses INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Custom bots are viewable by everyone"
  ON public.custom_bots FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert bots"
  ON public.custom_bots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their bots"
  ON public.custom_bots FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete their bots"
  ON public.custom_bots FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE TRIGGER update_custom_bots_updated_at
  BEFORE UPDATE ON public.custom_bots
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Secure function to increment lifetime counters (bypasses creator-only UPDATE RLS)
CREATE OR REPLACE FUNCTION public.increment_bot_lifetime(_bot_id UUID, _wins INT, _losses INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.custom_bots
    SET lifetime_wins = lifetime_wins + COALESCE(_wins, 0),
        lifetime_losses = lifetime_losses + COALESCE(_losses, 0)
    WHERE id = _bot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_bot_lifetime(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_bot_lifetime(UUID, INT, INT) TO authenticated;

-- Bucket for bot avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('bot-avatars', 'bot-avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Bot avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bot-avatars');

CREATE POLICY "Authenticated can upload bot avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'bot-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Profile customization fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_icon TEXT,
  ADD COLUMN IF NOT EXISTS title_badge TEXT;
