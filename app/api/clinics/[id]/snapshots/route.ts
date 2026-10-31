import { NextRequest, NextResponse } from 'next/server';
import { getKoreaDate, getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return NextResponse.json({ error: '저장할 분석 결과가 올바르지 않습니다.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('rank_snapshots')
      .upsert({
        clinic_id: id,
        snapshot_date: getKoreaDate(),
        payload: body.payload,
      }, { onConflict: 'clinic_id,snapshot_date' })
      .select('id, clinic_id, snapshot_date, payload, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ snapshot: data });
  } catch (error) {
    console.error('Snapshot save error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '오늘의 순위 기록을 저장하지 못했습니다.' }, { status: 503 });
  }
}
