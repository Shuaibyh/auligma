import { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardCheck, History, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../auth/api';
import { useRealAuth } from '../auth/RealAuth';
import { Badge, EmptyState, PageHeading } from '../components/ui';

type Grade = { revision: number; score: number; maxScore: number; status: 'provisional' | 'final'; source: 'system' | 'teacher'; reviewRequired: boolean; gradedAt: string };
type AttemptRow = { id: string; status: string; submittedAt: string; studentId: string; studentName: string; assessmentRevision: number; grade: Grade | null };
type AssessmentResult = { id: string; title: string; status: string; counts: { submitted: number; pending: number; provisional: number; final: number }; attempts: AttemptRow[] };
type Detail = { id: string; studentName: string; assessmentTitle: string; assessmentRevision: number; submittedAt: string;
  grade: (Grade & { id: string; reason: string | null; items: { id: string; position: number; statement: string; pointsAwarded: number; maxPoints: number; outcome: string }[] }) | null;
  history: { id: string; revision: number; score: number; maxScore: number; status: string; source: string; gradedAt: string; reason: string | null }[] };

function TeacherOnly({ children }: { children: React.ReactNode }) {
  const { user } = useRealAuth();
  return user?.role === 'docente' ? children : <Navigate to="/estudiante" replace />;
}
const formatDate = (value: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function TeacherResults() {
  const { id = '' } = useParams();
  const [rows, setRows] = useState<AssessmentResult[] | null>(null); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; api<AssessmentResult[]>(`/classrooms/${id}/results`).then(value => { if (active) { setRows(value); setError(''); } }).catch(reason => { if (active) setError((reason as Error).message); }); return () => { active = false; }; }, [id, revision]);
  return <TeacherOnly><Link className="text-link assessment-back" to={`/docente/cursos/${id}/evaluaciones`}><ArrowLeft size={17} aria-hidden="true" /> Volver a evaluaciones</Link>
    <PageHeading eyebrow="RESULTADOS DEL AULA" title="Correcciones y calificaciones" description="Consulta entregas reales, casos pendientes y revisiones inmutables." />
    {error && <div className="notice" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRevision(value => value + 1)}>Volver a intentar</button></div>}
    {!rows && !error && <p role="status">Consultando resultados…</p>}
    {rows?.length === 0 && <section className="panel"><EmptyState title="Todavía no hay evaluaciones publicadas">Los resultados aparecerán cuando existan entregas reales.</EmptyState></section>}
    <div className="results-assessment-list">{rows?.map(row => <section className="panel results-assessment" key={row.id}><header><div><p className="eyebrow">{row.status === 'closed' ? 'CERRADA' : 'PUBLICADA'}</p><h2>{row.title}</h2></div><Badge>{row.counts.submitted} entregas</Badge></header>
      <dl className="result-metrics"><div><dt>Pendientes</dt><dd>{row.counts.pending}</dd></div><div><dt>Provisionales</dt><dd>{row.counts.provisional}</dd></div><div><dt>Finales</dt><dd>{row.counts.final}</dd></div></dl>
      {!row.attempts.length ? <EmptyState title="Sin entregas">Ningún estudiante ha entregado esta actividad.</EmptyState> : <div className="result-table" role="list" aria-label={`Resultados de ${row.title}`}>{row.attempts.map(attempt => <div className="result-row" role="listitem" key={attempt.id}><div><strong>{attempt.studentName}</strong><span className="small muted">Versión {attempt.assessmentRevision} · {formatDate(attempt.submittedAt)}</span></div><div>{attempt.grade ? <Badge tone={attempt.grade.status === 'final' ? 'green' : 'amber'}>{attempt.grade.status === 'final' ? `${attempt.grade.score} / ${attempt.grade.maxScore}` : 'Revisión pendiente'}</Badge> : <Badge>Procesando</Badge>}</div><Link className="button secondary compact" to={`/docente/cursos/${id}/resultados/${attempt.id}`}>Ver detalle</Link></div>)}</div>}
    </section>)}</div>
    <aside className="assessment-boundary"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Resultados privados y trazables.</strong><p className="small muted">Solo el docente propietario puede consultar este panel. Las revisiones anteriores no se sobrescriben.</p></div></aside>
  </TeacherOnly>;
}

