import { vi } from 'vitest';

/**
 * Mock de IPushNotificationService para tests unitarios.
 *
 * Evita llamadas reales a la API de Expo Push Notifications en tests.
 * Todos los flujos que envían notificaciones (urgencias, Escrow, disputas)
 * usan este mock en los tests unitarios.
 *
 * Inyectar en el TestingModule con:
 *   { provide: PUSH_NOTIFICATION_SERVICE_TOKEN, useValue: expoPushMock }
 *
 * Verificar que se llamó correctamente:
 *   expect(expoPushMock.sendToUser).toHaveBeenCalledWith(userId, {
 *     type: 'URGENCY_DISPATCHED',
 *     title: expect.any(String),
 *     message: expect.any(String),
 *   });
 */
export const expoPushMock = {
  /**
   * Simula el envío de una notificación push a un usuario específico.
   * Usa el expoPushToken almacenado en User.expoPushToken.
   * Si el token es null, la implementación real lo silencia — el mock también.
   */
  sendToUser: vi
    .fn()
    .mockResolvedValue({ status: 'ok', id: 'MOCK-TICKET-001' }),

  /**
   * Simula el envío masivo a múltiples tokens (Weighted Broadcast de Urgencias).
   * Devuelve un array de tickets con el mismo status 'ok'.
   */
  sendToMany: vi
    .fn()
    .mockImplementation((tokens: string[]) =>
      Promise.resolve(
        tokens.map((_, i) => ({ status: 'ok', id: `MOCK-TICKET-${i + 1}` })),
      ),
    ),
};
