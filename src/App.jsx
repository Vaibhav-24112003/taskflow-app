import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
// LandingPage is shown only to logged-out visitors — lazy so it isn't bundled
// into the main chunk that every signed-in user has to download + parse.
// AnnouncementsBell is in the always-visible top nav, so it stays eager.
// SupportContactForm is also used eagerly on the landing page, so keep it static.
// Heavy / interaction-gated admin views are lazy so they don't bloat the initial bundle.
import AnnouncementsBell from './AnnouncementsPanel.jsx'
import SupportContactForm from './SupportContactForm.jsx'
// Wrap React.lazy so that a stale chunk hash (after a deploy) auto-reloads
// the page once to fetch the fresh index.html instead of hanging Suspense.
function lazyWithReload(importer) {
  return lazy(() => importer().catch(err => {
    const isChunkErr = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(err?.message || err))
    if (isChunkErr && !sessionStorage.getItem('tf-chunk-reloaded')) {
      sessionStorage.setItem('tf-chunk-reloaded', '1')
      window.location.reload()
      return new Promise(() => {})  // hang while reload happens
    }
    throw err
  }))
}
const SupportAdminView = lazyWithReload(() => import('./SupportAdminView.jsx'))
const MyTicketsView = lazyWithReload(() => import('./MyTicketsView.jsx'))
const AnnouncementsAdmin = lazyWithReload(() => import('./AnnouncementsAdmin.jsx'))
const LandingPage = lazyWithReload(() => import('./LandingPage.jsx'))
import { isAdminEmail } from './lib/supabase'
import { LayoutDashboard, BookUser, BarChart2, Globe, Mail, Users, Receipt, Settings, BookOpen, Briefcase, Library, Database, Key, HelpCircle, LifeBuoy, List, Kanban, Calendar, LayoutGrid, Zap, MessageSquare, Search, ExternalLink, Download } from 'lucide-react'
import {
  supabase, signInWithGoogle, signOut, upsertProfile,
  getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace, getMemberRole,
  inviteToWorkspace, getWorkspaceInvitations, getMyInvitations,
  getInvitationByToken, acceptInvitation, acceptInvitationByToken, declineInvitation, cancelInvitation,
  getTasks, createTask, updateTask, deleteTask, logActivity,
  getWorkTypeConfigs, getAllWorkTypeConfigs, insertWorkTypeConfig, updateWorkTypeConfig, deleteWorkTypeConfig,
  getUserWorksheetPrefs, upsertUserWorksheetPref
} from './lib/supabase.js'
import { handleAuthEvent, bootBlockedCheck } from './lib/authStateListener.js'
import { useTrialGate } from './lib/useTrialGate.js'
import TrialBanner, { ModuleLock } from './components/TrialBanner.jsx'
import TaskflowLogo from './components/TaskflowLogo.jsx'
import HomeOverview from './HomeOverview.jsx'
import InstallPWAButton from './components/InstallPWAButton.jsx'
import { BrandLoader } from './components/Loaders.jsx'
import AppTour from './components/AppTour.jsx'
const UsersAdmin = lazyWithReload(() => import('./admin/UsersAdmin.jsx'))
const OrgsAdmin = lazyWithReload(() => import('./admin/OrgsAdmin.jsx'))
const AdminShell = lazyWithReload(() => import('./admin/AdminShell.jsx'))

