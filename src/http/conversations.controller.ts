import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { AdkHostService } from '../adk/adk-host.service.js';
import { DEFAULT_AGENT_ID, USER_ID } from '../constants.js';
import { ConversationStore } from '../conversations/conversation.store.js';
import { toInbox } from '../conversations/inbox-view.js';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly store: ConversationStore,
    private readonly host: AdkHostService,
  ) {}

  @Post(':id/handoff')
  handoff(@Param('id') id: string) {
    this.require(id);
    const conversation = this.store.setStatus(id, 'WAITING_HUMAN');
    return {
      conversationId: conversation.id,
      status: conversation.status,
    };
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    this.require(id);
    const conversation = this.store.setStatus(id, 'BOT_AUTO');
    return {
      conversationId: conversation.id,
      status: conversation.status,
    };
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    this.require(id);
    const conversation = this.store.setStatus(id, 'CLOSED');
    return {
      conversationId: conversation.id,
      status: conversation.status,
    };
  }

  @Get(':id/debug')
  async debug(@Param('id') id: string) {
    const conversation = this.require(id);
    const messages = this.store.listMessages(id);
    const session = await this.host.sessionService.getSession({
      appName: DEFAULT_AGENT_ID,
      userId: USER_ID,
      sessionId: id,
    });
    const events = session?.events ?? [];
    return {
      conversation: {
        id: conversation.id,
        status: conversation.status,
        waId: conversation.wa_id,
      },
      messages: toInbox(messages),
      sessionEventCount: events.length,
      sessionPreview: events.slice(-5).map((event) => ({
        author: event.author,
        parts: (event.content?.parts ?? []).map((part) => ({
          text: part.text,
          functionCall: part.functionCall
            ? { name: part.functionCall.name, id: part.functionCall.id }
            : undefined,
          functionResponse: part.functionResponse
            ? { id: part.functionResponse.id, name: part.functionResponse.name }
            : undefined,
        })),
      })),
    };
  }

  private require(id: string) {
    const conversation = this.store.getById(id);
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${id}`);
    }
    return conversation;
  }
}
