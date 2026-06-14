
-- Fix mutable search_path on trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- Revoke EXECUTE from anon/public on sensitive SECURITY DEFINER functions.
-- These should only be callable by authenticated users (with internal auth.uid() checks)
-- or service_role (edge functions).
REVOKE EXECUTE ON FUNCTION public.deduct_credit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.charge_credits(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_remaining_free_uses(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_free_uses(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_daily_use(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.deduct_credit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_rate_limit(uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_remaining_free_uses(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_free_uses(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_daily_use(uuid) TO authenticated, service_role;
