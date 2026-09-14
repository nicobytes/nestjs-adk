import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { POC_DB_URL, SESSION_DB_URL } from '../src/constants.js';
import { mountPlaygroundUi } from '../src/http/playground.controller.js';

export async function createPocApp(
  dbUrl: string,
  options: { pocDbUrl?: string; redisUrl?: string } = {},
): Promise<INestApplication> {
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SESSION_DB_URL)
    .useValue(dbUrl)
    .overrideProvider(POC_DB_URL)
    .useValue(options.pocDbUrl ?? dbUrl.replace('sessions', 'poc').replace('.sqlite', '-poc.sqlite'));

  if (options.redisUrl) {
    process.env.REDIS_URL = options.redisUrl;
  } else {
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  mountPlaygroundUi(app);
  await app.init();
  return app;
}
