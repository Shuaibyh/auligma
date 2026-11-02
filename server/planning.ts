import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ApiError } from './identity.ts';
import type { Principal } from './enrollments.ts';
import { configuredSyllabusProvider, MAX_AI_INPUT_CHARS } from './syllabus-ai.ts';

/* eslint-disable no-useless-assignment -- el estado inicial conserva una salida segura ante fallos tempranos del parser PDF */

type Guard = (request: FastifyRequest) => Promise<Principal>;
type NodeType = 'unit'|'week'|'module'|'topic'|'subtopic'|'milestone';
const MAX_DEPTH = 6;
const MAX_FILE = 10 * 1024 * 1024;
const storageRoot = path.resolve(process.cwd(),'.auligma-data','private');
const uuid = {type:'string',format:'uuid'} as const;
const idParams = {type:'object',additionalProperties:false,required:['id'],properties:{id:uuid}} as const;
const resourceParams = {type:'object',additionalProperties:false,required:['id','resourceId'],properties:{id:uuid,resourceId:uuid}} as const;

function safeFileName(value:string) { return value.replace(/[\r\n]/g,' ').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,180) || 'archivo'; }
async function persist(buffer:Buffer, extension:string) {
  await mkdir(storageRoot,{recursive:true});
  const key = `${randomUUID()}${extension}`;
  await writeFile(path.join(storageRoot,key),buffer,{flag:'wx',mode:0o600});
  return key;
}
function storagePath(key:string) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(key)) throw new ApiError(404,'not_found','Recurso no disponible.');
  return path.join(storageRoot,key);
}
async function ownedClassroom(db:Knex,teacherId:string,classroomId:string,active=true) {
  const query=db('classrooms as c').join('subjects as s','s.id','c.subject_id').where({'c.id':classroomId,'c.teacher_id':teacherId}).whereNull('c.deleted_at').select('c.*','s.name as subject_name');
  if(active) query.whereNull('c.archived_at').whereNull('s.archived_at');
  const row=await query.first();
  if(!row) throw new ApiError(404,'not_found','Aula no disponible.');
  return row;
}
async function studentClassroom(db:Knex,studentId:string,classroomId:string) {
  const row=await db('classrooms as c').join('enrollments as e','e.classroom_id','c.id').where({'c.id':classroomId,'e.student_user_id':studentId,'e.status':'active'}).whereNull('c.archived_at').whereNull('c.deleted_at').first('c.id');
  if(!row) throw new ApiError(404,'not_found','Aula no disponible.');
}
async function planFor(db:Knex,classroomId:string) { return db('academic_plans').where({classroom_id:classroomId}).first(); }
async function snapshot(tx:Knex.Transaction,planId:string,actorId:string,action:string) {
  const plan=await tx('academic_plans').where({id:planId}).forUpdate().first();
  const nodes=await tx('academic_nodes').where({plan_id:planId}).orderBy(['parent_id','position','created_at']);
  const materials=await tx('academic_materials').whereIn('node_id',nodes.map(node=>node.id)).whereNull('deleted_at').select('id','node_id','kind','title','status');
  const revision=plan.revision+1;
  await tx('academic_plans').where({id:planId}).update({revision,updated_by:actorId,updated_at:tx.fn.now()});
  await tx('academic_plan_revisions').insert({id:randomUUID(),plan_id:planId,revision,action,snapshot:{nodes,materials},actor_id:actorId});
}
async function assertParent(tx:Knex.Transaction,planId:string,nodeId:string,parentId:string|null) {
  if(!parentId) return;
  if(parentId===nodeId) throw new ApiError(409,'hierarchy_cycle','Un elemento no puede contenerse a sí mismo.');
  const parent=await tx('academic_nodes').where({id:parentId,plan_id:planId}).whereNull('archived_at').first();
  if(!parent) throw new ApiError(404,'not_found','Contenedor no disponible.');
  const ancestry=await tx.withRecursive('ancestors',['id','parent_id','depth'],qb=>{
    qb.select('id','parent_id',tx.raw('1')).from('academic_nodes').where({id:parentId}).unionAll(inner=>inner.select('n.id','n.parent_id',tx.raw('a.depth + 1')).from('academic_nodes as n').join('ancestors as a','n.id','a.parent_id'));
  }).from('ancestors').select('*');
  if(ancestry.some(row=>row.id===nodeId)) throw new ApiError(409,'hierarchy_cycle','No puedes mover un elemento dentro de uno de sus descendientes.');
  if(Math.max(...ancestry.map(row=>Number(row.depth)),0)>=MAX_DEPTH) throw new ApiError(409,'hierarchy_depth','La jerarquía admite hasta seis niveles.');
}
function publicNode(row:Record<string,unknown>) { return {id:row.id,planId:row.plan_id,parentId:row.parent_id,type:row.type,title:row.title,description:row.description,position:row.position,status:row.status,publishedAt:row.published_at,archivedAt:row.archived_at,startsOn:row.starts_on,endsOn:row.ends_on}; }

