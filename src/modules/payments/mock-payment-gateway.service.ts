import { Injectable } from '@nestjs/common';
import type {
  IPaymentGateway,
  IssuePayoutInput,
  IssuePayoutResult,
  ReconcilePayoutInput,
  ValidatePayoutDestinationInput,
  ValidatePayoutDestinationResult,
} from './payment-gateway.interface';

@Injectable()
export class MockPaymentGatewayService implements IPaymentGateway {
  private rejectNextValidation = false;
  private rejectNextPayout = false;
  private payoutResultsByIdempotencyKey = new Map<string, IssuePayoutResult>();

  /** Solo para tests — simula rechazo MP en la próxima validación. */
  setRejectNextValidation(value: boolean): void {
    this.rejectNextValidation = value;
  }

  /** Solo para tests — simula fallo de payout en la próxima emisión. */
  setRejectNextPayout(value: boolean): void {
    this.rejectNextPayout = value;
  }

  async createPaymentLink(input: { jobId: string; amountCents: number }) {
    return {
      paymentUrl: `https://mock-gateway.uy/pay/${input.jobId}`,
      providerReference: `MOCK-REF-${input.jobId}`,
      externalUrl: `https://mock-gateway.uy/orders/${input.jobId}`,
    };
  }

  verifyWebhookSignature(
    _payload?: string,
    _signature?: string,
    _secret?: string,
  ): boolean {
    return true;
  }

  async getPaymentStatus(providerReference: string) {
    return {
      status: 'APPROVED',
      providerReference,
      amountCents: 0,
    };
  }

  async issueRefund(providerReference: string) {
    return {
      refundReference: `REFUND-${providerReference}`,
      status: 'PROCESSED',
    };
  }

  async validatePayoutDestination(
    input: ValidatePayoutDestinationInput,
  ): Promise<ValidatePayoutDestinationResult> {
    if (this.rejectNextValidation) {
      this.rejectNextValidation = false;
      return {
        valid: false,
        rejectionReason: 'MOCK_INVALID_DESTINATION',
      };
    }
    const key = input.transferIdentifier ?? input.mpAlias ?? 'unknown';
    return {
      valid: true,
      providerReference: `MOCK-VAL-${key.slice(-4)}`,
    };
  }

  async issuePayout(input: IssuePayoutInput): Promise<IssuePayoutResult> {
    if (input.idempotencyKey) {
      const existing = this.payoutResultsByIdempotencyKey.get(
        input.idempotencyKey,
      );
      if (existing) {
        return existing;
      }
    }
    if (this.rejectNextPayout) {
      this.rejectNextPayout = false;
      const res: IssuePayoutResult = {
        success: false,
        failureCode: 'MOCK_PAYOUT_FAILED',
        failureMessage: 'Cuenta inválida (mock)',
      };
      if (input.idempotencyKey) {
        this.payoutResultsByIdempotencyKey.set(input.idempotencyKey, res);
      }
      return res;
    }
    const res: IssuePayoutResult = {
      success: true,
      providerReference: `MOCK-PAYOUT-${input.escrowTransactionId.slice(0, 8)}`,
      providerStatus: 'approved',
    };
    if (input.idempotencyKey) {
      this.payoutResultsByIdempotencyKey.set(input.idempotencyKey, res);
    }
    return res;
  }

  async reconcilePayoutByIdempotencyKey(
    input: ReconcilePayoutInput,
  ): Promise<IssuePayoutResult | null> {
    return this.payoutResultsByIdempotencyKey.get(input.idempotencyKey) ?? null;
  }
}
