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
  title: 'TOEIC Daily | 매일 공부 기록',
  description: '매일 TOEIC 학습 일정을 계획하고 공부 시간, 점수, 오답 메모를 차곡차곡 기록하세요.',
  openGraph: {
    title: 'TOEIC Daily',
    description: '매일 공부하고, 차곡차곡 기록해요.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TOEIC Daily',
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
