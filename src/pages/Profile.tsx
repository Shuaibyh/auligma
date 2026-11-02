import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, LockKeyhole } from "lucide-react";
import { PageHeading } from "../components/ui";
import { PROFESSIONAL_SCHOOLS } from "../state/catalogs";
import { useDemo } from "../state/DemoContext";

export function useUnsavedProtection(dirty: boolean) {
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    function protectInternalNavigation(event: MouseEvent) {
      if (!dirty || event.defaultPrevented) return;
      const link = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.href === window.location.href) return;
      if (!window.confirm("¿Quieres salir sin guardar los cambios del perfil?")) event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", protectInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", protectInternalNavigation, true);
    };
  }, [dirty]);
}

export function Profile({ student = false }: { student?: boolean }) {
  const { studentProfile, setStudentProfile, teacherProfile, setTeacherProfile } = useDemo();
  const source = student ? studentProfile : teacherProfile;
  const [draft, setDraft] = useState(source);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(source), [draft, source]);
  useUnsavedProtection(dirty);

  function update(field: string, value: string) {
    setMessage("");
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setError("Elige una imagen JPG, PNG o WebP de hasta 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("photo", String(reader.result));
    reader.onerror = () => setError("No pudimos leer la imagen. Elige otro archivo.");
    reader.readAsDataURL(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const firstNames = draft.firstNames.trim();
    const lastNames = draft.lastNames.trim();
    if (firstNames.length < 2 || lastNames.length < 2) {
      setError("Escribe nombres y apellidos de al menos 2 caracteres.");
      event.currentTarget.querySelector<HTMLInputElement>(firstNames.length < 2 ? "[name=firstNames]" : "[name=lastNames]")?.focus();
      return;
    }
    if (draft.phone && !/^\+?[0-9\s-]{7,20}$/.test(draft.phone)) {
      setError("Escribe un teléfono válido o deja el campo vacío.");
      event.currentTarget.querySelector<HTMLInputElement>("[name=phone]")?.focus();
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      if (student) setStudentProfile(draft as typeof studentProfile);
      else setTeacherProfile(draft as typeof teacherProfile);
      setSaving(false);
      setMessage("Perfil de demostración actualizado en esta sesión.");
    }, 250);
  }

  const initials = `${draft.firstNames.at(0) || ""}${draft.lastNames.at(0) || ""}`.toUpperCase();
  return (
    <>
      <PageHeading eyebrow="IDENTIDAD Y PREFERENCIAS" title="Mi perfil" description="Consulta y actualiza tus datos de demostración. Los cambios solo viven en esta sesión." />
      <form className="profile-layout" onSubmit={submit}>
        <aside className="panel profile-photo-panel">
          <span className="profile-photo" aria-label={`Fotografía de ${draft.firstNames} ${draft.lastNames}`}>
            {draft.photo ? <img src={draft.photo} alt="Fotografía de perfil seleccionada" width="112" height="112" /> : initials}
          </span>
          <label className="button secondary file-field">
            <Camera size={17} aria-hidden="true" /> Cambiar fotografía
            <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectPhoto(event.target.files?.[0])} />
          </label>
          <small className="muted">Opcional · Máximo 2 MB · Solo memoria local</small>
        </aside>
        <section className="panel form-stack">
          <div className="section-heading"><h2>Datos del perfil</h2>{dirty && <span className="badge amber">Cambios sin guardar</span>}</div>
          <div className="form-grid">
            <label>Nombres<input required name="firstNames" autoComplete="given-name" maxLength={80} value={draft.firstNames} onChange={(event) => update("firstNames", event.target.value)} /></label>
            <label>Apellidos<input required name="lastNames" autoComplete="family-name" maxLength={80} value={draft.lastNames} onChange={(event) => update("lastNames", event.target.value)} /></label>
          </div>
          <label>Teléfono <span className="muted">(opcional)</span><input type="tel" inputMode="tel" name="phone" autoComplete="tel" maxLength={20} placeholder="Por ejemplo, +51 900 000 000…" value={draft.phone} onChange={(event) => update("phone", event.target.value)} /></label>
          {student ? (
            <label>Escuela profesional<select name="school" value={(draft as typeof studentProfile).school} onChange={(event) => update("school", event.target.value)}>{PROFESSIONAL_SCHOOLS.map((school) => <option key={school}>{school}</option>)}</select><small className="muted">En el producto real, un cambio que afecte datos académicos requerirá validación.</small></label>
          ) : (
            <label>Información profesional <span className="muted">(opcional)</span><textarea name="professionalInfo" maxLength={240} value={(draft as typeof teacherProfile).professionalInfo} onChange={(event) => update("professionalInfo", event.target.value)} /></label>
          )}
          <div className="protected-fields">
            <LockKeyhole size={19} aria-hidden="true" />
            <div><strong>Datos protegidos</strong><p className="muted">Correo institucional{student ? " y código universitario" : " y permisos docentes"} no pueden modificarse en este prototipo.</p><p><span translate="no">{draft.email}</span>{student ? ` · ${(draft as typeof studentProfile).universityCode}` : ""}</p></div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success-text" role="status"><CheckCircle2 size={17} aria-hidden="true" /> {message}</p>}
          <div className="button-row end">
            <button className="button secondary" type="button" disabled={!dirty || saving} onClick={() => { if (!window.confirm("¿Descartar los cambios del perfil?")) return; setDraft(source); setError(""); }}>Descartar cambios</button>
            <button className="button primary" type="submit" disabled={!dirty || saving}>{saving ? "Guardando localmente…" : "Guardar perfil"}</button>
          </div>
        </section>
      </form>
    </>
  );
}
