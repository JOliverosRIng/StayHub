import { useEffect, useSyncExternalStore } from 'react';

/**
 * FE-024 — non-intrusive toasts.
 *
 * A tiny framework-light store (module level) so non-React code — notably the React Query cache in
 * `api/queryClient.ts`, the single point for global 401/403 handling — can raise a toast with
 * `pushToast`. `ToastViewport` renders the stack once near the app root. Toasts auto-dismiss, can be
 * closed, never steal focus and deduplicate by `dedupeKey`, so a burst of failures shows one message.
 */

export type ToastSeverity = 'error' | 'warning' | 'info' | 'success';

export interface ToastInput {
  message: string;
  severity?: ToastSeverity;
  /** When set, a toast is skipped if another with the same key is still on screen. */
  dedupeKey?: string;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}

export interface Toast {
  id: number;
  message: string;
  severity: ToastSeverity;
  duration: number;
  dedupeKey?: string;
}

const DEFAULT_DURATION = 5000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function pushToast(input: ToastInput): number | undefined {
  if (input.dedupeKey && toasts.some((t) => t.dedupeKey === input.dedupeKey)) return undefined;
  const toast: Toast = {
    id: nextId++,
    message: input.message,
    severity: input.severity ?? 'info',
    duration: input.duration ?? DEFAULT_DURATION,
    dedupeKey: input.dedupeKey,
  };
  toasts = [...toasts, toast];
  emit();
  return toast.id;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) { toasts = next; emit(); }
}

/** Drops every queued toast. Used by the global test setup to isolate cases. */
export function clearToasts(): void {
  if (toasts.length) { toasts = []; emit(); }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => toasts;

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const SEVERITY_STYLES: Record<ToastSeverity, string> = {
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-gray-900 text-white',
  success: 'bg-green-600 text-white',
};

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration]);

  return (
    <div
      // Errors are assertive; everything else is announced politely. Neither moves focus.
      role={toast.severity === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm max-w-sm ${SEVERITY_STYLES[toast.severity]}`}
    >
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 text-lg leading-none opacity-80 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/** Fixed, non-blocking stack of toasts. Mount once near the app root (see `app/App.tsx`). */
export function ToastViewport() {
  const items = useToasts();
  return (
    <div
      data-testid="toast-viewport"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {items.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
    </div>
  );
}
