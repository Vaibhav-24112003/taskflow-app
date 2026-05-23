import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

// In-process serial lock — replaces Supabase's default navigator.locks based
// auth lock, which causes "lock was released because another request stole it"
// errors when the user has multiple tabs open or several internal supabase
// calls race during boot. This keeps lock scope inside this tab only —
// each tab maintains its own consistent auth state, which is what we want.
const _locks = new Map()
function processLock(name, _acquireTimeout, fn) {
  const prev = _locks.get(name) || Promise.resolve()
  let release
  const next = new Promise(r => { release = r })
  _locks.set(name, prev.then(() => next))
  return prev.then(async () => {
    // Safety: if fn() hangs (e.g. browser backgrounds the tab mid-refresh and
    // the network request stalls), force-release after 5 s so all callers
    // behind this lock are not blocked forever. Calling release() twice is
    // harmless — a resolved Promise ignores further resolution attempts.
    const safetyTimer = setTimeout(release, 5000)
    try { return await fn() } finally { clearTimeout(safetyTimer); release() }
  })
}

// When the page becomes visible again, clear any stale lock chains that were
// acquired before the app-switch (the holder may have hung waiting for
// network). Future callers then start a fresh chain instead of queuing
// behind a promise that might never resolve.
//
// Also reset GoTrue's internal lockAcquired flag and pendingInLock queue —
// without this, the GoTrue client sees lockAcquired=true and short-circuits
// our processLock entirely, queuing new callers behind the stuck operation.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _locks.clear()
      try {
        const auth = supabase.auth
        if (auth.lockAcquired) {
          auth.lockAcquired = false
          auth.pendingInLock = []
        }
      } catch (e) { /* supabase not ready yet */ }
    }
  })
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: processLock,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ── Auth ───────────────────────────────────────────────────────────────────
export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  })

// Passwordless email sign-in for users whose email isn't a Google account
// (e.g. domain mailboxes like support@taskflowco.in). The user gets a one-time
// link in their inbox; clicking it lands them back on the app, signed in.
export const signInWithEmailLink = (email) =>
  supabase.auth.signInWithOtp({
    email: String(email || '').trim(),
    options: {
      emailRedirectTo: window.location.origin,
      shouldCreateUser: true,
    },
  })

export const signOut = () => supabase.auth.signOut()

// ── Profile ────────────────────────────────────────────────────────────────
export const upsertProfile = (profile) =>
  supabase.from('profiles').upsert(profile, { onConflict: 'id' })

export const getProfile = (userId) =>
  supabase.from('profiles').select('id,name,email,avatar_url').eq('id', userId).maybeSingle()

export const getAllProfiles = () =>
  supabase.from('profiles').select('id,name,email,avatar_url').order('name').limit(500)

// ── Workspaces ─────────────────────────────────────────────────────────────
export const getMyWorkspaces = async (userId) => {
  const { data: memberRows, error: memberErr } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
  if (memberErr || !memberRows?.length) return { data: [], error: memberErr }
  const ids = memberRows.map(r => r.workspace_id)
  return supabase
    .from('workspaces')
    .select('id,name,description,color,icon,custom_statuses,owner_id,created_at')
    .in('id', ids)
    .order('created_at', { ascending: true })
}

export const createWorkspace = (ws) =>
  supabase.from('workspaces').insert(ws).select().single()

export const updateWorkspace = (id, updates) =>
  supabase.from('workspaces').update(updates).eq('id', id)

export const deleteWorkspace = (id) =>
  supabase.from('workspaces').delete().eq('id', id)

// ── Workspace Members ──────────────────────────────────────────────────────
export const getWorkspaceMembers = (workspaceId) =>
  supabase
    .from('workspace_members')
    .select('role, profiles(id,name,email,avatar_url)')
    .eq('workspace_id', workspaceId)
    .then(({ data, error }) => ({
      data: data?.map(r => ({ ...r.profiles, role: r.role })) || [],
      error
    }))

export const addMemberToWorkspace = (workspaceId, userId, role = 'member') =>
  supabase
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: userId, role }, { onConflict: 'workspace_id,user_id' })

export const removeMemberFromWorkspace = (workspaceId, userId) =>
  supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

export const getMemberRole = async (workspaceId, userId) => {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.role || null
}

// ── Workspace Invitations ──────────────────────────────────────────────────
export const inviteToWorkspace = (workspaceId, inviterId, inviteeEmail) =>
  supabase
    .from('workspace_invitations')
    .insert({ workspace_id: workspaceId, inviter_id: inviterId, invitee_email: inviteeEmail.toLowerCase().trim() })
    .select()
    .single()

