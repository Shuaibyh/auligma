import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, LogOut, UserRound, Settings2 } from 'lucide-react';
import { RealAuthProvider, useRealAuth } from './auth/RealAuth';
import { api } from './auth/api';
import { GoogleLogin } from './pages/GoogleLogin';
import { PersistentProfile } from './pages/PersistentProfile';
import { Logo, ThemeButton, PageHeading, EmptyState, Modal, RouteCard, Badge } from './components/ui';
import { RealClassroom, type RealClassroomData as Classroom } from './pages/RealClassroom';
import { AcademicPlanning } from './pages/AcademicPlanning';
import { TeacherAssessmentEditor, TeacherAssessmentList, TeacherAssessmentPreview, TeacherAssessmentVersionPreview, TeacherAssessmentVersions } from './pages/TeacherAssessments';
import { StudentActivityIntro, StudentActivityList, StudentAttempt } from './pages/StudentActivities';
function Home() {
  const { user } = useRealAuth();
  return <><PageHeading eyebrow="UN NUEVO PUNTO DE PARTIDA" title={`Hola, ${user?.firstNames || 'bienvenido'}`} description="Tu espacio está listo. Continúa donde comienza tu próxima idea." /><div className="real-course-grid"><RouteCard to={`/${user?.role}/cursos`} title="Explorar mis cursos">Consulta tus aulas privadas y encuentra tu espacio de trabajo.</RouteCard><RouteCard to={`/${user?.role}/perfil`} title="Revisar mi perfil">Mantén actualizados tus datos académicos y de contacto.</RouteCard></div></>;
}
function Courses() {
  const { user } = useRealAuth();
  const [courses, setCourses] = useState<Classroom[] | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<Classroom[]>(user?.role === 'docente' ? '/classrooms?includeArchived=true' : '/classrooms').then(result => { if (active) { setCourses(result); setError(''); } }).catch(err => { if (active) setError(err.message); });
    if (user?.role === 'docente') api<{ id: string; name: string }[]>('/subjects').then(result => { if (active) setSubjects(result); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [user?.role, revision]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const fields = new FormData(event.currentTarget);
    try {
      let id = subjectId;
      if (!id) {
        const subject = await api<{ id: string; name: string }>('/subjects', { method: 'POST', body: JSON.stringify({ name: newSubject }) });
        id = subject.id; setSubjectId(id); setSubjects(current => [...current, subject]);
      }
      await api('/classrooms', { method: 'POST', body: JSON.stringify({ subjectId: id, section: fields.get('section'), period: fields.get('period'), shift: fields.get('shift') }) });
      setOpen(false); setRevision(value => value+1);
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  const activeCourses = courses?.filter(course => !course.archivedAt) || [];
  const archivedCourses = courses?.filter(course => Boolean(course.archivedAt)) || [];
  const courseCard = (course:Classroom) => <Link className={`panel real-course ${course.archivedAt ? 'is-archived' : ''}`} key={course.id} to={`/${user?.role}/cursos/${course.id}`}><span className="eyebrow">{course.period} · SECCIÓN {course.section}</span><h2>{course.name}</h2><p className="muted">{course.shift} · {course.archivedAt ? 'Aula archivada' : user?.role === 'estudiante' ? `Docente: ${course.teacherName || 'Perfil docente'}` : 'Aula privada'}</p><span className="text-link">Consultar aula →</span></Link>;
  return <>
    <PageHeading eyebrow="UN ESPACIO PARA CADA ASIGNATURA" title="Mis cursos" description="Aulas privadas, conexiones con propósito." action={user?.role === 'docente' && <button className="button primary" onClick={() => setOpen(true)}>Crear aula</button>} />
    {error && !open && <div role="alert" className="notice"><p>{error}</p><button className="button secondary" onClick={() => setRevision(value => value+1)}>Volver a intentar</button></div>}
    {!courses && !error && <p role="status">Cargando tus cursos…</p>}
    {courses?.length === 0 && <div className="panel"><EmptyState title={user?.role === 'estudiante' ? 'Todavía no tienes cursos asignados' : 'Tu próxima aula comienza aquí'}>{user?.role === 'estudiante' ? 'Tu cuenta está lista. Los cursos aparecerán cuando tengas una matrícula autorizada.' : 'Crea una asignatura y su primera aula privada para organizar tu espacio académico.'}</EmptyState></div>}
    <div className="real-course-grid">{activeCourses.map(courseCard)}</div>
    {user?.role === 'docente' && archivedCourses.length > 0 && <section className="archived-courses"><div className="section-heading"><div><p className="eyebrow">HISTORIAL CONSERVADO</p><h2>Aulas archivadas</h2><p className="muted">Puedes consultar su nómina, restaurarlas o eliminarlas con confirmación reforzada.</p></div><Badge tone="amber">{archivedCourses.length}</Badge></div><div className="real-course-grid">{archivedCourses.map(courseCard)}</div></section>}
    <Modal open={open} onOpenChange={value => { if (!saving) setOpen(value); }} title="Crear aula privada" description="Cada sección conserva su propia matrícula.">
      <form className="form-stack" onSubmit={create}>
        <label>Asignatura<select value={subjectId} onChange={e => setSubjectId(e.target.value)} name="subjectId"><option value="">Crear una asignatura…</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        {!subjectId && <label>Nombre de la asignatura<input name="subjectName" required maxLength={160} value={newSubject} onChange={e => setNewSubject(e.target.value)} /></label>}
        <div className="form-grid"><label>Sección<input name="section" required maxLength={30} /></label><label>Periodo<input name="period" required maxLength={30} placeholder="Por ejemplo, 2026-II…" /></label></div>
        <label>Turno<select name="shift"><option>Mañana</option><option>Tarde</option><option>Noche</option></select></label>
        {error && <p role="alert" className="error">{error}</p>}<button className="button primary" disabled={saving}>{saving ? 'Creando aula…' : 'Crear aula privada'}</button>
      </form>
    </Modal>
  </>;
}
function Workspace() {
  const { user, logout } = useRealAuth();
  const location = useLocation();
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  const home = `/${user.role}`;
  if (!location.pathname.startsWith(home)) return <Navigate to={home} replace />;
  if (!user.profileComplete && location.pathname !== `${home}/perfil`) return <Navigate to={`${home}/perfil`} replace />;
  async function leave() {
    if (document.querySelector('.profile-layout .badge.amber') && !window.confirm('¿Salir sin guardar los cambios del perfil?')) return;
    setLeaving(true); setError('');
    try { await logout(); } catch (err) { setError((err as Error).message); } finally { setLeaving(false); }
  }
  const links = [{ to: home, label: 'Inicio', icon: LayoutDashboard },{ to: `${home}/cursos`, label: 'Mis cursos', icon: BookOpen },{ to: `${home}/perfil`, label: 'Mi perfil', icon: UserRound }];
  return <div className="app-shell real-shell" data-profile={user.role}>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <aside className="sidebar"><Link to={home} aria-label="AULIGMA, inicio"><Logo /></Link><p className="sidebar-label">{user.role === 'docente' ? 'ESPACIO DOCENTE' : 'MI APRENDIZAJE'}</p><nav aria-label="Navegación principal">{links.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end><Icon size={19} aria-hidden="true" />{label}</NavLink>)}</nav>
      <div className="sidebar-bottom"><NavLink className="utility-link" to={`${home}/ajustes`}><Settings2 size={18} aria-hidden="true" />Ajustes</NavLink><button className="utility-link logout-button" disabled={leaving} onClick={() => void leave()}><LogOut size={18} aria-hidden="true" />{leaving ? 'Cerrando sesión…' : 'Cerrar sesión'}</button><div className="profile"><span className="avatar" aria-hidden="true">{user.firstNames.at(0)}{user.lastNames.at(0)}</span><div><strong>{user.firstNames} {user.lastNames}</strong><small>{user.role === 'docente' ? 'Docente autorizado' : 'Cuenta institucional'}</small></div></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><span className="breadcrumb">Tu espacio / <strong>{links.find(link => link.to === location.pathname)?.label || 'AULIGMA'}</strong></span><ThemeButton /></header><main id="contenido" tabIndex={-1} className="main-content"><div className="route-transition" key={location.pathname}>{error && <p role="alert" className="error">{error}</p>}<Routes>
      <Route path="/" element={<Home />} /><Route path="cursos" element={<Courses />} /><Route path="cursos/:id" element={<RealClassroom />} /><Route path="cursos/:id/planificacion" element={<AcademicPlanning />} /><Route path="cursos/:id/evaluaciones" element={<TeacherAssessmentList />} /><Route path="cursos/:id/evaluaciones/:assessmentId" element={<TeacherAssessmentEditor />} /><Route path="cursos/:id/evaluaciones/:assessmentId/vista-previa" element={<TeacherAssessmentPreview />} /><Route path="cursos/:id/evaluaciones/:assessmentId/versiones" element={<TeacherAssessmentVersions />} /><Route path="cursos/:id/evaluaciones/:assessmentId/versiones/:versionId" element={<TeacherAssessmentVersionPreview />} /><Route path="cursos/:id/actividades" element={<StudentActivityList />} /><Route path="cursos/:id/actividades/:versionId" element={<StudentActivityIntro />} /><Route path="cursos/:id/intentos/:attemptId" element={<StudentAttempt />} /><Route path="perfil" element={<PersistentProfile />} />
      <Route path="ajustes" element={<><PageHeading eyebrow="TU ESPACIO" title="Ajustes" description="Elige una apariencia cómoda para estudiar." /><section className="panel"><h2>Apariencia</h2><p className="muted">Alterna entre el cuaderno claro y el espacio oscuro.</p><ThemeButton /></section></>} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes></div></main><footer className="app-footer"><span>AULIGMA · Geometría razonada</span><span>Aprender es conectar ideas.</span></footer></div>
  </div>;
}
function RealRoutes() {
  const { user, loading } = useRealAuth();
  const { pathname } = useLocation();
  const authenticated = Boolean(user);
  useEffect(() => { document.title = 'AULIGMA · Tu espacio académico'; if (authenticated) document.getElementById('contenido')?.focus(); }, [pathname,loading,authenticated]);
  if (loading) return <main className="connection-state"><Logo /><p role="status">Preparando tu espacio…</p></main>;
  return <Routes><Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <GoogleLogin />} /><Route path="/docente/*" element={<Workspace />} /><Route path="/estudiante/*" element={<Workspace />} /><Route path="*" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} /></Routes>;
}
export function RealApp() { return <RealAuthProvider><RealRoutes /></RealAuthProvider>; }
