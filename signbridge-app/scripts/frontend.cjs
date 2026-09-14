// Preview-only commands: no real backend credentials or network calls are needed.
const { spawn } = require('node:child_process');
const path = require('node:path');
const mode = process.argv[2] || 'dev';
if (!['dev', 'build', 'start'].includes(mode)) throw new Error('Expected dev, build or start');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, ...process.argv.slice(3)], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit',
  env: { ...process.env, SIGNBRIDGE_BUILD_DIR: mode === 'dev' ? '.next-preview' : '.next-check' },
});
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
