/**
 * Extrae nombres de barrios de ciudad Rocha desde KML oficial (CKAN IDE).
 * Fuente: https://sig.rocha.gub.uy/ckan/dataset/barrios-de-rocha
 *
 * Uso:
 *   node scripts/import-rocha-barrios.mjs
 *   node scripts/import-rocha-barrios.mjs --write   # actualiza ROCHA_CIUDAD_BARRIOS en build-uruguay-geo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const kmlLocal = join(root, 'prisma/data/sources/rocha-barrios.kml');
const buildScript = join(root, 'scripts/build-uruguay-geo.mjs');

const CKAN_PACKAGE = 'barrios-de-rocha';

function parseNamesFromKml(xml) {
  const names = new Set();
  const re = /<name>([^<]+)<\/name>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const name = m[1]?.trim();
    if (!name || /^barrio/i.test(name) && name.length < 3) continue;
    if (name.length < 2) continue;
    names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'es'));
}

async function fetchKmlUrl() {
  const res = await fetch(
    `https://sig.rocha.gub.uy/ckan/api/3/action/package_show?id=${CKAN_PACKAGE}`,
  );
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status}`);
  const json = await res.json();
  const resources = json?.result?.resources ?? [];
  const kml = resources.find((r) =>
    (r.format ?? '').toUpperCase().includes('KML'),
  );
  if (!kml?.url) throw new Error('No KML resource in CKAN package');
  return kml.url;
}

async function loadKml() {
  try {
    return readFileSync(kmlLocal, 'utf8');
  } catch {
    const url = await fetchKmlUrl();
    console.info(`Downloading KML from ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`KML download HTTP ${res.status}`);
    const text = await res.text();
    writeFileSync(kmlLocal, text);
    return text;
  }
}

function patchBuildScript(names) {
  const src = readFileSync(buildScript, 'utf8');
  const block = names.map((n) => `  '${n.replace(/'/g, "\\'")}',`).join('\n');
  const replaced = src.replace(
    /const ROCHA_CIUDAD_BARRIOS = \[[\s\S]*?\];/,
    `const ROCHA_CIUDAD_BARRIOS = [\n${block}\n];`,
  );
  if (replaced === src) {
    throw new Error('No se encontró ROCHA_CIUDAD_BARRIOS en build-uruguay-geo.mjs');
  }
  writeFileSync(buildScript, replaced);
}

const write = process.argv.includes('--write');

try {
  const kml = await loadKml();
  const names = parseNamesFromKml(kml);
  console.info(`Barrios parseados: ${names.length}`);
  console.info(names.join('\n'));

  if (write) {
    patchBuildScript(names);
    console.info(`Actualizado ${buildScript}. Ejecutá: npm run geo:build`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
