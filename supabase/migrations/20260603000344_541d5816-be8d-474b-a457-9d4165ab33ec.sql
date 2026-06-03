-- Add ordering column to custom_bots and allow owners to manage all bots.
ALTER TABLE public.custom_bots
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_custom_bots_tier_order
  ON public.custom_bots (tier, order_index);

-- Owner role can update / delete ANY bot for library management.
DROP POLICY IF EXISTS "Owners can update any bot" ON public.custom_bots;
CREATE POLICY "Owners can update any bot"
  ON public.custom_bots FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "Owners can delete any bot" ON public.custom_bots;
CREATE POLICY "Owners can delete any bot"
  ON public.custom_bots FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));