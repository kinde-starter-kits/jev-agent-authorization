import type {Metadata} from 'next';
import {Bricolage_Grotesque, Geist, Geist_Mono} from 'next/font/google';
import type {ReactNode} from 'react';
import {SiteHeader} from '@/components/site-header';
import {AuthProvider} from './auth-provider';
import './globals.css';

const sans = Geist({subsets: ['latin'], variable: '--font-geist-sans'});
const mono = Geist_Mono({subsets: ['latin'], variable: '--font-geist-mono'});
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display-face',
  weight: ['600', '800']
});

export const metadata: Metadata = {
  title: 'Jev Gatehouse',
  description:
    'Jev agent authorization for MCP tool calls. Kinde checks identity and permissions. Jev judges each call before it runs.'
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body className="min-h-screen font-sans">
        <AuthProvider>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
