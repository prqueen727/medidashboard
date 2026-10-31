export interface PlaceItem {
  rank: number;
  placeId: string;
  name: string;
  isAd: boolean;
}

export type ContentType = 'blog' | 'cafe' | 'post' | 'influencer' | 'kin' | 'youtube' | 'web';

export interface ContentItem {
  rank: number;
  type: ContentType;
  key: string;
  title: string;
  link: string;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 블로그·카페처럼 첫 경로가 계정 ID인 네이버 서비스
const ACCOUNT_HOSTS: Record<string, ContentType> = {
  'blog.naver.com': 'blog',
  'cafe.naver.com': 'cafe',
  'post.naver.com': 'post',
  'in.naver.com': 'influencer',
};

const CONTENT_HOSTS: Record<string, ContentType> = {
  ...ACCOUNT_HOSTS,
  'kin.naver.com': 'kin',
  'youtube.com': 'youtube',
};

// 카드 경계 판단에 쓰지 않는 보조 링크
const IGNORED_TARGETS = new Set(['.kepmore', '.sguide', '.more', 'articleSourceJSX_adtag']);

export async function fetchIntegratedSearch(keyword: string) {
  const response = await fetch(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`네이버 통합검색 오류: ${response.status}`);
  const html = await response.text();
  if (html.includes('검색 서비스 이용이 제한되었습니다')) {
    throw new Error('네이버가 서버의 검색 요청을 일시적으로 제한했습니다. 잠시 후 다시 분석해주세요.');
  }
  return html;
}

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, '')).replace(/새 창 열림/g, '').replace(/\s+/g, ' ').trim();
}

// 통합검색 플레이스 영역의 업체를 광고 포함 노출 순서대로 추출
export function parsePlaces(html: string): PlaceItem[] {
  const places: PlaceItem[] = [];
  const seen = new Set<string>();
  const itemPattern = /<li\b[^>]*\sdata-(nmb_[a-z]+)-doc-id="([^"]+)"[^>]*>/g;
  const starts: { index: number; docId: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(html)) !== null) starts.push({ index: match.index, docId: match[2] });

  starts.forEach(({ index, docId }, position) => {
    const placeId = docId.split('_')[0];
    if (!/^\d+$/.test(placeId) || seen.has(docId)) return;
    seen.add(docId);
    const segment = html.slice(index, starts[position + 1]?.index ?? index + 8000);
    const name = segment.match(/data-nlog-area="[^"]*\.list"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1];
    places.push({
      rank: places.length + 1,
      placeId,
      name: name ? stripTags(name) : '',
      isAd: docId.includes('_nad-'),
    });
  });

  return places;
}

function parseUrl(value: string) {
  try {
    const url = new URL(decodeEntities(value));
    return { url, host: url.hostname.replace(/^(www|m)\./, '') };
  } catch {
    return null;
  }
}

// 같은 블로그·카페·사이트를 가리키는 링크를 하나로 묶는 키 (예: blog.naver.com/아이디)
export function getAccountKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = parseUrl(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.includes('.') ? trimmed : `blog.naver.com/${trimmed}`}`);
  if (!parsed) return '';
  const { url, host } = parsed;
  if (!(host in ACCOUNT_HOSTS)) return host;
  const account = url.searchParams.get('blogId') ?? url.pathname.split('/').filter(Boolean)[0];
  return account && !account.includes('.') ? `${host}/${account.toLowerCase()}` : '';
}

// 통합검색 1페이지에서 광고·플레이스·웹사이트를 제외한 콘텐츠를 노출 순서대로 추출
// includeKeys에 있는 웹사이트(예: 등록한 웹 매거진)는 콘텐츠로 함께 센다
export function parseContents(html: string, includeKeys: string[] = []): ContentItem[] {
  const cards: { key: string; links: { target: string; url: string; text: string }[] }[] = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const attributes = match[1];
    const target = attributes.match(/data-heatmap-target="([^"]+)"/)?.[1];
    const href = attributes.match(/href="([^"]+)"/)?.[1];
    if (!target || !href || IGNORED_TARGETS.has(target)) continue;

    const parsed = parseUrl(href);
    if (!parsed || parsed.host === 'ader.naver.com' || parsed.host.endsWith('search.naver.com') || parsed.host === 'help.naver.com') {
      if (target === 'articleSourceJSX_thumbnail') cards.push({ key: '', links: [] });
      continue;
    }

    const key = getAccountKey(parsed.url.href);
    const current = cards[cards.length - 1];
    const startsCard = target === 'articleSourceJSX_thumbnail' || target === '.favicon'
      || !current || Boolean(key && current.key && key !== current.key);
    const card = startsCard ? { key: '', links: [] as { target: string; url: string; text: string }[] } : current;
    if (startsCard) cards.push(card);
    if (key && !card.key) card.key = key;
    card.links.push({ target, url: parsed.url.href, text: stripTags(match[2]) });
  }

  const contents: ContentItem[] = [];
  for (const card of cards) {
    const host = card.key.split('/')[0];
    const type = CONTENT_HOSTS[host] ?? (includeKeys.includes(card.key) ? 'web' : undefined);
    if (!type) continue;
    const titleLink = card.links.find((link) => (link.target === '.link' || link.target === '.tit') && link.text)
      ?? card.links.find((link) => link.text);
    contents.push({
      rank: contents.length + 1,
      type,
      key: card.key,
      title: titleLink?.text ?? card.key,
      link: titleLink?.url ?? card.links[0]?.url ?? '',
    });
  }

  return contents;
}
