CREATE TABLE public.bot_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  bot_name TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, bot_id)
);

ALTER TABLE public.bot_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bot stats" ON public.bot_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own bot stats" ON public.bot_stats
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own bot stats" ON public.bot_stats
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER bot_stats_updated_at
  BEFORE UPDATE ON public.bot_stats
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();