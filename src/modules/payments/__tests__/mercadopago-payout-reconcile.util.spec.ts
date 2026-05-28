import { describe, expect, it } from 'vitest';
import {
  mapMpPaymentToPayoutResult,
  pickPayoutFromMpSearchResults,
} from '../mercadopago-payout-reconcile.util';

describe('mercadopago-payout-reconcile.util', () => {
  it('mapMpPaymentToPayoutResult approved', () => {
    expect(mapMpPaymentToPayoutResult({ id: 99, status: 'approved' })).toEqual({
      success: true,
      providerReference: '99',
      providerStatus: 'approved',
    });
  });

  it('mapMpPaymentToPayoutResult rejected', () => {
    expect(
      mapMpPaymentToPayoutResult({
        id: 1,
        status: 'rejected',
        status_detail: 'cc_rejected',
      }),
    ).toEqual({
      success: false,
      providerReference: '1',
      providerStatus: 'rejected',
      failureCode: 'MP_PAYOUT_REJECTED',
      failureMessage: 'cc_rejected',
    });
  });

  it('mapMpPaymentToPayoutResult pending devuelve null', () => {
    expect(mapMpPaymentToPayoutResult({ id: 2, status: 'pending' })).toBeNull();
  });

  it('pickPayoutFromMpSearchResults prioriza approved', () => {
    const picked = pickPayoutFromMpSearchResults([
      { id: 1, status: 'rejected' },
      { id: 2, status: 'approved' },
    ]);
    expect(picked?.success).toBe(true);
    expect(picked?.providerReference).toBe('2');
  });

  it('pickPayoutFromMpSearchResults devuelve fallo terminal si no hay approved', () => {
    const picked = pickPayoutFromMpSearchResults([
      { id: 3, status: 'pending' },
      { id: 4, status: 'cancelled' },
    ]);
    expect(picked?.success).toBe(false);
    expect(picked?.providerReference).toBe('4');
  });

  it('mapMpPaymentToPayoutResult usa defaults cuando faltan status/id', () => {
    expect(mapMpPaymentToPayoutResult({})).toBeNull();
    expect(
      mapMpPaymentToPayoutResult({
        id: null as unknown as number,
        status: 'approved',
      }),
    ).toEqual({
      success: true,
      providerReference: undefined,
      providerStatus: 'approved',
    });
  });
});
