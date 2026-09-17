#!/usr/bin/env node
// MEB referans videolarından, canlı kameranın kullandığı tarayıcı çıkarıcısıyla
// (@mediapipe/tasks-vision HolisticLandmarker + aynı resultToRawFrame) ham landmark üretir.
//
// Neden: Canlı kamera tarayıcıda MediaPipe Tasks kullanır; Python hattı eski Holistic
// çözümünü kullanır. İki çıkarıcının koordinat/görünürlük dağılımı aynı değildir. Bu araç
// aynı MEB videolarının "canlı çıkarıcı görünümünü" üretir; çıktı
// `python -m src.data.prepare_meb_health --browser-landmarks <json>` ile eğitime eklenir.
// Görünümler yeni katılımcı değildir; aynı tek referansın farklı çıkarıcı/kare hızı örnekleridir.
//
// Kullanım (depo kökünde):
//   cd signbridge-app && npm i --no-save playwright@1.56 && npx playwright install chromium && cd ..
//   node scripts/extract-browser-landmarks.mjs "<veri kökü>/meb" "<veri kökü>/processed/meb_health11_browser_raw.json"
// Kareler ffmpeg (yoksa Python + OpenCV) ile PNG olarak çıkarılır ve tarayıcıda görüntü olarak
// VIDEO modunda sırayla işlenir; böylece tarayıcının H.264 desteğine bağlı kalınmaz.
// İsteğe bağlı: CHROMIUM_PATH=/yol/chrome, PYTHON=python
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createReadStream, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'signbridge-app');
const requireFromApp = createRequire(path.join(APP, 'package.json'));
const MEB_VIDEOS = [
  'bas-donmesi', 'ates', 'agri', 'astim', 'dokuntu-alerji-icin', 'kalp-carpintisi',
  'kalp-krizi', 'kanama', 'kusma', 'seker-hastaligi', 'yanik',
];
// Canlı akış ~10 kare/sn örnekler (100 ms aralık); 25 kare/sn görünümü videonun tamamını kullanır.
const VIEWS = [
  { view: 'web-10fps-p0', fps: 10, phaseMs: 0 },
  { view: 'web-10fps-p50', fps: 10, phaseMs: 50 },
  { view: 'web-25fps-p0', fps: 25, phaseMs: 0 },
];

const [sourceDir, outputPath] = process.argv.slice(2);
if (!sourceDir || !outputPath || !existsSync(sourceDir)) {
  console.error('Kullanım: node scripts/extract-browser-landmarks.mjs <MEB veya harici video klasörü> <çıktı.json>');
  process.exit(1);
}
const VIDEO_SUFFIXES = new Set(['.mp4', '.webm', '.mov', '.m4v']);
// Alt klasör varsa "harici" düzeni (<avatar>/<kaynak>_<sıra>.mp4), yoksa MEB düzeni.
const subfolders = readdirSync(sourceDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const VIDEOS = subfolders.length
  ? subfolders.flatMap(folder => readdirSync(path.join(sourceDir, folder))
      .filter(name => VIDEO_SUFFIXES.has(path.extname(name).toLowerCase()))
      .sort()
      .map(name => ({ source: `${folder}/${path.basename(name, path.extname(name))}`, file: `${folder}/${name}` })))
  : MEB_VIDEOS.map(name => ({ source: name, file: `${name}.mp4` }));
if (!VIDEOS.length) {
  console.error(`Video bulunamadı: ${sourceDir}`);
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = requireFromApp('playwright'));
} catch {
  console.error('playwright bulunamadı. Kurulum: cd signbridge-app && npm i --no-save playwright@1.56 && npx playwright install chromium');
  process.exit(1);
}
const ts = requireFromApp('typescript');

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const transpile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;

