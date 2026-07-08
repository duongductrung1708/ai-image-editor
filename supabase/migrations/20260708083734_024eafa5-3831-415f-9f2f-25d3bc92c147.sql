REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE ALL ON public.orders FROM anon;
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Only service role can insert orders" ON public.orders;
CREATE POLICY "Only service role can insert orders"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Only service role can update orders" ON public.orders;
CREATE POLICY "Only service role can update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Only service role can delete orders" ON public.orders;
CREATE POLICY "Only service role can delete orders"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (false);