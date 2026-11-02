import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type DemoRole = "docente" | "estudiante";

type DemoAccount = {
  id: "demo-teacher" | "demo-student";
  username: "docente" | "alumno";
  password: "1234";
  role: DemoRole;
  displayName: string;
};

// DEMO EXCLUSIVAMENTE: credenciales sintéticas, locales y no aptas para producción.
const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { id: "demo-teacher", username: "docente", password: "1234", role: "docente", displayName: "Docente Demo" },
  { id: "demo-student", username: "alumno", password: "1234", role: "estudiante", displayName: "Estudiante Demo" },
];

const SESSION_KEY = "auligma.demo.session";

export type DemoUser = Omit<DemoAccount, "password">;
export type LoginResult = { ok: true; user: DemoUser } | { ok: false; message: string };

type AuthState = {
  currentUser: DemoUser | null;
  status: "authenticated" | "anonymous";
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function publicAccount(account: DemoAccount): DemoUser {
  const { password: _password, ...user } = account;
  void _password;
  return user;
}

function restoreDemoUser(): DemoUser | null {
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.id === id);
    return account ? publicAccount(account) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(restoreDemoUser);

  async function login(username: string, password: string): Promise<LoginResult> {
    const normalized = username.trim().toLocaleLowerCase("es");
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.username === normalized && candidate.password === password);
    if (!account) return { ok: false, message: "Usuario o contraseña incorrectos. Usa una de las cuentas de demostración indicadas." };
    const user = publicAccount(account);
    try {
      sessionStorage.setItem(SESSION_KEY, user.id);
    } catch {
      return { ok: false, message: "El navegador bloqueó la sesión temporal. Habilita sessionStorage e inténtalo de nuevo." };
    }
    setCurrentUser(user);
    return { ok: true, user };
  }

  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* La sesión en memoria también se limpia. */ }
    setCurrentUser(null);
  }

  const value = useMemo<AuthState>(() => ({
    currentUser,
    status: currentUser ? "authenticated" : "anonymous",
    login,
    logout,
  }), [currentUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Falta el contexto de autenticación de demostración");
  return value;
}

export function roleHome(role: DemoRole) {
  return role === "docente" ? "/docente" : "/estudiante";
}
