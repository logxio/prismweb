import MiniSearch from 'minisearch'
import prior from './prior.json'
export const clean = value => String(value ?? '').replace(/[\u2014\u2013]/g, ', ').replace(/-{3,}/g, ' ').replace(/<[^>]*>/g,'').trim()
// Commercial funder names: lead name on a conflicted card and the funder column of the provenance flow.
export const commercialFunder = /janssen|pfizer|merck|novartis|astrazeneca|shell|exxon|chevron|roche|sanofi|bayer|gsk|pharma|drug|morris|tobacco|lilly/i
const stop = new Set('a an the of in on at is are was were to and or for with by from that this it as be has have had not no'.split(' '))
export const tokens = s => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => !stop.has(t))
export function vector(s) {
 const v = new Float64Array(2048), ts=tokens(s)
 const features=[...ts,...ts.slice(1).map((t,i)=>ts[i]+' '+t)]
 for (const t of features) {let n=2166136261;for(let i=0;i<t.length;i++)n=Math.imul(n^t.charCodeAt(i),16777619)>>>0;v[n%2048]++}
 return normalize(v)
}
export function normalize(v) {let sum=0;for(let i=0;i<v.length;i++)sum+=v[i]*v[i];const norm=Math.sqrt(sum);return norm?Float64Array.from(v,x=>x/norm):v}
export function feedback(w,x,sign) {return Float64Array.from(w,(n,i)=>n+(sign>0?1:-.35)*x[i])}
export function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s}
export function diversify(order,stances,scores,k=60){
 const out=order.slice(0,k),limit=Math.min(10,out.length),eligible=order.filter(i=>scores[i]>=.45)
 if(!['SUPPORTS','REFUTES'].every(s=>eligible.some(i=>stances[i]===s)))return out
 for(const stance of ['SUPPORTS','REFUTES']){
  if(out.slice(0,limit).some(i=>stances[i]===stance&&scores[i]>=.45))continue
  const candidate=eligible.filter(i=>stances[i]===stance).sort((a,b)=>scores[b]-scores[a]||a-b)[0]
  const position=out.indexOf(candidate)
  for(let j=limit-1;j>=0;j--){
   const displaced=out[j],other=stances[displaced]
   if(other===stance)continue
   if(other==='SUPPORTS'||other==='REFUTES'){
    if(!out.slice(0,limit).some((i,n)=>n!==j&&stances[i]===other&&scores[i]>=.45))continue
   }
   if(position>=0)out[position]=displaced
   out[j]=candidate;break
  }
 }
 return out
}
export function mergeEvidence(existing,incoming){
 const key=e=>e.url.toLowerCase().replace(/\/$/,'')
 const unique=items=>[...new Map(items.map(x=>[x.name+':'+(x.id||x.url||''),x])).values()]
 const result=new Map(existing.map(e=>[key(e),e]))
 for(const e of incoming){const id=key(e),old=result.get(id);if(!old){result.set(id,e);continue}
  const funders=unique([...(old.funders||[]),...(e.funders||[])]),conflicted=old.conflicted||e.conflicted
  result.set(id,{...e,...old,text:old.text.length>=e.text.length?old.text:e.text,provider:[...new Set([...(old.providers||[old.provider]),e.provider])].join(' + '),providers:[...new Set([...(old.providers||[old.provider]),e.provider])],funders,fundingKnown:old.fundingKnown||e.fundingKnown,conflicted,role:conflicted?'self':old.role==='primary'||e.role==='primary'?'primary':old.role,retracted:old.retracted||e.retracted,fullTextLinks:[...(old.fullTextLinks||[]),...(e.fullTextLinks||[])],awards:[...(old.awards||[]),...(e.awards||[])],revision:{...(old.revision||{}),...(e.revision||{})},citations:[...new Set([...(old.citations||[]),...(e.citations||[])])]})
 }
 return [...result.values()]
}
export function prepare(evidence,query){
 const idx=new MiniSearch({fields:['title','text'],storeFields:['id'],searchOptions:{combineWith:'OR',prefix:true}})
 idx.addAll(evidence.map(e=>({...e,text:clean(e.text)})))
 const hits=new Map(idx.search(query).map(e=>[e.id,e.score]));const max=Math.max(...hits.values(),1)
 return evidence.map(e=>({...e,base:(hits.get(e.id)||0)/max,vector:vector(e.title+' '+e.text)}))
}
export function rank(docs,w,active){const scored=docs.map(d=>({...d,score:d.base+(active?.45*dot(w,d.vector):0)})),order=scored.map((_,i)=>i).sort((a,b)=>scored[b].score-scored[a].score||a-b);return diversify(order,scored.map(d=>d.stance),scored.map(d=>d.score),scored.length).map(i=>scored[i])}
export function claimStatus(c,es){
 const related=es.filter(e=>e.claims?.includes(c.id));const primary=related.filter(e=>e.role==='primary'&&e.independenceConfirmed&&['SUPPORTS','REFUTES'].includes(e.stance));const n=new Set(primary.map(e=>e.sourceGroup)).size
 const support=primary.filter(e=>e.stance==='SUPPORTS').length,refute=primary.filter(e=>e.stance==='REFUTES').length
 const p=(support+prior.alpha)/(support+refute+prior.alpha+prior.beta)
 const conflict=related.some(e=>e.stance==='REFUTES')&&related.some(e=>e.stance==='SUPPORTS')
 return {n,p,status:n<3?'UNVERIFIED':conflict?'CONTESTED':refute?'DISCREPANCY ALERT':'PRIMARY SUPPORTED'}
}
export function nutrition(claims,es){
 const primary=es.filter(e=>e.role==='primary').length;const groups={};for(const e of es)groups[e.sourceGroup]=(groups[e.sourceGroup]||0)+1
 const sizes=Object.values(groups),n=es.length,entropy=sizes.length>1?-sizes.reduce((v,c)=>v+c/n*Math.log(c/n),0)/Math.log(sizes.length):0
 const disclosed=es.filter(e=>e.fundingKnown).length,years=es.map(e=>e.year).filter(Boolean);const signs=es.filter(e=>e.stance==='REFUTES'||e.stance==='SUPPORTS');const refute=signs.filter(e=>e.stance==='REFUTES').length
 return {n,primaryRatio:n?primary/n:0,entropy,disclosure:n?disclosed/n:0,years:years.length?[Math.min(...years),Math.max(...years)]:[],abstentions:claims.filter(c=>['UNVERIFIED','CONTESTED'].includes(claimStatus(c,es).status)).length,discrepancy:signs.length?(refute+1)/(signs.length+2):null,knownStances:signs.length,conflicted:es.filter(e=>e.conflicted).length,sourceGroups:sizes.length}
}
export function decompose(query){return clean(query).split(/\s+(?:and|but|whereas)\s+|[;!?]+/i).filter(Boolean).slice(0,5).map((text,i)=>({id:'live-'+i,text,time:(text.match(/\b(?:19|20)\d{2}\b/g)||[]).join(', ')||'Time unspecified',place:(text.match(/\b(?:UK|US|EU|China|Europe|Africa|India|Japan)\b/gi)||[]).join(', ')||'Scope unspecified'}))}
export function reviewPackage(title,claims,evidence,events){return {'@context':'https://schema.org','@type':'ClaimReview','datePublished':new Date().toISOString().slice(0,10),'claimReviewed':title,'author':{'@type':'Organization','name':'PrismWeb investigator'},'itemReviewed':{'@type':'CreativeWork','name':title,'citation':evidence.map(e=>({'@type':'CreativeWork','name':e.title,'url':e.url}))},'reviewBody':'Evidence organized for human judgment. '+claims.map(c=>c.text+': '+claimStatus(c,evidence).status).join('. '),'prismweb':{claims,evidence:evidence.map(({vector,...e})=>e),events}}}

