import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '병원 검색 순위 대시보드',
  description: '네이버 플레이스, 블로그, 경쟁 병원의 키워드 순위를 분석합니다.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="gradient-mesh min-h-screen antialiased">{children}</body>
    </html>
  )
}
