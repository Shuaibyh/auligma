import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, Check, RotateCcw, Search, ShieldAlert, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { api } from '../auth/api';
import { useRealAuth } from '../auth/RealAuth';
import { Badge, EmptyState, Modal, PageHeading } from '../components/ui';

export type RealClassroomData = {
  id: string; name: string; section: string; period: string; shift: string;
  teacherName: string; archivedAt: string | null;
};
type EnrollmentStatus = 'active' | 'preauthorized' | 'revoked';
type Enrollment = { id:string;email:string;status:EnrollmentStatus;firstNames:string;lastNames:string;authorizedAt:string;linkedAt:string|null;revokedAt:string|null };
type RequestRow = { id:string;email:string;status:'pending'|'approved'|'rejected';first_names:string;last_names:string;requested_at:string;resolved_at:string|null };
type PreviewItem = { input:string;email:string;status:'valid'|'invalid'|'duplicate'|'already_enrolled'|'revoked';selected:boolean;message:string };
type Preview = { items:PreviewItem[];totals:{detected:number;valid:number;invalid:number;duplicates:number;alreadyEnrolled:number;revoked:number;willAuthorize:number} };
type LifecycleAction = 'archive'|'restore'|'delete';
type LifecycleImpact = { id:string;name:string;archivedAt:string|null;students:{total:number;active:number;preauthorized:number;revoked:number};planning:{available:boolean;count:number|null};assessments:{available:boolean;count:number|null};deletionStrategy:'logical' };

const labels: Record<EnrollmentStatus,string> = { active:'Activa',preauthorized:'Pendiente de primer acceso',revoked:'Revocada' };
const previewLabels: Record<PreviewItem['status'],string> = { valid:'Lista para autorizar',invalid:'Inválida',duplicate:'Duplicada',already_enrolled:'Ya matriculada',revoked:'Revocada' };
const sample = 'estudiante001@undc.edu.pe\nestudiante002@undc.edu.pe';

