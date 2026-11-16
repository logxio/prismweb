import React,{useState} from 'react'
import {Copy,Share2,FileDown,Braces} from 'lucide-react'
export default function OrbDock({onCopy,onShare,onHTML,onJSON,disabled}){
 const [open,setOpen]=useState(false)
 const orbs=[
  {id:'copy',icon:Copy,label:'Copy Markdown to GPT · Claude · Gemini',tip:'Copy Markdown to GPT · Claude · Gemini',run:onCopy},
  {id:'share',icon:Share2,label:'Share Visual Card',tip:'Share Card',run:onShare},
  {id:'html',icon:FileDown,label:'Save HTML',tip:'Save HTML',run:onHTML,disabled},
  {id:'json',icon:Braces,label:'Export JSON',tip:'Export JSON',run:onJSON,disabled}]
 const place=i=>({'--x':'0px','--y':-(i+1)*50+'px'})
 return <nav className={'orb-dock'+(open?' open':'')} aria-label="Summary actions" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
  {orbs.map((o,i)=><button key={o.id} type="button" className={'orb satellite '+o.id} style={place(i)} aria-label={o.label} aria-hidden={!open} tabIndex={open?0:-1} disabled={o.disabled} onClick={o.run}><o.icon size={16} strokeWidth={1.7} aria-hidden="true"/><span className="orb-tip">{o.tip}</span></button>)}
  <button type="button" className="orb core" aria-label={open?'Close quick tools':'Open quick tools'} aria-expanded={open} onClick={()=>setOpen(x=>!x)}>
   <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5L28 26H4Z" fill="none" stroke="#F8FAFC" strokeWidth="1.8" strokeLinejoin="round"/><path d="M19 15L31 11" stroke="#53BFAF" strokeWidth="1.8"/><path d="M19 16.5L31 16.5" stroke="#CBD5E1" strokeWidth="1.8"/><path d="M19 18L31 22" stroke="#2563EB" strokeWidth="1.8"/></svg>
  </button>
 </nav>
}
