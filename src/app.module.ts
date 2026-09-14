import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdkHostService } from './adk/adk-host.service.js';
import { PocLog } from './adk/poc-log.js';
import { ChannelService } from './channel/channel.service.js';
import { CHANNEL_SINKS, SESSION_DB_URL } from './constants.js';
import { InboundController } from './http/inbound.controller.js';
import { OperatorController } from './http/operator.controller.js';
import { PlaygroundController } from './http/playground.controller.js';
import { WhatsAppAdapter } from './adapters/whatsapp/whatsapp.adapter.js';
import { WhatsAppController } from './adapters/whatsapp/whatsapp.controller.js';
import { WhatsAppDirectory } from './adapters/whatsapp/whatsapp.directory.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    InboundController,
    OperatorController,
    PlaygroundController,
    WhatsAppController,
  ],
  providers: [
    PocLog,
    WhatsAppAdapter,
    WhatsAppDirectory,
    {
      provide: CHANNEL_SINKS,
      inject: [WhatsAppAdapter],
      useFactory: (whatsapp: WhatsAppAdapter) => [whatsapp],
    },
    ChannelService,
    {
      provide: SESSION_DB_URL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('SESSION_DB_URL') ??
        'sqlite://./data/sessions.sqlite',
    },
    AdkHostService,
  ],
})
export class AppModule {}
