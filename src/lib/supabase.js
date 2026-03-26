import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set')
}

export const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder')

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

export const getProfile = (userId) =>
  supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

export const getAllProfiles = () =>
  supabase.from('profiles').select('*').order('name')

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
    .insert({
      workspace_id: workspaceId,
      inviter_id: inviterId,
      invitee_email: inviteeEmail.toLowerCase().trim(),
      status: 'pending',
      token: crypto.randomUUID()
    })
    .select()
    .single()

export const getWorkspaceInvitations = (workspaceId) =>
  supabase
    .from('workspace_invitations')
    .select('*, inviter:profiles!inviter_id(name,email,avatar_url), workspace:workspaces!workspace_id(name,icon,color)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

export const getMyInvitations = (email) =>
  supabase
    .from('workspace_invitations')
    .select('*, inviter:profiles!inviter_id(name,email,avatar_url), workspace:workspaces!workspace_id(name,icon,color,description)')
    .eq('invitee_email', email.toLowerCase())
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

export const getInvitationByToken = (token) =>
  supabase
    .from('workspace_invitations')
    .select('*, inviter:profiles!inviter_id(name,email,avatar_url), workspace:workspaces!workspace_id(name,icon,color,description)')
    .eq('token', token)
    .maybeSingle()

export const acceptInvitation = async (invitationId, inviteeEmail, workspaceId, userId) => {
  // Add to workspace first
  await addMemberToWorkspace(workspaceId, userId, 'member')
  // Then mark accepted
  return supabase
    .from('workspace_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitationId)
}

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
export const logActivity = (taskId, userId, action) =>
  supabase.from('task_activity').insert({ task_id: taskId, user_id: userId, action })
