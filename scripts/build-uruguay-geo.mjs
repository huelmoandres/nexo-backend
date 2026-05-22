/**
 * Genera prisma/data/uruguay-geo.json desde GeoNames UY.txt + barrios Montevideo.
 *
 * Uso: node scripts/build-uruguay-geo.mjs
 * Requiere: prisma/data/sources/UY.txt (descargar UY.zip de geonames.org)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const uyPath = join(root, 'prisma/data/sources/UY.txt');
const outPath = join(root, 'prisma/data/uruguay-geo.json');

const DEPARTMENTS = [
  { code: '01', name: 'Artigas', slug: 'artigas', iso3166_2: 'UY-AR' },
  { code: '02', name: 'Canelones', slug: 'canelones', iso3166_2: 'UY-CA' },
  { code: '03', name: 'Cerro Largo', slug: 'cerro-largo', iso3166_2: 'UY-CL' },
  { code: '04', name: 'Colonia', slug: 'colonia', iso3166_2: 'UY-CO' },
  { code: '05', name: 'Durazno', slug: 'durazno', iso3166_2: 'UY-DU' },
  { code: '06', name: 'Flores', slug: 'flores', iso3166_2: 'UY-FS' },
  { code: '07', name: 'Florida', slug: 'florida', iso3166_2: 'UY-FD' },
  { code: '08', name: 'Lavalleja', slug: 'lavalleja', iso3166_2: 'UY-LA' },
  { code: '09', name: 'Maldonado', slug: 'maldonado', iso3166_2: 'UY-MA' },
  { code: '10', name: 'Montevideo', slug: 'montevideo', iso3166_2: 'UY-MO' },
  { code: '11', name: 'Paysandú', slug: 'paysandu', iso3166_2: 'UY-PA' },
  { code: '12', name: 'Río Negro', slug: 'rio-negro', iso3166_2: 'UY-RN' },
  { code: '13', name: 'Rivera', slug: 'rivera', iso3166_2: 'UY-RV' },
  { code: '14', name: 'Rocha', slug: 'rocha', iso3166_2: 'UY-RO' },
  { code: '15', name: 'Salto', slug: 'salto', iso3166_2: 'UY-SA' },
  { code: '16', name: 'San José', slug: 'san-jose', iso3166_2: 'UY-SJ' },
  { code: '17', name: 'Soriano', slug: 'soriano', iso3166_2: 'UY-SO' },
  { code: '18', name: 'Tacuarembó', slug: 'tacuarembo', iso3166_2: 'UY-TA' },
  { code: '19', name: 'Treinta y Tres', slug: 'treinta-y-tres', iso3166_2: 'UY-TT' },
];

const PPL_CODES = new Set([
  'PPL',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPLC',
  'PPLX',
  'PPLG',
  'PPLR',
  'PPLS',
  'STLMT',
]);

const MVD_BARRIOS = [
  'Aguada',
  'Aires Puros',
  'Atahualpa',
  'Barrio Sur',
  'Bella Italia',
  'Bella Vista',
  'Belvedere',
  'Buceo',
  'Capurro',
  'Carrasco',
  'Carrasco Norte',
  'Casabó',
  'Casavalle',
  'Castro',
  'Centro',
  'Cerrito',
  'Cerro',
  'Ciudad Vieja',
  'Colón',
  'Conciliación',
  'Cordón',
  'Flor de Maroñas',
  'Goes',
  'Ituzaingó',
  'Jardines del Hipódromo',
  'La Blanqueada',
  'La Comercial',
  'La Paloma',
  'La Teja',
  'Larrañaga',
  'Las Acacias',
  'Lezica',
  'Malvín',
  'Malvín Norte',
  'Manga',
  'Marconi',
  'Maroñas',
  'Melilla',
  'Nuevo París',
  'Palermo',
  'Parque Batlle',
  'Parque Rodó',
  'Paso de la Arena',
  'Paso Molino',
  'Peñarol',
  'Piedras Blancas',
  'Pocitos',
  'Prado',
  'Punta Carretas',
  'Punta Gorda',
  'Punta Rieles',
  'Reducto',
  'Sayago',
  'Tres Cruces',
  'Unión',
  'Villa Biarritz',
  'Villa Dolores',
  'Villa Española',
  'Villa Muñoz',
  'Villa del Cerro',
];

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueSlug(base, used) {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

function parseUyTxt(content) {
  const byDept = new Map(DEPARTMENTS.map((d) => [d.code, { ...d, cities: new Map() }]));

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 15) continue;
    const featureClass = cols[6];
    const featureCode = cols[7];
    if (featureClass !== 'P' || !PPL_CODES.has(featureCode)) continue;

    const admin1 = cols[10]?.padStart(2, '0');
    const dept = byDept.get(admin1);
    if (!dept) continue;

    const name = cols[1]?.trim();
    if (!name) continue;
    const lat = parseFloat(cols[4]);
    const lng = parseFloat(cols[5]);
    const geonameId = cols[0];
    const population = parseInt(cols[14] || '0', 10) || 0;

    const key = name.toLowerCase();
    const existing = dept.cities.get(key);
    if (!existing || population > (existing.population || 0)) {
      dept.cities.set(key, {
        name,
        slug: slugify(name),
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
        externalId: geonameId,
        source: 'GEONAMES',
        population,
      });
    }
  }

  return byDept;
}

function build() {
  mkdirSync(dirname(outPath), { recursive: true });
  const raw = readFileSync(uyPath, 'utf8');
  const byDept = parseUyTxt(raw);

  const states = [];

  for (const dept of DEPARTMENTS) {
    const parsed = byDept.get(dept.code);
    const cityMap = parsed?.cities ?? new Map();
    const usedCitySlugs = new Set();
    const cities = [];

    for (const city of cityMap.values()) {
      const slug = uniqueSlug(city.slug || slugify(city.name), usedCitySlugs);
      const neighborhoods = [];
      const usedNbSlugs = new Set();

      if (dept.slug === 'montevideo' && city.slug === 'montevideo') {
        for (const b of MVD_BARRIOS) {
          neighborhoods.push({
            name: b,
            slug: uniqueSlug(slugify(b), usedNbSlugs),
            source: 'SEED',
          });
        }
      } else {
        neighborhoods.push({
          name: 'Centro',
          slug: uniqueSlug('centro', usedNbSlugs),
          source: 'SEED',
        });
      }

      cities.push({
        name: city.name,
        slug,
        latitude: city.latitude,
        longitude: city.longitude,
        externalId: city.externalId,
        source: city.source,
        neighborhoods,
      });
    }

    if (cities.length === 0) {
      const capSlug = uniqueSlug(dept.slug, usedCitySlugs);
      cities.push({
        name: dept.name,
        slug: capSlug,
        source: 'SEED',
        neighborhoods: [{ name: 'Centro', slug: 'centro', source: 'SEED' }],
      });
    }

    states.push({
      name: dept.name,
      slug: dept.slug,
      iso3166_2: dept.iso3166_2,
      source: 'SEED',
      cities,
    });
  }

  const payload = {
    country: { name: 'Uruguay', isoCode: 'UY', slug: 'uruguay' },
    states,
    meta: {
      generatedAt: new Date().toISOString(),
      cityCount: states.reduce((n, s) => n + s.cities.length, 0),
      neighborhoodCount: states.reduce(
        (n, s) => n + s.cities.reduce((m, c) => m + c.neighborhoods.length, 0),
        0,
      ),
    },
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.info(
    `Wrote ${outPath}: ${states.length} states, ${payload.meta.cityCount} cities, ${payload.meta.neighborhoodCount} neighborhoods`,
  );
}

build();
