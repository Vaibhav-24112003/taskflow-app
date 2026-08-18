import React, { useEffect, useState } from 'react'
import HomeOverview from './HomeOverview.jsx'
import { supabase, getMyWorkspaces } from './lib/supabase.js'

function legacyHomeVisible(){const root=document.getElementById('root');if(!root)return false;return [...root.querySelectorAll('h1')].some(el=>(el.textContent||'').trim()==='Practice Hub')}
function hideLegacyHome(){const root=document.getElementById('root');if(!root)return;const heading=[...root.querySelectorAll('h1')].find(el=>(el.textContent||'').trim()==='Practice Hub');if(!heading)return;let n=heading;while(n&&n.parentElement&&n.parentElement!==root){const s=getComputedStyle(n);if(s.flexGrow==='1'&&s.overflowY==='auto'){n.classList.add('tf-home-legacy');return}n=n.parentElement}}
function clickOriginalText(text,prefer=''){const root=document.getElementById('root');if(!root)return;const nodes=[...root.querySelectorAll('*')].filter(el=>(el.textContent||'').trim()===text);const node=nodes.find(el=>!prefer||((el.parentElement?.textContent||'').includes(prefer)))||nodes[0];if(node)node.click()}
export default function HomeSkin(){
  const [home,setHome]=useState(false),[data,setData]=useState({orgs:[],workspaces:[],profiles:[],user:null})
  async function loadData(){const auth=await supabase.auth.getUser(),user=auth.data?.user;if(!user){setData({orgs:[],workspaces:[],profiles:[],user:null});return}const [or,wr,pr]=await Promise.all([supabase.from('organizations').select('*').order('name').limit(100),getMyWorkspaces(user.id),supabase.from('profiles').select('id,name,email').limit(500)]);setData({orgs:or.data||[],workspaces:wr.data||[],profiles:pr.data||[],user})}
  useEffect(()=>{let raf=0;const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const h=legacyHomeVisible();setHome(h);if(h)hideLegacyHome()})};const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',schedule);schedule();loadData();return()=>{cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('resize',schedule)}},[])
  useEffect(()=>{if(home){document.body.classList.add('tf-home-active');hideLegacyHome()}else document.body.classList.remove('tf-home-active')},[home])
  if(!home)return null
  return <div className="tf-home-overlay"><HomeOverview orgs={data.orgs} workspaces={data.workspaces} allProfiles={data.profiles} supabase={supabase} cu={data.user} onOpenOrg={org=>clickOriginalText(org.name,'Space')} onOpenWorkspace={ws=>clickOriginalText(ws.name,ws.description||'')} onCreateOrg={()=>clickOriginalText('+ New Practice')}/></div>
}
