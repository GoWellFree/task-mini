import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info } from "lucide-react";

type ToastTone = "default" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ShowToastOptions {
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 3200;
const ACTION_DURATION = 5000;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, options: ShowToastOptions = {}) => {
    const id = nextId++;
    const toast: ToastItem = { id, message, tone: options.tone ?? "default", actionLabel: options.actionLabel, onAction: options.onAction };
    setToasts((prev) => [...prev, toast]);

    const duration = options.durationMs ?? (options.actionLabel ? ACTION_DURATION : DEFAULT_DURATION);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="animate-nova-slide-up pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-lg bg-content-primary px-4 py-3 text-surface-primary shadow-float"
            >
              <ToastIcon tone={t.tone} />
              <span className="flex-1 text-sm font-medium">{t.message}</span>
              {t.actionLabel && t.onAction && (
                <button
                  onClick={() => {
                    t.onAction?.();
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  className="shrink-0 text-sm font-semibold text-accent-secondary"
                >
                  {t.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <CheckCircle2 size={18} className="shrink-0 text-success" />;
  if (tone === "error") return <XCircle size={18} className="shrink-0 text-danger" />;
  return <Info size={18} className="shrink-0 text-surface-primary/70" />;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
