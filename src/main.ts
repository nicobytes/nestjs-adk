import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { mountPlaygroundUi } from './http/playground.controller.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  mountPlaygroundUi(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  const config = app.get(ConfigService);
  await app.listen(config.get<string>('PORT') ?? 3000);
}
await bootstrap();
