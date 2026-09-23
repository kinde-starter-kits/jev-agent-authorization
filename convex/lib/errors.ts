import {ConvexError} from 'convex/values';

export type OperationErrorCode = 'not_found' | 'invalid_argument' | 'conflict';

export function fail(code: OperationErrorCode, message: string): never {
  throw new ConvexError({code, message});
}
