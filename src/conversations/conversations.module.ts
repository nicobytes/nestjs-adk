import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INBOX_WRITER, POC_DB_URL } from '../constants.js';
import { ConversationStore } from './conversation.store.js';
import { InboxWriterService } from './inbox-view.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: POC_DB_URL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('POC_DB_URL') ?? 'sqlite://./data/poc.sqlite',
    },
    ConversationStore,
    InboxWriterService,
    {
      provide: INBOX_WRITER,
      useExisting: InboxWriterService,
    },
  ],
  exports: [
    ConversationStore,
    InboxWriterService,
    INBOX_WRITER,
    POC_DB_URL,
  ],
})
export class ConversationsModule {}
