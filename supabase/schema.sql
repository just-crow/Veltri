-- ============================================
-- Note Publishing Platform - Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anyone can read user profiles
CREATE POLICY "Users are publicly readable"
  ON public.users FOR SELECT
  USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. NOTES TABLE
-- ============================================
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT, -- HTML/JSON content
  raw_markdown TEXT, -- Raw markdown content
  slug TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  validation_score NUMERIC,
  validation_feedback TEXT,
  validation_accuracy_score NUMERIC,
  ai_detection_label TEXT,
  ai_detection_score NUMERIC,
  ai_detection_is_likely_ai BOOLEAN,
  ai_detection_summary TEXT,
  ai_detection_checked_at TIMESTAMPTZ,
  original_file_name TEXT,
  original_file_path TEXT,
  original_file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- Add full-text search index
ALTER TABLE public.notes ADD COLUMN fts tsvector 
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(raw_markdown, ''))
  ) STORED;

CREATE INDEX notes_fts_idx ON public.notes USING gin(fts);
CREATE INDEX notes_user_id_idx ON public.notes(user_id);
CREATE INDEX notes_is_published_idx ON public.notes(is_published);
CREATE INDEX notes_slug_idx ON public.notes(slug);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Anyone can read published notes
CREATE POLICY "Published notes are publicly readable"
  ON public.notes FOR SELECT
  USING (is_published = true OR auth.uid() = user_id);

-- Users can insert their own notes
CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notes
CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. TAGS TABLE
-- ============================================
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Anyone can read tags
CREATE POLICY "Tags are publicly readable"
  ON public.tags FOR SELECT
  USING (true);

-- Authenticated users can create tags
CREATE POLICY "Authenticated users can create tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- 4. NOTE_TAGS TABLE (Junction)
-- ============================================
CREATE TABLE public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;

-- Anyone can read note_tags
CREATE POLICY "Note tags are publicly readable"
  ON public.note_tags FOR SELECT
  USING (true);

-- Users can manage tags on their own notes
CREATE POLICY "Users can insert tags on own notes"
  ON public.note_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes WHERE id = note_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tags on own notes"
  ON public.note_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes WHERE id = note_id AND user_id = auth.uid()
    )
  );

-- ============================================
-- 5. COMMENTS TABLE
-- ============================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX comments_note_id_idx ON public.comments(note_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments on published notes
CREATE POLICY "Comments on published notes are readable"
  ON public.comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes WHERE id = note_id AND is_published = true
    )
  );

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 6. STORAGE BUCKET for images and files
-- ============================================
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'note-images', 
  'note-images', 
  true, 
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown']::text[],
  10485760 -- 10MB limit
)
ON CONFLICT (id) DO UPDATE 
SET 
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY "Anyone can read note images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'note-images');

CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'note-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'note-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- 7. MARKETPLACE: points_balance & dollar_balance on users, price on notes
-- ============================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dollar_balance NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Ensure price is valid (0 to 999.99)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_price_range'
  ) THEN
    ALTER TABLE public.notes ADD CONSTRAINT notes_price_range CHECK (price >= 0 AND price <= 999.99);
  END IF;
END $$;

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================
-- 8. TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('points_purchase','note_bought_points','note_bought_dollars','note_sale')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,       -- dollar amount
  points_amount INTEGER NOT NULL DEFAULT 0,       -- points involved
  note_id UUID REFERENCES public.notes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions(user_id);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 9. PURCHASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  price_paid NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('points','dollars')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(buyer_id, note_id)
);

CREATE INDEX IF NOT EXISTS purchases_buyer_id_idx ON public.purchases(buyer_id);
CREATE INDEX IF NOT EXISTS purchases_note_id_idx ON public.purchases(note_id);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Buyers can see their own purchases
CREATE POLICY "Users can read own purchases"
  ON public.purchases FOR SELECT
  USING (auth.uid() = buyer_id);

-- Publishers can see purchases of their notes
CREATE POLICY "Publishers can read sales of own notes"
  ON public.purchases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes WHERE id = note_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own purchases"
  ON public.purchases FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- ============================================
