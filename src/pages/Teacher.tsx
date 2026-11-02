import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Users,
  FileText,
  Check,
  Upload,
  Search,
  Pencil,
  UserMinus,
  UserPlus,
  Archive,
  ArchiveRestore,
  Settings,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Modal,
  PageHeading,
  RouteCard,
} from "../components/ui";
import {
  studentName,
  useDemo,
  type Classroom,
  type Student,
} from "../state/DemoContext";

function ClassroomCard({ classroom, index }: { classroom: Classroom; index: number }) {
  return (
    <Link
      to={`/docente/aulas/${classroom.id}`}
      className={`classroom-card ${classroom.color}`}
    >
      <div className="card-top">
        <span className="course-number">{String(index + 1).padStart(2, "0")}</span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </div>
      <div className="course-symbol" aria-hidden="true">
        {["∂", "Σ", "√"][index % 3]}
      </div>
      <span className="small muted">SECCIÓN {classroom.section}</span>
      <h3>{classroom.name}</h3>
      <p className="class-meta">
        Periodo {classroom.period} · Turno {classroom.shift}
      </p>
      <div className="course-footer">
        <span>
          <Users size={15} aria-hidden="true" />
          {classroom.students.length} estudiantes
        </span>
        <span>Ver aula →</span>
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { classrooms, review, assessments, bank } = useDemo();
  const activeClassrooms = classrooms.filter((classroom) => !classroom.archivedAt);
  return (
    <>
      <PageHeading
        eyebrow="TU ENSEÑANZA, CON PERSPECTIVA"
        title="Tu espacio docente"
        description="Aulas, preguntas y actividades de este semestre. Datos de demostración."
        action={
          <Link className="button primary" to="/docente/aulas?crear=1">
            <Plus size={18} aria-hidden="true" />
            Crear aula
          </Link>
        }
      />
      <section>
        <div className="section-heading">
          <h2>
            Mis aulas <span className="count">{String(activeClassrooms.length).padStart(2, "0")}</span>
          </h2>
          <Link className="text-link" to="/docente/aulas">
            Ver todas <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="class-grid">
          {activeClassrooms.slice(0, 3).map((classroom, index) => (
            <ClassroomCard classroom={classroom} index={index} key={classroom.id} />
          ))}
        </div>
      </section>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="section-heading">
            <h2>Acciones pendientes</h2>
            <span className="small muted">DEMO</span>
          </div>
          {review.status < 2 && (
            <Link to="/docente/revision" className="task-row">
              <span className="task-icon"><FileText size={21} aria-hidden="true" /></span>
              <div>
                <strong>Derivadas y sus aplicaciones</strong>
                <p className="muted small">Cuaderno de ejercicios · 1 ejercicio</p>
              </div>
              <Badge tone="amber">Por revisar</Badge>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          )}
          {classrooms.find((classroom) => classroom.id === "algebra")?.students.length === 0 && (
            <Link to="/docente/aulas/algebra/importar" className="task-row">
              <span className="task-icon"><Users size={21} aria-hidden="true" /></span>
              <div>
                <strong>Completa tu aula de Álgebra</strong>
                <p className="muted small">Importa participantes desde Moodle</p>
              </div>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          )}
          <RouteCard
            to="/docente/banco?estado=Pendiente+de+revisi%C3%B3n"
            title={`${bank.filter((question) => question.state === "Pendiente de revisión").length} preguntas por revisar`}
          >
            Completa la revisión antes de utilizarlas en una publicación.
          </RouteCard>
          <RouteCard
            to="/docente/evaluaciones"
            title={`${assessments.filter((assessment) => assessment.status !== "Publicada").length} evaluaciones en preparación`}
          >
            Continúa la configuración o confirma una revisión.
          </RouteCard>
        </section>
        <section className="quick-panel">
          <p className="eyebrow">PREPARAR LA CLASE</p>
          <h2>Accesos rápidos</h2>
          <RouteCard to="/docente/banco" title="Banco de preguntas">
            Buscar y editar contenido por aula y tema.
          </RouteCard>
          <RouteCard to="/docente/evaluaciones/nueva" title="Nueva evaluación">
            Elegir aula, preguntas y reglas.
          </RouteCard>
          <RouteCard to="/docente/aulas/calculo/importar" title="Importar estudiantes">
            Leer una exportación de Moodle
          </RouteCard>
          <RouteCard to="/docente/revision" title="Revisar un documento">
            Del PDF al ejercicio editable
          </RouteCard>
        </section>
      </div>
    </>
  );
}

export function Classrooms() {
  const { classrooms, setClassrooms } = useDemo();
  const navigate = useNavigate();
  const [open, setOpen] = useState(new URLSearchParams(window.location.search).has("crear"));
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const activeClassrooms = classrooms.filter((classroom) => !classroom.archivedAt);
  const archivedClassrooms = classrooms.filter((classroom) => classroom.archivedAt);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const section = String(data.get("section") || "").trim();
    if (!name || !section) {
      setError("Completa la asignatura y la sección.");
      form.querySelector<HTMLInputElement>(!name ? "[name=name]" : "[name=section]")?.focus();
      return;
    }
    const id = crypto.randomUUID();
    setClassrooms((previous) => [
      ...previous,
      {
        id,
        name,
        section,
        period: String(data.get("period")),
        shift: String(data.get("shift")),
        students: [],
        color: "blue",
      },
    ]);
    setOpen(false);
    navigate(`/docente/aulas/${id}`);
  }

  const shown = activeClassrooms.filter((classroom) =>
    classroom.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  function restore(id: string) {
    setClassrooms((current) => current.map((classroom) => classroom.id === id ? { ...classroom, archivedAt: undefined } : classroom));
  }
  return (
    <>
      <PageHeading
        eyebrow="ESPACIOS PARA CRECER"
        title="Mis aulas"
        description="Organiza cada asignatura y acompaña su aprendizaje."
        action={
          <button className="button primary" onClick={() => setOpen(true)}>
            <Plus size={18} aria-hidden="true" /> Crear aula
          </button>
        }
      />
      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Buscar aulas"
          name="buscar-aulas"
          autoComplete="off"
          placeholder="Buscar una asignatura…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="class-grid">
        {shown.map((classroom, index) => (
          <ClassroomCard classroom={classroom} index={index} key={classroom.id} />
        ))}
      </div>
      {!shown.length && (
        <EmptyState title="No encontramos esa aula">
          Prueba con otro nombre o crea tu primera aula.
        </EmptyState>
      )}
      <section className="archived-section" aria-labelledby="archived-title">
        <div className="section-heading"><h2 id="archived-title">Aulas archivadas</h2><Badge>{archivedClassrooms.length}</Badge></div>
        {archivedClassrooms.length ? (
          <ul className="archived-list">
            {archivedClassrooms.map((classroom) => (
              <li key={classroom.id}>
                <div><strong>{classroom.name}</strong><p className="muted">Sección {classroom.section} · {classroom.period} · Archivada {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(classroom.archivedAt!))}</p></div>
                <button className="button secondary" onClick={() => restore(classroom.id)}><ArchiveRestore size={17} aria-hidden="true" /> Restaurar aula</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No hay aulas archivadas. Al archivar, el contenido se conserva para poder recuperarlo.</p>}
      </section>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Un nuevo espacio para aprender"
        description="Crea un aula de demostración. No se enviarán invitaciones."
      >
        <form onSubmit={create} className="form-stack">
          <label>
            Asignatura
            <input name="name" autoComplete="off" maxLength={90} placeholder="Por ejemplo, Logaritmos…" aria-invalid={!!error} aria-describedby={error ? "class-error" : undefined} />
          </label>
          <div className="form-grid">
            <label>
              Periodo
              <select name="period"><option>2026-II</option><option>2027-I</option></select>
            </label>
            <label>
              Sección
              <input required name="section" autoComplete="off" maxLength={15} placeholder="B1…" />
            </label>
          </div>
          <label>
            Turno
            <select name="shift"><option>Mañana</option><option>Tarde</option><option>Noche</option></select>
          </label>
          {error && <p role="alert" id="class-error" className="error">{error}</p>}
          <button className="button primary" type="submit">
            Crear aula de demostración <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
      </Modal>
    </>
  );
}

function StudentForm({
  initial,
  students,
  onSave,
  onCancel,
}: {
  initial?: Student;
  students: Student[];
  onSave: (student: Student) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const candidate: Student = {
      id: initial?.id || crypto.randomUUID(),
      code: String(data.get("code") || "").trim() || undefined,
      firstNames: String(data.get("firstNames") || "").trim(),
      lastNames: String(data.get("lastNames") || "").trim(),
      email: String(data.get("email") || "").trim() || undefined,
    };
    if (!candidate.firstNames || !candidate.lastNames) {
      setError("Completa los nombres y apellidos.");
      form.querySelector<HTMLInputElement>(!candidate.firstNames ? "[name=firstNames]" : "[name=lastNames]")?.focus();
      return;
    }
    if (candidate.email && !/^\S+@\S+\.\S+$/.test(candidate.email)) {
      setError("Escribe un correo válido o deja el campo vacío.");
      form.querySelector<HTMLInputElement>("[name=email]")?.focus();
      return;
    }
    const duplicate = students.find(
      (student) =>
        student.id !== candidate.id &&
        ((candidate.code && student.code?.toLocaleLowerCase() === candidate.code.toLocaleLowerCase()) ||
          (candidate.email && student.email?.toLocaleLowerCase() === candidate.email.toLocaleLowerCase()) ||
          studentName(student).toLocaleLowerCase() === studentName(candidate).toLocaleLowerCase()),
    );
    if (duplicate) {
      setError("Ya existe un estudiante con el mismo código, correo o nombre en esta aula.");
      return;
    }
    onSave(candidate);
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>Código institucional <span className="muted">(opcional)</span><input name="code" autoComplete="off" spellCheck={false} defaultValue={initial?.code} maxLength={40} /></label>
      <div className="form-grid">
        <label>Nombres<input required name="firstNames" autoComplete="off" defaultValue={initial?.firstNames} maxLength={80} /></label>
        <label>Apellidos<input required name="lastNames" autoComplete="off" defaultValue={initial?.lastNames} maxLength={80} /></label>
      </div>
      <label>Correo electrónico <span className="muted">(opcional)</span><input type="email" name="email" autoComplete="off" spellCheck={false} defaultValue={initial?.email} maxLength={120} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="button-row">
        <button className="button secondary" type="button" onClick={onCancel}>Cancelar</button>
        <button className="button primary" type="submit">{initial ? "Guardar cambios" : "Agregar estudiante"}</button>
      </div>
    </form>
  );
}

export function ClassroomDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { classrooms, setClassrooms } = useDemo();
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [removing, setRemoving] = useState<Student | null>(null);
  const [message, setMessage] = useState("");
  const [editingClassroom, setEditingClassroom] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveName, setArchiveName] = useState("");
  const [archiveUnderstood, setArchiveUnderstood] = useState(false);
  const classroom = classrooms.find((item) => item.id === id);
  if (!classroom)
    return <EmptyState title="Aula no disponible">Esta aula local ya no existe. <Link to="/docente/aulas">Volver a mis aulas</Link></EmptyState>;
  if (classroom.archivedAt)
    return (
      <>
        <Link className="text-link" to="/docente/aulas">← Mis aulas</Link>
        <PageHeading eyebrow="AULA ARCHIVADA" title={classroom.name} description="El contenido se conserva, pero las acciones académicas están pausadas hasta restaurarla." />
        <section className="panel archived-guard">
          <Archive size={28} aria-hidden="true" />
          <div><h2>Archivo recuperable</h2><p className="muted">Se mantienen {classroom.students.length} matrículas locales y las relaciones académicas de esta sesión. No se ha eliminado ningún historial.</p></div>
          <button className="button primary" onClick={() => setClassrooms((all) => all.map((item) => item.id === id ? { ...item, archivedAt: undefined } : item))}><ArchiveRestore size={17} aria-hidden="true" /> Restaurar aula</button>
        </section>
      </>
    );

  function saveStudent(student: Student) {
    setClassrooms((all) => all.map((item) => item.id === id ? {
      ...item,
      students: item.students.some((current) => current.id === student.id)
        ? item.students.map((current) => current.id === student.id ? student : current)
        : [...item.students, student],
    } : item));
    setEditing(null);
    setMessage("Matrícula de demostración actualizada.");
  }

  function removeStudent() {
    if (!removing) return;
    setClassrooms((all) => all.map((item) => item.id === id ? {
      ...item,
      students: item.students.filter((student) => student.id !== removing.id),
    } : item));
    setMessage(`${studentName(removing)} fue retirado de esta matrícula local.`);
    setRemoving(null);
  }

  function saveClassroom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const section = String(data.get("section") || "").trim();
    if (!name || !section) return;
    setClassrooms((all) => all.map((item) => item.id === id ? { ...item, name, section, period: String(data.get("period")), shift: String(data.get("shift")) } : item));
    setEditingClassroom(false);
    setMessage("Datos del aula actualizados en esta sesión.");
  }

  function archiveClassroom() {
    if (!classroom || archiveName !== classroom.name) return;
    setClassrooms((all) => all.map((item) => item.id === id ? { ...item, archivedAt: new Date().toISOString() } : item));
    navigate("/docente/aulas");
  }

  return (
    <>
      <Link className="text-link" to="/docente/aulas">← Mis aulas</Link>
      <PageHeading
        eyebrow={`${classroom.period} / SECCIÓN ${classroom.section}`}
        title={classroom.name}
        description={`${classroom.shift} · Aula de demostración`}
        action={
          <div className="button-row">
            <button className="button secondary" onClick={() => setEditingClassroom(true)}><Settings size={18} aria-hidden="true" /> Configurar aula</button>
            <button className="button secondary" onClick={() => setEditing("new")}><UserPlus size={18} aria-hidden="true" /> Agregar estudiante</button>
            <Link className="button primary" to={`/docente/aulas/${id}/importar`}><Upload size={18} aria-hidden="true" /> Importar estudiantes</Link>
          </div>
        }
      />
      <p role="status" className="success-text">{message}</p>
      <div className="detail-grid">
        <section className="panel">
          <div className="section-heading"><h2>Estudiantes</h2><Badge>{classroom.students.length} en esta aula</Badge></div>
          {classroom.students.length ? (
            <ul className="student-list">
              {classroom.students.map((student, index) => (
                <li key={student.id}>
                  <span className="avatar">{String(index + 1).padStart(2, "0")}</span>
                  <span className="student-summary">
                    <strong>{studentName(student)}</strong>
                    <small className="muted block">{[student.code, student.email].filter(Boolean).join(" · ") || "Identificador local de demostración"}</small>
                  </span>
                  <Badge tone="green"><Check size={13} aria-hidden="true" /> Incorporado</Badge>
                  <div className="row-actions">
                    <button className="icon-button" aria-label={`Editar a ${studentName(student)}`} onClick={() => setEditing(student)}><Pencil size={17} aria-hidden="true" /></button>
                    <button className="icon-button danger-action" aria-label={`Retirar a ${studentName(student)}`} onClick={() => setRemoving(student)}><UserMinus size={17} aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Tu aula empieza aquí">Importa una nómina o agrega al primer estudiante manualmente.</EmptyState>
          )}
        </section>
        <aside>
          <RouteCard to={`/docente/banco?aula=${id}`} title="Banco de preguntas">Preparar recursos exclusivos de esta aula.</RouteCard>
          <RouteCard to="/docente/revision" title="Materiales y ejercicios">Revisar una transcripción de muestra</RouteCard>
          <RouteCard to={`/docente/evaluaciones?aula=${id}`} title="Evaluaciones">Configurar actividades de esta aula.</RouteCard>
          <div className="notice">Los participantes solo se mantienen en memoria durante esta sesión. No se crean cuentas ni se envían correos.</div>
          <button className="button danger-outline" onClick={() => setArchiving(true)}><Archive size={17} aria-hidden="true" /> Archivar aula</button>
        </aside>
      </div>
      <Modal
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Agregar estudiante" : "Editar estudiante"}
        description="Actualiza únicamente los datos necesarios para esta matrícula de demostración."
      >
        <StudentForm initial={editing && editing !== "new" ? editing : undefined} students={classroom.students} onSave={saveStudent} onCancel={() => setEditing(null)} />
      </Modal>
      <Modal open={editingClassroom} onOpenChange={setEditingClassroom} title="Configurar aula" description="Actualiza los datos académicos sin cambiar matrículas, preguntas ni evaluaciones.">
        <form className="form-stack" onSubmit={saveClassroom}>
          <label>Asignatura<input required name="name" autoComplete="off" maxLength={90} defaultValue={classroom.name} /></label>
          <div className="form-grid">
            <label>Periodo<select name="period" defaultValue={classroom.period}><option>2026-II</option><option>2027-I</option></select></label>
            <label>Sección<input required name="section" autoComplete="off" maxLength={15} defaultValue={classroom.section} /></label>
          </div>
          <label>Turno<select name="shift" defaultValue={classroom.shift}><option>Mañana</option><option>Tarde</option><option>Noche</option></select></label>
          <div className="button-row end"><button className="button secondary" type="button" onClick={() => setEditingClassroom(false)}>Cancelar</button><button className="button primary" type="submit">Guardar aula</button></div>
        </form>
      </Modal>
      <Modal open={archiving} onOpenChange={(open) => { setArchiving(open); if (!open) { setArchiveName(""); setArchiveUnderstood(false); } }} title="Archivar aula de forma recuperable" description="El aula dejará de aparecer entre las activas. Matrículas, preguntas y evaluaciones se conservarán en esta sesión.">
        <div className="form-stack">
          <div className="warning-panel"><strong>Esta acción no elimina definitivamente el historial.</strong><p>Podrás restaurar el aula desde “Mis aulas”. Una eliminación real requerirá identidad verificada, auditoría y una política de retención.</p></div>
          <label>Escribe <strong>{classroom.name}</strong> para confirmar<input name="archive-confirmation" autoComplete="off" value={archiveName} onChange={(event) => setArchiveName(event.target.value)} /></label>
          <label className="check-label"><input type="checkbox" name="archive-understood" checked={archiveUnderstood} onChange={(event) => setArchiveUnderstood(event.target.checked)} /> Comprendo que el aula quedará archivada y no eliminada.</label>
          <div className="button-row end"><button className="button secondary" onClick={() => setArchiving(false)}>Conservar aula activa</button><button className="button danger" disabled={archiveName !== classroom.name || !archiveUnderstood} onClick={archiveClassroom}>Confirmar archivado</button></div>
        </div>
      </Modal>
      <Modal
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Retirar de esta aula"
        description={removing ? `${studentName(removing)} dejará de aparecer en la matrícula local. No se elimina ninguna cuenta real.` : ""}
      >
        <div className="button-row">
          <button className="button secondary" onClick={() => setRemoving(null)}>Conservar estudiante</button>
          <button className="button danger" onClick={removeStudent}>Confirmar retiro</button>
        </div>
      </Modal>
    </>
  );
}
