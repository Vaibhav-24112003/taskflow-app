-- Fix NO ACTION FK constraints on leave_requests and performance_reviews
-- that were blocking org deletion (all other org_id FKs already CASCADE).
ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_org_id_fkey,
  ADD CONSTRAINT leave_requests_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.performance_reviews
  DROP CONSTRAINT IF EXISTS performance_reviews_org_id_fkey,
  ADD CONSTRAINT performance_reviews_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