export function registerPlanningRoutes(app:FastifyInstance,db:Knex,principal:Guard,teacher:Guard) {
  for(const mime of ['application/pdf','application/octet-stream','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) if(!app.hasContentTypeParser(mime)) app.addContentTypeParser(mime,{parseAs:'buffer'},(_request,body,done)=>done(null,body));

  app.get<{Params:{id:string}}>('/api/v1/classrooms/:id/planning',{schema:{params:idParams}},async request=>{
    const user=await principal(request);
    if(user.role==='docente') await ownedClassroom(db,user.id,request.params.id,false); else await studentClassroom(db,user.id,request.params.id);
    const plan=await planFor(db,request.params.id);
    if(!plan) return {plan:null,nodes:[],materials:[]};
    const nodesQuery=db('academic_nodes').where({plan_id:plan.id}).whereNull('archived_at');
    if(user.role==='estudiante') nodesQuery.where({status:'published'});
    const nodes=await nodesQuery.orderBy(['position','created_at']);
    const materialsQuery=db('academic_materials').whereIn('node_id',nodes.map(row=>row.id)).whereNull('deleted_at');
    if(user.role==='estudiante') materialsQuery.where({status:'published'});
    const materials=nodes.length ? await materialsQuery.select('id','node_id','kind','title','description','mime_type','size_bytes','external_url','status') : [];
    return {plan:{id:plan.id,title:plan.title,weekCount:plan.week_count,revision:plan.revision},nodes:nodes.map(publicNode),materials:materials.map(row=>({id:row.id,nodeId:row.node_id,kind:row.kind,title:row.title,description:row.description,mimeType:row.mime_type,sizeBytes:Number(row.size_bytes||0),externalUrl:row.external_url,status:row.status}))};
  });

  app.put<{Params:{id:string};Body:{title:string;weekCount:number}}>('/api/v1/classrooms/:id/planning',{schema:{params:idParams,body:{type:'object',additionalProperties:false,required:['title','weekCount'],properties:{title:{type:'string',minLength:1,maxLength:160,pattern:'\\S'},weekCount:{type:'integer',minimum:1,maximum:60}}}}},async(request,reply)=>{
    const user=await teacher(request);const classroom=await ownedClassroom(db,user.id,request.params.id);
    const result=await db.transaction(async tx=>{
      const existing=await tx('academic_plans').where({classroom_id:classroom.id}).forUpdate().first();
      if(existing){await tx('academic_plans').where({id:existing.id}).update({title:request.body.title.trim(),week_count:request.body.weekCount,updated_by:user.id,updated_at:tx.fn.now()});await snapshot(tx,existing.id,user.id,'plan.updated');return {...existing,title:request.body.title.trim(),week_count:request.body.weekCount};}
      const [created]=await tx('academic_plans').insert({id:randomUUID(),classroom_id:classroom.id,title:request.body.title.trim(),week_count:request.body.weekCount,created_by:user.id,updated_by:user.id}).returning('*');
      await tx('academic_plan_revisions').insert({id:randomUUID(),plan_id:created.id,revision:1,action:'plan.created',snapshot:{nodes:[],materials:[]},actor_id:user.id});return created;
    });
    return reply.code(201).send({id:result.id,title:result.title,weekCount:result.week_count,revision:result.revision});
  });

  app.post<{Params:{id:string};Body:{parentId?:string|null;type:NodeType;title:string;description?:string;position?:number;startsOn?:string|null;endsOn?:string|null;unitIds?:string[]}}>('/api/v1/classrooms/:id/planning/nodes',{schema:{params:idParams,body:{type:'object',additionalProperties:false,required:['type','title'],properties:{parentId:{anyOf:[uuid,{type:'null'}]},type:{type:'string',enum:['unit','week','module','topic','subtopic','milestone']},title:{type:'string',minLength:1,maxLength:200,pattern:'\\S'},description:{type:'string',maxLength:10000},position:{type:'integer',minimum:0,maximum:100000},startsOn:{anyOf:[{type:'string',format:'date'},{type:'null'}]},endsOn:{anyOf:[{type:'string',format:'date'},{type:'null'}]},unitIds:{type:'array',maxItems:20,uniqueItems:true,items:uuid}}}}},async(request,reply)=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const plan=await planFor(db,request.params.id);if(!plan) throw new ApiError(409,'planning_required','Configura primero la planificación del aula.');
    const created=await db.transaction(async tx=>{const id=randomUUID();await assertParent(tx,plan.id,id,request.body.parentId||null);const [row]=await tx('academic_nodes').insert({id,plan_id:plan.id,classroom_id:request.params.id,parent_id:request.body.parentId||null,type:request.body.type,title:request.body.title.trim(),description:request.body.description?.trim()||'',position:request.body.position??1000,starts_on:request.body.startsOn||null,ends_on:request.body.endsOn||null,created_by:user.id,updated_by:user.id}).returning('*');if(request.body.type==='week'&&request.body.unitIds?.length){const units=await tx('academic_nodes').where({plan_id:plan.id,type:'unit'}).whereIn('id',request.body.unitIds);if(units.length!==request.body.unitIds.length)throw new ApiError(400,'invalid_input','Una unidad seleccionada no pertenece a esta aula.');await tx('academic_week_units').insert(request.body.unitIds.map(unit_id=>({week_id:id,unit_id})));}await snapshot(tx,plan.id,user.id,'node.created');return row;});
    return reply.code(201).send(publicNode(created));
  });

  app.patch<{Params:{id:string;resourceId:string};Body:{parentId?:string|null;title?:string;description?:string;position?:number;startsOn?:string|null;endsOn?:string|null;action?:'publish'|'unpublish'|'archive';direction?:'up'|'down'}}>(`/api/v1/classrooms/:id/planning/nodes/:resourceId`,{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,minProperties:1,properties:{parentId:{anyOf:[uuid,{type:'null'}]},title:{type:'string',minLength:1,maxLength:200,pattern:'\\S'},description:{type:'string',maxLength:10000},position:{type:'integer',minimum:0,maximum:100000},startsOn:{anyOf:[{type:'string',format:'date'},{type:'null'}]},endsOn:{anyOf:[{type:'string',format:'date'},{type:'null'}]},action:{type:'string',enum:['publish','unpublish','archive']},direction:{type:'string',enum:['up','down']}}}}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const plan=await planFor(db,request.params.id);if(!plan)throw new ApiError(404,'not_found','Planificación no disponible.');
    return db.transaction(async tx=>{const node=await tx('academic_nodes').where({id:request.params.resourceId,plan_id:plan.id,classroom_id:request.params.id}).whereNull('archived_at').forUpdate().first();if(!node)throw new ApiError(404,'not_found','Contenido no disponible.');if(request.body.parentId!==undefined)await assertParent(tx,plan.id,node.id,request.body.parentId);let position=request.body.position;if(request.body.direction){const comparator=request.body.direction==='up'?'<':'>';const order=request.body.direction==='up'?'desc':'asc';const adjacent=await tx('academic_nodes').where({plan_id:plan.id,parent_id:node.parent_id}).whereNull('archived_at').where('position',comparator,node.position).orderBy('position',order).first();if(adjacent){await tx('academic_nodes').where({id:adjacent.id}).update({position:node.position,updated_by:user.id,updated_at:tx.fn.now()});position=adjacent.position;}}
      const changes={...(request.body.parentId!==undefined?{parent_id:request.body.parentId}:{}),...(request.body.title!==undefined?{title:request.body.title.trim()}:{}),...(request.body.description!==undefined?{description:request.body.description.trim()}:{}),...(position!==undefined?{position}:{}),...(request.body.startsOn!==undefined?{starts_on:request.body.startsOn}:{}),...(request.body.endsOn!==undefined?{ends_on:request.body.endsOn}:{}),...(request.body.action==='publish'?{status:'published',published_at:tx.fn.now()}:request.body.action==='unpublish'?{status:'draft',published_at:null}:request.body.action==='archive'?{archived_at:tx.fn.now()}:{}),updated_by:user.id,updated_at:tx.fn.now()};const [updated]=await tx('academic_nodes').where({id:node.id}).update(changes).returning('*');await snapshot(tx,plan.id,user.id,`node.${request.body.action||request.body.direction||'updated'}`);return publicNode(updated);});
  });

  app.post<{Params:{id:string};Body:{targetClassroomId:string}}>('/api/v1/classrooms/:id/planning/duplicate',{schema:{params:idParams,body:{type:'object',additionalProperties:false,required:['targetClassroomId'],properties:{targetClassroomId:uuid}}}},async(request,reply)=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const target=await ownedClassroom(db,user.id,request.body.targetClassroomId);const source=await planFor(db,request.params.id);if(!source)throw new ApiError(404,'not_found','Planificación de origen no disponible.');if(await planFor(db,target.id))throw new ApiError(409,'conflict','El aula de destino ya tiene una planificación.');
    const plan=await db.transaction(async tx=>{const [created]=await tx('academic_plans').insert({id:randomUUID(),classroom_id:target.id,title:source.title,week_count:source.week_count,created_by:user.id,updated_by:user.id}).returning('*');const sourceNodes=await tx('academic_nodes').where({plan_id:source.id}).whereNull('archived_at').orderBy('created_at');const map=new Map<string,string>();for(const node of sourceNodes){const id=randomUUID();map.set(node.id,id);await tx('academic_nodes').insert({id,plan_id:created.id,classroom_id:target.id,parent_id:node.parent_id?map.get(node.parent_id)||null:null,type:node.type,title:node.title,description:node.description,position:node.position,status:'draft',starts_on:node.starts_on,ends_on:node.ends_on,source_node_id:node.id,created_by:user.id,updated_by:user.id});}await tx('academic_plan_revisions').insert({id:randomUUID(),plan_id:created.id,revision:1,action:'plan.duplicated',snapshot:{sourcePlanId:source.id,nodeCount:sourceNodes.length},actor_id:user.id});return created;});
    return reply.code(201).send({id:plan.id,title:plan.title,weekCount:plan.week_count,revision:plan.revision});
  });

  app.post<{Params:{id:string;resourceId:string};Body:{kind:'link'|'note';title:string;description?:string;externalUrl?:string;textContent?:string}}>('/api/v1/classrooms/:id/planning/nodes/:resourceId/materials',{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,required:['kind','title'],properties:{kind:{type:'string',enum:['link','note']},title:{type:'string',minLength:1,maxLength:200,pattern:'\\S'},description:{type:'string',maxLength:4000},externalUrl:{type:'string',maxLength:2048,format:'uri'},textContent:{type:'string',maxLength:50000}}}}},async(request,reply)=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const node=await db('academic_nodes').where({id:request.params.resourceId,classroom_id:request.params.id}).whereNull('archived_at').first();if(!node)throw new ApiError(404,'not_found','Contenido no disponible.');if(request.body.kind==='link'&&!/^https:\/\//i.test(request.body.externalUrl||''))throw new ApiError(400,'invalid_input','Los enlaces deben usar HTTPS.');if(request.body.kind==='note'&&!request.body.textContent?.trim())throw new ApiError(400,'invalid_input','El apunte no puede estar vacío.');const [created]=await db('academic_materials').insert({id:randomUUID(),classroom_id:request.params.id,node_id:node.id,kind:request.body.kind,title:request.body.title.trim(),description:request.body.description?.trim()||'',external_url:request.body.kind==='link'?request.body.externalUrl:null,text_content:request.body.kind==='note'?request.body.textContent?.trim():null,created_by:user.id,updated_by:user.id}).returning('*');return reply.code(201).send({id:created.id,nodeId:created.node_id,kind:created.kind,title:created.title,status:created.status});
  });

  app.post<{Params:{id:string;resourceId:string};Headers:{'x-file-name'?:string;'x-material-title'?:string}}>('/api/v1/classrooms/:id/planning/nodes/:resourceId/materials/file',{schema:{params:resourceParams}},async(request,reply)=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const node=await db('academic_nodes').where({id:request.params.resourceId,classroom_id:request.params.id}).whereNull('archived_at').first();if(!node)throw new ApiError(404,'not_found','Contenido no disponible.');const body=request.body as Buffer;if(!Buffer.isBuffer(body)||!body.length||body.length>MAX_FILE)throw new ApiError(400,'invalid_file','El archivo debe pesar entre 1 byte y 10 MB.');const mime=request.headers['content-type']||'';const pdf=mime==='application/pdf'&&body.subarray(0,5).toString()==='%PDF-';const docx=mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'&&body[0]===0x50&&body[1]===0x4b;if(!pdf&&!docx)throw new ApiError(400,'invalid_file','Solo se admiten PDF y DOCX válidos de hasta 10 MB.');const extension=pdf?'.pdf':'.docx';const key=await persist(body,extension);try{const [created]=await db('academic_materials').insert({id:randomUUID(),classroom_id:request.params.id,node_id:node.id,kind:pdf?'pdf':'document',title:safeFileName(request.headers['x-material-title']||request.headers['x-file-name']||'Material'),mime_type:mime,size_bytes:body.length,storage_key:key,sha256:createHash('sha256').update(body).digest('hex'),created_by:user.id,updated_by:user.id}).returning('*');return reply.code(201).send({id:created.id,nodeId:created.node_id,kind:created.kind,title:created.title,status:created.status});}catch(error){await unlink(storagePath(key)).catch(()=>{});throw error;}
  });

  app.patch<{Params:{id:string;resourceId:string};Body:{action:'publish'|'unpublish'|'delete'}}>(`/api/v1/classrooms/:id/materials/:resourceId`,{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['publish','unpublish','delete']}}}}},async request=>{const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const material=await db('academic_materials').where({id:request.params.resourceId,classroom_id:request.params.id}).whereNull('deleted_at').first();if(!material)throw new ApiError(404,'not_found','Material no disponible.');const [updated]=await db('academic_materials').where({id:material.id}).update(request.body.action==='publish'?{status:'published',published_at:db.fn.now(),updated_by:user.id,updated_at:db.fn.now()}:request.body.action==='unpublish'?{status:'draft',published_at:null,updated_by:user.id,updated_at:db.fn.now()}:{deleted_at:db.fn.now(),updated_by:user.id,updated_at:db.fn.now()}).returning(['id','status','deleted_at']);return updated;});

  app.get<{Params:{id:string;resourceId:string}}>('/api/v1/classrooms/:id/materials/:resourceId/download',{schema:{params:resourceParams}},async(request,reply)=>{const user=await principal(request);if(user.role==='docente')await ownedClassroom(db,user.id,request.params.id,false);else await studentClassroom(db,user.id,request.params.id);const query=db('academic_materials').where({id:request.params.resourceId,classroom_id:request.params.id}).whereNull('deleted_at');if(user.role==='estudiante')query.where({status:'published'});const material=await query.first();if(!material?.storage_key)throw new ApiError(404,'not_found','Archivo no disponible.');const buffer=await readFile(storagePath(material.storage_key)).catch(()=>null);if(!buffer)throw new ApiError(404,'not_found','Archivo no disponible.');reply.header('Content-Type',material.mime_type).header('Content-Disposition',`attachment; filename="${safeFileName(material.title)}${material.kind==='pdf'?'.pdf':'.docx'}"`).header('Content-Length',buffer.length);return reply.send(buffer);});

  app.post<{Params:{id:string};Headers:{'x-file-name'?:string}}>('/api/v1/classrooms/:id/syllabus',{schema:{params:idParams}},async(request,reply)=>{const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const plan=await planFor(db,request.params.id);if(!plan)throw new ApiError(409,'planning_required','Configura primero la planificación del aula.');const body=request.body as Buffer;if(!Buffer.isBuffer(body)||!body.length||body.length>MAX_FILE||request.headers['content-type']!=='application/pdf'||body.subarray(0,5).toString()!=='%PDF-')throw new ApiError(400,'invalid_file','Selecciona un PDF válido de hasta 10 MB.');const key=await persist(body,'.pdf');let text='',status:'extracted'|'no_text'|'failed'='failed',errorCode:string|null=null;try{const document=await getDocument({data:new Uint8Array(body),useWorkerFetch:false,isEvalSupported:false,useSystemFonts:true}).promise;const pages:string[]=[];for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){const page=await document.getPage(pageNumber);const content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));}text=pages.join('\n\n').replace(/\s+/g,' ').trim();status=text.length>=40?'extracted':'no_text';if(status==='no_text')errorCode='PDF_NO_EXTRACTABLE_TEXT';}catch{status='failed';errorCode='PDF_EXTRACTION_FAILED';}const [source]=await db('syllabus_sources').insert({id:randomUUID(),plan_id:plan.id,classroom_id:request.params.id,original_name:safeFileName(request.headers['x-file-name']||'silabo.pdf'),storage_key:key,mime_type:'application/pdf',size_bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),extraction_status:status,extracted_text:text||null,error_code:errorCode,created_by:user.id}).returning('*');return reply.code(201).send({id:source.id,fileName:source.original_name,status:source.extraction_status,textLength:text.length,preview:text.slice(0,1200),aiConfigured:false,message:status==='no_text'?'El PDF no contiene texto extraíble. AULIGMA no ejecuta OCR en esta fase.':status==='failed'?'No fue posible extraer el contenido del PDF.':'Texto extraído localmente. Revisa el contenido antes de crear una propuesta.'});});

  app.get('/api/v1/planning/ai-status',async request=>{await teacher(request);const provider=configuredSyllabusProvider();return {configured:Boolean(provider),provider:provider?.name||null,model:provider?.model||null,requiresExplicitConsent:true,maxInputCharacters:MAX_AI_INPUT_CHARS,message:provider?'El proveedor está preparado. Cada envío requiere consentimiento docente explícito.':'No hay un proveedor de IA configurado. La revisión manual y la extracción local siguen disponibles.'};});
  app.post<{Params:{id:string;resourceId:string};Body:{externalProcessingConsent:boolean}}>('/api/v1/classrooms/:id/syllabus/:resourceId/propose',{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,required:['externalProcessingConsent'],properties:{externalProcessingConsent:{type:'boolean',const:true}}}}},async request=>{const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const source=await db('syllabus_sources').where({id:request.params.resourceId,classroom_id:request.params.id,created_by:user.id}).first();if(!source)throw new ApiError(404,'not_found','Sílabo no disponible.');if(source.extraction_status!=='extracted')throw new ApiError(409,'text_required','El sílabo no contiene texto suficiente para un análisis externo.');const provider=configuredSyllabusProvider();if(!provider)throw new ApiError(503,'ai_not_configured','No hay un proveedor de IA configurado. El documento no se enviará a terceros.');throw new ApiError(503,'ai_not_available','El proveedor todavía no ha sido autorizado para procesar documentos.');});
}
