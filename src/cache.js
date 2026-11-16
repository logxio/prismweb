import {prepare,mergeEvidence} from './engine'
const TTL=24*60*60*1000,memory=new Map(),inflight=new Map()
const key=q=>q.trim().toLowerCase().replace(/\s+/g,' ')
let database
export const cacheDiagnostics={reads:0,hits:0,writes:0,speculativeStarted:0,speculativeCompleted:0,speculativeCancelled:0,errors:[],ttlMs:TTL}
function db(){if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('prismweb-evidence-v5',1);r.onupgradeneeded=()=>r.result.createObjectStore('queries',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return database}
export async function readCache(query){
 const start=performance.now(),k=key(query);cacheDiagnostics.reads++
 let entry=memory.get(k),layer='memory'
 if(!entry){layer='IndexedDB';try{const database=await db();entry=await new Promise((resolve,reject)=>{const request=database.transaction('queries').objectStore('queries').get(k);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}catch(e){cacheDiagnostics.errors.push(e.message)}}
 if(!entry)return null
 if(Date.now()-entry.savedAt>=TTL)return null
 memory.set(k,entry);cacheDiagnostics.hits++
 return {...entry,layer,readMs:performance.now()-start}
}
export async function writeCache(query,updates){
 const entry={key:key(query),savedAt:Date.now(),updates,prepared:prepare(mergeEvidence([],updates.flatMap(u=>u.docs)),query)};memory.set(entry.key,entry)
 try{const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('queries','readwrite');tx.objectStore('queries').put(entry);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});cacheDiagnostics.writes++}catch(e){cacheDiagnostics.errors.push(e.message)}
 return entry
}
export function clearMemory(){memory.clear()}
export function cancelPrefetch(except){for(const [q,p]of inflight)if(q!==key(except||'')){p.controller.abort();cacheDiagnostics.speculativeCancelled++;inflight.delete(q)}}
export async function prefetch(query,fetcher){
 if(query.trim().length<3)return
 const k=key(query);if(inflight.has(k))return inflight.get(k).promise
 if(await readCache(query))return
 cacheDiagnostics.speculativeStarted++;const controller=new AbortController(),updates=[]
 const promise=fetcher(query,u=>{if(u.state==='Ready')updates.push(u)},controller.signal).then(async()=>{if(!controller.signal.aborted&&updates.length){await writeCache(query,updates);cacheDiagnostics.speculativeCompleted++}}).finally(()=>inflight.delete(k))
 inflight.set(k,{controller,promise});return promise
}
export const cacheAPI={readCache,writeCache,clearMemory,cacheDiagnostics}
