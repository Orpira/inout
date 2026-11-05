import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Kiosko } from './Kiosko';
import { Panel } from './Panel';
import './index.css';

const queryClient = new QueryClient();

// Dos pantallas: /kiosko (táctil, sin sesión) y el panel en cualquier otra ruta.
const esKiosko = window.location.pathname.startsWith('/kiosko');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>{esKiosko ? <Kiosko /> : <Panel />}</QueryClientProvider>
  </StrictMode>,
);
