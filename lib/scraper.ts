import puppeteer, { Browser, Page, Frame } from 'puppeteer';

export interface SearchResult {
  rank: number;
  name: string;
  placeId: string | null;
  href: string | null;
}

export interface KeywordSearchResult {
  keyword: string;
  rank: number | null;
  totalResults: number;
  found: boolean;
  placeName?: string;
}

// waitForTimeout 대체 유틸리티
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class NaverMapScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize() {
    const isLocal = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      ...(isLocal && process.env.CHROME_PATH && {
        executablePath: process.env.CHROME_PATH,
      }),
    });

    this.page = await this.browser.newPage();

    // 페이지 타임아웃 설정
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(60000);

    // PC 환경 설정
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
  }

  // 병렬 검색: 여러 키워드를 동시에 검색
  async searchKeywordsParallel(keywords: string[], targetPlaceId: string, maxConcurrent: number = 3): Promise<KeywordSearchResult[]> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    console.log(`병렬 검색 시작: ${keywords.length}개 키워드, 동시 ${maxConcurrent}개 탭`);

    const results: KeywordSearchResult[] = [];

    // 키워드를 청크로 나누기
    for (let i = 0; i < keywords.length; i += maxConcurrent) {
      const chunk = keywords.slice(i, i + maxConcurrent);
      console.log(`\n=== 청크 ${Math.floor(i / maxConcurrent) + 1}: ${chunk.join(', ')} ===`);

      // 청크 내 키워드를 병렬로 처리
      const chunkPromises = chunk.map(keyword =>
        this.searchSingleKeywordInNewTab(keyword, targetPlaceId)
      );

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  // 새 탭에서 단일 키워드 검색
  private async searchSingleKeywordInNewTab(keyword: string, targetPlaceId: string): Promise<KeywordSearchResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();

    try {
      // 페이지 설정
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );

      // 검색 페이지로 이동
      const encodedKeyword = encodeURIComponent(keyword);
      const searchUrl = `https://map.naver.com/p/search/${encodedKeyword}`;
      console.log(`[${keyword}] 검색 시작...`);

      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await delay(2000);

      // iframe 찾기 (여러 번 시도)
      let target: Frame | Page = page;
      for (let attempt = 0; attempt < 5; attempt++) {
        target = await this.findSearchFrameInPage(page);
        if (target !== page) {
          console.log(`[${keyword}] iframe 발견 (시도 ${attempt + 1})`);
          break;
        }
        await delay(500);
      }

      // 검색 결과 로딩 대기 (더 많은 시도)
      let itemCount = 0;
      for (let i = 0; i < 20; i++) {
        // iframe 다시 찾기
        target = await this.findSearchFrameInPage(page);

        itemCount = await target.evaluate(() => {
          const items = document.querySelectorAll('#_pcmap_list_scroll_container > ul > li');
          return items.length;
        });
        if (itemCount > 0) {
          console.log(`[${keyword}] 항목 ${itemCount}개 로드됨`);
          break;
        }
        await delay(500);
      }

      // 항목이 없으면 조기 종료
      if (itemCount === 0) {
        console.log(`[${keyword}] 검색 결과 없음`);
        await page.close();
        return {
          keyword,
          rank: null,
          totalResults: 0,
          found: false,
        };
      }

      await delay(500);

      // 스크롤하며 더 많은 결과 로드 (최대 4번, 항목 수 변화 없으면 중단)
      let prevCount = itemCount;
      for (let s = 0; s < 4; s++) {
        // iframe 다시 찾기 (스크롤 중 변경될 수 있음)
        target = await this.findSearchFrameInPage(page);

        await target.evaluate(() => {
          const container = document.querySelector('#_pcmap_list_scroll_container');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        });
        await delay(800);

        // 새 항목 수 확인
        const newCount = await target.evaluate(() => {
          return document.querySelectorAll('#_pcmap_list_scroll_container > ul > li').length;
        });

        console.log(`[${keyword}] 스크롤 ${s + 1}: ${prevCount} -> ${newCount}개`);

        if (newCount === prevCount) {
          // 더 이상 로드 안 됨
          break;
        }
        prevCount = newCount;
        itemCount = newCount;
      }

      console.log(`[${keyword}] 최종 항목 수: ${itemCount}`);

      // DOM에서 이름 + 광고 여부를 한번에 추출 (클릭 없이)
      console.log(`[${keyword}] 타겟 placeId: ${targetPlaceId}`);

      const currentTarget = await this.findSearchFrameInPage(page);
      const allItems = await currentTarget.evaluate(() => {
        const items = document.querySelectorAll('#_pcmap_list_scroll_container > ul > li');
        const results: Array<{ name: string; isAd: boolean }> = [];
        items.forEach((item) => {
          const nameElem = item.querySelector('.O_Uah');
          const name = nameElem ? nameElem.textContent?.trim() || 'N/A' : 'N/A';
          const isAd = item.querySelector('.dPXjn') !== null;
          results.push({ name, isAd });
        });
        return results;
      });

      // 광고/비플레이스 항목 제외하고 순서대로 클릭하여 placeId 추출
      let realRank = 0;
      for (let index = 0; index < allItems.length; index++) {
        const item = allItems[index];

        if (item.isAd || item.name === 'N/A') {
          continue;
        }

        realRank++;

        try {
          const clickTarget = await this.findSearchFrameInPage(page);

          // 클릭 전 현재 URL 저장
          const urlBeforeClick = page.url();

          // 항목 클릭
          const clicked = await clickTarget.evaluate((idx) => {
            const items = document.querySelectorAll('#_pcmap_list_scroll_container > ul > li');
            const item = items[idx];
            if (!item) return false;
            const clickable = item.querySelector('.place_bluelink, a') as HTMLElement;
            if (clickable) {
              clickable.click();
              return true;
            }
            return false;
          }, index);

          if (!clicked) {
            console.log(`[${keyword}] [${realRank}위] 클릭 실패`);
            continue;
          }

          // 클릭 전 URL에서 이전 placeId 추출
          const oldMatch = urlBeforeClick.match(/place\/(\d+)/);
          const oldPlaceId = oldMatch ? oldMatch[1] : null;

          // URL이 실제로 변경될 때까지 대기 (최대 3초)
          let placeId: string | null = null;
          for (let waitAttempt = 0; waitAttempt < 15; waitAttempt++) {
            await delay(200);

            const currentUrl = page.url();
            const placeMatch = currentUrl.match(/place\/(\d+)/);

            if (placeMatch && placeMatch[1]) {
              const newPlaceId = placeMatch[1];
              if (!oldPlaceId || newPlaceId !== oldPlaceId) {
                placeId = newPlaceId;
                break;
              }
            }
          }

          // URL에서 못 찾으면 iframe에서 시도 (이전 placeId 제외)
          if (!placeId) {
            const frames = page.frames();
            for (const frame of frames) {
              try {
                const frameUrl = frame.url();
                const placeMatch = frameUrl.match(/place\/(\d+)/);
                if (placeMatch && placeMatch[1] && placeMatch[1] !== oldPlaceId) {
                  placeId = placeMatch[1];
                  break;
                }
              } catch (e) {
                // iframe 접근 실패 시 무시
              }
            }
          }

          console.log(`[${keyword}] [${realRank}위] ${item.name} -> placeId: ${placeId}`);

          // 타겟 발견 시 조기 종료
          if (placeId === targetPlaceId) {
            console.log(`[${keyword}] 발견! 순위: ${realRank}위`);
            await page.close();
            return {
              keyword,
              rank: realRank,
              totalResults: itemCount,
              found: true,
              placeName: item.name,
            };
          }
        } catch (e) {
          console.log(`[${keyword}] [${realRank}위] 오류: ${e}`);
          continue;
        }
      }

      console.log(`[${keyword}] 상위 ${itemCount}개 내 없음`);
      await page.close();
      return {
        keyword,
        rank: null,
        totalResults: itemCount,
        found: false,
      };

    } catch (e) {
      console.error(`[${keyword}] 검색 오류:`, e);
      await page.close();
      return {
        keyword,
        rank: null,
        totalResults: 0,
        found: false,
      };
    }
  }

  // 특정 페이지에서 iframe 찾기
  private async findSearchFrameInPage(page: Page): Promise<Frame | Page> {
    const frames = page.frames();

    for (const frame of frames) {
      const url = frame.url();
      if (url.includes('map.naver.com/place/list') ||
          url.includes('pcmap.place.naver.com/place/list') ||
          url.includes('pcmap.place.naver.com/restaurant/list')) {
        return frame;
      }
    }

    for (const frame of frames) {
      try {
        const hasContainer = await frame.$('#_pcmap_list_scroll_container');
        if (hasContainer) return frame;
      } catch (e) {
        // 무시
      }
    }

    return page;
  }

  async searchKeyword(keyword: string) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    // 검색 API URL로 직접 이동 (더 빠르고 안정적)
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://map.naver.com/p/search/${encodedKeyword}`;

    console.log(`네이버 PC 지도 검색 URL로 이동: ${searchUrl}`);
    await this.page.goto(searchUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    console.log('검색 결과 로딩 대기 중...');
    await delay(2000);
  }

  private async findSearchFrame(): Promise<Frame | Page> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const frames = this.page.frames();

    // 1. URL 패턴으로 iframe 찾기
    for (const frame of frames) {
      const url = frame.url();
      if (url.includes('map.naver.com/place/list') ||
          url.includes('pcmap.place.naver.com/place/list') ||
          url.includes('pcmap.place.naver.com/restaurant/list')) {
        console.log(`[OK] iframe 발견: ${url.substring(0, 80)}...`);
        return frame;
      }
    }

    // 2. 컨테이너 존재로 찾기
    console.log('URL 패턴으로 프레임을 찾지 못함. 컨테이너로 확인...');
    for (const frame of frames) {
      try {
        const hasContainer = await frame.$('#_pcmap_list_scroll_container');
        if (hasContainer) {
          console.log('[OK] 컨테이너가 있는 프레임 발견!');
          return frame;
        }
      } catch (e) {
        // 무시
      }
    }

    console.log('iframe을 찾지 못함, 메인 페이지 사용');
    return this.page;
  }

  async getSearchResults(maxResults: number = 100, targetPlaceId?: string): Promise<SearchResult[]> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const results: SearchResult[] = [];

    try {
      console.log('검색 결과 로딩 대기 중...');
      await delay(1500);

      const target = await this.findSearchFrame();
      console.log(`대상 선택됨: ${target === this.page ? 'main page' : 'iframe'}`);

      // 검색 결과 항목이 로드될 때까지 대기
      console.log('검색 결과 항목 로딩 대기...');
      for (let i = 0; i < 15; i++) {
        const itemCount = await target.evaluate(() => {
          const items = document.querySelectorAll('#_pcmap_list_scroll_container > ul > li');
          return items.length;
        });
        if (itemCount > 0) {
          console.log(`항목 ${itemCount}개 로드됨`);
          break;
        }
        await delay(300);
      }

      await delay(500);

      // 스크롤 컨테이너 찾기
      const scrollContainer = await target.$('#_pcmap_list_scroll_container');

      if (scrollContainer) {
        console.log('스크롤 컨테이너 발견! 스크롤 시작...');

        // 2번만 스크롤 (시간 절약)
        for (let i = 0; i < 2; i++) {
          console.log(`스크롤 ${i + 1}/2...`);
          await target.evaluate(() => {
            const container = document.querySelector('#_pcmap_list_scroll_container');
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          });
          await delay(800);
        }
      }

      await delay(500);

      // 항목 수 확인
      const itemCount = await target.evaluate(() => {
        return document.querySelectorAll('#_pcmap_list_scroll_container > ul > li').length;
      });
      console.log(`찾은 항목 수: ${itemCount}`);

      // DOM에서 이름 + 광고 여부를 한번에 추출
      const allItems = await target.evaluate(() => {
        const items = document.querySelectorAll('#_pcmap_list_scroll_container > ul > li');
        const results: Array<{ name: string; isAd: boolean }> = [];
        items.forEach((item) => {
          const nameElem = item.querySelector('.O_Uah');
          const name = nameElem ? nameElem.textContent?.trim() || 'N/A' : 'N/A';
          const isAd = item.querySelector('.dPXjn') !== null;
          results.push({ name, isAd });
        });
        return results;
      });

      // 광고/비플레이스 항목 제외하고 순서대로 클릭하여 placeId 추출 (타겟을 찾으면 조기 종료)
      let realRank = 0;
      for (let index = 0; index < Math.min(allItems.length, maxResults); index++) {
        const item = allItems[index];

        if (item.isAd || item.name === 'N/A') {
          console.log(`[제외] ${item.name} (${item.isAd ? '광고' : '비플레이스 항목'})`);
          continue;
        }

        realRank++;

        try {
          // 현재 프레임 다시 찾기
          const currentTarget = await this.findSearchFrame();

          // 항목 클릭
          await currentTarget.evaluate((idx) => {
            const items = document.querySelectorAll('#_pcmap_list_scroll_container > ul > li');
            const item = items[idx];
            if (!item) return;
            const clickable = item.querySelector('.place_bluelink, a') as HTMLElement;
            if (clickable) clickable.click();
          }, index);

          await delay(600);

          // URL에서 placeId 추출 (메인 페이지 URL 또는 iframe URL 모두 확인)
          let placeId: string | null = null;
          if (this.page) {
            // 메인 페이지 URL 확인
            const mainUrl = this.page.url();
            let placeMatch = mainUrl.match(/place\/(\d+)/);
            if (placeMatch && placeMatch[1]) {
              placeId = placeMatch[1];
            }

            // 메인에서 못 찾으면 모든 프레임 URL 확인
            if (!placeId) {
              const frames = this.page.frames();
              for (const frame of frames) {
                const frameUrl = frame.url();
                placeMatch = frameUrl.match(/place\/(\d+)/);
                if (placeMatch && placeMatch[1]) {
                  placeId = placeMatch[1];
                  break;
                }
              }
            }
          }

          console.log(`[${realRank}위] ${item.name} - placeId: ${placeId}`);

          results.push({
            rank: realRank,
            name: item.name,
            placeId,
            href: placeId ? `https://map.naver.com/p/entry/place/${placeId}` : null,
          });

          // 타겟 placeId를 찾으면 조기 종료
          if (targetPlaceId && placeId === targetPlaceId) {
            console.log(`[조기 종료] 타겟 placeId ${targetPlaceId} 발견! 순위: ${realRank}`);
            break;
          }

        } catch (e) {
          console.error(`항목 파싱 오류 (순위 ${index + 1}):`, e);
          continue;
        }
      }

    } catch (e) {
      console.error('검색 결과 가져오기 오류:', e);
    }

    return results;
  }

  async getPlaceKeywords(placeId: string): Promise<string[]> {
    if (!placeId || !this.page) {
      return [];
    }

    try {
      // place 카테고리만 시도 (시간 절약)
      const url = `https://pcmap.place.naver.com/place/${placeId}/home`;
      console.log(`키워드 추출 시도: ${url}`);

      try {
        const response = await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 5000,
        });

        if (response && response.ok()) {
          const content = await this.page.content();
          const pattern = /"keywordList"\s*:\s*\[(.*?)\]/;
          const match = content.match(pattern);

          if (match && match[1]) {
            const keywordStr = match[1];
            const keywords = JSON.parse(`[${keywordStr}]`);
            console.log(`키워드 추출 성공: ${keywords}`);
            return keywords;
          }
        }
      } catch (e) {
        console.log('키워드 추출 시간 초과, 스킵');
      }

      return [];
    } catch (e) {
      console.error('키워드 추출 오류:', e);
      return [];
    }
  }

  async close() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (e) {
      console.error('브라우저 종료 오류:', e);
    }
  }
}
