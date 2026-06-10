-- Fix Auth RLS Initialization Plan
-- Replace auth.uid()/auth.jwt() with (select auth.uid())/(select auth.jwt())
-- Eliminates per-row re-evaluation — primary cause of Disk IO exhaustion

DROP POLICY IF EXISTS "User can read own request" ON public.access_requests;
CREATE POLICY "User can read own request" ON public.access_requests
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((select auth.uid()) = user_id) OR is_taskflow_admin()))
;

DROP POLICY IF EXISTS "User can submit own request" ON public.access_requests;
CREATE POLICY "User can submit own request" ON public.access_requests
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id))
;

DROP POLICY IF EXISTS "User can update own pending request" ON public.access_requests;
CREATE POLICY "User can update own pending request" ON public.access_requests
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((select auth.uid()) = user_id) OR is_taskflow_admin()))
  WITH CHECK ((((select auth.uid()) = user_id) OR is_taskflow_admin()))
;

DROP POLICY IF EXISTS "users insert own reads" ON public.announcement_reads;
CREATE POLICY "users insert own reads" ON public.announcement_reads
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "users see own reads" ON public.announcement_reads;
CREATE POLICY "users see own reads" ON public.announcement_reads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "admins manage announcements" ON public.announcements;
CREATE POLICY "admins manage announcements" ON public.announcements
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((((select auth.jwt()) ->> 'email'::text) ~~* '%@taskflowco.in'::text))
  WITH CHECK ((((select auth.jwt()) ->> 'email'::text) ~~* '%@taskflowco.in'::text))
;

DROP POLICY IF EXISTS "org members read attendance" ON public.attendance_entries;
CREATE POLICY "org members read attendance" ON public.attendance_entries
  AS PERMISSIVE FOR SELECT TO public
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members write attendance" ON public.attendance_entries;
CREATE POLICY "org members write attendance" ON public.attendance_entries
  AS PERMISSIVE FOR ALL TO public
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members write time logs" ON public.attendance_time_logs;
CREATE POLICY "org members write time logs" ON public.attendance_time_logs
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "auth_events_insert_self" ON public.auth_events;
CREATE POLICY "auth_events_insert_self" ON public.auth_events
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "auth_events_select_self_or_admin" ON public.auth_events;
CREATE POLICY "auth_events_select_self_or_admin" ON public.auth_events
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) OR is_taskflow_admin()))
;

