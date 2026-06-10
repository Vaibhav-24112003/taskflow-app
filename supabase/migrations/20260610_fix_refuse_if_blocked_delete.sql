-- Fix refuse_if_blocked() silently cancelling DELETEs.
-- A BEFORE DELETE trigger returning NEW (which is NULL on DELETE) aborts the
-- row deletion with no error. Must return OLD on DELETE. This blocked deletes
-- on organizations, clients, invoices, tasks, worksheets, worksheet_rows,
-- workspaces, and organization_members for every non-blocked user.
-- This was the real reason "Delete Practice" did nothing (FK + RLS were fine).
CREATE OR REPLACE FUNCTION public.refuse_if_blocked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare blocked boolean;
begin
  if auth.uid() is not null then
    select is_blocked into blocked from public.profiles where id = auth.uid();
    if blocked then
      raise exception 'user is blocked' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end$function$;
