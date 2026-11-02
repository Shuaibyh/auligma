import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import { ApiError } from './identity.ts';
import type { Principal } from './enrollments.ts';
import { assertProposal, emptyProposal, orderedIncludedNodes, type ProposalNode, type SyllabusProposal } from './syllabus-ai.ts';

type Guard = (request: FastifyRequest) => Promise<Principal>;
const uuid={type:'string',format:'uuid'} as const;
const idParams={type:'object',additionalProperties:false,required:['id'],properties:{id:uuid}} as const;
const resourceParams={type:'object',additionalProperties:false,required:['id','resourceId'],properties:{id:uuid,resourceId:uuid}} as const;
const nodeSchema={type:'object',additionalProperties:false,required:['key','parentKey','type','title','description','startsOn','endsOn','included','sourcePage','evidence','warnings'],properties:{key:{type:'string',minLength:1,maxLength:80,pattern:'^[A-Za-z0-9_-]+$'},parentKey:{anyOf:[{type:'null'},{type:'string',minLength:1,maxLength:80}]},type:{type:'string',enum:['unit','week','module','topic','subtopic','milestone']},title:{type:'string',minLength:1,maxLength:200,pattern:'\\S'},description:{type:'string',maxLength:10000},startsOn:{anyOf:[{type:'null'},{type:'string',format:'date'}]},endsOn:{anyOf:[{type:'null'},{type:'string',format:'date'}]},included:{type:'boolean'},sourcePage:{anyOf:[{type:'null'},{type:'integer',minimum:1,maximum:10000}]},evidence:{type:'string',maxLength:1000},warnings:{type:'array',maxItems:20,items:{type:'string',maxLength:500}}}} as const;
const proposalSchema={type:'object',additionalProperties:false,required:['version','title','subjectName','competencies','notes','unresolved','nodes'],properties:{version:{type:'integer',const:1},title:{type:'string',minLength:1,maxLength:160,pattern:'\\S'},subjectName:{type:'string',maxLength:160},competencies:{type:'array',maxItems:100,items:{type:'string',maxLength:1000}},notes:{type:'string',maxLength:10000},unresolved:{type:'array',maxItems:100,items:{type:'string',maxLength:1000}},nodes:{type:'array',maxItems:500,items:nodeSchema}}} as const;

async function ownedClassroom(db:Knex,userId:string,classroomId:string) {
  const row=await db('classrooms as c').join('subjects as s','s.id','c.subject_id').where({'c.id':classroomId,'c.teacher_id':userId}).whereNull('c.archived_at').whereNull('c.deleted_at').whereNull('s.archived_at').select('c.id','c.section','c.period','s.name').first();
  if(!row)throw new ApiError(404,'not_found','Aula no disponible.');
  return row;
}
function counts(nodes:ProposalNode[]) {
  const result={units:0,weeks:0,modules:0,topics:0,subtopics:0,milestones:0,total:0};
  for(const node of nodes.filter(item=>item.included)){result.total++;if(node.type==='unit')result.units++;else if(node.type==='week')result.weeks++;else if(node.type==='module')result.modules++;else if(node.type==='topic')result.topics++;else if(node.type==='subtopic')result.subtopics++;else result.milestones++;}
  return result;
}
function publicProposal(row:Record<string,unknown>,source?:Record<string,unknown>) {
  return {id:row.id,sourceId:row.source_id,classroomId:row.classroom_id,provider:row.provider,status:row.status,payload:row.payload,createdAt:row.created_at,updatedAt:row.updated_at,appliedAt:row.applied_at,source:source?{id:source.id,fileName:source.original_name,status:source.extraction_status,text:source.extracted_text||'',externalConsent:Boolean(source.external_processing_accepted)}:undefined};
}

