import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { verifiedTestDatabase } from './test-database.ts';
import { readConfig } from '../config.ts';
import { authorizeIdentity } from '../identity.ts';
import { buildApp, hash } from '../app.ts';

// Solo contra una base de pruebas dedicada, nunca DATABASE_URL del producto.
const url = process.env.DATABASE_TEST_URL;
test('PostgreSQL real: matrículas institucionales, conciliación, aislamiento y revocación', { skip: !url && 'Falta DATABASE_TEST_URL: no se simula PostgreSQL' }, async () => {
  const db = await verifiedTestDatabase(url);
  try { await db.migrate.latest(); } catch (error) { await db.destroy(); throw error; }
  const tx = await db.transaction();
  const config = readConfig({ DATABASE_URL:url,ENABLE_PILOT_TEACHERS:'true',PILOT_TEACHER_EMAILS:'pilot@example.invalid,other-pilot@example.invalid' });
  const app = await buildApp(config,tx);
  const studentIdentity = {sub:randomUUID(),email:`${randomUUID()}@undc.edu.pe`,hd:'undc.edu.pe',firstNames:'Estudiante',lastNames:'Sintético'};
  const makeIdentity = (hd?:string) => ({...studentIdentity,sub:randomUUID(),email:`${randomUUID()}@example.invalid`,hd});
  try {
    assert.equal((await tx('professional_schools')).length,6);
    await assert.rejects(authorizeIdentity(tx,makeIdentity(),config));
    await assert.rejects(authorizeIdentity(tx,makeIdentity('other.invalid'),config));
    await assert.rejects(authorizeIdentity(tx,{...studentIdentity,sub:randomUUID(),hd:undefined},config));
    const student = await authorizeIdentity(tx,studentIdentity,config);
    assert.equal(student.role,'estudiante');
    assert.equal((await authorizeIdentity(tx,studentIdentity,config)).id,student.id);
    await assert.rejects(tx.transaction(async nested => { await nested('external_identities').insert({id:randomUUID(),user_id:student.id,provider:'google',subject:studentIdentity.sub}); }));
    const pilot = await authorizeIdentity(tx,{...makeIdentity(),email:'pilot@example.invalid'},config);
    assert.equal(pilot.role,'docente'); assert.notEqual(pilot.id,student.id);
    assert.equal((await tx('external_identities').whereIn('user_id',[student.id,pilot.id])).length,2);
    await assert.rejects(authorizeIdentity(tx,{...makeIdentity(),email:'pilot@example.invalid'},config));
    async function session(id:string,expired=false) {
      const token = randomBytes(32).toString('base64url');
      await tx('sessions').insert({token_hash:hash(token),user_id:id,csrf_token:'synthetic-csrf',expires_at:new Date(Date.now()+(expired ? -1000:60000))});
      return {cookie:`auligma_session=${token}`,origin:config.frontendUrl,'x-csrf-token':'synthetic-csrf'};
    }
    const headers = await session(student.id), teacherHeaders = await session(pilot.id);
    assert.equal((await app.inject({url:'/api/v1/me',headers})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/me',headers:await session(student.id,true)})).statusCode,401);
    const body = {firstNames:'Nombre nuevo',lastNames:'Sintético',phone:'',schoolId:4};
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/me',headers:{cookie:headers.cookie},payload:body})).statusCode,403);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/me',headers,payload:{...body,role:'docente'}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/me',headers,payload:body})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/me',headers})).json().user.firstNames,'Nombre nuevo');
    assert.deepEqual((await app.inject({url:'/api/v1/classrooms',headers})).json(),[]);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/subjects',headers,payload:{name:'Sintética'}})).statusCode,403);
    const subject = (await app.inject({method:'POST',url:'/api/v1/subjects',headers:teacherHeaders,payload:{name:`Asignatura ${randomUUID()}`}})).json();
    const created = await app.inject({method:'POST',url:'/api/v1/classrooms',headers:teacherHeaders,payload:{subjectId:subject.id,section:'A',period:'2099-I',shift:'Mañana'}});
    assert.equal(created.statusCode,201); const classroom = created.json();
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers})).statusCode,404);

    const preview = await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/enrollments/preview`,headers:teacherHeaders,payload:{input:` ${student.email.toUpperCase()} ; ${student.email}\ncorreo-invalido\nstudent@example.invalid`}});
    assert.equal(preview.statusCode,200);
    assert.deepEqual(preview.json().totals,{detected:4,valid:1,invalid:2,duplicates:1,alreadyEnrolled:0,revoked:0,willAuthorize:1});
    const imported = await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/enrollments`,headers:teacherHeaders,payload:{emails:[student.email]}});
    assert.equal(imported.statusCode,201); assert.equal(imported.json().authorized,1);
    const linked = await tx('enrollments').where({classroom_id:classroom.id,institutional_email:student.email}).first();
    assert.equal(linked.status,'active'); assert.equal(linked.student_user_id,student.id); assert.ok(linked.authorized_by); assert.ok(linked.linked_at);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers})).statusCode,200);
    const repeated = await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/enrollments`,headers:teacherHeaders,payload:{emails:[student.email]}});
    assert.equal(repeated.statusCode,200); assert.equal(repeated.json().authorized,0);

    const syntheticEmails = Array.from({length:45},(_,index) => `synthetic-${String(index+1).padStart(3,'0')}@undc.edu.pe`);
    const mass = await app.inject({method:'POST',url:`/api/v1/classrooms/${classroom.id}/enrollments`,headers:teacherHeaders,payload:{emails:syntheticEmails}});
    assert.equal(mass.statusCode,201); assert.equal(mass.json().authorized,45);
    assert.equal(Number((await tx('enrollments').where({classroom_id:classroom.id}).count('* as n').first())?.n),46);
    const pending = await tx('enrollments').where({classroom_id:classroom.id,status:'preauthorized'});
    assert.equal(pending.length,45); assert.ok(pending.every(item => item.student_user_id === null));

    const futureIdentity = {...studentIdentity,sub:randomUUID(),email:syntheticEmails[0]};
    const futureStudent = await authorizeIdentity(tx,futureIdentity,config);
    const reconciled = await tx('enrollments').where({classroom_id:classroom.id,institutional_email:futureIdentity.email}).first();
    assert.equal(reconciled.status,'active'); assert.equal(reconciled.student_user_id,futureStudent.id); assert.ok(reconciled.linked_at);
    await authorizeIdentity(tx,futureIdentity,config);
    assert.equal(Number((await tx('enrollments').where({classroom_id:classroom.id,institutional_email:futureIdentity.email}).count('* as n').first())?.n),1);

    const otherPilot = await authorizeIdentity(tx,{...makeIdentity(),email:'other-pilot@example.invalid'},config);
    const otherHeaders = await session(otherPilot.id);
    const otherSubject = (await app.inject({method:'POST',url:'/api/v1/subjects',headers:otherHeaders,payload:{name:`Otra ${randomUUID()}`}})).json();
    const otherClassroom = (await app.inject({method:'POST',url:'/api/v1/classrooms',headers:otherHeaders,payload:{subjectId:otherSubject.id,section:'B',period:'2099-I',shift:'Tarde'}})).json();
    assert.equal((await app.inject({url:`/api/v1/classrooms/${otherClassroom.id}/enrollments`,headers:teacherHeaders})).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/classrooms/${otherClassroom.id}/enrollments`,headers:teacherHeaders,payload:{emails:['idor@undc.edu.pe']}})).statusCode,404);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${otherClassroom.id}`,headers})).statusCode,404);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${otherClassroom.id}/lifecycle-impact`,headers:teacherHeaders})).statusCode,404);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${otherClassroom.id}`,headers:teacherHeaders,payload:{action:'archive',understood:true}})).statusCode,404);

    const request = await app.inject({method:'POST',url:`/api/v1/classrooms/${otherClassroom.id}/enrollment-requests`,headers});
    assert.equal(request.statusCode,201);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/classrooms/${otherClassroom.id}/enrollment-requests`,headers})).statusCode,409);
    const rejected = await app.inject({method:'PATCH',url:`/api/v1/classrooms/${otherClassroom.id}/enrollment-requests/${request.json().id}`,headers:otherHeaders,payload:{action:'reject'}});
    assert.equal(rejected.statusCode,200); assert.equal(rejected.json().status,'rejected');
    const renewedRequest = await app.inject({method:'POST',url:`/api/v1/classrooms/${otherClassroom.id}/enrollment-requests`,headers});
    assert.equal(renewedRequest.statusCode,201);
    const approved = await app.inject({method:'PATCH',url:`/api/v1/classrooms/${otherClassroom.id}/enrollment-requests/${renewedRequest.json().id}`,headers:otherHeaders,payload:{action:'approve'}});
    assert.equal(approved.statusCode,200); assert.equal(approved.json().status,'approved');
    assert.equal((await app.inject({url:`/api/v1/classrooms/${otherClassroom.id}`,headers})).statusCode,200);

    await assert.rejects(tx.transaction(async nested => { await nested('subjects').where({id:subject.id}).delete(); }));
    const revoked = await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/enrollments/${linked.id}`,headers:teacherHeaders,payload:{action:'revoke'}});
    assert.equal(revoked.statusCode,200); assert.equal(revoked.json().status,'revoked');
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers})).statusCode,404);
    const reauthorized = await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}/enrollments/${linked.id}`,headers:teacherHeaders,payload:{action:'reauthorize'}});
    assert.equal(reauthorized.statusCode,200); assert.equal(reauthorized.json().status,'active');
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers})).statusCode,200);
    const impact = await app.inject({url:`/api/v1/classrooms/${classroom.id}/lifecycle-impact`,headers:teacherHeaders});
    assert.equal(impact.statusCode,200); assert.equal(impact.json().students.total,46); assert.equal(impact.json().deletionStrategy,'logical');
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'archive'}})).statusCode,409);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'archive',understood:true}})).statusCode,200);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers})).statusCode,404);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'restore'}})).statusCode,200);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers})).statusCode,200);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'delete',understood:true,confirmationName:subject.name}})).statusCode,409);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'archive',understood:true}})).statusCode,200);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'delete',understood:true,confirmationName:'nombre incorrecto'}})).statusCode,409);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders,payload:{action:'delete',understood:true,confirmationName:subject.name}})).statusCode,200);
    assert.equal((await app.inject({url:`/api/v1/classrooms/${classroom.id}`,headers:teacherHeaders})).statusCode,404);
    assert.equal(Number((await tx('enrollments').where({classroom_id:classroom.id}).count('* as n').first())?.n),46);
    assert.equal(Number((await tx('audit_events').where({resource_id:classroom.id,action:'classroom.deleted'}).count('* as n').first())?.n),1);
    assert.ok(Number((await tx('audit_events').where({resource_id:classroom.id,action:'classroom.lifecycle_denied'}).count('* as n').first())?.n) >= 3);

    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/me',headers})).statusCode,401);
    const logoutAudit = await tx('audit_events').where({actor_id:student.id,action:'session.logout'}).count('* as n').first();
    assert.equal(Number(logoutAudit?.n ?? 0),1);
    await tx('teacher_authorizations').where({email:'pilot@example.invalid'}).update({approved:false});
    assert.equal((await app.inject({url:'/api/v1/me',headers:teacherHeaders})).statusCode,403);
  } finally { await app.close();await tx.rollback();await db.destroy(); }
});

