import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  MongoDBContainer,
  StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'node:child_process';

/**
 * Setup global de Testcontainers para tests de integración (e2e).
 *
 * Este archivo se ejecuta UNA VEZ antes de todos los archivos *.e2e-spec.ts.
 * Los containers arrancan aquí y se destruyen en teardown.
 *
 * Las imágenes usadas coinciden con docker-compose.yml (entornos idénticos):
 *   - PostgreSQL: postgis/postgis:16-3.4  (incluye extensión PostGIS)
 *   - Redis:      redis:7-alpine
 *   - MongoDB:    mongo:7
 *
 * Las URLs de conexión se inyectan como variables de entorno para que
 * PrismaService, ioredis y Mongoose las puedan leer desde process.env.
 *
 * Prerrequisito: Docker debe estar corriendo localmente.
 */

let postgresContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let mongoContainer: StartedMongoDBContainer;

export async function setup(): Promise<void> {
  console.log('[Testcontainers] Iniciando containers de integración...');

  // Arrancar todos los containers en paralelo para reducir tiempo de setup.
  [postgresContainer, redisContainer, mongoContainer] = await Promise.all([
    new PostgreSqlContainer('postgis/postgis:16-3.4')
      .withDatabase('nexos_test')
      .withUsername('nexos_test')
      .withPassword('nexos_test_password')
      .start(),

    new RedisContainer('redis:7-alpine')
      .withPassword('nexos_test_redis')
      .start(),

    new MongoDBContainer('mongo:7').start(),
  ]);

  // Inyectar URLs de conexión como variables de entorno.
  // Los Services de NestJS leen estas variables vía ConfigService.
  process.env['DATABASE_URL'] = postgresContainer.getConnectionUri();
  process.env['REDIS_URL'] =
    `redis://:nexos_test_redis@${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  process.env['MONGODB_URI'] = mongoContainer.getConnectionString();
  // Necesario para que ConfigModule.validate no falle al importar AppModule en e2e.
  process.env['SUPABASE_JWT_SECRET'] ??= 'e2e-global-supabase-jwt-secret';

  // Ejecutar migraciones de Prisma contra el container de PostgreSQL.
  // Esto crea el schema real en la DB de test.
  console.log('[Testcontainers] Aplicando migraciones de Prisma...');
  execSync('npx prisma db push --url "$DATABASE_URL"', {
    env: { ...process.env },
    stdio: 'pipe',
  });

  // Instalar extensión PostGIS (necesaria para las queries geoespaciales).
  console.log('[Testcontainers] Habilitando extensión PostGIS...');
  await postgresContainer.exec([
    'psql',
    '-U',
    'nexos_test',
    '-d',
    'nexos_test',
    '-c',
    'CREATE EXTENSION IF NOT EXISTS postgis;',
  ]);

  console.log('[Testcontainers] Containers listos.');
  console.log(`  PostgreSQL: ${process.env['DATABASE_URL']}`);
  console.log(`  Redis:      ${process.env['REDIS_URL']}`);
  console.log(`  MongoDB:    ${process.env['MONGODB_URI']}`);
}

export async function teardown(): Promise<void> {
  console.log('[Testcontainers] Destruyendo containers...');
  await Promise.all([
    postgresContainer?.stop(),
    redisContainer?.stop(),
    mongoContainer?.stop(),
  ]);
  console.log('[Testcontainers] Containers destruidos.');
}