-- 10. FUNCTION: Auto-create user profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1) || '_' || SUBSTR(NEW.id::text, 1, 4)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 11. FUNCTION: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 12. FUNCTION: Atomic points purchase (buy points)
-- ============================================
CREATE OR REPLACE FUNCTION public.buy_points(
  p_user_id UUID,
  p_amount NUMERIC,
  p_points INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Atomically increment points balance
  UPDATE public.users
    SET points_balance = points_balance + p_points
    WHERE id = p_user_id
    RETURNING points_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount, points_amount)
  VALUES (p_user_id, 'points_purchase', p_amount, p_points);

  RETURN json_build_object(
    'new_balance', v_new_balance,
    'points_credited', p_points
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 13. FUNCTION: Atomic note purchase
-- ============================================
CREATE OR REPLACE FUNCTION public.purchase_note(
  p_buyer_id UUID,
  p_note_id UUID,
  p_payment_method TEXT,       -- 'points' or 'dollars'
  p_dollar_price NUMERIC,     -- full dollar price of the note
  p_amount_charged NUMERIC,   -- actual amount charged (may be discounted)
  p_points_cost INTEGER       -- points to deduct (0 for dollar payment)
)
RETURNS JSON AS $$
DECLARE
  v_buyer_balance INTEGER;
  v_publisher_id UUID;
  v_is_exclusive BOOLEAN;
  v_is_sold BOOLEAN;
  v_tx_type TEXT;
BEGIN
  -- Get note details including exclusive/sold status
  SELECT user_id, is_exclusive, is_sold
    INTO v_publisher_id, v_is_exclusive, v_is_sold
    FROM public.notes WHERE id = p_note_id;

  IF v_publisher_id IS NULL THEN
    RAISE EXCEPTION 'Note not found';
  END IF;

  -- Prevent double-purchase
  IF EXISTS (SELECT 1 FROM public.purchases WHERE buyer_id = p_buyer_id AND note_id = p_note_id) THEN
    RAISE EXCEPTION 'Already purchased';
  END IF;

  -- Block purchase if exclusive note is already sold
  IF v_is_exclusive AND v_is_sold THEN
    RAISE EXCEPTION 'Exclusive note already sold';
  END IF;

  IF p_payment_method = 'points' THEN
    -- Deduct buyer's points (atomic)
    UPDATE public.users
      SET points_balance = points_balance - p_points_cost
      WHERE id = p_buyer_id AND points_balance >= p_points_cost
      RETURNING points_balance INTO v_buyer_balance;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient points';
    END IF;

    v_tx_type := 'note_bought_points';
  ELSE
    -- Dollar payment: no balance deduction from buyer
    v_buyer_balance := 0;
    v_tx_type := 'note_bought_dollars';
  END IF;

  -- Credit publisher's dollar balance (atomic)
  UPDATE public.users
    SET dollar_balance = dollar_balance + p_dollar_price
    WHERE id = v_publisher_id;

  -- Record buyer transaction
  INSERT INTO public.transactions (user_id, type, amount, points_amount, note_id)
  VALUES (p_buyer_id, v_tx_type, p_amount_charged, p_points_cost, p_note_id);

  -- Record publisher sale transaction
  INSERT INTO public.transactions (user_id, type, amount, points_amount, note_id)
  VALUES (v_publisher_id, 'note_sale', p_dollar_price, 0, p_note_id);

  -- Create purchase record
  INSERT INTO public.purchases (buyer_id, note_id, price_paid, payment_method)
  VALUES (p_buyer_id, p_note_id, p_amount_charged, p_payment_method);

  -- If exclusive, mark the note as sold (off the market)
  IF v_is_exclusive THEN
    UPDATE public.notes SET is_sold = true WHERE id = p_note_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'buyer_points_balance', v_buyer_balance,
    'payment_method', p_payment_method,
    'amount_charged', p_amount_charged,
    'points_deducted', p_points_cost,
    'is_exclusive', v_is_exclusive
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
