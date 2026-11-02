import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Badge, EmptyState, PageHeading } from "../components/ui";
import { useDemo } from "../state/DemoContext";
import {
  buildCandidates,
  candidateToStudent,
  classifyCandidate,
  detectHeader,
  readRosterFile,
  type ColumnMapping,
  type ImportCandidate,
  type ImportField,
  type ParsedRoster,
  type RosterSheet,
} from "../state/importStudents";

const demoRoster: ParsedRoster = {
  fileName: "participantes_demostracion.xlsx",
  fileSize: 18432,
  sheets: [
    {
      name: "Participantes",
      rows: [
        ["Código de estudiante", "Nombres", "Apellidos", "Correo", "Rol"],
        ["AUL-101", "Lucía", "Torres Demo", "lucia@example.invalid", "Estudiante"],
        ["AUL-102", "Mateo", "Ríos Demo", "mateo@example.invalid", "Estudiante"],
        ["AUL-102", "Registro", "Duplicado", "duplicado@example.invalid", "Estudiante"],
        ["", "Participante", "Por confirmar", "", ""],
        ["DOC-1", "Docente", "Demo", "docente@example.invalid", "Docente"],
      ],
    },
  ],
};

const fieldLabels: Record<ImportField, string> = {
  code: "Código institucional",
  fullName: "Nombre completo",
  firstNames: "Nombres",
  lastNames: "Apellidos",
  email: "Correo electrónico",
  role: "Rol",
};

function formatBytes(bytes: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(bytes / 1024) + " KB";
}

function statusTone(status: ImportCandidate["status"]) {
  if (status === "Listo para importar") return "green";
  if (status === "Duplicado" || status === "Datos incompletos") return "amber";
  return "";
}

