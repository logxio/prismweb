export const colors={primary:'#53BFAF',self:'#2563EB',independent:'#262936'}
// Machado, Oliveira and Fernandes (2009), severity 1.0, linear RGB.
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
export const matrices={
 Deuteranopia:[.367322,.860646,-.227968,.280085,.672501,.047413,-.011820,.042940,.968881],
 Protanopia:[.152286,1.052583,-.204868,.114503,.786281,.099216,-.003882,-.048116,1.051998],
 Mono:[.2126,.7152,.0722,.2126,.7152,.0722,.2126,.7152,.0722]
}
const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4
const srgb=x=>255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055)
export function simulate(hex,lens,quantize=true){
 const v=hex.slice(1).match(/../g).map(s=>linear(parseInt(s,16)/255)),m=matrices[lens]
 const result=m?[0,1,2].map(i=>srgb(Math.max(0,Math.min(1,m[i*3]*v[0]+m[i*3+1]*v[1]+m[i*3+2]*v[2])))):hex.slice(1).match(/../g).map(s=>parseInt(s,16))
 return quantize?result.map(Math.round):result
}
export function colorReport(){return Object.fromEntries(['Deuteranopia','Protanopia'].map(lens=>{
 const values=Object.values(colors).map(c=>simulate(c,lens)),raw=Object.values(colors).map(c=>simulate(c,lens,false))
 const distances=vs=>[Math.hypot(...vs[0].map((x,i)=>x-vs[1][i])),Math.hypot(...vs[0].map((x,i)=>x-vs[2][i])),Math.hypot(...vs[1].map((x,i)=>x-vs[2][i]))]
 return [lens,{rgb8:values,distances:distances(values),min:Math.min(...distances(values)),unquantizedMin:Math.min(...distances(raw))}]
}))}
export const matrixValues=m=>[0,1,2].map(i=>m.slice(i*3,i*3+3).join(' ')+' 0 0').join(' ')+' 0 0 0 1 0'