DROP POLICY IF EXISTS "org members full access bc_sections" ON public.bc_sections;
CREATE POLICY "org members full access bc_sections" ON public.bc_sections
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members full access bc_task_statuses" ON public.bc_task_statuses;
CREATE POLICY "org members full access bc_task_statuses" ON public.bc_task_statuses
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((task_id IN ( SELECT bc_tasks.id
   FROM bc_tasks
  WHERE (bc_tasks.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org members full access bc_tasks" ON public.bc_tasks;
CREATE POLICY "org members full access bc_tasks" ON public.bc_tasks
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org_members_manage_cc_messages" ON public.client_connect_messages;
CREATE POLICY "org_members_manage_cc_messages" ON public.client_connect_messages
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((request_id IN ( SELECT client_connect_requests.id
   FROM client_connect_requests
  WHERE (client_connect_requests.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org_members_manage_cc_requests" ON public.client_connect_requests;
CREATE POLICY "org_members_manage_cc_requests" ON public.client_connect_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org_members_manage_cc_responses" ON public.client_connect_responses;
CREATE POLICY "org_members_manage_cc_responses" ON public.client_connect_responses
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((request_id IN ( SELECT client_connect_requests.id
   FROM client_connect_requests
  WHERE (client_connect_requests.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org members manage client_contacts" ON public.client_contacts;
CREATE POLICY "org members manage client_contacts" ON public.client_contacts
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "cc_delete_admin" ON public.client_credentials;
CREATE POLICY "cc_delete_admin" ON public.client_credentials
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((is_workspace_owner(org_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = client_credentials.org_id) AND (wm.user_id = (select auth.uid())) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "cc_insert_member" ON public.client_credentials;
CREATE POLICY "cc_insert_member" ON public.client_credentials
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_workspace_member(org_id, (select auth.uid())) OR is_workspace_owner(org_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "cc_select_member" ON public.client_credentials;
CREATE POLICY "cc_select_member" ON public.client_credentials
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_workspace_member(org_id, (select auth.uid())) OR is_workspace_owner(org_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "cc_update_admin" ON public.client_credentials;
CREATE POLICY "cc_update_admin" ON public.client_credentials
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_workspace_owner(org_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = client_credentials.org_id) AND (wm.user_id = (select auth.uid())) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "cp_delete_admin" ON public.client_playbooks;
CREATE POLICY "cp_delete_admin" ON public.client_playbooks
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((is_workspace_owner(org_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = client_playbooks.org_id) AND (wm.user_id = (select auth.uid())) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "cp_insert_member" ON public.client_playbooks;
CREATE POLICY "cp_insert_member" ON public.client_playbooks
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_workspace_member(org_id, (select auth.uid())) OR is_workspace_owner(org_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "cp_select_member" ON public.client_playbooks;
CREATE POLICY "cp_select_member" ON public.client_playbooks
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_workspace_member(org_id, (select auth.uid())) OR is_workspace_owner(org_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "cp_update_member" ON public.client_playbooks;
CREATE POLICY "cp_update_member" ON public.client_playbooks
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_workspace_member(org_id, (select auth.uid())) OR is_workspace_owner(org_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "org members manage portal access" ON public.client_portal_access;
CREATE POLICY "org members manage portal access" ON public.client_portal_access
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members manage request messages" ON public.client_request_messages;
CREATE POLICY "org members manage request messages" ON public.client_request_messages
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((request_id IN ( SELECT client_requests.id
   FROM client_requests
  WHERE (client_requests.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
  WITH CHECK ((request_id IN ( SELECT client_requests.id
   FROM client_requests
  WHERE (client_requests.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org members manage client requests" ON public.client_requests;
CREATE POLICY "org members manage client requests" ON public.client_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members manage client_tasks" ON public.client_tasks;
CREATE POLICY "org members manage client_tasks" ON public.client_tasks
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org members manage client_workspaces" ON public.client_workspaces;
CREATE POLICY "org members manage client_workspaces" ON public.client_workspaces
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org members can view clients" ON public.clients;
CREATE POLICY "org members can view clients" ON public.clients
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((org_id IS NULL) OR is_org_member(org_id) OR (created_by = (select auth.uid()))))
;

DROP POLICY IF EXISTS "comm_logs_org_access" ON public.comm_logs;
CREATE POLICY "comm_logs_org_access" ON public.comm_logs
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))) OR (org_id IN ( SELECT organizations.id
   FROM organizations
  WHERE (organizations.created_by = (select auth.uid()))))))
;

DROP POLICY IF EXISTS "daily_plans_delete" ON public.daily_plans;
CREATE POLICY "daily_plans_delete" ON public.daily_plans
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((select auth.uid()) = user_id))
;

DROP POLICY IF EXISTS "daily_plans_insert" ON public.daily_plans;
CREATE POLICY "daily_plans_insert" ON public.daily_plans
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id))
;

DROP POLICY IF EXISTS "daily_plans_select" ON public.daily_plans;
CREATE POLICY "daily_plans_select" ON public.daily_plans
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id))
;

DROP POLICY IF EXISTS "daily_plans_update" ON public.daily_plans;
CREATE POLICY "daily_plans_update" ON public.daily_plans
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select auth.uid()) = user_id))
;

DROP POLICY IF EXISTS "org admins can view member daily plans" ON public.daily_plans;
CREATE POLICY "org admins can view member daily plans" ON public.daily_plans
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (organization_members viewer
     JOIN organization_members target ON (((target.org_id = viewer.org_id) AND (target.user_id = daily_plans.user_id))))
  WHERE ((viewer.user_id = (select auth.uid())) AND (viewer.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))
;

DROP POLICY IF EXISTS "users manage own daily plans" ON public.daily_plans;
CREATE POLICY "users manage own daily plans" ON public.daily_plans
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "taskflow read" ON public.demo_requests;
CREATE POLICY "taskflow read" ON public.demo_requests
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.email ~~ '%@taskflowco.in'::text))))
;

DROP POLICY IF EXISTS "taskflow update" ON public.demo_requests;
CREATE POLICY "taskflow update" ON public.demo_requests
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select auth.uid()) IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.email ~~ '%@taskflowco.in'::text))))
;

DROP POLICY IF EXISTS "dept_members_org_member" ON public.department_members;
CREATE POLICY "dept_members_org_member" ON public.department_members
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "dept_org_member" ON public.departments;
CREATE POLICY "dept_org_member" ON public.departments
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members manage email_templates" ON public.email_templates;
CREATE POLICY "org members manage email_templates" ON public.email_templates
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org members manage invoice_items" ON public.invoice_items;
CREATE POLICY "org members manage invoice_items" ON public.invoice_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
  WITH CHECK ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org members manage invoice_payments" ON public.invoice_payments;
CREATE POLICY "org members manage invoice_payments" ON public.invoice_payments
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
  WITH CHECK ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "invoices_org" ON public.invoices;
CREATE POLICY "invoices_org" ON public.invoices
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "itr_org_member" ON public.itr_compilation;
CREATE POLICY "itr_org_member" ON public.itr_compilation
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "itr_tpl_org_member" ON public.itr_templates;
CREATE POLICY "itr_tpl_org_member" ON public.itr_templates
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "leave_requests_org" ON public.leave_requests;
CREATE POLICY "leave_requests_org" ON public.leave_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "mda_org_member" ON public.member_dept_access;
CREATE POLICY "mda_org_member" ON public.member_dept_access
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "mma_org_member" ON public.member_module_access;
CREATE POLICY "mma_org_member" ON public.member_module_access
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "member_perms_org_member" ON public.member_permissions;
CREATE POLICY "member_perms_org_member" ON public.member_permissions
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "note_shares_self_select" ON public.note_shares;
CREATE POLICY "note_shares_self_select" ON public.note_shares
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "notes_owner_all" ON public.notes;
CREATE POLICY "notes_owner_all" ON public.notes
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((owner_id = (select auth.uid())))
  WITH CHECK ((owner_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "org_members_manage_cloud_storage" ON public.org_cloud_storage;
CREATE POLICY "org_members_manage_cloud_storage" ON public.org_cloud_storage
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "org_events_insert_admin" ON public.org_events;
CREATE POLICY "org_events_insert_admin" ON public.org_events
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_taskflow_admin() OR (actor_id = (select auth.uid()))))
;

DROP POLICY IF EXISTS "org_events_select_admin_or_member" ON public.org_events;
CREATE POLICY "org_events_select_admin_or_member" ON public.org_events
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_taskflow_admin() OR (EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = org_events.org_id) AND (m.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org admins can manage org_group_members" ON public.org_group_members;
CREATE POLICY "org admins can manage org_group_members" ON public.org_group_members
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((group_id IN ( SELECT org_groups.id
   FROM org_groups
  WHERE (org_groups.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))))
;

DROP POLICY IF EXISTS "org members can read org_group_members" ON public.org_group_members;
CREATE POLICY "org members can read org_group_members" ON public.org_group_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((group_id IN ( SELECT org_groups.id
   FROM org_groups
  WHERE (org_groups.org_id IN ( SELECT organization_members.org_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org admins can manage org_groups" ON public.org_groups;
CREATE POLICY "org admins can manage org_groups" ON public.org_groups
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))
;

DROP POLICY IF EXISTS "org members can read org_groups" ON public.org_groups;
CREATE POLICY "org members can read org_groups" ON public.org_groups
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "Anyone involved can update org invitations" ON public.org_invitations;
CREATE POLICY "Anyone involved can update org invitations" ON public.org_invitations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((invitee_email = ((select auth.jwt()) ->> 'email'::text)) OR (inviter_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = org_invitations.org_id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "Users can view their own org invitations" ON public.org_invitations;
CREATE POLICY "Users can view their own org invitations" ON public.org_invitations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((invitee_email = ((select auth.jwt()) ->> 'email'::text)))
;

DROP POLICY IF EXISTS "org admins can insert invitations" ON public.org_invitations;
CREATE POLICY "org admins can insert invitations" ON public.org_invitations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((inviter_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = org_invitations.org_id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "org members can view invitations" ON public.org_invitations;
CREATE POLICY "org members can view invitations" ON public.org_invitations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((inviter_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = org_invitations.org_id) AND (organization_members.user_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "org_roles_member" ON public.org_roles;
CREATE POLICY "org_roles_member" ON public.org_roles
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "sops_delete_admin" ON public.org_sops;
CREATE POLICY "sops_delete_admin" ON public.org_sops
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((is_workspace_owner(org_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = org_sops.org_id) AND (wm.user_id = (select auth.uid())) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "sops_insert_admin" ON public.org_sops;
CREATE POLICY "sops_insert_admin" ON public.org_sops
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_workspace_owner(org_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = org_sops.org_id) AND (wm.user_id = (select auth.uid())) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "sops_select_member" ON public.org_sops;
CREATE POLICY "sops_select_member" ON public.org_sops
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_workspace_member(org_id, (select auth.uid())) OR is_workspace_owner(org_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "sops_update_admin" ON public.org_sops;
CREATE POLICY "sops_update_admin" ON public.org_sops
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_workspace_owner(org_id, (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.workspace_id = org_sops.org_id) AND (wm.user_id = (select auth.uid())) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "Invited users can join org" ON public.organization_members;
CREATE POLICY "Invited users can join org" ON public.organization_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "Org admins can remove members" ON public.organization_members;
CREATE POLICY "Org admins can remove members" ON public.organization_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.org_id = organization_members.org_id) AND (om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "Org admins can update member roles" ON public.organization_members;
CREATE POLICY "Org admins can update member roles" ON public.organization_members
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.org_id = organization_members.org_id) AND (om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "org members can view members" ON public.organization_members;
CREATE POLICY "org members can view members" ON public.organization_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_org_member(org_id) OR (user_id = (select auth.uid()))))
;

DROP POLICY IF EXISTS "owners can manage members" ON public.organization_members;
CREATE POLICY "owners can manage members" ON public.organization_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.org_id = om.org_id) AND (om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "owners can remove members" ON public.organization_members;
CREATE POLICY "owners can remove members" ON public.organization_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.org_id = om.org_id) AND (om.user_id = (select auth.uid())) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "Invited users can view org" ON public.organizations;
CREATE POLICY "Invited users can view org" ON public.organizations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id IN ( SELECT org_invitations.org_id
   FROM org_invitations
  WHERE ((org_invitations.invitee_email = ((select auth.jwt()) ->> 'email'::text)) AND (org_invitations.status = 'pending'::text)))))
;

DROP POLICY IF EXISTS "anyone can create org" ON public.organizations;
CREATE POLICY "anyone can create org" ON public.organizations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((created_by = (select auth.uid())))
;

DROP POLICY IF EXISTS "members can view their orgs" ON public.organizations;
CREATE POLICY "members can view their orgs" ON public.organizations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_org_member(id) OR (created_by = (select auth.uid()))))
;

DROP POLICY IF EXISTS "owners can delete org" ON public.organizations;
CREATE POLICY "owners can delete org" ON public.organizations
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((created_by = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = organizations.id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = 'owner'::text))))))
;

DROP POLICY IF EXISTS "owners can update org" ON public.organizations;
CREATE POLICY "owners can update org" ON public.organizations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = organizations.id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "payments_org" ON public.payments;
CREATE POLICY "payments_org" ON public.payments
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "performance_reviews_org" ON public.performance_reviews;
CREATE POLICY "performance_reviews_org" ON public.performance_reviews
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "User can insert own profile" ON public.profiles;
CREATE POLICY "User can insert own profile" ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = id))
;

DROP POLICY IF EXISTS "User can update own profile" ON public.profiles;
CREATE POLICY "User can update own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select auth.uid()) = id))
;

DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = (select auth.uid())) OR is_taskflow_admin()))
;

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = (select auth.uid())))
  WITH CHECK ((id = (select auth.uid())))
;

DROP POLICY IF EXISTS "proposals_org" ON public.proposals;
CREATE POLICY "proposals_org" ON public.proposals
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "role_perms_member" ON public.role_permissions;
CREATE POLICY "role_perms_member" ON public.role_permissions
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "admins manage all tickets" ON public.support_tickets;
CREATE POLICY "admins manage all tickets" ON public.support_tickets
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((((select auth.jwt()) ->> 'email'::text) ~~* '%@taskflowco.in'::text))
  WITH CHECK ((((select auth.jwt()) ->> 'email'::text) ~~* '%@taskflowco.in'::text))
;

DROP POLICY IF EXISTS "users see own tickets" ON public.support_tickets;
CREATE POLICY "users see own tickets" ON public.support_tickets
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) OR (email = ((select auth.jwt()) ->> 'email'::text))))
;

