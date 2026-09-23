import {ConvexError} from 'convex/values';

export type OperationErrorCode = 'not_found' | 'invalid_argument' | 'conflict';

export function fail(code: OperationErrorCode, message: string): never {
  throw new ConvexError({code, message});
}

export function requireReason(reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    fail(
      'invalid_argument',
      'Give a reason: the user request, in their words.'
    );
  }
  return trimmed;
}
