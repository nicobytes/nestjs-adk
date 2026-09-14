import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import type { PlaygroundMessage } from '../channel/playground.js';

export class PlaygroundRunDto {
  @IsString()
  @IsNotEmpty()
  appName: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsObject()
  newMessage: PlaygroundMessage;

  @IsOptional()
  @IsBoolean()
  streaming?: boolean;
}
