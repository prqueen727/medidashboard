import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

async function checkAdminPassword(request: Request): Promise<'ok' | 'unconfigured' | 'denied'> {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return 'unconfigured';

  let given = '';
  try {
    given = decodeURIComponent(request.headers.get('x-admin-password') ?? '');
  } catch {
    given = '';
  }

  if (!timingSafeEqual(digest(given), digest(expected))) {
    // 비밀번호를 빠르게 대입해 보는 시도를 늦춘다
    if (given) await delay(800);
    return 'denied';
  }
  return 'ok';
}

// 관리자 비밀번호가 맞는지만 확인 (숨긴 병원 목록 조회 등)
export async function isAdmin(request: Request) {
  return (await checkAdminPassword(request)) === 'ok';
}

// 병원·경쟁 병원 정보를 바꾸는 요청은 관리자 비밀번호(ADMIN_PASSWORD)가 있어야 처리한다.
// 통과하면 null, 아니면 그대로 돌려줄 오류 응답을 반환한다.
export async function requireAdmin(request: Request) {
  const result = await checkAdminPassword(request);
  if (result === 'unconfigured') {
    return NextResponse.json({ error: '관리자 비밀번호가 설정되지 않았습니다. Railway 환경변수 ADMIN_PASSWORD를 설정해주세요.' }, { status: 503 });
  }
  if (result === 'denied') {
    return NextResponse.json({ error: '관리자 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  return null;
}
