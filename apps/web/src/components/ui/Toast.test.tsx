import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/identity';
import { createQueryClient } from '../../api/queryClient';
import { session } from '../../api/session';
import { ToastViewport, clearToasts, pushToast } from './Toast';

/**
 * FE-024 — global 401/403 handling through non-intrusive toasts.
 *
 * The single point lives in the React Query cache (`createQueryClient`): any query/mutation that fails
 * with 401 invalidates the local session and warns the user; a 403 only warns. Toasts are accessible,
 * auto-dismiss, can be closed, never steal focus and never stack duplicates.
 */

afterEach(() => { clearToasts(); vi.restoreAllMocks(); vi.useRealTimers(); });

/** Runs a query that fails with `status`, wired to a real client so the global handler fires. */
function Boom({ status, k }: { status: number; k: string }) {
  useQuery({ queryKey: [k], queryFn: async () => { throw new ApiError(status); }, retry: false });
  return null;
}
function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}<ToastViewport /></QueryClientProvider>);
}

describe('global 401/403 toasts', () => {
  it('invalidates the session and alerts the user on 401', async () => {
    const expireSpy = vi.spyOn(session, 'expire');
    renderWithClient(<Boom status={401} k="q401" />);
    expect(await screen.findByText('Tu sesión venció. Inicia sesión nuevamente.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión venció');
    expect(expireSpy).toHaveBeenCalled();
  });

  it('warns about a forbidden action on 403 without touching the session', async () => {
    const expireSpy = vi.spyOn(session, 'expire');
    renderWithClient(<Boom status={403} k="q403" />);
    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No tienes permiso');
    expect(expireSpy).not.toHaveBeenCalled();
  });

  it('shows a single toast when several requests fail at once', async () => {
    renderWithClient(<><Boom status={401} k="a" /><Boom status={401} k="b" /><Boom status={401} k="c" /></>);
    await screen.findByText('Tu sesión venció. Inicia sesión nuevamente.');
    expect(screen.getAllByText('Tu sesión venció. Inicia sesión nuevamente.')).toHaveLength(1);
  });
});

describe('Toast UI', () => {
  it('can be dismissed manually', () => {
    render(<ToastViewport />);
    act(() => { pushToast({ message: 'Mensaje de prueba', severity: 'info' }); });
    expect(screen.getByText('Mensaje de prueba')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Mensaje de prueba')).not.toBeInTheDocument();
  });

  it('auto-dismisses after its duration', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => { pushToast({ message: 'Temporal', severity: 'info', duration: 4000 }); });
    expect(screen.getByText('Temporal')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('Temporal')).not.toBeInTheDocument();
  });

  it('does not steal focus from the current control', () => {
    render(<><input aria-label="campo" /><ToastViewport /></>);
    const input = screen.getByLabelText('campo');
    input.focus();
    act(() => { pushToast({ message: 'No molesto', severity: 'error' }); });
    expect(screen.getByText('No molesto')).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it('renders a non-blocking overlay', () => {
    render(<ToastViewport />);
    act(() => { pushToast({ message: 'x', severity: 'info' }); });
    expect(screen.getByTestId('toast-viewport')).toHaveClass('pointer-events-none');
  });

  it('deduplicates by key', async () => {
    render(<ToastViewport />);
    act(() => {
      pushToast({ message: 'Primero', dedupeKey: 'dup' });
      pushToast({ message: 'Segundo', dedupeKey: 'dup' });
    });
    expect(screen.getByText('Primero')).toBeInTheDocument();
    expect(screen.queryByText('Segundo')).not.toBeInTheDocument();
    await waitFor(() => undefined);
  });
});
