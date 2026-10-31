'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

interface Clinic {
  id: string;
  name: string;
  place_id: string;
  blog_url: string;
  keywords: string[];
}

interface ClinicForm {
  name: string;
  placeId: string;
  blogUrl: string;
  keywords: string;
}

interface SavedCompetitor {
  id: string;
  clinic_id: string;
  name: string;
  place_id: string;
  blog_url: string;
}

interface CompetitorForm {
  name: string;
  placeId: string;
  blogUrl: string;
}

interface PlaceRank {
  keyword: string;
  rank: number | null;
  totalResults: number;
  found: boolean;
}

interface BlogResult {
  rank: number;
  title: string;
  link: string;
  bloggername: string;
  postdate: string;
}

interface IntegratedResult {
  rank: number;
  title: string;
  link: string;
  placeId?: string;
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
  blogRank: number | null;
  integratedRank: number | null;
}

interface KeywordResult {
  keyword: string;
  placeRank?: PlaceRank;
  blogRank?: number | null;
  blogResults?: BlogResult[];
  integratedRank?: number | null;
  integratedResults?: IntegratedResult[];
  trackedCompetitors?: TrackedCompetitor[];
  blogError?: string;
  integratedError?: string;
}

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

type Tab = 'place' | 'blog' | 'competitor';

const emptyForm: ClinicForm = { name: '', placeId: '', blogUrl: '', keywords: '' };
const emptyCompetitorForm: CompetitorForm = { name: '', placeId: '', blogUrl: '' };

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

