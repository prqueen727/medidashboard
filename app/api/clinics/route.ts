import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, requireAdmin } from '@/lib/admin';
import { getSupabaseAdmin, getSupabaseConfigDiagnostics, getSupabaseErrorMessage } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ClinicInput {
  name?: unknown;
  placeId?: unknown;
  blogUrl?: unknown;
  magazineUrl?: unknown;
  homepageUrl?: unknown;
  nameAliases?: unknown;
  isHidden?: unknown;
  keywords?: unknown;
  id?: unknown;
}

function parseClinic(input: ClinicInput) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const placeInput = typeof input.placeId === 'string' ? input.placeId.trim() : '';
  const placeId = placeInput.match(/\/place\/(\d+)/)?.[1] ?? placeInput;
  const blogUrl = typeof input.blogUrl === 'string' ? input.blogUrl.trim() : '';
  const magazineUrl = typeof input.magazineUrl === 'string' ? input.magazineUrl.trim() : '';
  const homepageUrl = typeof input.homepageUrl === 'string' ? input.homepageUrl.trim() : '';
  const nameAliases = Array.isArray(input.nameAliases)
    ? [...new Set(input.nameAliases.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
  const keywords = Array.isArray(input.keywords)
    ? [...new Set(input.keywords.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : typeof input.keywords === 'string'
      ? [...new Set(input.keywords.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))]
      : [];

  if (!name || name.length > 100) return { error: '병원명은 1~100자로 입력해주세요.' };
  if (!/^\d+$/.test(placeId)) return { error: '올바른 네이버 플레이스 URL 또는 숫자 ID를 입력해주세요.' };
  if (!blogUrl || blogUrl.length > 500) return { error: '공식 블로그 주소를 입력해주세요.' };
  if (magazineUrl.length > 500) return { error: '웹 매거진 주소는 500자 이내로 입력해주세요.' };
  if (homepageUrl.length > 500) return { error: '홈페이지 주소는 500자 이내로 입력해주세요.' };
  if (nameAliases.length > 10 || nameAliases.some((alias) => alias.length > 100)) {
    return { error: '검색용 상호명은 10개까지, 각 100자 이내로 입력해주세요.' };
  }
  if (keywords.length === 0 || keywords.length > 20 || keywords.some((keyword) => keyword.length > 100)) {
    return { error: '검색 키워드는 1~20개, 각 100자 이내로 입력해주세요.' };
  }

  return { value: { name, place_id: placeId, blog_url: blogUrl, magazine_url: magazineUrl || null, homepage_url: homepageUrl || null, name_aliases: nameAliases, is_hidden: input.isHidden === true, keywords } };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    // 숨긴 병원은 관리자 비밀번호가 있을 때만 목록에 포함
    const query = supabase.from('clinics').select('*').order('name');
    const { data, error } = await (await isAdmin(request) ? query : query.eq('is_hidden', false));
    if (error) throw error;
    return NextResponse.json({ clinics: data });
  } catch (error) {
    console.error('Clinic list error:', { error, config: getSupabaseConfigDiagnostics() });
    return NextResponse.json({ error: getSupabaseErrorMessage(error, '병원 목록을 불러오지 못했습니다.') }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json() as ClinicInput;
    const parsed = parseClinic(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const result = typeof body.id === 'string' && body.id
      ? await supabase.from('clinics').update(parsed.value).eq('id', body.id).select('*').single()
      : await supabase.from('clinics').insert(parsed.value).select('*').single();

    if (result.error) throw result.error;
    return NextResponse.json({ clinic: result.data });
  } catch (error) {
    console.error('Clinic save error:', { error, config: getSupabaseConfigDiagnostics() });
    return NextResponse.json({ error: getSupabaseErrorMessage(error, '병원 정보를 저장하지 못했습니다.') }, { status: 503 });
  }
}