const tasksDir = path.join(APP, 'node_modules', '@mediapipe', 'tasks-vision');
const tasksVersion = JSON.parse(readFileSync(path.join(tasksDir, 'package.json'), 'utf8')).version;
const modelFile = path.join(APP, 'public', 'models', 'holistic_landmarker.task');
const modules = {
  '/lib/browserVision.js': transpile(path.join(APP, 'src', 'lib', 'browserVision.ts')),
};
const page = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"@mediapipe/tasks-vision":"/tasks/vision_bundle.mjs"}}</script>
<script type="module">
import { getHolisticLandmarker, resultToRawFrame } from '/lib/browserVision.js';
let clock = 0;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
window.extract = async (name, sourceFps, frameCount, fps, phaseMs) => {
  const landmarker = await getHolisticLandmarker();
  const keypoints = []; const confidence = [];
  clock += 10000;
  const duration = frameCount / sourceFps;
  for (let t = phaseMs / 1000; t < duration; t += 1 / fps) {
    const index = Math.min(frameCount - 1, Math.round(t * sourceFps));
    const image = new Image();
    image.src = '/frames/' + name + '/' + String(index).padStart(5, '0') + '.png';
    await image.decode();
    clock += 1000 / fps;
    const frame = resultToRawFrame(landmarker.detectForVideo(image, clock));
    keypoints.push(frame.keypoints.map(p => p.map(v => round(v, 6))));
    confidence.push(frame.confidence.map(v => round(v, 4)));
  }
  return { keypoints, confidence, duration };
};
window.ready = true;
</script>`;

const types = { '.png': 'image/png', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.task': 'application/octet-stream' };
function sendFile(response, file) {
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}
const server = createServer((request, response) => {
  const url = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (url === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(page); return; }
  if (modules[url]) { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(modules[url]); return; }
  const safe = name => path.basename(name);
  if (url.startsWith('/tasks/')) return sendFile(response, path.join(tasksDir, safe(url)));
  if (url.startsWith('/mediapipe/')) return sendFile(response, path.join(APP, 'public', 'mediapipe', safe(url)));
  if (url.startsWith('/models/')) return sendFile(response, path.join(APP, 'public', 'models', safe(url)));
  if (url.startsWith('/frames/')) {
    const [, , video, frame] = url.split('/');
    return sendFile(response, path.join(frameDir, safe(video), safe(frame)));
  }
  response.writeHead(404); response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const frameDir = mkdtempSync(path.join(tmpdir(), 'signbridge-frames-'));
const PYTHON_FRAMES = `
import cv2, sys, os
capture = cv2.VideoCapture(sys.argv[1]); out = sys.argv[2]; index = 0
fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
while True:
    ok, frame = capture.read()
    if not ok: break
    cv2.imwrite(os.path.join(out, f"{index:05d}.png"), frame); index += 1
print(fps)
`;
function extractFrames(frameKey, relativeFile) {
  const input = path.join(sourceDir, relativeFile);
  const output = path.join(frameDir, frameKey);
  mkdirSync(output, { recursive: true });
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', input], { encoding: 'utf8' });
  let fps = null;
  if (probe.status === 0) {
    const [num, den] = probe.stdout.trim().split('/').map(Number);
    const ok = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vsync', '0', '-start_number', '0', path.join(output, '%05d.png')]);
    if (ok.status === 0) fps = den ? num / den : num;
  }
  if (fps === null) {
    const python = spawnSync(process.env.PYTHON || 'python', ['-c', PYTHON_FRAMES, input, output], { encoding: 'utf8' });
    if (python.status !== 0) throw new Error(`Kare çıkarılamadı (ffmpeg veya Python+OpenCV gerekli): ${python.stderr || python.error}`);
    fps = Number(python.stdout.trim());
  }
  const count = readdirSync(output).filter(file => file.endsWith('.png')).length;
  return { fps, count };
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const tab = await browser.newPage();
  tab.on('pageerror', error => console.error('sayfa hatası:', error.message));
  await tab.goto(base);
  await tab.waitForFunction(() => window.ready === true);
  const videos = [];
  // Yarıda kalan çalıştırmalar için video başına önbellek (dosya içeriğinin SHA-256'sı + model + görünümler).
  const cacheDir = `${path.resolve(outputPath)}.cache`;
  mkdirSync(cacheDir, { recursive: true });
  const modelDigest = sha256(modelFile);
  const viewKey = createHash('sha256').update(JSON.stringify(VIEWS) + tasksVersion + modelDigest).digest('hex').slice(0, 12);
  for (const [index, video] of VIDEOS.entries()) {
    const name = `v${index}`;
    const file = path.join(sourceDir, video.file);
    if (!existsSync(file)) throw new Error(`Video yok: ${file}`);
    const digest = sha256(file);
    const cacheFile = path.join(cacheDir, `${digest}-${viewKey}.json`);
    if (existsSync(cacheFile)) {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
      videos.push({ ...cached, source: video.source, file: video.file });
      console.log(`${video.source}: önbellekten`);
      continue;
    }
    const frames = extractFrames(name, video.file);
    const views = [];
    for (const view of VIEWS) {
      const result = await tab.evaluate(([n, sf, c, f, p]) => window.extract(n, sf, c, f, p), [name, frames.fps, frames.count, view.fps, view.phaseMs]);
      const hands = result.confidence.filter(frame => frame.slice(33).some(v => v >= 0.1)).length;
      console.log(`${video.source} ${view.view}: ${result.keypoints.length} kare, el görünen ${hands}`);
      views.push({ ...view, ...result });
    }
    const record = { source: video.source, file: video.file, sha256: digest, sourceFps: frames.fps, sourceFrames: frames.count, views };
    writeFileSync(cacheFile, JSON.stringify(record));
    videos.push(record);
    rmSync(path.join(frameDir, name), { recursive: true, force: true });
  }
  mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    schemaVersion: 'signbridge-browser-landmarks-v1',
    extractor: 'mediapipe-tasks-web',
    tasksVisionVersion: tasksVersion,
    frameSource: 'png-per-frame',
    modelSha256: modelDigest,
    createdAt: new Date().toISOString(),
    videos,
  }));
  console.log(`yazıldı: ${outputPath}`);
} finally {
  await browser.close();
  server.close();
  rmSync(frameDir, { recursive: true, force: true });
}
