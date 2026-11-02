import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase } from '../db.ts';
import { readConfig } from '../config.ts';
import { authorizeIdentity } from '../identity.ts';
import { buildApp, hash } from '../app.ts';

const url=process.env.DATABASE_TEST_URL;
function createPdf(text=''){
  const escaped=text.replace(/([\\()])/g,'\\$1');
  const stream=`BT /F1 10 Tf 40 160 Td (${escaped}) Tj ET`;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((body,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${body}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const blankPdf=createPdf();

test('PostgreSQL real: planificación jerárquica, publicación, materiales y permisos',{skip:!url&&'Falta DATABASE_TEST_URL',timeout:15000},async()=>{
  const db=createDatabase(url);await db.migrate.latest();const tx=await db.transaction();
  const config=readConfig({DATABASE_URL:url,ENABLE_PILOT_TEACHERS:'true',PILOT_TEACHER_EMAILS:'planning-pilot@example.invalid'});const app=await buildApp(config,tx);
  try{
    const teacher=await authorizeIdentity(tx,{sub:randomUUID(),email:'planning-pilot@example.invalid',firstNames:'Docente',lastNames:'Sintético'},config);
    const student=await authorizeIdentity(tx,{sub:randomUUID(),email:`${randomUUID()}@undc.edu.pe`,hd:'undc.edu.pe',firstNames:'Estudiante',lastNames:'Sintético'},config);
    async function session(id:string){const token=randomBytes(32).toString('base64url');await tx('sessions').insert({token_hash:hash(token),user_id:id,csrf_token:'planning-csrf',expires_at:new Date(Date.now()+60000)});return{cookie:`auligma_session=${token}`,origin:config.frontendUrl,'x-csrf-token':'planning-csrf'};}
    const teacherHeaders=await session(teacher.id),studentHeaders=await session(student.id);
    const subject=(await app.inject({method:'POST',url:'/api/v1/subjects',headers:teacherHeaders,payload:{name:'Planificación sintética'}})).json();
    const classroom=(await app.inject({method:'POST',url:'/api/v1/classrooms',headers:teacherHeaders,payload:{subjectId:subject.id,section:'P1',period:'2099-I',shift:'Mañana'}})).json();
    const target=(await app.inject({method:'POST',url:'/api/v1/classrooms',headers:teacherHeaders,payload:{subjectId:subject.id,section:'P2',period:'2099-I',shift:'Tarde'}})).json();
    const reviewTarget=(await app.inject({method:'POST',url:'/api/v1/classrooms',headers:teacherHeaders,payload:{subjectId:subject.id,section:'P3',period:'2099-I',shift:'Noche'}})).json();
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}/planning`,headers:studentHeaders})).statusCode,404);
    const plan=await app.inject({method:'PUT',url:`/api/v1/classrooms/${classroom.id}/planning`,headers:teacherHeaders,payload:{title:'Plan sintético',weekCount:18}});assert.equal(plan.statusCode,201);
    async function node(type:string,title:string,parentId:null|string=null,unitIds?:string[]){const response=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning/nodes`,headers:teacherHeaders,payload:{type,title,parentId,unitIds}});assert.equal(response.statusCode,201,response.body);return response.json();}
    const unit=await node('unit','Unidad sintética');const week=await node('week','Semana sintética',null,[unit.id]);const topic=await node('topic','Tema sintético',week.id);const subtopic=await node('subtopic','Subtema sintético',topic.id);const module=await node('module','Módulo sintético',subtopic.id);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/planning/nodes/${week.id}`,headers:teacherHeaders,payload:{parentId:module.id}})).statusCode,409);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/planning/nodes/${topic.id}`,headers:teacherHeaders,payload:{direction:'up'}})).statusCode,200);
    for(const item of [unit,week,topic])assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/planning/nodes/${item.id}`,headers:teacherHeaders,payload:{action:'publish'}})).statusCode,200);
    const note=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning/nodes/${topic.id}/materials`,headers:teacherHeaders,payload:{kind:'note',title:'Apunte sintético',textContent:'Contenido académico sintético.'}});assert.equal(note.statusCode,201);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/materials/${note.json().id}`,headers:teacherHeaders,payload:{action:'publish'}})).statusCode,200);
    const file=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning/nodes/${topic.id}/materials/file`,headers:{...teacherHeaders,'content-type':'application/pdf','x-file-name':'material.pdf','x-material-title':'Material sintético'},payload:blankPdf});assert.equal(file.statusCode,201,file.body);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/materials/${file.json().id}`,headers:teacherHeaders,payload:{action:'publish'}})).statusCode,200);
    await tx('enrollments').insert({id:randomUUID(),classroom_id:classroom.id,institutional_email:student.email,student_user_id:student.id,status:'active',authorized_by:teacher.id,authorized_at:tx.fn.now(),linked_at:tx.fn.now()});
    const visible=await app.inject({url:`/api/v1/classrooms/${classroom.id}/planning`,headers:studentHeaders});assert.equal(visible.statusCode,200);assert.equal(visible.json().nodes.length,3);assert.ok(!visible.json().nodes.some((item:{id:string})=>item.id===subtopic.id));assert.equal(visible.json().materials.length,2);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}/materials/${file.json().id}/download`,headers:studentHeaders})).statusCode,200);
    const previewDuplicate=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning/duplicate-preview`,headers:teacherHeaders,payload:{targetClassroomId:target.id}});assert.equal(previewDuplicate.statusCode,200,previewDuplicate.body);assert.equal(previewDuplicate.json().canDuplicate,true);assert.equal(previewDuplicate.json().impact.enrollments,0);
    const destinations=await app.inject({url:`/api/v1/classrooms/${classroom.id}/planning/destinations`,headers:teacherHeaders});assert.equal(destinations.statusCode,200);assert.ok(destinations.json().some((item:{id:string;eligible:boolean})=>item.id===target.id&&item.eligible));
    const duplicate=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning/duplicate`,headers:teacherHeaders,payload:{targetClassroomId:target.id}});assert.equal(duplicate.statusCode,201,duplicate.body);assert.equal(Number((await tx('enrollments').where({classroom_id:target.id}).count('* as n').first())?.n),0);assert.ok((await tx('academic_nodes').where({plan_id:duplicate.json().id})).every(row=>row.status==='draft'));
    assert.equal((await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/syllabus`,headers:{...teacherHeaders,'content-type':'application/pdf','x-file-name':'invalido.pdf'},payload:Buffer.from('no es pdf')})).statusCode,400);
    const emptySyllabus=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/syllabus`,headers:{...teacherHeaders,'content-type':'application/pdf','x-file-name':'vacio.pdf'},payload:blankPdf});assert.equal(emptySyllabus.statusCode,201,emptySyllabus.body);assert.equal(emptySyllabus.json().status,'no_text');
    const syllabus=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/syllabus`,headers:{...teacherHeaders,'content-type':'application/pdf','x-file-name':'silabo.pdf'},payload:createPdf('Silabo sintetico: Unidad 1, Semana 1, Algebra lineal.')});assert.equal(syllabus.statusCode,201,syllabus.body);assert.equal(syllabus.json().status,'extracted');assert.match(syllabus.json().preview,/Algebra lineal/);
    const manual=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/syllabus/${syllabus.json().id}/proposals/manual`,headers:teacherHeaders,payload:{title:'Revisión sintética'}});assert.equal(manual.statusCode,201,manual.body);const proposalId=manual.json().id;
    const invalidPayload={version:1,title:'Inválida',subjectName:'',competencies:[],notes:'',unresolved:[],nodes:[{key:'a',parentKey:'b',type:'unit',title:'A',description:'',startsOn:null,endsOn:null,included:true,sourcePage:1,evidence:'Página sintética',warnings:[]},{key:'b',parentKey:'a',type:'week',title:'B',description:'',startsOn:null,endsOn:null,included:true,sourcePage:1,evidence:'Página sintética',warnings:[]}]};
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/planning-proposals/${proposalId}`,headers:teacherHeaders,payload:invalidPayload})).statusCode,400);
    const validPayload={...invalidPayload,title:'Revisión válida',nodes:[{...invalidPayload.nodes[1],key:'week-1',parentKey:'unit-1',title:'Semana propuesta',type:'week'},{...invalidPayload.nodes[0],key:'unit-1',parentKey:null,title:'Unidad propuesta',type:'unit'}]};
    const saved=await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/planning-proposals/${proposalId}`,headers:teacherHeaders,payload:validPayload});assert.equal(saved.statusCode,200,saved.body);
    const impact=await app.inject({url:`/api/v1/classrooms/${classroom.id}/planning-proposals/${proposalId}/impact`,headers:teacherHeaders});assert.equal(impact.statusCode,200);assert.equal(impact.json().create.total,2);assert.equal(impact.json().publishes,0);
    const applied=await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning-proposals/${proposalId}/apply`,headers:teacherHeaders,payload:{confirmation:true}});assert.equal(applied.statusCode,200,applied.body);assert.equal(applied.json().impact.total,2);assert.equal((await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/planning-proposals/${proposalId}/apply`,headers:teacherHeaders,payload:{confirmation:true}})).statusCode,409);assert.equal((await tx('academic_nodes').whereIn('title',['Unidad propuesta','Semana propuesta']).whereNot({status:'draft'})).length,0);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/classrooms/${reviewTarget.id}/planning/duplicate-preview`,headers:teacherHeaders,payload:{targetClassroomId:classroom.id}})).statusCode,404);
    assert.equal((await app.inject({url:'/api/v1/planning/ai-status',headers:teacherHeaders})).json().configured,false);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/syllabus/${syllabus.json().id}/propose`,headers:teacherHeaders,payload:{externalProcessingConsent:true}})).statusCode,503);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'archive',understood:true}})).statusCode,200);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}/planning`,headers:studentHeaders})).statusCode,404);
  }finally{const keys:string[]=[];try{keys.push(...await tx('academic_materials').whereNotNull('storage_key').pluck('storage_key'));keys.push(...await tx('syllabus_sources').pluck('storage_key'));}catch{/* Una transacción abortada no permite consultar claves; el rollback sigue siendo obligatorio. */}for(const key of keys)await unlink(path.resolve('.auligma-data','private',key)).catch(()=>{});await app.close();await tx.rollback();await db.destroy();}
});
