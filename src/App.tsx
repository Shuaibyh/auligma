import { lazy, Suspense, useEffect, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Outlet,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BookOpen,
  LayoutDashboard,
  Layers3,
  FileCheck2,
  GraduationCap,
  LogOut,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Settings2,
  ChartNoAxesCombined,
  CircleHelp,
  UserRound,
} from "lucide-react";
import {
  Logo,
  ThemeButton,
  Badge,
  PageHeading,
} from "./components/ui";
import { useDemo } from "./state/DemoContext";
import { Dashboard, Classrooms, ClassroomDetail } from "./pages/Teacher";
import { ImportStudents } from "./pages/ImportStudents";
const ReviewDocumentPage = lazy(() =>
  import("./pages/ReviewDocument").then((module) => ({
    default: module.ReviewDocument,
  })),
);
function ReviewDocument() {
  return (
    <Suspense fallback={<p role="status">Abriendo espacio de revisión…</p>}>
      <ReviewDocumentPage />
    </Suspense>
  );
}
import { StudentHome, Practice, Progress } from "./pages/Student";
import { QuestionBank, QuestionDetail } from "./pages/QuestionBank";
import {
  Assessments,
  AssessmentEditor,
  AssessmentPreview,
} from "./pages/Assessments";
import { Profile } from "./pages/Profile";
import { Login } from "./pages/Login";
import { roleHome, useAuth, type DemoRole } from "./auth/demoAuth";

