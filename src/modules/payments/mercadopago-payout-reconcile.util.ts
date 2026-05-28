import type { IssuePayoutResult } from './payment-gateway.interface';

/** Campos mínimos de un pago MP para reconciliar un payout. */
export type MpPaymentReconcileShape = {
  id?: number | string;
  status?: string;
  status_detail?: string;
};

const TERMINAL_FAILURE_STATUSES = new Set([
  'rejected',
  'cancelled',
  'canceled',
  'refunded',
  'charged_back',
]);

/**
 * Mapea un pago MP a resultado de payout.
 * Devuelve `null` si el estado no es terminal (p. ej. pending, in_process).
 */
export function mapMpPaymentToPayoutResult(
  payment: MpPaymentReconcileShape,
): IssuePayoutResult | null {
  const status = (payment.status ?? 'unknown').toLowerCase();
  const providerReference =
    payment.id !== undefined && payment.id !== null
      ? String(payment.id)
      : undefined;

  if (status === 'approved') {
    return {
      success: true,
      providerReference,
      providerStatus: status,
    };
  }

  if (TERMINAL_FAILURE_STATUSES.has(status)) {
    return {
      success: false,
      providerReference,
      providerStatus: status,
      failureCode: `MP_PAYOUT_${status.toUpperCase()}`,
      failureMessage: payment.status_detail ?? status,
    };
  }

  return null;
}

/**
 * Elige el mejor candidato de una búsqueda por external_reference:
 * prioriza `approved`, luego el primer fallo terminal, si no hay terminal devuelve null.
 */
export function pickPayoutFromMpSearchResults(
  results: MpPaymentReconcileShape[],
): IssuePayoutResult | null {
  const approved = results.find((p) => p.status === 'approved');
  if (approved) {
    return mapMpPaymentToPayoutResult(approved);
  }
  for (const row of results) {
    const mapped = mapMpPaymentToPayoutResult(row);
    if (mapped && !mapped.success) {
      return mapped;
    }
  }
  return null;
}
