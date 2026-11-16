import {packVectors,packedRank} from './engine'
export class RankingWorker{
 constructor(){this.sequence=0;this.pending=new Map();this.online=false;this.worker=new Worker(new URL('./engine.worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(data.online)this.online=true;const task=this.pending.get(data.id);if(task){this.pending.delete(data.id);data.error?task.reject(new Error(data.error)):task.resolve(data)}};this.worker.onerror=e=>{this.error=e.message;for(const task of this.pending.values())task.reject(new Error(e.message));this.pending.clear()}}
 call(type,data={}){const id=++this.sequence;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,type,...data})})}
 pool(docs){this.packed=packVectors(docs);return this.call('pool',{pool:this.packed})}
 rank(weights,active){return this.call('rank',{weights,active})}
 close(){this.worker.terminate();this.pending.clear()}
}
export function kernelBenchmark(docs,weights){const pool=packVectors(docs),samples=[];for(let i=0;i<60;i++){const start=performance.now();for(let j=0;j<20;j++)packedRank(pool,weights,true);samples.push((performance.now()-start)/20)}const sorted=samples.slice(10).sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],count:docs.length,dimensions:2048,bufferType:pool.packed.constructor.name,bytes:pool.packed.byteLength,exactCorrection:true,batchSize:20}}
