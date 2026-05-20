import { describe, expect, it } from 'vitest';
import {
  buildSearchExpansionSystemPrompt,
  type PromptCategory,
} from '../search-expansion-prompt';

const MOCK_CATEGORIES: PromptCategory[] = [
  { id: '1', name: 'Electricidad', parentId: null },
  { id: '2', name: 'Electricidad de urgencia', parentId: '1' },
  { id: '3', name: 'Plomería', parentId: null },
  { id: '4', name: 'Gasista', parentId: null },
  { id: '5', name: 'Pintura', parentId: null },
  { id: '6', name: 'Jardinería', parentId: null },
];

describe('buildSearchExpansionSystemPrompt', () => {
  it('incluye todas las categorías pasadas', () => {
    const prompt = buildSearchExpansionSystemPrompt(MOCK_CATEGORIES);

    for (const cat of MOCK_CATEGORIES) {
      expect(prompt).toContain(cat.name);
    }
  });

  it('marca subcategorías con el nombre del padre', () => {
    const prompt = buildSearchExpansionSystemPrompt(MOCK_CATEGORIES);

    expect(prompt).toContain('Electricidad de urgencia (subcategoría de Electricidad)');
  });

  it('no marca como subcategoría a las raíz', () => {
    const prompt = buildSearchExpansionSystemPrompt(MOCK_CATEGORIES);

    expect(prompt).not.toContain('Plomería (subcategoría');
  });

  it('instruye mapeo tarea → oficio/categoría', () => {
    const prompt = buildSearchExpansionSystemPrompt(MOCK_CATEGORIES);

    expect(prompt).toContain('tarea, problema o lugar');
    expect(prompt).toContain('oficios y categorías');
  });

  it('exige array JSON sin markdown', () => {
    const prompt = buildSearchExpansionSystemPrompt(MOCK_CATEGORIES);

    expect(prompt).toContain('SOLO');
    expect(prompt).toContain('array JSON');
  });

  it('funciona con lista vacía', () => {
    const prompt = buildSearchExpansionSystemPrompt([]);

    expect(prompt).toContain('Categorías del marketplace');
    expect(prompt).toContain('array JSON');
  });
});
