-- ─────────────────────────────────────────────────────────────────────────────
-- Recurring-worksheet generator (server-side "never miss a due date")
--
-- Ensures recurring compliance work EXISTS ahead of time: for every org's active
-- recurring work type (monthly / quarterly / yearly), materialises the worksheet
-- + one row per enrolled client for the PREVIOUS, CURRENT and NEXT period — so
-- e.g. August GST tasks are already in every preparer's list before Aug 1, instead
-- of only appearing when a human happens to open that month.
--
-- Faithful server-side port of the client loadWorksheet() auto-create logic
-- (src/App.jsx ~5154-5364): same Indian-FY period math, same due-date rules
-- (due_dates[] with monthly_map / quarterly_map / month_offset), same prep_days
-- start_date, same enrollment (clients.custom_fields.work_types), same dedupe
-- (single-due-date → one row per client; multi → one row per client + due_label).
--
-- Idempotent: only INSERTs missing worksheets/rows; never edits or deletes.
-- Scheduled nightly via pg_cron at the bottom of this file.
--
-- NOTE: This SQL is the LIVE implementation. An equivalent Edge Function exists at
-- supabase/functions/generate-recurring-worksheets/ for reference only (its deploy
-- path was unavailable in the build environment; the SQL job is what runs).
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists tf_jobs;
comment on schema tf_jobs is 'TaskFlowCo scheduled-jobs helpers (recurrence + reminders)';

set search_path = public, pg_temp;

create or replace function tf_jobs.safe_make_date(y int, m int, d int)
returns date language plpgsql immutable as $$
begin return make_date(y,m,d); exception when others then return null; end $$;