export function Welcome() {
  return (
    <div className="welcome">
      <header className="welcome-header">
        <Logo />
        <div className="flex items-center gap-3">
          <Badge>Prototipo · Fase 1.2</Badge>
          <ThemeButton />
        </div>
      </header>
      <main id="contenido" className="welcome-main">
        <section>
          <p className="eyebrow">
            ENSEÑAR CON INTENCIÓN. APRENDER CON SENTIDO.
          </p>
          <h1>
            El conocimiento
            <br />
            se construye.
            <br />
            <em>Paso a paso.</em>
          </h1>
          <p className="welcome-copy">
            Un espacio para conectar tus aulas, dar forma a las matemáticas y
            acompañar cada descubrimiento.
          </p>
          <div className="entry-cards">
            <Link to="/docente" className="entry-card">
              <BookOpen />
              <div>
                <strong>Soy docente</strong>
                <span>Prepara, revisa y acompaña</span>
              </div>
              <ArrowUpRight />
            </Link>
            <Link to="/estudiante" className="entry-card">
              <GraduationCap />
              <div>
                <strong>Soy estudiante</strong>
                <span>Explora, practica y comprende</span>
              </div>
              <ArrowUpRight />
            </Link>
          </div>
          <p className="small muted">
            Acceso simulado · Sin registro · Solo datos sintéticos
          </p>
        </section>
        <section
          className="geometry-panel"
          aria-label="Ilustración geométrica original de AULIGMA"
        >
          <div className="geometry-caption">
            <span>CUADERNO DE IDEAS / 001</span>
            <span>φ</span>
          </div>
          <svg
            viewBox="0 0 480 480"
            role="img"
            aria-label="Construcción geométrica de un triángulo inscrito en una circunferencia"
          >
            <defs>
              <pattern
                id="grid"
                width="30"
                height="30"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 30 0 L 0 0 0 30"
                  fill="none"
                  stroke="currentColor"
                  opacity=".12"
                />
              </pattern>
            </defs>
            <rect width="480" height="480" fill="url(#grid)" />
            <circle
              cx="240"
              cy="240"
              r="170"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            <circle
              cx="240"
              cy="240"
              r="110"
              fill="none"
              stroke="currentColor"
              opacity=".4"
            />
            <path
              d="M240 70 93 325h294Z"
              fill="currentColor"
              fillOpacity=".06"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M70 240h340M240 40v400M93 325l294-170"
              stroke="currentColor"
              opacity=".4"
              strokeDasharray="5 5"
            />
            <circle cx="240" cy="70" r="6" fill="currentColor" />
            <circle cx="93" cy="325" r="6" fill="currentColor" />
            <circle cx="387" cy="325" r="6" fill="currentColor" />
            <text
              x="252"
              y="62"
              fill="currentColor"
              fontFamily="serif"
              fontSize="22"
            >
              A
            </text>
            <text
              x="70"
              y="350"
              fill="currentColor"
              fontFamily="serif"
              fontSize="22"
            >
              B
            </text>
            <text
              x="395"
              y="350"
              fill="currentColor"
              fontFamily="serif"
              fontSize="22"
            >
              C
            </text>
          </svg>
          <div className="geometry-bottom">
            <p>
              La claridad también
              <br />
              es una forma de belleza.
            </p>
            <span>
              GEOMETRÍA RAZONADA
              <br />
              AULIGMA · 2026
            </span>
          </div>
        </section>
      </main>
      <footer className="welcome-footer">
        <span>Un nuevo punto de partida para la educación universitaria.</span>
        <span>Diseñado para comprender.</span>
      </footer>
    </div>
  );
}
const teacherLinks = [
  { to: "/docente", text: "Inicio", icon: LayoutDashboard },
  { to: "/docente/aulas", text: "Mis aulas", icon: BookOpen },
  { to: "/docente/banco", text: "Banco de preguntas", icon: Layers3 },
  { to: "/docente/evaluaciones", text: "Evaluaciones", icon: FileCheck2 },
  { to: "/docente/informes", text: "Informes", icon: ChartNoAxesCombined },
  { to: "/docente/perfil", text: "Mi perfil", icon: UserRound },
];
const studentLinks = [
  { to: "/estudiante", text: "Mis actividades", icon: BookOpen },
  { to: "/estudiante/practica", text: "Practicar", icon: Compass },
  {
    to: "/estudiante/progreso",
    text: "Mi progreso",
    icon: ChartNoAxesCombined,
  },
  { to: "/estudiante/ayuda", text: "Ayuda", icon: CircleHelp },
  { to: "/estudiante/perfil", text: "Mi perfil", icon: UserRound },
];
function Shell({ student = false }: { student?: boolean }) {
  const { concentration, studentProfile, teacherProfile } = useDemo();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const links = student ? studentLinks : teacherLinks;
  const location = useLocation();
  const current =
    [...teacherLinks, ...studentLinks].find(
      (item) => item.to === location.pathname,
    )?.text ?? "Espacio de trabajo";
  return (
    <div
      data-profile={student ? "estudiante" : "docente"}
      className={`app-shell ${student ? "student-shell" : ""} ${student && concentration && location.pathname === "/estudiante/practica" ? "concentration" : ""}`}
    >
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link to="/" aria-label="AULIGMA, bienvenida">
          <Logo />
        </Link>
        <p className="sidebar-label">
          {student ? "MI APRENDIZAJE" : "ESPACIO DOCENTE"}
        </p>
        <nav aria-label="Navegación principal">
          {links.map(({ to, text, icon: Icon }) => (
            <NavLink
              end={to === "/docente" || to === "/estudiante"}
              to={to}
              key={to}
            >
              <Icon size={19} />
              <span>{text}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!student && (
            <NavLink to="/docente/ajustes" className="utility-link">
              <Settings2 size={18} /> Ajustes
            </NavLink>
          )}
          <button className="utility-link logout-button" onClick={() => { logout(); navigate("/login", { replace: true }); }}>
            <LogOut size={18} aria-hidden="true" /> Cerrar sesión
          </button>
          <div className="profile">
            <span className="avatar">{student ? `${studentProfile.firstNames.at(0)}${studentProfile.lastNames.at(0)}` : `${teacherProfile.firstNames.at(0)}${teacherProfile.lastNames.at(0)}`}</span>
            <div>
              <strong>{student ? `${studentProfile.firstNames} ${studentProfile.lastNames}` : `${teacherProfile.firstNames} ${teacherProfile.lastNames}`}</strong>
              <small>Cuenta de demostración</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            {student ? "Aprendizaje" : "Espacio docente"}
            <span>/</span>
            <strong>{current}</strong>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="green">Entorno de demostración</Badge>
            <ThemeButton />
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="main-content">
          <div className="route-transition" key={location.key}>
            <Outlet />
          </div>
        </main>
        <footer className="app-footer">
          <span>AULIGMA · Datos sintéticos</span>
          <span>Aprender es conectar ideas.</span>
        </footer>
      </div>
    </div>
  );
}
function Settings() {
  return (
    <>
      <PageHeading
        eyebrow="TU ESPACIO"
        title="Ajustes"
        description="Personaliza la experiencia de esta sesión."
      />
      <div className="panel">
        <h2>Apariencia</h2>
        <div className="flex items-center gap-4">
          <p className="muted">
            Alterna entre el cuaderno claro y el espacio oscuro.
          </p>
          <ThemeButton />
        </div>
        <hr />
        <h2>Acerca del prototipo</h2>
        <p>
          La configuración docente se mantiene en memoria. Las respuestas de
          práctica se recuperan al recargar esta pestaña cuando el
          almacenamiento del navegador está disponible. No se envían documentos
          a servicios externos.
        </p>
      </div>
    </>
  );
}
function Help() {
  return (
    <>
      <PageHeading
        eyebrow="APRENDE A TU RITMO"
        title="Estamos para orientarte"
        description="Guía breve del espacio de práctica."
      />
      <div className="panel">
        <h2>¿Cómo funciona la práctica?</h2>
        <p>
          Elige una respuesta y pulsa “Comprobar respuesta”. Recibirás una
          explicación preparada para este ejemplo. Puedes recorrer las preguntas
          y volver a las anteriores.
        </p>
        <h2>¿Se registran calificaciones?</h2>
        <p>
          No. El progreso de práctica es local y demostrativo. Se conserva en
          esta pestaña y puedes reiniciarlo con confirmación.
        </p>
        <Link className="button primary" to="/estudiante/practica">
          Comenzar una práctica <ArrowRight size={17} />
        </Link>
      </div>
    </>
  );
}
function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("contenido")?.focus();
    document.title =
      "AULIGMA · " +
      (pathname.startsWith("/estudiante")
        ? "Aprendizaje"
        : pathname.startsWith("/docente")
          ? "Espacio docente"
          : pathname === "/login" ? "Iniciar sesión" : "Geometría razonada");
  }, [pathname]);
  return null;
}
function RequireRole({ role, children }: { role: DemoRole; children: ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (currentUser.role !== role) return <Navigate to={roleHome(currentUser.role)} replace />;
  return children;
}

function EntryRoute() {
  const { currentUser } = useAuth();
  return <Navigate to={currentUser ? roleHome(currentUser.role) : "/login"} replace />;
}

function LoginRoute() {
  const { currentUser } = useAuth();
  return currentUser ? <Navigate to={roleHome(currentUser.role)} replace /> : <Login />;
}

export function App() {
  return (
    <>
      <RouteFocus />
      <Routes>
        <Route path="/" element={<EntryRoute />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/docente" element={<RequireRole role="docente"><Shell /></RequireRole>}>
          <Route index element={<Dashboard />} />
          <Route path="aulas" element={<Classrooms />} />
          <Route path="aulas/:id" element={<ClassroomDetail />} />
          <Route path="aulas/:id/importar" element={<ImportStudents />} />
          <Route path="revision" element={<ReviewDocument />} />
          <Route path="banco" element={<QuestionBank />} />
          <Route path="banco/:id" element={<QuestionDetail />} />
          <Route path="evaluaciones" element={<Assessments />} />
          <Route
            path="evaluaciones/:id/previsualizar"
            element={<AssessmentPreview />}
          />
          <Route path="evaluaciones/:id" element={<AssessmentEditor />} />
          <Route
            path="informes"
            element={
              <>
                <PageHeading
                  eyebrow="OBSERVAR PARA ACOMPAÑAR"
                  title="Informes"
                  description="Resumen local del entorno de demostración."
                />
                <Progress teacher />
              </>
            }
          />
          <Route path="ajustes" element={<Settings />} />
          <Route path="perfil" element={<Profile />} />
        </Route>
        <Route path="/estudiante" element={<RequireRole role="estudiante"><Shell student /></RequireRole>}>
          <Route index element={<StudentHome />} />
          <Route path="practica" element={<Practice />} />
          <Route path="progreso" element={<Progress />} />
          <Route path="ayuda" element={<Help />} />
          <Route path="perfil" element={<Profile student />} />
        </Route>
        <Route
          path="*"
          element={<EntryRoute />}
        />
      </Routes>
    </>
  );
}
