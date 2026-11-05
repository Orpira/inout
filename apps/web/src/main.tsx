import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorApi } from './api';
import { Kiosko } from './Kiosko';
import { Panel } from './Panel';
import './index.css';

// Si la sesión caduca a mitad de uso, cualquier 401 devuelve al login.
const alCaducar = (err: Error) => {
  if (err instanceof ErrorApi && err.status === 401) queryClient.setQueryData(['sesion'], null);
};
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: alCaducar }),
  mutationCache: new MutationCache({ onError: alCaducar }),
  defaultOptions: { queries: { retry: (n, err) => !(err instanceof ErrorApi && err.status < 500) && n < 2 } },
});

// Dos pantallas: /kiosko (táctil, sin sesión) y el panel en cualquier otra ruta.
const esKiosko = window.location.pathname.startsWith('/kiosko');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>{esKiosko ? <Kiosko /> : <Panel />}</QueryClientProvider>
  </StrictMode>,
);
