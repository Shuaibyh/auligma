import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileCheck2, Save, Send } from 'lucide-react';
import { useRealAuth } from '../auth/RealAuth';
import { api, ApiError } from '../auth/api';
import { Badge, EmptyState, MathBlock, Modal, PageHeading } from '../components/ui';

type ActivityState = 'upcoming' | 'available' | 'in_progress' | 'submitted' | 'expired' | 'closed';
type Activity = {
  id: string; title: string; instructions: string; type: string; totalPoints: number; questionCount: number;
  opensAt: string | null; dueAt: string | null; closesAt: string | null; state: ActivityState; attemptsAllowed: number;
  canStart?: boolean; canResume?: boolean; attempt: { id: string; status: string; version: number } | null; serverNow: string;
};
type Question = {
  id: string; position: number; statement: string; topic: string; difficulty: string;
  alternatives: { id: string; text: string }[]; selectedOptionId: string | null; savedAt: string | null;
};
type Attempt = {
  id: string; activityVersionId: string; classroomId: string; title: string; instructions: string; type: string;
  status: string; version: number; startedAt: string; expiresAt: string | null; submittedAt: string | null;
  serverNow: string; questions: Question[]; answeredCount: number;
};
type StudentResult = {
  id: string; state: 'pending' | 'review_required' | 'withheld' | 'available' | 'expired' | 'invalidated';
  scoreReleased: boolean; solutionsReleased: boolean; score?: number; maxScore?: number; gradedAt?: string;
  items?: { id: string; position: number; statement: string; pointsAwarded: number; maxPoints: number; outcome: string;
    selectedOptionId: string | null; alternatives: { id: string; text: string }[]; correctOptionId: string; explanation: string }[];
};

const labels: Record<ActivityState, string> = {
  upcoming: 'Próxima', available: 'Disponible', in_progress: 'En progreso', submitted: 'Entregada', expired: 'Vencida', closed: 'Cerrada',
};
const tones: Record<ActivityState, string> = {
  upcoming: '', available: 'green', in_progress: 'amber', submitted: 'green', expired: '', closed: '',
};
const date = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha definida';

function StudentOnly({ children }: { children: React.ReactNode }) {
  const { user } = useRealAuth();
  return user?.role === 'estudiante' ? children : <Navigate to="/docente" replace />;
}

export function StudentActivityList() {
  const { id = '' } = useParams();
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<Activity[]>(`/classrooms/${id}/activities`).then(result => { if (active) { setRows(result); setError(''); } })
      .catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active = false; };
  }, [id, revision]);
  return <StudentOnly><PageHeading eyebrow="ACTIVIDADES DEL AULA" title="Prácticas publicadas" description="Revisa las reglas antes de comenzar. Tus respuestas se guardan durante el intento." />
    <nav className="classroom-context" aria-label="Secciones del aula"><Link to={`/estudiante/cursos/${id}`}>Resumen</Link><Link to={`/estudiante/cursos/${id}/planificacion`}>Planificación</Link><Link className="active" aria-current="page" to={`/estudiante/cursos/${id}/actividades`}>Actividades</Link></nav>
    {error && <div className="notice" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRevision(value => value + 1)}>Volver a intentar</button></div>}
    {!rows && !error && <p role="status">Consultando actividades…</p>}
    {rows?.length === 0 && <section className="panel"><EmptyState title="No hay actividades publicadas">Cuando tu docente publique una práctica, aparecerá aquí con sus fechas y reglas.</EmptyState></section>}
    <div className="student-activity-grid">{rows?.map(activity => <article className="panel activity-card" key={activity.id}>
      <div className="activity-card-head"><Badge tone={tones[activity.state]}>{labels[activity.state]}</Badge><span>{activity.questionCount} preguntas</span></div>
      <div><p className="eyebrow">{activity.type === 'practice' ? 'PRÁCTICA' : 'EVALUACIÓN'}</p><h2>{activity.title}</h2><p className="muted">{activity.instructions || 'Sin instrucciones adicionales.'}</p></div>
      <dl className="activity-dates"><div><dt>Disponible desde</dt><dd>{date(activity.opensAt)}</dd></div><div><dt>Cierre</dt><dd>{date(activity.closesAt)}</dd></div></dl>
      <Link className="button primary" to={`/estudiante/cursos/${id}/actividades/${activity.id}`}>{activity.state === 'in_progress' ? 'Continuar intento' : activity.state === 'submitted' ? 'Ver entrega' : 'Revisar actividad'}</Link>
    </article>)}</div>
  </StudentOnly>;
}

