import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
    ...nextVitals,
    // Derleme çıktıları lint edilmez: `.next` dışında betiklerin ürettiği `.next-check`, `.next-preview` gibi klasörler de kapsanır.
    globalIgnores(['.next/**', '.next-*/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/mediapipe/*.js']),
]);
