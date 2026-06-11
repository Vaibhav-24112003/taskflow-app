-- Fix remaining auth.uid() calls not covered by 20260610_fix_rls_auth_initplan.sql.
-- These policies/functions were added after that migration ran.
-- Using (select auth.uid()) caches the result per query instead of re-evaluating per row.

-- ── organizations: delete policy (added in 20260610_fix_org_delete_rls.sql) ────
DROP POLICY IF EXISTS "owners can delete org" ON public.organizations;
CREATE POLICY "owners can delete org" ON public.organizations FOR DELETE
  USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = organizations.id
        AND user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

-- ── notes policies (added in 20260606_notes_with_sharing.sql) ───────────────
DROP POLICY IF EXISTS notes_owner_all ON public.notes;
CREATE POLICY notes_owner_all ON public.notes FOR ALL
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS note_shares_self_select ON public.note_shares;
CREATE POLICY note_shares_self_select ON public.note_shares FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- ── SECURITY DEFINER note helper functions ───────────────────────────────────
-- These are called once per USING expression (already cached at function scope),
-- but caching auth.uid() inside them avoids a syscall if the function is ever
-- called more than once per transaction.
CREATE OR REPLACE FUNCTION public.is_note_owner(p_note_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.notes WHERE id = p_note_id AND owner_id = (SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.note_shared_to_me(p_note_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.note_shares WHERE note_id = p_note_id AND user_id = (SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.note_can_edit_shared(p_note_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.note_shares WHERE note_id = p_note_id AND user_id = (SELECT auth.uid()) AND can_edit = true);
$$;
