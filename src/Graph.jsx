import React,{useEffect,useRef,useMemo,useState} from 'react'
import cytoscape from 'cytoscape'
import {sankey,sankeyLeft,sankeyLinkHorizontal} from 'd3-sankey'
import {colors} from './vision'
import {commercialFunder} from './engine'
const glyph={primary:'▲',self:'◆',independent:'●'}
// Cut labels at a word boundary; the hover card carries the full text.
const fit=(t,n)=>{if(t.length<=n)return t;const cut=t.lastIndexOf(' ',n-1);return t.slice(0,cut>n*.6?cut:n-1).replace(/[\s,.;:]+$/,'')+'…'}
const ROLE_NAME={primary:'Official or research record',independent:'Independent coverage',self:'Company or sponsored source'}
const targets=e=>{const companies=(e.funders||[]).filter(f=>commercialFunder.test(f.name)).map(f=>f.name);return e.conflicted&&companies.length?[...new Set(companies)]:[e.sourceGroup]}
export default function Graph({claims,evidence,selected,onSelect,view='flow'}){
 const host=useRef(null),svgRef=useRef(null),[focus,setFocus]=useState(null),[pinned,setPinned]=useState(null),[offsets,setOffsets]=useState({}),[drag,setDrag]=useState(null),[tip,setTip]=useState(null),wrap=useRef(null)
 useEffect(()=>{setOffsets({})},[claims,evidence])
 const groups=[...new Set(evidence.flatMap(targets))]
 const height=Math.max(260,evidence.length*20+32,groups.length*21+32)
 const flow=useMemo(()=>{
  const nodes=claims.map((c,i)=>({id:'c:'+c.id,label:'C'+(i+1)+'  '+c.text,full:c.text,kind:'claim',role:'independent'})),links=[]
  evidence.forEach((e,i)=>{
   nodes.push({id:e.id,label:glyph[e.role]+' '+e.title,full:e.title,kind:'evidence',role:e.role,record:e})
   const cs=(e.claims||[]).filter(id=>claims.some(c=>c.id===id)),gs=targets(e),value=Math.max(.08,e.score||e.base||.15)
   cs.forEach(id=>links.push({source:'c:'+id,target:e.id,value:value/Math.max(1,cs.length),role:e.role,evidence:e.id}))
   gs.forEach(name=>links.push({source:e.id,target:'g:'+name,value:value/gs.length,role:e.role,evidence:e.id}))
  })
  groups.forEach(name=>nodes.push({id:'g:'+name,label:name,full:name,count:evidence.filter(e=>targets(e).includes(name)).length,kind:'group',role:evidence.some(e=>e.conflicted&&e.funders.some(f=>f.name===name))?'self':'independent'}))
  if(!links.length)return {nodes:[],links:[]}
  return sankey().nodeId(d=>d.id).nodeAlign(sankeyLeft).nodeWidth(6).nodePadding(13).nodeSort(null).extent([[8,18],[690,height-12]])({nodes,links})
 },[claims,evidence,height])
 const trace=useMemo(()=>{
  const ids=new Set(),seed=focus||pinned||selected;if(!seed)return ids
  if(seed.startsWith('f:'))evidence.filter(e=>e.funders?.some(f=>f.name===seed.slice(2))||e.sourceGroup===seed.slice(2)).forEach(e=>ids.add(e.id))
  if(flow.nodes.some(n=>n.id===seed&&n.kind==='evidence'))ids.add(seed)
  flow.links.forEach(l=>{if(l.source.id===seed||l.target.id===seed)ids.add(l.evidence)})
  return ids
 },[flow,focus,pinned,selected,evidence])
 useEffect(()=>{
  if(view!=='flow')return
  window.__prismGraph={view:'alluvial',nodes:flow.nodes.length,edges:flow.links.length,columns:['Sub-Claims','Evidence Records','Funders & Source Groups'],positions:flow.nodes.map(n=>({id:n.id,kind:n.kind,x:(n.x0+n.x1)/2,y:(n.y0+n.y1)/2,width:n.x1-n.x0,height:n.y1-n.y0})),links:flow.links.map(l=>({source:l.source.id,target:l.target.id,value:l.value,width:l.width}))}
 },[flow,view])
 useEffect(()=>{
  if(view!=='topology'||!host.current)return
  const elements=[],y=(i,n)=>22+(i+.5)*(height-32)/Math.max(n,1)
  claims.forEach((c,i)=>elements.push({data:{id:'c:'+c.id,label:'C'+(i+1)+'  '+c.text.slice(0,26),kind:'claim',color:colors.independent,width:176,height:20},position:{x:100,y:y(i,claims.length)}}))
  evidence.forEach((e,i)=>{
   elements.push({data:{id:e.id,label:glyph[e.role]+' '+e.title.slice(0,30),kind:'evidence',color:colors[e.role],width:232,height:18},position:{x:365,y:y(i,evidence.length)}})
   for(const id of e.claims||[])if(claims.some(c=>c.id===id))elements.push({data:{id:'ce:'+id+e.id,source:'c:'+id,target:e.id,color:colors[e.role],coi:e.conflicted?'yes':'no'}})
   for(const name of targets(e))elements.push({data:{id:'eg:'+e.id+name,source:e.id,target:'g:'+name,color:colors[e.role],coi:e.conflicted?'yes':'no'}})
  })
  groups.forEach((name,i)=>elements.push({data:{id:'g:'+name,label:name.slice(0,32),kind:'group',color:colors.independent,width:204,height:20},position:{x:655,y:y(i,groups.length)}}))
  const cy=cytoscape({container:host.current,elements,layout:{name:'preset',fit:true,padding:12},minZoom:.2,maxZoom:3,wheelSensitivity:.15,style:[
   {selector:'node',style:{shape:'round-rectangle','background-color':'#FFFFFF',label:'data(label)',width:'data(width)',height:'data(height)',color:'#0F172A','font-size':9.5,'font-weight':600,'text-valign':'center','font-family':'Arial','border-width':2,'border-color':'data(color)'}},
   {selector:'edge',style:{width:1.4,'line-color':'data(color)',opacity:.28,'curve-style':'bezier'}},
   {selector:'edge[coi="yes"]',style:{'line-style':'solid'}},
   {selector:':selected',style:{'border-width':3,'border-color':'#0072B2','background-color':'#EFF6FF'}}
  ]})
  if(selected)cy.getElementById(selected).select()
  cy.on('tap','node',e=>{const id=e.target.id();setFocus(id);if(e.target.data('kind')==='evidence')onSelect(id);cy.elements().style('opacity',.22);e.target.closedNeighborhood().style('opacity',1)})
  window.__prismGraph={view:'topology',nodes:cy.nodes().length,edges:cy.edges().length,columns:['Sub-Claims','Evidence Records','Funders & Source Groups'],positions:cy.nodes().map(n=>({id:n.id(),kind:n.data('kind'),x:n.position('x'),y:n.position('y'),width:n.width(),height:n.height()}))}
  return()=>cy.destroy()
 },[view,claims,evidence,selected,onSelect,height])
 const pillW=kind=>kind==='claim'?232:kind==='evidence'?246:232
 const pos=n=>{const d=offsets[n.id]||{dx:0,dy:0};return {x0:n.x0+d.dx,cy:(n.y0+n.y1)/2+d.dy,dy:d.dy}}
 const linkPath=l=>{const s=pos(l.source),t=pos(l.target),sx=s.x0+pillW(l.source.kind),sy=l.y0+s.dy,tx=t.x0,ty=l.y1+t.dy,mx=(sx+tx)/2;return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`}
 const onMove=e=>{if(!drag||!svgRef.current)return;const r=svgRef.current.getBoundingClientRect(),dx=(e.clientX-drag.sx)/r.width*930,dy=(e.clientY-drag.sy)/r.height*height;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;setOffsets(old=>({...old,[drag.id]:{dx:drag.ox+dx,dy:drag.oy+dy}}))}
 return <><div className="graph-columns"><span>Key Claims <em>(drag to reorder)</em></span><span>Matched Evidence</span><span>Organizations &amp; Funders {Object.keys(offsets).length>0&&<button type="button" className="reset-nodes" onClick={()=>setOffsets({})}>Reset layout</button>}</span></div>{view==='flow'?<div key="flow" className="flow-wrap" ref={wrap}><svg ref={svgRef} className={'alluvial graph'+(drag?' dragging':'')} data-testid="provenance-graph" viewBox={'0 0 930 '+height} role="img" aria-label="Alluvial claim evidence and funder provenance flow" onPointerMove={onMove} onPointerUp={()=>setDrag(null)} onPointerLeave={()=>setDrag(null)}><g fill="none">{flow.links.map((l,i)=>{const active=trace.has(l.evidence);return <path key={i} d={linkPath(l)} stroke={colors[l.role]} strokeWidth={Math.max(1.5,Math.min(7,l.width*.45))} opacity={trace.size?(active?.62:.06):.22} onMouseEnter={()=>setFocus(l.evidence)} onMouseLeave={()=>setFocus(null)} onClick={()=>onSelect(l.evidence)}/>})}</g>{flow.nodes.map(n=>{const active=trace.has(n.id)||selected===n.id||(n.kind!=='evidence'&&flow.links.some(l=>(l.source.id===n.id||l.target.id===n.id)&&trace.has(l.evidence))),p=pos(n),w=pillW(n.kind),bh=Math.max(18,Math.min(22,n.y1-n.y0+4));return <g key={n.id} data-node-id={n.id} className={'flow-node '+n.role} onMouseEnter={e=>{setFocus(n.id);if(drag||!wrap.current)return;const b=wrap.current.getBoundingClientRect(),r=e.currentTarget.getBoundingClientRect();setTip({n,x:Math.max(0,Math.min(r.left-b.left,b.width-340)),y:r.bottom-b.top+6})}} onMouseLeave={()=>{setFocus(null);setTip(null)}} onPointerDown={e=>{e.currentTarget.setPointerCapture?.(e.pointerId);const d=offsets[n.id]||{dx:0,dy:0};setDrag({id:n.id,sx:e.clientX,sy:e.clientY,ox:d.dx,oy:d.dy,moved:false})}} onClick={()=>{if(drag?.moved)return;setPinned(n.id===pinned?null:n.id);if(n.kind==='evidence')onSelect(n.id)}} opacity={trace.size&&!active?.38:1}><rect x={p.x0} y={p.cy-bh/2} width={w} height={bh} rx="1" fill={active?'#F0F7FF':'#FFFFFF'} stroke={active?'#0072B2':'#E2E8F0'} strokeWidth={active?1.5:1}/><rect x={p.x0} y={p.cy-bh/2} width="4.5" height={bh} rx="2" fill={colors[n.role]}/><text x={p.x0+11} y={p.cy} dy=".35em" fontSize="12.5" fontWeight={active||n.kind!=='evidence'?650:500} fill={active?'#005488':'#0F172A'}>{fit(n.label,n.kind==='evidence'?34:31)}</text></g>})}</svg>{tip&&<div className="flow-tip" role="tooltip" style={{left:tip.x,top:tip.y}}><b>{tip.n.full}</b><span>{tip.n.kind==='evidence'?[ROLE_NAME[tip.n.role],tip.n.record.year||'Live',tip.n.record.sourceGroup,...(tip.n.record.funders||[]).map(f=>f.name)].join(' · '):tip.n.kind==='group'?tip.n.count+' linked record'+(tip.n.count>1?'s':''):'Sub-claim'}</span></div>}</div>:<div key="topology" ref={host} className="graph" style={{height}} data-testid="provenance-graph" aria-label="Interactive graph topology"/>}</>
}
