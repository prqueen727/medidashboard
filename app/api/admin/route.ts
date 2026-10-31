import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// 병원 관리 탭 잠금 해제용 비밀번호 확인
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  return denied ?? NextResponse.json({ success: true });
}
