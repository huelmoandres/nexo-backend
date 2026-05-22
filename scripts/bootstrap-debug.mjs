import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/src/app.module.js';

async function main() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    await app.init();
    console.log('bootstrap ok');
    await app.close();
  } catch (err) {
    console.error('bootstrap failed:', err);
    process.exit(1);
  }
}

main();
