import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Auth ───────────────────────────────────────────────────────────────────
export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  })

export const signOut = () => supabase.auth.signOut()

// ── Profile ────────────────────────────────────────────────────────────────
export const upsertProfile = (profile) =>
  supabase.from('profiles').upsert(profile, { onConflict: 'id' })

// ── Access Requests ────────────────────────────────────────────────────────
export const submitAccessRequest = (userId, email, name) =>
  supabase.from('access_requests').upsert(
    { user_id: userId, email, name, status: 'pending' },
    { onConflict: 'user_id' }
  )

export const checkAccessStatus = (userId) =>
  supabase.from('access_requests').select('*').eq('user_id', userId).maybeSingle()

export const getAccessRequests = () =>
  supabase.from('access_requests').select('*').order('created_at', { ascending: false })

export const approveRequest = (userId) =>
  supabase.from('access_requests').update({ status: 'approved' }).eq('user_id', userId)

export const denyRequest = (userId) =>
  supabase.from('access_requests').update({ status: 'denied' }).eq('user_id', userId)

export const removeUserFromAllWorkspaces = (userId) =>
  supabase.from('workspace_members').delete().eq('user_id', userId)

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
    .select('*')
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
    .select('role, profiles(*)')
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

// ── Tasks ──────────────────────────────────────────────────────────────────
export const getTasks = (workspaceId) =>
  supabase
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

export const createTask = (task) =>
  supabase.from('tasks').insert(task).select().single()

export const updateTask = (id, updates) =>
  supabase.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()

export const deleteTask = (id) =>
  supabase.from('tasks').delete().eq('id', id)

// ── Activity Log ───────────────────────────────────────────────────────────
export const logActivity = (taskId, userId, action, timeLogged = 0) =>
  supabase.from('task_activity').insert({ task_id: taskId, user_id: userId, action, time_logged: timeLogged })
