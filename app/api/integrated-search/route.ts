import { NextRequest, NextResponse } from 'next/server';

interface IntegratedResult {
  rank: number;
  title: string;
  link: string;
  placeId: string;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    const clinicName = typeof body.clinicName === 'string' ? body.clinicName.trim() : '';

    if (!keyword || !placeId || !/^\d+$/.test(placeId)) {
      return NextResponse.json({ error: '키워드와 올바른 플레이스 ID를 입력해주세요.' }, { status: 400 });
    }

    const response = await fetch(`https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: `네이버 통합검색 오류: ${response.status}` }, { status: 502 });
    }

    const html = (await response.text()).replace(/&amp;/g, '&');
    const results = extractPlaceResults(html);
    const matchById = results.find((result) => result.placeId === placeId);
    const matchByName = clinicName
      ? results.find((result) => result.title.replace(/\s/g, '').includes(clinicName.replace(/\s/g, '')))
      : undefined;
    const target = matchById ?? matchByName;

    return NextResponse.json({
      rank: target?.rank ?? null,
      results,
    });
  } catch (error) {
    console.error('Integrated search error:', error);
    return NextResponse.json({ error: '네이버 통합검색 중 오류가 발생했습니다.' }, { status: 502 });
  }
}

function extractPlaceResults(html: string): IntegratedResult[] {
  const results: IntegratedResult[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b([^>]*?)href=(?:"([^"]+)"|'([^']+)')([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const link = match[2] ?? match[3] ?? '';
    const placeId = link.match(/\/place\/(\d+)/)?.[1];
    if (!placeId || seen.has(placeId)) continue;

    const title = stripTags(match[5]);
    if (!title) continue;

    seen.add(placeId);
    results.push({
      rank: results.length + 1,
      title,
      link: link.startsWith('http') ? link : `https://map.naver.com${link}`,
      placeId,
    });
  }

  return results;
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
