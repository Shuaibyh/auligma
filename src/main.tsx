import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/manrope";
import "@fontsource-variable/source-serif-4";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./refinements.css";
import { App } from "./App";
import { DemoProvider } from "./state/DemoContext";
import { AuthProvider } from "./auth/demoAuth";
import { RealApp } from "./RealApp";
import "./real.css";
const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoProvider>
        {demoMode ? <AuthProvider><App /></AuthProvider> : <RealApp />}
      </DemoProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
