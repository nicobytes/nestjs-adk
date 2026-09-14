import { Body, Controller, Post } from '@nestjs/common';
import { ChannelService } from '../channel/channel.service.js';
import { OperatorReplyDto } from './dto.js';

@Controller()
export class OperatorController {
  constructor(private readonly channel: ChannelService) {}

  @Post('operator/reply')
  async reply(@Body() body: OperatorReplyDto) {
    const message = await this.channel.sendText(body.sessionId, body.text);
    return {
      sessionId: body.sessionId,
      message,
      channel: this.channel.list(body.sessionId),
    };
  }
}
