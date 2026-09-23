import {ConvexError} from 'convex/values';

const FALLBACK = 'Something went wrong. Try again.';

/** A short message for the UI. Never shows Convex internals. */
export function userMessage(error: unknown, fallback = FALLBACK) {
  if (error instanceof ConvexError) {
    const data = error.data as {message?: unknown} | string;
    if (typeof data === 'string') return data;
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}

export function isSessionError(error: unknown) {
  if (!(error instanceof ConvexError)) return false;
  const code = (error.data as {code?: unknown})?.code;
  return code === 'unauthenticated' || code === 'token_mismatch';
}
