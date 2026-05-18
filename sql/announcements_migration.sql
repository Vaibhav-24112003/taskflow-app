-- ───────────────────────────────────────────────────────────────────────────
-- Announcements — admin-published in-app notices for logged-in users
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL,
  kind          text DEFAULT 'info',           -- info | success | warn | release
  cta_label     text,
  cta_url       text,
  active        boolean DEFAULT true,
  published_at  timestamptz DEFAULT now(),
  expires_at    timestamptz,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON public.announcements(active, published_at DESC);

-- Per-user read tracking → drives the red-dot badge
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at         timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION public.fn_announcements_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcements_touch ON public.announcements;
CREATE TRIGGER trg_announcements_touch
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_announcements_touch();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.announcements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Clean slate
DROP POLICY IF EXISTS "users see active announcements"   ON public.announcements;
DROP POLICY IF EXISTS "admins manage announcements"      ON public.announcements;
DROP POLICY IF EXISTS "users see own reads"              ON public.announcement_reads;
DROP POLICY IF EXISTS "users insert own reads"           ON public.announcement_reads;

-- Logged-in users see any currently-active announcement
CREATE POLICY "users see active announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND published_at <= now()
  );

-- Admin emails can do everything
CREATE POLICY "admins manage announcements"
  ON public.announcements
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') ILIKE '%@taskflowco.in')
  WITH CHECK ((auth.jwt() ->> 'email') ILIKE '%@taskflowco.in');

-- Read receipts: users own theirs
CREATE POLICY "users see own reads"
  ON public.announcement_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own reads"
  ON public.announcement_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Grants
GRANT SELECT                ON public.announcements      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements     TO authenticated;
GRANT SELECT, INSERT         ON public.announcement_reads TO authenticated;