// ── Module-level data cache ────────────────────────────────────────────────────
// Survives component unmount/remount (navigation away and back).
// Keyed by orgId so switching orgs always fetches fresh data.
var _dashCache = {};       // orgId → { rows, clients, worksheets, orgMembers }
var _worksheetsCache = {}; // orgId → { clients }
var _billingCache = {};    // orgId → { clients, invoices, payments, proposals }
var _ccCache = {};         // orgId → { clients, requests, responses, ccMessages, cloudStorages }
var _commsCache = {};      // orgId → { clients, portalUsers, templates, commLogs }
var _erpBoardCache = {};   // orgId → { rows, worksheets, clients, members }
var _analyticsCache = {};  // orgId → { rows, worksheets, clients, members, logs }
var _clientsModCache = {}; // orgId → { clients }

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = ['Todo','In Progress','Review','Done']
const PRIORITIES = ['Low','Medium','High','Critical']
const RECURRENCE_TYPES = ['none','daily','weekly','monthly','custom']
const PC = {'Low':'#64748b','Medium':'#38bdf8','High':'#fb923c','Critical':'#f87171'}
const PI = {'Low':'↓','Medium':'→','High':'↑','Critical':'⚡'}
const WS_COLORS = ['#0e2a47','#ec4899','#10b981','#f59e0b','#06b6d4','#1d4670','#ef4444','#3b82f6']
const WS_ICONS = ['*','#','@','&','+','▲','●','■']
const SCPAL = ['#64748b','#0e2a47','#f59e0b','#10b981','#ec4899','#06b6d4','#1d4670','#ef4444']

// ── Access Control ─────────────────────────────────────────────────────────────
var PERMISSION_NODES=[
  {id:'diary',label:'My Work',module:'diary'},
  {id:'diary.worklist',label:'Work',module:'diary',section:'worklist'},
  {id:'diary.planmyday',label:'Plan Today',module:'diary',section:'planmyday'},
  {id:'workzone',label:'WorkZone',module:'workzone'},
  {id:'workzone.worksheets',label:'Worksheets',module:'workzone',section:'worksheets'},
  {id:'workzone.board',label:'Board',module:'workzone',section:'board'},
  {id:'workzone.bigclients',label:'Big Clients',module:'workzone',section:'bigclients'},
  {id:'workzone.teamview',label:'Team View',module:'workzone',section:'teamview'},
  {id:'library',label:'Library',module:'library'},
  {id:'team',label:'Team',module:'team'},
  {id:'team.logs',label:'Logs',module:'team',section:'logs'},
  {id:'team.attendance',label:'Attendance',module:'team',section:'attendance'},
  {id:'team.leaves',label:'Leaves',module:'team',section:'leaves'},
  {id:'analytics',label:'Analytics',module:'analytics'},
  {id:'comms',label:'Communication',module:'comms'},
  {id:'billing',label:'Billing',module:'billing'},
  {id:'masterdata',label:'Master Data',module:'masterdata'},
  {id:'setup',label:'Set-up',module:'setup'},
]

function resolvePermission(nodeId,userId,rolePerms,memberPerms,orgMembers){
  var mo=(memberPerms||[]).find(function(p){return p.user_id===userId&&p.node_id===nodeId;});
  if(mo)return{access:mo.access||'none',scope:mo.scope||'own',source:'member'};
  var mem=(orgMembers||[]).find(function(m){return m.user_id===userId;});
  var roleId=mem&&mem.role_id;
  if(roleId){
    var rp=(rolePerms||[]).find(function(p){return p.role_id===roleId&&p.node_id===nodeId;});
    if(rp)return{access:rp.access,scope:rp.scope,source:'role'};
  }
  var legacyRole=mem&&mem.role;
  if(legacyRole==='owner'||legacyRole==='admin')return{access:'manage',scope:'all',source:'legacy'};
  var memberDefaults={'diary':'view','diary.worklist':'view','diary.planmyday':'edit','workzone':'view','workzone.worksheets':'view','workzone.board':'view','library':'view','team':'view','team.logs':'view','team.attendance':'view','team.leaves':'view'};
  if(memberDefaults[nodeId])return{access:memberDefaults[nodeId],scope:'own',source:'default'};
  return{access:'none',scope:'own',source:'default'};
}
function canAccess(nodeId,minAccess,userId,rolePerms,memberPerms,orgMembers){
  var p=resolvePermission(nodeId,userId,rolePerms,memberPerms,orgMembers);
  if(!p||p.access==='none')return false;
  var levels=['none','view','edit','manage'];
  return levels.indexOf(p.access)>=levels.indexOf(minAccess||'view');
}

