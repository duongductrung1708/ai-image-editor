
CREATE TABLE public.credit_packs (
  id text PRIMARY KEY,
  credits integer NOT NULL CHECK (credits > 0),
  price_vnd integer NOT NULL CHECK (price_vnd > 0),
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_packs TO anon, authenticated;
GRANT ALL ON public.credit_packs TO service_role;

ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packs"
  ON public.credit_packs FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_credit_packs_updated_at
  BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.credit_packs (id, credits, price_vnd, label, description, sort_order, active)
VALUES
  ('pack_100', 100, 25000, '100 credits', '~$1', 1, true),
  ('pack_1000', 1000, 250000, '1.000 credits', '~$10', 2, true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_upsert_credit_pack(
  p_id text,
  p_credits integer,
  p_price_vnd integer,
  p_label text,
  p_description text,
  p_sort_order integer,
  p_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existed boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_id IS NULL OR length(trim(p_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_credits IS NULL OR p_credits <= 0 OR p_price_vnd IS NULL OR p_price_vnd <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.credit_packs WHERE id = p_id) INTO v_existed;

  INSERT INTO public.credit_packs (id, credits, price_vnd, label, description, sort_order, active)
  VALUES (p_id, p_credits, p_price_vnd, p_label, p_description, COALESCE(p_sort_order, 0), COALESCE(p_active, true))
  ON CONFLICT (id) DO UPDATE SET
    credits = EXCLUDED.credits,
    price_vnd = EXCLUDED.price_vnd,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active,
    updated_at = now();

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN v_existed THEN 'update_credit_pack' ELSE 'create_credit_pack' END,
    p_id,
    jsonb_build_object('credits', p_credits, 'price_vnd', p_price_vnd, 'label', p_label, 'active', p_active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_credit_pack(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  DELETE FROM public.credit_packs WHERE id = p_id;
  INSERT INTO public.admin_audit_log (actor_user_id, action, target_id, details)
  VALUES (auth.uid(), 'delete_credit_pack', p_id, '{}'::jsonb);
END;
$$;
