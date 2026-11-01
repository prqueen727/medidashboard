'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ContentItem, PlaceItem, getAccountKey } from '@/lib/naver-search';
import RankTrendChart from './rank-trend-chart';

interface Clinic {
  id: string;
  name: string;
  place_id: string;
  blog_url: string;
  magazine_url: string | null;
  homepage_url: string | null;
  name_aliases?: string[];
  is_hidden?: boolean;
  keywords: string[];
}

interface ClinicForm {
  name: string;
  placeId: string;
  blogUrl: string;
  magazineUrl: string;
  homepageUrl: string;
  nameAliases: string;
  isHidden: boolean;
  keywords: string;
}

interface SavedCompetitor {
  id: string;
  clinic_id: string;
  name: string;
  place_id: string;
  blog_url: string | null;
  homepage_url: string | null;
}

interface CompetitorForm {
  name: string;
  placeId: string;
  blogUrl: string;
  homepageUrl: string;
}

interface PlaceRank {
  keyword: string;
  rank: number | null;
  totalResults: number;
  found: boolean;
}

interface Competitor {
  rank: number;
  name: string;
  placeId: string | null;
  href: string | null;
}

interface TrackedCompetitor {
  id: string;
  name: string;
  placeId: string;
  placeRank: number | null;
  integratedRank: number | null;
}

interface KeywordResult {
  keyword: string;
  placeRank?: PlaceRank;
  integratedRank?: number | null;
  magazineRank?: number | null;
  homepageRank?: number | null;
  places?: PlaceItem[];
  contents?: ContentItem[];
  trackedCompetitors?: TrackedCompetitor[];
  integratedError?: string;
}

interface KeywordSearchResult {
  keyword: string;
  places: PlaceItem[];
  contents: ContentItem[];
  ranks: Record<string, { placeRank: number | null; contentRank: number | null; magazineRank: number | null; homepageRank: number | null }>;
  error?: string;
}

const CONTENT_TYPE_LABELS: Record<ContentItem['type'], string> = {
  blog: '블로그',
  cafe: '카페',
  post: '포스트',
  influencer: '인플루언서',
  kin: '지식iN',
  youtube: '유튜브',
  web: '웹사이트',
};

interface Analysis {
  placeName?: string;
  keywordResults: KeywordResult[];
  competitors: Competitor[];
  competitorError?: string;
  trackedRankError?: string;
  completedAt: string;
}

interface Snapshot {
  id: string;
  clinic_id: string;
  snapshot_date: string;
  payload: Analysis;
  created_at: string;
}

type Tab = 'place' | 'content' | 'competitor' | 'history' | 'manage';
type HistoryPeriod = 'day' | 'week' | 'month';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 월요일 시작 주의 첫날
function getWeekStart(value: string) {
  return shiftDate(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7));
}

function formatMonthDay(value: string) {
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
}

function getPeriodKey(date: string, period: HistoryPeriod) {
  if (period === 'day') return date;
  return period === 'week' ? getWeekStart(date) : date.slice(0, 7);
}

