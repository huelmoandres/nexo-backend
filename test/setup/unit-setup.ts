import { vi, afterEach } from 'vitest';

/**
 * Setup ejecutado antes de cada archivo de test UNITARIO.
 *
 * Limpia todos los mocks de vi.fn() después de cada test para evitar
 * que llamadas de un test contaminen las aserciones del siguiente.
 *
 * REGLA DE FIXED DATE (ver testing-guidelines.md — Sección 5):
 * No activa fake timers globalmente — cada test que los necesite debe
 * llamar vi.useFakeTimers() + vi.setSystemTime() en su propio beforeEach.
 * Esto evita que tests sin lógica temporal se vean afectados.
 */
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers(); // Asegura que fake timers no se filtren entre tests
});
