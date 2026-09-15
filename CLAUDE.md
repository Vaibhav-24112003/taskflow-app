# TaskFlow App — Claude Code Context

## Project Identity
- **Repo**: `Vaibhav-24112003/taskflow-app` (public)
- **Live URL**: `taskflowco.in` (Vercel auto-deploys `main`)
- **Vercel**: team `team_JrnZNzGZg5cK3lNierDv1nZd`, project `prj_bkkNRdJwlz4HkqqlB2Pdf0H8RnUK`
- **Supabase**: **LIVE = `vorxrjekbokqkigfabhr` (ap-south-1)** — the project `taskflowco.in` connects to (`VITE_SUPABASE_URL`). The MCP connector is bound to it and can run DDL via `apply_migration`. `vkpglkblfkehvncnrdtg` is an old/secondary project — do NOT migrate against it.

> **⚠ Before ANY migration, verify the live DB — don't trust the label blindly:**
> 1. `list_projects` → the project the token can reach. A "You do not have permission" error on `apply_migration` means a wrong/inaccessible project ID, not a read-only token.
> 2. Confirm it's live: the deployed bundle preconnects to `https://<ref>.supabase.co`. Grep the live HTML's `<link rel="preconnect" ... supabase.co>` — that `<ref>` is the real live DB.
> 3. Migrate only against the project satisfying both (currently `vorxrjekbokqkigfabhr`).

## Stack
- **Frontend**: React + Vite SPA. `src/App.jsx` (~19k lines) holds nearly all modules inline (`var` + hooks, no TypeScript). All styles inline.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions + pg_cron).
- **Deploy**: Vercel auto-deploys from `main`.
- **Brand** (design refresh, live): primary `#2F6BFF`, teal `#14C7C0`, gradient `linear-gradient(135deg,#2F6BFF,#14C7C0)`, navy ink `#0E2A47`. Font: Plus Jakarta Sans (Geist/Inter fallback); JetBrains Mono for dates/numbers. In-app theme via `data-theme` + `localStorage tfc-theme`; CSS vars `--tf-bg/-panel/-surface/-border/-text/-text-sub`.

## Key Files
| File | Purpose |
|---|---|
| `src/App.jsx` | Entire desktop app — all modules, components, logic. `OrgDashboard` (~18884) is the per-org shell. |
| `src/MobileApp.jsx` | Native mobile app — full-screen overlay, renders when viewport < 820px. WorkZone + Kanban + Team/Attendance/Time + Chat, wired to real data. |
| `src/HomeSkin.jsx` / `src/HomeOverview.jsx` | Post-login "Practice Home" overlay (separate React root in `main.jsx`). |
| `src/LandingPage.jsx` | Public landing (`.lp2`-scoped design system). |
| `src/lib/supabase.js` | Supabase client + helper functions. |
| `src/lib/useTrialGate.js` | Plan/trial gating — `status`, `writesAllowed`, `hasModule(m)`. |
| `src/admin/AdminShell.jsx` | Platform admin dashboard (`@taskflowco.in` only). |
| `supabase/migrations/` | SQL migrations. |

## Git / Push Flow — DIRECT TO MAIN
**Standing order (user):** auto-deploy every change to `main` without asking. Per change: commit → push `main` → verify a `target:production` READY/QUEUED deploy exists via Vercel `list_deployments` → report.

```bash
git add <files>
git config user.email noreply@anthropic.com && git config user.name Claude
git commit -m "description"
git commit --amend --no-edit --reset-author   # fix committer email for stop hook
# push (a session dev branch is also set; push there too when required by the harness)
```
- Vercel sometimes builds a near-simultaneous push only as a branch preview and skips the production build — always confirm a `target:production`/`ref:main` deploy exists for your commit (`list_deployments`, filter with `since`). If missing, push an empty commit to re-trigger.
- git push in this remote env may be proxy-blocked (403); a user-provided short-lived PAT is the workaround. Never commit the literal token.
- Stop-hook "Unverified commits" (GPG) warning is cosmetic — do NOT rewrite/force-push to fix it.

