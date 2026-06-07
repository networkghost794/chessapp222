
-- 1. Bot title fields
ALTER TABLE public.custom_bots
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS title_color TEXT;

-- 2. Global title color mapping
CREATE TABLE IF NOT EXISTS public.title_colors (
  title TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.title_colors TO anon, authenticated;
GRANT ALL ON public.title_colors TO service_role;

ALTER TABLE public.title_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read title colors"
  ON public.title_colors FOR SELECT
  USING (true);

CREATE POLICY "owner can insert title colors"
  ON public.title_colors FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owner can update title colors"
  ON public.title_colors FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owner can delete title colors"
  ON public.title_colors FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- Seed default standard title colors (Chess.com-style)
INSERT INTO public.title_colors (title, color) VALUES
  ('GM', '#b8860b'),
  ('IM', '#a0522d'),
  ('FM', '#7a3b8f'),
  ('CM', '#3b7a8f'),
  ('NM', '#5a7a3b'),
  ('WGM','#c2185b')
ON CONFLICT (title) DO NOTHING;

-- 3. Feedback table
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Bug Report','Feature Request','General Feedback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can submit feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner can read all feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "users can read own feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