export function StudentActivityIntro() {
  const { id = '', versionId = '' } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; api<Activity>(`/classrooms/${id}/activities/${versionId}`).then(result => { if (active) setActivity(result); }).catch(failure => { if (active) setError((failure as Error).message); }); return () => { active = false; }; }, [id, versionId]);
  async function start() {
    if (activity?.canResume && activity.attempt) { navigate(`/estudiante/cursos/${id}/intentos/${activity.attempt.id}`); return; }
    setBusy(true); setError('');
    try {
      const attempt = await api<Attempt>(`/classrooms/${id}/activities/${versionId}/attempts`, { method: 'POST', body: JSON.stringify({ operationId: crypto.randomUUID() }) });
      navigate(`/estudiante/cursos/${id}/intentos/${attempt.id}`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <StudentOnly><Link className="text-link back-link" to={`/estudiante/cursos/${id}/actividades`}><ArrowLeft size={17} /> Volver a actividades</Link>
    {!activity && !error && <p role="status">Preparando las reglas…</p>}{error && <p className="error" role="alert">{error}</p>}
    {activity && <><PageHeading eyebrow="ANTES DE COMENZAR" title={activity.title} description={activity.instructions || 'Lee las condiciones del intento antes de continuar.'} />
      <section className="panel attempt-intro"><div className="attempt-rule-grid"><article><strong>{activity.questionCount}</strong><span>preguntas</span></article><article><strong>1</strong><span>intento permitido</span></article><article><strong>{activity.totalPoints}</strong><span>puntos de referencia</span></article></div>
        <div className="attempt-rules"><h2>Reglas de esta actividad</h2><ul><li>Las respuestas se guardan automáticamente.</li><li>La hora oficial proviene del servidor.</li><li>Al confirmar la entrega ya no podrás modificar respuestas.</li><li>El vencimiento informado no reemplaza el cierre: el intento se bloquea al llegar la fecha de cierre.</li></ul></div>
        <dl className="activity-dates"><div><dt>Apertura</dt><dd>{date(activity.opensAt)}</dd></div><div><dt>Vencimiento informativo</dt><dd>{date(activity.dueAt)}</dd></div><div><dt>Cierre definitivo</dt><dd>{date(activity.closesAt)}</dd></div></dl>
        {activity.state === 'submitted' && activity.attempt ? <Link className="button primary" to={`/estudiante/cursos/${id}/intentos/${activity.attempt.id}`}>Ver constancia de entrega</Link>
          : <button className="button primary" disabled={busy || (!activity.canStart && !activity.canResume)} onClick={() => void start()}>{busy ? 'Preparando intento…' : activity.canResume ? 'Continuar intento' : activity.canStart ? 'Comenzar intento' : labels[activity.state]}</button>}
      </section></>}
  </StudentOnly>;
}

function useCountdown(serverNow: string | undefined, expiresAt: string | null | undefined) {
  const [clock, setClock] = useState({ tick: 0, offset: 0 });
  useEffect(() => {
    const update = () => { const localNow = Date.now(); setClock({ tick: localNow, offset: serverNow ? new Date(serverNow).getTime() - localNow : 0 }); };
    update(); if (!expiresAt) return; const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [serverNow, expiresAt]);
  if (!expiresAt) return 'Sin límite adicional';
  const remaining = Math.max(0, new Date(expiresAt).getTime() - (clock.tick + clock.offset));
  const hours = Math.floor(remaining / 3_600_000); const minutes = Math.floor(remaining % 3_600_000 / 60_000); const seconds = Math.floor(remaining % 60_000 / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function StudentAttempt() {
  const { id = '', attemptId = '' } = useParams();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StudentResult | null>(null);
  const operationRef = useRef<string | null>(null);
  const countdown = useCountdown(attempt?.serverNow, attempt?.expiresAt);
  const load = async () => { const result = await api<Attempt>(`/classrooms/${id}/attempts/${attemptId}`); setAttempt(result); return result; };
  useEffect(() => { let active = true; api<Attempt>(`/classrooms/${id}/attempts/${attemptId}`).then(result => { if (active) setAttempt(result); }).catch(failure => { if (active) setError((failure as Error).message); }); return () => { active = false; }; }, [id, attemptId]);
  useEffect(() => {
    if (!attempt || !['submitted', 'grading', 'graded'].includes(attempt.status)) return;
    let active = true;
    api<StudentResult>(`/classrooms/${id}/attempts/${attemptId}/result`).then(value => { if (active) setResult(value); }).catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active = false; };
  }, [attempt, attemptId, id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveState === 'saving') event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);
  async function choose(itemId: string, selectedOptionId: string) {
    if (!attempt || attempt.status !== 'in_progress' || saveState === 'saving') return;
    const previous = attempt; setAttempt({ ...attempt, questions: attempt.questions.map(question => question.id === itemId ? { ...question, selectedOptionId } : question) });
    setSaveState('saving'); setError(''); const operationId = crypto.randomUUID();
    try {
      const updated = await api<Attempt>(`/classrooms/${id}/attempts/${attempt.id}/answers/${itemId}`, { method: 'PATCH', body: JSON.stringify({ version: attempt.version, operationId, selectedOptionId }) });
      setAttempt(updated); setSaveState('saved');
    } catch (failure) {
      setAttempt(previous); setSaveState('error'); setError((failure as Error).message);
      if (failure instanceof ApiError && failure.status === 409) void load().catch(() => undefined);
    }
  }
  async function submit() {
    if (!attempt) return; setSubmitting(true); setError(''); const operationId = operationRef.current || crypto.randomUUID(); operationRef.current = operationId;
    try {
      const result = await api<Attempt>(`/classrooms/${id}/attempts/${attempt.id}/submit`, { method: 'POST', body: JSON.stringify({ version: attempt.version, operationId, confirmed: true }) });
      setAttempt(result); setSubmitOpen(false); operationRef.current = null;
    } catch (failure) {
      try {
        const status = await api<{ status: string }>(`/classrooms/${id}/attempts/${attempt.id}/status`);
        if (['submitted', 'grading', 'graded'].includes(status.status)) { await load(); setSubmitOpen(false); operationRef.current = null; return; }
      } catch { /* Se conserva el error original y la clave para reintento idempotente. */ }
      setError((failure as Error).message);
    } finally { setSubmitting(false); }
  }
  if (!attempt && !error) return <p role="status">Recuperando tu intento…</p>;
  if (!attempt) return <section className="panel"><EmptyState title="No pudimos abrir el intento">{error}</EmptyState></section>;
  if (['submitted', 'grading', 'graded'].includes(attempt.status)) return <StudentOnly><section className="panel submission-receipt result-receipt"><CheckCircle2 aria-hidden="true" /><p className="eyebrow">ENTREGA REGISTRADA</p><h1>{attempt.title}</h1><p>Tu entrega fue recibida el {date(attempt.submittedAt)}.</p>
    {!result && !error && <p role="status">Consultando el estado de corrección…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {result?.state === 'review_required' && <div className="notice amber"><AlertTriangle aria-hidden="true" /><p>La verificación matemática no fue concluyente. Tu resultado está pendiente de revisión docente.</p></div>}
    {result?.state === 'withheld' && <p className="muted">La corrección terminó. El puntaje se mostrará cuando cierre la actividad.</p>}
    {result?.state === 'pending' && <p className="muted">La corrección sigue en proceso. Puedes volver más tarde.</p>}
    {result?.state === 'available' && <><div className="student-score" aria-label={`Puntaje ${result.score} de ${result.maxScore}`}><strong>{result.score}</strong><span>/ {result.maxScore} puntos</span></div>
      {result.solutionsReleased && result.items && <div className="student-result-items">{result.items.map(item => <article key={item.id}><header><strong>Pregunta {item.position}</strong><Badge tone={item.outcome === 'correct' ? 'green' : ''}>{item.pointsAwarded} / {item.maxPoints}</Badge></header><p>{item.statement}</p><p className="small muted">{item.explanation || 'Sin explicación publicada.'}</p></article>)}</div>}</>}
    <Link className="button primary" to={`/estudiante/cursos/${id}/actividades`}>Volver a actividades</Link></section></StudentOnly>;
  const question = attempt.questions[index]; const pending = attempt.questions.length - attempt.answeredCount;
  return <StudentOnly><div className="attempt-workspace">
    <header className="attempt-header"><div><p className="eyebrow">INTENTO EN CURSO</p><h1>{attempt.title}</h1></div><div className="attempt-status"><span className={`autosave-status ${saveState}`} aria-live="polite">{saveState === 'saving' ? <><Save size={16} /> Guardando…</> : saveState === 'error' ? 'No guardado' : <><CheckCircle2 size={16} /> Guardado</>}</span><span className="attempt-timer"><Clock3 size={17} aria-hidden="true" />{countdown}</span></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="attempt-layout"><aside className="panel question-map" aria-label="Navegación de preguntas"><strong>Preguntas</strong><div>{attempt.questions.map((item, itemIndex) => <button key={item.id} aria-label={`Pregunta ${item.position}${item.selectedOptionId ? ', respondida' : ', pendiente'}`} aria-current={index === itemIndex ? 'step' : undefined} className={`${index === itemIndex ? 'active' : ''} ${item.selectedOptionId ? 'answered' : ''}`} onClick={() => setIndex(itemIndex)}>{item.position}</button>)}</div><small>{attempt.answeredCount} de {attempt.questions.length} respondidas</small></aside>
      <main className="panel question-panel"><div className="question-meta"><Badge>Pregunta {question.position} de {attempt.questions.length}</Badge>{question.topic && <span>{question.topic}</span>}</div><h2>{question.statement}</h2>
        <fieldset disabled={saveState === 'saving'}><legend className="sr-only">Selecciona una alternativa</legend>{question.alternatives.map((option, optionIndex) => <label className={`answer-option ${question.selectedOptionId === option.id ? 'selected' : ''}`} key={option.id}><input type="radio" name={`question-${question.id}`} checked={question.selectedOptionId === option.id} onChange={() => void choose(question.id, option.id)} /><span className="answer-letter">{String.fromCharCode(65 + optionIndex)}</span><MathBlock formula={option.text} block={false} /></label>)}</fieldset>
        <div className="attempt-navigation"><button className="button secondary" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft size={17} /> Anterior</button>{index < attempt.questions.length - 1 ? <button className="button primary" onClick={() => setIndex(value => value + 1)}>Siguiente <ArrowRight size={17} /></button> : <button className="button primary" disabled={saveState === 'saving'} onClick={() => setSubmitOpen(true)}><Send size={17} /> Revisar y entregar</button>}</div>
      </main></div>
    <Modal open={submitOpen} onOpenChange={value => { if (!submitting) setSubmitOpen(value); }} title="Confirmar entrega" description="Después de enviar no podrás cambiar tus respuestas."><div className="submission-summary"><FileCheck2 aria-hidden="true" /><div><strong>{attempt.answeredCount} respondidas</strong><p className="muted">{pending ? `${pending} preguntas permanecen sin respuesta.` : 'Todas las preguntas tienen una respuesta.'}</p></div></div>{pending > 0 && <div className="notice amber"><AlertTriangle aria-hidden="true" /><p>Puedes entregar con preguntas pendientes, pero no podrás volver a este intento.</p></div>}<div className="button-row end"><button className="button secondary" disabled={submitting} onClick={() => setSubmitOpen(false)}>Seguir revisando</button><button className="button primary" disabled={submitting || saveState === 'saving'} onClick={() => void submit()}>{submitting ? 'Registrando entrega…' : 'Confirmar entrega'}</button></div></Modal>
  </div></StudentOnly>;
}
