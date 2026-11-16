const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})
export const schemas={
 prismweb_decompose_and_audit:object({text:{type:'string',minLength:1,maxLength:30000,description:'English multi-sentence text to decompose and audit against the current evidence view.'}},['text']),
 prismweb_get_nutrition_label:object({}),
 prismweb_apply_feedback:object({evidenceId:{type:'string',minLength:1,description:'ID of an evidence record in the current view.'},sign:{type:'integer',enum:[1,-1],description:'1 marks relevant; -1 marks off-intent. Relevance feedback does not change evidence stance.'}},['evidenceId','sign']),
 prismweb_verify_manifest:object({manifest:{type:'object',description:'Complete exported ClaimReview JSON-LD. Omit to verify the current signed package.',required:['@type','prismweb','cryptographicManifest'],properties:{
  '@type':{type:'string',enum:['ClaimReview'],description:'schema.org review type.'},
  prismweb:{type:'object',required:['claims','evidence','nutrition','editorial'],properties:{claims:{type:'array',items:{type:'object'},description:'Structured sub-claims covered by the signature.'},evidence:{type:'array',items:{type:'object',required:['id','text','snippetSha256'],properties:{id:{type:'string'},text:{type:'string'},snippetSha256:{type:'string',pattern:'^[a-f0-9]{64}$'}}},description:'Original evidence snippets and SHA-256 digests.'},nutrition:{type:'object',description:'Signed evidence-view nutrition values.'},editorial:{type:'object',description:'Signed review status and explicit human dispositions.'}}},
  cryptographicManifest:{type:'object',required:['algorithm','hash','publicKeyJwk','signature','payloadSha256'],properties:{algorithm:{type:'string',enum:['ECDSA P-256']},hash:{type:'string',enum:['SHA-256']},publicKeyJwk:{type:'object',required:['kty','crv','x','y'],properties:{kty:{type:'string',enum:['EC']},crv:{type:'string',enum:['P-256']},x:{type:'string'},y:{type:'string'}}},signature:{type:'string',description:'Base64 encoded ECDSA signature.'},payloadSha256:{type:'string',pattern:'^[a-f0-9]{64}$'}}}
 }}})

}
const descriptions={prismweb_decompose_and_audit:'Split a paragraph into Who, What, When and Scope. Return traceable source states and UNVERIFIED gaps. Human editorial choices stay with the reviewer.',prismweb_get_nutrition_label:'Read nutrition values and source sufficiency for the currently filtered evidence.',prismweb_apply_feedback:'Apply local hyperplane relevance feedback and synchronize the visible ranking.',prismweb_verify_manifest:'Verify ECDSA P-256 signature, snippet hashes and nutrition of a ClaimReview package.'}
function validate(schema,value,path='input'){
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Object required: '+path)
  for(const name of schema.required||[])if(!(name in value))throw new Error(path+'.'+name+' is required')
  for(const [name,item] of Object.entries(value)){
   const p=schema.properties?.[name]
   if(!p){if(schema.additionalProperties===false)throw new Error('Unknown argument: '+name);continue}
   validate(p,item,path+'.'+name)
  }
 }
 if(schema.type==='array'){if(!Array.isArray(value))throw new Error('Array required: '+path);value.forEach((v,i)=>validate(schema.items,v,path+'['+i+']'))}
 if(schema.type==='string'&&(typeof value!=='string'||value.length<(schema.minLength||0)||value.length>(schema.maxLength||Infinity)))throw new Error('Invalid '+path)
 if(schema.type==='integer'&&!Number.isInteger(value))throw new Error('Integer required: '+path)
 if(schema.enum&&!schema.enum.includes(value))throw new Error('Invalid '+path)
 if(schema.pattern&&!new RegExp(schema.pattern).test(value))throw new Error('Invalid format: '+path)
}
export function registerContract(handlers){
 const tools=new Map(),controller=new AbortController(),registrations=[]
 const native=document.modelContext||navigator.modelContext
 const nativeSupported=typeof native?.registerTool==='function'
 const registry={registerTool(tool){if(tools.has(tool.name))throw new Error('Duplicate tool');tools.set(tool.name,tool)},unregisterTool(name){tools.delete(name)},getTools(){return Promise.resolve(this.listTools())},listTools(){return [...tools.values()].map(({execute,...rest})=>rest)},async executeTool(name,args={}){const tool=tools.get(typeof name==='string'?name:name.name);if(!tool)throw new Error('Unknown tool: '+name);return tool.execute(args)}}
 if(!document.modelContext)Object.defineProperty(document,'modelContext',{value:nativeSupported?native:registry,configurable:true})
 if(!navigator.modelContext)Object.defineProperty(navigator,'modelContext',{value:document.modelContext,configurable:true})
 for(const [name,inputSchema] of Object.entries(schemas)){
  const tool={name,description:descriptions[name],inputSchema,execute:async(args={})=>{
   const started=performance.now();validate(inputSchema,args)
   const result=await handlers.current[name](args),elapsedMs=performance.now()-started
   return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,execution:{elapsedMs,elapsedMicroseconds:elapsedMs*1000}}
  }}
  registry.registerTool(tool)
  if(nativeSupported)registrations.push(Promise.resolve(native.registerTool(tool,{signal:controller.signal})))
 }
 window.__prismWebMCP={mode:nativeSupported?'native':'compatibility registry',registry,schemas,registration:Promise.all(registrations),invoke:(name,args)=>registry.executeTool(name,args)}
 return ()=>{controller.abort();for(const name of Object.keys(schemas)){if(nativeSupported&&native.unregisterTool)native.unregisterTool(name);registry.unregisterTool(name)}}
}
