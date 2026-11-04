import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Eye, FilePlus2, ListFilter, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../auth/api';
import { useRealAuth } from '../auth/RealAuth';
import { Badge, EmptyState, Modal, PageHeading } from '../components/ui';
import type { RealClassroomData } from './RealClassroom';

type Alternative = { id: string; text: string };
type QuestionContent = {
  statement: string;
  alternatives: Alternative[];
  explanation: string;
  difficulty: string;
  topic: string;
};
type QuestionRevision = {
  id: string;
  revision: number;
  content: QuestionContent;
  reviewStatus: 'approved' | 'draft' | 'invalid' | 'indeterminate';
};
type AssessmentItem = {
  id: string;
  position: number;
  points: number;
  questionRevisionId: string;
  questionRevision: number;
  reviewStatus: string;
  content: QuestionContent;
};
type Assessment = {
  id: string;
  classroomId: string;
  type: 'practice';
  status: 'draft';
  title: string;
  instructions: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  totalPoints: number;
  items: AssessmentItem[];
  publicationAllowed: false;
};

const dateFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const statusLabel: Record<QuestionRevision['reviewStatus'], string> = {
  approved: 'Aprobada', draft: 'En revisión', invalid: 'Inválida', indeterminate: 'Pendiente',
};

function classroomPath(classroomId: string) {
  return `/docente/cursos/${classroomId}/evaluaciones`;
}
function TeacherOnly({ children }: { children: React.ReactNode }) {
  const { user } = useRealAuth();
  return user?.role === 'docente' ? children : <Navigate to={`/${user?.role || 'estudiante'}`} replace />;
}

function ClassroomTabs({ classroomId, active }: { classroomId: string; active: 'assessments' }) {
  return <nav className="classroom-context" aria-label="Secciones del aula">
    <Link to={`/docente/cursos/${classroomId}`}>Estudiantes</Link>
    <Link to={`/docente/cursos/${classroomId}/planificacion`}>Planificación</Link>
    <Link className={active === 'assessments' ? 'active' : ''} aria-current="page" to={classroomPath(classroomId)}>Evaluaciones</Link>
  </nav>;
}

function LoadFailure({ message, retry }: { message: string; retry: () => void }) {
  return <section className="panel assessment-load-error" role="alert"><h2>No pudimos cargar este espacio</h2><p className="muted">{message}</p><button className="button secondary" onClick={retry}>Volver a intentar</button></section>;
}

