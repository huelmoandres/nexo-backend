/**
 * Barrel de mocks de servicios externos.
 *
 * REGLA OBLIGATORIA (ver testing-guidelines.md — Sección 4):
 * Ningún test unitario puede hacer llamadas reales a servicios externos
 * (S3/R2, pasarelas de pago, Expo, MetaMap/KYC).
 * Siempre importar desde este barrel.
 *
 * Uso:
 *   import { storageMock, paymentGatewayMock, expoPushMock } from '@test/mocks';
 *
 * Limpiar entre tests para evitar contaminación:
 *   beforeEach(() => vi.clearAllMocks());
 */

export * from './expo-push.mock';
export * from './payment-gateway.mock';
export * from './problem-detail-type.mock';
export * from './storage.mock';
