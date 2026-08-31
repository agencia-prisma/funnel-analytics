import type { QueueMessageLike } from './types';

export function retryMessage(message: QueueMessageLike): void {
  const attempts = Math.max(1, message.attempts ?? 1);
  const delaySeconds = Math.min(60, 2 ** Math.min(attempts, 5));
  message.retry({ delaySeconds });
}
