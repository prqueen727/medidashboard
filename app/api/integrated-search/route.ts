import { NextRequest, NextResponse } from 'next/server';
import { ContentItem, PlaceItem, fetchIntegratedSearch, getAccountKey, parseContents, parsePlaces } from '@/lib/naver-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface Target {
  id: string;
  placeId: string;
  blogUrl: string;
  magazineUrl?: string;
  homepageUrl?: string;
  extraUrls?: string[];
}

interface KeywordSearchResult {
  keyword: string;
  places: PlaceItem[];
  contents: ContentItem[];
  ranks: Record<string, { placeRank: number | null; contentRank: number | null; magazineRank: number | null; homepageRank: number | null; extraRanks: (number | null)[] }>;
  error?: string;
}

// 짧은 시간에 연속 요청하면 네이버가 검색을 제한하므로 키워드 사이에 간격을 둔다
const REQUEST_INTERVAL_MS = 1500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTarget(value: unknown): value is Target {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return typeof target.id === 'string' && typeof target.placeId === 'string' && typeof target.blogUrl === 'string'
    && (target.magazineUrl === undefined || typeof target.magazineUrl === 'string')
    && (target.homepageUrl === undefined || typeof target.homepageUrl === 'string')
    && (target.extraUrls === undefined || (Array.isArray(target.extraUrls) && target.extraUrls.length <= 2
      && target.extraUrls.every((url) => typeof url === 'string')));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keywords: string[] = Array.isArray(body.keywords)
      ? [...new Set(body.keywords.filter((item: unknown): item is string => typeof item === 'string')
        .map((item: string) => item.trim()).filter(Boolean))] as string[]
      : [];
    const targets: Target[] = (Array.isArray(body.targets) ? body.targets as unknown[] : []).filter(isTarget);

    // 플레이스 키워드(최대 10개)와 콘텐츠 키워드(최대 20개)를 합친 목록을 한 번에 검색한다
    if (!keywords.length || keywords.length > 30 || !targets.length || targets.length > 30) {
      return NextResponse.json({ error: '키워드 1~30개와 순위를 확인할 병원 1~30곳을 입력해주세요.' }, { status: 400 });
    }

    const keysOf = (target: Target) => ({
      blog: getAccountKey(target.blogUrl),
      magazine: target.magazineUrl ? getAccountKey(target.magazineUrl) : '',
      homepage: target.homepageUrl ? getAccountKey(target.homepageUrl) : '',
      extras: (target.extraUrls ?? []).map((url) => getAccountKey(url)),
    });
    // 등록한 주소(블로그 칸에 넣은 홈페이지 포함)는 웹사이트 결과여도 콘텐츠로 센다
    const siteKeys = targets.flatMap((target) => {
      const { extras, ...keys } = keysOf(target);
      return [...Object.values(keys), ...extras];
    }).filter(Boolean);
    const rankOf = (contents: ContentItem[], key: string) => key ? contents.find((content) => content.key === key)?.rank ?? null : null;

    const results: KeywordSearchResult[] = [];
    for (const [index, keyword] of keywords.entries()) {
      if (index > 0) await delay(REQUEST_INTERVAL_MS);
      try {
        const html = await fetchIntegratedSearch(keyword);
        const places = parsePlaces(html);
        const contents = parseContents(html, siteKeys);
        const ranks = Object.fromEntries(targets.map((target) => {
          const keys = keysOf(target);
          return [target.id, {
            placeRank: places.find((place) => place.placeId === target.placeId)?.rank ?? null,
            contentRank: rankOf(contents, keys.blog),
            magazineRank: rankOf(contents, keys.magazine),
            homepageRank: rankOf(contents, keys.homepage),
            extraRanks: keys.extras.map((key) => rankOf(contents, key)),
          }];
        }));
        results.push({ keyword, places, contents, ranks });
      } catch (error) {
        console.error(`Integrated search error (${keyword}):`, error);
        results.push({
          keyword,
          places: [],
          contents: [],
          ranks: {},
          error: error instanceof Error ? error.message : '네이버 통합검색 중 오류가 발생했습니다.',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Integrated search error:', error);
    return NextResponse.json({ error: '네이버 통합검색 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
