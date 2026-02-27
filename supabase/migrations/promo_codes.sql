-- =================================================================
-- PROMO CODES MIGRATION
-- Run this entire file in the Supabase SQL Editor (one paste, one Run)
-- Safe to re-run — all statements use IF NOT EXISTS / OR REPLACE
-- =================================================================

-- 1. Promo codes table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  points_amount INTEGER NOT NULL CHECK (points_amount > 0),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER, -- NULL means unlimited
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_codes_code_idx ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS promo_codes_is_active_idx ON public.promo_codes(is_active);

-- 2. Promo code redemptions table (track who redeemed what)
CREATE TABLE IF NOT EXISTS public.promo_code_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points_received INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(promo_code_id, user_id) -- One redemption per user per code
);

CREATE INDEX IF NOT EXISTS promo_code_redemptions_user_id_idx ON public.promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS promo_code_redemptions_promo_code_id_idx ON public.promo_code_redemptions(promo_code_id);

-- 3. Row Level Security
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Promo codes: Read-only for authenticated users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read active promo codes' AND tablename = 'promo_codes') THEN
    CREATE POLICY "Authenticated users can read active promo codes"
      ON public.promo_codes FOR SELECT 
      USING (auth.uid() IS NOT NULL AND is_active = true);
  END IF;
END $$;

-- Promo code redemptions: Users can read their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own redemptions' AND tablename = 'promo_code_redemptions') THEN
    CREATE POLICY "Users can read own redemptions"
      ON public.promo_code_redemptions FOR SELECT 
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Function to redeem promo code
CREATE OR REPLACE FUNCTION redeem_promo_code(p_code TEXT, p_user_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT, points_received INTEGER) AS $$
DECLARE
  v_promo_code_id UUID;
  v_points_amount INTEGER;
  v_expires_at TIMESTAMPTZ;
  v_is_active BOOLEAN;
  v_max_uses INTEGER;
  v_current_uses INTEGER;
  v_already_redeemed BOOLEAN;
BEGIN
  -- Fetch promo code details
  SELECT id, points_amount, expires_at, is_active, max_uses, current_uses
  INTO v_promo_code_id, v_points_amount, v_expires_at, v_is_active, v_max_uses, v_current_uses
  FROM public.promo_codes
  WHERE code = p_code;

  -- Check if code exists
  IF v_promo_code_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invalid promo code'::TEXT, 0;
    RETURN;
  END IF;

  -- Check if code is active
  IF NOT v_is_active THEN
    RETURN QUERY SELECT false, 'This promo code is no longer active'::TEXT, 0;
    RETURN;
  END IF;

  -- Check if code is expired
  IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
    RETURN QUERY SELECT false, 'This promo code has expired'::TEXT, 0;
    RETURN;
  END IF;

  -- Check if max uses reached
  IF v_max_uses IS NOT NULL AND v_current_uses >= v_max_uses THEN
    RETURN QUERY SELECT false, 'This promo code has reached its maximum usage limit'::TEXT, 0;
    RETURN;
  END IF;

  -- Check if user already redeemed this code
  SELECT EXISTS(
    SELECT 1 FROM public.promo_code_redemptions
    WHERE promo_code_id = v_promo_code_id AND user_id = p_user_id
  ) INTO v_already_redeemed;

  IF v_already_redeemed THEN
    RETURN QUERY SELECT false, 'You have already redeemed this promo code'::TEXT, 0;
    RETURN;
  END IF;

  -- All checks passed, redeem the code
  -- 1. Insert redemption record
  INSERT INTO public.promo_code_redemptions (promo_code_id, user_id, points_received)
  VALUES (v_promo_code_id, p_user_id, v_points_amount);

  -- 2. Update user's points balance
  UPDATE public.users
  SET points_balance = points_balance + v_points_amount
  WHERE id = p_user_id;

  -- 3. Increment current uses
  UPDATE public.promo_codes
  SET current_uses = current_uses + 1
  WHERE id = v_promo_code_id;

  -- 4. Create transaction record
  INSERT INTO public.transactions (user_id, type, points_amount, amount)
  VALUES (p_user_id, 'promo_code_redemption', v_points_amount, 0);

  RETURN QUERY SELECT true, 'Promo code redeemed successfully!'::TEXT, v_points_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION redeem_promo_code(TEXT, UUID) TO authenticated;

-- 5. Add promo_code_redemption to transactions type check
-- First, drop the existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'transactions_type_check'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
  END IF;
END $$;

-- Add the new constraint with the additional type
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('points_purchase','note_bought_points','note_bought_dollars','note_sale','promo_code_redemption'));

-- 6. Sample promo codes (optional - you can delete or modify these)
-- These are just examples to get started
INSERT INTO public.promo_codes (code, points_amount, expires_at, max_uses)
VALUES 
  ('WELCOME100', 100, NOW() + INTERVAL '30 days', NULL),
  ('BETA50', 50, NOW() + INTERVAL '7 days', 100)
ON CONFLICT (code) DO NOTHING;
