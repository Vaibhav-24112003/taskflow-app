import { createClient } from '@supabase/supabase-js'

// Fallback to hardcoded values if env vars are missing (prevents blank white screen)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vorxrjekbokqkigfabhr.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvcnhyamVrYm9rcWtpZ2ZhYmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDkyNDEsImV4cCI6MjA4NzQyNTI0MX0.tJIIJZ1tJU_7nDsgYzlMfy2G2UWwDyMmf1f61clsEFM'

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

export const getProfile = (userId) =>
  supabase.from('profiles').select('id,name,email,avatar_url').eq('id', userId).maybeSingle()

export const getAllProfiles = () =>
  supabase.from('profiles').select('id,name,email,avatar_url').order('name')

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
    .select('id,title,description,status,priority,due_date,assigned_to,assignees,delegator_id,created_by,workspace_id,project,tags,checklist,recurrence_type,recurrence_interval,created_at,updated_at')
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