test('PostgreSQL real: dos incorporaciones simultáneas son idempotentes', { skip: !url && 'Falta DATABASE_TEST_URL: no se simula PostgreSQL' }, async () => {
  const db=await verifiedTestDatabase(url);await db.migrate.latest();
  const config=readConfig({DATABASE_URL:url});const app=await buildApp(config,db);
  const teacherId=randomUUID(),subjectId=randomUUID(),classroomId=randomUUID(),identityId=randomUUID(),authorizationId=randomUUID();
  const teacherEmail=`teacher-${randomUUID()}@example.invalid`,subject=`Concurrente ${randomUUID()}`,token=randomBytes(32).toString('base64url');
  try {
    await db.transaction(async tx=>{
      await tx('users').insert({id:teacherId,email:teacherEmail,role:'docente'});
      await tx('teacher_profiles').insert({user_id:teacherId,first_names:'Docente',last_names:'Sintético'});
      await tx('external_identities').insert({id:identityId,user_id:teacherId,provider:'google',subject:identityId});
      await tx('teacher_authorizations').insert({id:authorizationId,email:teacherEmail,google_sub:identityId,kind:'institutional',evidence:'Prueba sintética de concurrencia'});
      await tx('subjects').insert({id:subjectId,teacher_id:teacherId,name:subject});
      await tx('classrooms').insert({id:classroomId,teacher_id:teacherId,subject_id:subjectId,section:'C',period:'2099-I',shift:'Tarde'});
      await tx('sessions').insert({token_hash:hash(token),user_id:teacherId,csrf_token:'concurrent-csrf',expires_at:new Date(Date.now()+60000)});
    });
    const headers={cookie:`auligma_session=${token}`,origin:config.frontendUrl,'x-csrf-token':'concurrent-csrf'};
    const responses=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:`/api/v1/classrooms/${classroomId}/enrollments`,headers,payload:{emails:['concurrent@undc.edu.pe']}})));
    assert.deepEqual(responses.map(response=>response.statusCode).sort(),[200,201]);
    assert.equal(responses.reduce((total,response)=>total+response.json().authorized,0),1);
    assert.equal(Number((await db('enrollments').where({classroom_id:classroomId,institutional_email:'concurrent@undc.edu.pe'}).count('* as n').first())?.n),1);
  } finally {
    await app.close();
    await db.transaction(async tx=>{
      await tx('audit_events').where({actor_id:teacherId}).delete();await tx('enrollment_requests').where({classroom_id:classroomId}).delete();
      await tx('enrollments').where({classroom_id:classroomId}).delete();await tx('sessions').where({user_id:teacherId}).delete();
      await tx('classrooms').where({id:classroomId}).delete();await tx('subjects').where({id:subjectId}).delete();
      await tx('teacher_authorizations').where({id:authorizationId}).delete();await tx('external_identities').where({id:identityId}).delete();
      await tx('teacher_profiles').where({user_id:teacherId}).delete();await tx('users').where({id:teacherId}).delete();
    });
    await db.destroy();
  }
});
