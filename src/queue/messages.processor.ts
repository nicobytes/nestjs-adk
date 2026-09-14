import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { BUFFER_MS, MESSAGES_QUEUE } from '../constants.js';
import { ConversationLock } from './conversation-lock.js';
import { MessageBufferService } from './message-buffer.js';
import { TurnService } from './turn.service.js';

export type ProcessJobData =
  | {
      kind: 'text';
      conversationId: string;
      agentId?: string;
    }
  | {
      kind: 'button';
      conversationId: string;
      buttonId: string;
      agentId?: string;
    };

@Injectable()
export class MessagesProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagesProcessor.name);
  private readonly lock = new ConversationLock();
  private worker?: Worker;

  constructor(
    private readonly turn: TurnService,
    private readonly buffer: MessageBufferService,
    private readonly config: ConfigService,
    @InjectQueue(MESSAGES_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    const url = new URL(
      this.config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379',
    );
    this.worker = new Worker(
      MESSAGES_QUEUE,
      async (job: Job<ProcessJobData>) => this.handle(job),
      {
        connection: {
          host: url.hostname || '127.0.0.1',
          port: Number(url.port || 6379),
          maxRetriesPerRequest: null,
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `job ${job?.id} failed: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close(true);
  }

  private async handle(job: Job<ProcessJobData>): Promise<unknown> {
    const { conversationId } = job.data;
    return this.lock.runExclusive(conversationId, async () => {
      if (job.data.kind === 'button') {
        return this.turn.runButtonTurn({
          conversationId,
          buttonId: job.data.buttonId,
          agentId: job.data.agentId,
        });
      }
      const texts = await this.buffer.drainTexts(conversationId);
      if (texts.length === 0) {
        this.logger.debug(`empty buffer for ${conversationId}`);
        return { skipped: true, reason: 'empty_buffer' };
      }
      const joined = texts.join('\n');
      const result = await this.turn.runTextTurn({
        conversationId,
        text: joined,
        agentId: job.data.agentId,
      });
      const remaining = await this.buffer.pendingCount(conversationId);
      if (remaining > 0) {
        await this.queue.add(
          'process',
          { kind: 'text', conversationId, agentId: job.data.agentId },
          {
            jobId: `${conversationId}-${Date.now()}`,
            delay: 0,
            attempts: 3,
            backoff: { type: 'fixed', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
      }
      return result;
    });
  }
}

@Injectable()
export class MessageEnqueueService {
  constructor(
    @InjectQueue(MESSAGES_QUEUE) private readonly queue: Queue,
    private readonly buffer: MessageBufferService,
  ) {}

  async enqueueText(input: {
    conversationId: string;
    text: string;
    agentId?: string;
  }): Promise<void> {
    await this.buffer.pushText(input.conversationId, input.text);
    try {
      await this.queue.add(
        'process',
        {
          kind: 'text',
          conversationId: input.conversationId,
          agentId: input.agentId,
        },
        {
          jobId: input.conversationId,
          delay: BUFFER_MS,
          attempts: 3,
          backoff: { type: 'fixed', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|JobId/i.test(message)) {
        throw error;
      }
    }
  }

  async enqueueButton(input: {
    conversationId: string;
    buttonId: string;
    agentId?: string;
  }): Promise<void> {
    await this.queue.add(
      'process',
      {
        kind: 'button',
        conversationId: input.conversationId,
        buttonId: input.buttonId,
        agentId: input.agentId,
      },
      {
        jobId: `${input.conversationId}:btn:${input.buttonId}:${Date.now()}`,
        delay: 0,
        attempts: 3,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
