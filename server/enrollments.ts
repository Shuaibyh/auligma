import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import { ApiError } from './identity.ts';

export type Principal = {
  id: string;
  email: string;
  role: 'docente' | 'estudiante';
  csrf_token: string;
  token_hash: string;
};

type Guard = (request: FastifyRequest) => Promise<Principal>;
type PreviewStatus = 'valid' | 'invalid' | 'duplicate' | 'already_enrolled' | 'revoked';
export type EnrollmentPreviewItem = {
  input: string;
  email: string;
  status: PreviewStatus;
  selected: boolean;
  message: string;
};

const uuid = { type: 'string', format: 'uuid' } as const;
const paramsWithClassroom = {
  type: 'object', additionalProperties: false, required: ['id'], properties: { id: uuid },
} as const;
const paramsWithEnrollment = {
  type: 'object', additionalProperties: false, required: ['id','enrollmentId'],
  properties: { id: uuid, enrollmentId: uuid },
} as const;
const paramsWithRequest = {
  type: 'object', additionalProperties: false, required: ['id','requestId'],
  properties: { id: uuid, requestId: uuid },
} as const;

export function normalizeInstitutionalEmail(input: string) {
  return input.trim().toLowerCase();
}

export function isInstitutionalEmail(email: string) {
  return email.length <= 254 && /^[a-z0-9][a-z0-9._%+-]{0,63}@undc\.edu\.pe$/.test(email);
}

export function splitEmailInput(input: string) {
  return input.split(/[\n,;]/).map(value => value.trim()).filter(Boolean);
}

async function ownedClassroom(db: Knex, teacherId: string, classroomId: string, includeArchived = true) {
  const query = db('classrooms as c').join('subjects as s','s.id','c.subject_id')
    .where({ 'c.id': classroomId, 'c.teacher_id': teacherId })
    .whereNull('c.deleted_at')
    .select('c.*','s.name as subject_name');
  if (!includeArchived) query.whereNull('c.archived_at').whereNull('s.archived_at');
  const classroom = await query.first();
  if (!classroom) throw new ApiError(404,'not_found','Aula no disponible.');
  return classroom;
}

async function preview(db: Knex, classroomId: string, values: string[]): Promise<EnrollmentPreviewItem[]> {
  const normalized = values.map(normalizeInstitutionalEmail);
  const validEmails = [...new Set(normalized.filter(isInstitutionalEmail))];
  const existing = validEmails.length
    ? await db('enrollments').where({ classroom_id: classroomId }).whereIn('institutional_email',validEmails)
      .select('institutional_email','status') as { institutional_email: string; status: string }[]
    : [];
  const existingByEmail = new Map(existing.map(row => [row.institutional_email,row.status]));
  const seen = new Set<string>();
  return values.map((input,index) => {
    const email = normalized[index];
    if (!isInstitutionalEmail(email)) return { input,email,status:'invalid',selected:false,message:'Usa un correo institucional @undc.edu.pe válido.' };
    if (seen.has(email)) return { input,email,status:'duplicate',selected:false,message:'Dirección repetida en esta lista.' };
    seen.add(email);
    const current = existingByEmail.get(email);
    if (current === 'revoked') return { input,email,status:'revoked',selected:false,message:'La matrícula fue revocada. Reautorízala desde la nómina.' };
    if (current) return { input,email,status:'already_enrolled',selected:false,message:'Este correo ya está matriculado.' };
    return { input,email,status:'valid',selected:true,message:'Listo para autorizar.' };
  });
}

export async function reconcileInstitutionalEnrollments(tx: Knex.Transaction, user: { id: string; email: string; role: string }) {
  if (user.role !== 'estudiante') return 0;
  const rows = await tx('enrollments').where({ institutional_email: user.email, status: 'preauthorized' }).forUpdate().select('id');
  if (!rows.length) return 0;
  await tx('enrollments').whereIn('id',rows.map(row => row.id)).update({
    student_user_id: user.id, status: 'active', linked_at: tx.fn.now(), updated_at: tx.fn.now(), revoked_at: null,
  });
  return rows.length;
}

