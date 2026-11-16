import React,{useLayoutEffect,useRef,useState} from 'react'
import {colors,matrices,matrixValues} from './vision'
import {nutrition} from './engine'
const ROLES=['primary','independent','self']
// Beam lanes inside the 64px strip: exit height after the prism, then a quarter turn down into its column.
const LANE={self:51,primary:44,independent:37},H=64
export function VisionFilters(){return <svg width="0" height="0" className="vision-defs" aria-hidden="true"><defs>{Object.entries(matrices).map(([name,m])=><filter id={'vision-'+name} key={name} colorInterpolationFilters="linearRGB"><feColorMatrix type="matrix" values={matrixValues(m)}/></filter>)}</defs></svg>}
export function VisionLens({lens,setLens}){return <div className="vision-lens"><span>Lens</span><div role="group" aria-label="Vision Lens">{['Standard','Deuteranopia','Protanopia','Mono'].map(s=><button key={s} aria-pressed={s===lens} onClick={()=>setLens(s)}>{s}</button>)}</div></div>}
// Beams land on the measured centre of each evidence column, so the strip reads as the columns' source.
function useColumnTargets(ref){
 const [geo,setGeo]=useState(null)
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return
  const measure=()=>{const box=el.getBoundingClientRect(),mark=el.querySelector('.brand-prism').getBoundingClientRect(),x={}
   for(const role of ROLES){const r=document.querySelector('.spectrum-column.'+role)?.getBoundingClientRect();x[role]=r?Math.round(r.left+r.width/2-box.left):null}
   const prism={cx:mark.left-box.left+13,apex:mark.top-box.top+2,sx:mark.left-box.left+21.84,ey:mark.top-box.top+19}
   setGeo(old=>old&&old.w===box.width&&Object.keys(prism).every(k=>old.prism[k]===prism[k])&&ROLES.every(r=>old.x[r]===x[r])?old:{w:box.width,prism,x})}
  measure();const ro=new ResizeObserver(measure);ro.observe(el);ro.observe(el.querySelector('.brand'));const spectrum=document.querySelector('.spectrum');if(spectrum)ro.observe(spectrum);return()=>ro.disconnect()
 },[ref])
 return geo
}
function beamPath(sx,ey,lane,x){const bend=Math.min(10,H-lane-2);return `M${sx},${ey} C${sx+18},${ey} ${sx+18},${lane} ${sx+36},${lane} L${x-bend},${lane} Q${x},${lane} ${x},${lane+bend} L${x},${H}`}
export function Dispersion({title,evidence,strip,roleFilter,setRoleFilter,children}){
 const ref=useRef(null),geo=useColumnTargets(ref)
 const counts=Object.fromEntries(ROLES.map(r=>[r,evidence.filter(e=>e.role===r).length])),n=Math.max(1,evidence.length)
 const {sx=0,ey=0}=geo?.prism||{}
 return <section className="optical-strip" data-testid="optical-ribbon" ref={ref}>
  {geo&&<svg className="beams" width={geo.w} height={H} viewBox={`0 0 ${geo.w} ${H}`} role="img" aria-label={`Query dispersed into ${counts.self} self-reported, ${counts.primary} primary and ${counts.independent} independent records`}>
   {['self','primary','independent'].map(role=>{const x=geo.x[role]??sx+(role==='self'?120:role==='primary'?360:600),active=!roleFilter||roleFilter===role,share=counts[role]/n,width=counts[role]?2+share*4.5:.8,cut=strip&&role==='self',d=cut?`M${sx},${ey} C${sx+18},${ey} ${sx+18},${LANE.self} ${sx+36},${LANE.self} L${sx+58},${LANE.self}`:beamPath(sx,ey,LANE[role],x)
    return <g key={role} className={'beam '+role+(active?'':' muted')} onClick={()=>setRoleFilter(roleFilter===role?null:role)}>
     <path d={d} fill="none" stroke="transparent" strokeWidth="12" className="beam-hit"/>
     <path d={d} fill="none" stroke={colors[role]} strokeWidth={width} strokeLinecap="butt" opacity={counts[role]||cut?1:.35}/>
     {cut?<line x1={sx+60} x2={sx+60} y1={LANE.self-6} y2={LANE.self+6} stroke={colors.self} strokeWidth="2"/>:<text x={x+6} y={H-4}>{Math.round(share*100)}%</text>}
    </g>})}
  </svg>}
  <div className="masthead">
   <a className="brand" href="./" aria-label="Touchstone home"><span>TOUCHSTONE</span><svg className="brand-prism" width="26" height="28" viewBox="0 0 26 28" aria-hidden="true">
    <defs><linearGradient id="brand-obsidian" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#334155"/><stop offset="1" stopColor="#0F172A"/></linearGradient></defs>
    <polygon points="13,2 0,26 26,26" fill="url(#brand-obsidian)"/>
    <polygon points="13,2 26,26 15,18" fill="#64748B" opacity=".55"/>
    <path d="M12 6L7 17" fill="none" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity=".7"/>
   </svg></a>
   <h1 className="sr-only">{title}</h1>
   {children}
  </div>
 </section>
}
export function RailMetrics({evidence,claims,strip,setStrip}){
 const stripped=evidence.filter(e=>e.role!=='self'&&!e.conflicted),coiCount=evidence.length-stripped.length
 const full=nutrition(claims,evidence),after=nutrition(claims,stripped),label=strip?after:full
 const metric=(value,before,blue=false)=><div className="rail-value"><strong className={blue?'blue':undefined}>{value===null?'N/A':Math.round(value*100)+'%'}</strong>{strip&&<small className="metric-delta">{value===null||before===null?'from '+(before===null?'N/A':Math.round(before*100)+'%'):(Math.round(value*100)>Math.round(before*100)?'↑':Math.round(value*100)<Math.round(before*100)?'↓':'=')+' from '+Math.round(before*100)+'%'}</small>}</div>
 return <div className="rail-metrics"><span className="sr-only" data-testid="posterior-gauge"/>
  <div className="rail-cells">
   <div className="rail-cell" data-tip="Share of contradictory records, with evidence smoothing"><span>Claim Gap</span>{metric(label.discrepancy,full.discrepancy)}</div>
   <div className="rail-cell" data-tip="Share of original records in the current year range"><span>Primary Proof</span>{metric(label.primaryRatio,full.primaryRatio,true)}</div>
  </div>
  <label className={'cred-strip'+(strip?' active':'')}><input type="checkbox" className="sr-only" data-testid="strip-coi" aria-label="Hide company PR and funded sources" checked={strip} onChange={setStrip}/>{strip?'Hidden '+coiCount+' PR sources · Show all':'Hide '+coiCount+' company PR & funded sources'}</label>
 </div>
}
export function HyperplaneXRay({terms,events}){return <section className="hyperplane-xray" data-testid="hyperplane-xray" hidden={events.length===0}>{events.length>0&&<div className="xray-bar"><div className="term-pills">{terms.boosted.slice(0,3).map(t=><i key={t.term} className="pill pos">+{t.term}</i>)}{terms.suppressed.slice(0,3).map(t=><i key={t.term} className="pill neg">−{t.term}</i>)}</div></div>}</section>}
// Year pills: one stacked bar per publication year. Click a year to isolate it, click again for all years.
export function TemporalHistogram({docs,minYear,maxYear,yearLo,yearHi,setMinYear,setMaxYear}){
 const years=[...new Set(docs.map(e=>e.year).filter(Boolean))].sort((a,b)=>a-b),data=years.map(year=>({year,...Object.fromEntries(ROLES.map(r=>[r,docs.filter(e=>e.year===year&&e.role===r).length]))})),top=Math.max(1,...data.map(d=>d.primary+d.self+d.independent))
 const lo=minYear||yearLo,hi=maxYear===9999?yearHi:maxYear,filtered=minYear!==0||maxYear!==9999,reset=()=>{setMinYear(0);setMaxYear(9999)}
 return <div className="temporal-brush">
  <div className="year-strip" role="group" aria-label="Filter evidence by publication year">{data.map(d=>{const only=minYear===d.year&&maxYear===d.year;let y=26;return <button key={d.year} type="button" className={'year-pill'+(d.year>=lo&&d.year<=hi?'':' off')} aria-pressed={only} data-tip={`${d.primary} primary · ${d.independent} independent · ${d.self} company or sponsored`} onClick={()=>only?reset():(setMinYear(d.year),setMaxYear(d.year))}><svg width="14" height="26" viewBox="0 0 14 26" aria-hidden="true">{ROLES.map(role=>{const h=d[role]/top*24;y-=h;return h>0&&<rect key={role} x="0" y={y} width="14" height={h} rx="2" fill={colors[role]}/>})}</svg><span>{d.year}</span></button>})}</div>
  {filtered&&<button type="button" className="reset-pill" onClick={reset}>All years</button>}
  <input className="sr-only" type="range" aria-label="Timeline start year" min={yearLo} max={yearHi} value={lo} onChange={e=>setMinYear(Math.min(Number(e.target.value),maxYear))}/>
  <input className="sr-only" type="range" aria-label="Timeline end year" min={yearLo} max={yearHi} value={hi} onChange={e=>setMaxYear(Math.max(Number(e.target.value),minYear))}/>
 </div>
}
export function Waterfall({states,stream,busy}){
 const end=Math.max(1,...Object.values(states).map(s=>s.ms||0)),names=Object.keys(states)
 return <details className="provider-status" data-testid="waterfall"><summary className="waterfall-heading"><h2>Live sources · {Object.values(states).filter(s=>s.state==='Ready').length}/{names.length} ready</h2><span data-testid="stream-timing">{stream.firstRenderMs!==null?'First paint '+stream.firstRenderMs.toFixed(1)+' ms · '+(stream.cache||'Network'):busy?'Racing first-wave endpoints':'Ready for a live query'}</span></summary>{names.map(p=>{const s=states[p];return <div key={p} className="provider-lane" data-testid={'provider-'+p} data-tip={s?.detail||s?.url||p}><b>{p}</b><div className="latency-track"><i className={s?.state==='Ready'?'ready':s?.state==='Unavailable'?'unavailable':'pending'} style={{width:s?.ms?Math.max(2,s.ms/end*100)+'%':s?.state?'40%':'0%'}}/></div><span>{s?.state==='Ready'?`${s.docs?.length||s.count||0} records · ${s.ms?.toFixed(0)||0} ms`:s?.state||'Queued'}</span></div>})}</details>
}
