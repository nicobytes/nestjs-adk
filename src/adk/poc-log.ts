import { Injectable, Logger } from '@nestjs/common';

export type PocLogKind =
  | 'tool_call'
  | 'channel_send'
  | 'pause'
  | 'resume'
  | 'final_text';

@Injectable()
export class PocLog {
  private readonly logger = new Logger('poc');

  event(kind: PocLogKind, payload: Record<string, unknown> = {}): void {
    this.logger.log({ kind, ...payload });
  }
}