export function TeacherAssessmentList() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useRealAuth();
  const [course, setCourse] = useState<RealClassroomData | null>(null);
  const [rows, setRows] = useState<Assessment[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (user?.role !== 'docente') return;
    let active = true;
    Promise.all([api<RealClassroomData>(`/classrooms/${id}`), api<Assessment[]>(`/classrooms/${id}/assessments`)])
      .then(([nextCourse, assessments]) => { if (active) { setCourse(nextCourse); setRows(assessments); setError(''); } })
      .catch(reason => { if (active) setError((reason as Error).message); });
    return () => { active = false; };
  }, [id, revision, user?.role]);
  const filtered = useMemo(() => (rows || []).filter(row => `${row.title} ${row.instructions}`.toLowerCase().includes(query.trim().toLowerCase())), [query, rows]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const values = new FormData(event.currentTarget);
    try {
      const created = await api<Assessment>(`/classrooms/${id}/assessments`, { method: 'POST', body: JSON.stringify({ title: values.get('title'), instructions: values.get('instructions') }) });
      navigate(`${classroomPath(id)}/${created.id}`);
    } catch (reason) { setError((reason as Error).message); } finally { setSaving(false); }
  }
  return <TeacherOnly>
    {error && !course ? <LoadFailure message={error} retry={() => setRevision(value => value + 1)} /> : !course || !rows ? <p role="status">Preparando evaluaciones…</p> : <>
      <PageHeading eyebrow={`${course.period} · SECCIÓN ${course.section}`} title="Evaluaciones" description={`${course.name} · Construye prácticas en borrador con preguntas aprobadas.`} action={<button className="button primary" onClick={() => { setError(''); setOpen(true); }}><Plus size={18} aria-hidden="true" /> Nueva evaluación</button>} />
      <ClassroomTabs classroomId={id} active="assessments" />
      <section className="assessment-tabs" aria-label="Estados de las evaluaciones"><button className="active" aria-current="page">Borradores <span>{rows.length}</span></button><button disabled title="Disponible en un próximo hito">Publicadas <span>Próximamente</span></button><button disabled title="Disponible en un próximo hito">Cerradas <span>Próximamente</span></button></section>
      <div className="assessment-list-tools"><label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Buscar evaluaciones</span><input name="assessment-search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por título o instrucciones…" /></label><span className="assessment-filter-note"><ListFilter size={17} aria-hidden="true" /> Prácticas en borrador</span></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!rows.length ? <section className="panel"><EmptyState title="Todavía no hay evaluaciones en esta aula">Crea un borrador y compónlo con revisiones de preguntas aprobadas.</EmptyState></section> : !filtered.length ? <section className="panel"><EmptyState title="No encontramos evaluaciones">Prueba otro término de búsqueda.</EmptyState></section> : <div className="assessment-card-grid">{filtered.map(row => <article className="panel assessment-card" key={row.id}><div className="assessment-card-heading"><Badge tone="amber">Borrador</Badge><span className="small muted">v{row.version}</span></div><h2>{row.title}</h2><p className="muted assessment-card-copy">{row.instructions || 'Sin instrucciones adicionales.'}</p><dl><div><dt>Preguntas</dt><dd>{row.items.length}</dd></div><div><dt>Puntaje</dt><dd>{row.totalPoints}</dd></div><div><dt>Actualizado</dt><dd>{dateFormatter.format(new Date(row.updatedAt))}</dd></div></dl><div className="button-row"><Link className="button primary" to={`${classroomPath(id)}/${row.id}`}>Continuar edición</Link><Link className="button secondary" to={`${classroomPath(id)}/${row.id}/vista-previa`}><Eye size={17} aria-hidden="true" /> Vista previa</Link></div></article>)}</div>}
      <aside className="assessment-boundary"><Check size={19} aria-hidden="true" /><div><strong>Este hito conserva borradores editables.</strong><p className="small muted">Publicación, intentos y calificaciones permanecen deshabilitados hasta que existan contratos de servidor específicos.</p></div></aside>
      <Modal open={open} onOpenChange={value => { if (!saving) setOpen(value); }} title="Crear evaluación" description="Se guardará como práctica privada en borrador dentro de esta aula."><form className="form-stack" onSubmit={create}><label>Título<input name="title" autoComplete="off" required minLength={1} maxLength={200} placeholder="Por ejemplo, Práctica de derivadas…" /></label><label>Instrucciones<textarea name="instructions" autoComplete="off" maxLength={6000} rows={4} placeholder="Orientaciones opcionales para resolver la práctica…" /></label>{error && <p className="error" role="alert">{error}</p>}<div className="button-row end"><button type="button" className="button secondary" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Creando…' : 'Crear borrador'}</button></div></form></Modal>
    </>}
  </TeacherOnly>;
}

