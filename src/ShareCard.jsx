import React,{useEffect,useMemo,useRef} from 'react'
import {clean,claimStatus} from './engine'

export const perspectives=[['self','Self-Reported / PR','#1E40AF'],['primary','Primary / Empirical Records','#115E59'],['independent','Independent Media & Field Reports','#262936']]
const percent=x=>x===null?'N/A':Math.round(x*100)+'%'
const md=s=>clean(s).replace(/[\\`*_[\]<>]/g,'\\$&')
export function markdownBrief(dossier,evidence,label){
 const lines=['# '+md(dossier.title),'','## Claim',...dossier.claims.map(c=>md(c.text)),'','## Evidence snapshot',`- Spin Gap: ${percent(label.discrepancy)}`,`- Hard Proof: ${percent(label.primaryRatio)}`,`- Active records: ${evidence.length}`,'','## Checkpoints',...dossier.claims.map(c=>{const s=claimStatus(c,evidence);return `- [${s.status}] ${md(c.text)} (${s.n}/3 independent primary groups)`}),'','## Three perspectives']
 for(const [role,title]of perspectives){lines.push('','### '+title);const rows=evidence.filter(e=>e.role===role);if(!rows.length)lines.push('No source identified.');for(const e of rows)lines.push('','#### '+md(e.title),'> '+md(e.text||'Source excerpt unavailable.').replace(/\n/g,'\n> '),'',`Source: ${new URL(e.url,location.href).href}`,`Group: ${md(e.sourceGroup)} · Stance: ${e.stance||'UNKNOWN'}`)}
 lines.push('','Cryptographic verification checks snapshot integrity. Human source review determines support.');return lines.join('\n')
}
export function saveBlob(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
const wrap=(text,width)=>{const lines=[];let line='';for(const word of clean(text).split(/\s+/)){for(const part of word.match(new RegExp('.{1,'+width+'}','gu'))||[]){if(line.length+part.length+1>width){lines.push(line);line=''}line+=(line?' ':'')+part}}if(line)lines.push(line);return lines}
export function posterModel(title,evidence,label){
 const lines=wrap(title,36).slice(0,3),titleSize=lines.length>2?32:38,rows=perspectives.map(([role,title,color])=>({role,title,color,count:evidence.filter(e=>e.role===role).length})),metricsY=128+lines.length*(titleSize+8),height=metricsY+520
 let consumed=0;return {lines,titleSize,metricsY,height,rows:rows.map(row=>{const x=consumed;consumed+=row.count;return {...row,x:64+x/Math.max(1,evidence.length)*772,width:row.count/Math.max(1,evidence.length)*772}}),gap:percent(label.discrepancy),proof:percent(label.primaryRatio),total:evidence.length}
}
export async function posterPNG(svg){
 const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob)
 try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=900;canvas.height=Number(svg.getAttribute('height'));const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed')),'image/png'))}finally{URL.revokeObjectURL(url)}
}
export default function ShareCard({dossier,evidence,label,onClose,onNotice}){
 const ref=useRef(null),dialog=useRef(null),model=useMemo(()=>posterModel(dossier.title,evidence,label),[dossier,evidence,label])
 useEffect(()=>{dialog.current.showModal();return()=>dialog.current?.close()},[])
 async function downloadPNG(){try{saveBlob('touchstone-card.png',await posterPNG(ref.current));onNotice('PNG downloaded')}catch(e){onNotice('Image export: '+e.message)}}
 async function copyImage(){try{if(!navigator.clipboard?.write||!window.ClipboardItem)throw new Error('Use Download PNG in this browser');const png=posterPNG(ref.current);await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);onNotice('Image copied')}catch(e){onNotice('Copy image: '+e.message)}}
 return <dialog className="share-dialog" aria-label="Share Visual Card" ref={dialog} onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose()}}><div className="share-heading"><h2>Share Visual Card</h2><button onClick={onClose} aria-label="Close visual card">✕</button></div><div className="share-preview"><svg ref={ref} xmlns="http://www.w3.org/2000/svg" width="900" height={model.height} viewBox={`0 0 900 ${model.height}`} role="img" aria-label={'Evidence summary for '+dossier.title} fontFamily="Arial, sans-serif" fill="#0F172A">
  <rect width="900" height={model.height} fill="#F8FAFC"/><text x="64" y="80" fontFamily="Georgia, serif" fontSize="34">Touchstone</text><text x="836" y="76" textAnchor="end" fontSize="16" fill="#475569">{new Date().toISOString().slice(0,10)}</text>
  {model.lines.map((line,i)=><text key={i} x="64" y={156+i*(model.titleSize+10)} fontSize={model.titleSize} fontWeight="600">{line}</text>)}
  <text x="64" y={model.metricsY+40} fontSize="18" fill="#475569">SPIN GAP</text><text x="460" y={model.metricsY+40} fontSize="18" fill="#475569">PRIMARY PROOF</text><text x="64" y={model.metricsY+145} fontSize="92" fontFamily="Georgia, serif">{model.gap}</text><text x="460" y={model.metricsY+145} fontSize="92" fontFamily="Georgia, serif" fill="#115E59">{model.proof}</text>
  {model.rows.map((row,i)=><g key={row.role}><text x="64" y={model.metricsY+215+i*56} fontSize="22" fill={row.color}>{row.title}</text><text x="836" y={model.metricsY+215+i*56} textAnchor="end" fontSize="28" fill={row.color}>{row.count}</text><rect x={row.x} y={model.metricsY+365} width={row.width} height="18" fill={row.color}/></g>)}
  <text x="64" y={model.height-98} fontSize="19">{model.total} source records · Three perspectives</text><text x="64" y={model.height-64} fontSize="15" fill="#475569">Snapshot integrity verified separately from claim support.</text><text x="64" y={model.height-32} fontSize="15" fill="#475569">yansu.me/touchstone/</text>
 </svg></div><div className="share-actions"><button onClick={()=>{saveBlob('touchstone-card.svg',new Blob([new XMLSerializer().serializeToString(ref.current)],{type:'image/svg+xml;charset=utf-8'}));onNotice('SVG downloaded')}}>Download SVG</button><button onClick={downloadPNG}>Download PNG</button><button onClick={copyImage}>Copy Image</button></div></dialog>
}
