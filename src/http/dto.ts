import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

/** Decision path uses waId; legacy demo/tests may still send sessionId. */
export class InboundDto {
  @ValidateIf((body: InboundDto) => !body.sessionId)
  @IsString()
  @IsNotEmpty()
  waId?: string;

  @ValidateIf((body: InboundDto) => !body.waId)
  @IsUUID()
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agentId?: string;
}

export class InteractiveDto {
  @ValidateIf((body: InteractiveDto) => !body.sessionId)
  @IsUUID()
  conversationId?: string;

  @ValidateIf((body: InteractiveDto) => !body.conversationId)
  @IsUUID()
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  buttonId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agentId?: string;
}

export class OperatorReplyDto {
  @ValidateIf((body: OperatorReplyDto) => !body.sessionId)
  @IsUUID()
  conversationId?: string;

  @ValidateIf((body: OperatorReplyDto) => !body.conversationId)
  @IsUUID()
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}
