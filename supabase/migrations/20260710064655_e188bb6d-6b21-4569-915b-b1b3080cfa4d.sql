
-- 1) Remove hardcoded admin-email backdoor trigger + function
DROP TRIGGER IF EXISTS on_auth_user_created_grant_seed_admin ON auth.users;
DROP FUNCTION IF EXISTS public.grant_admin_for_seed_email();

-- 2) Lock down SECURITY DEFINER functions: remove PUBLIC/anon EXECUTE,
--    grant EXECUTE only to the roles that legitimately call each function.
DO $$
DECLARE
  fn text;
  user_fns text[] := ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.get_daily_free_uses(uuid)',
    'public.get_remaining_free_uses(uuid)',
    'public.deduct_daily_use(uuid)',
    'public.deduct_credit(uuid)',
    'public.charge_credits(uuid, integer, text)'
  ];
  service_fns text[] := ARRAY[
    'public.refund_credits(uuid, integer, text)',
    'public.add_credits(uuid, integer, text, text)',
    'public.enforce_rate_limit(uuid, text, text, integer, integer)',
    'public.handle_new_user()',
    'public.handle_new_user_credits()',
    'public.set_updated_at()',
    'public.update_credits_updated_at()'
  ];
BEGIN
  FOREACH fn IN ARRAY user_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
  FOREACH fn IN ARRAY service_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