create or replace function tf_jobs.period_label(freq text, yr int, mo int, qtr int)
returns text language sql immutable as $$
  select case
    when freq='monthly' then (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[coalesce(mo,1)]
         || ' ' || (case when coalesce(mo,1)>=4 then yr else yr+1 end)::text
    when freq='quarterly' then 'Q'||coalesce(qtr,1)||' FY'||yr||'-'||right((yr+1)::text,2)
    else 'FY '||yr||'-'||right((yr+1)::text,2)
  end
$$;

create or replace function tf_jobs.compute_due_date(p_day int, p_month int, freq text, p_offset int,
                                                    p_year int, p_month_period int, p_quarter int)
returns date language plpgsql immutable as $$
declare
  caly int; offs int; tm int; ty int;
  qend int[] := array[6,9,12,3]; qendm int; qcaly int; qoff int; duem int; duey int;
  dm int; yearoff int; duecaly int;
begin
  if p_day is null then return null; end if;
  if freq='monthly' and p_month_period is not null then
    caly := case when p_month_period>=4 then p_year else p_year+1 end;
    offs := coalesce(p_offset,1);
    tm := p_month_period+offs; ty := caly;
    while tm>12 loop tm:=tm-12; ty:=ty+1; end loop;
    while tm<1  loop tm:=tm+12; ty:=ty-1; end loop;
    return tf_jobs.safe_make_date(ty,tm,p_day);
  elsif freq='quarterly' and p_quarter is not null then
    qendm := qend[p_quarter];
    qcaly := case when p_quarter<=3 then p_year else p_year+1 end;
    qoff := coalesce(p_offset,1);
    duem := qendm+qoff; duey := qcaly;
    while duem>12 loop duem:=duem-12; duey:=duey+1; end loop;
    if p_month is not null then duem:=p_month; end if;
    return tf_jobs.safe_make_date(duey,duem,p_day);
  elsif freq='yearly' then
    dm := coalesce(p_month,7);
    yearoff := coalesce(p_offset, case when dm>=4 then 0 else 1 end);
    duecaly := p_year+yearoff;
    return tf_jobs.safe_make_date(duecaly,dm,p_day);
  end if;
  return null;
end $$;

-- previous + current + next period, so an actively-worked prior period (for work
-- types whose due date spills into a later month via month_offset) is never invisible.
create or replace function tf_jobs.periods_for(freq text, fy int, m int)
returns jsonb language plpgsql immutable as $$
declare cur jsonb; nxt jsonb; prv jsonb;
  q int; caly int; cm int; cyy int; fy2 int;
  pm int; py int; fyp int;
begin
  if freq='monthly' then
    cur := jsonb_build_object('year',fy,'month',m,'quarter',null);
    caly := case when m>=4 then fy else fy+1 end;
    cm := m+1; cyy := caly;
    if cm>12 then cm:=1; cyy:=cyy+1; end if;
    fy2 := case when cm>=4 then cyy else cyy-1 end;
    nxt := jsonb_build_object('year',fy2,'month',cm,'quarter',null);
    pm := m-1; py := caly;
    if pm<1 then pm:=12; py:=py-1; end if;
    fyp := case when pm>=4 then py else py-1 end;
    prv := jsonb_build_object('year',fyp,'month',pm,'quarter',null);
  elsif freq='quarterly' then
    q := case when m between 4 and 6 then 1 when m between 7 and 9 then 2 when m between 10 and 12 then 3 else 4 end;
    cur := jsonb_build_object('year',fy,'month',null,'quarter',q);
    if q<4 then nxt := jsonb_build_object('year',fy,'month',null,'quarter',q+1);
    else       nxt := jsonb_build_object('year',fy+1,'month',null,'quarter',1); end if;
    if q>1 then prv := jsonb_build_object('year',fy,'month',null,'quarter',q-1);
    else       prv := jsonb_build_object('year',fy-1,'month',null,'quarter',4); end if;
  else
    cur := jsonb_build_object('year',fy,'month',null,'quarter',null);
    nxt := jsonb_build_object('year',fy+1,'month',null,'quarter',null);
    prv := jsonb_build_object('year',fy-1,'month',null,'quarter',null);
  end if;
  return jsonb_build_array(prv,cur,nxt);
end $$;

create or replace function tf_jobs.build_due_list(p_due_dates jsonb, p_due_day int, p_due_month int,
                                                  freq text, pyear int, pmonth int, pquarter int)
returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; dd jsonb; me jsonb; qe jsonb;
  calY int; dueCalY int; d date; lbl text;
  qEnd int[] := array[6,9,12,3]; qEndM int; qEndCalY int;
begin
  if freq='once' then return out; end if;
  if p_due_dates is not null and jsonb_typeof(p_due_dates)='array' and jsonb_array_length(p_due_dates)>0 then
    for dd in select value from jsonb_array_elements(p_due_dates) loop
      lbl := coalesce(dd->>'label','Due');
      if dd->'monthly_map' is not null and jsonb_typeof(dd->'monthly_map')='object' and freq='monthly' and pmonth is not null then
        me := dd->'monthly_map'->(pmonth::text);
        if me is not null and (me->>'day') is not null and (me->>'due_month') is not null then
          calY := case when pmonth>=4 then pyear else pyear+1 end;
          dueCalY := case when (me->>'due_month')::int < pmonth then calY+1 else calY end;
          d := tf_jobs.safe_make_date(dueCalY,(me->>'due_month')::int,(me->>'day')::int);
          if d is not null then out := out || jsonb_build_object('date',to_char(d,'YYYY-MM-DD'),'label',lbl); end if;
        end if;
      elsif dd->'quarterly_map' is not null and jsonb_typeof(dd->'quarterly_map')='object' and freq='quarterly' and pquarter is not null then
        qe := dd->'quarterly_map'->(pquarter::text);
        if qe is not null and (qe->>'day') is not null and (qe->>'due_month') is not null then
          qEndM := qEnd[pquarter];
          qEndCalY := case when pquarter<=3 then pyear else pyear+1 end;
          dueCalY := case when (qe->>'due_month')::int >= qEndM then qEndCalY else qEndCalY+1 end;
          d := tf_jobs.safe_make_date(dueCalY,(qe->>'due_month')::int,(qe->>'day')::int);
          if d is not null then out := out || jsonb_build_object('date',to_char(d,'YYYY-MM-DD'),'label',lbl); end if;
        end if;
      else
        d := tf_jobs.compute_due_date((dd->>'day')::int, nullif(dd->>'month','')::int, freq,
                                      nullif(dd->>'month_offset','')::int, pyear, pmonth, pquarter);
        if d is not null then out := out || jsonb_build_object('date',to_char(d,'YYYY-MM-DD'),'label',lbl); end if;
      end if;
    end loop;
  elsif p_due_day is not null then
    d := tf_jobs.compute_due_date(p_due_day, p_due_month, freq, null, pyear, pmonth, pquarter);
    if d is not null then out := out || jsonb_build_object('date',to_char(d,'YYYY-MM-DD'),'label','Due'); end if;
  end if;
  return out;
end $$;

create or replace function tf_jobs.generate_recurring_worksheets(p_dry boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamptz := now() at time zone 'utc' + interval '5.5 hours';  -- IST
  v_m int := extract(month from v_now)::int;
  v_y int := extract(year  from v_now)::int;
  v_fy int := case when v_m>=4 then v_y else v_y-1 end;
  r_org record; r_cfg record; per jsonb;
  v_freq text; v_pyear int; v_pmonth int; v_pquarter int; v_label text;
  v_wsid uuid; duelist jsonb; v_dd jsonb; v_enrolled uuid[];
  v_newrows int; v_worksheets int := 0; v_rows int := 0;
  v_plan jsonb := '[]'::jsonb; v_errors jsonb := '[]'::jsonb; v_multi boolean;
begin
  for r_org in select id, name from organizations loop
    for r_cfg in
      select name, frequency, due_day, due_month, due_dates, prep_days
      from work_type_configs
      where org_id=r_org.id and is_active=true and frequency in ('monthly','quarterly','yearly')
    loop
      v_freq := r_cfg.frequency;
      select array_agg(c.id) into v_enrolled
      from clients c
      where c.org_id=r_org.id
        and exists (select 1 from unnest(string_to_array(coalesce(c.custom_fields->>'work_types',''), ',')) wt
                    where trim(wt)=r_cfg.name);
      if v_enrolled is null then continue; end if;

      for per in select value from jsonb_array_elements(tf_jobs.periods_for(v_freq, v_fy, v_m)) loop
        v_pyear    := (per->>'year')::int;
        v_pmonth   := nullif(per->>'month','')::int;
        v_pquarter := nullif(per->>'quarter','')::int;
        v_label    := tf_jobs.period_label(v_freq, v_pyear, v_pmonth, v_pquarter);
        duelist    := tf_jobs.build_due_list(r_cfg.due_dates, r_cfg.due_day, r_cfg.due_month, v_freq, v_pyear, v_pmonth, v_pquarter);
        v_multi    := jsonb_array_length(duelist) > 1;

        select id into v_wsid from worksheets
          where org_id=r_org.id and work_type=r_cfg.name and period_label=v_label limit 1;

        if v_multi then
          select count(*) into v_newrows
          from unnest(v_enrolled) c_id
          cross join lateral jsonb_array_elements(duelist) dd
          where v_wsid is null or not exists (
            select 1 from worksheet_rows wr
            where wr.worksheet_id=v_wsid and wr.client_id=c_id
              and coalesce(wr.due_label,'')=coalesce(dd.value->>'label',''));
        else
          select count(*) into v_newrows
          from unnest(v_enrolled) c_id
          where v_wsid is null or not exists (
            select 1 from worksheet_rows wr where wr.worksheet_id=v_wsid and wr.client_id=c_id);
        end if;

        if v_newrows=0 and v_wsid is not null then continue; end if;

        v_plan := v_plan || jsonb_build_object('org',r_org.name,'work_type',r_cfg.name,'period',v_label,
                                               'worksheetExists',v_wsid is not null,'rowsToCreate',v_newrows,
                                               'dueDates',duelist);
        if p_dry then
          if v_wsid is null then v_worksheets := v_worksheets+1; end if;
          v_rows := v_rows + v_newrows;
          continue;
        end if;

        if v_wsid is null then
          insert into worksheets(org_id,work_type,period_label,period_year,period_month,period_quarter,frequency)
          values (r_org.id, r_cfg.name, v_label, v_pyear,
                  case when v_freq='monthly'   then v_pmonth   else null end,
                  case when v_freq='quarterly' then v_pquarter else null end,
                  v_freq)
          returning id into v_wsid;
          v_worksheets := v_worksheets+1;
        end if;

        if v_multi then
          insert into worksheet_rows(worksheet_id,client_id,org_id,data,due_date,due_label,start_date)
          select v_wsid, c_id, r_org.id, '{}'::jsonb, (dd.value->>'date')::date, dd.value->>'label',
                 case when r_cfg.prep_days is not null and (dd.value->>'date') is not null
                      then (dd.value->>'date')::date - r_cfg.prep_days else null end
          from unnest(v_enrolled) c_id
          cross join lateral jsonb_array_elements(duelist) dd
          where not exists (select 1 from worksheet_rows wr
                            where wr.worksheet_id=v_wsid and wr.client_id=c_id
                              and coalesce(wr.due_label,'')=coalesce(dd.value->>'label',''));
        else
          v_dd := case when jsonb_array_length(duelist)>=1 then duelist->0 else null end;
          insert into worksheet_rows(worksheet_id,client_id,org_id,data,due_date,due_label,start_date)
          select v_wsid, c_id, r_org.id, '{}'::jsonb, (v_dd->>'date')::date, v_dd->>'label',
                 case when r_cfg.prep_days is not null and (v_dd->>'date') is not null
                      then (v_dd->>'date')::date - r_cfg.prep_days else null end
          from unnest(v_enrolled) c_id
          where not exists (select 1 from worksheet_rows wr where wr.worksheet_id=v_wsid and wr.client_id=c_id);
        end if;
        v_rows := v_rows + v_newrows;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('dry',p_dry,'ist_month',v_m,'fy',v_fy,
    'worksheetsCreated',v_worksheets,'rowsCreated',v_rows,'plan',v_plan,'errors',v_errors);
end $$;

-- Nightly at 18:30 UTC (00:00 IST): each new day starts with its work materialised.
do $$
begin
  perform cron.unschedule('generate-recurring-worksheets')
  where exists (select 1 from cron.job where jobname='generate-recurring-worksheets');
end $$;
select cron.schedule('generate-recurring-worksheets', '30 18 * * *',
  $cmd$ select tf_jobs.generate_recurring_worksheets(false); $cmd$);
