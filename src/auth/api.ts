export type UserProfile = {
  id: string; role: 'docente' | 'estudiante'; email: string; firstNames: string; lastNames: string;
  phone: string; photo: string | null; schoolId: number | null; universityCode: string | null;
  professionalInfo: string; profileComplete: boolean;
};
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
let csrfToken = '';
export function setCsrfToken(value: string) { csrfToken = value; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, credentials: 'include', signal: options.signal || AbortSignal.timeout(12000),
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers } });
  } catch { throw new ApiError(503, 'No podemos conectar con AULIGMA. Inténtalo nuevamente.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    if (response.status === 401 || response.status === 403 && result?.error?.code === 'account_not_authorized') window.dispatchEvent(new Event('auligma-session-expired'));
    throw new ApiError(response.status, result?.error?.message || 'El servicio no está disponible. Inténtalo nuevamente.');
  }
  return result as T;
}
export async function uploadBinary<T>(path:string,file:File,headers:Record<string,string> = {}):Promise<T> {
  let response:Response;
  try { response=await fetch(`/api/v1${path}`,{method:'POST',credentials:'include',body:file,signal:AbortSignal.timeout(30000),headers:{'Content-Type':file.type,'X-CSRF-Token':csrfToken,'X-File-Name':file.name,...headers}}); }
  catch { throw new ApiError(503,'No podemos cargar el archivo. Inténtalo nuevamente.'); }
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result) throw new ApiError(response.status,result?.error?.message||'No se pudo procesar el archivo.');
  return result as T;
}
