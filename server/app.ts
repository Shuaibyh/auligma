import Fastify, { LogController, type FastifyRequest, type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Knex } from 'knex';
import type { Config } from './config.ts';
import { exchangeGoogle, OAuthDiagnosticError } from './google.ts';
import { ApiError, authorizeIdentity } from './identity.ts';
import { registerEnrollmentRoutes, type Principal } from './enrollments.ts';
import { registerPlanningRoutes } from './planning.ts';
import { registerPlanningReviewRoutes } from './planning-review.ts';
import { registerAssessmentRoutes } from './assessments.ts';
import { registerAttemptRoutes } from './attempts.ts';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const object = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
export async function buildApp(config: Config, db: Knex, exchange = exchangeGoogle) {
  const app = Fastify({ logger: { level: 'info', serializers: { req: req => ({ method: req.method }), res: res => ({ statusCode: res.statusCode }) } },
    logController: new LogController({ disableRequestLogging: true }), bodyLimit: 10 * 1024 * 1024 + 1024, ajv: { customOptions: { removeAdditional: false } } });
  await app.register(cookie);
  await app.register(cors, { origin: config.frontendUrl, credentials: true, methods: ['GET','POST','PATCH'] });
  await app.register(helmet, { referrerPolicy: { policy: 'no-referrer' } });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const cookieName = config.production ? '__Host-auligma' : 'auligma_session';
  const options = { httpOnly: true, secure: config.production || config.backendUrl.startsWith('https:'), sameSite: 'lax' as const, path: '/' };
  const configured = Boolean(config.clientId && config.clientSecret && config.databaseUrl);
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof ApiError;
    const failure = error as FastifyError;
    const status = known ? error.statusCode : failure.validation ? 400 : failure.code === '23505' ? 409 : failure.statusCode === 429 ? 429 : 503;
    if (status === 503) app.log.error({ event: 'service_unavailable' }, 'No se pudo completar una operación');
    reply.code(status).send({ error: { code: known ? error.code : status === 400 ? 'invalid_input' : status === 409 ? 'conflict' : status === 429 ? 'rate_limited' : 'service_unavailable',
      message: known ? error.message : status === 400 ? 'Revisa los campos enviados.' : status === 409 ? 'Ya existe un registro con estos datos.' : status === 429 ? 'Espera un momento antes de volver a intentar.' : 'El servicio no está disponible. Inténtalo nuevamente.' } });
  });
  async function principal(request: FastifyRequest): Promise<Principal> {
    const token = request.cookies[cookieName];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401,'session_expired','Inicia sesión para continuar.');
    if (!config.databaseUrl) throw new ApiError(503,'service_unavailable','El servicio no está disponible. Inténtalo nuevamente.');
    const user = await db('sessions as s').join('users as u','s.user_id','u.id')
      .where({ 's.token_hash': hash(token), 'u.active': true }).where('s.expires_at','>',new Date())
      .select('u.id','u.email','u.role','s.csrf_token','s.token_hash').first() as Principal | undefined;
    if (!user) throw new ApiError(401,'session_expired','Tu sesión terminó. Vuelve a iniciar sesión.');
    if (user.role === 'docente') {
      const external = await db('external_identities').where({ user_id: user.id }).first();
      const auth = await db('teacher_authorizations').where({ google_sub: external?.subject, approved: true }).whereNull('revoked_at').first();
      if (!auth || (auth.kind === 'pilot' && (!config.pilotEnabled || !config.pilotEmails.includes(user.email)))) {
        await db('sessions').where({ user_id: user.id }).delete();
        throw new ApiError(403,'account_not_authorized','Tu autorización docente ya no está activa.');
      }
    }
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const csrf = request.headers['x-csrf-token'];
      if (request.headers.origin !== config.frontendUrl || typeof csrf !== 'string' || !equal(csrf,user.csrf_token)) throw new ApiError(403,'csrf_rejected','Recarga la página antes de continuar.');
    }
    return user;
  }
  async function profile(user: Principal | { id: string; role: string; email: string }) {
    const row = await db(user.role === 'docente' ? 'teacher_profiles' : 'student_profiles').where({ user_id: user.id }).first();
    return { id: user.id, role: user.role, email: user.email, firstNames: row.first_names, lastNames: row.last_names,
      phone: row.phone, photo: row.photo, schoolId: row.school_id ?? null, universityCode: row.university_code ?? null,
      professionalInfo: row.professional_info ?? '', profileComplete: Boolean(row.first_names.trim().length >= 2 && row.last_names.trim().length >= 2 && (user.role === 'docente' || row.school_id)) };
  }
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  app.get('/api/v1/auth/config', async () => ({ googleConfigured: configured }));
  app.get('/api/v1/auth/google/start', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_request, reply) => {
    if (!configured) return reply.redirect(`${config.frontendUrl}/login?error=google_not_configured`);
    const state = random(), nonce = random(), verifier = random(), browser = random();
    try {
      await db('oauth_attempts').where('expires_at','<',new Date()).delete();
      await db('oauth_attempts').insert({ state_hash: hash(state), browser_hash: hash(browser), nonce, verifier, expires_at: new Date(Date.now()+600000) });
    } catch { return reply.redirect(`${config.frontendUrl}/login?error=backend_unavailable`); }
    reply.setCookie('auligma_oauth', browser, { ...options, maxAge: 600 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callbackUrl, response_type: 'code',
      scope: 'openid email profile', state, nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), prompt: 'select_account' }).toString();
    return reply.redirect(url.href);
  });
  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>('/api/v1/auth/google/callback', {
    schema: { querystring: { type: 'object', properties: { state: text(256), code: text(4096), error: text(100) } } },
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const correlationId = randomUUID();
    let databaseReached = false, identityPersisted = false, sessionCreated = false;
    reply.clearCookie('auligma_oauth', options);
    try {
      if (!configured) throw new OAuthDiagnosticError('CALLBACK_CONFIGURATION', 'OAUTH_NOT_CONFIGURED');
      if (!request.query.state || !request.cookies.auligma_oauth) throw new OAuthDiagnosticError('CALLBACK_CORRELATION', 'OAUTH_CORRELATION_MISSING');
      let attempt;
      try {
        [attempt] = await db('oauth_attempts').where({ state_hash: hash(request.query.state), browser_hash: hash(request.cookies.auligma_oauth) })
          .where('expires_at','>',new Date()).delete().returning('*');
        databaseReached = true;
      } catch {
        throw new OAuthDiagnosticError('OAUTH_ATTEMPT', 'OAUTH_ATTEMPT_READ_FAILED');
      }
      if (!attempt) throw new OAuthDiagnosticError('CALLBACK_CORRELATION', 'OAUTH_CORRELATION_INVALID');
      if (request.query.error === 'access_denied') {
        app.log.info({ event: 'oauth_cancelled', correlationId }, 'OAuth cancelado por el usuario');
        return reply.redirect(`${config.frontendUrl}/login?error=cancelled`);
      }
      if (!request.query.code || request.query.error) throw new OAuthDiagnosticError('CALLBACK_PROVIDER', 'OAUTH_CODE_MISSING');
      let identity;
      try {
        identity = await exchange(request.query.code, attempt.verifier, attempt.nonce, config);
      } catch (error) {
        if (error instanceof OAuthDiagnosticError) throw error;
        throw new OAuthDiagnosticError('TOKEN_EXCHANGE', 'TOKEN_EXCHANGE_FAILED');
      }
      let user;
      try {
        user = await authorizeIdentity(db, identity, config);
        identityPersisted = true;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new OAuthDiagnosticError('IDENTITY_PERSISTENCE', 'IDENTITY_PERSIST_FAILED');
      }
      const token = random();
      try {
        await db.transaction(async tx => {
          if (request.cookies[cookieName]) await tx('sessions').where({ token_hash: hash(request.cookies[cookieName]!) }).delete();
          await tx('sessions').insert({ token_hash: hash(token), user_id: user.id, csrf_token: random(), expires_at: new Date(Date.now()+config.sessionHours*3600000) });
        });
        sessionCreated = true;
      } catch {
        throw new OAuthDiagnosticError('SESSION_CREATE', 'SESSION_CREATE_FAILED');
      }
      reply.setCookie(cookieName,token,{ ...options, maxAge: config.sessionHours*3600 });
      app.log.info({ event: 'oauth_callback_succeeded', correlationId, role: user.role, databaseReached, identityPersisted, sessionCreated }, 'OAuth completado');
      return reply.redirect(`${config.frontendUrl}/${user.role}`);
    } catch (error) {
      const diagnostic = error instanceof OAuthDiagnosticError ? error : error instanceof ApiError
        ? new OAuthDiagnosticError('IDENTITY_AUTHORIZATION', error.code)
        : new OAuthDiagnosticError('CALLBACK_UNKNOWN', 'OAUTH_UNCLASSIFIED_FAILURE');
      app.log.warn({ event: 'oauth_callback_failed', correlationId, stage: diagnostic.stage, diagnosticCode: diagnostic.diagnosticCode,
        ...diagnostic.details, configurationPresent: configured, databaseReached, identityPersisted, sessionCreated }, 'OAuth no completado');
      const code = error instanceof ApiError ? error.code : 'authentication_failed';
      return reply.redirect(`${config.frontendUrl}/login?error=${code}&reference=${correlationId}`);
    }
  });
  app.get('/api/v1/me', async request => {
    const user = await principal(request);
    return { user: await profile(user), csrfToken: user.csrf_token };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const user = await principal(request);
    await db.transaction(async tx => {
      await tx('sessions').where({ token_hash: user.token_hash }).delete();
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'session.logout' });
    });
    reply.clearCookie(cookieName, options);
    return { ok: true };
  });
  app.get('/api/v1/professional-schools', async request => {
    await principal(request);
    return db('professional_schools').select('id','name').orderBy('id');
  });
  type ProfileInput = { firstNames: string; lastNames: string; phone: string; photo?: string | null; schoolId?: number; professionalInfo?: string };
  app.patch<{ Body: ProfileInput }>('/api/v1/me', { schema: { body: object({
    firstNames: { ...text(80), minLength: 2, pattern: '^\\s*\\S(?:.*\\S)\\s*$' }, lastNames: { ...text(80), minLength: 2, pattern: '^\\s*\\S(?:.*\\S)\\s*$' },
    phone: { type: 'string', maxLength: 20, pattern: '^(|\\+?[0-9 -]{7,20})$' },
    schoolId: { type: 'integer', minimum: 1, maximum: 6 }, professionalInfo: { type: 'string', maxLength: 240 },
    photo: { anyOf: [{ type: 'null' }, { type: 'string', maxLength: 175000, pattern: '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$' }] },
  }, ['firstNames','lastNames','phone']) } }, async request => {
    const user = await principal(request), body = request.body;
    if (body.photo) {
      const bytes = Buffer.from(body.photo.split(',')[1], 'base64');
      const valid = body.photo.startsWith('data:image/png;') ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
        body.photo.startsWith('data:image/jpeg;') ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
        bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
      if (!valid || bytes.length > 131072) throw new ApiError(400,'invalid_input','Elige una imagen PNG, JPG o WebP de hasta 128 KB.');
    }
    if ((user.role === 'estudiante' && (!body.schoolId || body.professionalInfo !== undefined)) || (user.role === 'docente' && body.schoolId !== undefined)) throw new ApiError(400,'invalid_input','Revisa los campos de tu perfil.');
    await db.transaction(async tx => {
      await tx(user.role === 'docente' ? 'teacher_profiles' : 'student_profiles').where({ user_id: user.id }).update({
        first_names: body.firstNames.trim(), last_names: body.lastNames.trim(), phone: body.phone.trim(),
        ...(body.photo !== undefined ? { photo: body.photo } : {}),
        ...(user.role === 'docente' ? { professional_info: body.professionalInfo || '' } : { school_id: body.schoolId }),
      });
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'profile.updated' });
    });
    return { user: await profile(user) };
  });
  async function teacher(request: FastifyRequest) {
    const user = await principal(request);
    if (user.role !== 'docente') throw new ApiError(403,'forbidden','Esta acción requiere autorización docente.');
    return user;
  }
  app.get('/api/v1/subjects', async request => {
    const user = await teacher(request);
    return db('subjects').where({ teacher_id: user.id }).select('id','name','archived_at').orderBy('name');
  });
  app.post<{ Body: { name: string } }>('/api/v1/subjects', { schema: { body: object({ name: text(160) }) } }, async (request, reply) => {
    const user = await teacher(request);
    const subject = await db.transaction(async tx => {
      const [created] = await tx('subjects').insert({ id: randomUUID(), teacher_id: user.id, name: request.body.name.trim() }).returning(['id','name']);
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'subject.created', resource_id: created.id });
      return created;
    });
    return reply.code(201).send(subject);
  });
  function accessibleClassrooms(user: Principal, includeArchived = false) {
    const query = db('classrooms as c').join('subjects as s','s.id','c.subject_id')
      .join('teacher_profiles as tp','tp.user_id','c.teacher_id').whereNull('s.archived_at').whereNull('c.deleted_at');
    if (user.role === 'docente') {
      query.where('c.teacher_id',user.id);
      if (!includeArchived) query.whereNull('c.archived_at');
    } else {
      query.whereNull('c.archived_at').whereExists(db('enrollments as e').select(db.raw('1')).whereRaw('e.classroom_id=c.id').where({ 'e.student_user_id': user.id, 'e.status': 'active' }));
    }
    return query.select('c.id','s.name','c.section','c.period','c.shift','c.archived_at as archivedAt',
      db.raw("trim(tp.first_names || ' ' || tp.last_names) as \"teacherName\""));
  }
  app.get<{ Querystring: { includeArchived?: string } }>('/api/v1/classrooms', {
    schema:{querystring:{type:'object',additionalProperties:false,properties:{includeArchived:{type:'string',enum:['true']}}}},
  }, async request => {
    const user = await principal(request);
    return accessibleClassrooms(user,user.role === 'docente' && request.query.includeArchived === 'true').orderBy('c.archived_at','desc').orderBy('s.name');
  });
  app.get<{ Params: { id: string } }>('/api/v1/classrooms/:id', { schema: { params: object({ id: { type: 'string', format: 'uuid' } }) } }, async request => {
    const user = await principal(request);
    const row = await accessibleClassrooms(user,user.role === 'docente').where('c.id',request.params.id).first();
    if (!row) throw new ApiError(404,'not_found','No encontramos un aula disponible para tu cuenta.');
    return row;
  });
  type ClassroomInput = { subjectId: string; section: string; period: string; shift: string };
  app.post<{ Body: ClassroomInput }>('/api/v1/classrooms', { schema: { body: object({ subjectId: { type: 'string', format: 'uuid' }, section: text(30), period: text(30), shift: text(30) }) } }, async (request, reply) => {
    const user = await teacher(request), body = request.body;
    const row = await db.transaction(async tx => {
      const subject = await tx('subjects').where({ id: body.subjectId, teacher_id: user.id }).whereNull('archived_at').forUpdate().first();
      if (!subject) throw new ApiError(404,'not_found','Asignatura no disponible.');
      const [created] = await tx('classrooms').insert({ id: randomUUID(), teacher_id: user.id, subject_id: subject.id,
        section: body.section.trim(), period: body.period.trim(), shift: body.shift.trim() }).returning(['id','section','period','shift']);
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'classroom.created', resource_id: created.id });
      return created;
    });
    return reply.code(201).send(row);
  });
  app.get<{ Params: { id: string } }>('/api/v1/classrooms/:id/lifecycle-impact', {
    schema: { params: object({ id: { type:'string',format:'uuid' } }) },
  }, async request => {
    const user = await teacher(request);
    const classroom = await db('classrooms as c').join('subjects as s','s.id','c.subject_id')
      .where({'c.id':request.params.id,'c.teacher_id':user.id}).whereNull('c.deleted_at')
      .select('c.id','s.name','c.archived_at as archivedAt').first();
    if (!classroom) throw new ApiError(404,'not_found','Aula no disponible.');
    const enrollmentRows = await db('enrollments').where({classroom_id:classroom.id}).groupBy('status').select('status').count<{status:string;count:string}[]>({count:'id'});
    const byStatus = Object.fromEntries(enrollmentRows.map(row => [row.status,Number(row.count)]));
    return { id:classroom.id,name:classroom.name,archivedAt:classroom.archivedAt,
      students:{total:Object.values(byStatus).reduce((sum,value) => sum+value,0),active:byStatus.active || 0,preauthorized:byStatus.preauthorized || 0,revoked:byStatus.revoked || 0},
      planning:{available:false,count:null},assessments:{available:false,count:null},deletionStrategy:'logical' };
  });
  type ClassroomMutation = { section?: string; period?: string; shift?: string; action?: 'archive' | 'restore' | 'delete'; understood?: boolean; confirmationName?: string };
  app.patch<{ Params: { id: string }; Body: ClassroomMutation }>('/api/v1/classrooms/:id', {
    schema: { params: object({ id: { type:'string',format:'uuid' } }), body: { type:'object',additionalProperties:false,minProperties:1,
      properties:{section:text(30),period:text(30),shift:text(30),action:{type:'string',enum:['archive','restore','delete']},understood:{type:'boolean'},confirmationName:{type:'string',maxLength:160}} } },
  }, async request => {
    const user = await teacher(request), body = request.body;
    const result = await db.transaction(async tx => {
      const classroom = await tx('classrooms as c').join('subjects as s','s.id','c.subject_id')
        .where({'c.id':request.params.id,'c.teacher_id':user.id}).whereNull('c.deleted_at').forUpdate('c')
        .select('c.*','s.name as subject_name').first();
      const denied = (resourceId:string,reason:string,message:string,statusCode:404|409 = 409) => ({denied:{resourceId,reason,message,statusCode}} as const);
      if (!classroom) return denied(request.params.id,'not_owned_or_missing','Aula no disponible.',404);
      if (body.action === 'archive' && (!body.understood || classroom.archived_at)) return denied(classroom.id,'archive_confirmation_or_state','Confirma el impacto antes de archivar un aula activa.');
      if (body.action === 'restore' && !classroom.archived_at) return denied(classroom.id,'not_archived','El aula ya se encuentra activa.');
      if (body.action === 'delete') {
        if (!classroom.archived_at) return denied(classroom.id,'delete_requires_archive','Archiva el aula antes de eliminarla.');
        if (!body.understood || body.confirmationName?.trim() !== classroom.subject_name) return denied(classroom.id,'delete_confirmation_mismatch','Escribe el nombre exacto del aula y confirma que comprendes el impacto.');
      }
      if (!body.action && classroom.archived_at) return denied(classroom.id,'archived_update','Restaura el aula antes de editarla.');
      const changes = {
        ...(body.section !== undefined ? {section:body.section.trim()} : {}), ...(body.period !== undefined ? {period:body.period.trim()} : {}),
        ...(body.shift !== undefined ? {shift:body.shift.trim()} : {}),
        ...(body.action === 'archive' ? {archived_at:tx.fn.now(),archived_by:user.id} : body.action === 'restore' ? {archived_at:null,archived_by:null} : {}),
        ...(body.action === 'delete' ? {deleted_at:tx.fn.now(),deleted_by:user.id} : {}),
      };
      const [updated] = await tx('classrooms').where({id:classroom.id}).update(changes).returning(['id','section','period','shift','archived_at','deleted_at']);
      const [{count}] = await tx('enrollments').where({classroom_id:classroom.id}).count<{count:string}[]>({count:'id'});
      await tx('audit_events').insert({id:randomUUID(),actor_id:user.id,action:body.action ? `classroom.${body.action === 'delete' ? 'deleted':body.action}`:'classroom.updated',resource_id:classroom.id,
        resource_type:'classroom',details:{enrollmentCount:Number(count),...(body.action === 'delete' ? {strategy:'logical'}:{})}});
      return {updated};
    });
    if ('denied' in result) {
      await db('audit_events').insert({id:randomUUID(),actor_id:user.id,action:'classroom.lifecycle_denied',resource_id:result.denied.resourceId,
        resource_type:'classroom',details:{requestedAction:body.action || 'update',reason:result.denied.reason}});
      throw new ApiError(result.denied.statusCode,result.denied.statusCode === 404 ? 'not_found':'conflict',result.denied.message);
    }
    return result.updated;
  });
  registerEnrollmentRoutes(app,db,principal,teacher);
  registerPlanningRoutes(app,db,principal,teacher);
  registerPlanningReviewRoutes(app,db,teacher);
  registerAssessmentRoutes(app,db,teacher);
  registerAttemptRoutes(app,db,principal);
  return app;
}
