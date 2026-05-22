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
import { PaymentsService } from './payments.service';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { MercadoPagoWebhookBodyDto } from './dto/mercadopago-webhook.dto';

@Public()
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook pasarela mock / desarrollo (x-webhook-secret)',
  })
  webhook(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ) {
    return this.paymentsService.handleWebhook(secret, dto);
  }

  @Post('webhooks/mercadopago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Notificaciones Mercado Pago (Checkout Pro)' })
  mercadoPagoWebhook(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body() body: MercadoPagoWebhookBodyDto,
    @Query('id') queryId?: string,
    @Query('data.id') dataIdQuery?: string,
    @Query('topic') queryTopic?: string,
  ) {
    return this.paymentsService.handleMercadoPagoWebhook(
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
