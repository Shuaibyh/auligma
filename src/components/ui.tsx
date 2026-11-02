import * as Dialog from "@radix-ui/react-dialog";
import { lazy, Suspense } from "react";
import { X, ArrowUpRight, Triangle, Sun, Moon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useDemo } from "../state/DemoContext";
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <Triangle size={25} strokeWidth={1.5} />
        <span />
      </span>
      AULIGMA<span className="logo-dot">.</span>
    </span>
  );
}
export function ThemeButton() {
  const { dark, toggleTheme } = useDemo();
  return (
    <button
      className="icon-button"
      onClick={toggleTheme}
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
const MathRenderer = lazy(() => import("./MathRenderer"));
export function MathBlock({
  formula,
  block = true,
}: {
  formula: string;
  block?: boolean;
}) {
  return (
    <Suspense fallback={<span role="status">Preparando fórmula…</span>}>
      <MathRenderer formula={formula} block={block} />
    </Suspense>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">∅</span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
export function RouteCard({
  to,
  title,
  children,
}: {
  to: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link className="route-card" to={to}>
      <div>
        <h3>{title}</h3>
        <p className="muted">{children}</p>
      </div>
      <ArrowUpRight size={22} />
    </Link>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName = "",
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  const { dark } = useDemo();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          data-theme={dark ? "dark" : "light"}
          className={`modal-content ${contentClassName}`.trim()}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">
            {description}
          </Dialog.Description>
          <Dialog.Close className="icon-button modal-close" aria-label="Cerrar">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
