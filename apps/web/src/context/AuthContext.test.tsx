import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { session } from '../api/session';
it('restores once under a StrictMode effect remount', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, work: () => Promise<unknown>) => work() } });
  const pair = { accessToken: 'test', tokenType: 'Bearer', expiresIn: 3600, user: { userId: 'u1', sessionId: 's1', role: 'GUEST' } };
  const fetcher = vi.fn((url: string) => Promise.resolve(url.endsWith('/logout') ? new Response(null, { status: 204 }) : new Response(JSON.stringify(url.endsWith('/refresh') ? pair : url.endsWith('/validate') ? pair.user : { name: 'Ana' }))));
  vi.stubGlobal('fetch', fetcher);
  function Identity() { const state = useAuth(); return <p>{state.currentUser?.name ?? state.status}</p>; }
  render(<StrictMode><AuthProvider><Identity /></AuthProvider></StrictMode>);
  expect(await screen.findByText('Ana')).toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  cleanup(); await session.logout(); vi.unstubAllGlobals();
});
