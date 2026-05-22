# Mercado Pago Checkout Pro — prueba en sandbox (Postman + ngrok)

**Tipo:** How-to  
**Audiencia:** Desarrolladores Nexos  
**Referencias:** [payments-module.md](../../.harness/specs/payments-module.md), [Configurar notificaciones de pago (MP)](https://www.mercadopago.com.uy/developers/es/docs/checkout-pro/payment-notifications)

---

## 1. Variables en `.env`

```bash
PAYMENT_GATEWAY_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=<Access Token de prueba — Developers → Credenciales de prueba>
MERCADOPAGO_WEBHOOK_SECRET=<Secreto tras guardar Webhooks en la app>
MERCADOPAGO_SANDBOX=true
MERCADOPAGO_NOTIFICATION_URL=https://<TU_SUBDOMINIO>.ngrok-free.app/api/payments/webhooks/mercadopago
# Opcional (retorno post-pago en navegador):
# MERCADOPAGO_BACK_URL_SUCCESS=http://localhost:5173/payment/success
# MERCADOPAGO_BACK_URL_FAILURE=http://localhost:5173/payment/failure
# MERCADOPAGO_BACK_URL_PENDING=http://localhost:5173/payment/pending
```

Reiniciá el servidor tras cambiar `.env`.

---

## 2. ngrok

```bash
ngrok http 3000
```

Copiá la URL HTTPS (ej. `https://abc123.ngrok-free.app`) y usala en:

- `MERCADOPAGO_NOTIFICATION_URL` = `https://abc123.ngrok-free.app/api/payments/webhooks/mercadopago`
- Panel MP → **Webhooks** → misma URL (modo prueba o productivo según corresponda)

---

## 3. Panel Mercado Pago (Developers)

1. **Tus integraciones** → tu app Checkout Pro.
2. **Webhooks → Configurar notificaciones**.
3. URL HTTPS (ngrok).
4. Evento **Pagos**.
5. **Guardar** → copiar **clave secreta** → `MERCADOPAGO_WEBHOOK_SECRET`.
6. (Opcional) **Simular** → tipo Pagos → Data ID de un pago de prueba.

Doc: [notificaciones Checkout Pro](https://www.mercadopago.com.uy/developers/es/docs/checkout-pro/payment-notifications).

---

## 4. Flujo E2E con Postman (recomendado)

Importá:

- `postman/nexos-api.postman_collection.json` (API completa) **o** `postman/nexos-e2e-mercadopago.postman_collection.json` (solo E2E)
- `postman/nexos-local.postman_environment.json`

> **No importes** `postman/e2e-mercadopago-folder.json`: es un fragmento interno; Postman responde *Incorrect format*. Ver `postman/README.md`.

Carpeta: **«E2E — Mercado Pago Checkout Pro (sandbox)»** — ejecutar requests **en orden** (o Collection Runner sobre esa carpeta).

### Seeds

```bash
npm run db:seed:demo   # demo.client + demo.pro + cuenta cobro MP primary
```

### Pasos Postman

| # | Request | Rol | Resultado |
|---|---------|-----|-----------|
| 0 | Health | — | API viva |
| 1 | Crear job | CLIENT | `jobId` (500 UYU) |
| 1b | Listar cuentas cobro | PRO | `payoutAccountId` |
| 2 | Aceptar job | PRO | `ACCEPTED`, escrow `PENDING` |
| 3 | Checkout Pro | CLIENT | `paymentUrl` en consola |
| — | **Manual:** abrir `paymentUrl` | Comprador MP | Pago aprobado en sandbox |
| 4 | Verificar escrow | CLIENT | `escrowTransaction.status` = `HELD` |
| 5–7 | IN_PROGRESS → Complete → Approve | PRO / CLIENT | job `CLOSED` (opcional) |

**Comprador MP:** usuario de prueba del [panel MP](https://www.mercadopago.com.uy/developers/es/docs/checkout-pro/integration-test/test-purchases) (no `demo.client@nexos.local`). Podés anotar credenciales en `postman/MP-SANDBOX.local.md` (ver `MP-SANDBOX.local.example.md`).

### Webhook tras el pago

Con ngrok activo, en logs:

- `POST /api/payments/webhooks/mercadopago` → `200`
- MP envía **IPN legacy** (`?id=...&topic=merchant_order` o `topic=payment`) por `notification_url` de la preferencia — **no** se valida con HMAC; el backend consulta la API de MP.
- **Webhooks del panel** (`?data.id=...`, body JSON) sí usan `MERCADOPAGO_WEBHOOK_SECRET` + `x-signature`.
- Luego paso 4 confirma escrow `HELD`

### Alternativas

| Caso | Dónde |
|------|--------|
| Sin MP (mock) | `Jobs → Flujo completo`, paso 3 webhook mock |
| Atajos checkout/ver job | `Payments → Mercado Pago — Flujo sandbox` |
| Simular solo webhook MP | Panel MP → Simular, o `Payments → Simular webhook MP` |

---

## 5. Comprobar escrow

```http
GET {{baseUrl}}/api/jobs/{{jobId}}
Authorization: Bearer <token CLIENT>
```

`escrowTransaction.status` debe ser `HELD` tras pago aprobado.

---

## 6. Payout al profesional (manual)

Con `PAYOUT_MODE=manual`, al cerrar el job el escrow queda `RELEASED` y `payoutStatus: PENDING`. El pago al pro lo hace un admin en Mercado Pago y confirma en Nexos con comprobante en S3. Ver [admin-payout-manual-mercadopago.md](./admin-payout-manual-mercadopago.md).

## 7. Cuotas

La preference incluye `payment_methods.installments` = `MERCADOPAGO_MAX_INSTALLMENTS` (default 12). El comprador elige en el checkout de MP. Para forzar un solo pago: `MERCADOPAGO_MAX_INSTALLMENTS=1`.

## 8. Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| `PAYMENT_CHECKOUT_FAILED` | Token MP inválido o preferencia rechazada |
| `PAYMENT_NOT_ALLOWED` | Job no `ACCEPTED` o escrow no `PENDING` |
| `PAYMENT_RATE_STALE` | Job en USD y cotización BCU stale |
| `PAYMENT_WEBHOOK_INVALID` | Webhooks (sin `topic` en query): firma HMAC con `data.id` + secret del panel. IPN (`?id=&topic=`): no usa HMAC; si ves 401 antes, era por validar IPN como webhook. |
| Webhook no llega | ngrok caído, URL distinta en panel vs `.env`, firewall |
| Escrow sigue `PENDING` | Pago no `approved`; revisar GET payment en logs |

---

## 9. Wizard MP — qué marcar “Ya lo hice”

| Paso wizard | Criterio |
|-------------|----------|
| 1. Crear preferencia | `POST /jobs/:id/checkout` devuelve `paymentUrl` |
| 2. Frontend | Abrís `paymentUrl` en navegador (web); apps móviles: mismo API + `openURL` |
| 3. Notificaciones | Webhook 200 + escrow `HELD` en sandbox |
