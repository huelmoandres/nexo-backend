import { Module, RequestMethod } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';

const HEALTH_PATHS = new Set(['/health/live', '/health/ready']);
const CORRELATION_HEADER = 'x-correlation-id';

@Module({
  imports: [
    LoggerModule.forRoot({
      forRoutes: [{ path: '/{*path}', method: RequestMethod.ALL }],
      pinoHttp: {
        genReqId: (req: IncomingMessage) => {
          const raw = req.headers[CORRELATION_HEADER];
          const incoming =
            typeof raw === 'string' && raw.trim().length > 0
              ? raw.trim()
              : undefined;
          return incoming ?? randomUUID();
        },
        customProps: (req: IncomingMessage) => ({
          correlationId:
            (req as IncomingMessage & { id?: string }).id ??
            req.headers[CORRELATION_HEADER],
        }),
        level:
          process.env['LOG_LEVEL'] ??
          (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug'),
        serializers: {
          req: (req: IncomingMessage & { query?: unknown }) => ({
            method: req.method,
            url: req.url,
            query: req.query,
          }),
          res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
          }),
        },
        autoLogging: {
          ignore: (req: IncomingMessage) => HEALTH_PATHS.has(req.url ?? ''),
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[REDACTED]',
        },
        transport:
          process.env['NODE_ENV'] === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              },
        base: {
          service: 'nexos-backend',
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
