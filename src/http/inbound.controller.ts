import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AdkHostService } from '../adk/adk-host.service.js';
import { ConversationStore } from '../conversations/conversation.store.js';
import { MessageEnqueueService } from '../queue/messages.processor.js';
import { InboundDto, InteractiveDto } from './dto.js';

@Controller()
export class InboundController {
  constructor(
    private readonly host: AdkHostService,
    private readonly store: ConversationStore,
    private readonly enqueue: MessageEnqueueService,
  ) {}

  @Post('inbound')
  async inbound(@Body() body: InboundDto) {
    if (body.waId) {
      const conversation = this.store.findOrCreateOpen(body.waId);
      this.store.insertMessage({
        conversationId: conversation.id,
        role: 'customer',
        kind: 'text',
        body: body.text,
        payload: {},
        source: 'inbound',
      });
      const humanOwned =
        conversation.status === 'WAITING_HUMAN' ||
        conversation.status === 'HUMAN_ACTIVE';
      if (!humanOwned) {
        await this.enqueue.enqueueText({
          conversationId: conversation.id,
          text: body.text,
          agentId: body.agentId,
        });
      }
      return {
        conversationId: conversation.id,
        status: conversation.status,
        accepted: true,
      };
    }
    if (!body.sessionId) {
      throw new BadRequestException('waId or sessionId is required');
    }
    return this.host.inbound(body.sessionId, body.text, {
      agentId: body.agentId,
    });
  }

  @Post('inbound/interactive')
  async interactive(@Body() body: InteractiveDto) {
    const conversationId = body.conversationId ?? body.sessionId;
    if (!conversationId) {
      throw new BadRequestException('conversationId or sessionId is required');
    }
    if (body.conversationId) {
      const conversation = this.store.getById(body.conversationId);
      if (!conversation) {
        throw new BadRequestException(
          `Unknown conversationId: ${body.conversationId}`,
        );
      }
      await this.enqueue.enqueueButton({
        conversationId: body.conversationId,
        buttonId: body.buttonId,
        agentId: body.agentId,
      });
      return {
        conversationId: body.conversationId,
        accepted: true,
      };
    }
    return this.host.resume(conversationId, body.buttonId, {
      agentId: body.agentId,
    });
  }
}
