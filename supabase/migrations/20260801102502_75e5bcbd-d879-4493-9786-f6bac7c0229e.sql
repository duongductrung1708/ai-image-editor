ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type = ANY (ARRAY[
    'topup'::text,
    'usage'::text,
    'bonus'::text,
    'charge'::text,
    'refund'::text,
    'admin_topup'::text,
    'admin_debit'::text
  ]));