-- ─────────────────────────────────────────────────────────────────────────────
-- Automated work reminders (server-side "reminders that actually fire")
--
-- Emails each staff member a daily digest of ALL their overdue tasks (nothing
-- forgotten) plus DUE TODAY and COMING UP (next 7 days), grouped into scannable
-- sections, via Resend (through pg_net). Owner of a row = data->>'__assignee' plus
-- any workflow-hierarchy role (data keys __h_*). Capped at 30 rows per email.
--
-- Modes:
--   'dry'  → compute recipients + counts, send NOTHING (returns JSON preview)
--   'test' → send ONE real digest, but only to p_test_email (safe rendering check)
--   'live' → send every recipient their own digest
--
-- The Resend API key is read from Supabase Vault (secret name 'RESEND_API_KEY') and
-- never hardcoded. Add it once with:
--   select vault.create_secret('re_xxx', 'RESEND_API_KEY', 'Resend key for reminders');
--
-- Scheduled daily at 03:30 UTC (09:00 IST) at the bottom of this file.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function tf_jobs.esc(s text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(coalesce(s,''),
    '&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$$;

create or replace function tf_jobs.send_work_reminders(p_mode text default 'dry',
                                                       p_test_email text default null,
                                                       p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone 'utc' + interval '5.5 hours')::date;
  v_key text;
  v_from text := 'TaskFlowCo <no-reply@taskflowco.in>';
  v_recipients int := 0; v_sent int := 0; v_preview jsonb := '[]'::jsonb;
  r_user record; v_rows_html text; v_item jsonb; v_shown int; v_more int;
  v_subject text; v_html text; v_to text; v_upcoming int;
  v_bucket text; v_last_bucket text;
begin
  if p_mode <> 'dry' then
    select decrypted_secret into v_key from vault.decrypted_secrets where name='RESEND_API_KEY' limit 1;
    if v_key is null then
      return jsonb_build_object('error','RESEND_API_KEY not found in Vault — add it before sending.');
    end if;
  end if;

  for r_user in
    with owned as (
      select distinct on (o.owner_id, r.id)
             r.org_id, r.id, r.due_date,
             coalesce(nullif(r.data->>'__title',''), c.name, 'Task') as title,
             w.work_type, o.owner_id
      from worksheet_rows r
      join worksheets w on w.id = r.worksheet_id
      left join clients c on c.id = r.client_id
      cross join lateral (
        select v as owner_id from (
          select r.data->>'__assignee' as v
          union all
          select e.value from jsonb_each_text(r.data) e where left(e.key,4)='__h_'
        ) s where v is not null and v <> ''
      ) o
      where coalesce(r.status,'') <> 'completed' and r.completed_at is null and r.archived_at is null
        and r.due_date is not null
        and r.due_date <= v_today + p_days          -- overdue (any age) OR due within window
    ),
    agg as (
      select owner_id, org_id,
             count(*) as total,
             count(*) filter (where due_date < v_today) as overdue,
             jsonb_agg(jsonb_build_object('title',title,'wt',work_type,
                       'due',to_char(due_date,'DD Mon YYYY'),'k',to_char(due_date,'YYYY-MM-DD'))
                       order by due_date) as items
      from owned group by owner_id, org_id
    )
    select p.email, p.name, a.total, a.overdue, a.items
    from agg a
    join profiles p on p.id = a.owner_id::uuid
    where p.email is not null and coalesce(p.is_blocked,false) = false
  loop
    v_recipients := v_recipients + 1;
    v_upcoming := r_user.total - r_user.overdue;

    v_rows_html := ''; v_shown := 0; v_last_bucket := '';
    for v_item in select * from jsonb_array_elements(r_user.items) loop
      exit when v_shown >= 30;
      v_bucket := case when (v_item->>'k')::date < v_today then 'overdue'
                       when (v_item->>'k')::date = v_today then 'today'
                       else 'upcoming' end;
      if v_bucket <> v_last_bucket then
        v_last_bucket := v_bucket;
        v_rows_html := v_rows_html ||
          '<tr><td colspan="2" style="padding:14px 12px 5px;font-size:11px;font-weight:800;letter-spacing:.08em;'||
          case v_bucket when 'overdue' then 'color:#dc2626;' when 'today' then 'color:#2F6BFF;' else 'color:#7183a0;' end||'">'||
          case v_bucket when 'overdue' then 'OVERDUE' when 'today' then 'DUE TODAY' else 'COMING UP' end||'</td></tr>';
      end if;
      v_rows_html := v_rows_html ||
        '<tr><td style="padding:7px 10px;border-bottom:1px solid #eef1f5;font-size:13px;color:#0E2A47;">'||tf_jobs.esc(v_item->>'title')||
        '<div style="font-size:11px;color:#7183a0;margin-top:2px;">'||tf_jobs.esc(v_item->>'wt')||'</div></td>'||
        '<td style="padding:7px 10px;border-bottom:1px solid #eef1f5;font-size:12px;white-space:nowrap;text-align:right;'||
        case when v_bucket='overdue' then 'color:#dc2626;font-weight:700;' else 'color:#0E2A47;' end||'">'||
        (v_item->>'due')||'</td></tr>';
      v_shown := v_shown + 1;
    end loop;
    v_more := r_user.total - v_shown;

    v_subject := case when r_user.overdue > 0
      then '⚠ '||r_user.overdue||' overdue'||case when v_upcoming>0 then ' · '||v_upcoming||' upcoming' else '' end||' — TaskFlowCo'
      else v_upcoming||' task'||case when v_upcoming=1 then '' else 's' end||' this week — TaskFlowCo' end;
    v_html :=
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#0E2A47;">'||
      '<div style="padding:22px 26px;background:linear-gradient(135deg,#2F6BFF,#14C7C0);border-radius:12px 12px 0 0;">'||
      '<div style="color:#fff;font-size:17px;font-weight:800;letter-spacing:-.02em;">Hi '||tf_jobs.esc(coalesce(r_user.name,'there'))||',</div>'||
      '<div style="color:rgba(255,255,255,.9);font-size:13px;margin-top:4px;">Here’s your work — '||
      case when r_user.overdue>0 then r_user.overdue::text||' overdue' else '' end||
      case when r_user.overdue>0 and v_upcoming>0 then ' · ' else '' end||
      case when v_upcoming>0 then v_upcoming::text||' in the next '||p_days||' days' else '' end||'.</div></div>'||
      '<div style="padding:2px 0 0;background:#fff;border:1px solid #e5e9f0;border-top:none;border-radius:0 0 12px 12px;">'||
      '<table style="width:100%;border-collapse:collapse;">'||v_rows_html||'</table>'||
      case when v_more>0 then '<div style="padding:10px 12px;font-size:12px;color:#7183a0;">+ '||v_more||' more…</div>' else '' end||
      '<div style="padding:16px 12px 20px;"><a href="https://taskflowco.in" style="display:inline-block;background:#2F6BFF;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;">Open TaskFlowCo →</a></div>'||
      '<div style="padding:0 12px 16px;font-size:11px;color:#9fb0c6;">You’re receiving this because tasks are assigned to you in TaskFlowCo.</div>'||
      '</div></div>';

    if p_mode = 'dry' then
      v_preview := v_preview || jsonb_build_object('email',r_user.email,'name',r_user.name,'total',r_user.total,'overdue',r_user.overdue);
      continue;
    end if;

    v_to := case when p_mode='test' then p_test_email else r_user.email end;
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
      body := jsonb_build_object('from',v_from,'to',jsonb_build_array(v_to),'subject',v_subject,'html',v_html)
    );
    v_sent := v_sent + 1;
    if p_mode = 'test' then exit; end if;  -- one sample only
  end loop;

  return jsonb_build_object('mode',p_mode,'window_days',p_days,'recipients',v_recipients,'sent',v_sent,'preview',v_preview);
end $$;

-- Daily at 03:30 UTC (09:00 IST).
do $$
begin
  perform cron.unschedule('send-work-reminders')
  where exists (select 1 from cron.job where jobname='send-work-reminders');
end $$;
select cron.schedule('send-work-reminders', '30 3 * * *',
  $cmd$ select tf_jobs.send_work_reminders('live', null, 7); $cmd$);
