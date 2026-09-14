import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsAppAdapter } from '../adapters/whatsapp/whatsapp.adapter.js';
import { WhatsAppController } from '../adapters/whatsapp/whatsapp.controller.js';
import { WhatsAppDirectory } from '../adapters/whatsapp/whatsapp.directory.js';
import { ChannelService } from '../channel/channel.service.js';
import { CHANNEL_SINKS, SESSION_DB_URL } from '../constants.js';
import { AdkHostService } from './adk-host.service.js';
import { PocLog } from './poc-log.js';

@Module({
  imports: [ConfigModule],
  controllers: [WhatsAppController],
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
  exports: [
    AdkHostService,
    ChannelService,
    PocLog,
    SESSION_DB_URL,
    WhatsAppAdapter,
    WhatsAppDirectory,
  ],
})
export class AdkModule {}
