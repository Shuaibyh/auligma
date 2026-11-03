import { useEffect, useRef, useState } from 'react';
import { api } from '../auth/api';
import './local-ai.css';

export function LocalAiPanel({ classroomId, sources, disabled, onProposal }: {
  classroomId: string; sources: { id: string; fileName: string; status: string }[]; disabled: boolean; onProposal: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState('syllabus'), [sourceId, setSourceId] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [image, setImage] = useState('');
  const [statement, setStatement] = useState(''), [alternatives, setAlternatives] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const [expression, setExpression] = useState(''), [operation, setOperation] = useState('derivative'), [reviewed, setReviewed] = useState(false);
  const [verification, setVerification] = useState<{ explanation: string; singleChoiceValid: boolean; correctIndices?: number[]; restrictions?: string[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const revision = useRef(0);
  useEffect(() => () => abort.current?.abort(), []);
  const [topic, setTopic] = useState(''), [subtopic, setSubtopic] = useState(''), [sourceText, setSourceText] = useState(''), [difficulty, setDifficulty] = useState('básica'), [explanation, setExplanation] = useState('');
  function invalidate() { revision.current++; setReviewed(false); setVerification(null); }
  async function run() {
    const version = revision.current;
    setBusy(true); setError(''); abort.current = new AbortController();
    try {
      if (mode === 'syllabus') {
        const result = await api<{ id: string }>(`/classrooms/${classroomId}/syllabus/${sourceId}/propose-local`, { method: 'POST', signal: abort.current.signal, body: JSON.stringify({ consent }) });
        await onProposal(result.id);
      } else if (mode === 'question') {
        const result = await api<{ statement: string; alternatives: string[]; warnings: string[]; explanation: string }>(`/classrooms/${classroomId}/ai/questions`, { method: 'POST', signal: abort.current.signal, body: JSON.stringify({ topic, subtopic, sourceText, difficulty, consent }) });
        if (revision.current !== version) { setError('Conservamos tus cambios recientes. Repite el análisis cuando termines de editar.'); return; }
        setStatement(result.statement); setAlternatives(result.alternatives.join('\n')); setWarnings(result.warnings); setExplanation(result.explanation); invalidate();
      } else {
        const result = await api<{ statement: string; alternatives: string[]; warnings: string[] }>(`/classrooms/${classroomId}/ai/transcribe`, { method: 'POST', signal: abort.current.signal, body: JSON.stringify({ consent, image }) });
        if (revision.current !== version) { setError('Conservamos tus cambios recientes. Repite el análisis cuando termines de editar.'); return; }
        setStatement(result.statement); setAlternatives(result.alternatives.join('\n')); setWarnings(result.warnings); invalidate();
      }
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function verify() {
    const version = revision.current;
    setBusy(true); setError(''); setVerification(null);
    try { const result = await api<NonNullable<typeof verification>>(`/classrooms/${classroomId}/ai/verify`, { method: 'POST', body: JSON.stringify({ operation, expression, alternatives: alternatives.split('\n').filter(Boolean), reviewed }) }); if (revision.current === version) setVerification(result); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <details className="panel local-ai-panel"><summary>Asistente local · Sílabos y ejercicios</summary><div className="form-stack">
    <p>Ollama procesa en este equipo. Todo resultado requiere revisión docente; no se publica automáticamente.</p>
    <label>Análisis<select aria-label="Análisis" disabled={busy} value={mode} onChange={event => setMode(event.target.value)}><option value="syllabus">Sílabo PDF extraído</option><option value="exercise">Ejercicio matemático</option><option value="question">Borrador de pregunta por tema</option></select></label>
    {mode === 'syllabus' ? <label>Documento<select value={sourceId} disabled={busy} onChange={event => setSourceId(event.target.value)}><option value="">Selecciona un sílabo</option>{sources.filter(source => source.status === 'extracted').map(source => <option key={source.id} value={source.id}>{source.fileName}</option>)}</select></label> : mode === 'question' ? <>
      <label>Tema<input maxLength={160} value={topic} onChange={event => setTopic(event.target.value)}/></label>
      <label>Subtema<input maxLength={160} value={subtopic} onChange={event => setSubtopic(event.target.value)}/></label>
      <label>Dificultad<select value={difficulty} onChange={event => setDifficulty(event.target.value)}>{['básica','intermedia','avanzada'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Fragmento fuente opcional<textarea maxLength={3500} value={sourceText} onChange={event => setSourceText(event.target.value)}/></label>
    </> : <>
      <label>Imagen PNG · hasta 2 MB<input type="file" accept="image/png" disabled={busy} onChange={event => {
        setImage(''); invalidate(); const file = event.target.files?.[0]; if (!file) return;
        if (file.type !== 'image/png' || file.size > 2_000_000) { setError('Selecciona un PNG de hasta 2 MB.'); return; }
        const reader = new FileReader(); reader.onload = () => setImage(String(reader.result).split(',')[1]); reader.readAsDataURL(file);
      }}/></label>
    </>}
    <label className="local-ai-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>Autorizo el procesamiento local de este documento.</label>
    <div className="button-row"><button type="button" className="button secondary" disabled={busy || disabled || !consent || !(mode === 'syllabus' ? sourceId : mode === 'question' ? topic.trim() : image)} onClick={() => void run()}>Analizar localmente</button>{busy && <button type="button" className="button secondary" onClick={() => abort.current?.abort()}>Cancelar análisis</button>}</div>
    {busy && <p role="status">Procesando en este equipo… Puede tardar varios minutos.</p>}{error && <p role="alert" className="error">{error}</p>}
    {mode !== 'syllabus' && <>
      {warnings.map((warning, index) => <p key={index} role="status">Revisar: {warning}</p>)}
      <label>Enunciado reconocido<textarea value={statement} onChange={event => { setStatement(event.target.value); invalidate(); }}/></label>
      {mode === 'question' && <label>Explicación propuesta · requiere revisión<textarea value={explanation} onChange={event => { setExplanation(event.target.value); invalidate(); }}/></label>}
      <p>Corrige la transcripción. Para verificar, escribe multiplicación explícita (*), potencias (**) y la variable x; una alternativa por línea.</p>
      <label>Comprobación<select value={operation} onChange={event => { setOperation(event.target.value); invalidate(); }}><option value="derivative">Derivada</option><option value="equivalence">Equivalencia</option></select></label>
      <label>Expresión original<input maxLength={500} value={expression} onChange={event => { setExpression(event.target.value); invalidate(); }}/></label>
      <label>Alternativas corregidas<textarea rows={5} value={alternatives} onChange={event => { setAlternatives(event.target.value); invalidate(); }}/></label>
      <label className="local-ai-consent"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>Revisé y corregí las expresiones.</label>
      <button type="button" className="button secondary" disabled={busy || !reviewed || !expression || !alternatives} onClick={() => void verify()}>Verificar con SymPy</button>
      {verification && <div role="status"><p>{verification.explanation}</p><p>{verification.singleChoiceValid ? 'Comprobación superada; pendiente de aprobación docente.' : 'Opción única bloqueada: corrige o revisa las alternativas.'}</p><p>Alternativas correctas: {verification.correctIndices?.map(index => String.fromCharCode(65 + index)).join(', ') || 'No determinadas'}</p>{verification.restrictions?.map((item, index) => <p key={index}>Dominio: {item}</p>)}</div>}
      <p className="small muted">Esta revisión permanece en memoria. El banco persistente de preguntas y su publicación corresponden a la siguiente fase.</p>
    </>}
  </div></details>;
}
