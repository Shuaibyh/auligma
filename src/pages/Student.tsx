import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, CheckCircle2, Maximize2 } from "lucide-react";
import {
  Badge,
  EmptyState,
  MathBlock,
  Modal,
  PageHeading,
  RouteCard,
} from "../components/ui";
import { useDemo } from "../state/DemoContext";
import {
  usePracticeSession,
  readPracticeSession,
} from "../state/usePracticeSession";
import {
  preparedQuestions,
  type Assessment,
  type Question,
} from "../state/academic";

function useActivity() {
  const [params] = useSearchParams();
  const { assessments, classrooms } = useDemo();
  const id = params.get("actividad") || "repaso";
  const enrolledIds = new Set(classrooms.filter((classroom) => classroom.students.some((student) => student.id === "demo-student")).map((classroom) => classroom.id));
  const activity = assessments.find(
    (a) => a.id === id && a.status === "Publicada" && a.mode === "Práctica" && enrolledIds.has(a.classroomId),
  );
  return { id, activity, questions: activity?.snapshot || preparedQuestions };
}
function ActivityRow({
  activity,
  priority,
}: {
  activity: Assessment;
  priority: boolean;
}) {
  const { classrooms } = useDemo();
  const questions = activity.snapshot || [];
  const { session } = usePracticeSession(activity.id, questions.length);
  const classroom = classrooms.find((c) => c.id === activity.classroomId);
  const complete =
    session.checked.length === questions.length && questions.length > 0;
  return (
    <article className="assessment-row">
      <div>
        {priority && !complete && (
          <p className="eyebrow">SIGUIENTE ACTIVIDAD DISPONIBLE</p>
        )}
        <div className="meta-row">
          <span>
            {classroom?.name} · Sección {classroom?.section} ·{" "}
            {classroom?.period}
          </span>
          <Badge
            tone={
              complete
                ? "green"
                : Object.keys(session.answers).length
                  ? "amber"
                  : ""
            }
          >
            {complete
              ? "Completada"
              : Object.keys(session.answers).length
                ? "En progreso"
                : "Pendiente"}
          </Badge>
        </div>
        <h2>{activity.title}</h2>
        <p className="muted">
          {questions.length} preguntas · {session.checked.length} revisadas ·
          {activity.attemptPolicy.mode === "unlimited"
            ? " Intentos ilimitados"
            : ` Máximo ${activity.attemptPolicy.maxAttempts} intentos`} ·
          Práctica sin calificación
        </p>
      </div>
      <Link
        className="button primary"
        to={`/estudiante/practica?actividad=${activity.id}`}
      >
        {complete
          ? "Ver respuestas"
          : Object.keys(session.answers).length
            ? "Continuar"
            : "Resolver"}
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}
export function StudentHome() {
  const { assessments, classrooms } = useDemo();
  const enrolledClassrooms = classrooms.filter((classroom) => !classroom.archivedAt && classroom.students.some((student) => student.id === "demo-student"));
  const enrolledIds = new Set(enrolledClassrooms.map((classroom) => classroom.id));
  const available = assessments
    .filter((a) => a.status === "Publicada" && a.mode === "Práctica" && enrolledIds.has(a.classroomId))
    .sort((a, b) => {
      const rank = (item: Assessment) => {
        const count = item.snapshot?.length || 0;
        const s = readPracticeSession(item.id, count);
        return s.checked.length === count
          ? 2
          : Object.keys(s.answers).length
            ? 0
            : 1;
      };
      return rank(a) - rank(b);
    });
  return (
    <>
      <PageHeading
        eyebrow="TU AULA / ACTIVIDADES ASIGNADAS"
        title="Mis actividades"
        description="Consulta tu curso y continúa donde lo dejaste. Perfil de estudiante sintético."
      />
      <div className="context-strip">
        <strong>Prácticas disponibles</strong>
        <span>
          Las fechas y el consumo de intentos son locales y demostrativos.
        </span>
      </div>
      <section className="student-classrooms" aria-labelledby="student-classrooms-title">
        <div className="section-heading"><h2 id="student-classrooms-title">Mis aulas</h2><Badge>{enrolledClassrooms.length} asignada{enrolledClassrooms.length === 1 ? "" : "s"}</Badge></div>
        {enrolledClassrooms.map((classroom) => <article key={classroom.id}><span className="course-symbol" aria-hidden="true">∂</span><div><strong>{classroom.name}</strong><p className="muted">Sección {classroom.section} · {classroom.period} · {classroom.shift}</p></div></article>)}
      </section>
      <div className="question-list">
        {available.map((a, i) => (
          <ActivityRow key={a.id} activity={a} priority={i === 0} />
        ))}
      </div>
      {!available.length && (
        <EmptyState title="No hay prácticas asignadas">
          Las prácticas publicadas de demostración aparecerán aquí.
        </EmptyState>
      )}
      <div className="student-support">
        <RouteCard to="/estudiante/progreso" title="Mi progreso">
          Consulta aciertos, errores y recomendaciones por tema.
        </RouteCard>
        <RouteCard to="/estudiante/ayuda" title="Cómo practicar">
          Tus respuestas se conservan en esta pestaña.
        </RouteCard>
      </div>
      <p className="notice">
        Solo se muestran aulas vinculadas a la identidad ficticia Estudiante Demo. Los
        exámenes en modalidad Evaluación no se habilitan aquí: no hay
        calificaciones ni controles de examen reales.
      </p>
    </>
  );
}
export function Practice() {
  const { id, activity, questions } = useActivity();
  if (!activity)
    return (
      <EmptyState title="Actividad no disponible">
        Esta publicación local puede haberse restablecido al recargar.{" "}
        <Link to="/estudiante">Volver a mis actividades</Link>
      </EmptyState>
    );
  return <PracticeContent key={id} activity={activity} questions={questions} />;
}
function PracticeContent({
  activity,
  questions,
}: {
  activity: Assessment;
  questions: Question[];
}) {
  const { concentration, setConcentration } = useDemo();
  const { session, setSession, storageError } = usePracticeSession(
    activity.id,
    questions.length,
  );
  const { answers, checked } = session;
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("pregunta") || 1);
  const index =
    Number.isInteger(raw) && raw >= 1 && raw <= questions.length ? raw - 1 : 0;
  const q = questions[index];
  const revealed = checked.includes(index);
  function go(i: number) {
    const next = new URLSearchParams(params);
    next.set("pregunta", String(i + 1));
    setParams(next);
    document.getElementById("question-heading")?.focus();
  }
  return (
    <>
      <div className="practice-tools">
        <Link className="text-link" to="/estudiante">
          ← Mis actividades
        </Link>
        <button
          className="button secondary"
          aria-pressed={concentration}
          onClick={() => setConcentration(!concentration)}
        >
          <Maximize2 size={17} />
          {concentration
            ? "Salir del modo concentración"
            : "Modo concentración"}
        </button>
      </div>
      <PageHeading
        eyebrow="PRÁCTICA / SOLUCIONES PREPARADAS"
        title={activity.title}
        description="Sin límite de tiempo. Resuelve y comprueba el procedimiento."
      />
      <div className="practice-status">
        <span role="status">
          {storageError
            ? "Almacenamiento no disponible: evita recargar esta pestaña."
            : "Respuestas guardadas en esta pestaña, incluso al recargar."}
        </span>
        <span>
          {checked.length} de {questions.length} revisadas
        </span>
      </div>
      <div className="practice-layout">
        <section className="panel question-panel">
          <div className="section-heading">
            <Badge>
              Pregunta {index + 1} de {questions.length}
            </Badge>
            <span className="small muted">{q.topic}</span>
          </div>
          <h2 id="question-heading" tabIndex={-1}>
            {q.text}
          </h2>
          <div className="question-formula">
            <MathBlock formula={q.formula} />
          </div>
          <fieldset>
            <legend>Selecciona una respuesta</legend>
            {q.options.map((option, i) => (
              <label
                className={`answer-option ${answers[index] === i ? "selected" : ""}`}
                key={i}
              >
                <input
                  type="radio"
                  name={`pregunta-${index}`}
                  checked={answers[index] === i}
                  disabled={revealed}
                  onChange={() =>
                    setSession((old) => ({
                      ...old,
                      answers: { ...old.answers, [index]: i },
                    }))
                  }
                />
                <span className="answer-letter">{"ABCD"[i]}</span>
                <MathBlock formula={option} block={false} />
              </label>
            ))}
          </fieldset>
          {revealed ? (
            <section
              className={`feedback ${answers[index] === q.correct ? "correct" : ""}`}
              aria-label="Retroalimentación"
            >
              <p role="status">
                <strong>
                  {answers[index] === q.correct
                    ? "Respuesta correcta. Bien razonado."
                    : "Respuesta incorrecta. Revisemos el procedimiento."}
                </strong>
              </p>
              <h3>Regla utilizada</h3>
              <p>{q.rule}</p>
              <h3>Desarrollo paso a paso</h3>
              <ol className="solution-steps">
                {q.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <p>
                Respuesta correcta:{" "}
                <MathBlock formula={q.options[q.correct]} block={false} />
              </p>
              {answers[index] !== q.correct && (
                <>
                  <h3>¿Dónde estuvo el error?</h3>
                  <p>{q.errors[answers[index]]}</p>
                </>
              )}
              <h3>Para reforzar</h3>
              <p>{q.recommendation}</p>
              <small>Ejemplo preparado y revisado manualmente. Sin IA.</small>
            </section>
          ) : (
            <button
              className="button primary"
              disabled={answers[index] === undefined}
              onClick={() =>
                setSession((old) => ({
                  ...old,
                  checked: [...new Set([...old.checked, index])],
                }))
              }
            >
              Comprobar respuesta
              <CheckCircle2 size={17} />
            </button>
          )}
          <div className="question-navigation">
            <button
              className="button secondary"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              <ArrowLeft size={17} />
              Anterior
            </button>
            {index < questions.length - 1 ? (
              <button
                className="button secondary"
                onClick={() => go(index + 1)}
              >
                Siguiente
                <ArrowRight size={17} />
              </button>
            ) : (
              <Link
                className="button secondary"
                to={`/estudiante/progreso?actividad=${activity.id}`}
              >
                Ver mi progreso
                <ArrowRight size={17} />
              </Link>
            )}
          </div>
        </section>
        <aside className="practice-aside">
          <h2>Tu recorrido</h2>
          <p>
            {checked.length} de {questions.length} preguntas revisadas
          </p>
          <progress
            aria-label="Preguntas revisadas"
            max={questions.length}
            value={checked.length}
          />
          <nav aria-label="Preguntas" className="question-dots">
            {questions.map((question, i) => (
              <button
                key={question.id}
                aria-label={`Ir a pregunta ${i + 1}${checked.includes(i) ? ", revisada" : ""}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => go(i)}
              >
                {checked.includes(i) ? "✓" : i + 1}
              </button>
            ))}
          </nav>
          <p className="small muted">
            Puedes volver a cualquier pregunta. Las respuestas comprobadas
            quedan bloqueadas hasta reiniciar la práctica.
          </p>
          <Link
            className="text-link"
            to={`/estudiante/progreso?actividad=${activity.id}`}
          >
            Consultar mi progreso
            <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
    </>
  );
}
export function Progress({ teacher = false }: { teacher?: boolean }) {
  const { classrooms } = useDemo();
  const { id, activity, questions } = useActivity();
  if (teacher)
    return (
      <div className="panel">
        <Badge>Resumen de demostración</Badge>
        <h2>{classrooms.length} aulas</h2>
        <p>
          {classrooms.reduce((sum, c) => sum + c.students.length, 0)}{" "}
          participantes sintéticos incorporados.
        </p>
        <RouteCard to="/docente/evaluaciones" title="Revisar evaluaciones">
          Consulta borradores, revisiones y publicaciones de demostración.
        </RouteCard>
      </div>
    );
  if (!activity)
    return (
      <EmptyState title="Actividad no disponible">
        <Link to="/estudiante">Volver a mis actividades</Link>
      </EmptyState>
    );
  return <ProgressContent key={id} activity={activity} questions={questions} />;
}
function ProgressContent({
  activity,
  questions,
}: {
  activity: Assessment;
  questions: Question[];
}) {
  const { session, setSession, storageError } = usePracticeSession(
    activity.id,
    questions.length,
  );
  const { answers, checked } = session;
  const [reset, setReset] = useState(false);
  const correct = checked.filter(
    (i) => answers[i] === questions[i].correct,
  ).length;
  const topics = [...new Set(questions.map((q) => q.topic))];
  return (
    <>
      <PageHeading
        eyebrow="PRÁCTICA / EVIDENCIAS DE APRENDIZAJE"
        title="Mi progreso"
        description={`${activity.title} · Resultados locales de demostración, sin calificaciones oficiales.`}
      />
      <section className="panel">
        <h2>
          {checked.length} de {questions.length} preguntas revisadas
        </h2>
        <dl className="progress-metrics">
          <div>
            <dt>Intentadas</dt>
            <dd>{Object.keys(answers).length}</dd>
          </div>
          <div>
            <dt>Aciertos</dt>
            <dd>{correct}</dd>
          </div>
          <div>
            <dt>Errores</dt>
            <dd>{checked.length - correct}</dd>
          </div>
          <div>
            <dt>Sin comprobar</dt>
            <dd>{Object.keys(answers).length - checked.length}</dd>
          </div>
        </dl>
        <progress
          aria-label="Progreso de práctica"
          max={questions.length}
          value={checked.length}
        />
        <p className="muted">
          Intentada significa respuesta seleccionada. Aciertos y errores solo
          incluyen respuestas comprobadas.
        </p>
      </section>
      <section className="panel topic-progress">
        <h2>Progreso por tema</h2>
        <p className="muted">
          Calculado sobre preguntas sintéticas de esta actividad; no representa
          dominio académico.
        </p>
        {topics.map((topic) => {
          const indices = questions
            .map((q, i) => (q.topic === topic ? i : -1))
            .filter((i) => i >= 0);
          const done = indices.filter((i) => checked.includes(i));
          const mistakes = done.filter(
            (i) => answers[i] !== questions[i].correct,
          );
          const first =
            mistakes[0] ??
            indices.find((i) => !checked.includes(i)) ??
            indices[0];
          return (
            <div className="topic-row" key={topic}>
              <div>
                <h3>{topic}</h3>
                <p>
                  {done.length} de {indices.length} revisadas ·{" "}
                  {mistakes.length}{" "}
                  {mistakes.length === 1 ? "error" : "errores"}
                </p>
                <progress
                  aria-label={`Progreso en ${topic}`}
                  max={indices.length}
                  value={done.length}
                />
              </div>
              <div>
                <p>
                  {mistakes.length
                    ? questions[first].recommendation
                    : done.length === indices.length
                      ? "Has resuelto la muestra correctamente. Revisa el procedimiento para consolidarlo."
                      : "Comienza por la pregunta pendiente de este tema."}
                </p>
                <Link
                  className="text-link"
                  to={`/estudiante/practica?actividad=${activity.id}&pregunta=${first + 1}`}
                >
                  Revisar {topic.toLowerCase()}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          );
        })}
      </section>
      {storageError && (
        <p role="alert">
          El navegador no permite conservar las respuestas al recargar.
        </p>
      )}
      <div className="button-row">
        <Link
          className="button primary"
          to={`/estudiante/practica?actividad=${activity.id}`}
        >
          Volver a practicar
          <ArrowRight size={17} />
        </Link>
        {Object.keys(answers).length > 0 && (
          <button className="button secondary" onClick={() => setReset(true)}>
            Reiniciar práctica
          </button>
        )}
      </div>
      <Modal
        open={reset}
        onOpenChange={setReset}
        title="Reiniciar esta práctica"
        description="Se eliminarán las respuestas de esta actividad en la pestaña. Las demás prácticas no se modificarán."
      >
        <div className="button-row">
          <button className="button secondary" onClick={() => setReset(false)}>
            Conservar respuestas
          </button>
          <button
            className="button primary"
            onClick={() => {
              setSession({ answers: {}, checked: [] });
              setReset(false);
            }}
          >
            Confirmar reinicio
          </button>
        </div>
      </Modal>
    </>
  );
}
