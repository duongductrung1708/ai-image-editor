
REVOKE EXECUTE ON FUNCTION public.deduct_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.charge_credits(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_free_uses(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_remaining_free_uses(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_daily_use(uuid) FROM anon;
