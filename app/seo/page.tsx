'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { SEOAnalysisResponse } from '@/types';

// 애니메이션 variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

// 아이콘 컴포넌트
const TagIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const LoadingSpinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };
  return (
    <svg className={`animate-spin ${sizeClasses[size]}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
};

export default function SEOPage() {
  const [keyword, setKeyword] = useState('');
  const [topN, setTopN] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SEOAnalysisResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!keyword.trim()) {
      alert('검색 키워드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/seo-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword, topN }),
      });

      const data: SEOAnalysisResponse = await response.json();
      setResult(data);
    } catch (error) {
      console.error('SEO analysis error:', error);
      alert('SEO 분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="pt-12 pb-8 px-4"
      >
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-white/40 shadow-sm mb-6"
          >
            <SparklesIcon />
            <span className="text-sm font-medium text-gray-600">키워드 인사이트</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-4xl md:text-5xl font-bold text-gray-900 mb-4"
          >
            SEO 키워드 분석
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-lg text-gray-600 mb-6"
          >
            상위 플레이스들의 대표 키워드를 분석합니다
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              <ArrowLeftIcon />
              순위 확인으로 돌아가기
            </Link>
          </motion.div>
        </div>
      </motion.header>

      {/* 메인 컨텐츠 */}
      <main className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          {/* 검색 폼 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass rounded-3xl shadow-xl shadow-gray-200/50 p-8 mb-8"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* 검색 키워드 입력 */}
                <div>
                  <label htmlFor="keyword" className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <TagIcon />
                    검색 키워드
                  </label>
                  <input
                    type="text"
                    id="keyword"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="예: 강남 맛집, 홍대 카페"
                    className="w-full px-4 py-3.5 bg-white/80 border-2 border-gray-100 rounded-xl focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all duration-200 placeholder:text-gray-400"
                    required
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    분석할 키워드를 입력하세요
                  </p>
                </div>

                {/* 분석할 개수 */}
                <div>
                  <label htmlFor="topN" className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <ChartIcon />
                    분석 범위
                  </label>
                  <select
                    id="topN"
                    value={topN}
                    onChange={(e) => setTopN(Number(e.target.value))}
                    className="w-full px-4 py-3.5 bg-white/80 border-2 border-gray-100 rounded-xl focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="5">상위 5개 플레이스</option>
                    <option value="10">상위 10개 플레이스</option>
                    <option value="20">상위 20개 플레이스</option>
                    <option value="30">상위 30개 플레이스</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    많을수록 분석 시간이 증가합니다
                  </p>
                </div>
              </div>

              {/* 분석 버튼 */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 focus:outline-none focus:ring-4 focus:ring-purple-300 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-3">
                    <LoadingSpinner size="sm" />
                    SEO 분석 중...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <SparklesIcon />
                    키워드 분석 시작
                  </span>
                )}
              </motion.button>
            </form>
          </motion.div>

          {/* 로딩 상태 */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass rounded-2xl p-6 mb-8"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                    <LoadingSpinner size="md" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">SEO 키워드 분석 중...</p>
                    <p className="text-sm text-gray-500">상위 플레이스의 키워드를 추출하고 있어요</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 결과 */}
          <AnimatePresence mode="wait">
            {result && result.success && !loading && (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-6"
              >
                {/* 전체 키워드 요약 */}
                <motion.div
                  variants={itemVariants}
                  className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-3xl shadow-xl border-2 border-purple-200 p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
                      <TagIcon />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">
                        발견된 키워드
                      </h3>
                      <p className="text-sm text-purple-600">
                        총 {result.keywordCount}개의 키워드 발견
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {result.allKeywords.map((kw, index) => (
                      <motion.span
                        key={index}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="px-3 py-1.5 bg-white/80 text-purple-700 text-sm font-medium rounded-full border border-purple-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all cursor-default"
                      >
                        {kw}
                      </motion.span>
                    ))}
                  </div>

                  <p className="mt-6 text-sm text-gray-600 bg-white/50 rounded-xl p-4">
                    {result.message}
                  </p>
                </motion.div>

                {/* 플레이스별 상세 */}
                <motion.div
                  variants={itemVariants}
                  className="glass rounded-3xl shadow-xl shadow-gray-200/50 p-8"
                >
                  <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <ChartIcon />
                    </div>
                    플레이스별 상세 정보
                  </h3>

                  <div className="space-y-4">
                    {result.analyzedPlaces.map((place, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + index * 0.05 }}
                        className="bg-white/60 rounded-2xl p-5 border border-gray-100 hover:border-purple-200 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 text-white text-sm font-bold shadow-sm">
                              {place.rank}
                            </span>
                            <div>
                              <h4 className="text-lg font-semibold text-gray-800">
                                {place.name}
                              </h4>
                              {place.placeId && (
                                <p className="text-xs text-gray-500 font-mono">
                                  ID: {place.placeId}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right bg-purple-50 rounded-xl px-4 py-2">
                            <p className="text-xs text-gray-500">키워드</p>
                            <p className="text-2xl font-bold text-purple-600">
                              {place.keywordCount}
                            </p>
                          </div>
                        </div>

                        {place.keywords.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {place.keywords.map((kw, kIndex) => (
                              <span
                                key={kIndex}
                                className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">
                            키워드 없음
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 푸터 */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="py-8 text-center"
      >
        <p className="text-sm text-gray-500">
          네이버 지도 데이터를 실시간으로 분석합니다
        </p>
      </motion.footer>
    </div>
  );
}
