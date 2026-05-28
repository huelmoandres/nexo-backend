import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { WsJwtService } from './ws-jwt.service';

@Module({
  providers: [RealtimeGateway, WsJwtService],
})
export class RealtimeModule {}
