# Logging & Audit Standards - Nexos

## 1. Trazabilidad de Dinero (Audit Log)
Toda acción que afecte la tabla `EscrowTransaction` en PostgreSQL debe generar un log de auditoría obligatorio.
- Se debe registrar: `userId`, `action` (ej: FUND_ESCROW, RELEASE_FUNDS), `timestamp` y `previous_state`.

## 2. Niveles de Log (Pino)
- **DEBUG**: Solo para desarrollo. Detalle de queries y payloads.
- **INFO**: Flujos normales de negocio (ej: "Trabajo finalizado por profesional X").
- **WARN**: Reintentos de pago o errores de validación repetitivos.
- **ERROR**: Excepciones que requieren atención (dispara Sentry).

## 3. Privacidad en Logs
**PROHIBIDO** loguear:
- JWTs o secretos del `.env`.
- Datos personales sensibles (Nro de Cédula o fotos) en texto plano dentro de los logs.
