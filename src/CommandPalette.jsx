import React,{useState,useRef,useMemo,useEffect} from 'react'
export default function CommandPalette({open,items,onClose,onPick,webSearch}){
 const [q,setQ]=useState(''),[idx,setIdx]=useState(0),input=useRef(null)
 // Typed text always ends with a live open Web search, after the matching commands.
 const filtered=useMemo(()=>{const t=q.trim(),hits=items.filter(it=>it.label.toLowerCase().includes(t.toLowerCase())).slice(0,20);return webSearch&&t.length>=3?[...hits,webSearch(t)]:hits},[q,items,webSearch])
 useEffect(()=>{if(open){setQ('');setIdx(0);requestAnimationFrame(()=>input.current?.focus())}},[open])
 useEffect(()=>{if(!open)return;const key=e=>{
  if(e.key==='Escape'){e.preventDefault();onClose()}
  if(e.key==='ArrowDown'){e.preventDefault();setIdx(i=>Math.min(filtered.length-1,i+1))}
  if(e.key==='ArrowUp'){e.preventDefault();setIdx(i=>Math.max(0,i-1))}
  if(e.key==='Enter'){e.preventDefault();if(filtered[idx])onPick(filtered[idx])}
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[open,filtered,idx,onClose,onPick])
 if(!open)return null
 return <div className="command-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-label="Command palette" className="command-palette"><div className="command-input"><span>⌕</span><input ref={input} aria-label="Find a command" placeholder="Search the Web, or find a dossier, tool or lens…" value={q} onChange={e=>{setQ(e.target.value);setIdx(0)}}/><button onClick={onClose}>esc</button></div><div role="listbox" aria-label="Commands">{filtered.map((it,i)=><button role="option" aria-selected={i===idx} id={'command-'+i} key={it.id} onMouseEnter={()=>{setIdx(i);it.preview?.()}} onClick={()=>onPick(it)}><span>{it.kind}</span><b>{it.label}</b><kbd>↵</kbd></button>)}{!filtered.length&&<p>No matching command</p>}</div><footer>↑ ↓ to navigate <span>↵ to open · esc to close</span></footer></section></div>
}
