import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://language-study-log.evolvix.workers.dev'),
  title: 'Language Study Log | 매일 공부 기록',
  description: '영어·일본어·TOEIC 학습 일정을 계획하고 공부 시간, 점수, 복습 메모를 차곡차곡 기록하세요.',
  icons: {
    icon: [{ url: '/favicon.svg?v=2', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg?v=2',
  },
  openGraph: {
    title: 'Language Study Log',
    description: '매일 공부하고, 차곡차곡 기록해요.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Language Study Log',
    description: '매일 공부하고, 차곡차곡 기록해요.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
