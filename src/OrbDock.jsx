import React,{useState} from 'react'
import {BookOpen,Waypoints,FileSignature} from 'lucide-react'
const STEP=56,LIFT=1.6
export default function OrbDock({mode,setMode,onAudit}){
 const [open,setOpen]=useState(true)
 const orbs=[
  {id:'reader',icon:BookOpen,label:'Reader Brief',tip:'Reading View',active:mode==='reader',run:()=>setMode('reader')},
  {id:'investigator',icon:Waypoints,label:'Investigator OSINT',tip:'Deep Dive & Map',active:mode==='investigator',run:()=>setMode('investigator')},
  {id:'audit',icon:FileSignature,label:'Paste / Audit Paragraph ↗',tip:'Check a Paragraph',run:onAudit}]
 const n=orbs.length,arc=j=>LIFT*((j-n/2)**2-(n/2)**2)
 const place=i=>({'--x':-(n-i)*STEP+'px','--y':arc(i)+'px','--i':i})
 return <nav className={'orb-dock'+(open?' open':'')} aria-label="View mode" style={{'--n':n}}>
  {orbs.map((o,i)=><button key={o.id} type="button" className={'orb satellite '+o.id+(o.active?' active':'')} style={place(i)} aria-label={o.label} aria-pressed={o.id==='audit'?undefined:o.active} aria-hidden={!open} tabIndex={open?0:-1} onClick={o.run}><o.icon size={16} strokeWidth={1.7} aria-hidden="true"/><span className="orb-tip">{o.tip}</span></button>)}
  <button type="button" className="orb core" aria-label={open?'Close quick tools':'Open quick tools'} aria-expanded={open} onClick={()=>setOpen(x=>!x)}>
   <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5L28 26H4Z" fill="none" stroke="#F8FAFC" strokeWidth="1.8" strokeLinejoin="round"/><path d="M19 15L31 11" stroke="#53BFAF" strokeWidth="1.8"/><path d="M19 16.5L31 16.5" stroke="#CBD5E1" strokeWidth="1.8"/><path d="M19 18L31 22" stroke="#2563EB" strokeWidth="1.8"/></svg>
  </button>
 </nav>
}