export function TeacherResultDetail() {
  const { id = '', attemptId = '' } = useParams(); const [detail, setDetail] = useState<Detail | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [reason, setReason] = useState(''); const [points, setPoints] = useState<Record<string,string>>({}); const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; api<Detail>(`/classrooms/${id}/results/attempts/${attemptId}`).then(value => { if (active) { setDetail(value); setPoints(Object.fromEntries(value.grade?.items.filter(item => item.outcome === 'pending_review').map(item => [item.id, String(item.pointsAwarded)]) || [])); setError(''); } }).catch(reasonValue => { if (active) setError((reasonValue as Error).message); }); return () => { active = false; }; }, [attemptId, id, revision]);
  async function review() {
    if (!detail?.grade) return; const pending = detail.grade.items.filter(item => item.outcome === 'pending_review'); setBusy(true); setError('');
    try { await api(`/classrooms/${id}/results/attempts/${attemptId}/review`, { method: 'POST', body: JSON.stringify({ expectedRevision: detail.grade.revision, operationId: crypto.randomUUID(), reason, adjustments: pending.map(item => ({ attemptItemId: item.id, points: Number(points[item.id]) })) }) }); setReason(''); setRevision(value => value + 1); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  if (!detail && !error) return <TeacherOnly><p role="status">Recuperando resultado…</p></TeacherOnly>;
  if (!detail) return <TeacherOnly><section className="panel"><EmptyState title="No pudimos abrir el resultado">{error}</EmptyState></section></TeacherOnly>;
  const pending = detail.grade?.items.filter(item => item.outcome === 'pending_review') || [];
  return <TeacherOnly><Link className="text-link assessment-back" to={`/docente/cursos/${id}/resultados`}><ArrowLeft size={17} aria-hidden="true" /> Volver a resultados</Link><PageHeading eyebrow={`VERSIÓN PUBLICADA ${detail.assessmentRevision}`} title={detail.studentName} description={`${detail.assessmentTitle} · Entrega ${formatDate(detail.submittedAt)}`} />
    {error && <p className="error" role="alert">{error}</p>}
    <section className="panel result-detail"><header><ClipboardCheck aria-hidden="true" /><div><p className="eyebrow">CALIFICACIÓN ACTUAL</p><h2>{detail.grade ? `${detail.grade.score} / ${detail.grade.maxScore} puntos` : 'Corrección pendiente'}</h2></div>{detail.grade && <Badge tone={detail.grade.status === 'final' ? 'green' : 'amber'}>{detail.grade.status === 'final' ? 'Final' : 'Provisional'}</Badge>}</header>
      <div className="result-item-list">{detail.grade?.items.map(item => <article key={item.id}><div><strong>Pregunta {item.position}</strong><p>{item.statement}</p></div><Badge tone={item.outcome === 'correct' ? 'green' : item.outcome === 'pending_review' ? 'amber' : ''}>{item.pointsAwarded} / {item.maxPoints}</Badge></article>)}</div>
    </section>
    {pending.length > 0 && <section className="panel review-panel"><h2>Resolver revisión matemática</h2><p className="muted">Asigna el puntaje autorizado a cada caso indeterminado. Se creará una nueva revisión sin modificar respuestas.</p>{pending.map(item => <label key={item.id}>Pregunta {item.position} · máximo {item.maxPoints}<input type="number" min="0" max={item.maxPoints} step="0.01" value={points[item.id] ?? ''} onChange={event => setPoints(current => ({ ...current, [item.id]: event.target.value }))} /></label>)}<label>Motivo del ajuste<textarea minLength={10} maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)} /></label><button className="button primary" disabled={busy || reason.trim().length < 10 || pending.some(item => Number(points[item.id]) < 0 || Number(points[item.id]) > item.maxPoints)} onClick={() => void review()}>{busy ? 'Guardando revisión…' : 'Crear calificación final'}</button></section>}
    <section className="panel grade-history"><h2><History size={19} aria-hidden="true" /> Historial inmutable</h2>{detail.history.map(item => <article key={item.id}><div><strong>Revisión {item.revision}</strong><span className="small muted">{formatDate(item.gradedAt)} · {item.source === 'system' ? 'Sistema' : 'Docente'}</span></div><span>{item.score} / {item.maxScore}</span>{item.reason && <p>{item.reason}</p>}</article>)}</section>
  </TeacherOnly>;
}
