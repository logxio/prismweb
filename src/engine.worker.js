import {packedRank} from './engine'
let pool
self.onmessage=({data})=>{
 const {id,type}=data
 try{
  if(type==='pool'){pool=data.pool;self.postMessage({id,ready:true,count:pool.bases.length,bufferType:pool.packed.constructor.name,dimensions:2048});return}
  if(type==='rank'){if(!pool)throw new Error('Candidate pool has not arrived');self.postMessage({id,...packedRank(pool,data.weights,data.active)});return}
  if(type==='ping')self.postMessage({id,ready:true})
 }catch(e){self.postMessage({id,error:e.message})}
}
self.postMessage({online:true})
