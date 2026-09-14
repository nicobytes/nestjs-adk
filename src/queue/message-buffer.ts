import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_URL } from '../constants.js';

@Injectable()
export class MessageBufferService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(@Inject(REDIS_URL) redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  onModuleDestroy(): void {
    void this.redis.quit();
  }

  bufferKey(conversationId: string): string {
    return `buffer:${conversationId}`;
  }

  async pushText(conversationId: string, text: string): Promise<void> {
    await this.redis.rpush(this.bufferKey(conversationId), text);
  }

  async drainTexts(conversationId: string): Promise<string[]> {
    const key = this.bufferKey(conversationId);
    const results = await this.redis
      .multi()
      .lrange(key, 0, -1)
      .del(key)
      .exec();
    const texts = (results?.[0]?.[1] as string[] | undefined) ?? [];
    return texts.filter(Boolean);
  }

  async pendingCount(conversationId: string): Promise<number> {
    return this.redis.llen(this.bufferKey(conversationId));
  }

  get client(): Redis {
    return this.redis;
  }
}
