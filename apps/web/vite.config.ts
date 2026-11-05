import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En desarrollo la API corre aparte; en producción la sirve el mismo proceso.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