export function registerEnrollmentRoutes(app: FastifyInstance, db: Knex, principal: Guard, teacher: Guard) {
  app.post<{ Params: { id: string }; Body: { input: string } }>('/api/v1/classrooms/:id/enrollments/preview', {
    schema: { params: paramsWithClassroom, body: { type:'object',additionalProperties:false,required:['input'],properties:{input:{type:'string',minLength:1,maxLength:50000}} } },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async request => {
    const user = await teacher(request);
    await ownedClassroom(db,user.id,request.params.id,false);
    const values = splitEmailInput(request.body.input);
    if (!values.length) throw new ApiError(400,'invalid_input','Ingresa al menos un correo institucional.');
    if (values.length > 500) throw new ApiError(400,'invalid_input','Puedes revisar hasta 500 correos por operación.');
    const items = await preview(db,request.params.id,values);
    return { items, totals: summarize(items) };
  });

  app.post<{ Params: { id: string }; Body: { emails: string[] } }>('/api/v1/classrooms/:id/enrollments', {
    schema: { params: paramsWithClassroom, body: { type:'object',additionalProperties:false,required:['emails'],properties:{emails:{type:'array',minItems:1,maxItems:500,uniqueItems:true,items:{type:'string',minLength:1,maxLength:254}}} } },
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (request,reply) => {
    const user = await teacher(request);
    const result = await db.transaction(async tx => {
      await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[request.params.id]);
      await ownedClassroom(tx,user.id,request.params.id,false);
      const values = request.body.emails.map(normalizeInstitutionalEmail);
      const items = await preview(tx,request.params.id,values);
      const accepted = items.filter(item => item.status === 'valid');
      const created: {id:string;status:'active'|'preauthorized'}[] = [];
      for (const item of accepted) {
        const institutionalUser = await tx('users as u').join('external_identities as x','x.user_id','u.id')
          .where({ 'u.email': item.email, 'u.role':'estudiante', 'u.active':true, 'x.provider':'google', 'x.hosted_domain':'undc.edu.pe' })
          .select('u.id').first();
        const id = randomUUID();
        await tx('enrollments').insert({ id, classroom_id:request.params.id, institutional_email:item.email,
          student_user_id:institutionalUser?.id ?? null, status:institutionalUser ? 'active' : 'preauthorized',
          authorized_by:user.id, authorized_at:tx.fn.now(), linked_at:institutionalUser ? tx.fn.now() : null });
        created.push({id,status:institutionalUser ? 'active':'preauthorized'});
      }
      if (created.length) await tx('audit_events').insert([
        ...created.map(item => ({id:randomUUID(),actor_id:user.id,action:'enrollment.authorized',resource_id:item.id,resource_type:'enrollment',details:{classroomId:request.params.id,status:item.status}})),
        {id:randomUUID(),actor_id:user.id,action:'enrollment.bulk_authorized',resource_id:request.params.id,resource_type:'classroom',details:{authorized:created.length,skipped:items.length-created.length}},
      ]);
      return { authorized:created.length, skipped:items.length-created.length, items, enrollmentIds:created.map(item => item.id) };
    });
    return reply.code(result.authorized ? 201 : 200).send(result);
  });

  app.get<{ Params: { id: string } }>('/api/v1/classrooms/:id/enrollments', { schema:{params:paramsWithClassroom} }, async request => {
    const user = await teacher(request);
    await ownedClassroom(db,user.id,request.params.id);
    const rows = await db('enrollments as e').leftJoin('student_profiles as p','p.user_id','e.student_user_id')
      .where({ 'e.classroom_id':request.params.id })
      .select('e.id','e.institutional_email as email','e.status','e.authorized_at','e.linked_at','e.revoked_at','p.first_names','p.last_names')
      .orderByRaw("CASE e.status WHEN 'active' THEN 1 WHEN 'preauthorized' THEN 2 ELSE 3 END, e.institutional_email");
    return rows.map(row => ({ id:row.id,email:row.email,status:row.status,authorizedAt:row.authorized_at,linkedAt:row.linked_at,revokedAt:row.revoked_at,
      firstNames:row.first_names || '',lastNames:row.last_names || '' }));
  });

  app.patch<{ Params: { id: string; enrollmentId: string }; Body: { action: 'revoke' | 'reauthorize' } }>('/api/v1/classrooms/:id/enrollments/:enrollmentId', {
    schema:{params:paramsWithEnrollment,body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['revoke','reauthorize']}}}},
  }, async request => {
    const user = await teacher(request);
    const updated = await db.transaction(async tx => {
      await ownedClassroom(tx,user.id,request.params.id);
      const enrollment = await tx('enrollments').where({id:request.params.enrollmentId,classroom_id:request.params.id}).forUpdate().first();
      if (!enrollment) throw new ApiError(404,'not_found','Matrícula no disponible.');
      if (request.body.action === 'revoke') {
        if (enrollment.status !== 'revoked') await tx('enrollments').where({id:enrollment.id}).update({status:'revoked',revoked_at:tx.fn.now(),updated_at:tx.fn.now()});
      } else {
        if (enrollment.status !== 'revoked') throw new ApiError(409,'conflict','La matrícula ya está autorizada.');
        await tx('enrollments').where({id:enrollment.id}).update({status:enrollment.student_user_id ? 'active':'preauthorized',revoked_at:null,
          linked_at:enrollment.student_user_id ? enrollment.linked_at || tx.fn.now() : null,authorized_by:user.id,authorized_at:tx.fn.now(),updated_at:tx.fn.now()});
      }
      await tx('audit_events').insert({id:randomUUID(),actor_id:user.id,action:`enrollment.${request.body.action}`,resource_id:enrollment.id,
        resource_type:'enrollment',details:{classroomId:request.params.id}});
      return tx('enrollments').where({id:enrollment.id}).select('id','status','revoked_at').first();
    });
    return updated;
  });

  app.post<{ Params: { id: string } }>('/api/v1/classrooms/:id/enrollment-requests', { schema:{params:paramsWithClassroom} }, async (request,reply) => {
    const user = await principal(request);
    if (user.role !== 'estudiante') throw new ApiError(403,'forbidden','Esta acción requiere una cuenta estudiantil.');
    const classroom = await db('classrooms').where({id:request.params.id}).whereNull('archived_at').whereNull('deleted_at').first();
    if (!classroom) throw new ApiError(404,'not_found','Aula no disponible.');
    if (await db('enrollments').where({classroom_id:classroom.id,institutional_email:user.email}).whereIn('status',['active','preauthorized']).first())
      throw new ApiError(409,'conflict','Ya tienes una matrícula autorizada para esta aula.');
    const row = await db.transaction(async tx => {
      await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[`${classroom.id}:${user.id}`]);
      const existing = await tx('enrollment_requests').where({classroom_id:classroom.id,student_user_id:user.id}).forUpdate().first();
      if (existing?.status === 'pending') throw new ApiError(409,'conflict','Ya existe una solicitud pendiente.');
      if (existing) {
        const [renewed] = await tx('enrollment_requests').where({id:existing.id}).update({status:'pending',requested_at:tx.fn.now(),resolved_at:null,resolved_by:null}).returning(['id','status','requested_at']);
        return renewed;
      }
      const [created] = await tx('enrollment_requests').insert({id:randomUUID(),classroom_id:classroom.id,student_user_id:user.id,institutional_email:user.email,status:'pending'}).returning(['id','status','requested_at']);
      return created;
    });
    return reply.code(201).send(row);
  });

  app.get<{ Params: { id: string } }>('/api/v1/classrooms/:id/enrollment-requests', { schema:{params:paramsWithClassroom} }, async request => {
    const user = await teacher(request); await ownedClassroom(db,user.id,request.params.id);
    return db('enrollment_requests as r').leftJoin('student_profiles as p','p.user_id','r.student_user_id')
      .where({'r.classroom_id':request.params.id}).select('r.id','r.institutional_email as email','r.status','r.requested_at','r.resolved_at','p.first_names','p.last_names')
      .orderBy('r.requested_at','desc');
  });

  app.patch<{ Params: { id: string; requestId: string }; Body: { action: 'approve' | 'reject' } }>('/api/v1/classrooms/:id/enrollment-requests/:requestId', {
    schema:{params:paramsWithRequest,body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['approve','reject']}}}},
  }, async request => {
    const user = await teacher(request);
    return db.transaction(async tx => {
      await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[request.params.id]);
      await ownedClassroom(tx,user.id,request.params.id,false);
      const enrollmentRequest = await tx('enrollment_requests').where({id:request.params.requestId,classroom_id:request.params.id,status:'pending'}).forUpdate().first();
      if (!enrollmentRequest) throw new ApiError(404,'not_found','Solicitud pendiente no disponible.');
      if (request.body.action === 'approve') {
        const existing = await tx('enrollments').where({classroom_id:request.params.id,institutional_email:enrollmentRequest.institutional_email}).forUpdate().first();
        if (existing?.status === 'revoked') await tx('enrollments').where({id:existing.id}).update({status:'active',student_user_id:enrollmentRequest.student_user_id,revoked_at:null,linked_at:tx.fn.now(),authorized_by:user.id,authorized_at:tx.fn.now(),updated_at:tx.fn.now()});
        else if (!existing) await tx('enrollments').insert({id:randomUUID(),classroom_id:request.params.id,student_user_id:enrollmentRequest.student_user_id,
          institutional_email:enrollmentRequest.institutional_email,status:'active',authorized_by:user.id,authorized_at:tx.fn.now(),linked_at:tx.fn.now()});
      }
      const status = request.body.action === 'approve' ? 'approved' : 'rejected';
      const [resolved] = await tx('enrollment_requests').where({id:enrollmentRequest.id}).update({status,resolved_at:tx.fn.now(),resolved_by:user.id}).returning(['id','status','resolved_at']);
      await tx('audit_events').insert({id:randomUUID(),actor_id:user.id,action:`enrollment_request.${status}`,resource_id:enrollmentRequest.id,
        resource_type:'enrollment_request',details:{classroomId:request.params.id}});
      return resolved;
    });
  });
}

function summarize(items: EnrollmentPreviewItem[]) {
  const count = (status: PreviewStatus) => items.filter(item => item.status === status).length;
  return { detected:items.length,valid:count('valid'),invalid:count('invalid'),duplicates:count('duplicate'),alreadyEnrolled:count('already_enrolled'),revoked:count('revoked'),willAuthorize:count('valid') };
}
