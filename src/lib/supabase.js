import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
  })

export const signOut = () => supabase.auth.signOut()

// ── Access requests ───────────────────────────────────────────────────────────

export async function submitAccessRequest(user) {
  return supabase.from('access_requests').upsert({
    user_id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.email,
    status: 'pending'
  }, { onConflict: 'user_id' })
}

export async function checkAccessStatus(userId) {
  const { data } = await supabase
    .from('access_requests').select('status').eq('user_id', userId).single()
  return data?.status || null
}

export async function getAccessRequests() {
  const { data, error } = await supabase
    .from('access_requests').select('*').order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function approveRequest(userId) {
  return supabase.from('access_requests').update({ status: 'approved' }).eq('user_id', userId)
}

export async function denyRequest(userId) {
  return supabase.from('access_requests').update({ status: 'denied' }).eq('user_id', userId)
}


export async function removeUserFromAllWorkspaces(userId) {
  return supabase.from('workspace_members').delete().eq('user_id', userId)
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export async function upsertProfile(user) {
  return supabase.from('profiles').upsert({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.email,
    avatar_url: user.user_metadata?.avatar_url || null,
  })
}

export async function getApprovedProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, avatar_url, access_requests(status)')
  const approved = (data || []).filter(p =>
    p.access_requests?.some(r => r.status === 'approved')
  )
  return { data: approved, error }
}

// ── Workspaces ────────────────────────────────────────────────────────────────

export async function getMyWorkspaces(userId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces(*)')
    .eq('user_id', userId)
  return { data: (data || []).map(r => ({ ...r.workspaces, myRole: r.role })), error }
}

export async function createWorkspace(ws) {
  const { data, error } = await supabase.from('workspaces').insert(ws).select().single()
  return { data, error }
}

export async function updateWorkspace(id, patch) {
  const { data, error } = await supabase.from('workspaces').update(patch).eq('id', id).select().single()
  return { data, error }
}

export async function deleteWorkspace(id) {
  return supabase.from('workspaces').delete().eq('id', id)
}

export async function getWorkspaceMembers(wsId) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, profiles(id, email, name, avatar_url)')
    .eq('workspace_id', wsId)
  return { data: (data || []).map(r => ({ ...r.profiles, role: r.role })), error }
}

export async function addMemberToWorkspace(wsId, userId, role = 'member') {
  return supabase.from('workspace_members').upsert({ workspace_id: wsId, user_id: userId, role })
}

export async function removeMemberFromWorkspace(wsId, userId) {
  return supabase.from('workspace_members').delete().eq('workspace_id', wsId).eq('user_id', userId)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(wsId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_comments(id, user_id, text, created_at), task_activity(id, user_id, action, time_logged, created_at)')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: true })
  return { data: data || [], error }
}

export async function createTask(task) {
  const { data, error } = await supabase.from('tasks').insert(task).select().single()
  return { data, error }
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
  return { data, error }
}

export async function deleteTask(id) {
  return supabase.from('tasks').delete().eq('id', id)
}

export async function addComment(taskId, userId, text) {
  const { data, error } = await supabase
    .from('task_comments').insert({ task_id: taskId, user_id: userId, text }).select().single()
  return { data, error }
}

export async function logTime(taskId, userId, hours) {
  return supabase.from('task_activity').insert({
    task_id: taskId, user_id: userId, action: `Logged ${hours}h`, time_logged: hours
  })
}
