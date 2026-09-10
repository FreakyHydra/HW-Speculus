import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const softwareUpdateDate = process.env.SPECULUS_UPDATE_DATE || new Date().toISOString().slice(0, 10);
const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }).version || '0.0.0';
let buildCommit = process.env.SPECULUS_BUILD_COMMIT || 'unknown';
try {
  if (buildCommit === 'unknown') buildCommit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
} catch {
  // Git metadata may not exist in some packaged deployment environments.
}
const softwareVersion = `v${packageVersion}+${buildCommit}`;

export default defineConfig({
  plugins: [react()],
  define: {
    __SPECULUS_UPDATE_DATE__: JSON.stringify(softwareUpdateDate),
    __SPECULUS_VERSION__: JSON.stringify(softwareVersion),
  },
  server: {
    port: 5175,
    proxy: { '/api': 'http://127.0.0.1:8790' },
  },
  preview: { port: 4175 },
});
