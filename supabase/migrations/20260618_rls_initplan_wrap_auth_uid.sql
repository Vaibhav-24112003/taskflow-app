-- Perf: wrap bare auth.uid() as (select auth.uid()) so Postgres evaluates it
-- once per query (initplan) instead of once per row. Semantics unchanged.
-- Targets the 20 policies flagged by the auth_rls_initplan advisor lint.

-- cc_form_templates
alter policy ccft_delete on public.cc_form_templates
  using (created_by = (select auth.uid()));
alter policy ccft_insert on public.cc_form_templates
  with check ((created_by = (select auth.uid())) and exists (select 1 from organization_members m where m.org_id = cc_form_templates.org_id and m.user_id = (select auth.uid())));
alter policy ccft_select on public.cc_form_templates
  using (exists (select 1 from organization_members m where m.org_id = cc_form_templates.org_id and m.user_id = (select auth.uid())));
alter policy ccft_update on public.cc_form_templates
  using (exists (select 1 from organization_members m where m.org_id = cc_form_templates.org_id and m.user_id = (select auth.uid())));

-- task_comments
alter policy "authors can delete own comments" on public.task_comments
  using (user_id = (select auth.uid()));
alter policy "authors can update own comments" on public.task_comments
  using (user_id = (select auth.uid()));
alter policy "org members can insert comments" on public.task_comments
  with check ((org_id in (select organization_members.org_id from organization_members where organization_members.user_id = (select auth.uid()))) and (user_id = (select auth.uid())));
alter policy "org members can view comments" on public.task_comments
  using ((row_id is null) or (org_id in (select organization_members.org_id from organization_members where organization_members.user_id = (select auth.uid()))));

-- worksheet_saved_views
alter policy wsv_delete on public.worksheet_saved_views
  using (created_by = (select auth.uid()));
alter policy wsv_insert on public.worksheet_saved_views
  with check ((created_by = (select auth.uid())) and exists (select 1 from organization_members m where m.org_id = worksheet_saved_views.org_id and m.user_id = (select auth.uid())));
alter policy wsv_select on public.worksheet_saved_views
  using ((is_shared and exists (select 1 from organization_members m where m.org_id = worksheet_saved_views.org_id and m.user_id = (select auth.uid()))) or (created_by = (select auth.uid())));
alter policy wsv_update on public.worksheet_saved_views
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- team_chat_channels
alter policy tcc_delete on public.team_chat_channels
  using (exists (select 1 from organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = (select auth.uid()) and m.role = any (array['owner','admin'])));
alter policy tcc_insert on public.team_chat_channels
  with check ((created_by = (select auth.uid())) and exists (select 1 from organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = (select auth.uid())));
alter policy tcc_select on public.team_chat_channels
  using ((created_by = (select auth.uid())) or (kind = 'channel' and is_org_member(org_id)) or tc_is_channel_member(id));
alter policy tcc_update on public.team_chat_channels
  using (exists (select 1 from organization_members m where m.org_id = team_chat_channels.org_id and m.user_id = (select auth.uid()) and m.role = any (array['owner','admin'])));

-- team_chat_messages
alter policy tcm_delete on public.team_chat_messages
  using (sender_id = (select auth.uid()));
alter policy tcm_insert on public.team_chat_messages
  with check ((sender_id = (select auth.uid())) and exists (select 1 from organization_members m where m.org_id = team_chat_messages.org_id and m.user_id = (select auth.uid())) and tc_can_see_channel(channel_id));

-- team_chat_channel_members
alter policy tccm_delete on public.team_chat_channel_members
  using ((user_id = (select auth.uid())) or exists (select 1 from team_chat_channels c where c.id = team_chat_channel_members.channel_id and c.created_by = (select auth.uid())));
alter policy tccm_insert on public.team_chat_channel_members
  with check ((org_id in (select m.org_id from organization_members m where m.user_id = (select auth.uid()))) and exists (select 1 from team_chat_channels c where c.id = team_chat_channel_members.channel_id and c.created_by = (select auth.uid())));
