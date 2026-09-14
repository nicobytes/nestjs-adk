import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class InboundDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agentId?: string;
}

export class InteractiveDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  buttonId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agentId?: string;
}

export class OperatorReplyDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}
