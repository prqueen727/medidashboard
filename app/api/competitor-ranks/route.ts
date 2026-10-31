import { NextRequest, NextResponse } from 'next/server';
import { NaverMapScraper } from '@/lib/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface TargetPlace {
  id: string;
  name: string;
}

function isTargetPlace(value: unknown): value is TargetPlace {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return typeof target.id === 'string' && /^\d+$/.test(target.id) && typeof target.name === 'string';
}

export async function POST(request: NextRequest) {
  const scraper = new NaverMapScraper();
  try {
    const body = await request.json();
    const rawKeywords: string[] = Array.isArray(body.keywords)
      ? body.keywords.filter((item: unknown): item is string => typeof item === 'string')
        .map((item: string) => item.trim()).filter(Boolean)
      : [];
    const keywords = [...new Set(rawKeywords)];
    const rawTargets: unknown[] = Array.isArray(body.targets) ? body.targets : [];
    const targets = rawTargets.filter(isTargetPlace);

    if (!keywords.length || keywords.length > 20 || !targets.length || targets.length > 30) {
      return NextResponse.json({ error: '키워드 1~20개와 추적할 플레이스 1~30곳을 입력해주세요.' }, { status: 400 });
    }

    await scraper.initialize();
    const rankings: Record<string, Record<string, number | null>> = {};
    for (const keyword of keywords) {
      await scraper.searchKeyword(keyword);
      const results = await scraper.getSearchResults(30);
      const rankById = new Map(results
        .filter((item): item is typeof item & { placeId: string } => item.placeId !== null)
        .map((item) => [item.placeId, item.rank]));
      rankings[keyword] = Object.fromEntries(targets.map((target) => [target.id, rankById.get(target.id) ?? null]));
    }
    await scraper.close();
    return NextResponse.json({ rankings });
  } catch (error) {
    console.error('Competitor rank analysis error:', error);
    await scraper.close();
    return NextResponse.json({ error: '경쟁 병원 순위 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
