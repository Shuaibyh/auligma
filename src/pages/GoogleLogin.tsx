import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Logo, ThemeButton } from '../components/ui';
import { api } from '../auth/api';
import { useRealAuth } from '../auth/RealAuth';
const messages: Record<string,string> = {
  google_not_configured: 'El acceso con Google todavía no está disponible. Vuelve a intentarlo más tarde.',
  cancelled: 'Cancelaste el inicio de sesión. Puedes intentarlo cuando quieras.',
  authentication_failed: 'No pudimos verificar tu cuenta. Vuelve a iniciar sesión con Google.',
  google_unreachable: 'AULIGMA no pudo contactar con Google. Comprueba la conexión del backend e inténtalo nuevamente.',
  account_not_authorized: 'Esta cuenta no tiene autorización. Usa tu cuenta institucional o consulta tu autorización docente.',
  backend_unavailable: 'No podemos conectar con AULIGMA. Inténtalo nuevamente.',
};
export function GoogleLogin() {
  const [params] = useSearchParams();
  const { error, expired, refresh } = useRealAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ googleConfigured: boolean }>('/auth/config').then(result => { if (active) setAvailable(result.googleConfigured); })
      .catch(err => { if (active) setConnectionError(err.message); });
    return () => { active = false; };
  }, []);
  const message = messages[params.get('error') || ''] || (expired ? 'Tu sesión terminó. Vuelve a iniciar sesión para continuar.' : '') || connectionError || error;
  const rawReference = params.get('reference') || '';
  const reference = /^[0-9a-f-]{36}$/.test(rawReference) ? rawReference : '';
  return <div className="login-page real-login">
    <a href="#contenido" className="skip-link">Saltar al contenido</a>
    <header className="login-header"><Logo /><ThemeButton /></header>
    <main id="contenido" className="login-main" tabIndex={-1}>
      <section className="login-intro" aria-labelledby="login-title">
        <p className="eyebrow">APRENDER CON CLARIDAD</p>
        <h1 id="login-title">Bienvenido a AULIGMA</h1>
        <p className="login-subtitle">Tu siguiente idea comienza aquí.</p>
        <div className="login-construction" aria-hidden="true"><span className="construction-circle" /><span className="construction-line" /><span className="construction-point one" /><span className="construction-point two" /><span className="construction-point three" /></div>
        <blockquote>La claridad también es una forma de confianza.</blockquote>
      </section>
      <section className="login-panel" aria-labelledby="access-title">
        <span className="access-symbol" aria-hidden="true"><ShieldCheck size={28} /></span>
        <p className="eyebrow">TU ESPACIO ACADÉMICO</p>
        <h2 id="access-title">Conecta con tu aprendizaje.</h2>
        <p className="muted">Ingresa con tu cuenta de Google. Tus cursos y tu perfil estarán en un solo lugar.</p>
        <button className="button primary google-button" disabled={!available || starting} onClick={() => { setStarting(true); window.location.assign('/api/v1/auth/google/start'); }}>
          <span className="google-mark" aria-hidden="true">G</span>{starting ? 'Abriendo Google…' : 'Continuar con Google'}<ArrowUpRight size={18} aria-hidden="true" />
        </button>
        <div aria-live="polite">{available === null && !connectionError && <p className="google-status">Comprobando disponibilidad…</p>}
          {available === false && <p className="google-status">El acceso con Google todavía no está disponible. Vuelve a intentarlo más tarde.</p>}</div>
        {message && <p role="alert" className="error login-error">{message}{reference && <small>Referencia: {reference}</small>}</p>}
        {(connectionError || error) && <button className="button secondary" onClick={() => { void refresh(); window.location.reload(); }}>Volver a intentar</button>}
        <div className="access-policy"><strong>Un acceso, tu propio espacio.</strong><p>Estudiantes: cuenta institucional de UNDC.<br />Docentes: cuenta previamente autorizada.</p></div>
        <p className="login-note">Solo accedes a los cursos donde tienes matrícula autorizada.</p>
      </section>
    </main>
    <footer className="login-footer"><span>AULIGMA · Geometría razonada</span><span>Aprender es conectar ideas.</span></footer>
  </div>;
}
