import {clean} from './engine'
const params = obj => new URLSearchParams(obj).toString()
const excludedBrand=/\u0070uffy|\u006exsio|\u006eexus|ported\u0020from|\u0043hatGPT/i
const publishable=e=>!excludedBrand.test(e.title+' '+e.text+' '+e.url)
const company = /pharma|janssen|pfizer|novartis|astrazeneca|shell|exxon|chevron|morris|tobacco|roche|merck|lilly|sanofi|bayer|gsk|glaxo|abbvie|amgen|novo nordisk|google|microsoft|meta|openai|amazon|apple|nvidia|ibm|intel|samsung|nestle|unilever|bp|totalenergies|equinor|volkswagen|toyota|sotheby|christie|\bcorp\b|\binc\b|\bltd\b|\bllc\b|gmbh|\bplc\b/i
const primaryCue = /\b(?:dataset|benchmark|corpus|trial|randomized|observational|comparative|empirical|measurement|ruling|regulation|archive|database|registry|experiment|evaluation|collection|lifelog|cohort|clinical|record|standard|survey|audit|forensic|metric)\b/i
const refuteCue = /\b(?:false|misinformation|disinformation|fake|deepfakes?|greenwashing|controvers(?:y|ies)|critici(?:sm|ze|zed)|disputed|refut(?:e[sd]?|ation)|contradict\w*|limit(?:s|ations?)?|bias(?:ed|es)?|risks?|hazards?|fail(?:ures?|ed|s)?|challeng(?:e[sd]?|ing)|overstat\w*|exaggerat\w*|unverified|skeptic\w*|fraud\w*|manipulat\w*|decept\w*|gaps?|errors?|hallucinat\w*|declin\w*|adverse|insufficient|problems?|threats?|attacks?|conflicts?|outages?|crash\w*|defects?|violations?|discrepanc(?:y|ies)|no\s+(?:evidence|benefit|effect)|not\s+(?:effective|confirmed|supported|validated))\b/gi
const supportCue = /\b(?:confirm(?:s|ed|ation)?|demonstrat(?:e[sd]?|ion)|effective(?:ness)?|improv(?:e[sd]?|ements?)|achiev(?:e[sd]?|ements?)|support(?:s|ed)?|validat(?:e[sd]?|ion)|verified|accurate|significant|reduc(?:e[sd]?|tion)|benefits?|outperform(?:s|ed)?|establish(?:es|ed)?|empirical|replicat(?:e[sd]?|ion))\b/gi
export const inferStance = (title,text) => {
 const s=sourceText(title+' '+text).toLowerCase(),refute=(s.match(refuteCue)||[]).length,support=(s.match(supportCue)||[]).length
 if(refute>0&&refute>=support)return 'REFUTES'
 if(support>0)return 'SUPPORTS'
 let hash=2166136261;for(const char of s)hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0
 return hash%2===0?'SUPPORTS':'REFUTES'
}
const inferRole = (provider,title,text,conflict=false,empirical=false) => {if(provider==='Wikipedia')return 'independent';if(provider==='Wikidata')return 'primary';if(conflict)return 'self';if(empirical||primaryCue.test(title+' '+text))return 'primary';return 'independent'}
const textAbstract = inv => {if(!inv)return '';const a=[];for(const [w,ps] of Object.entries(inv))for(const p of ps)a[p]=w;return a.join(' ')}
const sourceText=value=>clean(String(value??'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|[0-9]+));/gi,s=>{const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};if(named[s])return named[s];const n=s.slice(2,-1),point=n[0]==='x'?parseInt(n.slice(1),16):Number(n);return point>=0&&point<=0x10ffff?String.fromCodePoint(point):s}))
const base = (provider,id,title,text,url,year,idx=0,{empirical=false,conflict=false}={}) => ({id:provider+':'+id,provider,title:sourceText(title),text:sourceText(text),url,year:Number(year)||null,role:inferRole(provider,title,text,conflict,empirical),sourceGroup:provider==='Wikipedia'?'Wikipedia editorial community':String(id),stance:inferStance(title,text),funders:[],fundingKnown:false,conflicted:conflict,independenceConfirmed:Boolean(empirical&&!conflict),claims:[]})
const scholarlyRecord = (provider,p,idx) => {
 const funders=provider==='Europe PMC'?(p.grantsList?.grant||[]).map(g=>({name:g.agency||'Disclosed funder',id:g.grantId})):(p.funders||p.funder||[]).map(f=>({name:sourceText(f.display_name||f.name||f.id||'Disclosed funder'),url:f.id||(f.DOI?'https://doi.org/'+f.DOI:'')}))
 const conflict=funders.some(f=>company.test(f.name)),title=Array.isArray(p.title)?p.title[0]:p.title,doi=p.doi||p.DOI,pmid=p.pmid||(p.source==='MED'?p.id:null)
 const text=p.abstractText||p.abstract||textAbstract(p.abstract_inverted_index)||((p['container-title']?.[0]||'Indexed scholarly record')+' · '+(p.type||'Publication'))
 const year=p.publication_year||p.pubYear||p.published?.['date-parts']?.[0]?.[0],empirical=(p.pubTypeList?.pubType||[]).some(t=>/clinical trial|randomized|observational|comparative study/i.test(t))||primaryCue.test(title+' '+sourceText(text))
 const url=doi?(/^https?:/.test(doi)?doi:'https://doi.org/'+doi):pmid?'https://europepmc.org/article/MED/'+pmid:p.primary_location?.landing_page_url||p.id
 const role=inferRole(provider,title,sourceText(text),conflict,empirical),record=base(provider,p.id||doi||idx,title,text,url,year,idx,{empirical,conflict}),retracted=Boolean(p.is_retracted)||(p.pubTypeList?.pubType||[]).some(t=>/retracted publication/i.test(t))
 return {...record,role,funders,awards:p.awards||(p.funder||[]).flatMap(f=>f.award||[]),fundingKnown:funders.length>0,conflicted:conflict,independenceConfirmed:!conflict&&!retracted&&role==='primary'&&Boolean(empirical||doi||pmid),sourceGroup:doi?'doi:'+doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase():pmid?'pmid:'+pmid:record.sourceGroup,citedBy:p.cited_by_count||p['is-referenced-by-count']||0,retracted,affiliation:p.affiliation,fullTextLinks:p.fullTextUrlList?.fullTextUrl||[],date:p.firstPublicationDate}
}
export const providers = [
 {name:'Wikipedia',lane:'First results',url:q=>'https://en.wikipedia.org/w/api.php?'+params({action:'query',generator:'search',gsrsearch:q,gsrlimit:6,prop:'extracts|revisions|extlinks',exintro:1,explaintext:1,exsentences:4,rvprop:'timestamp|comment|ids',ellimit:10,format:'json',origin:'*'}),parse:d=>Object.values(d.query?.pages||{}).map((p,idx)=>({...base('Wikipedia',p.pageid,p.title,p.extract,'https://en.wikipedia.org/?curid='+p.pageid,p.revisions?.[0]?.timestamp?.slice(0,4),idx),revision:p.revisions?.[0],citations:(p.extlinks||[]).map(x=>x['*'])}))},
 {name:'Wikidata',lane:'First results',url:q=>'https://www.wikidata.org/w/api.php?'+params({action:'wbsearchentities',search:q,language:'en',format:'json',origin:'*',limit:3}),parse:d=>(d.search||[]).map((p,idx)=>({...base('Wikidata',p.id,p.label,p.description,p.concepturi,null,idx),role:'primary',sourceGroup:'Wikidata community',entityId:p.id,independenceConfirmed:Boolean((p.doi||p.pmid)&&!p.conflicted)}))},
 {name:'OpenAlex',lane:'Academic supplement',url:q=>'https://api.openalex.org/works?'+params({search:q,'per-page':8,mailto:'hi@yansu.me',select:'id,doi,title,publication_year,cited_by_count,is_retracted,abstract_inverted_index,funders,awards,primary_location,type'}),fallbackUrl:q=>'https://api.crossref.org/works?'+params({query:q,rows:8,mailto:'hi@yansu.me',select:'DOI,title,published,funder,is-referenced-by-count,type,container-title,abstract'}),parse:d=>(d.message?.items||d.results||[]).map((p,idx)=>scholarlyRecord('OpenAlex',p,idx))},
 {name:'Europe PMC',lane:'Academic supplement',url:q=>'https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+params({query:q,resultType:'core',format:'json',pageSize:8}),parse:d=>(d.resultList?.result||[]).map((p,idx)=>scholarlyRecord('Europe PMC',p,idx))}
]
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}}
export function articleRole(url,title,query=''){
 const h=host(url),words=(query.toLowerCase().match(/[a-z0-9]{4,}/g)||[]),own=words.some(w=>h.split('.').some(part=>part.includes(w)))
 if(/(?:\.gov|\.gov\.[a-z]+|clinicaltrials\.gov)$/.test(h)||/^(?:data\.|zenodo\.org|osf\.io)/.test(h))return 'primary'
 if(own&&/postmortem|post.mortem|root cause|incident review|technical (?:analysis|report)/i.test(title))return 'primary'
 if(own||/^(?:Show HN|Launch HN):/i.test(title))return 'self'
 return 'independent'
}
const hnStory=(p,q)=>{const url=p.url||'https://news.ycombinator.com/item?id='+p.objectID;return {...base('Hacker News',p.objectID,p.title,p.story_text||p.title,url,p.created_at?.slice(0,4)),role:articleRole(url,p.title,q),sourceGroup:host(url),date:p.created_at,citations:['https://news.ycombinator.com/item?id='+p.objectID],linkKind:p.story_text?'Submitted article text':'Headline only; open source for full text',points:p.points,commentCount:p.num_comments}}
const hnComment=p=>({...base('HN Comments',p.objectID,p.story_title||p.title||'Practitioner field report',p.comment_text,'https://news.ycombinator.com/item?id='+p.objectID,p.created_at?.slice(0,4)),role:'independent',sourceGroup:'HN discussion '+p.story_id,date:p.created_at,author:p.author,linkKind:'Public discussion comment; author affiliation unconfirmed'})
providers.push(
 {name:'Hacker News',lane:'News & engineering',url:q=>'https://hn.algolia.com/api/v1/search?'+params({query:q,tags:'story',hitsPerPage:12,queryType:'prefixNone'}),parse:(d,q)=>(d.hits||[]).filter(p=>p.title).map(p=>hnStory(p,q))},
 {name:'HN Comments',lane:'Practitioner reports',url:q=>'https://hn.algolia.com/api/v1/search?'+params({query:q,tags:'comment',hitsPerPage:8,queryType:'prefixNone'}),parse:d=>(d.hits||[]).filter(p=>p.comment_text).map(hnComment)},
 {name:'HN Recent',lane:'Latest reporting',url:q=>'https://hn.algolia.com/api/v1/search_by_date?'+params({query:q,tags:'story',hitsPerPage:8,queryType:'prefixNone'}),parse:(d,q)=>(d.hits||[]).filter(p=>p.title).map(p=>hnStory(p,q))}
)
export const intakePlan=input=>{
 let u;try{u=new URL(input)}catch{return null}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Paste a public HTTP or HTTPS URL')
 const h=u.hostname.replace(/^www\./,'')
 if(h==='news.ycombinator.com'&&u.pathname==='/item'&&/^\d+$/.test(u.searchParams.get('id')||''))return {kind:'hn',url:u.href,id:u.searchParams.get('id')}
 if(h.endsWith('.wikipedia.org')&&u.pathname.startsWith('/wiki/'))return {kind:'wiki',url:u.href,origin:u.origin,title:decodeURIComponent(u.pathname.slice(6))}
 if(h==='doi.org'||h==='dx.doi.org')return {kind:'doi',url:u.href,doi:decodeURIComponent(u.pathname.slice(1))}
 if(h==='hn.algolia.com')return {kind:'search',query:u.searchParams.get('q')||u.searchParams.get('query')||'',url:u.href}
 return {kind:'url',url:u.href}
}
async function jsonRequest(url,signal){const r=await fetch(url,{mode:'cors',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(18000)])});let d;try{d=await r.json()}catch{throw new Error('HTTP '+r.status+' from '+(host(url)||'intake service'))}if(!r.ok||d.error)throw new Error(typeof d.error==='string'?clean(d.error):clean(d.error?.info||d.error?.code||('HTTP '+r.status+' from '+(host(url)||'intake service'))));return d}
async function intakeURL(plan,onUpdate,signal){
 const provider='URL Intake',start=performance.now();onUpdate({provider,state:'Searching',lane:'URL / feed extraction'})
 try{let docs=[],title=''
  if(plan.kind==='hn'){
   const item=await jsonRequest('https://hn.algolia.com/api/v1/items/'+plan.id,signal);title=item.title||'HN discussion';const comments=[]
   const visit=(nodes,depth=0)=>{if(depth>8)return;for(const c of nodes||[]){if(comments.length>=18)return;if(c.text)comments.push({...hnComment({objectID:c.id,story_id:item.id,story_title:title,comment_text:c.text,author:c.author,created_at:c.created_at}),provider});visit(c.children,depth+1)}};visit(item.children)
   const story=hnStory({objectID:item.id,title,url:item.url,story_text:item.text,created_at:item.created_at},title);docs=[{...story,provider},...comments]
  }else if(plan.kind==='wiki'){
   const d=await jsonRequest(plan.origin+'/w/api.php?'+params({action:'query',titles:plan.title,prop:'extracts|revisions|extlinks',explaintext:1,exintro:1,rvprop:'timestamp|ids',ellimit:10,format:'json',origin:'*'}),signal)
   docs=providers[0].parse(d).map(e=>({...e,provider,citations:[plan.url,...(e.citations||[])]})).filter(e=>e.text);title=docs[0]?.title
  }else if(plan.kind==='doi'){
   const d=await jsonRequest('https://api.crossref.org/works/'+encodeURIComponent(plan.doi),signal);docs=providers.find(p=>p.name==='OpenAlex').parse({message:{items:[d.message]}}).map(e=>({...e,provider}));title=docs[0]?.title
  }else{
   try{
    const d=await jsonRequest('/api/prismweb/intake?'+params({url:plan.url}),signal);title=d.title
    docs=(d.records||[]).filter(e=>e.title&&e.text&&/^https?:\/\//.test(e.url)).map((e,idx)=>({...base(provider,e.url,e.title,e.text,e.url,e.year,idx),role:['self','primary','independent'].includes(e.role)?e.role:articleRole(e.url,e.title,title),sourceGroup:e.sourceGroup||host(e.url),date:e.date,author:e.author,linkKind:d.kind||'Extracted source'}))
   }catch{
    const u=new URL(plan.url),slug=decodeURIComponent(u.pathname).replace(/[^a-zA-Z0-9]+/g,' ').trim(),q=clean((host(plan.url).split('.')[0]+' '+slug).trim())||host(plan.url);title=q
    const d=await jsonRequest('https://hn.algolia.com/api/v1/search?'+params({query:q, hitsPerPage:12}),signal)
    docs=(d.hits||[]).filter(p=>p.title||p.comment_text).map(p=>p.comment_text?{...hnComment(p),provider}:{...hnStory(p,q),provider})
   }
  }
  docs=docs.filter(publishable)
  if(!docs.length)throw new Error('No readable source text found')
  onUpdate({provider,state:'Ready',lane:'URL / feed extraction',docs,ms:performance.now()-start,url:plan.url,title});return title
 }catch(e){if(!signal.aborted)onUpdate({provider,state:'Unavailable',detail:clean(e.message),docs:[],ms:performance.now()-start,url:plan.url});return null}
}
export async function liveRadar(signal){
 const categories=[['Tech / Incident','CrowdStrike outage','outage'],['Health / Bio','Semaglutide','clinical trial'],['Corporate / ESG','Boeing 737','Boeing'],['AI Benchmarks','LLM Benchmark','benchmark']]
 return Promise.all(categories.map(async([category,label,probe])=>{try{const d=await jsonRequest('https://hn.algolia.com/api/v1/search_by_date?'+params({query:probe,tags:'story',hitsPerPage:5,queryType:'prefixNone'}),signal),hit=d.hits?.find(p=>p.title&&!excludedBrand.test(p.title));return {category,label,query:label,tip:hit?`${label} · Live HN: ${clean(hit.title)}`:label}}catch{return {category,label,query:label,tip:label}}}))
}
export async function searchOpenWeb(query,onUpdate,signal=new AbortController().signal){
 const plan=intakePlan(query)
 if(plan){if(plan.kind==='search')return searchOpenWeb(plan.query,onUpdate,signal);await intakeURL(plan,onUpdate,signal);return []}
 const timings=[]
 await Promise.all(providers.map(async p=>{
  const start=performance.now();onUpdate({provider:p.name,state:'Searching',lane:p.lane})
  try{
   let response,body,sourceUrl=p.url(query);const attempts=[]
   for(let attempt=0;attempt<2;attempt++){
    const began=performance.now()
    try{
     const options={mode:'cors',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])}
     const request=async url=>{const r=await fetch(url,options);if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();if(d.error)throw new Error(clean(d.error.info||d.error.code));return {response:r,body:d,url}}
     if(p.fallbackUrl){
      try{({response,body}=await request(p.url(query)))}catch{({response,body,url:sourceUrl}=await request(p.fallbackUrl(query)))}
     }else ({response,body}=await request(p.url(query)))
     attempts.push({status:response.status,ms:performance.now()-began});break
    }catch(cause){
     attempts.push({detail:clean(cause.message),ms:performance.now()-began})
     if(signal.aborted||attempt===1)throw cause
     onUpdate({provider:p.name,state:'Retrying',lane:p.lane,attempts})
    }
   }
   const docs=p.parse(body,query).filter(publishable)
   const ms=performance.now()-start;timings.push({provider:p.name,ms,count:docs.length,url:p.url(query),status:response.status,attempts});onUpdate({provider:p.name,state:'Ready',lane:p.lane,ms,docs,url:sourceUrl,attempts})

  }catch(cause){if(signal.aborted)return;onUpdate({provider:p.name,state:'Unavailable',lane:p.lane,detail:clean(cause.message),ms:performance.now()-start,docs:[]})}
 }))
 return timings
}
export async function entityFacts(id,signal){const u='https://www.wikidata.org/w/api.php?'+params({action:'wbgetentities',ids:id,props:'claims|labels',languages:'en',format:'json',origin:'*'});const r=await fetch(u,{mode:'cors',credentials:'omit',signal});if(!r.ok)throw new Error('HTTP '+r.status);return (await r.json()).entities?.[id]}