## Key Database Tables
| Table | Purpose |
|---|---|
| `worksheet_rows` | ERP tasks — `org_id`, `worksheet_id`, `client_id`, `status`, `current_stage`, `due_date`, `completed`, `data` JSONB |
| `worksheets` | `work_type`, `period_label`, `frequency`, `org_id` |
| `work_type_configs` | Per-org work types — `stages`, `is_itr_worktype`, `estimated_hours` |
| `daily_plans` | Plan My Day entries |
| `attendance_time_logs` | Time logs — `org_id`, `user_id`, `date`, `client_id`, `work_type`, `hours`, `minutes`, `worksheet_row_id` |
| `attendance_punches` / `attendance_entries` / `leave_requests` | Attendance module |
| `tasks` | Personal Kanban tasks (Workspaces) — `workspace_id`, `status`, `priority`, `checklist` |
| `workspaces` / `workspace_members` | Kanban boards + membership |
| `clients` | `id`, `name`, `display_name`, `pan`, `gstin`, `org_id` |
| `client_credentials` | Encrypted credential vault — secrets via `cred_get_secret`/`cred_set_secret` (pgp_sym) |
| `client_portal_access` / `client_requests` | Client portal (custom auth via `client_portal_*` RPCs) |
| `organization_members` | `user_id`, `role`, `org_id` |
| `profiles` | `id`, `name`, `email` |
| `subscriptions` / `payment_events` / `subscription_invoices` / `plans` | Billing (Razorpay) |
| `team_chat_channels` / `team_chat_messages` | Team chat |
| `demo_requests` | Landing "Book a Demo" form |
| `announcements` | Platform announcements |

- **ITR classification is work-type-driven**: a client is "ITR" when enrolled in any work type with `work_type_configs.is_itr_worktype = true` (the old `clients.itr_applicable` column was dropped).
- `worksheet_rows.data` JSONB keys: `__title`, `__assignee`, `__priority`, `__description`, `__contact`, `__checklist`, `__h_<key>` (hierarchy assignees).

## Architecture Patterns
- **Module-level caches** at App.jsx module scope keyed by `org.id` (`_dashCache`, `_billingCache`, etc.) survive navigation; switching orgs fetches fresh.
- **Load-function pattern** (all modules): `loadingRef` concurrent guard + 12s timeout + `visibilitychange` restart of stalled fetches; write result into the org cache.
- **Stage-based status** (`getEffectiveStatus`): derive from the row's `current_stage` position in `work_type_configs.stages` — first stage → pending, last → completed, else in_progress; fall back to `row.status` when no stages.
- **Optimistic UI**: update Supabase then `setRows(prev => map…)`.
- Admin access is `@taskflowco.in` email only (`is_tfc_admin()` = JWT email ilike `%@taskflowco.in`).

## Security (Supabase) — IMPORTANT
- **All app tables have RLS enabled with org-scoped policies.** Keep it that way — never disable RLS on a public table.
- **SECURITY DEFINER RPCs must self-authorize** (check `auth.uid()` membership of the owning org before touching data) — e.g. `cred_get_secret`, `reset_client_portal_password` do. Set `search_path` on every function.
- **Admin views** (`admin_billing_overview`, `admin_org_overview`, `admin_user_overview`) are reachable via the REST API with the public anon key. They must NOT leak cross-tenant data: guard rows with `where public.is_tfc_admin()` (SECURITY DEFINER views) or use `security_invoker=true` + underlying RLS, and revoke `anon` SELECT. (`admin_billing_overview` was fixed 2026-09 to add the admin guard.)
- Run `get_advisors(security)` after any DDL. Known non-blocking lints: definer-view flag on the guarded admin view; `function_search_path_mutable` on a few `tf_jobs`/util functions; leaked-password protection is off (enable in Auth settings).
- Block operations: server-side edge function only.

## Server-side Automations (`tf_jobs` schema, PL/pgSQL + pg_cron; live)
- **Recurrence generator** `tf_jobs.generate_recurring_worksheets(dry bool)` — cron 18:30 UTC. Creates worksheets/rows for prev+current+next period, idempotent.
- **Work reminders** `tf_jobs.send_work_reminders(mode,test_email,days,only_email)` — daily digest via Resend (key in Vault), cron 03:30 UTC. Consolidated across a user's orgs.
- **Client reminders** `tf_jobs.send_client_reminders(mode)` — cron 04:00 UTC (Resend, `no-reply@taskflowco.in`); manual mode sends via the firm's Gmail. Config in `organizations.client_reminder_config`.
- Stage history (`worksheet_row_stage_events` + trigger), aging view, time-vs-estimate view (`worksheet_row_time`).
- Verify crons: `select jobname,schedule,active from cron.job;`

## Local render/screenshot recipe
Temp `.env.local` (public Supabase URL + placeholder anon key) → `npx vite build` → serve `dist` / bundle with esbuild → screenshot via `playwright-core` (chromium at `/opt/pw-browsers/chromium`). Clean up `.env.local` after. To preview a component with fake data, bundle a small entry with esbuild against a **separate stub file** (do NOT overwrite `src/lib/supabase.js` — it triggers per-turn re-injection).
