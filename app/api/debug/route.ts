import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  let browser = null;

  try {
    const body = await request.json();
    const { keyword } = body;

    const browserlessToken = process.env.BROWSERLESS_TOKEN;
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    if (isProduction && browserlessToken) {
      browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${browserlessToken}`,
      });
    } else if (isProduction) {
      throw new Error('BROWSERLESS_TOKEN 환경변수가 설정되지 않았습니다.');
    } else {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto('https://map.naver.com/p?c=15.00,0,0,0,dh', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await delay(3000);

    const searchInput = await page.$('input.input_search');
    if (searchInput) {
      await searchInput.click();
      await delay(500);
      await searchInput.type(keyword || '강남 피부과');
      await delay(1000);
      await page.keyboard.press('Enter');
      await delay(5000);
    }

    // iframe 찾기
    const frames = page.frames();
    let searchFrame = null;

    for (const frame of frames) {
      try {
        const hasContainer = await frame.$('#_pcmap_list_scroll_container');
        if (hasContainer) {
          searchFrame = frame;
          break;
        }
      } catch (e) {
        // 무시
      }
    }

    const target = searchFrame || page;

    // 프레임 URL 목록
    const frameUrls = frames.map(f => f.url());

    // 페이지 전체 HTML에서 검색 결과 관련 요소 찾기
    const debugInfo = await target.evaluate(() => {
      const info: Record<string, string> = {};

      // 다양한 셀렉터 시도
      const selectors = [
        '#_pcmap_list_scroll_container',
        '#_pcmap_list_scroll_container > ul > li',
        '.place_list',
        '.search_list',
        '[class*="list"]',
        '[class*="scroll"]',
        'ul > li',
        '[data-id]',
        'a[href*="place"]'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        info[sel] = el ? `FOUND (${el.tagName}.${el.className})` : 'NOT FOUND';
      }

      // body의 첫 1000자
      info['body_preview'] = document.body.innerHTML.substring(0, 2000);

      return info;
    });

    // 첫 번째 li 요소의 HTML 가져오기
    const firstItemHTML = await target.evaluate(() => {
      const firstLi = document.querySelector('#_pcmap_list_scroll_container > ul > li');
      return firstLi ? firstLi.outerHTML : 'NOT FOUND';
    });

    // 모든 a 태그의 href 가져오기
    const allLinks = await target.evaluate(() => {
      const firstLi = document.querySelector('#_pcmap_list_scroll_container > ul > li');
      if (!firstLi) return [];
      const links = firstLi.querySelectorAll('a');
      return Array.from(links).map(a => ({
        href: a.href,
        className: a.className,
        textContent: a.textContent?.substring(0, 50)
      }));
    });

    if (browser) await browser.disconnect();

    return NextResponse.json({
      success: true,
      frameUrls,
      debugInfo,
      firstItemHTML: firstItemHTML.substring(0, 5000),
      allLinks,
    });

  } catch (error) {
    console.error('Debug error:', error);
    if (browser) {
      try { await browser.disconnect(); } catch (e) { /* ignore */ }
    }
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
