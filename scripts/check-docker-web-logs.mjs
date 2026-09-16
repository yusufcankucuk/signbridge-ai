import { execFileSync } from 'node:child_process';

const output = execFileSync('docker', ['compose', 'logs', '--no-color', 'web'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const forbidden = [/\.next\/cache\/images.*(?:EACCES|permission denied)/i, /EACCES.*\.next\/cache\/images/i];
if (forbidden.some((pattern) => pattern.test(output))) {
  console.error('Docker web logunda Next.js görüntü önbelleği izin hatası bulundu.');
  process.exit(1);
}
console.log('Docker web logunda .next/cache/images izin hatası bulunmadı.');
