-- AlterEnum: acciones de auditoría para reporte público y decisión admin de portfolio
ALTER TYPE "AuditAction" ADD VALUE 'PORTFOLIO_ITEM_REPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'PORTFOLIO_ADMIN_MODERATED';
