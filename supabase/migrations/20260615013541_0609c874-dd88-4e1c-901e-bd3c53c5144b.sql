
REVOKE EXECUTE ON FUNCTION
  public.deduct_credit(uuid),
  public.charge_credits(uuid, integer, text),
  public.refund_credits(uuid, integer, text),
  public.add_credits(uuid, integer, text, text),
  public.enforce_rate_limit(uuid, text, text, integer, integer),
  public.get_daily_free_uses(uuid),
  public.get_remaining_free_uses(uuid),
  public.deduct_daily_use(uuid),
  public.handle_new_user(),
  public.handle_new_user_credits(),
  public.set_updated_at(),
  public.update_credits_updated_at()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.deduct_credit(uuid),
  public.charge_credits(uuid, integer, text),
  public.get_daily_free_uses(uuid),
  public.get_remaining_free_uses(uuid),
  public.deduct_daily_use(uuid)
TO authenticated;

-- refund_credits, add_credits, enforce_rate_limit: backend-only (service_role retains access via ownership)