function QuestionBank({ revisions, selected, busy, query, setQuery, add }: { revisions: QuestionRevision[]; selected: Set<string>; busy: boolean; query: string; setQuery: (value: string) => void; add: (revision: QuestionRevision) => void }) {
  const shown = revisions.filter(revision => `${revision.content.statement} ${revision.content.topic}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="assessment-bank-content"><label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar en el banco</span><input name="question-bank-search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar pregunta o tema…" /></label><div className="assessment-bank-list">{!revisions.length ? <EmptyState title="El banco todavía no tiene revisiones">Las preguntas aparecerán cuando tengan una revisión inmutable.</EmptyState> : !shown.length ? <EmptyState title="No hay coincidencias">Prueba otro término de búsqueda.</EmptyState> : shown.map(revision => { const approved = revision.reviewStatus === 'approved'; const included = selected.has(revision.id); return <article className={`assessment-bank-question ${included ? 'selected' : ''}`} key={revision.id}><div><span className="small muted">{revision.content.topic || 'Sin tema'} · Revisión {revision.revision}</span><strong>{revision.content.statement}</strong><Badge tone={approved ? 'green' : revision.reviewStatus === 'indeterminate' ? 'amber' : ''}>{statusLabel[revision.reviewStatus]}</Badge></div><button type="button" className={included ? 'button secondary' : 'button primary'} disabled={busy || included || !approved} title={!approved ? 'Solo se pueden usar preguntas aprobadas' : undefined} onClick={() => add(revision)}>{included ? 'Añadida' : approved ? 'Añadir' : 'No disponible'}</button></article>; })}</div></div>;
}

export function TeacherAssessmentEditor() {
  const { id = '', assessmentId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useRealAuth();
  const [course, setCourse] = useState<RealClassroomData | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [revisions, setRevisions] = useState<QuestionRevision[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [pointValues, setPointValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [removeItem, setRemoveItem] = useState<AssessmentItem | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const dirty = Boolean(assessment && (title !== assessment.title || instructions !== assessment.instructions));
  useEffect(() => {
    if (user?.role !== 'docente') return;
    let active = true;
    Promise.all([api<RealClassroomData>(`/classrooms/${id}`), api<Assessment>(`/classrooms/${id}/assessments/${assessmentId}`), api<QuestionRevision[]>(`/classrooms/${id}/question-revisions`)])
      .then(([nextCourse, nextAssessment, nextRevisions]) => { if (active) { setCourse(nextCourse); setAssessment(nextAssessment); setRevisions(nextRevisions); setTitle(nextAssessment.title); setInstructions(nextAssessment.instructions); setPointValues(Object.fromEntries(nextAssessment.items.map(item => [item.id, String(item.points)]))); setError(''); } })
      .catch(reason => { if (active) setError((reason as Error).message); });
    return () => { active = false; };
  }, [assessmentId, id, revision, user?.role]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  function accept(next: Assessment, message = '') { setAssessment(next); setPointValues(Object.fromEntries(next.items.map(item => [item.id, String(item.points)]))); setError(''); setNotice(message); }
  function fail(reason: unknown) { setError((reason as Error).message); setNotice(''); }
  async function saveMetadata(event: FormEvent) {
    event.preventDefault(); if (!assessment || !dirty) return; setBusy(true); setError('');
    try { const next = await api<Assessment>(`/classrooms/${id}/assessments/${assessment.id}`, { method: 'PATCH', body: JSON.stringify({ version: assessment.version, title, instructions }) }); accept(next, 'Cambios generales guardados.'); }
    catch (reason) { fail(reason); } finally { setBusy(false); }
  }
  async function add(revisionItem: QuestionRevision) {
    if (!assessment) return; setBusy(true); setError('');
    try { const next = await api<Assessment>(`/classrooms/${id}/assessments/${assessment.id}/items`, { method: 'POST', body: JSON.stringify({ version: assessment.version, questionRevisionId: revisionItem.id, points: 1 }) }); accept(next, 'Pregunta añadida con 1 punto.'); setBankOpen(false); }
    catch (reason) { fail(reason); } finally { setBusy(false); }
  }
  async function updateItem(item: AssessmentItem, patch: { points?: number; position?: number }, message: string) {
    if (!assessment) return; setBusy(true); setError('');
    try { const next = await api<Assessment>(`/classrooms/${id}/assessments/${assessment.id}/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ version: assessment.version, ...patch }) }); accept(next, message); }
    catch (reason) { fail(reason); } finally { setBusy(false); }
  }
  async function savePoints(event: FormEvent, item: AssessmentItem) {
    event.preventDefault(); const value = Number(pointValues[item.id]);
    if (!Number.isFinite(value) || value <= 0 || value > 1000 || Math.round(value * 100) !== value * 100) { setError('El puntaje debe ser mayor que 0, máximo 1000 y usar hasta dos decimales.'); return; }
    if (value === item.points) { setNotice('El puntaje ya estaba guardado.'); return; }
    await updateItem(item, { points: value }, 'Puntaje actualizado.');
  }
  async function remove() {
    if (!assessment || !removeItem) return; setBusy(true); setError('');
    try { const next = await api<Assessment>(`/classrooms/${id}/assessments/${assessment.id}/items/${removeItem.id}/remove`, { method: 'POST', body: JSON.stringify({ version: assessment.version, confirmed: true }) }); accept(next, 'Pregunta retirada del borrador.'); setRemoveItem(null); }
    catch (reason) { fail(reason); } finally { setBusy(false); }
  }
  function back() { if (!dirty || window.confirm('Hay cambios generales sin guardar. ¿Salir del constructor?')) navigate(classroomPath(id)); }
  if (error && !assessment) return <TeacherOnly><LoadFailure message={error} retry={() => setRevision(value => value + 1)} /></TeacherOnly>;
  if (!course || !assessment) return <TeacherOnly><p role="status">Abriendo el constructor…</p></TeacherOnly>;
  const selected = new Set(assessment.items.map(item => item.questionRevisionId));
  const conflict = error && error.includes('cambió');
  return <TeacherOnly>
    <button className="text-link assessment-back" onClick={back}><ArrowLeft size={17} aria-hidden="true" /> Volver a evaluaciones</button>
    <PageHeading eyebrow={`${course.name} · BORRADOR PRIVADO`} title="Constructor de evaluaciones" description="Compón una práctica con revisiones aprobadas y puntajes guardados en PostgreSQL." />
    <ol className="assessment-steps" aria-label="Progreso del constructor"><li className="active"><span>1</span><div><strong>Contenido</strong><small>Disponible</small></div></li><li aria-disabled="true"><span>2</span><div><strong>Configuración</strong><small>Próximo hito</small></div></li><li aria-disabled="true"><span>3</span><div><strong>Revisión y publicación</strong><small>Próximo hito</small></div></li></ol>
    {dirty && <p className="assessment-unsaved" role="status">Tienes cambios generales sin guardar.</p>}
    {notice && <p className="success-banner" role="status">{notice}</p>}
    {error && <div className="error assessment-error" role="alert"><span>{error}</span>{conflict && <button className="button secondary compact" onClick={() => setRevision(value => value + 1)}>Recargar versión</button>}</div>}
    <div className="assessment-builder-layout">
      <main className="assessment-compose">
        <form className="panel assessment-metadata" onSubmit={saveMetadata}><div className="section-heading"><div><p className="eyebrow">DATOS GENERALES</p><h2>Identidad de la práctica</h2></div><Badge tone="amber">Borrador · v{assessment.version}</Badge></div><label>Título<input name="title" autoComplete="off" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Instrucciones<textarea name="instructions" autoComplete="off" rows={4} maxLength={6000} value={instructions} onChange={event => setInstructions(event.target.value)} /></label><div className="button-row end"><button className="button secondary" disabled={busy || !dirty}>{busy ? 'Guardando…' : 'Guardar datos generales'}</button></div></form>
        <section className="assessment-items" aria-labelledby="assessment-items-title"><div className="section-heading"><div><p className="eyebrow">COMPOSICIÓN</p><h2 id="assessment-items-title">Preguntas de la práctica</h2></div><Badge>{assessment.items.length} {assessment.items.length === 1 ? 'pregunta' : 'preguntas'}</Badge></div>
          {!assessment.items.length ? <section className="panel"><EmptyState title="La práctica todavía no tiene preguntas">Selecciona una revisión aprobada del banco. Cada pregunta comienza con 1 punto y puede ajustarse.</EmptyState></section> : <div className="assessment-item-list">{assessment.items.map((item, index) => <article className="panel assessment-item" key={item.id}><header><span className="assessment-position" aria-hidden="true">{index + 1}</span><div><span className="small muted">{item.content.topic || 'Sin tema'} · Revisión {item.questionRevision}</span><h3>{item.content.statement}</h3></div><div className="assessment-item-actions"><button className="icon-button" aria-label={`Subir pregunta ${index + 1}`} disabled={busy || index === 0} onClick={() => void updateItem(item, { position: index }, 'Orden actualizado.')}><ArrowUp size={18} /></button><button className="icon-button" aria-label={`Bajar pregunta ${index + 1}`} disabled={busy || index === assessment.items.length - 1} onClick={() => void updateItem(item, { position: index + 2 }, 'Orden actualizado.')}><ArrowDown size={18} /></button><button className="icon-button danger-action" aria-label={`Retirar pregunta ${index + 1}`} disabled={busy} onClick={() => setRemoveItem(item)}><Trash2 size={18} /></button></div></header><div className="assessment-item-footer"><span>{item.content.alternatives.length} alternativas</span><form onSubmit={event => void savePoints(event, item)}><label htmlFor={`points-${item.id}`}>Puntos</label><input id={`points-${item.id}`} name={`points-${item.id}`} autoComplete="off" type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" value={pointValues[item.id] ?? ''} onChange={event => setPointValues(current => ({ ...current, [item.id]: event.target.value }))} /><button className="button secondary compact" disabled={busy}>Guardar</button></form></div></article>)}</div>}
        </section>
      </main>
      <aside className="assessment-builder-side"><section className="panel assessment-bank"><div className="section-heading"><div><p className="eyebrow">BANCO DEL AULA</p><h2>Elegir preguntas</h2></div><Badge tone="green">{revisions.filter(item => item.reviewStatus === 'approved').length} aprobadas</Badge></div><QuestionBank revisions={revisions} selected={selected} busy={busy} query={query} setQuery={setQuery} add={revisionItem => void add(revisionItem)} /></section><section className="panel assessment-summary"><p className="eyebrow">RESUMEN</p><dl><div><dt>Preguntas</dt><dd>{assessment.items.length}</dd></div><div><dt>Puntaje total</dt><dd>{assessment.totalPoints}</dd></div></dl><Link className={`button secondary ${assessment.items.length ? '' : 'disabled-link'}`} aria-disabled={!assessment.items.length} tabIndex={assessment.items.length ? 0 : -1} to={assessment.items.length ? `${classroomPath(id)}/${assessment.id}/vista-previa` : '#'}><Eye size={17} aria-hidden="true" /> Vista previa</Link><button className="button primary" disabled title="Disponible en un próximo hito">Continuar a configuración</button><p className="small muted">Publicación, intentos y disponibilidad aún no están implementados.</p></section></aside>
    </div>
    <button className="button primary assessment-mobile-bank" onClick={() => setBankOpen(true)}><FilePlus2 size={18} aria-hidden="true" /> Elegir preguntas</button>
    <Modal contentClassName="assessment-bank-modal" open={bankOpen} onOpenChange={setBankOpen} title="Elegir preguntas" description="Solo las revisiones aprobadas pueden incorporarse a este borrador."><QuestionBank revisions={revisions} selected={selected} busy={busy} query={query} setQuery={setQuery} add={revisionItem => void add(revisionItem)} /></Modal>
    <Modal open={Boolean(removeItem)} onOpenChange={value => { if (!busy && !value) setRemoveItem(null); }} title="Retirar pregunta" description="La revisión original seguirá intacta en el banco de preguntas."><p>{removeItem?.content.statement}</p><div className="button-row end"><button className="button secondary" disabled={busy} onClick={() => setRemoveItem(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Retirando…' : 'Retirar del borrador'}</button></div></Modal>
  </TeacherOnly>;
}

export function TeacherAssessmentPreview() {
  const { id = '', assessmentId = '' } = useParams();
  const { user } = useRealAuth();
  const [course, setCourse] = useState<RealClassroomData | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { if (user?.role !== 'docente') return; let active = true; Promise.all([api<RealClassroomData>(`/classrooms/${id}`), api<Assessment>(`/classrooms/${id}/assessments/${assessmentId}/preview`)]).then(([nextCourse, nextAssessment]) => { if (active) { setCourse(nextCourse); setAssessment(nextAssessment); setError(''); } }).catch(reason => { if (active) setError((reason as Error).message); }); return () => { active = false; }; }, [assessmentId, id, revision, user?.role]);
  if (error) return <TeacherOnly><LoadFailure message={error} retry={() => setRevision(value => value + 1)} /></TeacherOnly>;
  if (!course || !assessment) return <TeacherOnly><p role="status">Preparando vista previa…</p></TeacherOnly>;
  return <TeacherOnly><Link className="text-link assessment-back" to={`${classroomPath(id)}/${assessment.id}`}><ArrowLeft size={17} aria-hidden="true" /> Volver al constructor</Link><PageHeading eyebrow="VISTA PREVIA DOCENTE · SIN PUBLICAR" title={assessment.title} description={`${course.name} · ${assessment.items.length} preguntas · ${assessment.totalPoints} puntos`} /><div className="assessment-preview-warning" role="status"><Eye aria-hidden="true" /><div><strong>Esta vista no publica ni registra respuestas.</strong><p className="small muted">Sigues usando tu sesión docente; no se cambia de rol ni se crea un intento estudiantil.</p></div></div>{assessment.instructions && <section className="panel assessment-preview-instructions"><p className="eyebrow">INSTRUCCIONES</p><p>{assessment.instructions}</p></section>}{!assessment.items.length ? <section className="panel"><EmptyState title="No hay contenido para previsualizar">Vuelve al constructor y añade preguntas aprobadas.</EmptyState></section> : <div className="assessment-preview-list">{assessment.items.map((item, index) => <article className="panel assessment-preview-question" key={item.id}><header><Badge>Pregunta {index + 1} de {assessment.items.length}</Badge><strong>{item.points} {item.points === 1 ? 'punto' : 'puntos'}</strong></header><h2>{item.content.statement}</h2><fieldset disabled><legend>Alternativas</legend>{item.content.alternatives.map((alternative, optionIndex) => <label key={alternative.id}><input type="radio" name={`preview-${item.id}`} /><span className="assessment-option-letter">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[optionIndex]}</span><span>{alternative.text}</span></label>)}</fieldset></article>)}</div>}<div className="assessment-preview-actions"><Link className="button secondary" to={`${classroomPath(id)}/${assessment.id}`}>Volver a editar</Link><button className="button primary" disabled title="La publicación se implementará en un próximo hito">Publicar (próximo hito)</button></div></TeacherOnly>;
}
