import { Module, RequestMethod } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';

const HEALTH_PATHS = new Set(['/health/live', '/health/ready']);

@Module({
  imports: [
    LoggerModule.forRoot({
      forRoutes: [{ path: '/{*path}', method: RequestMethod.ALL }],
      pinoHttp: {
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
