import { useEffect, useState } from 'react';
import { api } from '../auth/api';

export type DraftContent = { statement: string; alternatives: string[]; proposedAnswer: number; explanation: string; difficulty: string; topic: string; operation: string; expression: string; reviewed: boolean; nodeId: string | null; materialId: string | null };
type Draft = { id: string; version: number; content: DraftContent; review_status: string; updated_at: string };
const statuses: Record<string, string> = { draft: 'Pendiente de revisión', reviewed: 'Revisado · sin publicar', invalid: 'Opción única inválida', indeterminate: 'Comprobación indeterminada' };

export function QuestionDraftBank({ classroomId, content, onLoad, disabled }: { classroomId: string; content: DraftContent; onLoad: (value: DraftContent) => void; disabled: boolean }) {
  const [rows, setRows] = useState<Draft[]>([]), [selected, setSelected] = useState<Draft | null>(null);
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [searched, setSearched] = useState(false), [filter, setFilter] = useState(false);
  const base = `/classrooms/${classroomId}/question-drafts`;
  const dirty = selected ? JSON.stringify(content) !== JSON.stringify(selected.content) : Boolean(content.statement.trim());
  useEffect(() => {
    let active = true;
    api<Draft[]>(`${base}?q=`).then(result => { if (active) { setRows(result); setSearched(true); } })
      .catch(reason => { if (active) setError((reason as Error).message); })
    return () => { active = false; };
  }, [base]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  async function consult() {
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ q: query });
      if (filter && content.nodeId) params.set('nodeId', content.nodeId);
      setRows(await api<Draft[]>(`${base}?${params}`)); setSearched(true);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const row = await api<Draft>(selected ? `${base}/${selected.id}` : base, { method: selected ? 'PUT' : 'POST', body: JSON.stringify({ ...content, ...(selected ? { version: selected.version } : {}) }) });
      setSelected(row); setRows(previous => [row, ...previous.filter(item => item.id !== row.id)]);
      setMessage(`Borrador guardado · versión ${row.version}. ${statuses[row.review_status]}.`);
    } catch (reason) { setError(`${(reason as Error).message} Tus campos permanecen en el editor.`); } finally { setBusy(false); }
  }
  async function open(row: Draft) {
    if (content.statement && !window.confirm('¿Cargar este borrador? Conserva primero los cambios del editor que quieras guardar.')) return;
    setBusy(true); setError('');
    try { const current = await api<Draft>(`${base}/${row.id}`); onLoad(current.content); setSelected(current); setMessage(`Recuperado · versión ${current.version}. ${statuses[current.review_status]}.`); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function discard() {
    if (!selected || !window.confirm('¿Descartar este borrador guardado? Se ocultará del banco, sin borrar sus datos. El editor conservará el contenido.')) return;
    setBusy(true); setError('');
    try {
      await api(`${base}/${selected.id}/discard`, { method: 'POST', body: JSON.stringify({ version: selected.version, confirmed: true }) });
      setRows(previous => previous.filter(row => row.id !== selected.id)); setSelected(null); setMessage('Borrador descartado. Los campos del editor se conservan.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <section aria-label="Banco persistente de borradores" className="form-stack question-draft-bank">
    <h3>Banco de borradores del aula</h3>
    <p>Guarda antes de salir. Solo los borradores guardados se recuperan tras recargar o volver a iniciar sesión. No se publican exámenes.</p>
    {dirty && <p role="status">Hay cambios del editor sin guardar.</p>}
    <div className="button-row">
      <button type="button" className="button primary" disabled={busy || disabled || !content.statement.trim() || content.alternatives.length < 2} onClick={() => void save()}>Guardar borrador{selected ? ` · v${selected.version}` : ''}</button>
      {selected && <><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => { setSelected(null); setMessage('El próximo guardado creará otro borrador con el contenido actual.'); }}>Guardar como otro borrador</button><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void discard()}>Descartar borrador guardado</button></>}
    </div>
    {busy && <p role="status">Consultando PostgreSQL…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
    <label>Buscar por enunciado o tema<input maxLength={160} value={query} onChange={event => setQuery(event.target.value)}/></label>
    <label className="local-ai-consent"><input type="checkbox" checked={filter} disabled={!content.nodeId} onChange={event => setFilter(event.target.checked)}/>Solo el nodo académico seleccionado</label>
    <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void consult()}>Consultar borradores guardados</button>
    {searched && !rows.length && <p>No se encontraron borradores para esta búsqueda.</p>}
    {rows.length > 0 && <ul>{rows.map(row => <li key={row.id}><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void open(row)}>{row.content.statement.slice(0, 100)} · v{row.version}</button><p className="small muted">{row.content.topic || 'Sin tema libre'} · {statuses[row.review_status]} · {new Date(row.updated_at).toLocaleString('es-PE')}</p></li>)}</ul>}
    <p className="small muted">Se muestran hasta 100 resultados recientes. La verificación matemática se repite en el servidor al guardar una revisión.</p>
  </section>;
}
