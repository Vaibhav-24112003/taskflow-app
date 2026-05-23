# TaskFlow App — Claude Code Context

## Project Identity
- **Repo**: `Vaibhav-24112003/taskflow-app` (public)
- **Live URL**: `taskflowco.in` (Vercel auto-deploys `main`)
- **Vercel**: team `team_JrnZNzGZg5cK3lNierDv1nZd`, project `prj_bkkNRdJwlz4HkqqlB2Pdf0H8RnUK`
- **Supabase**: project `vkpglkblfkehvncnrdtg` (primary) / `vorxrjekbokqkigfabhr` (ap-south-1)
- **Dev branch**: `claude/reference-last-conversation-ff5tF`

## Stack
- **Frontend**: React + Vite SPA (`src/App.jsx` ~14k lines, all modules inline, `var` + hooks, no TypeScript)
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Deploy**: Vercel auto-deploys from `main` branch
- All styles inline; design tokens via CSS vars: `--tf-bg`, `--tf-panel`, `--tf-surface`, `--tf-border`, `--tf-text`, `--tf-text-sub`
- Accent: `#6b8cad` / `#5e8bb0` (slate-blue). Numbers: `'JetBrains Mono',monospace`
- Font: Geist → Inter → system-ui

## Key Files
| File | Purpose |
|---|---|
| `src/App.jsx` | Entire app — all modules, components, logic |
| `src/LandingPage.jsx` | Public landing page |
| `src/ITRTour.jsx` | ITR season animated tour (50s, light mode) |
| `src/components/TaskflowLogo.jsx` | Wordmark component — use `<TaskflowLogo size={N} />` |
| `src/lib/supabase.js` | Supabase client + helper functions |
| `src/lib/authStateListener.js` | Auth state + block check |

## Git / Push Flow
The local proxy blocks direct git push. Use PAT every time:
```bash
# Push branch (PAT stored in your password manager / environment — do not hardcode here):
git push https://<YOUR_PAT>@github.com/Vaibhav-24112003/taskflow-app.git <branch>
# Refresh local remote-tracking ref after push:
git fetch https://<YOUR_PAT>@github.com/Vaibhav-24112003/taskflow-app.git <branch>:refs/remotes/origin/<branch>
```
> Rotate PAT at https://github.com/settings/tokens — never commit the literal token.

## PR / Merge Flow
```bash
# Create PR
curl -s -X POST -H "Authorization: token <PAT>" -H "Content-Type: application/json" \
  "https://api.github.com/repos/Vaibhav-24112003/taskflow-app/pulls" \
  -d '{"title":"...","head":"<branch>","base":"main","body":"..."}'

# Squash-merge
curl -s -X PUT -H "Authorization: token <PAT>" \
  "https://api.github.com/repos/Vaibhav-24112003/taskflow-app/pulls/<N>/merge" \
  -d '{"merge_method":"squash","commit_title":"... (#N)"}'
```
`mcp__github__create_pull_request` returns 403 (integration scope issue) — use curl instead.

### Merge conflict resolution (squash-merge pattern)
When a PR was squash-merged to main and the branch diverges:
```bash
git fetch origin main
git merge origin/main --no-edit
# If conflict in App.jsx:
git checkout --ours src/App.jsx   # branch has all latest changes
git add src/App.jsx && git commit --no-edit
```

## Key Database Tables
| Table | Purpose |
|---|---|
| `worksheet_rows` | ERP tasks — `org_id`, `worksheet_id`, `client_id`, `status`, `due_date`, `data` JSONB |
| `worksheets` | `work_type`, `period_label`, `frequency`, `org_id` |
| `daily_plans` | Plan My Day entries (full PlanMyDayView tab) |
| `attendance_time_logs` | Time logs — `org_id`, `user_id`, `date`, `client_id`, `work_type`, `hours`, `minutes`, `notes` |
| `tasks` | Personal Kanban tasks (Workspaces) |
| `clients` | `id`, `name`, `display_name`, `pan`, `org_id` |
| `organization_members` | `user_id`, `role`, `org_id` |
| `profiles` | `id`, `name`, `email` |

`worksheet_rows.data` JSONB keys: `__title`, `__assignee`, `__priority`, `__description`, `__contact`, `__checklist`, `__h_<key>` (workflow hierarchy assignees)

