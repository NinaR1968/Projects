// Local run. vercel dev does not read .env.local, so Node loads it and passes it on.
// Run: node --env-file=.env.local scripts/dev.mjs
import { spawn } from 'node:child_process';

const child = spawn('vercel dev --listen 3000', { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
