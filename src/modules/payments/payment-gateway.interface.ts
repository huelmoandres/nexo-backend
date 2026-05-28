import type { PayoutIdentifierType, PayoutMethod } from '@prisma/client';

export type ValidatePayoutDestinationInput = {
  method: PayoutMethod;
  identifierType: PayoutIdentifierType;
  transferIdentifier?: string | null;
  mpAlias?: string | null;
  bankCode?: string | null;
};

export type ValidatePayoutDestinationResult = {
  valid: boolean;
  providerReference?: string;
  rejectionReason?: string;
};

export type IssuePayoutInput = {
  escrowTransactionId: string;
  amountCents: number;
  netAmountCents: number;
  destination: ValidatePayoutDestinationInput;
  /**
   * Clave idempotente para evitar doble emisión en retries.
   * Debe ser estable para el mismo "intento" lógico de payout.
   */
  idempotencyKey?: string;
};

export type IssuePayoutResult = {
  success: boolean;
  providerReference?: string;
  providerStatus?: string;
  failureCode?: string;
  failureMessage?: string;
};

export type ReconcilePayoutInput = {
  escrowTransactionId: string;
  idempotencyKey: string;
  /** ID de pago MP conocido (p. ej. intento parcialmente persistido). */
  providerReference?: string;
};

export interface IPaymentGateway {
  createPaymentLink(input: {
    jobId: string;
    amountCents: number;
    title?: string;
  }): Promise<{
    paymentUrl: string;
    providerReference: string;
    externalUrl: string;
  }>;

  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean;

  getPaymentStatus(providerReference: string): Promise<{
    status: string;
    providerReference: string;
    amountCents: number;
    externalReference?: string;
  }>;

  issueRefund(providerReference: string): Promise<{
    refundReference: string;
    status: string;
  }>;

  validatePayoutDestination(
    input: ValidatePayoutDestinationInput,
  ): Promise<ValidatePayoutDestinationResult>;

  issuePayout(input: IssuePayoutInput): Promise<IssuePayoutResult>;

  reconcilePayoutByIdempotencyKey(
    input: ReconcilePayoutInput,
  ): Promise<IssuePayoutResult | null>;
}
