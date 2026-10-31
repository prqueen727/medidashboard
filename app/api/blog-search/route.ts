import { NextRequest, NextResponse } from 'next/server';

interface BlogResult {
  rank: number;
  title: string;
  link: string;
  bloggername: string;
  postdate: string;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword')?.trim();
  const requestedDisplay = Number(request.nextUrl.searchParams.get('display') ?? 100);
  const display = Number.isFinite(requestedDisplay) ? Math.min(Math.max(requestedDisplay, 1), 100) : 100;

  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  try {
    const url = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: `네이버 블로그 검색 오류: ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const results = parseSearchResults(html).slice(0, display);
    return NextResponse.json({ total: results.length, results });
  } catch (error) {
    console.error('Blog search error:', error);
    return NextResponse.json({ error: '네이버 블로그 검색 중 오류가 발생했습니다.' }, { status: 502 });
  }
}

function stripMarkup(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSearchResults(html: string): BlogResult[] {
  const titlePattern = /href="(https?:\/\/blog\.naver\.com\/[^"]+)"[^>]*data-heatmap-target="\.nblg"[^>]*><span[^>]*sds-comps-text-type-headline1[^>]*>([\s\S]*?)<\/span><\/a>/g;
  const namePattern = /data-heatmap-target="articleSourceJSX_title"[^>]*><span[^>]*>([\s\S]*?)<\/span><\/a>/g;
  const datePattern = /class="[^"]*sds-comps-profile-info-subtext"[^>]*>([\s\S]*?)<\/span>/g;
  const titles: { link: string; title: string }[] = [];
  const names: string[] = [];
  const dates: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = titlePattern.exec(html)) !== null) {
    titles.push({ link: match[1], title: stripMarkup(match[2]) });
  }
  while ((match = namePattern.exec(html)) !== null) names.push(stripMarkup(match[1]));
  while ((match = datePattern.exec(html)) !== null) dates.push(stripMarkup(match[1]));

  return titles.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    link: item.link,
    bloggername: names[index] ?? '',
    postdate: dates[index] ?? '',
  }));
}
