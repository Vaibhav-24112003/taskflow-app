-- Fix RLS DELETE policy for organizations to also allow created_by (org creator).
-- Previously only checked organization_members role='owner', which would silently
-- fail for orgs where the creator was never added to organization_members.
DROP POLICY IF EXISTS "owners can delete org" ON public.organizations;
CREATE POLICY "owners can delete org" ON public.organizations FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = organizations.id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );
