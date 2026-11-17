import React,{useState} from 'react'
import {Copy,Share2,FileDown,Braces,BookOpen,Network,ScanText,Upload} from 'lucide-react'
export default function OrbDock({mode,onMode,onAudit,onCopy,onShare,onHTML,onJSON,disabled}){
 const [open,setOpen]=useState(false),[exportOpen,setExportOpen]=useState(false)
 const close=()=>{setOpen(false);setExportOpen(false)}
 const actions=[
  {id:'copy',icon:Copy,label:'Copy Markdown to GPT · Claude · Gemini',tip:'Copy Markdown to GPT · Claude · Gemini',run:onCopy},
  {id:'share',icon:Share2,label:'Share Visual Card',tip:'Share Card',run:onShare},
  {id:'html',icon:FileDown,label:'Save HTML',tip:'Save HTML',run:onHTML,disabled},
  {id:'json',icon:Braces,label:'Export JSON',tip:'Export JSON',run:onJSON,disabled}]
 const modeTip=mode==='investigator'?'Reading View':'Deep Dive & Map'
 const ModeIcon=mode==='investigator'?BookOpen:Network
 return <nav className={'orb-dock'+(open?' open':'')+(exportOpen?' export-open':'')} aria-label="Quick tools" onKeyDown={e=>{if(e.key==='Escape'){close();e.currentTarget.querySelector('.core').focus()}}}>
  <button type="button" className="orb satellite layer-one mode" style={{'--x':'-62px','--y':'0px'}} aria-label={modeTip} aria-hidden={!open} tabIndex={open?0:-1} onClick={()=>onMode(mode==='investigator'?'reader':'investigator')}><ModeIcon size={16}/><span className="orb-tip">{modeTip}</span></button>
  <button type="button" className="orb satellite layer-one audit" style={{'--x':'-124px','--y':'0px'}} aria-label="Check a Paragraph" aria-hidden={!open} tabIndex={open?0:-1} onClick={onAudit}><ScanText size={16}/><span className="orb-tip">Check a Paragraph</span></button>
  <button type="button" className={'orb satellite layer-one export'+(exportOpen?' active':'')} style={{'--x':'-186px','--y':'0px'}} aria-label="Export & Share" aria-expanded={open&&exportOpen} aria-hidden={!open} tabIndex={open?0:-1} onClick={()=>setExportOpen(x=>!x)}><Upload size={16}/>{!exportOpen&&<span className="orb-tip">Export &amp; Share</span>}</button>
  {actions.map((o,i)=><button key={o.id} type="button" className={'orb satellite layer-two '+o.id} style={{'--x':'-186px','--y':-(i+1)*52+'px'}} aria-label={o.label} aria-hidden={!(open&&exportOpen)} tabIndex={open&&exportOpen?0:-1} disabled={o.disabled} onClick={o.run}><o.icon size={16} strokeWidth={1.7} aria-hidden="true"/><span className="orb-tip">{o.tip}</span></button>)}
  <button type="button" className="orb core" aria-label={open?'Close quick tools':'Open quick tools'} aria-expanded={open} onClick={()=>open?close():setOpen(true)}>
   <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5L28 26H4Z" fill="none" stroke="#F8FAFC" strokeWidth="1.8" strokeLinejoin="round"/><path d="M19 15L31 11" stroke="#53BFAF" strokeWidth="1.8"/><path d="M19 16.5L31 16.5" stroke="#CBD5E1" strokeWidth="1.8"/><path d="M19 18L31 22" stroke="#2563EB" strokeWidth="1.8"/></svg>
  </button>
 </nav>
}