## LocalStorage Keys
- `tf_mydayids_<org.id>` — JSON array of row IDs added to My Day
- `tf_mydayhidden_<org.id>_<YYYY-MM-DD>` — row IDs hidden from My Day panel that day (resets next day)
- `tf_reminders` — reminder objects for notification bell

## App Architecture (key components in App.jsx)
| Component | Approx line | Purpose |
|---|---|---|
| `YourDashboardModule` | ~7623 | Your Diary → Worklist tab. 2-col layout: task list + Plan My Day panel |
| `PlanMyDayView` | ~12750 | Full Plan My Day tab. Uses `daily_plans` + logs to `attendance_time_logs` |
| `ErpBoardModule` | ~7435 | WorkZone → Board tab. Kanban over `worksheet_rows` |
| `WorksheetsModule` | earlier | WorkZone → Worksheets tab. Main worksheet grid |
| `AnalyticsDashboard` | mid-file | Analytics module |
| `TeamDashboard` | mid-file | Team workload view |

## YourDashboardModule — Current Layout
```
<div display:flex height:100%>
  MAIN (flex:1) — sticky header (3 rows) + scrollable task list
  RIGHT (340px) — Plan My Day panel
</div>
```
**Sticky header rows:**
1. Greeting + refresh + create-task button
2. Filter pills (All/Today/Overdue/Review) · View toggles (List/Board/Calendar/Grid) · Date filter · Member select
3. Work-type pill strip — horizontal scrollable, `wsRailFilter` state, one pill per work type + "All Work Types" + "Due Today"

**State relevant to Worklist:**
```js
wsRailFilter    // 'all' | 'today' | <work_type_name>
myDayIds        // localStorage tf_mydayids_<org.id>
myDayHidden     // localStorage tf_mydayhidden_<org.id>_<date>
myDayLogId      // which card has → Log form open
myDayLogForm    // {client_id, work_type, hours, minutes, notes}
myDayLoggingId  // row.id currently being saved
dashView        // 'list' | 'board' | 'calendar' | 'grid'
```
**Key helpers:**
```js
addToMyDay(rowId)      // adds to myDayIds, removes from myDayHidden
removeFromMyDay(rowId) // removes from myDayIds, adds to myDayHidden
sendMyDayLog(row)      // inserts into attendance_time_logs
toggleMyDay(rowId)     // add or remove
```

**4 view modes:**
- `list` — grouped collapsible by work type, overdue red left border, "Open →" / "Open Unclassified →" per group
- `board` — 3-col Kanban (Pending / In Progress / Under Review), drag-and-drop changes status
- `calendar` — full month grid, Mon-first, tasks on due-date cells
- `grid` — dense table (Title · Client · Work Type · Assignee · Due · Status · ☀)

**Plan My Day right panel (340px):**
- Header: date, capacity bar, 3 summary pills (Scheduled / Done / Overdue)
- Morning / Afternoon task cards — each has `× Remove` + `→ Log` button
- `→ Log` expands inline form (Work Type, Hours, Mins, Notes) → `sendMyDayLog()` → `attendance_time_logs`
- Suggested for today (overdue, not yet in My Day) — `☀ Add` button
- 2-week mini calendar with task-dot indicators

## WorkZone Modules
```js
{id:'workzone', tabs:[
  {id:'worksheets'},  // WorksheetsModule — main worksheet grid
  {id:'board'},       // ErpBoardModule — all-org Kanban over worksheet_rows
  {id:'bigclients'},
  {id:'teamview'}
]}
```
`onOpenWorkType(wtName)` → `navigateToWorkType(wtName)` — navigates to WorkZone → Worksheets for that work type. Works for Unclassified too (amber styled button).

## Architecture Patterns

### Module-level data cache (survives navigation)
At top of App.jsx (module scope, not component scope):
```js
var _dashCache = {};       // orgId → { rows, clients, worksheets, orgMembers }
var _billingCache = {};    // orgId → { clients, invoices, payments, proposals }
var _ccCache = {};         // orgId → { clients, requests, responses, ... }
var _worksheetsCache = {}; // orgId → { clients }
var _commsCache = {};      // orgId → { clients, portalUsers, templates, commLogs }
```
Keyed by `org.id` — switching orgs always fetches fresh.