DROP POLICY IF EXISTS "task_activity_insert" ON public.task_activity;
CREATE POLICY "task_activity_insert" ON public.task_activity
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "task_activity_select" ON public.task_activity;
CREATE POLICY "task_activity_select" ON public.task_activity
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_activity.task_id) AND is_workspace_member(t.workspace_id, (select auth.uid()))))))
;

DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;
CREATE POLICY "task_comments_delete" ON public.task_comments
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
CREATE POLICY "task_comments_insert" ON public.task_comments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
CREATE POLICY "task_comments_select" ON public.task_comments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_comments.task_id) AND is_workspace_member(t.workspace_id, (select auth.uid()))))))
;

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((created_by = (select auth.uid())) OR is_workspace_owner(workspace_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = (select auth.uid())) AND (is_workspace_member(workspace_id, (select auth.uid())) OR is_workspace_owner(workspace_id, (select auth.uid())))))
;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_workspace_member(workspace_id, (select auth.uid())) OR is_workspace_owner(workspace_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_workspace_member(workspace_id, (select auth.uid())) OR is_workspace_owner(workspace_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "org members manage time_entries" ON public.time_entries;
CREATE POLICY "org members manage time_entries" ON public.time_entries
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((org_id IN ( SELECT organization_members.org_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
;

DROP POLICY IF EXISTS "Users manage own prefs" ON public.user_worksheet_prefs;
CREATE POLICY "Users manage own prefs" ON public.user_worksheet_prefs
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((select auth.uid()) = user_id))
;

DROP POLICY IF EXISTS "Org admins can delete work_type_configs" ON public.work_type_configs;
CREATE POLICY "Org admins can delete work_type_configs" ON public.work_type_configs
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = work_type_configs.org_id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "Org admins can insert work_type_configs" ON public.work_type_configs;
CREATE POLICY "Org admins can insert work_type_configs" ON public.work_type_configs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = work_type_configs.org_id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "Org admins can update work_type_configs" ON public.work_type_configs;
CREATE POLICY "Org admins can update work_type_configs" ON public.work_type_configs
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = work_type_configs.org_id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = work_type_configs.org_id) AND (organization_members.user_id = (select auth.uid())) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "Org members can read work_type_configs" ON public.work_type_configs;
CREATE POLICY "Org members can read work_type_configs" ON public.work_type_configs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = work_type_configs.org_id) AND (organization_members.user_id = (select auth.uid()))))))
;

