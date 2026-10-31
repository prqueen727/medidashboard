import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; competitorId: string }> }) {
  try {
    const { id: clinicId, competitorId } = await context.params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('clinic_competitors')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('id', competitorId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Competitor delete error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '경쟁 병원을 삭제하지 못했습니다.' }, { status: 503 });
  }
}