function ImportEnrollments({ classroomId, open, onOpenChange, onCompleted }:{classroomId:string;open:boolean;onOpenChange:(value:boolean)=>void;onCompleted:()=>void}) {
  const [input,setInput] = useState('');
  const [preview,setPreview] = useState<Preview|null>(null);
  const [rows,setRows] = useState<PreviewItem[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [result,setResult] = useState<{authorized:number;skipped:number}|null>(null);
  const selected = rows.filter(row => row.status === 'valid' && row.selected);
  function changeOpen(value:boolean) {
    if (!value) { setInput('');setPreview(null);setRows([]);setError('');setResult(null); }
    onOpenChange(value);
  }
  async function validate(value = input) {
    setBusy(true);setError('');setResult(null);
    try { const data = await api<Preview>(`/classrooms/${classroomId}/enrollments/preview`,{method:'POST',body:JSON.stringify({input:value})});setPreview(data);setRows(data.items); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);setError('');
    try {
      const data = await api<{authorized:number;skipped:number}>(`/classrooms/${classroomId}/enrollments`,{method:'POST',body:JSON.stringify({emails:selected.map(row => row.email)})});
      setResult(data);onCompleted();
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  function changeRow(index:number,value:string) { setRows(current => current.map((row,rowIndex) => rowIndex === index ? {...row,input:value,email:value,status:'invalid',selected:false,message:'Vuelve a validar esta corrección.'} : row)); }
  const validationInput = rows.map(row => row.input).join('\n');
  const validCount = rows.filter(row => row.status === 'valid').length;
  const invalidCount = rows.filter(row => row.status === 'invalid').length;
  const duplicateCount = rows.filter(row => row.status === 'duplicate').length;
  const existingCount = rows.filter(row => row.status === 'already_enrolled' || row.status === 'revoked').length;
  const selectValid = (value:boolean) => setRows(current => current.map(row => row.status === 'valid' ? {...row,selected:value}:row));
  return <Modal contentClassName="enrollment-modal" open={open} onOpenChange={value => { if (!busy) changeOpen(value); }} title="Agregar estudiantes" description="Autoriza correos institucionales después de revisar cada resultado.">
    {result ? <div className="enrollment-result" role="status"><span className="result-mark"><Check aria-hidden="true" /></span><h3>Se autorizaron correctamente {result.authorized} estudiante{result.authorized === 1 ? '' : 's'}</h3><p className="muted">{result.skipped ? `${result.skipped} registro(s) no se incorporaron porque cambiaron o ya existían.` : 'La nómina se actualizó con el resultado efectivo del servidor.'}</p><button className="button primary" onClick={() => changeOpen(false)}>Volver a la nómina</button></div> : !preview ? <form className="form-stack" onSubmit={event => {event.preventDefault();void validate();}}>
      <label>Correos institucionales<textarea rows={8} required value={input} onChange={event => setInput(event.target.value)} placeholder={sample} aria-describedby="email-help" /></label>
      <p id="email-help" className="small muted">Puedes separar las direcciones con saltos de línea, comas o punto y coma. No se guardará nada todavía.</p>
      {error && <p role="alert" className="error">{error}</p>}<div className="button-row end"><button type="button" className="button secondary" onClick={() => changeOpen(false)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Analizando…':'Revisar lista'}</button></div>
    </form> : <div className="enrollment-preview">
      <p className="small muted preview-detected">Se revisaron {preview.totals.detected} direcciones.</p>
      <div className="preview-metrics" aria-label="Resumen de la validación"><span><strong>{validCount}</strong> válidos</span><span><strong>{invalidCount}</strong> inválidos</span><span><strong>{duplicateCount}</strong> duplicados</span><span><strong>{existingCount}</strong> ya existentes</span><span><strong>{selected.length}</strong> seleccionados</span></div>
      <div className="selection-toolbar"><div className="button-row"><button className="button secondary compact" type="button" disabled={!validCount} onClick={() => selectValid(true)}>Seleccionar válidos</button><button className="button ghost compact" type="button" disabled={!selected.length} onClick={() => selectValid(false)}>Deseleccionar</button></div><button className="text-link" type="button" onClick={() => {setPreview(null);setInput(validationInput);}}>Editar lista completa</button></div>
      <div className="enrollment-review-list" aria-label="Resultados por correo">{rows.map((row,index) => <article className={`enrollment-review-row is-${row.status}`} key={`${index}-${row.email}`}><label className="review-check"><input aria-label={`Incluir ${row.email || row.input}`} type="checkbox" disabled={row.status !== 'valid'} checked={row.selected && row.status === 'valid'} onChange={event => setRows(current => current.map((item,itemIndex) => itemIndex === index ? {...item,selected:event.target.checked}:item))} /><span className="sr-only">Incluir en la matrícula</span></label><div className="review-address"><input aria-label={`Corregir dirección ${index+1}`} value={row.input} onChange={event => changeRow(index,event.target.value)} /><small>{row.message}</small></div><Badge tone={row.status === 'valid' ? 'green' : row.status === 'revoked' ? 'amber':''}>{previewLabels[row.status]}</Badge></article>)}</div>
      {error && <p role="alert" className="error">{error}</p>}<div className="enrollment-modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => changeOpen(false)}>Cancelar</button><div className="button-row"><button type="button" className="button secondary" disabled={busy} onClick={() => void validate(validationInput)}><RotateCcw size={17} aria-hidden="true" /> Volver a validar</button><button type="button" className="button primary" disabled={busy || !selected.length} onClick={() => void confirm()}>{busy ? 'Autorizando…':`Confirmar ${selected.length} matrícula${selected.length === 1 ? '':'s'}`}</button></div></div>
    </div>}
  </Modal>;
}

function TeacherRoster({ course,onCourseChanged }:{course:RealClassroomData;onCourseChanged:()=>void}) {
  const navigate = useNavigate();
  const [rows,setRows] = useState<Enrollment[]|null>(null);
  const [requests,setRequests] = useState<RequestRow[]>([]);
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState<'all'|EnrollmentStatus>('all');
  const [importOpen,setImportOpen] = useState(false);
  const [editOpen,setEditOpen] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const [lifecycleAction,setLifecycleAction] = useState<LifecycleAction|null>(null);
  const [impact,setImpact] = useState<LifecycleImpact|null>(null);
  const [understood,setUnderstood] = useState(false);
  const [confirmationName,setConfirmationName] = useState('');
  useEffect(() => {
    let active=true;
    Promise.all([api<Enrollment[]>(`/classrooms/${course.id}/enrollments`),api<RequestRow[]>(`/classrooms/${course.id}/enrollment-requests`)])
      .then(([enrollments,pending]) => { if (active) {setRows(enrollments);setRequests(pending);setError('');} })
      .catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active=false; };
  },[course.id,revision]);
  const shown = useMemo(() => (rows || []).filter(row => (filter === 'all' || row.status === filter) && `${row.firstNames} ${row.lastNames} ${row.email}`.toLowerCase().includes(query.toLowerCase())),[rows,filter,query]);
  const count = (status:EnrollmentStatus) => (rows || []).filter(row => row.status === status).length;
  async function enrollmentAction(row:Enrollment,action:'revoke'|'reauthorize') {
    if (action === 'revoke' && !window.confirm(`¿Revocar el acceso de ${row.email}? El bloqueo será inmediato.`)) return;
    try { await api(`/classrooms/${course.id}/enrollments/${row.id}`,{method:'PATCH',body:JSON.stringify({action})});setRevision(value => value+1); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function requestAction(row:RequestRow,action:'approve'|'reject') {
    if (!window.confirm(`${action === 'approve' ? '¿Aprobar':'¿Rechazar'} la solicitud de ${row.email}?`)) return;
    try { await api(`/classrooms/${course.id}/enrollment-requests/${row.id}`,{method:'PATCH',body:JSON.stringify({action})});setRevision(value => value+1); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function openLifecycle(action:LifecycleAction) {
    setLifecycleAction(action);setImpact(null);setUnderstood(false);setConfirmationName('');setError('');
    try { setImpact(await api<LifecycleImpact>(`/classrooms/${course.id}/lifecycle-impact`)); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function applyLifecycle() {
    if (!lifecycleAction) return;
    setSaving(true);setError('');
    try {
      await api(`/classrooms/${course.id}`,{method:'PATCH',body:JSON.stringify({action:lifecycleAction,understood,confirmationName})});
      setLifecycleAction(null);
      if (lifecycleAction === 'delete') navigate('/docente/cursos',{replace:true}); else onCourseChanged();
    } catch (failure) { setError((failure as Error).message); } finally { setSaving(false); }
  }
  async function edit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setSaving(true);setError('');
    const fields=new FormData(event.currentTarget);
    try { await api(`/classrooms/${course.id}`,{method:'PATCH',body:JSON.stringify({section:fields.get('section'),period:fields.get('period'),shift:fields.get('shift')})});setEditOpen(false);onCourseChanged(); }
    catch (failure) { setError((failure as Error).message); } finally { setSaving(false); }
  }
  return <>
    <section className="enrollment-overview" aria-label="Resumen de matrículas"><article><span>Activas</span><strong>{count('active')}</strong></article><article><span>Primer acceso pendiente</span><strong>{count('preauthorized')}</strong></article><article><span>Solicitudes pendientes</span><strong>{requests.filter(row => row.status === 'pending').length}</strong></article><article><span>Revocadas</span><strong>{count('revoked')}</strong></article></section>
    <section className="panel roster-panel"><div className="section-heading"><div><p className="eyebrow">NÓMINA PRIVADA</p><h2>Estudiantes</h2></div><div className="button-row"><button className="button secondary" disabled={Boolean(course.archivedAt)} onClick={() => setEditOpen(true)}>Editar aula</button>{course.archivedAt ? <><button className="button secondary" onClick={() => void openLifecycle('restore')}><RotateCcw size={17}/> Restaurar aula</button><button className="button danger-outline" onClick={() => void openLifecycle('delete')}><Trash2 size={17}/> Eliminar aula</button></>:<button className="button secondary" onClick={() => void openLifecycle('archive')}><Archive size={17}/> Archivar aula</button>}<button className="button primary" disabled={Boolean(course.archivedAt)} onClick={() => setImportOpen(true)}><UserPlus size={17} aria-hidden="true" /> Agregar estudiantes</button></div></div>
      {course.archivedAt && <div className="archived-notice" role="status"><Archive aria-hidden="true"/><div><strong>Esta aula está archivada</strong><p className="small muted">La nómina y el historial se conservan, pero el acceso estudiantil y las modificaciones permanecen suspendidos.</p></div></div>}
      <div className="roster-tools"><label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar estudiantes</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre o correo" /></label><label><span className="sr-only">Filtrar matrículas</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Todos los estados</option><option value="active">Activas</option><option value="preauthorized">Pendientes de primer acceso</option><option value="revoked">Revocadas</option></select></label></div>
      {error && <p role="alert" className="error">{error}</p>}{!rows && !error && <p role="status">Consultando la nómina…</p>}
      {rows && !rows.length && <EmptyState title="Esta aula todavía no tiene estudiantes">Agrega uno o varios correos institucionales para preparar el acceso.</EmptyState>}
      {rows && rows.length > 0 && !shown.length && <EmptyState title="No hay resultados con estos filtros">Prueba otro término o muestra todos los estados.</EmptyState>}
      {shown.length > 0 && <div className="table-scroll"><table className="enrollment-table"><thead><tr><th scope="col">Estudiante</th><th scope="col">Estado</th><th scope="col">Autorización</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{shown.map(row => <tr key={row.id}><td><strong>{row.firstNames || row.lastNames ? `${row.firstNames} ${row.lastNames}`.trim():row.email}</strong>{(row.firstNames || row.lastNames) && <small>{row.email}</small>}</td><td><Badge tone={row.status === 'active' ? 'green':row.status === 'preauthorized' ? 'amber':''}>{labels[row.status]}</Badge></td><td>{new Intl.DateTimeFormat('es-PE',{dateStyle:'medium'}).format(new Date(row.authorizedAt))}</td><td><button className={`button ${row.status === 'revoked' ? 'secondary':'danger-outline'}`} onClick={() => void enrollmentAction(row,row.status === 'revoked' ? 'reauthorize':'revoke')}>{row.status === 'revoked' ? 'Volver a autorizar':'Revocar'}</button></td></tr>)}</tbody></table></div>}
    </section>
    {requests.some(row => row.status === 'pending') && <section className="panel request-panel"><div className="section-heading"><div><p className="eyebrow">FLUJO ALTERNATIVO</p><h2>Solicitudes pendientes</h2></div><Badge tone="amber">{requests.filter(row => row.status === 'pending').length}</Badge></div>{requests.filter(row => row.status === 'pending').map(row => <div className="request-row" key={row.id}><div><strong>{row.first_names || row.last_names ? `${row.first_names} ${row.last_names}`.trim():row.email}</strong><p className="small muted">{row.email}</p></div><div className="button-row"><button className="button secondary" onClick={() => void requestAction(row,'reject')}>Rechazar</button><button className="button primary" onClick={() => void requestAction(row,'approve')}>Aprobar</button></div></div>)}</section>}
    <ImportEnrollments classroomId={course.id} open={importOpen} onOpenChange={setImportOpen} onCompleted={() => setRevision(value => value+1)} />
    <Modal contentClassName="lifecycle-modal" open={Boolean(lifecycleAction)} onOpenChange={value => {if(!saving && !value)setLifecycleAction(null);}} title={lifecycleAction === 'archive' ? 'Archivar aula':lifecycleAction === 'restore' ? 'Restaurar aula':'Eliminar aula definitivamente'} description={lifecycleAction === 'delete' ? 'Esta acción retira el aula de AULIGMA y no puede deshacerse desde la interfaz.':'Revisa el impacto antes de continuar.'}>
      {!impact ? <p role="status">Calculando el impacto real…</p>:<div className="lifecycle-dialog"><div className={`lifecycle-callout ${lifecycleAction === 'delete' ? 'danger':''}`}><ShieldAlert aria-hidden="true"/><div><span className="eyebrow">AULA</span><strong>{impact.name}</strong><p className="small">{course.period} · Sección {course.section}</p></div></div><div className="impact-grid" aria-label="Impacto de la acción"><article><strong>{impact.students.total}</strong><span>matrículas conservadas</span></article><article><strong>{impact.planning.available ? impact.planning.count:'—'}</strong><span>planificaciones</span><small>{impact.planning.available ? 'registros':'Módulo aún no habilitado'}</small></article><article><strong>{impact.assessments.available ? impact.assessments.count:'—'}</strong><span>evaluaciones</span><small>{impact.assessments.available ? 'registros':'Módulo aún no habilitado'}</small></article></div>{lifecycleAction === 'archive' && <label className="confirmation-check"><input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)}/><span>Comprendo que los estudiantes perderán el acceso mientras el aula permanezca archivada.</span></label>}{lifecycleAction === 'delete' && <><div className="danger-copy"><strong>Eliminación lógica irreversible</strong><p>Las relaciones se conservarán para auditoría, pero el aula dejará de aparecer y no podrá restaurarse desde la aplicación.</p></div><label>Escribe <strong>{impact.name}</strong> para confirmar<input value={confirmationName} onChange={event => setConfirmationName(event.target.value)} autoComplete="off"/></label><label className="confirmation-check"><input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)}/><span>Comprendo que esta acción es destructiva para el uso normal del aula.</span></label></>}{error&&<p className="error" role="alert">{error}</p>}<div className="button-row end"><button type="button" className="button secondary" disabled={saving} onClick={()=>setLifecycleAction(null)}>Cancelar</button><button type="button" className={lifecycleAction === 'delete' ? 'button danger':'button primary'} disabled={saving || (lifecycleAction === 'archive' && !understood) || (lifecycleAction === 'delete' && (!understood || confirmationName !== impact.name))} onClick={() => void applyLifecycle()}>{saving?'Procesando…':lifecycleAction === 'archive' ? 'Archivar aula':lifecycleAction === 'restore' ? 'Restaurar aula':'Eliminar aula'}</button></div></div>}
    </Modal>
    <Modal open={editOpen} onOpenChange={value => {if(!saving)setEditOpen(value);}} title="Editar datos del aula" description="La asignatura y la nómina permanecen vinculadas."><form className="form-stack" onSubmit={edit}><div className="form-grid"><label>Sección<input name="section" required maxLength={30} defaultValue={course.section}/></label><label>Periodo<input name="period" required maxLength={30} defaultValue={course.period}/></label></div><label>Turno<select name="shift" defaultValue={course.shift}><option>Mañana</option><option>Tarde</option><option>Noche</option></select></label>{error&&<p className="error" role="alert">{error}</p>}<div className="button-row end"><button type="button" className="button secondary" onClick={()=>setEditOpen(false)}>Cancelar</button><button className="button primary" disabled={saving}>{saving?'Guardando…':'Guardar cambios'}</button></div></form></Modal>
  </>;
}

export function RealClassroom() {
  const { id = '' } = useParams();
  const { user } = useRealAuth();
  const [course,setCourse] = useState<RealClassroomData|null>(null);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  useEffect(() => { let active=true;api<RealClassroomData>(`/classrooms/${id}`).then(result => {if(active){setCourse(result);setError('');}}).catch(failure => {if(active)setError((failure as Error).message);});return()=>{active=false;}; },[id,revision]);
  if (error) return <div className="panel"><EmptyState title="No puedes abrir esta aula">{error}</EmptyState></div>;
  if (!course) return <p role="status">Abriendo aula…</p>;
  return <><PageHeading eyebrow={`${course.period} · SECCIÓN ${course.section}`} title={course.name} description={`${course.shift} · ${user?.role === 'estudiante' ? `Docente: ${course.teacherName || 'Perfil docente'}`:'Aula privada'}`} />
    <nav className="classroom-context" aria-label="Secciones del aula">{user?.role === 'docente'?<Link className="active" aria-current="page" to={`/docente/cursos/${course.id}`}>Estudiantes</Link>:<Link className="active" aria-current="page" to={`/estudiante/cursos/${course.id}`}>Resumen</Link>}<Link to={`/${user?.role}/cursos/${course.id}/planificacion`}>Planificación</Link>{user?.role === 'docente'?<Link to={`/docente/cursos/${course.id}/evaluaciones`}>Evaluaciones</Link>:<Link to={`/estudiante/cursos/${course.id}/actividades`}>Actividades</Link>}</nav>
    {user?.role === 'docente' ? <TeacherRoster course={course} onCourseChanged={() => setRevision(value => value+1)} />:<section className="panel student-course-summary"><span className="course-glyph" aria-hidden="true">∂</span><div><p className="eyebrow">RESUMEN DEL CURSO</p><h2>Tu aula está disponible</h2><p className="muted">La matrícula está activa y vinculada con tu identidad institucional.</p><div className="course-facts"><span><strong>Periodo</strong>{course.period}</span><span><strong>Sección</strong>{course.section}</span><span><strong>Turno</strong>{course.shift}</span></div><div className="content-empty"><UsersRound aria-hidden="true"/><div><strong>Tu docente todavía no ha publicado contenidos</strong><p className="muted">La planificación académica y las actividades aparecerán cuando sean publicadas.</p><Link className="text-link" to={`/estudiante/cursos/${course.id}/actividades`}>Consultar actividades →</Link></div></div></div></section>}
  </>;
}
