import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/manrope";
import "@fontsource-variable/source-serif-4";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./refinements.css";
import { DemoProvider } from "./state/DemoContext";
import { AuthProvider } from "./auth/demoAuth";
import "./real.css";
const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";
const RuntimeApp = React.lazy(
  demoMode
    ? () => import("./App").then(module => ({ default: module.App }))
    : () => import("./RealApp").then(module => ({ default: module.RealApp })),
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoProvider>
        <React.Suspense fallback={<main className="connection-state"><p role="status">Preparando AULIGMA…</p></main>}>
          {demoMode ? <AuthProvider><RuntimeApp /></AuthProvider> : <RuntimeApp />}
        </React.Suspense>
      </DemoProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
