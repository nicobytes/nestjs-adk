import { Body, Controller, Post } from '@nestjs/common';
import { AdkHostService } from '../adk/adk-host.service.js';
import { InboundDto, InteractiveDto } from './dto.js';

@Controller()
export class InboundController {
  constructor(private readonly host: AdkHostService) {}

  @Post('inbound')
  inbound(@Body() body: InboundDto) {
    return this.host.inbound(body.sessionId, body.text, {
      agentId: body.agentId,
    });
  }

  @Post('inbound/interactive')
  interactive(@Body() body: InteractiveDto) {
    return this.host.resume(body.sessionId, body.buttonId, {
      agentId: body.agentId,
    });
  }
}
