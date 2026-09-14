import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ChannelService } from '../channel/channel.service.js';
import { TurnService } from '../queue/turn.service.js';
import { OperatorReplyDto } from './dto.js';

@Controller()
export class OperatorController {
  constructor(
    private readonly channel: ChannelService,
    private readonly turn: TurnService,
  ) {}

  @Post('operator/reply')
  async reply(@Body() body: OperatorReplyDto) {
    if (body.conversationId) {
      await this.turn.appendOperatorReply(body.conversationId, body.text);
      return {
        conversationId: body.conversationId,
        accepted: true,
      };
    }
    if (!body.sessionId) {
      throw new BadRequestException('conversationId or sessionId is required');
    }
    const message = await this.channel.sendText(body.sessionId, body.text);
    return {
      sessionId: body.sessionId,
      message,
      channel: this.channel.list(body.sessionId),
    };
  }
}