export function registerPlanningReviewRoutes(app:FastifyInstance,db:Knex,teacher:Guard) {
  app.get<{Params:{id:string}}>('/api/v1/classrooms/:id/planning/destinations',{schema:{params:idParams}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);
    const rows=await db('classrooms as c').join('subjects as s','s.id','c.subject_id').leftJoin('academic_plans as p','p.classroom_id','c.id').where('c.teacher_id',user.id).whereNot('c.id',request.params.id).whereNull('c.archived_at').whereNull('c.deleted_at').whereNull('s.archived_at').select('c.id','s.name','c.section','c.period','c.shift','p.id as plan_id').orderBy(['s.name','c.period','c.section']);
    return rows.map(row=>({id:row.id,name:row.name,section:row.section,period:row.period,shift:row.shift,hasPlanning:Boolean(row.plan_id),eligible:!row.plan_id}));
  });

  app.post<{Params:{id:string};Body:{targetClassroomId:string}}>('/api/v1/classrooms/:id/planning/duplicate-preview',{schema:{params:idParams,body:{type:'object',additionalProperties:false,required:['targetClassroomId'],properties:{targetClassroomId:uuid}}}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const target=await ownedClassroom(db,user.id,request.body.targetClassroomId);
    const source=await db('academic_plans').where({classroom_id:request.params.id}).first();if(!source)throw new ApiError(404,'not_found','Planificación de origen no disponible.');
    const existing=await db('academic_plans').where({classroom_id:target.id}).first();const grouped=await db('academic_nodes').where({plan_id:source.id}).whereNull('archived_at').groupBy('type').select('type').count<{type:string;count:string}[]>({count:'id'});
    const byType=Object.fromEntries(grouped.map(row=>[row.type,Number(row.count)]));
    return {target,conflict:Boolean(existing),canDuplicate:!existing,reason:existing?'El aula de destino ya tiene una planificación. No se sobrescribirá.':null,impact:{nodes:Object.values(byType).reduce((sum,value)=>sum+value,0),byType,materials:0,enrollments:0,results:0,status:'draft'}};
  });

  app.get<{Params:{id:string}}>('/api/v1/classrooms/:id/syllabus-sources',{schema:{params:idParams}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);
    const rows=await db('syllabus_sources').where({classroom_id:request.params.id}).orderBy('created_at','desc').select('id','original_name','extraction_status','extracted_text','external_processing_accepted','created_at');
    return rows.map(row=>({id:row.id,fileName:row.original_name,status:row.extraction_status,text:row.extracted_text||'',externalConsent:Boolean(row.external_processing_accepted),createdAt:row.created_at}));
  });

  app.post<{Params:{id:string;resourceId:string};Body:{title?:string}}>('/api/v1/classrooms/:id/syllabus/:resourceId/proposals/manual',{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,properties:{title:{type:'string',minLength:1,maxLength:160,pattern:'\\S'}}}}},async(request,reply)=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const source=await db('syllabus_sources').where({id:request.params.resourceId,classroom_id:request.params.id,created_by:user.id}).first();if(!source)throw new ApiError(404,'not_found','Sílabo no disponible.');if(source.extraction_status!=='extracted')throw new ApiError(409,'text_required','El sílabo necesita texto extraíble antes de crear una revisión.');
    const [created]=await db('planning_proposals').insert({id:randomUUID(),source_id:source.id,classroom_id:request.params.id,provider:'manual_extraction',status:'ready',payload:emptyProposal(request.body.title?.trim()||`Revisión de ${source.original_name}`),reviewed_by:user.id,reviewed_at:db.fn.now()}).returning('*');
    await db('audit_events').insert({id:randomUUID(),actor_id:user.id,action:'planning.proposal_created',resource_id:created.id,resource_type:'planning_proposal',details:{provider:'manual_extraction'}});
    return reply.code(201).send(publicProposal(created,source));
  });

  app.get<{Params:{id:string;resourceId:string}}>('/api/v1/classrooms/:id/planning-proposals/:resourceId',{schema:{params:resourceParams}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const row=await db('planning_proposals').where({id:request.params.resourceId,classroom_id:request.params.id}).first();if(!row)throw new ApiError(404,'not_found','Propuesta no disponible.');const source=await db('syllabus_sources').where({id:row.source_id}).first();return publicProposal(row,source);
  });

  app.patch<{Params:{id:string;resourceId:string};Body:SyllabusProposal}>('/api/v1/classrooms/:id/planning-proposals/:resourceId',{schema:{params:resourceParams,body:proposalSchema}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);try{assertProposal(request.body);}catch{throw new ApiError(400,'invalid_proposal','La propuesta contiene una jerarquía inválida.');}
    const [updated]=await db('planning_proposals').where({id:request.params.resourceId,classroom_id:request.params.id}).whereIn('status',['ready','approved']).update({payload:request.body,status:'ready',reviewed_by:user.id,reviewed_at:db.fn.now(),updated_at:db.fn.now()}).returning('*');if(!updated)throw new ApiError(409,'proposal_locked','La propuesta ya no admite cambios.');
    return publicProposal(updated);
  });

  app.get<{Params:{id:string;resourceId:string}}>('/api/v1/classrooms/:id/planning-proposals/:resourceId/impact',{schema:{params:resourceParams}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const row=await db('planning_proposals').where({id:request.params.resourceId,classroom_id:request.params.id}).first();if(!row)throw new ApiError(404,'not_found','Propuesta no disponible.');const current=await db('academic_nodes').where({classroom_id:request.params.id}).whereNull('archived_at').count<{count:string}[]>({count:'id'}).first();return {create:counts((row.payload as SyllabusProposal).nodes),modify:0,existing:Number(current?.count||0),publishes:0,warning:'La importación agregará borradores y no modificará ni publicará contenidos existentes.'};
  });

  app.post<{Params:{id:string;resourceId:string};Body:{confirmation:boolean}}>('/api/v1/classrooms/:id/planning-proposals/:resourceId/apply',{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,required:['confirmation'],properties:{confirmation:{type:'boolean',const:true}}}}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);
    return db.transaction(async tx=>{const proposal=await tx('planning_proposals').where({id:request.params.resourceId,classroom_id:request.params.id}).forUpdate().first();if(!proposal)throw new ApiError(404,'not_found','Propuesta no disponible.');if(proposal.status==='applied')throw new ApiError(409,'already_applied','Esta propuesta ya fue importada.');if(proposal.status!=='ready'&&proposal.status!=='approved')throw new ApiError(409,'proposal_locked','La propuesta no está lista para importar.');const payload=proposal.payload as SyllabusProposal;let included:ProposalNode[];try{assertProposal(payload);included=orderedIncludedNodes(payload);}catch{throw new ApiError(400,'invalid_proposal','La propuesta contiene una jerarquía inválida.');}const plan=await tx('academic_plans').where({classroom_id:request.params.id}).forUpdate().first();if(!plan)throw new ApiError(409,'planning_required','Configura primero la planificación del aula.');const includedKeys=new Set(included.map(item=>item.key));if(included.some(item=>item.parentKey&&!includedKeys.has(item.parentKey)))throw new ApiError(409,'invalid_proposal','Incluye también los contenedores de cada elemento seleccionado.');const keyToId=new Map<string,string>();let position=Number((await tx('academic_nodes').where({plan_id:plan.id,parent_id:null}).max('position as value').first())?.value||0)+1000;for(const node of included){const id=randomUUID();keyToId.set(node.key,id);await tx('academic_nodes').insert({id,plan_id:plan.id,classroom_id:request.params.id,parent_id:node.parentKey?keyToId.get(node.parentKey)||null:null,type:node.type,title:node.title.trim(),description:node.description.trim(),position,status:'draft',starts_on:node.startsOn,ends_on:node.endsOn,created_by:user.id,updated_by:user.id});position+=1000;}const [updated]=await tx('planning_proposals').where({id:proposal.id}).update({status:'applied',reviewed_by:user.id,reviewed_at:tx.fn.now(),applied_at:tx.fn.now(),updated_at:tx.fn.now()}).returning('*');await tx('audit_events').insert({id:randomUUID(),actor_id:user.id,action:'planning.proposal_applied',resource_id:proposal.id,resource_type:'planning_proposal',details:{createdNodes:included.length,publishedNodes:0}});return {proposal:publicProposal(updated),impact:counts(included)};});
  });

  app.post<{Params:{id:string;resourceId:string};Body:{confirmation:boolean}}>('/api/v1/classrooms/:id/planning-proposals/:resourceId/discard',{schema:{params:resourceParams,body:{type:'object',additionalProperties:false,required:['confirmation'],properties:{confirmation:{type:'boolean',const:true}}}}},async request=>{
    const user=await teacher(request);await ownedClassroom(db,user.id,request.params.id);const [updated]=await db('planning_proposals').where({id:request.params.resourceId,classroom_id:request.params.id}).whereIn('status',['pending','ready','failed','approved']).update({status:'discarded',reviewed_by:user.id,reviewed_at:db.fn.now(),updated_at:db.fn.now()}).returning('*');if(!updated)throw new ApiError(409,'proposal_locked','La propuesta ya no puede descartarse.');await db('audit_events').insert({id:randomUUID(),actor_id:user.id,action:'planning.proposal_discarded',resource_id:updated.id,resource_type:'planning_proposal'});return publicProposal(updated);
  });
}
