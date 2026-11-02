import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Search, Trash2 } from "lucide-react";
import { Badge, EmptyState, MathBlock, Modal, PageHeading } from "../components/ui";
import { useDemo } from "../state/DemoContext";
import type { Question } from "../state/academic";

export function QuestionBank() {
  const { bank, classrooms } = useDemo();
  const [params, setParams] = useSearchParams();
  const query = params.get("buscar") || "";
  const topic = params.get("tema") || "";
  const state = params.get("estado") || "";
  const classroom = classrooms.find((item) => item.id === params.get("aula"));
  const scoped = classroom ? bank.filter((question) => question.classroomId === classroom.id) : bank;
  const topics = [...new Set(scoped.map((question) => question.topic))];

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const shown = scoped.filter(
    (question) =>
      `${question.text} ${question.topic}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (!topic || question.topic === topic) &&
      (!state || question.state === state),
  );
  const context = classroom ? `?aula=${encodeURIComponent(classroom.id)}` : "";
  return (
    <>
      <PageHeading
        eyebrow="RECURSOS / PREGUNTAS"
        title="Banco de preguntas"
        description={classroom ? `Biblioteca exclusiva de ${classroom.name}, sección ${classroom.section}.` : "Bibliotecas organizadas por aula y tema."}
        action={
          <Link className="button primary" to={`/docente/banco/nueva${context}`}>
            <Plus size={18} aria-hidden="true" /> Crear pregunta
          </Link>
        }
      />
      {classroom && (
        <div className="context-strip">
          <Link to={`/docente/aulas/${classroom.id}`}>← {classroom.name} · Sección {classroom.section}</Link>
          <span>Las preguntas de otras aulas no se muestran ni se mezclan.</span>
        </div>
      )}
      <div className="filter-bar">
        <label className="filter-search">
          Buscar pregunta
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input name="buscar-pregunta" autoComplete="off" value={query} onChange={(event) => filter("buscar", event.target.value)} placeholder="Enunciado o tema…" />
          </div>
        </label>
        <label>Tema<select name="filtro-tema" value={topic} onChange={(event) => filter("tema", event.target.value)}><option value="">Todos los temas</option>{topics.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Estado de revisión<select name="filtro-revision" value={state} onChange={(event) => filter("estado", event.target.value)}><option value="">Todos los estados</option><option>Revisada</option><option>Pendiente de revisión</option></select></label>
      </div>
      <p className="results-count" role="status">{shown.length} {shown.length === 1 ? "pregunta encontrada" : "preguntas encontradas"}</p>
      <div className="question-list">
        {shown.map((question, index) => {
          const owner = classrooms.find((item) => item.id === question.classroomId);
          return (
            <article className="question-row" key={question.id}>
              <span className="row-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="meta-row"><span>{owner?.name || "Aula no disponible"} · {question.topic}</span><Badge tone={question.state === "Revisada" ? "green" : "amber"}>{question.state}</Badge></div>
                <h2><Link to={`/docente/banco/${question.id}${context}`}>{question.text}</Link></h2>
                {question.formula && <MathBlock formula={question.formula} />}
              </div>
              <Link className="button secondary" to={`/docente/banco/${question.id}${context}`}>Ver y editar <ArrowRight size={16} aria-hidden="true" /></Link>
            </article>
          );
        })}
      </div>
      {!shown.length && (
        <EmptyState title={scoped.length ? "No hay preguntas con esos filtros" : classroom ? "Todavía no tienes preguntas para esta aula" : "Todavía no hay preguntas"}>
          {scoped.length ? (
            <>Prueba otro tema o <button className="text-link" onClick={() => setParams(classroom ? { aula: classroom.id } : {})}>limpia los filtros</button>.</>
          ) : (
            <Link className="button primary" to={`/docente/banco/nueva${context}`}>Crear primera pregunta</Link>
          )}
        </EmptyState>
      )}
    </>
  );
}

function blankQuestion(classroomId = ""): Question {
  return {
    id: crypto.randomUUID(),
    classroomId,
    topic: "",
    text: "",
    formula: "",
    options: ["", "", "", ""],
    correct: 0,
    state: "Pendiente de revisión",
    rule: "",
    steps: ["", "", ""],
    errors: ["", "", "", ""],
    recommendation: "",
  };
}

function validateQuestion(question: Question) {
  if (!question.classroomId) return "Selecciona el aula de destino.";
  if (!question.topic.trim() || !question.text.trim()) return "Completa el tema y el enunciado.";
  if (question.options.length < 2 || question.options.length > 6) return "Configura entre 2 y 6 alternativas.";
  if (question.options.some((option) => !option.trim())) return "Completa todas las alternativas.";
  if (new Set(question.options.map((option) => option.trim().toLocaleLowerCase())).size !== question.options.length) return "Las alternativas deben ser diferentes.";
  if (question.correct < 0 || question.correct >= question.options.length) return "Selecciona exactamente una respuesta correcta.";
  if (!question.rule.trim() || question.steps.some((step) => !step.trim())) return "Completa la regla y el procedimiento paso a paso.";
  return "";
}

async function validMath(question: Question) {
  if (!question.formula.trim()) return true;
  try {
    const { default: katex } = await import("katex");
    for (const formula of [question.formula, ...question.options])
      katex.renderToString(formula, { throwOnError: true, trust: false });
    return true;
  } catch {
    return false;
  }
}

export function QuestionDetail() {
  const { id } = useParams();
  return <QuestionEditor key={id} />;
}

function QuestionEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { bank, setBank, classrooms, assessments, setAssessments } = useDemo();
  const existing = bank.find((question) => question.id === id);
  const creating = id === "nueva";
  const [draft, setDraft] = useState<Question>(() => existing ? structuredClone(existing) : blankQuestion(params.get("aula") || ""));
  const [editing, setEditing] = useState(creating);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const classroom = classrooms.find((item) => item.id === draft.classroomId);
  const context = draft.classroomId ? `?aula=${encodeURIComponent(draft.classroomId)}` : "";
  const usedBy = assessments.filter((assessment) => assessment.questionIds.includes(draft.id));

  const previewErrors = useMemo(
    () => draft.errors.map((value, index) => value || (index === draft.correct ? "" : "Retroalimentación opcional no configurada.")),
    [draft.errors, draft.correct],
  );

  if (!creating && !existing)
    return <EmptyState title="Pregunta no disponible"><Link to="/docente/banco">Volver al banco</Link></EmptyState>;

  function update(patch: Partial<Question>) {
    setDraft((current) => ({ ...current, ...patch, state: "Pendiente de revisión" }));
    setReviewed(false);
    setError("");
  }

  function resizeOptions(delta: 1 | -1) {
    const size = draft.options.length + delta;
    if (size < 2 || size > 6) return;
    if (delta === 1) update({ options: [...draft.options, ""], errors: [...draft.errors, ""] });
    else update({ options: draft.options.slice(0, -1), errors: draft.errors.slice(0, -1), correct: Math.min(draft.correct, size - 1) });
  }

  async function save() {
    const issue = validateQuestion(draft);
    if (issue) { setError(issue); return; }
    if (!(await validMath(draft))) { setError("Revisa la sintaxis LaTeX de la fórmula y de las alternativas."); return; }
    const next = { ...draft, state: "Pendiente de revisión" as const };
    setBank((all) => creating ? [...all, next] : all.map((question) => question.id === next.id ? next : question));
    setDraft(next);
    setEditing(false);
    if (creating) navigate(`/docente/banco/${next.id}?aula=${encodeURIComponent(next.classroomId)}`, { replace: true });
  }

  async function approve() {
    const issue = validateQuestion(draft);
    if (issue) { setError(issue); return; }
    if (!(await validMath(draft))) { setError("Revisa la sintaxis LaTeX de la fórmula y de las alternativas."); return; }
    const next = { ...draft, state: "Revisada" as const };
    setBank((all) => all.map((question) => question.id === next.id ? next : question));
    setDraft(next);
    setReviewed(false);
    setError("");
  }

  function remove() {
    setBank((all) => all.filter((question) => question.id !== draft.id));
    setAssessments((all) => all.map((assessment) => assessment.status === "Publicada" ? assessment : { ...assessment, questionIds: assessment.questionIds.filter((questionId) => questionId !== draft.id) }));
    navigate(`/docente/banco${context}`);
  }

  return (
    <>
      <Link className="text-link" to={`/docente/banco${context}`}>← Banco de preguntas</Link>
      <PageHeading
        eyebrow={creating ? "BANCO / NUEVA PREGUNTA" : `${draft.topic.toUpperCase() || "SIN TEMA"} / ${classroom?.name || "AULA"}`}
        title={creating ? "Crear pregunta" : "Detalle de pregunta"}
        description="Cada pregunta pertenece a un aula. Guardarla no certifica su corrección matemática."
        action={!creating ? <div className="button-row"><button className="button secondary" onClick={() => setEditing((value) => !value)}>{editing ? "Cancelar edición" : "Editar pregunta"}</button><button className="icon-button danger-action" aria-label="Eliminar pregunta" onClick={() => setRemoving(true)}><Trash2 size={18} aria-hidden="true" /></button></div> : undefined}
      />
      <div className="detail-grid">
        <section className="panel">
          <Badge tone={draft.state === "Revisada" ? "green" : "amber"}>{draft.state}</Badge>
          {editing ? (
            <div className="form-stack question-edit">
              <label>Aula de destino<select name="aula" value={draft.classroomId} onChange={(event) => update({ classroomId: event.target.value })}><option value="">Seleccionar aula</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.section} · {item.period}</option>)}</select></label>
              <label>Tema<input name="tema" autoComplete="off" maxLength={80} value={draft.topic} onChange={(event) => update({ topic: event.target.value })} placeholder="Por ejemplo, Ecuaciones logarítmicas…" /></label>
              <label>Enunciado<textarea name="enunciado" autoComplete="off" rows={3} maxLength={500} value={draft.text} onChange={(event) => update({ text: event.target.value })} /></label>
              <label>Expresión matemática <span className="muted">(opcional, LaTeX)</span><input name="formula" autoComplete="off" spellCheck={false} value={draft.formula} onChange={(event) => update({ formula: event.target.value })} placeholder="Por ejemplo, \log_2(x)=3…" /></label>
              {draft.formula && <div className="math-preview"><span className="small muted">Vista previa</span><MathBlock formula={draft.formula} /></div>}
              <fieldset className="option-editor"><legend>Alternativas y respuesta correcta</legend>{draft.options.map((option, index) => <div className="option-edit-row" key={index}><label className="correct-choice"><input type="radio" name="correcta" checked={draft.correct === index} onChange={() => update({ correct: index })} /><span>Correcta</span></label><label>Alternativa {index + 1}<input name={`alternativa-${index + 1}`} autoComplete="off" value={option} onChange={(event) => update({ options: draft.options.map((value, optionIndex) => optionIndex === index ? event.target.value : value) })} /></label></div>)}<div className="button-row"><button type="button" className="button secondary" disabled={draft.options.length <= 2} onClick={() => resizeOptions(-1)}>Quitar alternativa</button><button type="button" className="button secondary" disabled={draft.options.length >= 6} onClick={() => resizeOptions(1)}>Agregar alternativa</button></div></fieldset>
              <label>Regla o concepto utilizado<textarea name="regla" autoComplete="off" rows={2} value={draft.rule} onChange={(event) => update({ rule: event.target.value })} /></label>
              <fieldset><legend>Procedimiento paso a paso</legend>{draft.steps.map((step, index) => <label key={index}>Paso {index + 1}<textarea name={`paso-${index + 1}`} autoComplete="off" rows={2} value={step} onChange={(event) => update({ steps: draft.steps.map((value, stepIndex) => stepIndex === index ? event.target.value : value) })} /></label>)}</fieldset>
              <fieldset><legend>Retroalimentación para respuestas incorrectas <span className="muted">(opcional)</span></legend>{draft.options.map((_, index) => index !== draft.correct && <label key={index}>Alternativa {index + 1}<textarea name={`retroalimentacion-${index + 1}`} autoComplete="off" rows={2} value={draft.errors[index]} onChange={(event) => update({ errors: draft.errors.map((value, errorIndex) => errorIndex === index ? event.target.value : value) })} /></label>)}</fieldset>
              <label>Recomendación de reforzamiento <span className="muted">(opcional)</span><textarea name="recomendacion" autoComplete="off" rows={2} value={draft.recommendation} onChange={(event) => update({ recommendation: event.target.value })} /></label>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="button-row"><button className="button primary" onClick={save}>{creating ? "Guardar pregunta" : "Guardar cambios"}</button></div>
            </div>
          ) : (
            <>
              <p className="small muted">{classroom?.name} · {classroom?.period} · Sección {classroom?.section}</p>
              <h2>{draft.text}</h2>
              {draft.formula && <MathBlock formula={draft.formula} />}
              <ol className="option-preview" type="A">{draft.options.map((option, index) => <li key={index}><MathBlock formula={option} block={false} />{index === draft.correct && <Badge tone="green">Respuesta</Badge>}</li>)}</ol>
              <h3>Regla matemática</h3><p>{draft.rule}</p>
              <ol className="solution-steps">{draft.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              {previewErrors.some(Boolean) && <p className="small muted">La retroalimentación específica se mostrará después de responder.</p>}
            </>
          )}
        </section>
        <aside>
          {!creating && <div className="panel"><h2>Revisión docente</h2><p className="muted">AULIGMA valida la estructura y la sintaxis LaTeX, no el razonamiento matemático.</p>{draft.state !== "Revisada" && <><label className="check-label"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />He comprobado manualmente enunciado, respuesta y procedimiento.</label><button className="button primary" disabled={!reviewed || editing} onClick={approve}>Marcar revisada · demo</button></>}{error && !editing && <p className="error" role="alert">{error}</p>}<Link className="text-link" to={`/docente/evaluaciones/nueva?aula=${encodeURIComponent(draft.classroomId)}&pregunta=${draft.id}`}>Usar en evaluación <ArrowRight size={16} aria-hidden="true" /></Link></div>}
          <p className="notice">{usedBy.length ? `Esta pregunta participa en ${usedBy.length} actividad${usedBy.length === 1 ? "" : "es"}. Las publicaciones conservan su propia copia.` : "Todavía no se usa en una evaluación."}</p>
        </aside>
      </div>
      <Modal open={removing} onOpenChange={setRemoving} title="Eliminar pregunta" description="Se retirará de borradores y revisiones. Las evaluaciones ya publicadas conservarán su copia."><div className="button-row"><button className="button secondary" onClick={() => setRemoving(false)}>Conservar pregunta</button><button className="button danger" onClick={remove}>Confirmar eliminación</button></div></Modal>
    </>
  );
}