function formatPeriodKey(key: string, period: HistoryPeriod) {
  if (period === 'day') return formatDate(key);
  if (period === 'week') return `${formatMonthDay(key)} ~ ${formatMonthDay(shiftDate(key, 6))} 주간`;
  return `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;
}
type TrendMetric = 'place' | 'blog' | 'content';
type CompareMetric = 'place' | 'content';

function getKeywordRank(item: KeywordResult | undefined, metric: TrendMetric) {
  if (!item) return null;
  if (metric === 'place') return item.placeRank?.rank ?? null;
  if (metric === 'blog') return item.integratedRank ?? null;
  // 공식 블로그·웹 매거진·홈페이지 중 가장 높은 순위
  return bestRank(item.integratedRank, item.magazineRank, item.homepageRank);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[\s·.,()[\]-]/g, '');
}

// 통합검색 콘텐츠 중 블로그명·제목·설명에 상호명(또는 별칭)이 들어간 항목
function getNameMentions(item: KeywordResult, names: string[]) {
  const targets = names.map(normalizeName).filter(Boolean);
  return targets.length ? (item.contents ?? []).filter((content) =>
    [content.source, content.title, content.description].some((text) => {
      const normalized = text ? normalizeName(text) : '';
      return normalized && targets.some((target) => normalized.includes(target));
    })) : [];
}

function clinicNames(clinic: Clinic) {
  return [clinic.name, ...(clinic.name_aliases ?? [])];
}

// 상호명 노출 개수를 내 병원과 비교한 차이
function MentionGap({ mine, theirs }: { mine: number; theirs: number }) {
  const gap = theirs - mine;
  return (
    <span className="rank-compare">{theirs}개
      {gap > 0 ? <span className="rank-gap higher">{gap}개 많음</span>
        : gap < 0 ? <span className="rank-gap lower">{-gap}개 적음</span>
          : <span className="rank-gap same">동일</span>}
    </span>
  );
}

// 경쟁 병원 순위를 내 병원과 비교한 차이 (순위 숫자가 클수록 낮은 순위)
function RankGap({ mine, theirs }: { mine: number | null; theirs: number | null }) {
  if (!theirs) return <span className="rank-out">순위권 외</span>;
  const gap = mine ? theirs - mine : null;
  return (
    <span className="rank-compare">{theirs}위
      {gap === null ? <span className="rank-gap higher">높음</span>
        : gap > 0 ? <span className="rank-gap lower">{gap}위 낮음</span>
          : gap < 0 ? <span className="rank-gap higher">{-gap}위 높음</span>
            : <span className="rank-gap same">동일</span>}
    </span>
  );
}

const emptyForm: ClinicForm = { name: '', placeId: '', blogUrl: '', magazineUrl: '', homepageUrl: '', nameAliases: '', isHidden: false, keywords: '' };
const emptyCompetitorForm: CompetitorForm = { name: '', placeId: '', blogUrl: '', homepageUrl: '' };

function bestRank(...ranks: (number | null | undefined)[]) {
  const found = ranks.filter((rank): rank is number => Boolean(rank));
  return found.length ? Math.min(...found) : null;
}

function toClinicForm(clinic: Clinic): ClinicForm {
  return {
    name: clinic.name,
    placeId: clinic.place_id,
    blogUrl: clinic.blog_url,
    magazineUrl: clinic.magazine_url ?? '',
    homepageUrl: clinic.homepage_url ?? '',
    nameAliases: (clinic.name_aliases ?? []).join(', '),
    isHidden: clinic.is_hidden ?? false,
    keywords: clinic.keywords.join(', '),
  };
}

function getKeywords(value: string) {
  return [...new Set(value.split(/[,\n]/).map((keyword) => keyword.trim()).filter(Boolean))];
}

function getPlaceId(value: string) {
  return value.match(/\/place\/(\d+)/)?.[1] ?? (/^\d+$/.test(value.trim()) ? value.trim() : '');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' }).format(new Date(`${value}T00:00:00+09:00`));
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : '요청에 실패했습니다.');
  }
  return data as T;
}

function Rank({ value }: { value?: number | null }) {
  return value ? <strong className="rank-value">{value}<small>위</small></strong> : <span className="rank-out">순위권 외</span>;
}

// 통합검색 순위: 공식 블로그는 초록색, 웹 매거진은 파란색, 홈페이지는 보라색
function ContentRanks({ blogRank, magazineRank, homepageRank, showMagazine, showHomepage }: {
  blogRank?: number | null;
  magazineRank?: number | null;
  homepageRank?: number | null;
  showMagazine: boolean;
  showHomepage: boolean;
}) {
  const label = (rank?: number | null) => rank ? `${rank}위` : '순위권 외';
  return (
    <span className="content-ranks">
      <span className="content-rank blog">블로그 {label(blogRank)}</span>
      {showMagazine && <span className="content-rank magazine">매거진 {label(magazineRank)}</span>}
      {showHomepage && <span className="content-rank homepage">홈페이지 {label(homepageRank)}</span>}
    </span>
  );
}

export default function DashboardClient() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [trackedCompetitors, setTrackedCompetitors] = useState<SavedCompetitor[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [form, setForm] = useState<ClinicForm>(emptyForm);
  const [competitorForm, setCompetitorForm] = useState<CompetitorForm>(emptyCompetitorForm);
  const [editingCompetitorId, setEditingCompetitorId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('place');
  const [compareKeywords, setCompareKeywords] = useState<Record<CompareMetric, string>>({ place: '', content: '' });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedDate, setSelectedDate] = useState('today');
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('day');
  const [historyKey, setHistoryKey] = useState('');
  const [printAll, setPrintAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [today, setToday] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminInput, setAdminInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // 관리자 잠금 해제는 브라우저 탭을 닫기 전까지만 유지
  useEffect(() => {
    try {
      setAdminPassword(sessionStorage.getItem('adminPassword') ?? '');
    } catch {
      // 저장소를 쓸 수 없으면 매번 비밀번호를 입력받는다
    }
  }, []);

  // PDF로 저장: 모든 탭을 펼쳐 그린 뒤 인쇄하고, 인쇄 창이 닫히면 원래 화면으로 돌아간다
  useEffect(() => {
    if (!printAll) return;
    const reset = () => setPrintAll(false);
    window.addEventListener('afterprint', reset);
    // 그래프가 너비를 잰 다음 인쇄되도록 잠시 기다린다
    const timer = window.setTimeout(() => window.print(), 400);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', reset);
    };
  }, [printAll]);

  const lockAdmin = useCallback(() => {
    setAdminPassword('');
    try {
      sessionStorage.removeItem('adminPassword');
    } catch {
      // 무시
    }
  }, []);

  const adminFetch = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), 'x-admin-password': encodeURIComponent(adminPassword) },
    });
    if (response.status === 401) lockAdmin();
    return response;
  };

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUnlocking(true);
    setNotice('');
    try {
      await readJson<{ success: boolean }>(await fetch('/api/admin', {
        method: 'POST',
        headers: { 'x-admin-password': encodeURIComponent(adminInput) },
      }));
      setAdminPassword(adminInput);
      setAdminInput('');
      try {
        sessionStorage.setItem('adminPassword', adminInput);
      } catch {
        // 무시
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '비밀번호를 확인하지 못했습니다.');
    } finally {
      setUnlocking(false);
    }
  };

  // 접속한 날짜(한국 시간). 정적 렌더링과 어긋나지 않도록 브라우저에서 계산한다.
  useEffect(() => {
    setToday(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()));
  }, []);

  const selectedClinic = clinics.find((clinic) => clinic.id === selectedClinicId);
  const displayedAnalysis = selectedDate === 'today'
    ? analysis
    : snapshots.find((snapshot) => snapshot.snapshot_date === selectedDate)?.payload ?? null;
  const historyKeys = useMemo(() => [...new Set(snapshots.map((snapshot) => getPeriodKey(snapshot.snapshot_date, historyPeriod)))]
    .sort((a, b) => b.localeCompare(a)), [snapshots, historyPeriod]);
  const activeHistoryKey = historyKeys.includes(historyKey) ? historyKey : historyKeys[0] ?? '';

  const keywordTrend = (metric: TrendMetric) => snapshots.map((snapshot) => ({
    date: snapshot.snapshot_date,
    values: Object.fromEntries(snapshot.payload.keywordResults.map((item) => [item.keyword, getKeywordRank(item, metric)])),
  }));
  const keywordOptions = (selectedClinic?.keywords ?? []).map((keyword) => ({ id: keyword, label: keyword }));
  const activeCompareKeyword = (metric: CompareMetric) =>
    selectedClinic?.keywords.includes(compareKeywords[metric]) ? compareKeywords[metric] : selectedClinic?.keywords[0] ?? '';
  const competitorRank = (competitor: TrackedCompetitor, metric: CompareMetric) =>
    metric === 'place' ? competitor.placeRank : competitor.integratedRank;
  const competitorTrend = (metric: CompareMetric) => snapshots.map((snapshot) => {
    const item = snapshot.payload.keywordResults.find((result) => result.keyword === activeCompareKeyword(metric));
    return {
      date: snapshot.snapshot_date,
      values: {
        clinic: getKeywordRank(item, metric),
        ...Object.fromEntries((item?.trackedCompetitors ?? []).map((competitor) => [competitor.id, competitorRank(competitor, metric)])),
      },
    };
  });
  const competitorOptions = [
    { id: 'clinic', label: selectedClinic?.name ?? '내 병원' },
    ...trackedCompetitors.map((competitor) => ({ id: competitor.id, label: competitor.name })),
  ];

  const runAnalysis = useCallback(async (clinic: Clinic, competitorList: SavedCompetitor[] = []) => {
    const placeId = getPlaceId(clinic.place_id);
    if (!placeId || clinic.keywords.length === 0) {
      setNotice('병원 설정에서 플레이스 ID와 검색 키워드를 확인해주세요.');
      return;
    }

    setLoading(true);
    setNotice('');
    setAnalysis(null);

    try {
      const { results } = await readJson<{ results: KeywordSearchResult[] }>(await fetch('/api/integrated-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: clinic.keywords,
          targets: [
            {
              id: 'clinic',
              placeId,
              blogUrl: clinic.blog_url,
              ...(clinic.magazine_url ? { magazineUrl: clinic.magazine_url } : {}),
              ...(clinic.homepage_url ? { homepageUrl: clinic.homepage_url } : {}),
            },
            ...competitorList.map((competitor) => ({
              id: competitor.id,
              placeId: competitor.place_id,
              blogUrl: competitor.blog_url ?? '',
              ...(competitor.homepage_url ? { homepageUrl: competitor.homepage_url } : {}),
            })),
          ],
        }),
      }));

      const keywordResults = results.map((search): KeywordResult => {
        const mine = search.ranks.clinic;
        return {
          keyword: search.keyword,
          placeRank: search.error ? undefined : {
            keyword: search.keyword,
            rank: mine?.placeRank ?? null,
            totalResults: search.places.length,
            found: Boolean(mine?.placeRank),
          },
          integratedRank: mine?.contentRank ?? null,
          magazineRank: mine?.magazineRank ?? null,
          homepageRank: mine?.homepageRank ?? null,
          places: search.places,
          contents: search.contents,
          integratedError: search.error,
          trackedCompetitors: competitorList.map((competitor) => ({
            id: competitor.id,
            name: competitor.name,
            placeId: competitor.place_id,
            placeRank: search.ranks[competitor.id]?.placeRank ?? null,
            // 경쟁 병원 콘텐츠 순위: 블로그·홈페이지 중 가장 높은 순위
            integratedRank: bestRank(search.ranks[competitor.id]?.contentRank, search.ranks[competitor.id]?.homepageRank),
          })),
        };
      });

      const firstPlaces = keywordResults[0]?.places ?? [];
      const result: Analysis = {
        placeName: firstPlaces.find((place) => place.placeId === placeId)?.name,
        keywordResults,
        competitors: firstPlaces.map((place) => ({
          rank: place.rank,
          name: place.isAd ? `${place.name} (광고)` : place.name,
          placeId: place.placeId,
          href: `https://map.naver.com/p/entry/place/${place.placeId}`,
        })),
        completedAt: new Date().toLocaleString('ko-KR'),
      };

      setAnalysis(result);
      setSelectedDate('today');
      const failed = keywordResults.filter((item) => item.integratedError);
      if (failed.length) setNotice(failed[0].integratedError ?? '일부 키워드 검색에 실패했습니다.');
      if (failed.length === keywordResults.length) return;

      const { snapshot } = await readJson<{ snapshot: Snapshot }>(await fetch(`/api/clinics/${clinic.id}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: result }),
      }));
      setSnapshots((previous) => [snapshot, ...previous.filter((item) => item.snapshot_date !== snapshot.snapshot_date)]);
    } catch (error) {
      console.error('Analysis error:', error);
      setNotice(error instanceof Error ? error.message : '분석 결과를 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // 관리자 잠금을 풀면 숨긴 병원까지 함께 받아온다
        const { clinics: savedClinics } = await readJson<{ clinics: Clinic[] }>(await fetch('/api/clinics', {
          headers: adminPassword ? { 'x-admin-password': encodeURIComponent(adminPassword) } : {},
        }));
        if (!active) return;
        setClinics(savedClinics);
        if (!savedClinics.length) setActiveTab('manage');
        setSelectedClinicId((previous) => savedClinics.some((clinic) => clinic.id === previous) ? previous : savedClinics[0]?.id ?? '');
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : '병원 목록을 불러오지 못했습니다.');
      } finally {
        if (active) setInitializing(false);
      }
    })();

    return () => { active = false; };
  }, [adminPassword]);

  useEffect(() => {
    if (!selectedClinic) return;
    let active = true;
    const clinic = selectedClinic;
    setForm(toClinicForm(clinic));
    setSelectedDate('today');
    setAnalysis(null);
    setSnapshots([]);
    setLoading(true);

    void (async () => {
      try {
        const [historyResponse, competitorResponse] = await Promise.all([
          fetch(`/api/clinics/${clinic.id}/history?days=90`),
          fetch(`/api/clinics/${clinic.id}/competitors`),
        ]);
        const [{ snapshots: savedSnapshots, today }, { competitors: savedCompetitors }] = await Promise.all([
          readJson<{ snapshots: Snapshot[]; today: string }>(historyResponse),
          readJson<{ competitors: SavedCompetitor[] }>(competitorResponse),
        ]);
        if (!active) return;
        setSnapshots(savedSnapshots);
        setTrackedCompetitors(savedCompetitors);
        const todaySnapshot = savedSnapshots.find((snapshot) => snapshot.snapshot_date === today);
        if (todaySnapshot) {
          setAnalysis(todaySnapshot.payload);
          setLoading(false);
        } else {
          await runAnalysis(clinic, savedCompetitors);
        }
      } catch (error) {
        if (active) {
          setNotice(error instanceof Error ? error.message : '순위 기록을 불러오지 못했습니다.');
          setLoading(false);
        }
      }
    })();

    return () => { active = false; };
  }, [selectedClinicId, runAnalysis]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keywords = getKeywords(form.keywords);
    if (!form.name.trim() || !form.blogUrl.trim() || !getPlaceId(form.placeId) || keywords.length === 0) {
      setNotice('병원명, 플레이스 ID, 공식 블로그, 검색 키워드를 모두 확인해주세요.');
      return;
    }
    if (keywords.length > 20) {
      setNotice('병원당 검색 키워드는 최대 20개까지 등록할 수 있습니다.');
      return;
    }

    setSaving(true);
    setNotice('');
    try {
      const body = {
        ...(selectedClinicId ? { id: selectedClinicId } : {}),
        name: form.name.trim(),
        placeId: getPlaceId(form.placeId),
        blogUrl: form.blogUrl.trim(),
        magazineUrl: form.magazineUrl.trim(),
        homepageUrl: form.homepageUrl.trim(),
        nameAliases: getKeywords(form.nameAliases),
        isHidden: form.isHidden,
        keywords,
      };
      const { clinic } = await readJson<{ clinic: Clinic }>(await adminFetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));

      setClinics((previous) => previous.some((item) => item.id === clinic.id)
        ? previous.map((item) => item.id === clinic.id ? clinic : item)
        : [...previous, clinic].sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      const selectionChanged = clinic.id !== selectedClinicId;
      setSelectedClinicId(clinic.id);
      setForm(toClinicForm(clinic));
      // 저장 후 분석 결과를 바로 볼 수 있게 첫 탭으로 이동
      setActiveTab('place');
      if (!selectionChanged) await runAnalysis(clinic, trackedCompetitors);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '병원 정보를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectClinic = (clinicId: string) => {
    setNotice('');
    if (!clinicId) {
      setSelectedClinicId('');
      setForm(emptyForm);
      setAnalysis(null);
      setSnapshots([]);
      setTrackedCompetitors([]);
      return;
    }
    setSelectedClinicId(clinicId);
  };

  const handleNewClinic = () => {
    setSelectedClinicId('');
    setForm(emptyForm);
    setAnalysis(null);
    setSnapshots([]);
    setTrackedCompetitors([]);
    setNotice('');
  };

  const handleSaveCompetitor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClinic) {
      setNotice('먼저 기준이 될 병원을 저장하고 선택해주세요.');
      return;
    }

    const placeId = getPlaceId(competitorForm.placeId);
    if (!competitorForm.name.trim() || !placeId || (!competitorForm.blogUrl.trim() && !competitorForm.homepageUrl.trim())) {
      setNotice('경쟁 병원명, 플레이스 ID, 블로그나 홈페이지 주소를 입력해주세요.');
      return;
    }
    if (placeId === selectedClinic.place_id) {
      setNotice('기준 병원과 다른 플레이스 ID를 입력해주세요.');
      return;
    }

    setSaving(true);
    setNotice('');
    try {
      const { competitor } = await readJson<{ competitor: SavedCompetitor }>(await adminFetch(`/api/clinics/${selectedClinic.id}/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingCompetitorId ? { id: editingCompetitorId } : {}),
          name: competitorForm.name.trim(),
          placeId,
          blogUrl: competitorForm.blogUrl.trim(),
          homepageUrl: competitorForm.homepageUrl.trim(),
        }),
      }));
      const updatedCompetitors = trackedCompetitors.some((item) => item.id === competitor.id)
        ? trackedCompetitors.map((item) => item.id === competitor.id ? competitor : item).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        : [...trackedCompetitors, competitor].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setTrackedCompetitors(updatedCompetitors);
      setCompetitorForm(emptyCompetitorForm);
      setEditingCompetitorId('');
      setNotice('경쟁 병원을 저장했습니다. 순위를 업데이트합니다.');
      await runAnalysis(selectedClinic, updatedCompetitors);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '경쟁 병원을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCompetitor = (competitor: SavedCompetitor) => {
    setEditingCompetitorId(competitor.id);
    setCompetitorForm({ name: competitor.name, placeId: competitor.place_id, blogUrl: competitor.blog_url ?? '', homepageUrl: competitor.homepage_url ?? '' });
  };

  const handleDeleteCompetitor = async (competitor: SavedCompetitor) => {
    if (!selectedClinic || !window.confirm(`${competitor.name}을(를) 경쟁 병원 목록에서 삭제할까요?`)) return;
    try {
      await readJson<{ success: boolean }>(await adminFetch(`/api/clinics/${selectedClinic.id}/competitors/${competitor.id}`, { method: 'DELETE' }));
      const updatedCompetitors = trackedCompetitors.filter((item) => item.id !== competitor.id);
      setTrackedCompetitors(updatedCompetitors);
      setNotice('경쟁 병원을 삭제했습니다. 순위를 업데이트합니다.');
      await runAnalysis(selectedClinic, updatedCompetitors);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '경쟁 병원을 삭제하지 못했습니다.');
    }
  };

  const handleDeleteClinic = async () => {
    if (!selectedClinic || !window.confirm(`${selectedClinic.name} 병원과 저장된 순위 기록을 삭제할까요?`)) return;
    try {
      await readJson<{ success: boolean }>(await adminFetch(`/api/clinics/${selectedClinic.id}`, { method: 'DELETE' }));
      const remaining = clinics.filter((clinic) => clinic.id !== selectedClinic.id);
      setClinics(remaining);
      setSelectedClinicId(remaining[0]?.id ?? '');
      if (!remaining.length) {
        setForm(emptyForm);
        setTrackedCompetitors([]);
        setSnapshots([]);
        setAnalysis(null);
      }
      setNotice('병원과 순위 기록을 삭제했습니다.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '병원을 삭제하지 못했습니다.');
    }
  };

  const selectSnapshot = (snapshot: Snapshot) => {
    setSelectedDate(snapshot.snapshot_date);
    setActiveTab('place');
  };

  const renderMentions = (analysis: Analysis) => {
    const clinics = [
      { id: 'clinic', name: selectedClinic?.name ?? '', names: selectedClinic ? clinicNames(selectedClinic) : [] },
      ...trackedCompetitors.map((competitor) => ({ id: competitor.id, name: competitor.name, names: [competitor.name] })),
    ];
    const rows = analysis.keywordResults.map((item) => ({
      item,
      mentions: item.contents ? clinics.map((clinic) => getNameMentions(item, clinic.names)) : null,
    }));
    const totals = clinics.map((_, index) => rows.reduce((sum, row) => sum + (row.mentions?.[index].length ?? 0), 0));
    const cellTitle = (mentions: ContentItem[]) => mentions.map((content) => `${content.rank}. ${content.title}`).join('\n') || undefined;
    return (
      <div className="list-card competitor-card mentions-card">
        <div className="list-heading"><div><span className="section-kicker">NAME MENTIONS</span><h3>상호명 노출 비교</h3></div></div>
        <div className="tracked-rank-table-wrap">
          <table className="history-table compare-table">
            <thead><tr>
              <th>키워드</th>
              {clinics.map((clinic, index) => <th key={clinic.id}><span className={index === 0 ? 'compare-head mine' : 'compare-head'}>{clinic.name}</span></th>)}
            </tr></thead>
            <tbody>
              {rows.map(({ item, mentions }) => (
                <tr key={item.keyword}>
                  <td>{item.keyword}</td>
                  {clinics.map((clinic, index) => (
                    <td key={clinic.id} title={mentions ? cellTitle(mentions[index]) : undefined}>
                      {!mentions ? <span className="rank-out">-</span>
                        : index === 0 ? <strong className="compare-mine">{mentions[0].length}개</strong>
                          : <MentionGap mine={mentions[0].length} theirs={mentions[index].length} />}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total-row">
                <td>합계</td>
                {clinics.map((clinic, index) => (
                  <td key={clinic.id}>{index === 0 ? <strong className="compare-mine">{totals[0]}개</strong> : <MentionGap mine={totals[0]} theirs={totals[index]} />}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="result-footnote">통합검색 1페이지에서 콘텐츠로 센 항목(광고·플레이스·웹사이트 제외) 중 블로그명·제목·설명에 병원명이 들어간 개수입니다. 띄어쓰기는 무시하며, 숫자에 마우스를 올리면 해당 제목을 볼 수 있습니다.</p>
      </div>
    );
  };

  const renderComparison = (analysis: Analysis, metric: CompareMetric) => {
    const label = metric === 'place' ? '플레이스' : '콘텐츠';
    return (
      <>
        <div className="list-card competitor-card">
          <div className="list-heading"><div><span className="section-kicker">{metric === 'place' ? 'PLACE' : 'CONTENT'} COMPARISON</span><h3>{label} 키워드별 순위 비교</h3></div></div>
          <div className="tracked-rank-table-wrap">
            <table className="history-table compare-table">
              <thead><tr>
                <th>키워드</th>
                <th><span className="compare-head mine">{selectedClinic?.name ?? '내 병원'}</span></th>
                {trackedCompetitors.map((competitor) => <th key={competitor.id}><span className="compare-head">{competitor.name}</span></th>)}
              </tr></thead>
              <tbody>{analysis.keywordResults.map((item) => {
                const mine = getKeywordRank(item, metric);
                return (
                  <tr key={item.keyword}>
                    <td>{item.keyword}</td>
                    <td><strong className="compare-mine">{mine ? `${mine}위` : '순위권 외'}</strong></td>
                    {trackedCompetitors.map((competitor) => {
                      const tracked = item.trackedCompetitors?.find((entry) => entry.id === competitor.id);
                      return <td key={competitor.id}>{tracked
                        ? <RankGap mine={mine} theirs={competitorRank(tracked, metric)} />
                        : <span className="rank-out">-</span>}</td>;
                    })}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <p className="result-footnote">{metric === 'place'
            ? '통합검색 플레이스 영역에서 광고를 제외한 노출 순서 기준입니다.'
            : '통합검색 1페이지 콘텐츠 순서 기준입니다. 내 병원은 공식 블로그·웹 매거진·홈페이지 중 가장 높은 순위, 경쟁 병원은 블로그·홈페이지 중 가장 높은 순위입니다.'} &quot;-&quot;는 경쟁 병원을 등록하기 전에 분석한 결과입니다.</p>
        </div>
        <RankTrendChart title={`${label} 순위 추세 비교`} kicker="COMPETITOR TREND" data={competitorTrend(metric)} options={competitorOptions} defaultCount={8}
          actions={<select className="compare-select" value={activeCompareKeyword(metric)} aria-label={`${label} 비교 키워드`}
            onChange={(event) => setCompareKeywords((previous) => ({ ...previous, [metric]: event.target.value }))}>
            {selectedClinic?.keywords.map((keyword) => <option key={keyword} value={keyword}>{keyword}</option>)}
          </select>} />
      </>
    );
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow"><span className="live-dot" /> NAVER SEARCH INSIGHT</div>
          <h1>{selectedClinic ? `${selectedClinic.name} 플레이스 & 통합검색 모니터링` : '병원 검색 순위 대시보드'}</h1>
          <p>플레이스 · 통합검색 콘텐츠 · 경쟁 병원의 검색 현황을 한눈에 확인하세요.</p>
          {/* 인쇄물에만 표시: 화면 오른쪽 위 날짜는 인쇄 때 숨겨진다 */}
          <p className="print-only print-dates">
            분석 기준일 {selectedDate === 'today' ? today : formatDate(selectedDate)}
            {displayedAnalysis?.completedAt && ` (분석 시각 ${displayedAnalysis.completedAt})`} · 출력일 {today}
          </p>
        </div>
        <div className="header-actions">
          {today && <div className="header-date">{today}</div>}
          <div className="header-status">
            <span className={loading ? 'status-dot is-loading' : 'status-dot'} />
            {initializing ? '불러오는 중' : loading ? '분석 중' : !selectedClinic ? '분석 대기' : notice ? '확인 필요' : '오늘 분석 완료'}
          </div>
          <button type="button" className="pdf-button" onClick={() => setPrintAll(true)} disabled={!displayedAnalysis || printAll}>PDF로 저장</button>
        </div>
      </header>

      <section className="settings-card picker-card no-print">
        <div className="clinic-picker">
          <label htmlFor="clinic-select">분석할 병원</label>
          <select id="clinic-select" value={selectedClinicId} onChange={(event) => handleSelectClinic(event.target.value)} disabled={initializing || clinics.length === 0}>
            {clinics.length === 0 && <option value="">등록된 병원이 없습니다</option>}
            {clinics.length > 0 && !selectedClinicId && <option value="">새 병원 등록 중</option>}
            {clinics.map((clinic) => <option value={clinic.id} key={clinic.id}>{clinic.name}{clinic.is_hidden ? ' (숨김)' : ''}</option>)}
          </select>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>

      <section className="results-section">
        <div className="results-toolbar no-print">
          <div className="tabs" role="tablist" aria-label="분석 결과">
            <button role="tab" aria-selected={activeTab === 'place'} className={activeTab === 'place' ? 'tab active' : 'tab'} onClick={() => setActiveTab('place')}><span className="tab-index">01</span> 플레이스 &amp; 콘텐츠 순위</button>
            <button role="tab" aria-selected={activeTab === 'content'} className={activeTab === 'content' ? 'tab active' : 'tab'} onClick={() => setActiveTab('content')}><span className="tab-index">02</span> 통합검색 콘텐츠</button>
            <button role="tab" aria-selected={activeTab === 'competitor'} className={activeTab === 'competitor' ? 'tab active' : 'tab'} onClick={() => setActiveTab('competitor')}><span className="tab-index">03</span> 경쟁 병원</button>
            <button role="tab" aria-selected={activeTab === 'history'} className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setActiveTab('history')}><span className="tab-index">04</span> 랭크 히스토리</button>
            <button role="tab" aria-selected={activeTab === 'manage'} className={activeTab === 'manage' ? 'tab active' : 'tab'} onClick={() => setActiveTab('manage')}><span className="tab-index">05</span> 병원 관리</button>
          </div>
        </div>

        {loading && activeTab !== 'manage' && <div className="loading-panel"><span className="spinner large" /><div><strong>네이버 검색 결과를 모으고 있습니다</strong><p>키워드 수와 네이버 응답 속도에 따라 잠시 걸릴 수 있습니다.</p></div></div>}
        {!loading && !displayedAnalysis && activeTab !== 'history' && activeTab !== 'manage' && <div className="empty-panel"><div className="empty-icon">⌕</div><strong>{selectedDate === 'today' ? '분석을 시작해보세요' : `${formatDate(selectedDate)} 기록이 없습니다`}</strong><p>{selectedClinic ? '오늘의 순위가 저장되면 날짜별 기록에 쌓입니다.' : '05 병원 관리 탭에서 병원을 등록하면 검색 순위를 자동으로 확인합니다.'}</p></div>}

        {printAll && <h2 className="print-section-title first">01 플레이스 &amp; 콘텐츠 순위</h2>}
        {!loading && displayedAnalysis && (activeTab === 'place' || printAll) && (
          <div className="rank-rows">
            {displayedAnalysis.keywordResults.map((item) => (
              <div className="rank-pair" key={item.keyword}>
                <article className="metric-card">
                  <div className="metric-topline"><span>네이버 플레이스</span><span className="metric-mark green">P</span></div>
                  <h3>{item.keyword}</h3>
                  <Rank value={item.placeRank?.rank} />
                  <p>{item.integratedError ?? (item.placeRank?.found
                    ? `플레이스 영역 ${item.placeRank.totalResults}곳 중 (광고 제외)`
                    : item.placeRank ? (item.placeRank.totalResults ? '통합검색 플레이스 영역에 노출되지 않았습니다' : '통합검색에 플레이스 영역이 없습니다') : '순위 데이터를 확인할 수 없습니다')}</p>
                </article>
                <article className="metric-card">
                  <div className="metric-topline"><span>네이버 통합검색</span><span className="metric-mark navy">N</span></div>
                  <h3>{item.keyword}</h3>
                  <div className="dual-rank">
                    <div className="blog"><small>공식 블로그</small><Rank value={item.integratedRank} /></div>
                    {selectedClinic?.magazine_url && <div className="magazine"><small>웹 매거진</small><Rank value={item.magazineRank} /></div>}
                    {selectedClinic?.homepage_url && <div className="homepage"><small>홈페이지</small><Rank value={item.homepageRank} /></div>}
                    {item.contents && selectedClinic && (
                      <div className="mentions" title={getNameMentions(item, clinicNames(selectedClinic)).map((content) => `${content.rank}. ${content.title}`).join('\n') || undefined}>
                        <small>상호명</small><strong className="rank-value">{getNameMentions(item, clinicNames(selectedClinic)).length}<small>개</small></strong>
                      </div>
                    )}
                  </div>
                  <p>{item.integratedError ?? `1페이지 콘텐츠 ${item.contents?.length ?? 0}개 기준`}</p>
                </article>
              </div>
            ))}
            {displayedAnalysis.placeName && <p className="result-footnote">대상 플레이스: {displayedAnalysis.placeName}</p>}
            <p className="result-footnote">플레이스 순위는 통합검색 플레이스 영역에서 광고를 제외한 노출 순서입니다. 통합검색 순위는 1페이지에서 광고·플레이스·웹사이트를 제외한 콘텐츠(블로그·카페·지식iN 등) 중 공식 블로그·웹 매거진·홈페이지의 순서입니다.</p>
          </div>
        )}

        {/* 순위 변동 그래프: 01 탭 아래 (인쇄할 때도 01 섹션에 포함) */}
        {selectedClinic && (activeTab === 'place' || printAll) && <>
          <RankTrendChart title="플레이스 순위 변동" data={keywordTrend('place')} options={keywordOptions} />
          <RankTrendChart title="콘텐츠 순위 변동" data={keywordTrend('content')} options={keywordOptions}
            footnote="발행한 콘텐츠 중 네이버 통합검색에 가장 높은 순위로 추이를 기록합니다." />
        </>}

        {printAll && <h2 className="print-section-title">02 통합검색 콘텐츠</h2>}
        {!loading && displayedAnalysis && (activeTab === 'content' || printAll) && (
          <div className="keyword-panels">
            {displayedAnalysis.keywordResults.map((item) => {
              const blogKey = selectedClinic ? getAccountKey(selectedClinic.blog_url) : '';
              const magazineKey = selectedClinic?.magazine_url ? getAccountKey(selectedClinic.magazine_url) : '';
              const homepageKey = selectedClinic?.homepage_url ? getAccountKey(selectedClinic.homepage_url) : '';
              return (
                <article className="list-card" key={item.keyword}>
                  <div className="list-heading"><div><span className="section-kicker">INTEGRATED SEARCH</span><h3>{item.keyword}</h3></div>
                    <ContentRanks blogRank={item.integratedRank} magazineRank={item.magazineRank} homepageRank={item.homepageRank}
                      showMagazine={Boolean(magazineKey)} showHomepage={Boolean(homepageKey)} /></div>
                  {item.contents?.length ? <div className="result-list">{item.contents.slice(0, 15).map((content) => (
                    <a className="result-row" key={`${item.keyword}-${content.rank}`} href={content.link} target="_blank" rel="noreferrer">
                      <span className="row-rank">{String(content.rank).padStart(2, '0')}</span>
                      <span className="row-main"><strong>{content.title}
                        {content.key === blogKey && <span className="own-tag blog">공식 블로그</span>}
                        {magazineKey && content.key === magazineKey && <span className="own-tag magazine">웹 매거진</span>}
                        {homepageKey && content.key === homepageKey && <span className="own-tag homepage">홈페이지</span>}
                      </strong><small>{CONTENT_TYPE_LABELS[content.type]} · {content.key}</small></span>
                      <span className="row-arrow">↗</span>
                    </a>
                  ))}</div> : <p className="no-results">{item.integratedError ?? '통합검색 콘텐츠 결과가 없습니다.'}</p>}
                </article>
              );
            })}
            <p className="result-footnote">통합검색 1페이지에서 광고·플레이스·웹사이트를 제외한 콘텐츠의 노출 순서입니다. 1페이지에 없으면 순위권 외로 표시합니다.</p>
          </div>
        )}

        {selectedClinic && activeTab === 'content' && !printAll && <>
          <RankTrendChart title="플레이스 순위 변동" data={keywordTrend('place')} options={keywordOptions} />
          <RankTrendChart title="콘텐츠 순위 변동" data={keywordTrend('content')} options={keywordOptions}
            footnote="발행한 콘텐츠 중 네이버 통합검색에 가장 높은 순위로 추이를 기록합니다." />
        </>}

        {printAll && <h2 className="print-section-title">03 경쟁 병원</h2>}
        {!loading && displayedAnalysis && (activeTab === 'competitor' || printAll) && (
          <>
            {trackedCompetitors.length > 0 ? <>
              {renderComparison(displayedAnalysis, 'place')}
              {renderComparison(displayedAnalysis, 'content')}
              {renderMentions(displayedAnalysis)}
            </> : <div className="list-card competitor-card">
              <div className="list-heading"><div><span className="section-kicker">COMPETITOR COMPARISON</span><h3>키워드별 순위 비교</h3></div></div>
              <p className="no-results">위의 &apos;추적할 경쟁 병원&apos;에서 경쟁 병원을 등록하면 플레이스·콘텐츠 순위를 키워드별로 비교합니다.</p>
            </div>}
            {displayedAnalysis.competitors.length > 0 && <div className="list-card competitor-card places-card">
              <div className="list-heading"><div><span className="section-kicker">LOCAL SEARCH LANDSCAPE</span><h3>&ldquo;{selectedClinic?.keywords[0]}&rdquo; 플레이스 상위 병원</h3></div><span className="count-pill">{displayedAnalysis.competitors.length}곳</span></div>
              <div className="competitor-list">{displayedAnalysis.competitors.map((competitor) => {
                const isMine = competitor.placeId === selectedClinic?.place_id;
                return <div className={isMine ? 'competitor-row mine' : 'competitor-row'} key={`${competitor.rank}-${competitor.placeId ?? competitor.name}`}>
                  <span className="competitor-rank">{String(competitor.rank).padStart(2, '0')}</span>
                  <span className="competitor-name">{competitor.name}{isMine && <span className="mine-tag">내 병원</span>}</span>
                  {competitor.href && <a href={competitor.href} target="_blank" rel="noreferrer" className="row-arrow" aria-label={`${competitor.name} 플레이스 열기`}>↗</a>}
                </div>;
              })}</div>
              <p className="result-footnote">경쟁 병원으로 등록할 곳을 고를 때 참고하세요. 플레이스 ID는 ↗ 링크 주소의 숫자입니다.</p>
            </div>}
          </>
        )}


        {activeTab === 'manage' && !adminPassword && (
          <section className="settings-card manage-card lock-card no-print">
            <span className="section-kicker">ADMIN ONLY</span>
            <h2>병원 관리는 관리자만 할 수 있습니다</h2>
            <p>병원 등록·수정·삭제와 경쟁 병원 관리를 하려면 관리자 비밀번호를 입력해주세요. 대시보드 조회는 비밀번호 없이 이용할 수 있습니다.</p>
            <form className="lock-form" onSubmit={(event) => void handleUnlock(event)}>
              <input type="password" value={adminInput} onChange={(event) => setAdminInput(event.target.value)} placeholder="관리자 비밀번호" autoComplete="current-password" required />
              <button type="submit" className="primary-button" disabled={unlocking || !adminInput}>{unlocking ? <><span className="spinner" /> 확인 중...</> : '잠금 해제'}</button>
            </form>
          </section>
        )}

        {activeTab === 'manage' && adminPassword && (
          <section className="settings-card manage-card no-print">
            <div className="section-heading">
              <div>
                <span className="section-kicker">CLINIC MANAGEMENT</span>
                <h2>{selectedClinic ? `${selectedClinic.name} 정보 수정` : '새 병원 등록'}</h2>
              </div>
              <div className="clinic-actions">
                {selectedClinic && <button className="text-button danger-text" type="button" onClick={() => void handleDeleteClinic()}>병원 삭제</button>}
                <button className="text-button" type="button" onClick={handleNewClinic}>+ 새 병원 등록</button>
                <button className="text-button" type="button" onClick={lockAdmin}>잠그기</button>
              </div>
            </div>
            <form onSubmit={handleSave}>
              <div className="settings-grid">
                <label>
                  <span>병원명</span>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="예: 아우라의원" required />
                </label>
                <label>
                  <span>네이버 플레이스 URL 또는 ID</span>
                  <input value={form.placeId} onChange={(event) => setForm({ ...form, placeId: event.target.value })} placeholder="플레이스 URL 또는 숫자 ID" required />
                </label>
                <label>
                  <span>공식 블로그</span>
                  <input value={form.blogUrl} onChange={(event) => setForm({ ...form, blogUrl: event.target.value })} placeholder="blog.naver.com/블로그아이디" required />
                </label>
                <label>
                  <span>웹 매거진 <small>선택</small></span>
                  <input value={form.magazineUrl} onChange={(event) => setForm({ ...form, magazineUrl: event.target.value })} placeholder="웹 매거진 주소 (예: magazine.example.com)" />
                </label>
                <label>
                  <span>홈페이지 <small>선택</small></span>
                  <input value={form.homepageUrl} onChange={(event) => setForm({ ...form, homepageUrl: event.target.value })} placeholder="홈페이지 주소 (예: www.example.com)" />
                </label>
                <label>
                  <span>검색용 상호명 <small>선택 · 쉼표로 구분 · 상호명 개수를 셀 때 병원명과 함께 찾습니다</small></span>
                  <input value={form.nameAliases} onChange={(event) => setForm({ ...form, nameAliases: event.target.value })} placeholder="예: 필한방병원, 필한의원" />
                </label>
                <label className="wide">
                  <span>검색 키워드 <small>쉼표 또는 줄바꿈으로 구분 · 최대 20개</small></span>
                  <input value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} placeholder="강남 피부과, 강남역 피부과" required />
                </label>
              </div>
              <label className="hide-toggle">
                <input type="checkbox" checked={form.isHidden} onChange={(event) => setForm({ ...form, isHidden: event.target.checked })} />
                <span>메인 &lsquo;분석할 병원&rsquo; 목록에서 숨기기 <small>관리자 잠금을 푼 경우에만 목록에 보입니다</small></span>
              </label>
              <div className="settings-footer">
                <p>공용 DB에 저장됩니다. 접속 시 선택 병원을 하루 한 번 자동 분석합니다.</p>
                <button type="submit" className="primary-button" disabled={saving || loading}>
                  {saving || loading ? <><span className="spinner" /> 저장 중...</> : selectedClinic ? '저장하고 분석하기' : '병원 저장하고 분석하기'}
                </button>
              </div>
            </form>
            <div className="tracked-competitors">
              <div className="tracked-heading">
                <div><span className="section-kicker">COMPETITOR TRACKING</span><h3>추적할 경쟁 병원</h3></div>
                <span className="count-pill">{trackedCompetitors.length}곳</span>
              </div>
              <p className="competitor-help">병원마다 플레이스 ID와 블로그·홈페이지 주소(하나 이상)를 등록하면 저장된 키워드의 순위를 함께 비교하고 날짜별로 기록합니다.</p>
              <form className="competitor-form" onSubmit={(event) => void handleSaveCompetitor(event)}>
                <label><span>경쟁 병원명</span><input value={competitorForm.name} onChange={(event) => setCompetitorForm({ ...competitorForm, name: event.target.value })} placeholder="병원명" required disabled={!selectedClinic} /></label>
                <label><span>플레이스 URL 또는 ID</span><input value={competitorForm.placeId} onChange={(event) => setCompetitorForm({ ...competitorForm, placeId: event.target.value })} placeholder="네이버 플레이스 ID" required disabled={!selectedClinic} /></label>
                <label><span>블로그</span><input value={competitorForm.blogUrl} onChange={(event) => setCompetitorForm({ ...competitorForm, blogUrl: event.target.value })} placeholder="blog.naver.com/아이디" disabled={!selectedClinic} /></label>
                <label><span>홈페이지</span><input value={competitorForm.homepageUrl} onChange={(event) => setCompetitorForm({ ...competitorForm, homepageUrl: event.target.value })} placeholder="www.example.com" disabled={!selectedClinic} /></label>
                <button type="submit" className="secondary-button" disabled={!selectedClinic || saving || loading}>{editingCompetitorId ? '수정 저장' : '경쟁 병원 추가'}</button>
                {editingCompetitorId && <button type="button" className="cancel-button" onClick={() => { setEditingCompetitorId(''); setCompetitorForm(emptyCompetitorForm); }}>취소</button>}
              </form>
              {trackedCompetitors.length > 0 && <div className="saved-competitor-list">{trackedCompetitors.map((competitor) => (
                <div className="saved-competitor" key={competitor.id}>
                  <span><strong>{competitor.name}</strong><small>{[`플레이스 ${competitor.place_id}`, competitor.blog_url, competitor.homepage_url].filter(Boolean).join(' · ')}</small></span>
                  <div><button type="button" className="text-button" onClick={() => handleEditCompetitor(competitor)}>수정</button><button type="button" className="text-button danger-text" onClick={() => void handleDeleteCompetitor(competitor)}>삭제</button></div>
                </div>
              ))}</div>}
            </div>
          </section>
        )}

        {printAll && <h2 className="print-section-title">04 랭크 히스토리</h2>}
        {(activeTab === 'history' || printAll) && (
          <section className="history-section">
            <div className="history-heading">
              <div><span className="section-kicker">RANK HISTORY</span><h2>{selectedClinic?.name ?? '병원'} 랭크 히스토리</h2></div>
              <div className="history-controls">
                <div className="trend-metric" role="group" aria-label="기간 단위">
                  {(['day', 'week', 'month'] as const).map((period) => (
                    <button type="button" key={period} className={historyPeriod === period ? 'active' : ''} onClick={() => setHistoryPeriod(period)}>
                      {period === 'day' ? '일간' : period === 'week' ? '주간' : '월간'}
                    </button>
                  ))}
                </div>
                {historyKeys.length > 0 && (
                  <select className="compare-select" value={activeHistoryKey} onChange={(event) => setHistoryKey(event.target.value)} aria-label="조회 기간">
                    {historyKeys.map((key) => <option key={key} value={key}>{formatPeriodKey(key, historyPeriod)}</option>)}
                  </select>
                )}
              </div>
            </div>
            {!selectedClinic && <p className="no-results">병원을 선택하면 순위 기록이 표시됩니다.</p>}
            {selectedClinic && historyKeys.length === 0 && !loading && <p className="no-results">아직 저장된 순위 기록이 없습니다. 오늘 분석 후 날짜별로 기록이 쌓입니다.</p>}
            {selectedClinic && activeHistoryKey && historyPeriod === 'day' && (() => {
              const snapshot = snapshots.find((item) => item.snapshot_date === activeHistoryKey);
              if (!snapshot) return null;
              return (
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead><tr><th>검색 키워드</th><th>플레이스</th><th>통합검색</th></tr></thead>
                    <tbody>{snapshot.payload.keywordResults.map((item) => (
                      <tr key={item.keyword}>
                        <td>{item.keyword}</td>
                        <td>{item.placeRank?.rank ? `${item.placeRank.rank}위` : '순위권 외'}</td>
                        <td><ContentRanks blogRank={item.integratedRank} magazineRank={item.magazineRank} homepageRank={item.homepageRank}
                          showMagazine={Boolean(selectedClinic.magazine_url)} showHomepage={Boolean(selectedClinic.homepage_url)} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <button type="button" className="text-button history-open" onClick={() => selectSnapshot(snapshot)}>이날 분석 결과 자세히 보기 →</button>
                </div>
              );
            })()}
            {selectedClinic && activeHistoryKey && historyPeriod !== 'day' && (() => {
              const byDate = new Map(snapshots.map((snapshot) => [snapshot.snapshot_date, snapshot]));
              // 주간은 요일별, 월간은 주차별로 묶어서 그 기간의 가장 높은 순위를 표시
              const columns = historyPeriod === 'week'
                ? Array.from({ length: 7 }, (_, index) => {
                  const date = shiftDate(activeHistoryKey, index);
                  return { key: date, label: `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${formatMonthDay(date)}`, dates: [date] };
                })
                : (() => {
                  const monthStart = `${activeHistoryKey}-01`;
                  const result: { key: string; label: string; dates: string[] }[] = [];
                  for (let weekStart = getWeekStart(monthStart); weekStart.slice(0, 7) <= activeHistoryKey; weekStart = shiftDate(weekStart, 7)) {
                    const dates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)).filter((date) => date.startsWith(activeHistoryKey));
                    result.push({ key: weekStart, label: `${result.length + 1}주차 (${formatMonthDay(dates[0])}~${formatMonthDay(dates[dates.length - 1])})`, dates });
                  }
                  return result;
                })();
              const allDates = columns.flatMap((column) => column.dates);
              const cell = (keyword: string, dates: string[], metric: CompareMetric) => {
                const recorded = dates.flatMap((date) => byDate.get(date) ?? []);
                if (!recorded.length) return <span className="rank-out">-</span>;
                const rank = bestRank(...recorded.map((snapshot) => getKeywordRank(snapshot.payload.keywordResults.find((item) => item.keyword === keyword), metric)));
                return rank ? `${rank}위` : <span className="rank-out">순위권 외</span>;
              };
              return (['place', 'content'] as const).map((metric) => (
                <div className="history-table-wrap period-block" key={metric}>
                  <h3 className="period-title">{metric === 'place' ? '플레이스 순위' : '콘텐츠 순위'}</h3>
                  <table className="history-table period-table">
                    <thead><tr>
                      <th>검색 키워드</th>
                      {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                      <th>{historyPeriod === 'week' ? '주간 최고' : '월간 최고'}</th>
                    </tr></thead>
                    <tbody>{selectedClinic.keywords.map((keyword) => (
                      <tr key={keyword}>
                        <td>{keyword}</td>
                        {columns.map((column) => <td key={column.key}>{cell(keyword, column.dates, metric)}</td>)}
                        <td><strong>{cell(keyword, allDates, metric)}</strong></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ));
            })()}
            <p className="result-footnote">{historyPeriod === 'day'
              ? '선택한 날짜의 분석 결과입니다.'
              : `${historyPeriod === 'week' ? '요일' : '주차'}별로 기록된 가장 높은 순위입니다. 콘텐츠 순위는 공식 블로그·웹 매거진·홈페이지 중 가장 높은 순위입니다. "-"는 분석 기록이 없는 기간입니다.`} 최근 90일까지 조회할 수 있습니다.</p>
          </section>
        )}
      </section>
      <footer className="dashboard-footer">검색 결과는 네이버의 노출·수집 시점 및 검색 환경에 따라 달라질 수 있습니다.</footer>
    </main>
  );
}
