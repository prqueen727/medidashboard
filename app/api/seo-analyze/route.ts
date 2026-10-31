import { NextRequest, NextResponse } from 'next/server';
import { NaverMapScraper } from '@/lib/scraper';
import { SEOAnalysisResponse, PlaceKeywords } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const scraper = new NaverMapScraper();

  try {
    const body = await request.json();
    const { keyword, topN = 10 } = body;

    if (!keyword) {
      return NextResponse.json(
        {
          success: false,
          message: '검색 키워드를 입력해주세요.',
        } as Partial<SEOAnalysisResponse>,
        { status: 400 }
      );
    }

    // 스크래퍼 초기화 및 검색
    await scraper.initialize();
    await scraper.searchKeyword(keyword);
    const results = await scraper.getSearchResults(topN);

    if (results.length === 0) {
      await scraper.close();
      return NextResponse.json({
        success: false,
        keyword,
        message: '검색 결과를 찾을 수 없습니다.',
        allKeywords: [],
        analyzedPlaces: [],
        analyzedCount: 0,
        keywordCount: 0,
      } as SEOAnalysisResponse);
    }

    console.log(`상위 ${results.length}개 플레이스의 대표 키워드 추출 중...`);

    const allKeywordsSet = new Set<string>();
    const analyzedPlaces: PlaceKeywords[] = [];

    for (let i = 0; i < Math.min(results.length, topN); i++) {
      const place = results[i];
      console.log(`[${i + 1}/${topN}] ${place.name}`);

      if (!place.placeId) {
        console.log('  → Place ID 없음, 스킵');
        analyzedPlaces.push({
          rank: place.rank,
          name: place.name,
          placeId: '',
          keywords: [],
          keywordCount: 0,
        });
        continue;
      }

      const keywords = await scraper.getPlaceKeywords(place.placeId);

      if (keywords.length > 0) {
        console.log(`  → 키워드 ${keywords.length}개: ${keywords.join(', ')}`);
        keywords.forEach(kw => allKeywordsSet.add(kw));
      } else {
        console.log('  → 키워드 없음');
      }

      analyzedPlaces.push({
        rank: place.rank,
        name: place.name,
        placeId: place.placeId,
        keywords,
        keywordCount: keywords.length,
      });
    }

    await scraper.close();

    const uniqueKeywords = Array.from(allKeywordsSet).sort();

    console.log(`\n분석 완료!`);
    console.log(`총 ${analyzedPlaces.length}개 플레이스 분석`);
    console.log(`중복 제거된 고유 키워드: ${uniqueKeywords.length}개`);

    return NextResponse.json({
      success: true,
      keyword,
      analyzedCount: analyzedPlaces.length,
      allKeywords: uniqueKeywords,
      keywordCount: uniqueKeywords.length,
      analyzedPlaces,
      message: `${analyzedPlaces.length}개 플레이스 분석 완료, 총 ${uniqueKeywords.length}개 고유 키워드 발견`,
    } as SEOAnalysisResponse);

  } catch (error) {
    console.error('SEO analysis error:', error);
    await scraper.close();

    return NextResponse.json(
      {
        success: false,
        message: 'SEO 분석 중 오류가 발생했습니다.',
      } as Partial<SEOAnalysisResponse>,
      { status: 500 }
    );
  }
}
