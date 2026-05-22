import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import type { MercadoPagoWebhookBodyDto } from '@modules/payments/dto/mercadopago-webhook.dto';
import { BillingService } from './billing.service';

@Public()
@ApiTags('payments')
@Controller('payments/webhooks/mercadopago')
export class BillingWebhooksController {
  constructor(private readonly billingService: BillingService) {}

  @Post('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Notificaciones Mercado Pago — suscripciones SaaS' })
  mercadoPagoSubscriptionWebhook(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body() body: MercadoPagoWebhookBodyDto,
    @Query('id') queryId?: string,
    @Query('data.id') dataIdQuery?: string,
    @Query('topic') queryTopic?: string,
  ) {
    return this.billingService.handleMercadoPagoSubscriptionWebhook(
      {
        'x-signature': xSignature,
        'x-request-id': xRequestId,
      },
      body,
      queryId,
      dataIdQuery,
      queryTopic,
    );
  }
}
