CREATE OR REPLACE FUNCTION public.claim_owner_role(_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _pin = '9f3KX7vQ2mL8pT6aR1nZ5cD4hJ9' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'owner')
    ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
  RETURN false;
END;
$function$;