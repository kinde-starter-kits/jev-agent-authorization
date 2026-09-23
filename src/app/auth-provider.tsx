'use client';

import {KindeProvider} from '@kinde-oss/kinde-auth-nextjs';
import type {ReactNode} from 'react';

export function AuthProvider({children}: {children: ReactNode}) {
  return <KindeProvider>{children}</KindeProvider>;
}
