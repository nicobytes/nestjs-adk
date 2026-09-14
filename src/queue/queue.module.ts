import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdkModule } from '../adk/adk.module.js';
import { MESSAGES_QUEUE, REDIS_URL } from '../constants.js';
import { MessageBufferService } from './message-buffer.js';
import {
  MessageEnqueueService,
  MessagesProcessor,
} from './messages.processor.js';
import { TurnService } from './turn.service.js';

@Module({
  imports: [
    ConfigModule,
    AdkModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(
          config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379',
        );
        return {
          connection: {
            host: url.hostname || '127.0.0.1',
            port: Number(url.port || 6379),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: MESSAGES_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  providers: [
    {
      provide: REDIS_URL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379',
    },
    MessageBufferService,
    TurnService,
    MessagesProcessor,
    MessageEnqueueService,
  ],
  exports: [
    TurnService,
    MessageEnqueueService,
    MessageBufferService,
    BullModule,
  ],
})
export class QueueModule {}
