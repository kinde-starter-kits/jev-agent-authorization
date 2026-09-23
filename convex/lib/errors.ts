import {ConvexError} from 'convex/values';

export type OperationErrorCode = 'not_found' | 'invalid_argument' | 'conflict';

export function fail(code: OperationErrorCode, message: string): never {
  throw new ConvexError({code, message});
}

export type UserErrorCode =
  | 'unauthenticated'
  | 'token_mismatch'
  | 'not_configured'
  | 'rate_limited'
  | 'invalid_message'
  | 'not_found';

/** An error the UI shows as is. Convex passes ConvexError data to the client. */
export function userError(code: UserErrorCode, message: string) {
  return new ConvexError({code, message});
}
