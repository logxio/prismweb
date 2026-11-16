import React,{useState,useEffect,useLayoutEffect,useMemo,useCallback,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {Search,ArrowUpRight,ArrowDownToLine,Network,Upload,ChevronDown,ExternalLink,Orbit} from 'lucide-react'
import Papa from 'papaparse'
import Graph from './Graph'
import AuditDrawer,{paragraphSamples} from './AuditDrawer'
import {auditParagraph,signReview,verifyManifest} from './audit'
import {registerContract,schemas} from './webmcp'
import {clean,vector,feedback,prepare,rank,nutrition,claimStatus,decompose,reviewPackage,mergeEvidence} from './engine'
import {searchOpenWeb,entityFacts,providers} from './connectors'
import ShareCard,{markdownBrief} from './ShareCard'
import './style.css'
import CommandPalette from './CommandPalette'
import OrbDock from './OrbDock'
import {Dispersion,RailMetrics,VisionFilters,VisionLens,HyperplaneXRay,TemporalHistogram,Waterfall} from './Visuals'
import {bucketTerms,explainWeights,commercialFunder} from './engine'
import {RankingWorker,kernelBenchmark} from './worker'
import {readCache,writeCache,prefetch,cancelPrefetch,cacheAPI} from './cache'
import {colorReport} from './vision'
window.__prismCache=cacheAPI
window.__prismColorReport=colorReport
import {runBenchmark} from './benchmark'
window.__runPrismBenchmark=runBenchmark
window.__runPrismPackedBenchmark=rows=>runBenchmark(rows,true)
window.__mergePrismEvidence=mergeEvidence
const ROLE=[['self','◆ Company & Sponsored Claims','Interested sources'],['primary','▲ Official & Research Records','Original records'],['independent','● Independent Coverage','Independent & reference']]
const AGENT_ACTIONS=[
 ['prismweb_decompose_and_audit','1. Check paragraph for unbacked claims'],
 ['prismweb_apply_feedback','2. Prioritize original research'],
 ['prismweb_get_nutrition_label','3. Summarize evidence balance'],
 ['prismweb_verify_manifest','4. Verify data integrity']
]
const statusLabel=s=>({'UNVERIFIED':'Needs more independent sources','INTERESTED SELF-REPORT':'Company self-report','DISCREPANCY ALERT':'Conflicts with primary records','CONTESTED':'Sources disagree','PRIMARY SUPPORTED':'Backed by original records','CORROBORATED':'Backed by independent sources'}[s]||s)
const pct=x=>Math.round(x*100)+'%'
const tone=s=>s==='UNVERIFIED'?'neutral':s==='DISCREPANCY ALERT'?'alert':s==='CONTESTED'?'contested':'supported'
// One line per unselected card: the commercial funder leads a conflicted record, the rest is a count.
const leadFunder=e=>{const f=(e.conflicted&&e.funders.find(f=>commercialFunder.test(f.name)))||e.funders[0];return f.name.replace(/\s*\(.*\)\s*$/,'')}
// A sub-claim leaves UNVERIFIED at three independent primary source groups (engine claimStatus).
const STOP=new Set('the a an of in on to and or for with by from that this is are was were be been its it as at than into over under about per'.split(' '))
const coreTerms=text=>clean(text).toLowerCase().replace(/[^a-z0-9%.\s]/g,' ').split(/\s+/).filter(t=>t.length>2&&!STOP.has(t)).slice(0,6).join(' ')
const SHORT_CLAIMS={shell:'2022 UK Clean-Energy Ads',offsets:'Forest Offset Additionality','some-effective':'Tropical Cohort Deforestation',netzero:'2050 Value-Chain Net Zero',record:'2023 Record Surface Warmth',threshold:'Single-Year vs. Paris Limit',attribution:'Extreme-Event Attribution Rule',local:'Local Flood Causal Proof',efficacy:'Clinical Recovery & Progression',viral:'Viral Clearance Endpoints',funding:'Drug Supply & Trial Validity','unseen-population':'Unstudied Variant Scope',rank:'Raw vs. Adjusted Top Rank',rows:'Pairwise Row Independence',small:'Empirical Bayes Shrinkage',external:'External Docket Replication'}
const shortClaim=c=>SHORT_CLAIMS[c.id]||(c.text.length<=38?c.text:c.text.split(/\s+/).slice(0,5).join(' ').replace(/[.,;:]+$/,'')+'…')
const LIVE_LANES=providers.map(p=>p.name),HOST_LANES={'doi.org':'DOI','clinicaltrials.gov':'CT.gov','sec.gov':'SEC','europepmc.org':'Europe PMC','pubmed.ncbi.nlm.nih.gov':'PubMed','en.wikipedia.org':'Wikipedia','wikidata.org':'Wikidata'}
const lane=e=>{if(LIVE_LANES.includes(e.provider))return e.provider;if(!/^https?:/.test(e.url))return 'Archive';const h=new URL(e.url).hostname.replace(/^www\./,'');return HOST_LANES[h]||h}
function HumanActions({onCopy,onShare,onHTML,onJSON,disabled}){return <div className="human-actions" aria-label="Human actions"><button className="copy-brief" onClick={onCopy}>Copy Markdown to GPT · Claude · Gemini</button><div><button aria-label="Share Visual Card" onClick={onShare}>Share Card</button><button onClick={onHTML} disabled={disabled}>Save HTML</button><button onClick={onJSON} disabled={disabled}>Export JSON</button></div></div>}
function ToolOutput({result,docs}){
 const data=result.structuredContent||{}
 let content
 if(result.error)content=<p role="alert">{result.error}</p>
 else if(result.name==='prismweb_decompose_and_audit')content=<ul className="audit-results">{(data.plan||[]).map(row=>{const count=docs.filter(e=>e.role==='primary'&&row.sourceIds?.includes(e.id)).length;return <li key={row.id}><p>{row.text}</p><div><span className={'badge '+tone(row.status)}>{statusLabel(row.status)}</span><span>{count} original {count===1?'source':'sources'} matched</span></div></li>})}</ul>
 else if(result.name==='prismweb_apply_feedback')content=<><p>Prioritized original research across {data.rankedIds.length} sources.</p><ol className="ranked-results">{data.rankedIds.slice(0,3).map(id=><li key={id}>{docs.find(e=>e.id===id)?.title||id}</li>)}</ol></>
 else if(result.name==='prismweb_get_nutrition_label')content=<p>Conflicting evidence: {pct(data.nutrition.discrepancy||0)} · Original records: {pct(data.nutrition.primaryRatio||0)} · Independent Sources: {data.nutrition.independentGroups}</p>
 else if(result.name==='prismweb_verify_manifest')content=data.valid?<p>✓ Evidence copy is intact. Checked {data.evidenceHashes??data.snippetHashes?.length??0} source records.</p>:<p role="alert">{data.error||'Package verification did not pass. Review the source package.'}</p>
 return <div className="tool-output" data-testid="tool-result" data-tool={result.name} aria-live="polite">{content}</div>
}
function App(){
 const [dossiers,setDossiers]=useState([]),[dossier,setDossier]=useState(null),[mode,setMode]=useState('reader'),[query,setQuery]=useState(''),[docs,setDocs]=useState([]),[w,setW]=useState(vector('')),[events,setEvents]=useState([]),[strip,setStrip]=useState(false),[minYear,setMinYear]=useState(0),[maxYear,setMaxYear]=useState(9999),[selected,setSelected]=useState(null),[providerStates,setProviderStates]=useState({}),[notice,setNotice]=useState(''),[timing,setTiming]=useState(null),[details,setDetails]=useState(null),[busy,setBusy]=useState(false)
 const [auditOpen,setAuditOpen]=useState(false),[auditText,setAuditText]=useState(''),[auditRows,setAuditRows]=useState([]),[editorial,setEditorial]=useState({}),[manifest,setManifest]=useState(null),[verification,setVerification]=useState(null),[tamper,setTamper]=useState(null),[auditError,setAuditError]=useState(''),[toolName,setToolName]=useState('prismweb_decompose_and_audit'),[toolInput,setToolInput]=useState(''),[toolResult,setToolResult]=useState(null),[stream,setStream]=useState({firstRenderMs:null,updates:[]})
 const [lens,setLens]=useState('Standard'),[palette,setPalette]=useState(false),[workerStatus,setWorkerStatus]=useState(false),[workerResult,setWorkerResult]=useState(null),[workerTiming,setWorkerTiming]=useState(null),[graphView,setGraphView]=useState('flow'),[activeClaim,setActiveClaim]=useState(null),[roleFilter,setRoleFilter]=useState(null),[searchOpen,setSearchOpen]=useState(false)
 const [shareOpen,setShareOpen]=useState(false)
 const [floatingTip,setFloatingTip]=useState(null),[tipPosition,setTipPosition]=useState({left:8,top:8}),tipRef=useRef(null)
 useEffect(()=>{
  let hovered=null,focused=null
  const closest=target=>target instanceof Element?target.closest('[data-tip]'):null
  const show=()=>{const el=hovered||focused;if(!el?.isConnected){setFloatingTip(null);return}setFloatingTip({text:el.getAttribute('data-tip'),rect:el.getBoundingClientRect()})}
  const over=e=>{hovered=closest(e.target);show()},out=e=>{hovered=closest(e.relatedTarget);show()}
  const focus=e=>{focused=closest(e.target);show()},blur=e=>{focused=closest(e.relatedTarget);show()}
  const hide=()=>{hovered=null;focused=null;setFloatingTip(null)},key=e=>{if(e.key==='Escape')hide()}
  document.addEventListener('mouseover',over);document.addEventListener('mouseout',out);document.addEventListener('focusin',focus);document.addEventListener('focusout',blur);document.addEventListener('scroll',hide,true);document.addEventListener('keydown',key);window.addEventListener('resize',hide)
  return()=>{document.removeEventListener('mouseover',over);document.removeEventListener('mouseout',out);document.removeEventListener('focusin',focus);document.removeEventListener('focusout',blur);document.removeEventListener('scroll',hide,true);document.removeEventListener('keydown',key);window.removeEventListener('resize',hide)}
 },[])
 useLayoutEffect(()=>{
  if(!floatingTip||!tipRef.current)return
  const {width,height}=tipRef.current.getBoundingClientRect(),r=floatingTip.rect
  const clampedX=Math.max(8,Math.min(r.left,window.innerWidth-width-8)),preferredY=r.bottom+8
  const clampedY=Math.max(8,Math.min(preferredY+height<=window.innerHeight-8?preferredY:r.top-height-8,window.innerHeight-height-8))
  setTipPosition({left:clampedX,top:clampedY})
 },[floatingTip])
 const worker=useRef(null),revision=useRef(0),poolReady=useRef(Promise.resolve())
 const handlers=useRef({}),weights=useRef(vector('')),signGeneration=useRef(0)
 const abort=useRef(null),start=useRef(0),input=useRef(null)
 const choose=useCallback(d=>{abort.current?.abort();setDossier(d);setQuery('');setDocs(prepare(d.evidence,d.claims.map(c=>c.text).join(' ')));weights.current=vector('');setW(weights.current);setEvents([]);setStrip(false);setMinYear(0);setMaxYear(9999);setProviderStates({});setTiming(null);setSelected(null);setActiveClaim(null);setRoleFilter(null);setNotice('');setBusy(false);setManifest(null);setVerification(null);setTamper(null);setAuditRows([]);setAuditText('');setAuditOpen(false);setEditorial({});setToolResult(null)},[])
 useEffect(()=>{fetch('./data/dossiers.json').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(ds=>{setDossiers(ds);choose(ds[0])}).catch(c=>setNotice('Dossier request: '+c.message));return ()=>abort.current?.abort()},[choose])
 const ranked=useMemo(()=>docs.length>128?(workerResult||docs):rank(docs,w,events.length>0),[docs,w,events,workerResult])
 const lexicon=useMemo(()=>mode==='investigator'||events.length>0?bucketTerms(docs):new Map(),[docs,mode,events.length>0]),terms=useMemo(()=>explainWeights(w,lexicon),[w,lexicon])
 useEffect(()=>{const r=new RankingWorker();worker.current=r;r.call('ping').then(()=>setWorkerStatus(true)).catch(e=>setNotice('Worker: '+e.message));return()=>r.close()},[])
 useEffect(()=>{const version=++revision.current;if(!worker.current)return;setWorkerResult(null);(poolReady.current=worker.current.pool(docs)).then(()=>worker.current.rank(w,events.length>0)).then(result=>{if(version!==revision.current)return;setWorkerTiming(result.ms);setWorkerResult(result.order.map(i=>({...docs[i],score:result.scores[i]})));window.__prismWorker={online:true,...result,count:docs.length,rankedIds:result.order.map(i=>docs[i].id),bufferType:'Float32Array',dimensions:2048};}).catch(e=>setNotice('Worker: '+e.message))},[docs,w,events])
 useEffect(()=>{window.__prismKernelBenchmark=()=>kernelBenchmark(docs,weights.current)},[docs])
 useEffect(()=>{const key=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPalette(x=>!x)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
 useEffect(()=>{if(dossier?.id==='live'&&dossier.title===query.trim())return;if(query.trim().length<3){cancelPrefetch();return}const timer=setTimeout(()=>{cancelPrefetch(query);prefetch(query,searchOpenWeb).catch(e=>setNotice('Prefetch: '+e.message))},200);return()=>clearTimeout(timer)},[query,dossier?.id])
 const yearEvidence=useMemo(()=>ranked.filter(e=>!e.year||(e.year>=minYear&&e.year<=maxYear)),[ranked,minYear,maxYear])
 const evidence=useMemo(()=>yearEvidence.filter(e=>!strip||(!e.conflicted&&e.role!=='self')),[yearEvidence,strip])
 const label=useMemo(()=>nutrition(dossier?.claims||[],evidence),[dossier,evidence])
 useEffect(()=>{if(dossier?.id==='live'&&docs.length)setStream(old=>old.firstRenderMs===null?{...old,firstRenderMs:performance.now()-start.current,firstRenderedIds:docs.map(e=>e.id)}:old)},[docs,dossier])
 const years=docs.map(e=>e.year).filter(Boolean),yearLo=years.length?Math.min(...years):2000,yearHi=years.length?Math.max(...years):2026
 const selectEvidence=useCallback(id=>{setSelected(id);document.getElementById('card-'+id)?.scrollIntoView({behavior:'smooth',block:'nearest'})},[])
 const judge=(e,sign)=>{if(docs.length>128){const old=weights.current,next=feedback(old,e.vector,sign);weights.current=next;return poolReady.current.then(()=>Promise.all([worker.current.rank(old,true),worker.current.rank(next,true)])).then(([a,b])=>{const before=a.order.map(i=>docs[i].id),after=b.order.map(i=>docs[i].id);setW(next);setTiming(b.ms);setEvents(es=>[...es,{id:e.id,sign,ms:b.ms,before,after}]);setSelected(e.id);return {rankedIds:after,ms:b.ms}})}const t=performance.now(),next=feedback(weights.current,e.vector,sign),before=rank(docs,weights.current,true).map(d=>d.id),after=rank(docs,next,true).map(d=>d.id),ms=performance.now()-t;weights.current=next;setW(next);setTiming(ms);setEvents(old=>[...old,{id:e.id,sign,ms,before,after}]);setSelected(e.id);return {rankedIds:after,ms}}

 async function search(event,requested){event?.preventDefault();const term=(requested||query).trim();if(!term)return;cancelPrefetch();abort.current?.abort();abort.current=new AbortController();const signal=abort.current.signal;start.current=performance.now();let claims=decompose(term);const current={id:'live',short:'Live',title:clean(term),subtitle:'Live open Web evidence. Source relationships await human review.',origin:'Browser direct search',claims,evidence:[]};setDossier(current);setDocs([]);weights.current=vector('');setW(weights.current);setEvents([]);setStrip(false);setMinYear(0);setMaxYear(9999);setProviderStates({});setBusy(true);setTiming(null);setNotice('');setManifest(null);setVerification(null);setTamper(null);setAuditRows([]);setAuditText('');setAuditOpen(false);setEditorial({});setStream({firstRenderMs:null,updates:[]});
  try{const cached=await readCache(term);if(signal.aborted)return
  if(cached){const initial=(cached.prepared||prepare(mergeEvidence([],cached.updates.flatMap(u=>u.docs)),term)).map(e=>({...e,claims:claims.map(c=>c.id)}));setDocs(initial);setProviderStates(Object.fromEntries(cached.updates.map(u=>[u.provider,u])));setStream({firstRenderMs:cached.readMs,firstRenderedIds:initial.map(e=>e.id),cache:cached.layer,cacheReadMs:cached.readMs,firstReadyMs:performance.now()-start.current,updates:cached.updates.map(u=>({provider:u.provider,ms:u.ms,count:u.docs.length}))})}
  const updates=[]
  await searchOpenWeb(term,u=>{if(signal.aborted)return;if(u.title){claims=[{...claims[0],text:clean(u.title)}];setDossier(old=>({...old,title:clean(u.title),claims}))}if(u.state==='Unavailable')setNotice(u.provider+': '+u.detail);if(u.state==='Ready')updates.push(u);setProviderStates(old=>({...old,[u.provider]:cached&&u.state==='Searching'?{...old[u.provider],revalidating:true}:u}));if(u.docs?.length){setStream(old=>({...old,firstReadyMs:old.firstReadyMs??performance.now()-start.current,updates:[...old.updates,{provider:u.provider,ms:performance.now()-start.current,count:u.docs.length}]}));const added=u.docs.map(e=>({...e,claims:claims.map(c=>c.id)}));setDocs(old=>prepare(mergeEvidence(old,added),term))}},signal);if(!signal.aborted){setBusy(false);if(updates.length)await writeCache(term,updates)}}catch(e){if(!signal.aborted)setNotice('Search: '+e.message)}finally{if(!signal.aborted)setBusy(false)}
 }
 function download(name,text,type){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}
 function runAudit(text,sourceId){const source=sourceId?dossiers.find(d=>d.id===sourceId):dossier,sourceEvidence=sourceId?source.evidence:evidence;if(sourceId&&dossier.id!==sourceId)choose(source);setAuditText(text);setAuditRows(auditParagraph(text,source,sourceEvidence));setEditorial({});setManifest(null);setVerification(null);setTamper(null);setAuditError('');setAuditOpen(true)}
 function openAudit(){if(!auditText.trim()){const sample=paragraphSamples(dossiers).find(s=>s.id===dossier.id)||paragraphSamples(dossiers)[0];runAudit(sample.text,sample.id)}else setAuditOpen(true)}
 async function createSigned(){
  if(auditOpen&&auditRows.some(r=>!editorial[r.id]))throw new Error('Choose an editorial disposition for every audited sentence first')
  const record={status:auditRows.length&&auditRows.every(r=>editorial[r.id])?'Human dispositions recorded':'Editorial review pending',paragraph:auditText,sentences:auditRows.map(r=>({...r,editorial:editorial[r.id]}))}
  const generation=signGeneration.current,p=await signReview(dossier.title,dossier.claims,evidence,events,record),verified=await verifyManifest(p);if(generation!==signGeneration.current)throw new Error('Snapshot changed. Export the current view again.');setManifest(p);setVerification(verified);setTamper(null);return p
 }
 async function exportJSON(){try{const p=await createSigned();download('prismweb-claimreview.json',JSON.stringify(p,null,2),'application/ld+json');setNotice('Signed ClaimReview JSON-LD exported')}catch(e){setAuditError(e.message);setNotice(e.message)}}
 async function testTamper(){if(!manifest)return;const bad=structuredClone(manifest);bad.prismweb.evidence[0].text+=' Altered snippet.';const r=await verifyManifest(bad);setTamper(r);return r}
 async function verifyCurrent(){if(!manifest)return;const result=await verifyManifest(manifest);setVerification(result);setNotice((result.valid?'Signature verified in ':'Verification failed in ')+result.elapsedMs.toFixed(3)+' ms');return result}
 async function exportHTML(){try{
  const p=await createSigned(),escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
  const text='<!doctype html><html lang="en"><meta charset="utf-8"><title>'+escape(dossier.title)+'</title><style>body{max-width:1000px;margin:45px auto;font:16px/1.6 system-ui;color:#0F172A}article{padding:20px;background:#F8FAFC;margin:15px 0}h1{font-size:36px}</style><h1>'+escape(dossier.title)+'</h1><p>Evidence organized for human judgment.</p>'+dossier.claims.map(c=>'<h2>'+escape(c.text)+'</h2><p>'+claimStatus(c,evidence).status+'</p>').join('')+evidence.map(e=>'<article><a href="'+escape(e.url)+'">'+escape(e.title)+'</a><p>'+escape(e.text)+'</p><p>'+escape(e.sourceGroup)+' | '+escape(e.funders.map(f=>f.name).join(', ')||'Funding unknown')+'</p></article>').join('')+'<script type="application/ld+json">'+JSON.stringify(p).replaceAll('<','\\u003c')+'</script></html>'
  download('prismweb-investigation.html',text,'text/html');setNotice('Signed HTML investigation exported')
 }catch(e){setNotice(e.message)}}
 handlers.current={
  prismweb_decompose_and_audit:({text})=>{const sample=paragraphSamples(dossiers).find(s=>s.text===text),source=sample?dossiers.find(d=>d.id===sample.id):dossier,sourceEvidence=sample?source.evidence:evidence;runAudit(text,sample?.id);return {plan:auditParagraph(text,source,sourceEvidence),nutrition:nutrition(source.claims,sourceEvidence),abstention:'UNVERIFIED remains when source entailment or independent corroboration is missing',humanJudgmentRequired:true}},
  prismweb_get_nutrition_label:()=>({nutrition:{...label,independentGroups:new Set(evidence.filter(e=>e.role!=='self'&&!e.conflicted&&e.independenceConfirmed).map(e=>e.sourceGroup)).size},claims:dossier.claims.map(c=>({id:c.id,...claimStatus(c,evidence)})),humanJudgmentRequired:true}),
  prismweb_apply_feedback:async({evidenceId,sign})=>{const e=docs.find(d=>d.id===evidenceId);if(!e)throw new Error('Evidence ID is absent from current collection');const result=await judge(e,sign);return {evidenceId,sign,...result,nutrition:label,stanceUnchanged:true}},
  prismweb_verify_manifest:async({manifest:provided})=>{const p=provided||manifest;if(!p)throw new Error('Sign or provide a ClaimReview package first');const result=await verifyManifest(p);if(!provided)setVerification(result);return result}
 }
 useEffect(()=>registerContract(handlers),[])
 useEffect(()=>{
  let stale=false;signGeneration.current++;setManifest(null);setVerification(null);setTamper(null)
  if(!dossier||busy||(auditOpen&&auditRows.some(r=>!editorial[r.id])))return
  const timer=setTimeout(async()=>{try{
   const record={status:auditRows.length&&auditRows.every(r=>editorial[r.id])?'Human dispositions recorded':'Editorial review pending',paragraph:auditText,sentences:auditRows.map(r=>({...r,editorial:editorial[r.id]}))},started=performance.now()
   const signed=await signReview(dossier.title,dossier.claims,evidence,events,record),verified=await verifyManifest(signed)
   if(!stale){setManifest(signed);setVerification({...verified,elapsedMs:performance.now()-started,automatic:true})}
  }catch(e){if(!stale)setNotice('Automatic signature: '+e.message)}},180)
  return()=>{stale=true;clearTimeout(timer)}
 },[dossier,evidence,events,editorial,auditRows,auditText,busy,auditOpen])
 useEffect(()=>{if(dossier){setAuditRows(rows=>rows.length?auditParagraph(auditText,dossier,evidence):rows);setEditorial({})}},[dossier,docs,strip,minYear,maxYear])
 async function callTool(name=toolName,inputText=toolInput){try{const args=inputText.trim()?JSON.parse(inputText):name==='prismweb_decompose_and_audit'?{text:(paragraphSamples(dossiers).find(s=>s.id===dossier.id)||paragraphSamples(dossiers)[0]).text}:name==='prismweb_apply_feedback'?{evidenceId:(evidence.find(e=>e.role==='primary')||evidence[0]).id,sign:1}:name==='prismweb_verify_manifest'?{manifest:manifest||await createSigned()}:{};const result=await window.__prismWebMCP.invoke(name,args);setToolResult({name,input:args,...result});if(name==='prismweb_decompose_and_audit')setAuditOpen(false)}catch(e){setToolResult({error:e.message})}}
 async function importFile(file){try{if(!file)return;const text=await file.text();let data;if(file.name.toLowerCase().endsWith('.csv')){const p=Papa.parse(text,{header:true,skipEmptyLines:true});if(p.errors.length)throw new Error(p.errors[0].message);data=p.data}else data=JSON.parse(text);const rows=Array.isArray(data)?data:data.evidence||data.prismweb?.evidence;if(!rows?.length)throw new Error('Provide evidence rows with title, text and URL');const claims=data.claims||data.prismweb?.claims||[{id:'import-claim',text:clean(file.name),time:'Time unspecified',place:'Scope unspecified'}];const es=rows.map((e,i)=>{if(!e.title||!e.text||!e.url||!/^https?:\/\//.test(e.url))throw new Error('Each row needs title, text and an HTTP URL');return {...e,id:'import-'+i,title:clean(e.title),text:clean(e.text),role:['self','primary','independent'].includes(e.role)?e.role:'independent',sourceGroup:clean(e.sourceGroup||new URL(e.url).hostname),funders:Array.isArray(e.funders)?e.funders:[],claims:e.claims||claims.map(c=>c.id),year:Number(e.year)||null,stance:['SUPPORTS','REFUTES'].includes(e.stance)?e.stance:'UNKNOWN',fundingKnown:Boolean(e.fundingKnown),independenceConfirmed:Boolean(e.independenceConfirmed)}});choose({id:'import',title:clean(file.name),subtitle:'Custom evidence collection',origin:'Local file import',claims,evidence:es});setNotice(es.length+' evidence records imported')}catch(c){setNotice('Import: '+c.message)}}
 useEffect(()=>{window.__prismState={dossier:dossier?.id,mode,evidenceCount:evidence.length,rankedIds:ranked.map(e=>e.id),events,timing,nutrition:label,stream,claims:dossier?.claims.map(c=>({id:c.id,...claimStatus(c,evidence)})),lens,terms,workerOnline:workerStatus,workerTiming,auditRows,editorial,hasManifest:Boolean(manifest),verification,tamper,providers:Object.fromEntries(Object.entries(providerStates).map(([k,v])=>[k,{state:v.state,ms:v.ms,count:v.docs?.length,url:v.url,detail:v.detail}])),busy};},[dossier,mode,evidence,ranked,events,timing,label,providerStates,busy,stream,auditRows,editorial,manifest,verification,tamper,lens,terms,workerStatus,workerTiming])
 const commands=[...dossiers.map(d=>({id:d.id,kind:'Dossier',label:d.label,run:()=>choose(d)})),...['climate change','semaglutide','carbon offsets'].map(q=>({id:q,kind:'Live search',label:'Search '+q,preview:()=>prefetch(q,searchOpenWeb),run:()=>{setQuery(q);search(null,q)}})),{id:'search',kind:'Tool',label:'Search the open Web',run:openSearch},{id:'audit',kind:'Tool',label:'Check a paragraph',run:openAudit},{id:'reader',kind:'Mode',label:'Reading View',run:()=>setMode('reader')},{id:'osint',kind:'Mode',label:'Deep Dive & Map',run:()=>setMode('investigator')},{id:'strip',kind:'Counterfactual',label:strip?'Show company and sponsored sources':'Hide company and sponsored sources',run:()=>setStrip(x=>!x)},...['Standard','Deuteranopia','Protanopia','Mono'].map(v=>({id:v,kind:'Vision Lens',label:'Vision Lens: '+v,run:()=>setLens(v)}))]
 function openSearch(){setSearchOpen(true);setTimeout(()=>document.getElementById('web-search')?.focus(),30)}
 function probe(c){const q=coreTerms(c.text)||clean(c.text);setQuery(q);search(null,q)}
 async function copyMarkdown(){try{await navigator.clipboard.writeText(markdownBrief(dossier,evidence,label));setNotice('Markdown copied for GPT · Claude · Gemini')}catch(e){setNotice('Copy Markdown: '+e.message)}}
 const actions=<HumanActions onCopy={copyMarkdown} onShare={()=>setShareOpen(true)} onHTML={exportHTML} onJSON={exportJSON} disabled={busy||(auditOpen&&auditRows.some(r=>!editorial[r.id]))}/>
 const pickCommand=it=>{setPalette(false);it.run()}
 if(!dossier)return <main className="loading">{notice||'Loading public evidence'}</main>
 return <><VisionFilters/><div className="app" style={{filter:lens==='Standard'?undefined:`url(#vision-${lens})`}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();importFile(e.dataTransfer.files[0])}}>
  <main>
  <Dispersion title={dossier.title} evidence={evidence} strip={strip} roleFilter={roleFilter} setRoleFilter={setRoleFilter}/>
  {dossier.id==='live'&&<Waterfall states={providerStates} stream={stream} busy={busy}/>}
  <div className={'workspace '+mode}>
   <aside className="claims-panel">
    <form onSubmit={search} className="rail-search" toolname="prismweb_search_open_web" tooldescription="Search public evidence providers or extract an article, discussion or feed URL">
     <button type="button" className="rail-search-icon" aria-label="Open Web search" onClick={()=>document.getElementById('web-search')?.focus()}><Search size={14} aria-hidden="true"/></button>
     <input id="web-search" name="query" required aria-label="Search the open Web" placeholder="Search a topic or paste a URL…" value={query} onChange={e=>setQuery(e.target.value)}/>
     <button aria-label="Run open Web search" type="submit">↵</button>
    </form>
    {actions}
    <nav className="dossiers" aria-label="Public evidence dossiers">{dossiers.map((d,i)=><button key={d.id} aria-label={d.label} aria-pressed={dossier.id===d.id} onClick={()=>choose(d)}><span>0{i+1}</span>{d.short}</button>)}</nav>
    <RailMetrics evidence={yearEvidence} claims={dossier.claims} strip={strip} setStrip={()=>setStrip(x=>!x)}/>
    <div className="section-heading"><h2>Checkpoints</h2><span className="auto-verification" data-testid="auto-verified" data-tip="Checks that this evidence copy is intact. Review the sources to judge each claim.">{verification?.valid&&manifest?'✓ Auto-Verified':busy?'Collecting…':'Signing…'}</span>{activeClaim&&<button type="button" className="clear-claim" onClick={()=>setActiveClaim(null)}>All ({dossier.claims.length})</button>}</div>
    <div className="claims-scroll">{dossier.claims.map((c,i)=>{const s=claimStatus(c,evidence),isAct=activeClaim===c.id;return <article role="button" tabIndex={0} className={'claim'+(isAct?' active':'')} key={c.id} onClick={()=>setActiveClaim(isAct?null:c.id)} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();setActiveClaim(isAct?null:c.id)}}}><span className="claim-number">{String(i+1).padStart(2,'0')}</span><h3>{shortClaim(c)}</h3><p className="claim-text">{c.text}</p><div className="claim-badges"><span className={'badge '+tone(s.status)}>{statusLabel(s.status)}</span><span className="primary-count">{s.n}/3 original sources</span>{s.status==='UNVERIFIED'&&<button className="probe" type="button" onClick={e=>{e.stopPropagation();probe(c)}}>Find more sources ↗</button>}</div></article>})}</div>
   </aside>
   <section className="center-panel">
    {mode==='investigator'&&<section className="graph-panel"><div className="graph-head"><h2><Network size={15}/> How Claims Connect to Sources &amp; Funders</h2><div className="graph-tabs"><button aria-label="Alluvial Flow" aria-pressed={graphView==='flow'} onClick={()=>setGraphView('flow')}>Source Flow</button><button aria-label="Graph Topology" aria-pressed={graphView==='topology'} onClick={()=>setGraphView('topology')}>Network Map</button></div><div className="graph-actions"><button onClick={exportJSON} data-testid="export-json"><ArrowDownToLine size={13}/>Export Data</button><button onClick={exportHTML} data-testid="export-html">Save Report</button><button onClick={()=>input.current.click()} aria-label="Import evidence JSON or CSV"><Upload size={14}/></button></div></div><Graph claims={dossier.claims} evidence={evidence} selected={selected} onSelect={selectEvidence} view={graphView}/><TemporalHistogram docs={docs} minYear={minYear} maxYear={maxYear} yearLo={yearLo} yearHi={yearHi} setMinYear={setMinYear} setMaxYear={setMaxYear}/><HyperplaneXRay terms={terms} timing={workerTiming??timing} events={events}/></section>}
    <div className="spectrum">{ROLE.map(([role,title])=>{const colDocs=evidence.filter(e=>e.role===role).toSorted((a,b)=>activeClaim?((b.claims||[]).includes(activeClaim)?1:0)-((a.claims||[]).includes(activeClaim)?1:0):0);return <section className={'spectrum-column '+role+(roleFilter&&roleFilter!==role?' dimmed-col':'')} key={role}><div className="column-heading" onClick={()=>setRoleFilter(roleFilter===role?null:role)}><span className="role-dot"/><h3>{title}</h3><b>{colDocs.length}</b></div><div className="cards">{colDocs.map(e=>{const matchesClaim=!activeClaim||(e.claims||[]).includes(activeClaim);return <article id={'card-'+e.id} key={e.id} data-evidence-id={e.id} onClick={ev=>{if(ev.target.closest('a,button'))return;setSelected(selected===e.id?null:e.id)}} className={'evidence-card '+(selected===e.id?'selected ':'')+(activeClaim?(matchesClaim?'matched':'dimmed'):'')} >{events.length>0&&(()=>{const ev=events.at(-1),delta=ev.before.indexOf(e.id)-ev.after.indexOf(e.id);return delta!==0&&<div className={'rank-jump '+(delta>0?'up':'down')} data-testid="rank-jump">{delta>0?'▲ +':'▼ '}{delta} ranks</div>})()}<div className="fingerprint"><span className="lane" data-tip={e.sourceGroup}><i>{lane(e)}</i></span><span className="fp-year">{e.year||'LIVE'}</span>{e.conflicted&&<span className="fp-coi" data-tip="Funded by a company with a commercial stake in this topic">Sponsored</span>}{['SUPPORTS','REFUTES'].includes(e.stance)&&<span className={'stance '+e.stance.toLowerCase()}>{e.stance==='SUPPORTS'?'Supports claim':'Contradicts claim'}</span>}</div><a className="evidence-title" href={e.url} target="_blank" rel="noreferrer">{e.title}<ArrowUpRight size={13}/></a><p className="excerpt">{e.text||'Abstract unavailable. Open the original source.'}</p>{e.funders.length>0&&(selected===e.id?<div className={'funding '+(e.conflicted?'coi':'')}><span>Funders · {e.funders.length}</span>{e.funders.map((f,i)=><b key={i}>{f.name}</b>)}</div>:<div className={'funder-pill '+(e.conflicted?'coi':'')} data-tip={e.funders.map(f=>f.name).join(' · ')}><b>{leadFunder(e)}</b>{e.funders.length>1&&<span>+{e.funders.length-1}</span>}</div>)}{details===e.id&&<div className="source-details"><p>{e.sourceGroup}</p><p>{e.linkKind||'Original source or identifier'}</p>{e.revision&&<p>Revision {e.revision.revid}: {clean(e.revision.comment)} ({e.revision.timestamp})</p>}{e.citations?.map((u,i)=><a key={i} href={u} target="_blank" rel="noreferrer">{new URL(u,window.location.href).hostname}<ExternalLink size={11}/></a>)}{e.fullTextLinks?.map((l,i)=><a key={i} href={l.url} target="_blank" rel="noreferrer">{l.availabilityCode} full text</a>)}{e.entityId&&<button onClick={async()=>{try{const d=await entityFacts(e.entityId,AbortSignal.timeout(18000));setNotice(e.entityId+': '+Object.keys(d?.claims||{}).join(', '))}catch(c){setNotice('Entity request: '+c.message)}}}>Read entity properties</button>}</div>}{mode==='investigator'&&selected===e.id&&<div className="score-decomposition"><span>BM25 <b>{e.base.toFixed(2)}</b></span><span className={e.score<e.base?'negative':'positive'}>Feedback <b>{e.score-e.base>=0?'+':''}{(e.score-e.base).toFixed(2)}</b></span></div>}<div className="feedback"><button className="positive" aria-label={'Relevant Primary: '+e.title} onClick={()=>judge(e,1)}>+ Solid Proof</button><button className="negative" aria-label={'PR Spin or Off-Intent: '+e.title} onClick={()=>judge(e,-1)}>- Company PR</button><button className="details-toggle" aria-label={'Source details for '+e.title} aria-expanded={details===e.id} onClick={()=>setDetails(details===e.id?null:e.id)}><ChevronDown size={14}/></button></div></article>})}{!colDocs.length&&<div className="empty-column">{strip?'Sources removed by your filter.':'No matching source identified.'}</div>}</div></section>})}</div>
    {mode==='investigator'&&<details className="agent-contract sr-only" inert open data-testid="webmcp-panel">
     <summary><Orbit size={15} aria-hidden="true"/>One-Click Evidence Checks <span>4 instant checks</span></summary>
     <div className="agent-picks" role="group" aria-label="Evidence checks">{AGENT_ACTIONS.map(([name,label])=><button type="button" key={name} aria-pressed={toolName===name} onClick={()=>{setToolName(name);setToolInput('');callTool(name,'')}}>{label}</button>)}</div>
     <div className="vault-console">
      <select className="sr-only" aria-label="Agent tool" value={toolName} onChange={e=>{setToolName(e.target.value);setToolInput('')}}>{AGENT_ACTIONS.map(([name,label])=><option key={name} value={name}>{label}</option>)}</select>
      <button className="solid-button" onClick={()=>callTool()}>Run Check</button>
      <details className="api-spec"><summary>API Spec</summary><pre data-testid="tool-schema">{JSON.stringify(schemas[toolName],null,2)}</pre><textarea aria-label="Agent tool input JSON" placeholder="Optional JSON arguments. Leave blank for current-view example." value={toolInput} onChange={e=>setToolInput(e.target.value)}/></details>
     </div>
     {toolResult&&<ToolOutput result={toolResult} docs={docs}/>}
    </details>}
   </section>
  </div><footer className="stealth-bar"><span>{notice||(timing!==null?timing.toFixed(2)+' ms':'Ready')}</span><VisionLens lens={lens} setLens={setLens}/></footer></main>{notice&&<div className="confirmation-toast" role="status" data-testid="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>✕</button></div>}{shareOpen&&<ShareCard dossier={dossier} evidence={evidence} label={label} onClose={()=>setShareOpen(false)} onNotice={setNotice}/>}<AuditDrawer open={auditOpen} onClose={()=>setAuditOpen(false)} text={auditText} setText={setAuditText} rows={auditRows} onAudit={runAudit} samples={paragraphSamples(dossiers)} editorial={editorial} setEditorial={setEditorial} evidence={evidence} onSign={exportJSON} onVerify={verifyCurrent} manifest={manifest} verification={verification} tamper={tamper} onTamper={testTamper} error={auditError}/><input hidden type="file" ref={input} accept=".json,.csv" onChange={e=>importFile(e.target.files[0])}/>
 <CommandPalette open={palette} items={commands} onClose={()=>setPalette(false)} onPick={pickCommand} webSearch={q=>({id:'web:'+q,kind:'Web search',label:'Search the open Web: '+q,run:()=>{setQuery(q);search(null,q)}})}/></div>
 {floatingTip&&<div ref={tipRef} role="tooltip" className="floating-tip" style={{position:'fixed',...tipPosition,zIndex:1200}}>{floatingTip.text}</div>}
 <OrbDock mode={mode} setMode={setMode} onAudit={openAudit}/></>
}
createRoot(document.getElementById('root')).render(<App/> )
