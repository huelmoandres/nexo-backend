import { describe, expect, it, vi } from 'vitest';
import { PaymentsController } from '../payments.controller';

describe('PaymentsController', () => {
  it('delega webhook mock al service', async () => {
    const service = {
      handleWebhook: vi.fn().mockResolvedValue({ ok: true }),
      handleMercadoPagoWebhook: vi.fn(),
    };
    const ctrl = new PaymentsController(service as never);
    await ctrl.webhook('secret', {
      jobId: 'j1',
      providerReference: 'r',
    } as never);
    expect(service.handleWebhook).toHaveBeenCalled();
  });

  it('delega webhook mercadopago con query data.id', async () => {
    const service = {
      handleWebhook: vi.fn(),
      handleMercadoPagoWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };
    const ctrl = new PaymentsController(service as never);
    await ctrl.mercadoPagoWebhook(
      'sig',
      'req',
      { data: { id: '1' } },
      undefined,
      '42',
      undefined,
    );
    expect(service.handleMercadoPagoWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      '42',
      undefined,
    );
  });

  it('delega webhook mercadopago al service', async () => {
    const service = {
      handleWebhook: vi.fn(),
      handleMercadoPagoWebhook: vi.fn().mockResolvedValue({ ok: true }),
    };
    const ctrl = new PaymentsController(service as never);
    await ctrl.mercadoPagoWebhook('sig', 'req', { data: { id: '1' } }, '1');
    expect(service.handleMercadoPagoWebhook).toHaveBeenCalled();
  });
});