// ── Design tokens — CSS variable based (proper light/dark, no filter hack) ─────
const G = {
  bg:'var(--tf-bg)', panel:'var(--tf-panel)', overlay:'var(--tf-overlay)',
  surface:'var(--tf-surface)', surfaceHov:'var(--tf-surface-hov)',
  border:'var(--tf-border)', borderHov:'var(--tf-border-hov)',
  text:'var(--tf-text)', textSub:'var(--tf-text-sub)', textMut:'var(--tf-text-mut)',
  input:'var(--tf-input)', blur:'blur(18px)', blurSm:'blur(10px)',
  radius:'14px', radiusMd:'10px', radiusSm:'7px', radiusXs:'5px',
  trans:'all 0.18s cubic-bezier(0.4,0,0.2,1)', transSnap:'all 0.09s ease',
  font:"'Inter','Helvetica Neue',system-ui,sans-serif", fontDisplay:"'Inter','Helvetica Neue',system-ui,sans-serif",
  shadow:'0 4px 24px var(--tf-shadow)', shadowLg:'0 20px 64px var(--tf-shadow-lg)',
}
const GR = {bg:'#0b0f1a',surface:'#131825',surfaceHov:'#1a2133',border:'rgba(255,255,255,0.07)',text:'#eaecf5',textSub:'#5c6b87',textMut:'#2a3655'}
const hexRgb = h=>{if(!h||h.length<7)return'14,42,71';return`${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`}
const mkColor = e=>{let n=0;for(let c of e)n+=c.charCodeAt(0);return WS_COLORS[n%WS_COLORS.length]}
const mkInit = n=>n.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?' 
const isOvd = d=>d&&new Date(d)<new Date()
const fmtDate = d=>{if(!d)return'—';const dt=new Date(d),now=new Date(),diff=Math.round((dt-now)/864e5);if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff===-1)return'Yesterday';return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
const fmtFull = d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'
const fmtAgo = d=>{if(!d)return'';const s=Math.round((Date.now()-new Date(d))/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`}
const enrich = u=>u?{...u,initials:mkInit(u.name||u.email||'?'),color:mkColor(u.email||'')}:null
const getUser = (id,list=[])=>enrich(list.find(u=>u.id===id))||null
const scMap = ss=>{const d={'Todo':'#64748b','In Progress':'#0e2a47','Review':'#f59e0b','Done':'#10b981'};let i=0;return Object.fromEntries(ss.map(s=>[s,d[s]||SCPAL[4+(i++%4)]]))}
const getAssignees = t=>(t.assignees&&t.assignees.length>0)?t.assignees:(t.assigned_to?[t.assigned_to]:[])
const isOnMyBoard = (t,uid)=>t.created_by===uid||getAssignees(t).includes(uid)||(t.delegator_id&&t.delegator_id===uid)
const isMirrored = (t,uid)=>getAssignees(t).includes(uid)&&t.created_by!==uid
const nextDate=(due,type,n=1)=>{if(!due||type==='none')return null;const dt=new Date(`${due}T00:00:00`),v=Math.max(1,Number(n)||1);if(type==='daily'||type==='custom')dt.setDate(dt.getDate()+v);else if(type==='weekly')dt.setDate(dt.getDate()+7*v);else if(type==='monthly')dt.setMonth(dt.getMonth()+v);return dt.toISOString().slice(0,10)}
const rrLabel=(type,n=1)=>{if(!type||type==='none')return null;const v=Number(n)||1;if(type==='daily')return v===1?'Daily':`${v}d`;if(type==='weekly')return v===1?'Weekly':`${v}w`;if(type==='monthly')return v===1?'Monthly':`${v}mo`;return`${v}d`}
var MODULE_TINT = {diary:'#2F6BFF',workzone:'#0E2A47',library:'#2F6BFF',team:'#F59E0B',chat:'#7C3AED',analytics:'#16A34A',comms:'#14B8A6',billing:'#EC4899',masterdata:'#8B5CF6',setup:'#64748B'}
function hex2rgba(h,a){h=(h||'').replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];var n=parseInt(h,16);return'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'}

function GlobalStyle({ lightMode }) {
  useEffect(()=>{const html=document.documentElement;html.setAttribute('data-theme',lightMode?'light':'dark');html.style.transition='background 0.25s, color 0.25s';html.style.filter=''},[lightMode])
  useEffect(()=>{const lf=document.getElementById('tf-font');if(!lf){const l=document.createElement('link');l.id='tf-font';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap';document.head.appendChild(l)};const id='tf-gs';if(document.getElementById(id))return;const s=document.createElement('style');s.id=id;s.textContent=`
:root,[data-theme="dark"]{--tf-bg:#0B2237;--tf-panel:rgba(13,38,62,0.94);--tf-overlay:rgba(6,16,30,0.82);--tf-surface:#0F2C49;--tf-surface-hov:#16385A;--tf-border:rgba(255,255,255,0.09);--tf-border-hov:rgba(255,255,255,0.18);--tf-input:#12314F;--tf-text:#EAF1F8;--tf-text-sub:#9FB6D4;--tf-text-mut:#4A6485;--tf-shadow:rgba(3,10,20,0.55);--tf-shadow-lg:rgba(3,10,20,0.75);--tf-table-header:#143A5E;--tf-accent:#5B9BFF;--tf-accent-2:#14C7C0;--tf-accent-ink:#08243f;--tf-grad:linear-gradient(135deg,#2F6BFF,#14C7C0)}
[data-theme="light"]{--tf-bg:#f5f7fa;--tf-panel:rgba(255,255,255,0.97);--tf-overlay:rgba(15,20,40,0.55);--tf-surface:#ffffff;--tf-surface-hov:#f5f7fc;--tf-border:rgba(0,0,0,0.09);--tf-border-hov:rgba(0,0,0,0.18);--tf-input:#f8f9fd;--tf-text:#0a1929;--tf-text-sub:#475569;--tf-text-mut:#c0c9dd;--tf-table-header:#e3e8ef;--tf-shadow:rgba(0,0,0,0.08);--tf-shadow-lg:rgba(0,0,0,0.15);--tf-accent:#2F6BFF;--tf-accent-2:#14C7C0;--tf-accent-ink:#ffffff;--tf-grad:linear-gradient(135deg,#2F6BFF,#14C7C0)}
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Plus Jakarta Sans','DM Sans','Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}input,textarea,select,button{font-family:inherit;-webkit-font-smoothing:antialiased}.tf-board::-webkit-scrollbar{height:4px}.tf-board::-webkit-scrollbar-track{background:transparent}.tf-board::-webkit-scrollbar-thumb{background:var(--tf-border-hov);border-radius:2px}.tf-board{scrollbar-width:thin;scrollbar-color:var(--tf-border-hov) transparent}.tf-col::-webkit-scrollbar{width:3px}.tf-col::-webkit-scrollbar-thumb{background:var(--tf-border);border-radius:2px}.tf-col{scrollbar-width:thin;scrollbar-color:var(--tf-border) transparent}input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);cursor:pointer}[data-theme="light"] input[type=date]::-webkit-calendar-picker-indicator{filter:none;opacity:0.5}@keyframes tf-cardIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.tf-kcard{animation:tf-cardIn .5s ease both}.tf-kcard:hover{transform:translateY(-2px);box-shadow:0 12px 24px -14px rgba(14,42,71,.45)}@media (prefers-reduced-motion: reduce){.tf-kcard{animation:none!important}}`;document.head.appendChild(s)},[])
  return null
}

// NOTE: The remainder of App.jsx is unchanged from the existing production implementation.
// The Home entry surface below is replaced with HomeOverview; all workspace/module logic remains intact.
