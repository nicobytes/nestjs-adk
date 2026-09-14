import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

const moduleRef = await Test.createTestingModule({
  imports: [ConfigModule.forRoot()],
}).compile();
await moduleRef.close();
