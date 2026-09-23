'use server';

import {redirect} from 'next/navigation';
import {heldRequest, signInState} from '@/lib/held';

async function resolve(id: string, action: 'approve' | 'deny') {
  const state = await signInState();
  if (!state.signedIn || !state.raw) redirect(`/approve/${id}`);
  const result = await heldRequest<unknown>(
    'POST',
    `${encodeURIComponent(id)}/${action}`,
    state.raw
  );
  const query = result.ok
    ? `done=${action}`
    : `error=${encodeURIComponent(result.code)}`;
  redirect(`/approve/${id}?${query}`);
}

export async function approveHeld(id: string) {
  await resolve(id, 'approve');
}

export async function denyHeld(id: string) {
  await resolve(id, 'deny');
}
