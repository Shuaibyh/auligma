import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo, ThemeButton } from "../components/ui";
import { roleHome, useAuth } from "../auth/demoAuth";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [googleMessage, setGoogleMessage] = useState("");
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!username.trim()) {
      setError("Escribe el usuario de demostración.");
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Escribe la contraseña de demostración.");
      passwordRef.current?.focus();
      return;
    }
    setSubmitting(true);
    const result = await login(username, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      setPassword("");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const requested = (location.state as { from?: string } | null)?.from;
    const destination = requested?.startsWith(`/${result.user.role}`) ? requested : roleHome(result.user.role);
    navigate(destination, { replace: true });
  }

  return (
    <div className="login-page">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className="login-header">
        <Logo />
        <ThemeButton />
      </header>
      <main id="contenido" className="login-main">
        <section className="login-intro" aria-labelledby="login-title">
          <p className="eyebrow">APRENDER CON CLARIDAD</p>
          <h1 id="login-title">Bienvenido a AULIGMA</h1>
          <p className="login-subtitle">Accede a tu espacio académico</p>
          <div className="login-construction" aria-hidden="true">
            <span className="construction-circle" /><span className="construction-line" /><span className="construction-point one" /><span className="construction-point two" /><span className="construction-point three" />
          </div>
          <blockquote>La claridad también es una forma de confianza.</blockquote>
        </section>
        <section className="login-panel" aria-label="Inicio de sesión de demostración">
          <form className="login-form" onSubmit={submit} noValidate>
            <label htmlFor="demo-username">Usuario</label>
            <input ref={usernameRef} id="demo-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} aria-invalid={!!error} placeholder="Escribe tu usuario…" />
            <label htmlFor="demo-password">Contraseña</label>
            <div className="password-field">
              <input ref={passwordRef} id="demo-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={!!error} />
              <button type="button" className="password-toggle" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button>
            </div>
            {error && <p ref={errorRef} tabIndex={-1} role="alert" className="error login-error">{error}</p>}
            <button className="button primary login-submit" type="submit" disabled={submitting}>{submitting ? "Comprobando…" : "Iniciar sesión"}</button>
          </form>
          <div className="login-divider" aria-hidden="true"><span>o</span></div>
          <button className="button secondary google-button" type="button" aria-describedby={googleMessage ? "google-status" : undefined} onClick={() => setGoogleMessage("El acceso con Google aún no está habilitado. Utiliza el inicio de sesión disponible.")}><span className="google-mark" aria-hidden="true">G</span><span className="google-label">Continuar con Google</span></button>
          {googleMessage && <p id="google-status" className="google-status" role="status">{googleMessage}</p>}
          <p className="login-note">Acceso temporal para pruebas.</p>
        </section>
      </main>
      <footer className="login-footer"><span>AULIGMA · Geometría razonada</span><span>Aprender es conectar ideas.</span></footer>
    </div>
  );
}