### Load function pattern (ALL modules must follow this)
```js
var [loading, setLoading] = useState(!_cache[org.id]);
var [loadError, setLoadError] = useState(null);
var loadTimerRef = useRef(null);
var loadingRef = useRef(false);  // concurrent-load guard

async function load() {
  if (loadingRef.current) return;
  loadingRef.current = true;
  if (!_cache[org.id]) setLoading(true);
  setLoadError(null);
  if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
  loadTimerRef.current = setTimeout(function () {
    if (!_cache[org.id]) { setLoading(false); setLoadError('timeout'); }
    loadingRef.current = false;
  }, 12000);
  try {
    // ... supabase queries ...
    _cache[org.id] = { /* fetched data */ };
  } catch (e) {
    if (!_cache[org.id]) setLoadError('error');
  } finally {
    clearTimeout(loadTimerRef.current);
    setLoading(false);
    loadingRef.current = false;
  }
}
// visibilitychange: restart stalled fetch when tab becomes visible
useEffect(function () {
  function onVisible() {
    if (document.visibilityState === 'visible' && loadingRef.current) {
      clearTimeout(loadTimerRef.current); loadingRef.current = false; load();
    }
  }
  document.addEventListener('visibilitychange', onVisible);
  return function () { document.removeEventListener('visibilitychange', onVisible); };
}, [org.id]);
```

### Stage-based status (WorkZone + Worklist)
Status is derived from the row's stage position in the work type config:
```js
function getEffectiveStatus(r) {
  var ws = wsMap[r.worksheet_id];
  var cfg = (workTypeConfigs || []).find(c => c.name === ws?.work_type);
  var stages = cfg?.stages?.length > 0 ? cfg.stages : null;
  if (!stages) return r.status || 'pending';
  if (!r.current_stage) return 'pending';
  var idx = stages.findIndex(s => s.key === r.current_stage);
  if (idx < 0) return r.status || 'pending';
  if (idx === stages.length - 1) return 'completed';
  if (idx === 0) return 'pending';
  return 'in_progress';
}
```

### Status update with optimistic UI
```js
await supabase.from('worksheet_rows').update({status:newStatus}).eq('id',rowId);
setRows(prev => prev.map(r => r.id===rowId ? {...r, status:newStatus} : r));
```

### Worksheet resolution (find or create for current period)
See `resolveWorksheet(wtName)` in `YourDashboardModule` (~line 7860).

### Dark sidebar
Left sidebar is always dark navy regardless of app theme:
```js
background: '#0e1929'
borderRight: '1px solid rgba(255,255,255,0.06)'
// Active item: rgba(255,255,255,0.08), text #ffffff, icon #7fa3c7
// Inactive: text #c7d2e3, icon #8696b3
```

## Security (Supabase)
- All RLS policies are org-scoped (`org_id = auth.uid()` or via membership check)
- Functions use `SET search_path = public, pg_temp`
- Admin access: `@taskflowco.in` email domain only
- Block operations: server-side edge function only

## Landing Page
- Headline: "Stop juggling. Start flowing."
- Subtitle: "The operating system for your practice."
- Problem section: "Your team works hard. Your systems should too."
- Tours: Website Tour (LaunchTour) + ITR Season tour (ITRTour) — lazy loaded
- No "14-day free trial" messaging anywhere

## What's Been Built (this session / current branch)
1. **ERP Board (WorkZone → Board tab)** — `ErpBoardModule`: Kanban over `worksheet_rows`, drag-and-drop, group by status/work type, assignee filter, client search, hide-completed
2. **Worklist redesign** — `YourDashboardModule`: removed 240px left rail → merged as Row 3 pill strip, 4 view modes (List/Board/Calendar/Grid), My Day add/remove with localStorage persistence
3. **Send to Logs in Plan My Day panel** — `→ Log` button on every Morning/Afternoon card, inline form, writes to `attendance_time_logs`
4. **Open Unclassified button** — "Open Unclassified →" in list-view group headers (amber styling)

## Pending / Deferred Work
- Client Ledger in Analytics
- Employee "My Work Today" landing screen
- Pricing tier feature flags
- Unified Kanban across all work types
- Recurring task management per client

## Design References
Design files (extracted from tar.gz at `/tmp/design_files/taskflow/`):
- `Taskflow Diary - Worklist.html` — implemented as current Worklist layout
- `chats/chat1.md`, `chats/chat2.md` — prior design review conversations (full context on homepage, modules, alternatives)
