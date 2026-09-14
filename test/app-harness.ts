import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { SESSION_DB_URL } from '../src/constants.js';
import { mountPlaygroundUi } from '../src/http/playground.controller.js';

export async function createPocApp(dbUrl: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SESSION_DB_URL)
    .useValue(dbUrl)
    .compile();
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
