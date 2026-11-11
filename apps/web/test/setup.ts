import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetMockDb } from './msw/handlers';
import { server } from './msw/server';
import { clearToasts } from '../src/components/ui/Toast';

// --- jsdom/Node interop -----------------------------------------------------
// MSW builds Fetch `Request`s with Node's implementation, which does not understand jsdom's
// FormData/File (multipart bodies arrive as "[object FormData]"). Browsers have a single
// implementation, so the tests use Node's native classes to serialize uploads faithfully.
const urlencoded = new Response('probe=1', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
const NativeFormData = (await urlencoded.formData()).constructor as typeof FormData;
Object.assign(globalThis, { FormData: NativeFormData, File: NodeFile, Blob: NodeBlob });

// Node >= 25 defines a global `localStorage` that is undefined without --localstorage-file and
// shadows jsdom's Storage. Node 20 (the supported runtime) is unaffected; restore jsdom's otherwise.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (dom && typeof globalThis[key] === 'undefined') {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
}

// jsdom does not implement scrolling; route changes call window.scrollTo.
if (typeof window !== 'undefined') Object.defineProperty(window, 'scrollTo', { configurable: true, value: () => undefined });

// --- Contract mocks ------------------------------------------------------------
// Suites that stub `fetch` directly keep working because MSW only sees requests that reach the
// real transport. Unmatched requests fail loudly instead of hitting the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
  clearToasts();
});
afterAll(() => server.close());
