-- ============================================
-- DONATIONS TABLE
-- ============================================
-- Allows readers to tip authors of free notes using their points balance.

CREATE TABLE IF NOT EXISTS public.donations (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note_id         UUID        NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  points_amount   INTEGER     NOT NULL CHECK (points_amount > 0),  -- full amount sent by donor
  points_received INTEGER     NOT NULL CHECK (points_received > 0), -- after 30% platform fee
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_donation CHECK (donor_id <> recipient_id)
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Donors can read their own donation history
CREATE POLICY "Donors can view own donations"
  ON public.donations FOR SELECT
  USING (auth.uid() = donor_id);

-- Recipients can see donations they received
CREATE POLICY "Recipients can view received donations"
  ON public.donations FOR SELECT
  USING (auth.uid() = recipient_id);

-- Authenticated users can insert donations (API enforces all other rules)
CREATE POLICY "Authenticated users can insert donations"
  ON public.donations FOR INSERT
  WITH CHECK (auth.uid() = donor_id);

-- Index for quick lookup by note or user
CREATE INDEX IF NOT EXISTS donations_note_id_idx    ON public.donations(note_id);
CREATE INDEX IF NOT EXISTS donations_donor_id_idx   ON public.donations(donor_id);
CREATE INDEX IF NOT EXISTS donations_recipient_id_idx ON public.donations(recipient_id);
