-- Run this once in Supabase SQL Editor.
-- It enables RLS and removes direct access for anon/authenticated roles.

REVOKE ALL ON SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ton_deposit_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.balances FROM anon, authenticated;
REVOKE ALL ON TABLE public.transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.ton_deposit_claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.bets FROM anon, authenticated;
REVOKE ALL ON TABLE public.inventory_claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.inventory_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.market_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.promo_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.promo_redemptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_task_claims FROM anon, authenticated;

DROP POLICY IF EXISTS service_role_full_access ON public.users;
DROP POLICY IF EXISTS service_role_full_access ON public.balances;
DROP POLICY IF EXISTS service_role_full_access ON public.transactions;
DROP POLICY IF EXISTS service_role_full_access ON public.ton_deposit_claims;
DROP POLICY IF EXISTS service_role_full_access ON public.bets;
DROP POLICY IF EXISTS service_role_full_access ON public.inventory_claims;
DROP POLICY IF EXISTS service_role_full_access ON public.inventory_items;
DROP POLICY IF EXISTS service_role_full_access ON public.market_items;
DROP POLICY IF EXISTS service_role_full_access ON public.promo_codes;
DROP POLICY IF EXISTS service_role_full_access ON public.promo_redemptions;
DROP POLICY IF EXISTS service_role_full_access ON public.user_task_claims;

CREATE POLICY service_role_full_access ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.balances FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.ton_deposit_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.bets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.inventory_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.inventory_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.market_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.promo_redemptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.user_task_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
