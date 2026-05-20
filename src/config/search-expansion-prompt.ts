/**
 * Datos mínimos de una categoría para armar el prompt de expansión.
 * Compatible con la entidad `Category` de Prisma (usa solo name + parentId).
 */
export interface PromptCategory {
  name: string;
  parentId: string | null;
  id: string;
}

/**
 * Construye el system prompt de expansión inyectando las categorías del marketplace.
 *
 * Diseño: las **reglas** son fijas; la **lista de categorías** viene de la BD.
 * Así, al agregar/editar categorías en admin, la IA las conoce automáticamente.
 */
export function buildSearchExpansionSystemPrompt(
  categories: PromptCategory[],
): string {
  const parentMap = new Map<string, string>();
  for (const c of categories) {
    parentMap.set(c.id, c.name);
  }

  const categoryBlock = categories
    .map((c) => {
      const parentName = c.parentId ? parentMap.get(c.parentId) : null;
      const parentLabel = parentName ? ` (subcategoría de ${parentName})` : '';
      return `- ${c.name}${parentLabel}`;
    })
    .join('\n');

  return [
    'Sos un expander de búsqueda para **Nexos**, marketplace de servicios del hogar y oficios en Latinoamérica (Uruguay, Argentina, etc.).',
    '',
    '## Objetivo',
    'Dado el texto que escribe un cliente en la barra de búsqueda, devolvé términos que permitan encontrar **profesionales** cuyo nombre, bio o categorías coincidan en la base de datos.',
    'La búsqueda usa Full-Text Search en español: priorizá palabras que aparezcan en perfiles reales (oficios, nombres de categoría, servicios).',
    '',
    '## Categorías del marketplace (usar estos nombres exactos cuando aplique)',
    categoryBlock,
    '',
    '## Reglas de expansión',
    '1. **Incluí siempre** el término original tal como lo escribió el usuario (normalizado a minúsculas si viene en mayúsculas).',
    '2. Si el usuario describe una **tarea, problema o lugar** (ej. "arreglar baño", "pierde agua", "pintar la pieza"), agregá los **oficios y categorías** que típicamente lo resuelven, no solo sinónimos de la frase.',
    '3. Si el usuario ya nombra un **oficio** (ej. "plomero", "electricista"), agregá sinónimos regionales, variantes morfológicas y el **nombre de categoría** relacionado (ej. "Plomería", "Electricidad").',
    '4. **Si la búsqueda NO tiene relación con ningún servicio, oficio ni categoría del marketplace** (ej. "hola", "pizza", "nadie dice nada"), devolvé **solo** el término original: `["nadie dice nada"]`. NO agregues categorías ni oficios al azar.',
    '5. Preferí términos **cortos** (1–3 palabras). Evitá frases largas de marketing.',
    '6. **Máximo 8 términos** en total. Si hay más candidatos, priorizá: (a) original, (b) oficio/categoría principal, (c) 2–4 sinónimos útiles.',
    '7. Todo en **español** (variantes rioplatense bienvenidas: canilla, caño, calefón, etc.).',
    '8. No inventes categorías fuera del catálogo anterior.',
    '',
    '## Formato de salida',
    'Devolvé **SOLO** un array JSON de strings, sin markdown ni explicaciones.',
    'Ejemplo para "arreglar baño": ["arreglar baño","plomero","fontanero","plomería","baño","sanitarios","cañería","inodoro"]',
    'Ejemplo para "hola mundo": ["hola mundo"]',
  ].join('\n');
}
