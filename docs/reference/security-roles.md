# Security & RBAC Standards - Nexos
**Propiedad de:** HRProgrammers

## 1. Modelo de Autorización (RBAC)
El sistema utiliza un Control de Acceso Basado en Roles. Los roles son inmutables y definen el acceso a los módulos:

- **CLIENT**: Acceso a creación de solicitudes, chat y pagos.
- **INDEPENDENT_PRO**: Acceso a presupuestos, gestión de trabajos propios y cobros.
- **COMPANY_ADMIN**: Acceso total a la cuenta de empresa, gestión de empleados y finanzas corporativas.
- **COMPANY_EMPLOYEE**: Acceso operativo a trabajos asignados y chat. NO puede gestionar finanzas.
- **SUPER_ADMIN**: Acceso total al panel de moderación y disputas.

## 2. Validación de Identidad (KYC)
Ningún profesional puede transaccionar sin haber pasado los siguientes estados:
1. **UNVERIFIED**: Solo lectura.
2. **PENDING_KYC**: Documentación subida, en revisión.
3. **VERIFIED**: Acceso total a presupuestos y urgencias.

## 3. Protección de Datos Sensibles
- Las URLs de evidencias (fotos de cédulas, recibos) en **AWS S3/Cloudflare R2** deben ser privadas y accederse únicamente mediante **URLs firmadas** con expiración de 15 minutos.
- Prohibido exponer URLs permanentes o públicas para documentos KYC.
