import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdkModule } from './adk/adk.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { ConversationsController } from './http/conversations.controller.js';
import { HealthController } from './http/health.controller.js';
import { InboundController } from './http/inbound.controller.js';
import { OperatorController } from './http/operator.controller.js';
import { PlaygroundController } from './http/playground.controller.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ConversationsModule,
    AdkModule,
    QueueModule,
  ],
  controllers: [
    InboundController,
    OperatorController,
    PlaygroundController,
    HealthController,
    ConversationsController,
  ],
})
export class AppModule {}