DROP POLICY IF EXISTS "worksheet_rows_write" ON public.worksheet_rows;
CREATE POLICY "worksheet_rows_write" ON public.worksheet_rows
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.org_id = worksheet_rows.org_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.org_id = worksheet_rows.org_id)))))
;

DROP POLICY IF EXISTS "invitations_select" ON public.workspace_invitations;
CREATE POLICY "invitations_select" ON public.workspace_invitations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((workspace_id IN ( SELECT get_user_workspace_ids((select auth.uid())) AS get_user_workspace_ids)) OR (invitee_email = ( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) OR ((select auth.uid()) IS NOT NULL)))
;

DROP POLICY IF EXISTS "invitee_updates_own" ON public.workspace_invitations;
CREATE POLICY "invitee_updates_own" ON public.workspace_invitations
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((invitee_email = ( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) OR (workspace_id IN ( SELECT workspace_members.workspace_id
   FROM workspace_members
  WHERE ((workspace_members.user_id = (select auth.uid())) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "owners_delete_invites" ON public.workspace_invitations;
CREATE POLICY "owners_delete_invites" ON public.workspace_invitations
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM workspace_members
  WHERE ((workspace_members.user_id = (select auth.uid())) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
;

DROP POLICY IF EXISTS "owners_insert_invites" ON public.workspace_invitations;
CREATE POLICY "owners_insert_invites" ON public.workspace_invitations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((inviter_id = (select auth.uid())) AND (workspace_id IN ( SELECT workspace_members.workspace_id
   FROM workspace_members
  WHERE ((workspace_members.user_id = (select auth.uid())) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;
CREATE POLICY "workspace_members_delete" ON public.workspace_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = (select auth.uid())) OR is_workspace_owner(workspace_id, (select auth.uid()))))
;

DROP POLICY IF EXISTS "workspace_members_delete_owner" ON public.workspace_members;
CREATE POLICY "workspace_members_delete_owner" ON public.workspace_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = (select auth.uid()))))))
;

DROP POLICY IF EXISTS "workspace_members_insert_owner_or_self" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_owner_or_self" ON public.workspace_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = (select auth.uid())))))))
;

DROP POLICY IF EXISTS "workspace_members_insert_self" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_self" ON public.workspace_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "workspace_members_select_member" ON public.workspace_members;
CREATE POLICY "workspace_members_select_member" ON public.workspace_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((workspace_id IN ( SELECT get_user_workspace_ids((select auth.uid())) AS get_user_workspace_ids)))
;

DROP POLICY IF EXISTS "owners can update workspace" ON public.workspaces;
CREATE POLICY "owners can update workspace" ON public.workspaces
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((owner_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members
  WHERE ((workspace_members.workspace_id = workspaces.id) AND (workspace_members.user_id = (select auth.uid())) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;

DROP POLICY IF EXISTS "workspaces_delete_owner" ON public.workspaces;
CREATE POLICY "workspaces_delete_owner" ON public.workspaces
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((owner_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "workspaces_insert_owner" ON public.workspaces;
CREATE POLICY "workspaces_insert_owner" ON public.workspaces
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((owner_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
CREATE POLICY "workspaces_select_member" ON public.workspaces
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((owner_id = (select auth.uid())) OR (id IN ( SELECT get_user_workspace_ids((select auth.uid())) AS get_user_workspace_ids))))
;

DROP POLICY IF EXISTS "workspaces_update_owner" ON public.workspaces;
CREATE POLICY "workspaces_update_owner" ON public.workspaces
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((owner_id = (select auth.uid())))
;

DROP POLICY IF EXISTS "workspaces_update_owner_or_admin" ON public.workspaces;
CREATE POLICY "workspaces_update_owner_or_admin" ON public.workspaces
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((owner_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workspace_members
  WHERE ((workspace_members.workspace_id = workspaces.id) AND (workspace_members.user_id = (select auth.uid())) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
;
