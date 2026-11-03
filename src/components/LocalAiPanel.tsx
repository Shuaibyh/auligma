import { useEffect, useRef, useState } from 'react';
import { api } from '../auth/api';
import { QuestionDraftBank } from './QuestionDraftBank';
import './local-ai.css';

export function LocalAiPanel({ classroomId, sources, disabled, onProposal, nodes = [], materials = [] }: {
  classroomId: string; sources: { id: string; fileName: string; status: string }[]; disabled: boolean; onProposal: (id: string) => Promise<void>;
  nodes?: { id: string; title: string }[]; materials?: { id: string; nodeId: string; title: string }[];
}) {
  const modeStorageKey = `auligma.local-ai.mode.${classroomId}`;
  const [mode, setMode] = useState(() => {
    const saved = sessionStorage.getItem(modeStorageKey);
    return saved === 'question' || saved === 'exercise' ? saved : 'syllabus';
  }), [sourceId, setSourceId] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [image, setImage] = useState('');
  const [statement, setStatement] = useState(''), [alternatives, setAlternatives] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const [expression, setExpression] = useState(''), [operation, setOperation] = useState('derivative'), [reviewed, setReviewed] = useState(false);
  const [verification, setVerification] = useState<{ explanation: string; singleChoiceValid: boolean; correctIndices?: number[]; restrictions?: string[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDetailsElement | null>(null);
  const revision = useRef(0);
  const [nodeId, setNodeId] = useState(''), [materialId, setMaterialId] = useState(''), [proposedAnswer, setProposedAnswer] = useState(0);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { sessionStorage.setItem(modeStorageKey, mode); }, [mode, modeStorageKey]);
  useEffect(() => { if (mode === 'question' && panel.current) panel.current.open = true; }, [mode]);
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
        const result = await api<{ statement: string; expression: string; alternatives: string[]; warnings: string[]; explanation: string; proposedAnswer: number }>(`/classrooms/${classroomId}/ai/questions`, { method: 'POST', signal: abort.current.signal, body: JSON.stringify({ topic, subtopic, sourceText, difficulty, consent }) });
        if (revision.current !== version) { setError('Conservamos tus cambios recientes. Repite el análisis cuando termines de editar.'); return; }
        setStatement(result.statement); setExpression(result.expression); setAlternatives(result.alternatives.join('\n')); setWarnings(result.warnings); setExplanation(result.explanation); setProposedAnswer(result.proposedAnswer); invalidate();
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
  return <details ref={panel} className="panel local-ai-panel"><summary>Asistente local · Sílabos, ejercicios y banco de borradores</summary><div className="form-stack">
    <p>Ollama procesa en este equipo. Todo resultado requiere revisión docente; no se publica automáticamente.</p>
    <label>Análisis<select aria-label="Análisis" disabled={busy} value={mode} onChange={event => setMode(event.target.value)}><option value="syllabus">Sílabo PDF extraído</option><option value="exercise">Ejercicio matemático</option><option value="question">Borrador de pregunta y banco</option></select></label>
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
      {mode === 'question' ? <>
        <label>Nodo académico<select value={nodeId} onChange={event => { setNodeId(event.target.value); setMaterialId(''); invalidate(); }}><option value="">Sin vinculación académica</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
        <label>Material de origen<select value={materialId} onChange={event => { setMaterialId(event.target.value); invalidate(); }}><option value="">Sin material</option>{materials.filter(item => !nodeId || item.nodeId === nodeId).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Respuesta propuesta<select value={proposedAnswer} onChange={event => { setProposedAnswer(Number(event.target.value)); invalidate(); }}>{alternatives.split('\n').filter(Boolean).map((_, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)}</option>)}</select></label>
        <p>Al marcar la revisión también confirmas haber revisado el enunciado y la explicación. SymPy solo comprueba las expresiones admitidas.</p>
        <QuestionDraftBank classroomId={classroomId} disabled={busy || disabled} content={{ statement, alternatives: alternatives.split('\n').filter(Boolean), proposedAnswer, explanation, difficulty, topic, operation, expression, reviewed, nodeId: nodeId || null, materialId: materialId || null }} onLoad={value => {
          setStatement(value.statement); setAlternatives(value.alternatives.join('\n')); setProposedAnswer(value.proposedAnswer); setExplanation(value.explanation); setDifficulty(value.difficulty); setTopic(value.topic); setOperation(value.operation); setExpression(value.expression); setNodeId(value.nodeId || ''); setMaterialId(value.materialId || ''); setWarnings([]); invalidate();
        }}/>
      </> : <p className="small muted">La transcripción permanece en memoria; selecciona «Borrador de pregunta por tema» para revisarla y guardarla.</p>}
    </>}
  </div></details>;
}
