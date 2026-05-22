export type MpPreapprovalPlanResult = {
  id: string;
};

export type MpPreapprovalResult = {
  id: string;
  initPoint: string;
  status: string;
};

export type MpPreapprovalDetails = {
  id: string;
  status: string;
  externalReference?: string;
};

export interface IMercadoPagoSubscriptionClient {
  createPreapprovalPlan(input: {
    reason: string;
    transactionAmountUyu: number;
    trialDays: number;
  }): Promise<MpPreapprovalPlanResult>;

  createPreapproval(input: {
    preapprovalPlanId: string;
    reason: string;
    externalReference: string;
    payerEmail: string;
    transactionAmountUyu: number;
    trialDays: number;
  }): Promise<MpPreapprovalResult>;

  getPreapproval(id: string): Promise<MpPreapprovalDetails>;

  cancelPreapproval(id: string): Promise<void>;
}
