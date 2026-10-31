import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getSupabaseAdmin, getSupabaseErrorMessage } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface CompetitorInput {
  id?: unknown;
  name?: unknown;
  placeId?: unknown;
  blogUrl?: unknown;
  homepageUrl?: unknown;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('clinic_competitors')
      .select('*')
      .eq('clinic_id', id)
      .order('name');

    if (error) throw error;
    return NextResponse.json({ competitors: data });
  } catch (error) {
    console.error('Competitor list error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '경쟁 병원 목록을 불러오지 못했습니다.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id: clinicId } = await context.params;
    const body = await request.json() as CompetitorInput;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const placeInput = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    const placeId = placeInput.match(/\/place\/(\d+)/)?.[1] ?? placeInput;
    const blogUrl = typeof body.blogUrl === 'string' ? body.blogUrl.trim() : '';
    const homepageUrl = typeof body.homepageUrl === 'string' ? body.homepageUrl.trim() : '';

    if (!name || name.length > 100) {
      return NextResponse.json({ error: '경쟁 병원명은 1~100자로 입력해주세요.' }, { status: 400 });
    }
    if (!/^\d+$/.test(placeId)) {
      return NextResponse.json({ error: '올바른 네이버 플레이스 URL 또는 숫자 ID를 입력해주세요.' }, { status: 400 });
    }
    if (!blogUrl && !homepageUrl) {
      return NextResponse.json({ error: '경쟁 병원의 블로그나 홈페이지 주소 중 하나 이상을 입력해주세요.' }, { status: 400 });
    }
    if (blogUrl.length > 500 || homepageUrl.length > 500) {
      return NextResponse.json({ error: '블로그와 홈페이지 주소는 500자 이내로 입력해주세요.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .select('place_id')
      .eq('id', clinicId)
      .single();
    if (clinicError) throw clinicError;
    if (clinic.place_id === placeId) {
      return NextResponse.json({ error: '기준 병원과 다른 플레이스 ID를 입력해주세요.' }, { status: 400 });
    }

    if (!(typeof body.id === 'string' && body.id)) {
      const { count, error: countError } = await supabase
        .from('clinic_competitors')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId);
      if (countError) throw countError;
      const { data: existing, error: existingError } = await supabase
        .from('clinic_competitors')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('place_id', placeId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing && (count ?? 0) >= 29) {
        return NextResponse.json({ error: '기준 병원을 포함해 최대 30개 병원까지 순위를 비교할 수 있습니다.' }, { status: 400 });
      }
    }

    const values = { clinic_id: clinicId, name, place_id: placeId, blog_url: blogUrl || null, homepage_url: homepageUrl || null };
    const result = typeof body.id === 'string' && body.id
      ? await supabase.from('clinic_competitors').update(values).eq('clinic_id', clinicId).eq('id', body.id).select('*').single()
      : await supabase.from('clinic_competitors').upsert(values, { onConflict: 'clinic_id,place_id' }).select('*').single();

    if (result.error) throw result.error;
    return NextResponse.json({ competitor: result.data });
  } catch (error) {
    console.error('Competitor save error:', error);
    return NextResponse.json({ error: getSupabaseErrorMessage(error, '경쟁 병원을 저장하지 못했습니다.') }, { status: 503 });
  }
}
