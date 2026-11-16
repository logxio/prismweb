import React,{useRef,useState} from 'react'
export function paragraphSamples(dossiers){
 return ['climate','health'].map(id=>{
  const d=dossiers.find(x=>x.id===id);if(!d)return {id,text:''}
  const sourced=d.evidence.find(e=>e.role==='self')?.text||''
  return {id,title:id==='climate'?'Climate & corporate claims':'Clinical technology & funding',text:[d.claims[0]?.text,sourced,d.claims[1]?.text,d.claims.at(-1)?.text].filter(Boolean).map(s=>s.trim().replace(/[.!?]+$/,'')+'.').join(' ')}
 })
}
const tone=s=>s==='PRIMARY SUPPORTED'?'supported':s==='INTERESTED SELF-REPORT'?'interested':s==='CONTESTED'||s==='DISCREPANCY ALERT'?'disputed':'unverified'
const statusLabel=s=>({'PRIMARY SUPPORTED':'Backed by original records','INTERESTED SELF-REPORT':'Company self-report','DISCREPANCY ALERT':'Conflicts with primary records','CONTESTED':'Sources disagree','UNVERIFIED':'Needs more independent sources'}[s]||s)
const GLYPH={supported:'▲',interested:'◆',disputed:'✕',unverified:'◌'}
const DECISIONS=[['Keep with sourced context','Keep'],['Request further evidence','Request'],['Exclude from publication','Exclude']]
// One floating card per hovered sentence: Who · What · When · Scope and the source links.
function SentenceTip({row,evidence,at,onEnter,onLeave}){
 const ids=row.sourceIds.length?row.sourceIds:row.candidateIds
 return <div className="sentence-tip" role="tooltip" style={{left:at.x,top:at.y}} onMouseEnter={onEnter} onMouseLeave={onLeave}>
  <b className={'tip-status '+tone(row.status)}>{GLYPH[tone(row.status)]} {statusLabel(row.status)}</b>
  <dl><dt>Who</dt><dd>{row.who}</dd><dt>When</dt><dd>{row.when}</dd><dt>Scope</dt><dd>{row.scope}</dd></dl>
  <p>{row.reason}</p>
  {ids.map(id=>{const e=evidence.find(e=>e.id===id);return e&&<a key={id} href={e.url} target="_blank" rel="noreferrer">{row.sourceIds.length?'':'Candidate · '}{e.title} ↗</a>})}
 </div>
}
export default function AuditDrawer({open,onClose,text,setText,rows,onAudit,samples,editorial,setEditorial,evidence,onSign,onVerify,manifest,verification,tamper,onTamper,error}){
 const [tip,setTip]=useState(null),box=useRef(null),timer=useRef(0)
 if(!open)return null
 const show=(id,el)=>{clearTimeout(timer.current);const b=box.current.getBoundingClientRect(),r=el.getClientRects()[0]||el.getBoundingClientRect();setTip({id,at:{x:Math.max(0,Math.min(r.left-b.left,b.width-380)),y:r.bottom-b.top+box.current.scrollTop+8}})}
 const hide=()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>setTip(null),140)}
 const keep=()=>clearTimeout(timer.current)
 const decide=(r,decision,on)=>{clearTimeout(timer.current);setTip(null);setEditorial(old=>{const next={...old};if(on)next[r.id]={decision,reviewedAt:new Date().toISOString(),actor:'Human editor via interface'};else delete next[r.id];return next})}
 const tipRow=tip&&rows.find(r=>r.id===tip.id)
 return <div className="drawer-backdrop" onClick={onClose}><section ref={box} role="dialog" aria-modal="true" aria-labelledby="audit-title" className="audit-drawer" onScroll={()=>setTip(null)} onClick={e=>e.stopPropagation()}>
  <div className="drawer-head"><h2 id="audit-title">Sentence-by-Sentence Fact Check</h2><button onClick={onClose} aria-label="Close paragraph audit">×</button></div>
  <p className="audit-subtitle">See which sentences have original sources and which need more evidence.</p>
  <div className="sample-actions">{samples.map(s=><button key={s.id} onClick={()=>{setText(s.text);onAudit(s.text,s.id)}}>{s.title}</button>)}</div>
  <div className="audit-input"><textarea id="audit-text" aria-label="Paste an English paragraph" value={text} onChange={e=>setText(e.target.value)} placeholder="Paste a paragraph to trace every sentence to its sources." maxLength={30000}/><button className="solid-button" onClick={()=>onAudit(text)} disabled={!text.trim()} aria-label="Decompose & Audit">Check Sentences</button></div>
  {rows.length>0&&<>
   <div className="marked-paragraph" data-testid="highlighted-paragraph">{rows.map(r=><mark key={r.id} tabIndex={0} className={tone(r.status)+(tip?.id===r.id?' hot':'')} onMouseEnter={e=>show(r.id,e.currentTarget)} onMouseLeave={hide} onFocus={e=>show(r.id,e.currentTarget)} onBlur={hide}>{GLYPH[tone(r.status)]} {r.text} </mark>)}</div>
   <div className="audit-plans">{rows.map((r,i)=><article className={'sentence-plan'+(tip?.id===r.id?' hot':'')} key={r.id} data-testid="sentence-plan" onMouseEnter={e=>show(r.id,e.currentTarget)} onMouseLeave={hide}>
    <span className={'plan-glyph '+tone(r.status)}>{GLYPH[tone(r.status)]}</span><p>{r.text}</p>
    <fieldset aria-label={'Editorial disposition for sentence '+(i+1)}>{DECISIONS.map(([decision,short])=><label key={decision} className={editorial[r.id]?.decision===decision?'on':''}><input type="checkbox" aria-label={decision+' sentence '+(i+1)} checked={editorial[r.id]?.decision===decision} onChange={e=>decide(r,decision,e.target.checked)}/>{short}</label>)}</fieldset>
   </article>)}</div>
   <div className="manifest-actions"><button className="solid-button" onClick={onSign} disabled={rows.some(r=>!editorial[r.id])} aria-label="Sign & Export ClaimReview">Download Reviewed Copy</button><button onClick={onVerify} disabled={!manifest} aria-label="Verify Cryptographic Manifest">Verify Integrity</button>{manifest&&<button className="tamper-action" onClick={onTamper}>Simulate Edit Tampering</button>}
    {verification&&<span className={'verify-chip '+(verification.valid?'valid':'invalid')} data-testid="crypto-result">{verification.valid?'✓ Signature verified':'✕ Verification failed'}</span>}
    {tamper&&<span className="verify-chip invalid" data-testid="tamper-rejection">✕ Tamper rejected</span>}</div>
  </>}
  {error&&<p role="alert" className="audit-error">{error}</p>}
  {tipRow&&<SentenceTip row={tipRow} evidence={evidence} at={tip.at} onEnter={keep} onLeave={hide}/>}
 </section></div>
}
