import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      // Evita el wildcard legacy "*" que dispara LegacyRouteConverter en Nest 11.
      forRoutes: [{ path: '/{*path}', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
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