export function ImportStudents() {
  const { id } = useParams();
  const { classrooms, setClassrooms } = useDemo();
  const classroom = classrooms.find((item) => item.id === id);
  const rosterStudents = useMemo(() => classroom?.students || [], [classroom]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [workbook, setWorkbook] = useState<ParsedRoster | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step > 0) stepHeadingRef.current?.focus();
  }, [step]);

  const sheet = workbook?.sheets.find((item) => item.name === sheetName);
  const headers = sheet?.rows[headerIndex] || [];

  function prepareSheet(target: RosterSheet) {
    if (!classroom) return;
    const detected = detectHeader(target.rows);
    if (detected.index < 0) {
      setError("No encontramos una fila de encabezados. Corrige la correspondencia de datos para continuar.");
      setHeaderIndex(0);
      setMapping(detected.mapping);
      setShowMapping(true);
      setCandidates([]);
      return;
    }
    setError("");
    setHeaderIndex(detected.index);
    setMapping(detected.mapping);
    setCandidates(buildCandidates(target, detected.index, detected.mapping, rosterStudents));
  }

  const selected = candidates.filter(
    (candidate) =>
      candidate.selected &&
      ["Listo para importar", "Participante por confirmar"].includes(candidate.status),
  );
  const counts = useMemo(
    () =>
      candidates.reduce<Record<string, number>>((summary, candidate) => {
        summary[candidate.status] = (summary[candidate.status] || 0) + 1;
        return summary;
      }, {}),
    [candidates],
  );

  if (!classroom)
    return <EmptyState title="Aula no disponible"><Link to="/docente/aulas">Volver a aulas</Link></EmptyState>;

  async function loadFile(file: File) {
    setBusy(true);
    setError("");
    setImported(null);
    try {
      const parsed = await readRosterFile(file);
      setWorkbook(parsed);
      setSheetName(parsed.sheets[0].name);
      prepareSheet(parsed.sheets[0]);
      setStep(1);
    } catch (reason) {
      setWorkbook(null);
      setError(reason instanceof Error ? reason.message : "No pudimos leer el archivo.");
    } finally {
      setBusy(false);
    }
  }

  function useDemoRoster() {
    setError("");
    setImported(null);
    setWorkbook(demoRoster);
    setSheetName(demoRoster.sheets[0].name);
    prepareSheet(demoRoster.sheets[0]);
    setStep(1);
  }

  function remap(next: ColumnMapping) {
    setMapping(next);
    if (!sheet) return;
    const used = Object.values(next).filter((value): value is number => value !== null);
    if (new Set(used).size !== used.length) {
      setError("Cada dato debe corresponder a una columna diferente.");
      setCandidates([]);
      return;
    }
    if (next.fullName === null && next.firstNames === null && next.lastNames === null) {
      setError("Indica qué columna contiene el nombre o los apellidos.");
      setCandidates([]);
      return;
    }
    setError("");
    setCandidates(buildCandidates(sheet, headerIndex, next, rosterStudents));
  }

  function updateCandidate(id: string, patch: Partial<ImportCandidate>) {
    setCandidates((current) => {
      const edited = current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate);
      return edited.map((candidate) => classifyCandidate(candidate, rosterStudents, edited));
    });
  }

  function toggleCandidate(id: string, selectedValue: boolean) {
    setCandidates((current) => current.map((candidate) =>
      candidate.id === id ? { ...candidate, selected: selectedValue } : candidate,
    ));
  }

  function confirmImport() {
    const students = selected.map(candidateToStudent);
    setClassrooms((all) => all.map((item) =>
      item.id === id ? { ...item, students: [...item.students, ...students] } : item,
    ));
    setImported(students.length);
  }

  return (
    <>
      <Link className="text-link" to={`/docente/aulas/${id}`}>← {classroom.name}</Link>
      <PageHeading
        eyebrow="MATRÍCULA / IMPORTACIÓN LOCAL"
        title="Importar estudiantes"
        description="Lee una exportación de Moodle en este navegador y revisa cada participante antes de incorporarlo."
      />
      <ol className="stepper three-steps">
        {["Seleccionar archivo", "Revisar estudiantes", "Confirmar incorporación"].map((label, index) => (
          <li key={label} className={step >= index ? "active" : ""} aria-current={step === index ? "step" : undefined}>
            <span>{step > index ? "✓" : index + 1}</span>{label}
          </li>
        ))}
      </ol>
      <div className="notice">
        El archivo se procesa localmente: no se envía a AULIGMA ni a terceros. Los datos incorporados viven solo en memoria y se pierden al recargar.
      </div>

      {step === 0 && (
        <section className="panel import-upload route-panel">
          <FileSpreadsheet size={48} strokeWidth={1} aria-hidden="true" />
          <h2>Selecciona la nómina exportada</h2>
          <p className="muted">Formato recomendado: `.xlsx`. También puedes usar `.csv`; convierte los archivos `.xls` heredados antes de importarlos.</p>
          <label className={`file-field button primary ${busy ? "disabled" : ""}`}>
            <Upload size={18} aria-hidden="true" />
            {busy ? "Leyendo archivo…" : "Seleccionar archivo"}
            <input
              type="file"
              name="nomina"
              accept=".xlsx,.xls,.csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <button className="button secondary" disabled={busy} onClick={useDemoRoster}>Usar archivo de demostración</button>
          <small className="muted">Máximo 5 MB · Hasta 2000 filas · Sin ejecución de fórmulas</small>
          <p role="status" aria-live="polite">{busy ? "Cargando y analizando el archivo…" : ""}</p>
          {error && <p role="alert" className="error">{error} Puedes elegir otro archivo e intentarlo de nuevo.</p>}
        </section>
      )}

      {step === 1 && workbook && (
        <section className="panel roster-review route-panel">
          <div className="section-heading">
            <div>
              <Badge><FileSpreadsheet size={14} aria-hidden="true" /> {workbook.fileName}</Badge>
              <p className="muted small">{formatBytes(workbook.fileSize)} · {workbook.sheets.length} {workbook.sheets.length === 1 ? "hoja" : "hojas"}</p>
            </div>
            <button className="button secondary" onClick={() => { setStep(0); setWorkbook(null); }}>Cambiar archivo</button>
          </div>
          {workbook.sheets.length > 1 && (
            <label>Hoja detectada<select name="hoja" value={sheetName} onChange={(event) => { const next = workbook.sheets.find((item) => item.name === event.target.value); setSheetName(event.target.value); if (next) prepareSheet(next); }}>{workbook.sheets.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
          )}
          <div className="section-heading">
            <div><h2 ref={stepHeadingRef} tabIndex={-1}>Revisa los participantes</h2><p className="muted">Selecciona únicamente a quienes quieras incorporar y corrige los datos necesarios.</p></div>
            <button className="text-link" aria-expanded={showMapping} onClick={() => setShowMapping((value) => !value)}><SlidersHorizontal size={17} aria-hidden="true" /> Corregir correspondencia de datos</button>
          </div>
          {showMapping && mapping && (
            <div className="mapping-panel">
              <h3>¿Dónde está cada dato?</h3>
              <p className="muted">Indícanos qué columna de tu archivo contiene los nombres, apellidos o códigos. Los campos que no existan pueden quedar sin asignar.</p>
              <div className="mapping-grid">
                {(Object.keys(fieldLabels) as ImportField[]).map((field) => (
                  <label key={field}>{fieldLabels[field]}<select name={`columna-${field}`} value={mapping[field] ?? ""} onChange={(event) => remap({ ...mapping, [field]: event.target.value === "" ? null : Number(event.target.value) })}><option value="">No disponible</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Columna ${index + 1}`}</option>)}</select></label>
                ))}
              </div>
            </div>
          )}
          {error && <p role="alert" className="error">{error}</p>}
          {!candidates.length && !error && <EmptyState title="Sin participantes">La hoja seleccionada no contiene registros después de los encabezados.</EmptyState>}
          {!!candidates.length && (
            <>
              <dl className="import-summary">
                {["Listo para importar", "Participante por confirmar", "Duplicado", "Datos incompletos", "Excluido"].map((status) => <div key={status}><dt>{status}</dt><dd>{counts[status] || 0}</dd></div>)}
              </dl>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Participantes detectados">
                <table className="roster-table">
                  <caption>Contenido real detectado en {workbook.fileName}</caption>
                  <thead><tr><th>Incluir</th><th>Participante</th><th>Código</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
                  <tbody>
                    {candidates.map((candidate) => {
                      const selectable = !["Duplicado", "Datos incompletos", "Excluido"].includes(candidate.status);
                      return (
                        <tr key={candidate.id}>
                          <td><label className="table-check"><input type="checkbox" aria-label={`Incluir fila ${candidate.sourceRow}`} checked={candidate.selected} disabled={!selectable} onChange={(event) => toggleCandidate(candidate.id, event.target.checked)} /><span className="sr-only">Incluir</span></label></td>
                          <td><div className="editable-pair"><input name={`nombres-${candidate.sourceRow}`} autoComplete="off" aria-label={`Nombres fila ${candidate.sourceRow}`} value={candidate.firstNames} onChange={(event) => updateCandidate(candidate.id, { firstNames: event.target.value })} /><input name={`apellidos-${candidate.sourceRow}`} autoComplete="off" aria-label={`Apellidos fila ${candidate.sourceRow}`} value={candidate.lastNames} placeholder="Apellidos…" onChange={(event) => updateCandidate(candidate.id, { lastNames: event.target.value })} /></div></td>
                          <td><input name={`codigo-${candidate.sourceRow}`} autoComplete="off" aria-label={`Código fila ${candidate.sourceRow}`} spellCheck={false} value={candidate.code} onChange={(event) => updateCandidate(candidate.id, { code: event.target.value })} /></td>
                          <td><input name={`correo-${candidate.sourceRow}`} autoComplete="off" aria-label={`Correo fila ${candidate.sourceRow}`} type="email" spellCheck={false} value={candidate.email} onChange={(event) => updateCandidate(candidate.id, { email: event.target.value })} /></td>
                          <td><input name={`rol-${candidate.sourceRow}`} autoComplete="off" aria-label={`Rol fila ${candidate.sourceRow}`} value={candidate.role} onChange={(event) => updateCandidate(candidate.id, { role: event.target.value })} /></td>
                          <td><Badge tone={statusTone(candidate.status)}>{candidate.status}</Badge><small className="muted block">{candidate.reason}</small></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="button-row end"><button className="button primary" disabled={!selected.length} onClick={() => { setConfirmed(false); setStep(2); }}>Revisar resumen <ArrowRight size={17} aria-hidden="true" /></button></div>
            </>
          )}
        </section>
      )}

      {step === 2 && workbook && (
        <section className={`panel confirm-import route-panel ${imported !== null ? "success-state" : ""}`}>
          {imported === null ? (
            <>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Confirma la incorporación</h2>
              <p>Se incorporarán <strong>{selected.length}</strong> estudiantes a <strong>{classroom.name}</strong>. {candidates.length - selected.length} registros quedarán fuera.</p>
              <div className="notice">Resultado previsto: {candidates.length === selected.length ? "importación completa" : "importación parcial"}. Los participantes ambiguos solo se incluyen si los seleccionaste expresamente.</div>
              <label className="check-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />He revisado la selección y confirmo esta matrícula de demostración.</label>
              <div className="button-row"><button className="button secondary" onClick={() => setStep(1)}>Volver a revisar</button><button className="button primary" disabled={!confirmed || !selected.length} onClick={confirmImport}>Confirmar incorporación</button></div>
            </>
          ) : (
            <>
              <CheckCircle2 size={48} aria-hidden="true" />
              <h2>{imported === selected.length && candidates.length === selected.length ? "Importación correcta" : "Importación parcial completada"}</h2>
              <p role="status" aria-live="polite">Se incorporaron {imported} estudiantes reales del archivo seleccionado. No se añadieron registros ficticios.</p>
              <Link className="button primary" to={`/docente/aulas/${id}`}>Ver estudiantes <ArrowRight size={18} aria-hidden="true" /></Link>
            </>
          )}
        </section>
      )}
      {error && step > 0 && !workbook && <p role="alert" className="error"><AlertCircle size={17} aria-hidden="true" /> {error}</p>}
      {busy && <p className="loading-overlay" role="status"><RefreshCw className="spin" aria-hidden="true" /> Cargando archivo…</p>}
    </>
  );
}
