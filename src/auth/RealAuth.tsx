import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken, type UserProfile } from './api';
type State = {
  user: UserProfile | null; loading: boolean; error: string; expired: boolean;
  refresh: () => Promise<void>; updateUser: (user: UserProfile) => void; logout: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function RealAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: UserProfile; csrfToken: string }>('/me');
      setCsrfToken(result.csrfToken); setUser(result.user); setExpired(false); setError('');
    } catch (err) {
      setUser(null);
      if (!(err instanceof ApiError && err.status === 401)) setError((err as Error).message);
    } finally { setLoading(false); }
  }, []);
  // La actualización ocurre tras la respuesta HTTP; sincroniza una sesión externa.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const expire = () => { setUser(null); setCsrfToken(''); if (user) setExpired(true); };
    window.addEventListener('auligma-session-expired', expire);
    return () => window.removeEventListener('auligma-session-expired', expire);
  }, [user]);
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null); setCsrfToken(''); setExpired(false);
  }
  return <Context.Provider value={{ user, loading, error, expired, refresh, updateUser: setUser, logout }}>{children}</Context.Provider>;
}
export function useRealAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('Falta el contexto de identidad');
  return value;
}
