import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('clinics').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clinic delete error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '병원을 삭제하지 못했습니다.' }, { status: 503 });
  }
}
