import type { IdentityQueueMessageLike } from './types';

export function retryIdentityMessage(
  message: IdentityQueueMessageLike,
): void {
  const attempts = Math.max(1, message.attempts ?? 1);
  const delaySeconds = Math.min(60, 2 ** Math.min(attempts, 5));

  message.retry({ delaySeconds });
}
