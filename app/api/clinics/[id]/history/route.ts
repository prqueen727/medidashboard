import { NextRequest, NextResponse } from 'next/server';
import { getKoreaDate, getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const requestedDays = Number(request.nextUrl.searchParams.get('days') ?? 30);
    const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.floor(requestedDays), 1), 90) : 30;
    const from = getKoreaDate(-(days - 1));
    const today = getKoreaDate();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('rank_snapshots')
      .select('id, clinic_id, snapshot_date, payload, created_at')
      .eq('clinic_id', id)
      .gte('snapshot_date', from)
      .lte('snapshot_date', today)
      .order('snapshot_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ snapshots: data, today });
  } catch (error) {
    console.error('Clinic history error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '순위 기록을 불러오지 못했습니다.' }, { status: 503 });
  }
}
