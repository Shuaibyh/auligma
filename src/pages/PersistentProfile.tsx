import { useState, type FormEvent } from 'react';
import { Camera, LockKeyhole } from 'lucide-react';
import { PageHeading } from '../components/ui';
import { useRealAuth } from '../auth/RealAuth';
import { api, type UserProfile } from '../auth/api';
import { useUnsavedProtection } from './Profile';
import { PROFESSIONAL_SCHOOLS } from '../state/catalogs';
export function PersistentProfile() {
  const { user, updateUser } = useRealAuth();
  const [draft, setDraft] = useState(user!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(user);
  useUnsavedProtection(dirty);
  if (!user) return null;
  const student = user.role === 'estudiante';
  function update(field: string, value: string | number | null) { setMessage(''); setDraft(current => ({ ...current, [field]: value })); }
  function selectPhoto(file?: File) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 131072) { setError('Elige una imagen PNG, JPG o WebP de hasta 128 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { update('photo', String(reader.result)); setError(''); };
    reader.onerror = () => setError('No pudimos leer la imagen.');
    reader.readAsDataURL(file);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const { user: saved } = await api<{ user: UserProfile }>('/me', { method: 'PATCH', body: JSON.stringify({
        firstNames: draft.firstNames, lastNames: draft.lastNames, phone: draft.phone, photo: draft.photo,
        ...(student ? { schoolId: draft.schoolId } : { professionalInfo: draft.professionalInfo }),
      }) });
      updateUser(saved); setDraft(saved); setMessage('Tu perfil se guardó correctamente.');
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  return <>
    <PageHeading eyebrow="IDENTIDAD ACADÉMICA" title={user.profileComplete ? 'Mi perfil' : 'Completa tu perfil'} description="Unos pocos datos para reconocerte y acompañar tu aprendizaje." />
    <form className="profile-layout" onSubmit={submit}>
      <aside className="panel profile-photo-panel"><span className="profile-photo">{draft.photo ? <img src={draft.photo} alt="Fotografía de perfil" width={112} height={112} /> : <span aria-hidden="true">{draft.firstNames.at(0)}{draft.lastNames.at(0)}</span>}</span><strong>{student ? 'Estudiante' : 'Docente'}</strong><p className="muted">Tu identidad está verificada con Google.</p><label className="button secondary file-field"><Camera size={17} aria-hidden="true" />Cambiar fotografía<input type="file" name="photo" accept="image/png,image/jpeg,image/webp" onChange={e => selectPhoto(e.target.files?.[0])} /></label><small>Opcional · PNG, JPG o WebP · Hasta 128 KB</small>{draft.photo && <button type="button" className="button secondary" onClick={() => update('photo',null)}>Quitar fotografía</button>}</aside>
      <section className="panel form-stack">
        <div className="section-heading"><h2>Datos del perfil</h2>{dirty && <span className="badge amber">Cambios sin guardar</span>}</div>
        <div className="form-grid">
          <label>Nombres<input name="firstNames" autoComplete="given-name" required minLength={2} maxLength={80} value={draft.firstNames} onChange={e => update('firstNames',e.target.value)} /></label>
          <label>Apellidos<input name="lastNames" autoComplete="family-name" required minLength={2} maxLength={80} value={draft.lastNames} onChange={e => update('lastNames',e.target.value)} /></label>
        </div>
        {student ? <label>Escuela profesional<select name="schoolId" required value={draft.schoolId || ''} onChange={e => update('schoolId', Number(e.target.value) || null)}><option value="">Selecciona tu escuela…</option>{PROFESSIONAL_SCHOOLS.map((school,index) => <option key={school} value={index+1}>{school}</option>)}</select></label> : <label>Información profesional <span className="muted">(opcional)</span><textarea name="professionalInfo" maxLength={240} value={draft.professionalInfo} onChange={e => update('professionalInfo',e.target.value)} /></label>}
        <label>Teléfono <span className="muted">(opcional)</span><input name="phone" type="tel" autoComplete="tel" maxLength={20} value={draft.phone} onChange={e => update('phone',e.target.value)} /></label>
        <div className="protected-fields"><LockKeyhole size={20} aria-hidden="true" /><div><strong>Identidad protegida</strong><p className="muted">Tu correo, rol y permisos se verifican de forma segura.</p><p className="identity-email">{user.email}</p>{student && <p className="muted">Código universitario: {user.universityCode || 'Pendiente de validación institucional'}</p>}</div></div>
        {error && <p className="error" role="alert">{error}</p>}{message && <p className="success-text" role="status">{message}</p>}
        <div className="button-row end"><button type="button" className="button secondary" disabled={!dirty || saving} onClick={() => { if (window.confirm('¿Descartar los cambios del perfil?')) { setDraft(user); setError(''); } }}>Descartar cambios</button><button className="button primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
      </section>
    </form>
  </>;
}
