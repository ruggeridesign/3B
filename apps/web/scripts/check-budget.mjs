// Presupuesto de rendimiento (M8e): falla si el JS inicial (first load) supera el
// presupuesto. "JS inicial" = lo que carga CUALQUIER página en el primer load:
// polyfills + runtime/framework compartido (rootMainFiles) + los chunks de arranque
// de cada página (otherChunks), deduplicados. Se mide el tamaño **gzip** (lo que se
// transfiere). Corre después de `next build` (lee .next/build-manifest.json).
//
// Uso: pnpm --filter @3b/web check:budget   (requiere un build previo).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Presupuesto en KB (gzip) del JS inicial. Roadmap M8: <170 KB.
const BUDGET_KB = 170;

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = join(webRoot, '.next');
const manifestPath = join(nextDir, 'build-manifest.json');

if (!existsSync(manifestPath)) {
  console.error(
    'No se encontró .next/build-manifest.json. Corré `pnpm --filter @3b/web build` primero.',
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Grafo de módulos que descarga un navegador MODERNO en el primer load: el runtime/
// framework compartido + los chunks de arranque de cada página. NO incluye los
// polyfills (se sirven con `nomodule`: solo los bajan navegadores viejos), por eso
// no son parte del camino crítico ni del LCP en 3G. El presupuesto se mide acá.
const moduleFiles = new Set(manifest.rootMainFiles ?? []);
for (const page of Object.values(
  manifest.pagesChunkGroupBootstrapParams ?? {},
)) {
  for (const chunk of page.otherChunks ?? []) moduleFiles.add(chunk);
}
const polyfillFiles = new Set(manifest.polyfillFiles ?? []);

const kb = (n) => (n / 1024).toFixed(1);

/** Suma el tamaño gzip (y crudo) de un conjunto de chunks .js existentes. */
function measure(files) {
  let raw = 0;
  let gzip = 0;
  const rows = [];
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const full = join(nextDir, file);
    if (!existsSync(full)) continue;
    const buf = readFileSync(full);
    const gz = gzipSync(buf, { level: 9 }).length;
    raw += buf.length;
    gzip += gz;
    rows.push({ file, raw: buf.length, gz });
  }
  rows.sort((a, b) => b.gz - a.gz);
  return { raw, gzip, rows };
}

const mod = measure(moduleFiles);
const poly = measure(polyfillFiles);

console.log('JS inicial (first load, navegador moderno) — chunks:');
for (const r of mod.rows) {
  console.log(
    `  ${kb(r.gz).padStart(7)} KB gz  (${kb(r.raw).padStart(7)} KB)  ${r.file}`,
  );
}
console.log('─'.repeat(52));
console.log(
  `Total: ${kb(mod.gzip)} KB gzip  (${kb(mod.raw)} KB sin comprimir)  ·  presupuesto ${BUDGET_KB} KB`,
);
if (poly.gzip > 0) {
  console.log(
    `Aparte (nomodule, solo navegadores viejos): ${kb(poly.gzip)} KB gzip`,
  );
}

const budgetBytes = BUDGET_KB * 1024;
if (mod.gzip > budgetBytes) {
  console.error(
    `\n✗ Excede el presupuesto por ${kb(mod.gzip - budgetBytes)} KB.`,
  );
  process.exit(1);
}
console.log(
  `\n✓ Dentro del presupuesto (margen ${kb(budgetBytes - mod.gzip)} KB).`,
);
