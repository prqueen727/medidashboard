'use client';

import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';

interface TrendKeywordResult {
  keyword: string;
  placeRank?: { rank: number | null };
  integratedRank?: number | null;
}

interface TrendSnapshot {
  snapshot_date: string;
  payload: { keywordResults: TrendKeywordResult[] };
}

type Metric = 'place' | 'integrated';

// 검증된 범주형 팔레트(고정 순서). 키워드 색은 선택 시 배정된 슬롯을 계속 유지한다.
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const MAX_POINTS = 10;
const DEFAULT_SERIES = 3;
const HEIGHT = 300;
const MARGIN = { top: 28, right: 24, bottom: 34, left: 44 };

function getRank(item: TrendKeywordResult | undefined, metric: Metric) {
  if (!item) return null;
  return (metric === 'place' ? item.placeRank?.rank : item.integratedRank) ?? null;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split('-');
  return `${Number(month)}/${Number(day)}`;
}

// 단조 3차 보간: 순위가 실제 값 사이에서 튀어 보이지 않게 부드럽게 연결
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  const slopes = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];
    const [before, after] = [slopes[index - 1], slopes[index]];
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  return points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x},${point.y}`;
    const previous = points[index - 1];
    const step = (point.x - previous.x) / 3;
    return `${path} C${previous.x + step},${previous.y + tangents[index - 1] * step} ${point.x - step},${point.y - tangents[index] * step} ${point.x},${point.y}`;
  }, '');
}

export default function RankTrendChart({ snapshots, keywords }: { snapshots: TrendSnapshot[]; keywords: string[] }) {
  const [metric, setMetric] = useState<Metric>('place');
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSlots(Array.from({ length: SERIES_COLORS.length }, (_, index) => index < DEFAULT_SERIES ? keywords[index] ?? null : null));
  }, [keywords]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(() => [...snapshots]
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .slice(-MAX_POINTS), [snapshots]);

  const series = slots.flatMap((keyword, slot) => keyword ? [{
    keyword,
    color: SERIES_COLORS[slot],
    ranks: points.map((snapshot) => getRank(snapshot.payload.keywordResults.find((item) => item.keyword === keyword), metric)),
  }] : []);

  const maxRank = Math.max(5, ...series.flatMap((item) => item.ranks.filter((rank): rank is number => rank !== null)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (index: number) => MARGIN.left + (points.length > 1 ? (index / (points.length - 1)) * plotWidth : plotWidth / 2);
  const y = (rank: number) => MARGIN.top + ((rank - 1) / (maxRank - 1)) * plotHeight;
  const tickStep = Math.ceil(maxRank / 8);
  const ticks = Array.from({ length: maxRank }, (_, index) => index + 1).filter((rank) => rank === 1 || rank % tickStep === 0);

  const toggleKeyword = (keyword: string) => {
    setSlots((previous) => {
      const current = previous.indexOf(keyword);
      if (current >= 0) return previous.map((item, index) => index === current ? null : item);
      const free = previous.indexOf(null);
      return free < 0 ? previous : previous.map((item, index) => index === free ? keyword : item);
    });
  };

  const handlePointer = (event: PointerEvent<SVGRectElement>) => {
    if (!points.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const relative = (event.clientX - bounds.left) / bounds.width;
    setHoverIndex(Math.round(relative * (points.length - 1)));
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <section className="trend-section">
      <div className="history-heading">
        <div><span className="section-kicker">RANK TREND</span><h2>키워드별 순위 추이</h2></div>
        <div className="trend-metric" role="group" aria-label="순위 종류">
          <button type="button" className={metric === 'place' ? 'active' : ''} onClick={() => setMetric('place')}>플레이스</button>
          <button type="button" className={metric === 'integrated' ? 'active' : ''} onClick={() => setMetric('integrated')}>통합검색</button>
        </div>
      </div>
      <p className="history-caption">최근 수집된 데이터 기준 (최대 {MAX_POINTS}개) · 키워드를 눌러 최대 {SERIES_COLORS.length}개까지 비교할 수 있습니다.</p>

      <div className="trend-legend">
        {keywords.map((keyword) => {
          const slot = slots.indexOf(keyword);
          return (
            <button type="button" key={keyword} className={slot >= 0 ? 'trend-chip active' : 'trend-chip'} onClick={() => toggleKeyword(keyword)}
              disabled={slot < 0 && !slots.includes(null)} aria-pressed={slot >= 0}>
              <span className="trend-swatch" style={{ background: slot >= 0 ? SERIES_COLORS[slot] : 'transparent' }} />{keyword}
            </button>
          );
        })}
      </div>

      <div className="trend-chart" ref={wrapRef}>
        {points.length === 0 ? <p className="no-results">아직 저장된 순위 기록이 없습니다.</p> : (
          <svg width={width} height={HEIGHT} role="img" aria-label={`키워드별 ${metric === 'place' ? '플레이스' : '통합검색'} 순위 추이`}>
            {ticks.map((rank) => (
              <g key={rank}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(rank)} y2={y(rank)} className="trend-grid" />
                <text x={MARGIN.left - 10} y={y(rank)} className="trend-axis" textAnchor="end" dominantBaseline="middle">{rank}위</text>
              </g>
            ))}
            {points.map((snapshot, index) => (
              <text key={snapshot.snapshot_date} x={x(index)} y={HEIGHT - 10} className="trend-axis" textAnchor="middle">{formatShortDate(snapshot.snapshot_date)}</text>
            ))}
            {hovered && <line x1={x(hoverIndex!)} x2={x(hoverIndex!)} y1={MARGIN.top - 8} y2={MARGIN.top + plotHeight} className="trend-crosshair" />}
            {series.map((item, seriesIndex) => {
              // 순위권 외(null)는 선을 끊어서 표시
              const segments: { x: number; y: number }[][] = [[]];
              item.ranks.forEach((rank, index) => {
                if (rank === null) segments.push([]);
                else segments[segments.length - 1].push({ x: x(index), y: y(rank) });
              });
              return (
                <g key={item.keyword}>
                  {segments.filter((segment) => segment.length > 1).map((segment, index) => (
                    <path key={index} d={smoothPath(segment)} fill="none" stroke={item.color} strokeWidth={2} strokeLinecap="round" />
                  ))}
                  {item.ranks.map((rank, index) => rank !== null && (
                    <g key={index}>
                      <circle cx={x(index)} cy={y(rank)} r={hoverIndex === index ? 5 : 4} fill="#fff" stroke={item.color} strokeWidth={2} />
                      {/* 같은 날 같은 순위의 라벨은 한 번만 표시 */}
                      {!series.slice(0, seriesIndex).some((other) => other.ranks[index] === rank) && (
                        <text x={x(index)} y={y(rank) - 10} className="trend-value" textAnchor="middle">{rank}</text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })}
            <rect x={MARGIN.left - 20} y={0} width={plotWidth + 40} height={HEIGHT} fill="transparent"
              onPointerMove={handlePointer} onPointerLeave={() => setHoverIndex(null)} />
          </svg>
        )}
        {hovered && series.length > 0 && (
          <div className="trend-tooltip" style={{ left: Math.min(x(hoverIndex!) + 12, width - 190), top: MARGIN.top }}>
            <strong>{formatShortDate(hovered.snapshot_date)}</strong>
            {series.map((item) => (
              <span key={item.keyword}><i style={{ background: item.color }} />{item.keyword}<b>{item.ranks[hoverIndex!] ? `${item.ranks[hoverIndex!]}위` : '순위권 외'}</b></span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
