import {vector,feedback,dot,diversify,packVectors,packedRank} from './engine'
const metric=(ids,gold)=>{if(!gold.size)return {ndcg10:null,mrr:null};const rel=ids.slice(0,10).map(id=>gold.has(id)?1:0),dcg=rel.reduce((a,v,i)=>a+v/Math.log2(i+2),0),ideal=Array.from({length:Math.min(10,gold.size)},(_,i)=>1/Math.log2(i+2)).reduce((a,b)=>a+b,0);return {ndcg10:dcg/ideal,mrr:rel.includes(1)?1/(rel.indexOf(1)+1):0}}
export function runBenchmark(rows,packed=false){return rows.map(row=>{
 const vs=row.candidates.map(e=>vector(e.text)),gold=new Set(row.gold),clicked=new Set(),samples=[],curves={Single_Voice_TopK:[],Static_Multi_Perspective:[],PrismWeb_Full:[]},base=row.candidates.map(e=>e.base),indices=base.map((_,i)=>i),staticOrder=diversify(indices,row.predicted_stances,base),orders=[],scoreSteps=[]
 const pool=packed?packVectors(row.candidates.map((e,i)=>({...e,vector:vs[i],stance:row.predicted_stances[i]}))):null
 let w=new Float64Array(2048)
 for(let step=0;step<4;step++){
  const start=performance.now()
  if(step){const click=row.clicks[step-1];if(click){w=feedback(w,vs[click.index],click.sign);clicked.add(row.candidates[click.index].id)}}
  const scores=packed?packedRank(pool,w,true).scores:base.map((b,i)=>b+.45*dot(w,vs[i]));let order=indices.slice()
  if(step)order.sort((a,b)=>scores[b]-scores[a]||a-b)
  order=diversify(order,row.predicted_stances,scores);samples.push(performance.now()-start);orders.push(order);scoreSteps.push(scores)
  for(const [name,ranking] of Object.entries({Single_Voice_TopK:indices,Static_Multi_Perspective:staticOrder,PrismWeb_Full:order})){
   const ids=ranking.map(i=>row.candidates[i].id),m=metric(ids,gold),unseen=metric(ids.filter(id=>!clicked.has(id)),new Set([...gold].filter(id=>!clicked.has(id))))
   curves[name].push({...m,unseen_ndcg10:unseen.ndcg10,unseen_mrr:unseen.mrr})
  }
 }
 return {id:row.id,samples,curve:curves.PrismWeb_Full,curves,orders,scoreSteps}
})}
