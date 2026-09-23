import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {AuthProvider} from './auth-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jev Gatehouse',
  description:
    'Jev agent authorization for MCP tool calls. Kinde checks identity and permissions. Jev judges each call before it runs.'
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
