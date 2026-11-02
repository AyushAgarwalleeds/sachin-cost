import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true }
});