export function bucketTerms(docs){
 const counts=new Map()
 for(const d of docs){const ts=tokens(d.title+' '+d.text);for(const term of [...ts,...ts.slice(1).map((t,i)=>ts[i]+' '+t)]){let h=2166136261;for(let i=0;i<term.length;i++)h=Math.imul(h^term.charCodeAt(i),16777619)>>>0;const bucket=h%2048;let entries=counts.get(bucket);if(!entries)counts.set(bucket,entries=new Map());entries.set(term,(entries.get(term)||0)+1)}}
 return new Map([...counts].map(([bucket,terms])=>[bucket,[...terms].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length||a[0].localeCompare(b[0]))[0][0]]))
}
export function explainWeights(w,index){const terms=[...index].map(([bucket,term])=>({term,weight:w[bucket],bucket}));return {boosted:terms.filter(t=>t.weight>1e-6).sort((a,b)=>b.weight-a.weight).slice(0,5),suppressed:terms.filter(t=>t.weight< -1e-6).sort((a,b)=>a.weight-b.weight).slice(0,5)}}
export function packVectors(docs){
 const packed=new Float32Array(docs.length*2048),tails=new Float64Array(packed.length)
 docs.forEach((d,i)=>{packed.set(d.vector,i*2048);for(let j=0;j<2048;j++)tails[i*2048+j]=d.vector[j]-packed[i*2048+j]})
 return {packed,tails,bases:docs.map(d=>d.base),stances:docs.map(d=>d.stance)}
}
// A low-bit correction preserves the reference kernel's exact IEEE-754 sums.
export function packedRank({packed,tails,bases,stances},w,active){
 const begin=performance.now(),scores=bases.map((b,i)=>{let value=0;const offset=i*2048;if(active)for(let j=0;j<2048;j++)value+=w[j]*(packed[offset+j]+tails[offset+j]);return b+(active?.45*value:0)}),order=bases.map((_,i)=>i).sort((a,b)=>scores[b]-scores[a]||a-b)
 return {scores,order:diversify(order,stances,scores,bases.length),ms:performance.now()-begin}
}