export const getWorkspaceInvitations = (workspaceId) =>
  supabase
    .from('workspace_invitations')
    .select('id,workspace_id,inviter_id,invitee_email,status,token,created_at, inviter:profiles!inviter_id(name,email,avatar_url), workspace:workspaces!workspace_id(name,icon,color)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

export const getMyInvitations = (email) =>
  supabase
    .from('workspace_invitations')
    .select('id,workspace_id,invitee_email,status,created_at, inviter:profiles!inviter_id(name,email,avatar_url), workspace:workspaces!workspace_id(name,icon,color,description)')
    .eq('invitee_email', email.toLowerCase())
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

export const getInvitationByToken = (token) =>
  supabase
    .from('workspace_invitations')
    .select('id,workspace_id,invitee_email,status,token, inviter:profiles!inviter_id(name,email,avatar_url), workspace:workspaces!workspace_id(name,icon,color,description)')
    .eq('token', token)
    .maybeSingle()

// Use server-side SECURITY DEFINER function to bypass RLS race conditions
export const acceptInvitation = async (invitationId, inviteeEmail, workspaceId, userId) => {
  // Primary: use server-side function (bypasses RLS entirely)
  const { data, error } = await supabase.rpc('accept_workspace_invitation', {
    p_invitation_id: invitationId
  })
  if (!error && data?.success) return { data, error: null }

  // Fallback: direct insert (works if email already in profile)
  await addMemberToWorkspace(workspaceId, userId, 'member')
  return supabase
    .from('workspace_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitationId)
}

export const acceptInvitationByToken = async (token) =>
  supabase.rpc('accept_invitation_by_token', { p_token: token })

export const declineInvitation = (invitationId) =>
  supabase
    .from('workspace_invitations')
    .update({ status: 'declined' })
    .eq('id', invitationId)

export const cancelInvitation = (invitationId) =>
  supabase
    .from('workspace_invitations')
    .delete()
    .eq('id', invitationId)

// ── Tasks ──────────────────────────────────────────────────────────────────
export const getTasks = (workspaceId) =>
  supabase
    .from('tasks')
    .select('id,title,description,status,priority,due_date,assigned_to,assignees,delegator_id,created_by,workspace_id,project,tags,checklist,recurrence_type,recurrence_interval,created_at,updated_at,archived_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1000)

export const createTask = (task) =>
  supabase.from('tasks').insert(task).select().single()

export const updateTask = (id, updates) =>
  supabase.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()

export const deleteTask = (id) =>
  supabase.from('tasks').delete().eq('id', id)

// ── Activity Log ───────────────────────────────────────────────────────────
export const logActivity = (taskId, userId, action) =>
  supabase.from('task_activity').insert({ task_id: taskId, user_id: userId, action })

// ── Work Type Configs ─────────────────────────────────────────────────────
export const getWorkTypeConfigs = (orgId) =>
  supabase.from('work_type_configs').select('*').eq('org_id', orgId).eq('is_active', true).order('sort_order')

export const getAllWorkTypeConfigs = (orgId) =>
  supabase.from('work_type_configs').select('*').eq('org_id', orgId).order('sort_order')

export const insertWorkTypeConfig = (config) =>
  supabase.from('work_type_configs').insert(config).select().single()

export const updateWorkTypeConfig = (id, updates) =>
  supabase.from('work_type_configs').update(updates).eq('id', id)

export const deleteWorkTypeConfig = (id) =>
  supabase.from('work_type_configs').delete().eq('id', id)

// ── User Worksheet Preferences ────────────────────────────────────────────
export const getUserWorksheetPrefs = (userId, orgId) =>
  supabase.from('user_worksheet_prefs').select('*').eq('user_id', userId).eq('org_id', orgId)

export const upsertUserWorksheetPref = (pref) =>
  supabase.from('user_worksheet_prefs').upsert(pref, { onConflict: 'user_id,org_id,work_type' }).select().single()

// ── Support Tickets ────────────────────────────────────────────────────────
// Note: we don't chain .select() after insert because anon has no SELECT
// policy on the table — that would make PostgREST fail the whole call.
// Instead we synthesise the returned row from the payload (good enough
// for the notify-admin email).
export const createSupportTicket = async (payload) => {
  const { error } = await supabase.from('support_tickets').insert(payload)
  if (error) return { data: null, error }
  return {
    error: null,
    data: {
      ...payload,
      priority: 'normal',
      status: 'open',
      created_at: new Date().toISOString(),
    },
  }
}

// Logged-in users — RLS auto-filters to their own tickets
export const getMyTickets = () =>
  supabase.from('support_tickets').select('*').order('created_at', { ascending: false })

// Admin only — RLS allows full read for @taskflowco.in emails
export const getAllTickets = (filters = {}) => {
  let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
  if (filters.status)   q = q.eq('status',   filters.status)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.priority) q = q.eq('priority', filters.priority)
  return q
}

export const updateSupportTicket = (id, updates) =>
  supabase.from('support_tickets').update(updates).eq('id', id).select().single()

export const notifyAdminOfTicket = (ticket) =>
  supabase.functions.invoke('notify-support-ticket', { body: { ticket } })

// Admin = any @taskflowco.in email
export const isAdminEmail = (email) =>
  !!email && /@taskflowco\.in$/i.test(String(email).trim())

// ── Announcements ──────────────────────────────────────────────────────────
// Logged-in users see active, non-expired announcements (RLS handles it)
export const getActiveAnnouncements = () =>
  supabase.from('announcements').select('*').order('published_at', { ascending: false })

// Admin — see all (active + expired + draft)
export const getAllAnnouncements = () =>
  supabase.from('announcements').select('*').order('published_at', { ascending: false })

export const createAnnouncement = async (payload) => {
  const { error } = await supabase.from('announcements').insert(payload)
  if (error) return { data: null, error }
  return { data: payload, error: null }
}

export const updateAnnouncement = (id, updates) =>
  supabase.from('announcements').update(updates).eq('id', id).select().single()

export const deleteAnnouncement = (id) =>
  supabase.from('announcements').delete().eq('id', id)

// Per-user read tracking
export const getMyReadAnnouncementIds = async () => {
  const { data, error } = await supabase.from('announcement_reads').select('announcement_id')
  if (error) return { data: [], error }
  return { data: (data || []).map(r => r.announcement_id), error: null }
}

export const markAnnouncementRead = (announcementId, userId) =>
  supabase.from('announcement_reads').upsert(
    { user_id: userId, announcement_id: announcementId },
    { onConflict: 'user_id,announcement_id' }
  )
