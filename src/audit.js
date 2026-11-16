import {clean,tokens,claimStatus,nutrition,reviewPackage} from './engine'
export const splitSentences=text=>{
 const input=clean(text)
 return (typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(input)].map(s=>s.segment):input.split(/(?<=[.!?])\s+(?=[A-Z])/)).map(s=>s.trim()).filter(Boolean)
}
const comparable=s=>tokens(s).join(' ')
export function auditParagraph(text,dossier,evidence){
 const sentences=splitSentences(text)
 return sentences.map((sentence,i)=>{
  const key=comparable(sentence),exactClaim=dossier.claims.find(c=>comparable(c.text)===key)
  const exact=evidence.filter(e=>splitSentences(e.text).some(s=>comparable(s)===key))
  const qs=new Set(tokens(sentence)),candidates=evidence.map(e=>{const es=new Set(tokens(e.title+' '+e.text));return {e,score:[...qs].filter(t=>es.has(t)).length/Math.max(1,qs.size)}}).filter(x=>x.score>=.3).sort((a,b)=>b.score-a.score).slice(0,3)
  const sources=exactClaim?evidence.filter(e=>e.claims?.includes(exactClaim.id)):exact
  let status='UNVERIFIED',reason='Candidate retrieval is separate from evidence entailment. Human source review required.'
  if(exactClaim){const result=claimStatus(exactClaim,evidence);status=result.status;reason=result.n+' independent primary source groups for the curated statement.'}
  else if(exact.length){
   if(exact.every(e=>e.role==='self'||e.conflicted)){status='INTERESTED SELF-REPORT';reason='Exact sourced statement from an interested party.'}
   else {const n=new Set(exact.filter(e=>e.role==='primary'&&e.independenceConfirmed).map(e=>e.sourceGroup)).size;if(n>=3){status='PRIMARY SUPPORTED';reason=n+' independent primary groups contain this exact statement.'}else reason='Exact snippet located; fewer than three independent primary groups corroborate this sentence.'}
  }
  const who=sentence.match(/^(.{1,90}?)\s+(?:is|are|was|were|has|have|had|will|can|could|reported|reports|found|finds|claims|argued|reduces|reduced|provides|establishes|demonstrates|represented|states|said|deliver|delivers|requires|require|improves|improve)\b/i)?.[1]?.replace(/\s+(?:consistently|already|independently|alone)$/i,'')||'Subject requires review'
  return {id:'sentence-'+i,text:sentence,who,what:sentence,when:exactClaim?.time||(sentence.match(/\b(?:19|20)\d{2}\b/g)||[]).join(', ')||'Time unspecified',scope:exactClaim?.place||(sentence.match(/\b(?:global|United Kingdom|United States|UK|US|EU|Europe|Brazil|India|COVID-19|clinical|forest|laboratory)\b/gi)||[]).join(', ')||'Scope unspecified',status,reason,sourceIds:sources.map(e=>e.id),candidateIds:candidates.map(x=>x.e.id),humanJudgmentRequired:true}
 })
}
const encode=s=>new TextEncoder().encode(s)
export const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')
export const sha256=async s=>hex(await crypto.subtle.digest('SHA-256',encode(s)))
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)))
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0))
let signingKey
export async function signReview(title,claims,evidence,events,editorial){
 const started=performance.now(),p=reviewPackage(title,claims,evidence,events)
 p.prismweb.evidence=await Promise.all(p.prismweb.evidence.map(async e=>({...e,snippetSha256:await sha256(e.text)})))
 p.prismweb.nutrition=nutrition(claims,evidence)
 p.prismweb.editorial=editorial
 signingKey??=crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
 const keys=await signingKey,payload=canonical(p),digest=await sha256(payload),signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,encode(payload))
 p.cryptographicManifest={algorithm:'ECDSA P-256',hash:'SHA-256',canonicalization:'Sorted object keys, JSON UTF-8',publicKeyJwk:await crypto.subtle.exportKey('jwk',keys.publicKey),signature:b64(signature),payloadSha256:digest,signer:'Ephemeral browser session key',identityAttestation:false,signingMs:performance.now()-started}
 return p
}
export async function verifyManifest(p){
 const started=performance.now()
 try{
  const {cryptographicManifest:m,...payload}=p
  if(!m||m.algorithm!=='ECDSA P-256'||m.hash!=='SHA-256')throw new Error('ECDSA P-256 manifest required')
  const serialized=canonical(payload),payloadHashMatches=await sha256(serialized)===m.payloadSha256
  const snippetHashes=await Promise.all(p.prismweb.evidence.map(async e=>({id:e.id,valid:await sha256(e.text)===e.snippetSha256})))
  const nutritionMatches=canonical(nutrition(p.prismweb.claims,p.prismweb.evidence))===canonical(p.prismweb.nutrition)
  const key=await crypto.subtle.importKey('jwk',m.publicKeyJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
  const signatureValid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(m.signature),encode(serialized))
  return {valid:payloadHashMatches&&signatureValid&&nutritionMatches&&snippetHashes.every(x=>x.valid),signatureValid,payloadHashMatches,nutritionMatches,snippetHashes,algorithm:m.algorithm,elapsedMs:performance.now()-started,identityAttestation:false}
 }catch(e){return {valid:false,error:clean(e.message),elapsedMs:performance.now()-started}}
}
