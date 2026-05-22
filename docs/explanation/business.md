# Nexos - Business Context
**Propiedad de:** HRProgrammers
**Mercado Objetivo Inicial:** Uruguay

## 1. Visión General
Nexos es un Marketplace B2B/B2C de servicios diseñado para conectar clientes con profesionales y empresas de diversos rubros. El objetivo principal de Nexos es eliminar la fricción de la desconfianza en la contratación de servicios mediante retención de pagos y verificación de identidad.

## 2. El Problema a Resolver
1. **Falta de Confianza del Cliente:** Temor a pagar por adelantado y recibir un servicio deficiente o que el profesional no se presente.
2. **Inseguridad del Profesional:** Temor a realizar un trabajo y no poder cobrarlo, además de los costos de marketing para conseguir clientes.
3. **Fuga (Disintermediación):** La tendencia natural en los marketplaces de servicios a que las partes transaccionen por fuera de la plataforma para evadir comisiones.

## 3. Pilares Core del Negocio (Solución)
- **Sistema de Pagos Escrow:** Es el corazón de Nexos. El cliente paga a través de la plataforma, pero el dinero queda "congelado" (retenido). Solo se libera al profesional cuando el trabajo es marcado como "Finalizado" y el cliente da su conformidad (o tras un período de aceptación silenciosa de 48hs).
- **Garantía y Disputas:** Si hay disconformidad, el dinero retenido actúa como seguro. Se fomenta la resolución entre partes (Autogestión) antes de escalar a soporte humano.
- **Sello "Uruguay Pro" (Verificación):** Sistema para validar la identidad (CI) y formalidad fiscal (RUT/Monotributo) de los trabajadores, otorgando un badge de confianza.

## 4. Verticales de Servicio
Nexos no es solo para "oficios"; agrupa diferentes lógicas de negocio según el tipo de necesidad:
1. **Urgencias 24h (Respuesta Inmediata):** Para emergencias (ej. cerrajería, electricidad). Utiliza un sistema de "Broadcast" geolocalizado donde el primero en aceptar toma el trabajo. La velocidad es la prioridad.
2. **Hogar y Oficios (Cotización):** Trabajos estándar (ej. jardinería, plomería). El cliente publica una necesidad y recibe presupuestos de profesionales cercanos.
3. **Servicios Profesionales "White Collar" (Booking):** Psicólogos, escribanos, desarrolladores de software. Funciona bajo un modelo de agenda, reserva de turnos y validación estricta de títulos habilitantes.

## 5. Modelo de Monetización
Nexos utiliza un modelo híbrido para maximizar la retención y rentabilidad:
- **Comisión Transaccional:** Un porcentaje retenido del pago Escrow por cada trabajo finalizado, comercializado de cara al usuario como un "Seguro de Trabajo".
- **Suscripciones (SaaS para Profesionales/Empresas):** Cobro recurrente vía Mercado Pago Suscripciones (distinto de Checkout Pro de jobs).
  - **FREE:** USD 0 — límites base.
  - **PRO:** **USD 5 / mes** — trial 7 días; self-service `POST /api/billing/subscribe`.
  - **BUSINESS:** **USD 50 / mes** — trial 7 días; self-service.
  - **CUSTOM:** precio negociado — solo admin; sin checkout público.
  - Fallo de pago: gracia 10 días, 3 avisos; luego downgrade a FREE.
  - Guía sandbox: [mercadopago-subscriptions-sandbox.md](../how-to/mercadopago-subscriptions-sandbox.md).

## 6. Filosofía del Sistema y Restricciones
- **La IA como Asistente, NUNCA como Juez:** El sistema integrará IA para optimizar procesos (sugerir precios, clasificar riesgos, resumir disputas), pero NINGUNA IA tiene autorización para ejecutar bloqueos de cuentas, reembolsos o liberar pagos en disputa sin intervención humana.
- **Evidencia Proactiva:** El sistema está diseñado para obligar a los usuarios a dejar trazabilidad (fotos del antes/después con GPS, subida de facturas de materiales, chats dentro de la app) para facilitar la resolución de conflictos.