export default function DashboardClient() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [trackedCompetitors, setTrackedCompetitors] = useState<SavedCompetitor[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [form, setForm] = useState<ClinicForm>(emptyForm);
  const [competitorForm, setCompetitorForm] = useState<CompetitorForm>(emptyCompetitorForm);
  const [editingCompetitorId, setEditingCompetitorId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('place');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedDate, setSelectedDate] = useState('today');
  const [historyDays, setHistoryDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [initializing, setInitializing] = useState(true);

  const selectedClinic = clinics.find((clinic) => clinic.id === selectedClinicId);
  const displayedAnalysis = selectedDate === 'today'
    ? analysis
    : snapshots.find((snapshot) => snapshot.snapshot_date === selectedDate)?.payload ?? null;
  const filteredSnapshots = useMemo(() => snapshots.slice(0, historyDays), [snapshots, historyDays]);

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
      const placeRequest = fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: clinic.keywords, placeUrl: placeId }),
      }).then((response) => readJson<{
        success: boolean;
        placeName?: string;
        keywordRanks?: PlaceRank[];
        message: string;
      }>(response));

      const competitorRequest = competitorList.length
        ? Promise.resolve({ results: [] as Competitor[] })
        : fetch('/api/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: clinic.keywords[0], placeId, topN: 20 }),
        }).then((response) => readJson<{ results: Competitor[] }>(response));

      const trackedRankRequest = competitorList.length
        ? fetch('/api/competitor-ranks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords: clinic.keywords,
            targets: [
              { id: placeId, name: clinic.name },
              ...competitorList.map((competitor) => ({ id: competitor.place_id, name: competitor.name })),
            ],
          }),
        }).then((response) => readJson<{ rankings: Record<string, Record<string, number | null>> }>(response))
        : Promise.resolve<{ rankings: Record<string, Record<string, number | null>> }>({ rankings: {} });

      const searchRequests = clinic.keywords.map(async (keyword): Promise<KeywordResult> => {
        const [blogResponse, integratedResponse] = await Promise.allSettled([
          fetch(`/api/blog-search?keyword=${encodeURIComponent(keyword)}&display=100`).then((response) =>
            readJson<{ results: BlogResult[] }>(response)),
          fetch('/api/integrated-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, placeId, clinicName: clinic.name }),
          }).then((response) => readJson<{ rank: number | null; results: (IntegratedResult & { placeId?: string })[] }>(response)),
        ]);

        const result: KeywordResult = { keyword };
        result.trackedCompetitors = competitorList.map((competitor) => ({
          id: competitor.id,
          name: competitor.name,
          placeId: competitor.place_id,
          placeRank: null,
          blogRank: null,
          integratedRank: null,
        }));
        if (blogResponse.status === 'fulfilled') {
          result.blogResults = blogResponse.value.results;
          result.blogRank = result.blogResults.find((item) =>
            item.link.toLowerCase().includes(clinic.blog_url.trim().toLowerCase()))?.rank ?? null;
          result.trackedCompetitors.forEach((competitor) => {
            const savedCompetitor = competitorList.find((item) => item.id === competitor.id);
            if (savedCompetitor) {
              competitor.blogRank = result.blogResults?.find((item) =>
                item.link.toLowerCase().includes(savedCompetitor.blog_url.trim().toLowerCase()))?.rank ?? null;
            }
          });
        } else {
          result.blogError = blogResponse.reason instanceof Error ? blogResponse.reason.message : '블로그 검색에 실패했습니다.';
        }

        if (integratedResponse.status === 'fulfilled') {
          result.integratedRank = integratedResponse.value.rank;
          result.integratedResults = integratedResponse.value.results;
        } else {
          result.integratedError = integratedResponse.reason instanceof Error ? integratedResponse.reason.message : '통합검색에 실패했습니다.';
        }
        const integratedRanks = new Map((integratedResponse.status === 'fulfilled' ? integratedResponse.value.results : [])
          .filter((item): item is IntegratedResult & { placeId: string } => Boolean(item.placeId))
          .map((item) => [item.placeId, item.rank]));
        result.trackedCompetitors?.forEach((competitor) => {
          competitor.integratedRank = integratedRanks.get(competitor.placeId) ?? null;
        });
        return result;
      });

      const [placeResult, competitorResult, trackedRanksResult, ...keywordResults] = await Promise.allSettled([
        placeRequest,
        competitorRequest,
        trackedRankRequest,
        ...searchRequests,
      ]);

      let placeName: string | undefined;
      if (placeResult.status === 'fulfilled') {
        placeName = placeResult.value.placeName;
        const placeRanks = new Map((placeResult.value.keywordRanks ?? []).map((item) => [item.keyword, item]));
        keywordResults.forEach((result) => {
          if (result.status === 'fulfilled') result.value.placeRank = placeRanks.get(result.value.keyword);
        });
      } else {
        setNotice(placeResult.reason instanceof Error ? placeResult.reason.message : '플레이스 순위 검색에 실패했습니다.');
      }

      if (trackedRanksResult.status === 'fulfilled') {
        keywordResults.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const keywordRanks = trackedRanksResult.value.rankings[result.value.keyword] ?? {};
          result.value.trackedCompetitors?.forEach((competitor) => {
            competitor.placeRank = keywordRanks[competitor.placeId] ?? null;
          });
        });
      } else if (competitorList.length) {
        console.error('Tracked competitor rank search failed:', trackedRanksResult.reason);
      }

      const result: Analysis = {
        placeName,
        keywordResults: keywordResults.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []),
        competitors: competitorResult.status === 'fulfilled' ? competitorResult.value.results : [],
        competitorError: competitorResult.status === 'rejected'
          ? competitorResult.reason instanceof Error ? competitorResult.reason.message : '경쟁 병원 검색에 실패했습니다.'
          : undefined,
        trackedRankError: trackedRanksResult.status === 'rejected'
          ? trackedRanksResult.reason instanceof Error ? trackedRanksResult.reason.message : '등록한 경쟁 병원 순위 검색에 실패했습니다.'
          : undefined,
        completedAt: new Date().toLocaleString('ko-KR'),
      };

      setAnalysis(result);
      setSelectedDate('today');
      if (placeResult.status === 'rejected') return;

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
        const { clinics: savedClinics } = await readJson<{ clinics: Clinic[] }>(await fetch('/api/clinics'));
        if (!active) return;
        setClinics(savedClinics);
        if (savedClinics.length) {
          setSelectedClinicId(savedClinics[0].id);
          setForm({
            name: savedClinics[0].name,
            placeId: savedClinics[0].place_id,
            blogUrl: savedClinics[0].blog_url,
            keywords: savedClinics[0].keywords.join(', '),
          });
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : '병원 목록을 불러오지 못했습니다.');
      } finally {
        if (active) setInitializing(false);
      }
    })();

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedClinic) return;
    let active = true;
    const clinic = selectedClinic;
    setForm({ name: clinic.name, placeId: clinic.place_id, blogUrl: clinic.blog_url, keywords: clinic.keywords.join(', ') });
    setSelectedDate('today');
    setAnalysis(null);
    setSnapshots([]);
    setLoading(true);

    void (async () => {
      try {
        const [historyResponse, competitorResponse] = await Promise.all([
          fetch(`/api/clinics/${clinic.id}/history?days=30`),
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
      setNotice('병원명, 플레이스 ID, 블로그 주소, 검색 키워드를 모두 확인해주세요.');
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
        keywords,
      };
      const { clinic } = await readJson<{ clinic: Clinic }>(await fetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));

      setClinics((previous) => previous.some((item) => item.id === clinic.id)
        ? previous.map((item) => item.id === clinic.id ? clinic : item)
        : [...previous, clinic].sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      const selectionChanged = clinic.id !== selectedClinicId;
      setSelectedClinicId(clinic.id);
      setForm({ name: clinic.name, placeId: clinic.place_id, blogUrl: clinic.blog_url, keywords: clinic.keywords.join(', ') });
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
    if (!competitorForm.name.trim() || !placeId || !competitorForm.blogUrl.trim()) {
      setNotice('경쟁 병원명, 플레이스 ID, 블로그 주소를 모두 입력해주세요.');
      return;
    }
    if (placeId === selectedClinic.place_id) {
      setNotice('기준 병원과 다른 플레이스 ID를 입력해주세요.');
      return;
    }

    setSaving(true);
    setNotice('');
    try {
      const { competitor } = await readJson<{ competitor: SavedCompetitor }>(await fetch(`/api/clinics/${selectedClinic.id}/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingCompetitorId ? { id: editingCompetitorId } : {}),
          name: competitorForm.name.trim(),
          placeId,
          blogUrl: competitorForm.blogUrl.trim(),
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
    setCompetitorForm({ name: competitor.name, placeId: competitor.place_id, blogUrl: competitor.blog_url });
  };

  const handleDeleteCompetitor = async (competitor: SavedCompetitor) => {
    if (!selectedClinic || !window.confirm(`${competitor.name}을(를) 경쟁 병원 목록에서 삭제할까요?`)) return;
    try {
      await readJson<{ success: boolean }>(await fetch(`/api/clinics/${selectedClinic.id}/competitors/${competitor.id}`, { method: 'DELETE' }));
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
      await readJson<{ success: boolean }>(await fetch(`/api/clinics/${selectedClinic.id}`, { method: 'DELETE' }));
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

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow"><span className="live-dot" /> NAVER SEARCH INSIGHT</div>
          <h1>병원 검색 순위 대시보드</h1>
          <p>플레이스 · 블로그 · 경쟁 병원의 검색 현황을 한눈에 확인하세요.</p>
        </div>
        <div className="header-actions">
          <div className="header-status">
            <span className={loading ? 'status-dot is-loading' : 'status-dot'} />
            {initializing ? '불러오는 중' : loading ? '분석 중' : !selectedClinic ? '분석 대기' : notice ? '확인 필요' : '오늘 분석 완료'}
          </div>
          <button type="button" className="pdf-button" onClick={() => window.print()} disabled={!displayedAnalysis}>PDF로 저장</button>
        </div>
      </header>

      <section className="settings-card no-print">
        <div className="section-heading">
          <div>
            <span className="section-kicker">CLINIC MANAGEMENT</span>
            <h2>병원 선택 및 설정</h2>
          </div>
          <div className="clinic-actions">
            {selectedClinic && <button className="text-button danger-text" type="button" onClick={() => void handleDeleteClinic()}>병원 삭제</button>}
            <button className="text-button" type="button" onClick={handleNewClinic}>+ 새 병원 등록</button>
          </div>
        </div>
        <div className="clinic-picker">
          <label htmlFor="clinic-select">분석할 병원</label>
          <select id="clinic-select" value={selectedClinicId} onChange={(event) => handleSelectClinic(event.target.value)} disabled={initializing || clinics.length === 0}>
            {clinics.length === 0 ? <option value="">등록된 병원이 없습니다</option> : clinics.map((clinic) => <option value={clinic.id} key={clinic.id}>{clinic.name}</option>)}
          </select>
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
              <span>순위를 확인할 블로그 주소</span>
              <input value={form.blogUrl} onChange={(event) => setForm({ ...form, blogUrl: event.target.value })} placeholder="blog.naver.com/블로그아이디" required />
            </label>
            <label>
              <span>검색 키워드 <small>쉼표 또는 줄바꿈으로 구분 · 최대 20개</small></span>
              <input value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} placeholder="강남 피부과, 강남역 피부과" required />
            </label>
          </div>
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
          <p className="competitor-help">병원마다 플레이스 ID와 블로그 주소를 등록하면 저장된 키워드의 순위를 함께 비교하고 날짜별로 기록합니다.</p>
          <form className="competitor-form" onSubmit={(event) => void handleSaveCompetitor(event)}>
            <label><span>경쟁 병원명</span><input value={competitorForm.name} onChange={(event) => setCompetitorForm({ ...competitorForm, name: event.target.value })} placeholder="병원명" required disabled={!selectedClinic} /></label>
            <label><span>플레이스 URL 또는 ID</span><input value={competitorForm.placeId} onChange={(event) => setCompetitorForm({ ...competitorForm, placeId: event.target.value })} placeholder="네이버 플레이스 ID" required disabled={!selectedClinic} /></label>
            <label><span>블로그 주소</span><input value={competitorForm.blogUrl} onChange={(event) => setCompetitorForm({ ...competitorForm, blogUrl: event.target.value })} placeholder="blog.naver.com/아이디" required disabled={!selectedClinic} /></label>
            <button type="submit" className="secondary-button" disabled={!selectedClinic || saving || loading}>{editingCompetitorId ? '수정 저장' : '경쟁 병원 추가'}</button>
            {editingCompetitorId && <button type="button" className="cancel-button" onClick={() => { setEditingCompetitorId(''); setCompetitorForm(emptyCompetitorForm); }}>취소</button>}
          </form>
          {trackedCompetitors.length > 0 && <div className="saved-competitor-list">{trackedCompetitors.map((competitor) => (
            <div className="saved-competitor" key={competitor.id}>
              <span><strong>{competitor.name}</strong><small>플레이스 {competitor.place_id} · {competitor.blog_url}</small></span>
              <div><button type="button" className="text-button" onClick={() => handleEditCompetitor(competitor)}>수정</button><button type="button" className="text-button danger-text" onClick={() => void handleDeleteCompetitor(competitor)}>삭제</button></div>
            </div>
          ))}</div>}
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>

      <section className="results-section">
        <div className="results-toolbar no-print">
          <div className="tabs" role="tablist" aria-label="분석 결과">
            <button role="tab" aria-selected={activeTab === 'place'} className={activeTab === 'place' ? 'tab active' : 'tab'} onClick={() => setActiveTab('place')}><span className="tab-index">01</span> 플레이스 순위</button>
            <button role="tab" aria-selected={activeTab === 'blog'} className={activeTab === 'blog' ? 'tab active' : 'tab'} onClick={() => setActiveTab('blog')}><span className="tab-index">02</span> 블로그 순위</button>
            <button role="tab" aria-selected={activeTab === 'competitor'} className={activeTab === 'competitor' ? 'tab active' : 'tab'} onClick={() => setActiveTab('competitor')}><span className="tab-index">03</span> 경쟁 병원</button>
          </div>
          <label className="history-range">기록 기간
            <select value={historyDays} onChange={(event) => setHistoryDays(Number(event.target.value))}>
              <option value={7}>최근 7일</option>
              <option value={30}>최근 30일</option>
            </select>
          </label>
        </div>

        {loading && <div className="loading-panel"><span className="spinner large" /><div><strong>네이버 검색 결과를 모으고 있습니다</strong><p>키워드 수와 네이버 응답 속도에 따라 잠시 걸릴 수 있습니다.</p></div></div>}
        {!loading && !displayedAnalysis && <div className="empty-panel"><div className="empty-icon">⌕</div><strong>{selectedDate === 'today' ? '분석을 시작해보세요' : `${formatDate(selectedDate)} 기록이 없습니다`}</strong><p>{selectedClinic ? '오늘의 순위가 저장되면 날짜별 기록에 쌓입니다.' : '병원을 등록하거나 선택하면 검색 순위를 자동으로 확인합니다.'}</p></div>}

        {!loading && displayedAnalysis && activeTab === 'place' && (
          <div className="rank-rows">
            {displayedAnalysis.keywordResults.map((item) => (
              <div className="rank-pair" key={item.keyword}>
                <article className="metric-card">
                  <div className="metric-topline"><span>네이버 플레이스</span><span className="metric-mark green">P</span></div>
                  <h3>{item.keyword}</h3>
                  <Rank value={item.placeRank?.rank} />
                  <p>{item.placeRank?.found ? `${item.placeRank.totalResults}개 결과에서 확인` : item.placeRank ? '수집된 결과에서 찾지 못했습니다' : '순위 데이터를 확인할 수 없습니다'}</p>
                </article>
                <article className="metric-card">
                  <div className="metric-topline"><span>네이버 통합검색</span><span className="metric-mark navy">N</span></div>
                  <h3>{item.keyword}</h3>
                  <Rank value={item.integratedRank} />
                  <p>{item.integratedError ?? (item.integratedRank ? '확인된 플레이스 노출 순서' : '확인된 플레이스 노출 결과에서 찾지 못했습니다')}</p>
                </article>
              </div>
            ))}
            {displayedAnalysis.placeName && <p className="result-footnote">대상 플레이스: {displayedAnalysis.placeName}</p>}
            <p className="result-footnote">통합검색 순위는 페이지에서 확인 가능한 네이버 플레이스 결과의 노출 순서 기준이며, 통합검색 전체의 고정 순위와 다를 수 있습니다.</p>
          </div>
        )}

        {!loading && displayedAnalysis && activeTab === 'blog' && (
          <div className="keyword-panels">
            {displayedAnalysis.keywordResults.map((item) => (
              <article className="list-card" key={item.keyword}>
                <div className="list-heading"><div><span className="section-kicker">BLOG SEARCH</span><h3>{item.keyword}</h3></div><Rank value={item.blogRank} /></div>
                {item.blogResults?.length ? <div className="result-list">{item.blogResults.slice(0, 10).map((blog) => (
                  <a className="result-row" key={`${item.keyword}-${blog.rank}-${blog.link}`} href={blog.link} target="_blank" rel="noreferrer">
                    <span className="row-rank">{String(blog.rank).padStart(2, '0')}</span>
                    <span className="row-main"><strong>{blog.title}</strong><small>{blog.bloggername || '네이버 블로그'}{blog.postdate ? ` · ${blog.postdate}` : ''}</small></span>
                    <span className="row-arrow">↗</span>
                  </a>
                ))}</div> : <p className="no-results">{item.blogError ?? '블로그 검색 결과가 없습니다.'}</p>}
              </article>
            ))}
            <p className="result-footnote">입력한 블로그 주소가 검색 결과에 있으면 해당 글의 순위를 표시합니다.</p>
          </div>
        )}

        {!loading && displayedAnalysis && activeTab === 'competitor' && (
          <div className="list-card competitor-card">
            <div className="list-heading"><div><span className="section-kicker">LOCAL SEARCH LANDSCAPE</span><h3>“{selectedClinic?.keywords[0]}” 상위 병원</h3></div><span className="count-pill">{displayedAnalysis.competitors.length}곳</span></div>
            {displayedAnalysis.keywordResults.some((item) => (item.trackedCompetitors?.length ?? 0) > 0) ? (
              <div className="tracked-rank-table-wrap">
                <table className="history-table">
                  <thead><tr><th>검색 키워드</th><th>병원</th><th>플레이스</th><th>블로그</th><th>통합검색</th></tr></thead>
                  <tbody>{displayedAnalysis.keywordResults.flatMap((item) => {
                    const rows = [
                      { id: selectedClinic?.id ?? 'clinic', name: selectedClinic?.name ?? '내 병원', placeRank: item.placeRank?.rank ?? null, blogRank: item.blogRank ?? null, integratedRank: item.integratedRank ?? null },
                      ...(item.trackedCompetitors ?? []),
                    ];
                    return rows.map((competitor, index) => (
                      <tr key={`${item.keyword}-${competitor.id}`}>
                        {index === 0 && <td rowSpan={rows.length}>{item.keyword}</td>}
                        <td>{competitor.name}{index === 0 && <span className="mine-tag table-mine-tag">내 병원</span>}</td>
                        <td>{competitor.placeRank ? `${competitor.placeRank}위` : '순위권 외'}</td>
                        <td>{competitor.blogRank ? `${competitor.blogRank}위` : '순위권 외'}</td>
                        <td>{competitor.integratedRank ? `${competitor.integratedRank}위` : '순위권 외'}</td>
                      </tr>
                    ));
                  })}</tbody>
                </table>
              </div>
            ) : displayedAnalysis.competitors.length ? <div className="competitor-list">{displayedAnalysis.competitors.map((competitor) => {
              const isMine = competitor.placeId === selectedClinic?.place_id;
              return <div className={isMine ? 'competitor-row mine' : 'competitor-row'} key={`${competitor.rank}-${competitor.placeId ?? competitor.name}`}>
                <span className="competitor-rank">{String(competitor.rank).padStart(2, '0')}</span>
                <span className="competitor-name">{competitor.name}{isMine && <span className="mine-tag">내 병원</span>}</span>
                {competitor.href && <a href={competitor.href} target="_blank" rel="noreferrer" className="row-arrow" aria-label={`${competitor.name} 플레이스 열기`}>↗</a>}
              </div>;
            })}</div> : <p className="no-results">{trackedCompetitors.length ? '등록한 경쟁 병원 정보가 아직 분석 결과에 없습니다. 다시 분석해주세요.' : displayedAnalysis.competitorError ?? '경쟁 병원을 등록하면 키워드별 순위를 비교할 수 있습니다.'}</p>}
            {displayedAnalysis.trackedRankError && <p className="notice" role="status">{displayedAnalysis.trackedRankError}</p>}
            <p className="result-footnote">첫 번째 키워드의 네이버 지도 검색 결과 기준입니다.</p>
          </div>
        )}

        <section className="history-section">
          <div className="history-heading">
            <div><span className="section-kicker">RANK HISTORY</span><h2>{selectedClinic?.name ?? '병원'} 날짜별 순위</h2></div>
            <span className="history-caption">날짜를 선택하면 해당일 분석 결과를 볼 수 있습니다.</span>
          </div>
          {!selectedClinic && <p className="no-results">병원을 선택하면 날짜별 순위 기록이 표시됩니다.</p>}
          {selectedClinic && filteredSnapshots.length === 0 && !loading && <p className="no-results">아직 저장된 순위 기록이 없습니다. 오늘 분석 후 날짜별로 기록이 쌓입니다.</p>}
          {selectedClinic && filteredSnapshots.length > 0 && (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead><tr><th>분석 날짜</th><th>검색 키워드</th><th>플레이스</th><th>통합검색</th><th>블로그</th></tr></thead>
                <tbody>
                  {filteredSnapshots.flatMap((snapshot) => snapshot.payload.keywordResults.map((item, index) => (
                    <tr key={`${snapshot.id}-${item.keyword}`} className={snapshot.snapshot_date === selectedDate ? 'selected-history' : ''}>
                      {index === 0 && <td rowSpan={snapshot.payload.keywordResults.length}><button type="button" className="date-link" onClick={() => selectSnapshot(snapshot)}>{formatDate(snapshot.snapshot_date)}</button></td>}
                      <td>{item.keyword}</td>
                      <td>{item.placeRank?.rank ? `${item.placeRank.rank}위` : '순위권 외'}</td>
                      <td>{item.integratedRank ? `${item.integratedRank}위` : '순위권 외'}</td>
                      <td>{item.blogRank ? `${item.blogRank}위` : '순위권 외'}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
      <footer className="dashboard-footer">검색 결과는 네이버의 노출·수집 시점 및 검색 환경에 따라 달라질 수 있습니다.</footer>
    </main>
  );
}
