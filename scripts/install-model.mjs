import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { argumentValue, resolveModelRelease, sha256File, validateModelAssets } from './model-assets-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOf = (name) => argumentValue(args, name);
const archiveArgument = valueOf('--archive') ?? process.env.MODEL_ARCHIVE;
const force = args.includes('--force');
const releaseFile = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/model-release.json'), 'utf8'));
let selection;
try {
  selection = resolveModelRelease(releaseFile, valueOf('--model') ?? process.env.SIGNBRIDGE_MODEL);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const release = selection.release;
const outputRoot = resolve(repoRoot, valueOf('--model-dir') ?? selection.modelDir);
const manifest = JSON.parse(readFileSync(resolve(repoRoot, selection.assetsManifest), 'utf8'));

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (response.status === 404) {
    throw new Error(
      `Model indirilemedi: HTTP 404 (${url}).\n` +
      'Release henüz yayınlanmamış olabilir. Ekipten ZIP dosyasını alıp şu komutla kurun:\n' +
      `  node scripts/install-model.mjs --model ${selection.name} --archive <zip-yolu>`,
    );
  }
  if (!response.ok || !response.body) throw new Error(`Model indirilemedi: HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(destination, { flags: 'wx' }));
}

function extract(archive, destination) {
  mkdirSync(destination, { recursive: true });
  const command = process.platform === 'win32' ? 'tar.exe' : 'unzip';
  const commandArgs = process.platform === 'win32'
    ? ['-xf', archive, '-C', destination]
    : ['-q', archive, '-d', destination];
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.error) throw new Error(`Arşiv açılamadı: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Arşiv açılamadı: ${command} ${result.status} koduyla kapandı.`);
}

function copyMissing(source, destination) {
  if (!existsSync(source)) return;
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: false });
}

async function main() {
  const currentFailures = existsSync(outputRoot) ? await validateModelAssets(outputRoot, manifest) : ['model dizini yok'];
  if (!force && currentFailures.length === 0) {
    console.log(`Model zaten doğrulanmış: ${release.modelVersion} (${selection.name})`);
    console.log(`Model dizini: ${outputRoot}`);
    return;
  }

  mkdirSync(dirname(outputRoot), { recursive: true });
  // Staging must share the destination filesystem so the final rename stays atomic.
  const workRoot = resolve(dirname(outputRoot), `.model-install-${process.pid}-${Date.now()}`);
  const extractedRoot = resolve(workRoot, 'extracted');
  const downloadedArchive = resolve(workRoot, release.assetName);
  mkdirSync(workRoot, { recursive: true });
  try {
    let archive;
    if (archiveArgument) {
      archive = resolve(process.cwd(), archiveArgument);
      if (!existsSync(archive) || !statSync(archive).isFile()) throw new Error(`Model arşivi bulunamadı: ${archive}`);
    } else {
      console.log(`Model indiriliyor: ${release.tag} (${selection.name})`);
      await download(release.downloadUrl, downloadedArchive);
      archive = downloadedArchive;
    }

    const archiveHash = await sha256File(archive);
    if (archiveHash.toLowerCase() !== release.sha256.toLowerCase()) {
      throw new Error(`Model arşivi SHA-256 doğrulamasını geçemedi. Beklenen ${release.sha256}, bulunan ${archiveHash}.`);
    }
    extract(archive, extractedRoot);
    const failures = await validateModelAssets(extractedRoot, manifest);
    if (failures.length) throw new Error(`Model paketi geçersiz:\n- ${failures.join('\n- ')}`);

    const backupRoot = `${outputRoot}.backup-${Date.now()}`;
    if (existsSync(outputRoot)) renameSync(outputRoot, backupRoot);
    try {
      renameSync(extractedRoot, outputRoot);
      copyMissing(backupRoot, outputRoot);
      const installedFailures = await validateModelAssets(outputRoot, manifest);
      if (installedFailures.length) throw new Error(`Kurulan model doğrulanamadı:\n- ${installedFailures.join('\n- ')}`);
      if (existsSync(backupRoot)) rmSync(backupRoot, { recursive: true, force: true });
    } catch (error) {
      if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
      if (existsSync(backupRoot)) renameSync(backupRoot, outputRoot);
      throw error;
    }
    console.log(`Model kuruldu ve doğrulandı: ${release.modelVersion}`);
    console.log(`Model dizini: ${outputRoot}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
