import { useEffect, useRef } from 'react';
import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient as defaultQueryClient } from '../api/queryClient';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { BookingProvider } from '../context/BookingContext';
import { ToastViewport } from '../components/ui/Toast';
import { AppRoutes } from './routes';

export const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

/** Cached server data may be owner-specific (drafts, ownerId): drop it whenever the identity changes. */
function SessionCacheBoundary() {
  const client = useQueryClient();
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const previous = useRef(userId);
  useEffect(() => {
    if (previous.current !== userId) client.clear();
    previous.current = userId;
  }, [client, userId]);
  return null;
}

export function App({ client = defaultQueryClient }: { client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionCacheBoundary />
        <BookingProvider>
          <BrowserRouter future={routerFuture}>
            <AppRoutes />
          </BrowserRouter>
        </BookingProvider>
      </AuthProvider>
      <ToastViewport />
    </QueryClientProvider>
  );
}

export default App;
