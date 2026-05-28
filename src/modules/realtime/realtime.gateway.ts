import {
  Inject,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Namespace, Server, Socket } from 'socket.io';
import { authConfig } from '@config/auth.config';
import {
  RealtimePushPayload,
  REALTIME_NAMESPACE,
  REALTIME_PUSH_EVENT,
} from './realtime.constants';
import { WsJwtService } from './ws-jwt.service';

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: {
    origin: process.env['CORS_ORIGINS']?.split(',') ?? [],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server | Namespace;

  private readonly logger = new Logger(RealtimeGateway.name);
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    private readonly wsJwtService: WsJwtService,
    @Inject(authConfig.KEY)
    private readonly authCfg: ConfigType<typeof authConfig>,
  ) {}

  private initRedisAdapterClients(): void {
    if (this.pubClient && this.subClient) return;
    this.pubClient = new Redis(this.authCfg.redisUrl, {
      maxRetriesPerRequest: this.authCfg.redisMaxRetriesPerRequest,
      enableReadyCheck: false,
      retryStrategy: (attempt) =>
        attempt > 5 ? null : Math.min(attempt * 250, 2000),
    });
    this.pubClient.on('error', () => undefined);
    this.subClient = this.pubClient.duplicate();
    this.subClient.on('error', () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }

  afterInit(server: Server | Namespace): void {
    this.initRedisAdapterClients();
    if (!this.pubClient || !this.subClient) return;
    const redisAdapter = createAdapter(this.pubClient, this.subClient);
    const adapterHost = this.resolveAdapterHost(server);
    if (!adapterHost) {
      this.logger.warn(
        'No se pudo resolver host Socket.IO para adapter Redis.',
      );
      return;
    }
    adapterHost.adapter(redisAdapter);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const claims = await this.wsJwtService.validateToken(token);
      const room = `user:${claims.sub}`;
      await client.join(room);
      this.logger.log({ op: 'realtime.connected', room, socketId: client.id });
    } catch (err: unknown) {
      this.logger.warn({
        op: 'realtime.authFailed',
        socketId: client.id,
        err: err instanceof Error ? err.message : String(err),
      });
      client.disconnect(true);
    }
  }

  @OnEvent(REALTIME_PUSH_EVENT)
  handleRealtimePush(payload: RealtimePushPayload): void {
    this.server.to(`user:${payload.userId}`).emit(payload.event, payload.data);
  }

  private extractToken(client: Socket): string {
    const token = client.handshake.auth['token'] as unknown;
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedException();
    }
    return token;
  }

  private resolveAdapterHost(
    instance: Server | Namespace,
  ): { adapter: (adapter: ReturnType<typeof createAdapter>) => void } | null {
    const direct = instance as unknown as {
      adapter?: (adapter: ReturnType<typeof createAdapter>) => void;
      server?: {
        adapter?: (adapter: ReturnType<typeof createAdapter>) => void;
      };
    };

    if (typeof direct.adapter === 'function') {
      return { adapter: direct.adapter.bind(instance) };
    }

    if (direct.server && typeof direct.server.adapter === 'function') {
      return { adapter: direct.server.adapter.bind(direct.server) };
    }

    return null;
  }
}
