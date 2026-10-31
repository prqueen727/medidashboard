import { NextRequest, NextResponse } from 'next/server';
import { NaverMapScraper } from '@/lib/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const scraper = new NaverMapScraper();

  try {
    const body = await request.json();
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    const requestedTopN = Number(body.topN ?? 20);
    const topN = Number.isFinite(requestedTopN) ? Math.min(Math.max(Math.floor(requestedTopN), 1), 30) : 20;

    if (!keyword || !/^\d+$/.test(placeId)) {
      return NextResponse.json({ error: '키워드와 올바른 플레이스 ID를 입력해주세요.' }, { status: 400 });
    }

    await scraper.initialize();
    await scraper.searchKeyword(keyword);
    const results = await scraper.getSearchResults(topN);
    await scraper.close();

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Competitor search error:', error);
    await scraper.close();
    return NextResponse.json({ error: '경쟁 병원 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
