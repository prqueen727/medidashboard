import { NextRequest, NextResponse } from 'next/server';
import { NaverMapScraper } from '@/lib/scraper';
import { SearchResponse, KeywordRankResult } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Railway: 타임아웃 제한 없음

export async function POST(request: NextRequest) {
  const scraper = new NaverMapScraper();

  try {
    const body = await request.json();
    const { keyword, keywords, placeUrl } = body;

    // 단일 키워드 또는 여러 키워드 배열 처리
    let keywordList: string[] = [];
    if (keywords && Array.isArray(keywords)) {
      keywordList = keywords.filter((k: string) => k.trim());
    } else if (keyword) {
      // 쉼표로 구분된 키워드 지원
      keywordList = keyword.split(',').map((k: string) => k.trim()).filter((k: string) => k);
    }

    if (keywordList.length === 0 || !placeUrl) {
      return NextResponse.json(
        {
          success: false,
          message: '검색어와 플레이스 URL을 모두 입력해주세요.',
        } as SearchResponse,
        { status: 400 }
      );
    }

    // placeUrl에서 placeId 추출
    let placeId: string | null = null;

    // 다양한 URL 패턴에서 place ID 추출
    const match = placeUrl.match(/\/place\/(\d+)/);
    if (match && match[1]) {
      placeId = match[1];
    } else if (/^\d+$/.test(placeUrl.trim())) {
      placeId = placeUrl.trim();
    }

    if (!placeId) {
      return NextResponse.json(
        {
          success: false,
          message: '올바른 플레이스 URL 또는 ID를 입력해주세요. (예: https://map.naver.com/p/entry/place/123456789)',
        } as SearchResponse,
        { status: 400 }
      );
    }

    console.log(`추출된 placeId: ${placeId}`);
    console.log(`검색할 키워드: ${keywordList.join(', ')}`);

    // 스크래퍼 초기화
    await scraper.initialize();

    // 병렬 검색 실행 (동시 3개 탭)
    const parallelResults = await scraper.searchKeywordsParallel(keywordList, placeId, 3);

    // 결과 변환
    const keywordRanks: KeywordRankResult[] = parallelResults.map(r => ({
      keyword: r.keyword,
      rank: r.rank,
      totalResults: r.totalResults,
      found: r.found,
    }));

    // 플레이스 이름 추출
    const foundResult = parallelResults.find(r => r.found && r.placeName);
    const placeName = foundResult?.placeName;

    // 대표 키워드 추출 (한 번만)
    const placeKeywords = await scraper.getPlaceKeywords(placeId);
    await scraper.close();

    // 결과 분석
    const foundCount = keywordRanks.filter(k => k.found).length;
    const avgRank = foundCount > 0
      ? Math.round(keywordRanks.filter(k => k.found).reduce((sum, k) => sum + (k.rank || 0), 0) / foundCount)
      : null;

    if (foundCount > 0) {
      return NextResponse.json({
        success: true,
        placeName,
        placeId,
        keywordRanks,
        keywords: placeKeywords.length > 0 ? placeKeywords : undefined,
        message: `${keywordList.length}개 키워드 중 ${foundCount}개에서 발견 (평균 ${avgRank}위)`,
      } as SearchResponse);
    } else {
      return NextResponse.json({
        success: false,
        keywordRanks,
        message: `${keywordList.length}개 키워드 검색 결과 내에서 해당 플레이스를 찾을 수 없습니다.`,
      } as SearchResponse);
    }

  } catch (error) {
    console.error('Search error:', error);
    await scraper.close();

    return NextResponse.json(
      {
        success: false,
        message: '검색 중 오류가 발생했습니다.',
      } as SearchResponse,
      { status: 500 }
    );
  }
}
