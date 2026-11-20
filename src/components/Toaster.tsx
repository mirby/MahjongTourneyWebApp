import { create } from 'zustand';

type Toast = { id: number; text: string; error: boolean };

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let nextId = 0;

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** Show a transient notification. Errors stay up longer since they tend to be wordier. */
export function toast(text: string, { error = false }: { error?: boolean } = {}) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text, error }] }));
  setTimeout(() => dismissToast(id), error ? 10000 : 4000);
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.error ? 'error' : ''}`}
          role={t.error ? 'alert' : 'status'}
          onClick={() => dismissToast(t.id)}
          title="Click to dismiss"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
