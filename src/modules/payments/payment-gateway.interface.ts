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
};

export type IssuePayoutResult = {
  success: boolean;
  providerReference?: string;
  providerStatus?: string;
  failureCode?: string;
  failureMessage?: string;
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
}
