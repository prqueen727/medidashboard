export interface SearchResult {
  rank: number;
  name: string;
  placeId: string | null;
  href: string | null;
}

export interface SearchRequest {
  keywords: string[];  // 여러 키워드 지원
  placeUrl: string;
}

export interface KeywordRankResult {
  keyword: string;
  rank: number | null;
  totalResults: number;
  found: boolean;
}

export interface SearchResponse {
  success: boolean;
  rank?: number;
  placeName?: string;
  placeId?: string;
  totalResults?: number;
  keywords?: string[];
  keywordRanks?: KeywordRankResult[];  // 여러 키워드별 순위
  message: string;
}

export interface SEOAnalysisRequest {
  keyword: string;
  topN: number;
}

export interface PlaceKeywords {
  rank: number;
  name: string;
  placeId: string;
  keywords: string[];
  keywordCount: number;
}

export interface SEOAnalysisResponse {
  success: boolean;
  keyword: string;
  analyzedCount: number;
  allKeywords: string[];
  keywordCount: number;
  analyzedPlaces: PlaceKeywords[];
  message: string;
}
