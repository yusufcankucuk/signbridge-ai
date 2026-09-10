import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const bundleDirectory = join(process.cwd(), '.next', 'static');
const forbiddenTerms = [
    'MODELARTS_AUTH_TOKEN',
    'HUAWEI_SECRET_KEY',
    'HUAWEI_ACCESS_KEY',
    process.env.MODELARTS_AUTH_TOKEN,
    process.env.HUAWEI_SECRET_KEY,
    process.env.HUAWEI_ACCESS_KEY
].filter((value) => typeof value === 'string' && value.length >= 8);

async function filesBelow(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await filesBelow(path));
        else files.push(path);
    }
    return files;
}

let bundleFiles;
try {
    bundleFiles = await filesBelow(bundleDirectory);
} catch {
    throw new Error('Önce npm run build çalıştırılmalıdır; .next/static bulunamadı.');
}

for (const file of bundleFiles) {
    const content = await readFile(file, 'utf8');
    for (const marker of forbiddenTerms) {
        assert.equal(
            content.includes(marker),
            false,
            `Sunucu secret değeri istemci bundle dosyasına sızdı: ${file}`,
        );
    }
}

console.info(`İstemci secret taraması başarılı: ${bundleFiles.length} bundle dosyası kontrol edildi.`);
