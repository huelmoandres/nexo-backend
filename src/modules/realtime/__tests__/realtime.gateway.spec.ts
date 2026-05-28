import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { RealtimeGateway } from '../realtime.gateway';

const createAdapterMock = vi.fn((_pub: unknown, _sub: unknown) => 'adapter-instance');
const redisQuitMock = vi.fn().mockResolvedValue(undefined);
const redisOnMock = vi.fn();
const redisDuplicateOnMock = vi.fn();
const redisDuplicateQuitMock = vi.fn().mockResolvedValue(undefined);
const redisDuplicateMock = vi.fn(() => ({
  on: redisDuplicateOnMock,
  quit: redisDuplicateQuitMock,
}));
const redisCtorArgs: unknown[][] = [];

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: (pub: unknown, sub: unknown) => createAdapterMock(pub, sub),
}));

vi.mock('ioredis', () => ({
  default: class RedisMock {
    constructor(...args: unknown[]) {
      redisCtorArgs.push(args);
    }
    on = redisOnMock;
    duplicate = redisDuplicateMock;
    quit = redisQuitMock;
  },
}));

describe('RealtimeGateway', () => {
  const wsJwtService = {
    validateToken: vi.fn(),
  };
  const cfg = {
    redisUrl: 'redis://localhost:6379',
    redisMaxRetriesPerRequest: 1,
  } as never;

  it('handleConnection une al room cuando token válido', async () => {
    vi.mocked(wsJwtService.validateToken).mockResolvedValueOnce({ sub: 'u1' });
    const join = vi.fn().mockResolvedValue(undefined);
    const client = {
      id: 'socket-1',
      handshake: { auth: { token: 'jwt' } },
      join,
      disconnect: vi.fn(),
    } as unknown as Socket;
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    await gateway.handleConnection(client);
    expect(join).toHaveBeenCalledWith('user:u1');
  });

  it('handleConnection desconecta cuando token inválido', async () => {
    vi.mocked(wsJwtService.validateToken).mockRejectedValueOnce(
      new Error('invalid'),
    );
    const disconnect = vi.fn();
    const client = {
      id: 'socket-2',
      handshake: { auth: { token: 'jwt' } },
      join: vi.fn(),
      disconnect,
    } as unknown as Socket;
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    await gateway.handleConnection(client);
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('handleConnection registra err string cuando validateToken lanza no-Error', async () => {
    vi.mocked(wsJwtService.validateToken).mockRejectedValueOnce('string-fail');
    const disconnect = vi.fn();
    const client = {
      id: 'socket-4',
      handshake: { auth: { token: 'jwt' } },
      join: vi.fn(),
      disconnect,
    } as unknown as Socket;
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    await gateway.handleConnection(client);
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('handleConnection desconecta cuando falta token', async () => {
    const disconnect = vi.fn();
    const client = {
      id: 'socket-3',
      handshake: { auth: {} },
      join: vi.fn(),
      disconnect,
    } as unknown as Socket;
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    await gateway.handleConnection(client);
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('afterInit aplica adapter en host directo', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    const adapter = vi.fn();
    gateway.afterInit({ adapter } as never);
    expect(createAdapterMock).toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledWith('adapter-instance');
  });

  it('afterInit aplica adapter en host server.adapter', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    const adapter = vi.fn();
    gateway.afterInit({ server: { adapter } } as never);
    expect(adapter).toHaveBeenCalledWith('adapter-instance');
  });

  it('afterInit no explota si no encuentra host adapter', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    expect(() => gateway.afterInit({} as never)).not.toThrow();
  });

  it('handleRealtimePush emite al room del usuario', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    (gateway as unknown as { server: { to: typeof to } }).server = { to };
    gateway.handleRealtimePush({ userId: 'u1', event: 'evt', data: { ok: 1 } });
    expect(to).toHaveBeenCalledWith('user:u1');
    expect(emit).toHaveBeenCalledWith('evt', { ok: 1 });
  });

  it('onModuleDestroy hace quit de clientes redis', async () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    gateway.afterInit({ adapter: vi.fn() } as never);
    await gateway.onModuleDestroy();
    expect(redisQuitMock).toHaveBeenCalled();
    expect(redisDuplicateQuitMock).toHaveBeenCalled();
  });

  it('retryStrategy limita reintentos de redis', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    gateway.afterInit({ adapter: vi.fn() } as never);
    const options = redisCtorArgs.at(-1)?.[1] as {
      retryStrategy?: (attempt: number) => number | null;
    };
    expect(options.retryStrategy?.(1)).toBe(250);
    expect(options.retryStrategy?.(20)).toBeNull();
  });

  it('registra callbacks de error en pub/sub redis', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    gateway.afterInit({ adapter: vi.fn() } as never);
    const pubErrorCb = redisOnMock.mock.calls.find(
      (c) => c[0] === 'error',
    )?.[1];
    const subErrorCb = redisDuplicateOnMock.mock.calls.find(
      (c) => c[0] === 'error',
    )?.[1];
    expect(pubErrorCb).toBeTypeOf('function');
    expect(subErrorCb).toBeTypeOf('function');
    expect(() => (pubErrorCb as () => unknown)()).not.toThrow();
    expect(() => (subErrorCb as () => unknown)()).not.toThrow();
  });

  it('afterInit no reinicializa redis si ya existe', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    const adapter = vi.fn();
    gateway.afterInit({ adapter } as never);
    const ctorCalls = redisCtorArgs.length;
    gateway.afterInit({ adapter } as never);
    expect(redisCtorArgs.length).toBe(ctorCalls);
  });

  it('afterInit retorna si init no deja clientes redis', () => {
    const gateway = new RealtimeGateway(wsJwtService as never, cfg);
    (
      gateway as unknown as { initRedisAdapterClients: () => void }
    ).initRedisAdapterClients = () => undefined;
    const adapter = vi.fn();
    gateway.afterInit({ adapter } as never);
    expect(createAdapterMock).not.toHaveBeenCalledWith(undefined, undefined);
    expect(adapter).not.toHaveBeenCalled();
  });
});
