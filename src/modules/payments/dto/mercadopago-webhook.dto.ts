import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MercadoPagoWebhookDataDto {
  @ApiPropertyOptional()
  @IsOptional()
  id?: string | number;
}

/** Body de notificación MP (Pagos y IPN legacy merchant_order). */
export class MercadoPagoWebhookBodyDto {
  @ApiPropertyOptional({ example: 'payment.updated' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'payment' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'merchant_order' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    example: 'https://api.mercadolibre.com/merchant_orders/123',
  })
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MercadoPagoWebhookDataDto)
  data?: MercadoPagoWebhookDataDto;

  @ApiPropertyOptional({ example: 'v1' })
  @IsOptional()
  @IsString()
  api_version?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date_created?: string;

  @ApiPropertyOptional()
  @IsOptional()
  id?: string | number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  live_mode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  user_id?: string | number;
}
