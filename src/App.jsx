diff --git a/src/App.jsx b/src/App.jsx
index 5191b5a18727fcc01f8e30ec6b7eb05b415f2d32..ab117bad2bbc0e1cb24a230d4176af7bcd5f52bc 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -69,50 +69,51 @@ function Modal({open,onClose,title,width=600,children}){
         <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:'1px solid #1e2d42'}}>
           <span style={{fontSize:16,fontWeight:700,color:'#f1f5f9'}}>{title}</span>
           <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:22,lineHeight:1}}>✕</button>
         </div>
         <div style={{padding:24}}>{children}</div>
       </div>
     </div>
   )
 }
 
 function Confirm({open,icon,title,body,confirmLabel,confirmColor='#ef4444',onConfirm,onCancel}){
   if(!open) return null
   return(
     <div onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:16}}>
       <div onClick={e=>e.stopPropagation()} style={{background:'#0b1220',border:`1px solid ${confirmColor}44`,borderRadius:18,width:'100%',maxWidth:400,padding:30}}>
         <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>{icon}</div>
         <div style={{fontSize:17,fontWeight:700,color:'#f1f5f9',textAlign:'center',marginBottom:8}}>{title}</div>
         <div style={{fontSize:13,color:'#94a3b8',textAlign:'center',marginBottom:24,lineHeight:1.6}}>{body}</div>
         <div style={{display:'flex',gap:10}}>
           <button onClick={onCancel} style={{flex:1,background:'#1a2640',border:'1px solid #2a3a54',borderRadius:10,padding:'10px',color:'#94a3b8',cursor:'pointer',fontSize:14,fontWeight:600}}>Cancel</button>
           <button onClick={onConfirm} style={{flex:1,background:confirmColor,border:'none',borderRadius:10,padding:'10px',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700}}>{confirmLabel}</button>
         </div>
       </div>
     </div>
   )
+}
 
 // ── Auth screens ──────────────────────────────────────────────────────────────
 function AuthScreen(){
   const [loading,setLoading]=useState(false)
   return(
     <div style={{minHeight:'100vh',background:'#06090f',display:'flex',fontFamily:'system-ui,sans-serif'}}>
       <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:48}}>
         <div style={{maxWidth:400,width:'100%'}}>
           <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
             <div style={{width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>✦</div>
             <span style={{fontSize:26,fontWeight:800,color:'#f1f5f9'}}>TaskFlow</span>
           </div>
           <div style={{fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1.15,marginBottom:12}}>Private workspace<br/><span style={{background:'linear-gradient(90deg,#6366f1,#10b981)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>for your team</span></div>
           <div style={{fontSize:14,color:'#64748b',lineHeight:1.6,marginBottom:32}}>Sign in with Google to request access. Admin reviews all requests.</div>
           <button onClick={async()=>{setLoading(true);await signInWithGoogle()}} disabled={loading}
             style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'15px 20px',background:'#fff',borderRadius:14,border:'none',cursor:'pointer',fontSize:15,fontWeight:600,color:'#1a1a1a',boxShadow:'0 2px 12px rgba(0,0,0,0.4)',opacity:loading?0.7:1}}>
             <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
             {loading?'Redirecting…':'Continue with Google'}
           </button>
         </div>
       </div>
       <div style={{width:260,background:'#0a1220',borderLeft:'1px solid #1e2d42',display:'flex',flexDirection:'column',justifyContent:'center',padding:32}}>
         {[{icon:'👤',title:'Personal Board',desc:'Your tasks stay private'},{icon:'📤',title:'Delegate to Team',desc:'Assign tasks — mirror on their board'},{icon:'👁',title:'Manager View',desc:'Pick any member to see their board'},{icon:'📊',title:'CSV Import/Export',desc:'Bulk upload or download all tasks'}].map(f=>(
           <div key={f.title} style={{display:'flex',gap:12,marginBottom:20}}>
             <div style={{width:32,height:32,borderRadius:9,background:'#6366f122',border:'1px solid #6366f144',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>{f.icon}</div>
