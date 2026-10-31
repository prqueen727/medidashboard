import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

// 병원·경쟁 병원 정보를 바꾸는 요청은 관리자 비밀번호(ADMIN_PASSWORD)가 있어야 처리한다.
// 통과하면 null, 아니면 그대로 돌려줄 오류 응답을 반환한다.
export async function requireAdmin(request: Request) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json({ error: '관리자 비밀번호가 설정되지 않았습니다. Railway 환경변수 ADMIN_PASSWORD를 설정해주세요.' }, { status: 503 });
  }

  let given = '';
  try {
    given = decodeURIComponent(request.headers.get('x-admin-password') ?? '');
  } catch {
    given = '';
  }

  if (!timingSafeEqual(digest(given), digest(expected))) {
    // 비밀번호를 빠르게 대입해 보는 시도를 늦춘다
    await delay(800);
    return NextResponse.json({ error: '관리자 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  return null;
}
