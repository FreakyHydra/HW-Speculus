import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const softwareUpdateDate = process.env.SPECULUS_UPDATE_DATE || new Date().toISOString().slice(0, 10);

export default defineConfig({
  plugins: [react()],
  define: { __SPECULUS_UPDATE_DATE__: JSON.stringify(softwareUpdateDate) },
  server: {
    port: 5175,
    proxy: { '/api': 'http://127.0.0.1:8790' },
  },
  preview: { port: 4175 },
});
