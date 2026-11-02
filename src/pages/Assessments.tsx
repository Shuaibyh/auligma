import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, Plus } from "lucide-react";
import {
  Badge,
  EmptyState,
  MathBlock,
  Modal,
  PageHeading,
} from "../components/ui";
import { useDemo } from "../state/DemoContext";
import { publicationIssues, type Assessment } from "../state/academic";
export function Assessments() {
  const { assessments, classrooms } = useDemo();
  const [params] = useSearchParams();
  const classroomId = params.get("aula");
  const rows = assessments.filter(
    (a) => !classroomId || a.classroomId === classroomId,
  );
  return (
    <>
      <PageHeading
        eyebrow="PLANIFICACIÓN / ACTIVIDADES"
        title="Evaluaciones"
        description="Configura actividades, revisa sus requisitos y simula su publicación."
        action={
          <Link
            className="button primary"
            to={`/docente/evaluaciones/nueva${classroomId ? `?aula=${encodeURIComponent(classroomId)}` : ""}`}
          >
            <Plus size={18} />
            Crear evaluación
          </Link>
        }
      />
      {classroomId && (
        <Link className="text-link" to="/docente/evaluaciones">
          Ver todas las aulas
        </Link>
      )}
      <div className="question-list">
        {rows.map((a) => (
          <article className="assessment-row" key={a.id}>
            <div>
              <div className="meta-row">
                <Badge
                  tone={
                    a.status === "Publicada"
                      ? "green"
                      : a.status === "Pendiente de revisión"
                        ? "amber"
                        : ""
                  }
                >
                  {a.status}
                </Badge>
                <span>
                  {a.mode} · {a.questionIds.length} preguntas · {a.attemptPolicy.mode === "unlimited" ? "Intentos ilimitados" : `${a.attemptPolicy.maxAttempts} intentos`}
                </span>
              </div>
              <h2>{a.title || "Borrador sin título"}</h2>
              <p className="muted">
                {classrooms.find((c) => c.id === a.classroomId)?.name ||
                  "Aula sin asignar"}{" "}
                · Datos ficticios
              </p>
            </div>
            <Link
              className="button secondary"
              to={`/docente/evaluaciones/${a.id}`}
            >
              {a.status === "Publicada" ? "Ver publicación" : "Configurar"}
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      {!rows.length && (
        <EmptyState title="Todavía no hay evaluaciones">
          Crea una actividad para esta aula.
        </EmptyState>
      )}
    </>
  );
}
export function AssessmentEditor() {
  const { id } = useParams();
  return <AssessmentEditorContent key={id} />;
}
function AssessmentEditorContent() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { assessments, setAssessments, classrooms, bank } = useDemo();
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const existing = assessments.find((a) => a.id === id);
  const [draft, setDraft] = useState<Assessment>(
    () =>
      existing || {
        id: crypto.randomUUID(),
        title: "",
        classroomId: params.get("aula") || "",
        questionIds: params.get("pregunta") ? [params.get("pregunta")!] : [],
        mode: "Práctica",
        start: "",
        end: "",
        attemptPolicy: { mode: "unlimited" },
        instructions: "",
        status: "Borrador",
      },
  );
  const [message, setMessage] = useState("");
  const [lastMaxAttempts, setLastMaxAttempts] = useState(
    existing?.attemptPolicy.mode === "limited"
      ? existing.attemptPolicy.maxAttempts
      : 1,
  );
  if (id !== "nueva" && !existing)
    return (
      <EmptyState title="Evaluación no disponible">
        <Link to="/docente/evaluaciones">Volver a evaluaciones</Link>
      </EmptyState>
    );
  const item = existing || draft;
  const locked = item.status === "Publicada";
  const issues = publicationIssues(
    item,
    bank,
    classrooms.map((c) => c.id),
  );
  const selected =
    (locked
      ? item.snapshot
      : bank.filter((q) => item.questionIds.includes(q.id))) || [];
  const availableQuestions = bank.filter(
    (question) => question.classroomId === item.classroomId,
  );
  function update(patch: Partial<Assessment>) {
    setMessage("");
    setAck(false);
    const next = { ...item, ...patch, status: "Borrador" as const };
    setDraft(next);
    setAssessments((all) =>
      all.some((a) => a.id === next.id)
        ? all.map((a) => (a.id === next.id ? next : a))
        : [...all, next],
    );
  }
  function save(status: Assessment["status"]) {
    const next = { ...item, status };
    setAssessments((all) =>
      all.some((a) => a.id === next.id)
        ? all.map((a) => (a.id === next.id ? next : a))
        : [...all, next],
    );
    setMessage(
      status === "Borrador"
        ? "Borrador guardado en esta sesión."
        : "Evaluación pendiente de revisión.",
    );
    if (!existing)
      navigate(`/docente/evaluaciones/${next.id}`, { replace: true });
  }
  function publish() {
    const blockers = publicationIssues(
      item,
      bank,
      classrooms.map((c) => c.id),
    );
    if (blockers.length || !ack || item.status !== "Pendiente de revisión")
      return;
    const next = {
      ...item,
      status: "Publicada" as const,
      snapshot: structuredClone(selected),
    };
    setAssessments((all) => all.map((a) => (a.id === item.id ? next : a)));
    setConfirm(false);
    setMessage("Publicación simulada completada.");
  }
  return (
    <>
      <Link className="text-link" to="/docente/evaluaciones">
        ← Evaluaciones
      </Link>
      <PageHeading
        eyebrow="CONFIGURACIÓN ACADÉMICA"
        title={locked ? item.title : "Configurar evaluación"}
        description="Demostración local · Fechas de referencia en hora de Lima · Sin calificaciones oficiales."
      />
      {!locked && (
        <p className="save-note">
          Los cambios se conservan automáticamente en esta sesión. Recargar
          restablece la configuración docente.
        </p>
      )}
      <div className="evaluation-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>{locked ? "Actividad publicada" : "Datos de la actividad"}</h2>
            <Badge
              tone={
                locked
                  ? "green"
                  : item.status === "Pendiente de revisión"
                    ? "amber"
                    : ""
              }
            >
              {item.status}
            </Badge>
          </div>
          <fieldset disabled={locked} className="form-stack">
            <label>
              Título
              <input
                name="titulo"
                autoComplete="off"
                required
                maxLength={100}
                value={item.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Por ejemplo, Repaso de derivadas…"
              />
            </label>
            <div className="form-grid">
              <label>
                Aula
                <select
                  name="aula"
                  value={item.classroomId}
                  onChange={(e) =>
                    update({
                      classroomId: e.target.value,
                      questionIds: item.questionIds.filter((questionId) =>
                        bank.some(
                          (question) =>
                            question.id === questionId &&
                            question.classroomId === e.target.value,
                        ),
                      ),
                    })
                  }
                >
                  <option value="">Seleccionar aula</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.section} · {c.period}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Modalidad
                <select
                  name="modalidad"
                  value={item.mode}
                  onChange={(e) =>
                    update({ mode: e.target.value as Assessment["mode"] })
                  }
                >
                  <option>Práctica</option>
                  <option>Evaluación</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Apertura
                <input
                  name="apertura"
                  type="datetime-local"
                  value={item.start}
                  onChange={(e) => update({ start: e.target.value })}
                />
              </label>
              <label>
                Cierre
                <input
                  name="cierre"
                  type="datetime-local"
                  value={item.end}
                  onChange={(e) => update({ end: e.target.value })}
                />
              </label>
            </div>
            <fieldset className="attempt-policy">
              <legend>Intentos permitidos</legend>
              <label className={item.attemptPolicy.mode === "unlimited" ? "selected" : ""}>
                <input
                  type="radio"
                  name="attempt-policy"
                  checked={item.attemptPolicy.mode === "unlimited"}
                  onChange={() => update({ attemptPolicy: { mode: "unlimited" } })}
                />
                <span><strong>Intentos ilimitados</strong><small>El estudiante puede reiniciar la práctica localmente.</small></span>
              </label>
              <label className={item.attemptPolicy.mode === "limited" ? "selected" : ""}>
                <input
                  type="radio"
                  name="attempt-policy"
                  checked={item.attemptPolicy.mode === "limited"}
                  onChange={() =>
                    update({
                      attemptPolicy: {
                        mode: "limited",
                        maxAttempts: lastMaxAttempts,
                      },
                    })
                  }
                />
                <span><strong>Número específico</strong><small>Define un máximo entero positivo.</small></span>
              </label>
              {item.attemptPolicy.mode === "limited" && (
                <label>
                  Máximo de intentos
                  <input
                    name="maximo-intentos"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={item.attemptPolicy.maxAttempts || ""}
                    onChange={(e) =>
                      {
                        const value = Number(e.target.value);
                        setLastMaxAttempts(value);
                        update({
                          attemptPolicy: {
                            mode: "limited",
                            maxAttempts: value,
                          },
                        });
                      }
                    }
                  />
                </label>
              )}
            </fieldset>
            <label>
              Reglas e instrucciones
              <textarea
                name="instrucciones"
                autoComplete="off"
                rows={3}
                value={item.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
                placeholder="Indica cómo resolver la actividad…"
              />
            </label>
          </fieldset>
          <div className="section-heading">
            <h2>Preguntas ({item.questionIds.length})</h2>
            {!locked && (
              <Link
                className="text-link"
                to={`/docente/banco${item.classroomId ? `?aula=${item.classroomId}` : ""}`}
              >
                Abrir banco
              </Link>
            )}
          </div>
          {locked
            ? selected.map((q) => (
                <div className="selected-question" key={q.id}>
                  <strong>{q.text}</strong>
                  <MathBlock formula={q.formula} />
                </div>
              ))
            : availableQuestions.map((q) => (
                <label className="question-choice" key={q.id}>
                  <input
                    type="checkbox"
                    checked={item.questionIds.includes(q.id)}
                    onChange={(e) =>
                      update({
                        questionIds: e.target.checked
                          ? [...item.questionIds, q.id]
                          : item.questionIds.filter((key) => key !== q.id),
                      })
                    }
                  />
                  <span>
                    <strong>{q.text}</strong>
                    <span className="meta-row">
                      {q.topic}
                      <Badge tone={q.state === "Revisada" ? "green" : "amber"}>
                        {q.state}
                      </Badge>
                    </span>
                  </span>
                </label>
              ))}
          {!locked && item.classroomId && !availableQuestions.length && (
            <EmptyState title="Todavía no tienes preguntas para esta aula">
              <Link
                className="button primary"
                to={`/docente/banco/nueva?aula=${encodeURIComponent(item.classroomId)}`}
              >
                Crear primera pregunta
              </Link>
            </EmptyState>
          )}
          {!locked && !item.classroomId && (
            <p className="notice">Selecciona un aula para ver su banco de preguntas.</p>
          )}
          {!locked && (
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => save("Borrador")}
              >
                Guardar borrador
              </button>
              <button
                className="button primary"
                onClick={() => save("Pendiente de revisión")}
              >
                Enviar a revisión
              </button>
            </div>
          )}
          <p role="status" className="success-text">
            {message}
          </p>
        </section>
        <aside className="panel publication-checklist">
          <h2>
            {locked ? "Publicación de demostración" : "Antes de publicar"}
          </h2>
          {locked ? (
            <>
              <p>La actividad conserva una copia de sus preguntas revisadas.</p>
              <p className="muted">
                Las fechas y el consumo de intentos siguen siendo demostrativos:
                no existe un servicio que aplique restricciones institucionales.
              </p>
              <Link
                className="button primary"
                to={`/docente/evaluaciones/${item.id}/previsualizar`}
              >
                <Eye size={17} aria-hidden="true" />
                Previsualizar como estudiante
              </Link>
            </>
          ) : (
            <>
              <p className="muted">
                Completa la configuración y comprueba el contenido antes de
                confirmar.
              </p>
              {issues.length ? (
                <ul className="issue-list">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="success-text">
                  ✓ Configuración completa y preguntas revisadas.
                </p>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                He revisado preguntas, fechas y reglas.
              </label>
              <button
                className="button primary"
                disabled={
                  !!issues.length ||
                  !ack ||
                  item.status !== "Pendiente de revisión"
                }
                onClick={() => setConfirm(true)}
              >
                Simular publicación
              </button>
              {item.status === "Borrador" && (
                <p className="small muted">
                  Envía primero el borrador a revisión.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Publicar actividad de demostración"
        description="Se creará una copia local de las preguntas. No se envían avisos ni se generan calificaciones."
      >
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() => setConfirm(false)}
          >
            Volver a revisar
          </button>
          <button className="button primary" onClick={publish}>
            Confirmar publicación demo
          </button>
        </div>
      </Modal>
    </>
  );
}

export function AssessmentPreview() {
  const { id } = useParams();
  const { assessments, bank, classrooms } = useDemo();
  const item = assessments.find((assessment) => assessment.id === id);
  if (!item)
    return (
      <EmptyState title="Vista previa no disponible">
        <Link to="/docente/evaluaciones">Volver a evaluaciones</Link>
      </EmptyState>
    );
  const questions =
    item.snapshot ||
    bank.filter(
      (question) =>
        question.classroomId === item.classroomId &&
        item.questionIds.includes(question.id),
    );
  const classroom = classrooms.find(
    (candidate) => candidate.id === item.classroomId,
  );
  return (
    <>
      <Link className="text-link" to={`/docente/evaluaciones/${item.id}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Volver al editor docente
      </Link>
      <PageHeading
        eyebrow="VISTA PREVIA AISLADA / PERFIL DOCENTE"
        title={item.title || "Evaluación sin título"}
        description={`${classroom?.name || "Aula sin asignar"} · Esta vista no registra respuestas ni cambia al perfil Estudiante.`}
      />
      <div className="context-strip preview-context">
        <strong>Previsualizando como estudiante</strong>
        <span>Sigues en el espacio Docente. No se modifica el progreso estudiantil.</span>
      </div>
      {questions.length ? (
        <div className="question-list preview-list">
          {questions.map((question, index) => (
            <article className="panel question-panel" key={question.id}>
              <Badge>Pregunta {index + 1} de {questions.length}</Badge>
              <h2>{question.text}</h2>
              {question.formula && <MathBlock formula={question.formula} />}
              <fieldset disabled>
                <legend>Alternativas</legend>
                {question.options.map((option, optionIndex) => (
                  <label className="answer-option" key={optionIndex}>
                    <input type="radio" name={`preview-${question.id}`} />
                    <span className="answer-letter">{"ABCDEF"[optionIndex]}</span>
                    <MathBlock formula={option} block={false} />
                  </label>
                ))}
              </fieldset>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Esta evaluación todavía no tiene preguntas">
          Vuelve al editor y selecciona preguntas del aula.
        </EmptyState>
      )}
    </>
  );
}
