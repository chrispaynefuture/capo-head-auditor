import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';

const WEIGHTS = { META: 10, TITLE: 9, PRECONNECT: 8, ASYNC_SCRIPT: 7, IMPORT_STYLES: 6, SYNC_SCRIPT: 5, SYNC_STYLES: 4, PRELOAD: 3, DEFER_SCRIPT: 2, PREFETCH_PRERENDER: 1, OTHER: 0 };
const COLORS: Record<number, string> = { [WEIGHTS.META]: '#9e0142', [WEIGHTS.TITLE]: '#d53e4f', [WEIGHTS.PRECONNECT]: '#f46d43', [WEIGHTS.ASYNC_SCRIPT]: '#fdae61', [WEIGHTS.IMPORT_STYLES]: '#fee08b', [WEIGHTS.SYNC_SCRIPT]: '#e6f598', [WEIGHTS.SYNC_STYLES]: '#abdda4', [WEIGHTS.PRELOAD]: '#66c2a5', [WEIGHTS.DEFER_SCRIPT]: '#3288bd', [WEIGHTS.PREFETCH_PRERENDER]: '#5e4fa2', [WEIGHTS.OTHER]: '#cccccc' };

function getElementWeight(el: Element): number {
  const tag = el.tagName.toLowerCase();
  const rel = el.getAttribute('rel')?.toLowerCase();
  const src = el.getAttribute('src');
  if (tag === 'meta' && (el.hasAttribute('charset') || el.getAttribute('name')?.toLowerCase() === 'viewport')) return WEIGHTS.META;
  if (tag === 'meta' && el.getAttribute('http-equiv')?.toLowerCase() === 'origin-trial') return WEIGHTS.META;
  if (tag === 'title') return WEIGHTS.TITLE;
  if (tag === 'link' && rel === 'preconnect') return WEIGHTS.PRECONNECT;
  if (tag === 'script' && el.hasAttribute('async')) return WEIGHTS.ASYNC_SCRIPT;
  if (tag === 'style' && el.innerHTML.includes('@import')) return WEIGHTS.IMPORT_STYLES;
  if (tag === 'script' && !el.hasAttribute('defer') && !el.hasAttribute('async') && src) return WEIGHTS.SYNC_SCRIPT;
  if (tag === 'link' && rel === 'stylesheet') return WEIGHTS.SYNC_STYLES;
  if (tag === 'link' && (rel === 'preload' || rel === 'modulepreload')) return WEIGHTS.PRELOAD;
  if (tag === 'script' && el.hasAttribute('defer')) return WEIGHTS.DEFER_SCRIPT;
  if (tag === 'link' && (rel === 'prefetch' || rel === 'dns-prefetch' || rel === 'prerender')) return WEIGHTS.PREFETCH_PRERENDER;
  return WEIGHTS.OTHER;
}

const getByteSize = (str: string) => Buffer.byteLength(str, 'utf8');

async function getHtmlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', 'Accept': 'text/html' }, cache: 'no-store' });
    if (res.ok) return await res.text();
  } catch {}
  
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();
    await browser.close();
    return html;
  } catch (err: unknown) {
    await browser.close();
    const msg = err instanceof Error ? err.message : 'Browser fetch failed';
    throw new Error(msg);
  }
}

type ElementRecord = { tagName: string; weight: number; html: string; color: string; sizeInBytes: number };
type ViolationRecord = { element: string; html: string; severity: string; impactedMetric: string; issue: string; recommendation: string };

export async function POST(req: Request) {
  try {
    const body = await req.json() as { url?: string; urls?: string[] };
    const targetUrl = body.urls && body.urls.length > 0 ? body.urls[0] : body.url;

    if (!targetUrl || !targetUrl.startsWith('http')) return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 });

    const html = await getHtmlContent(targetUrl);
    const htmlByteSize = getByteSize(html);
    const dom = new JSDOM(html);
    const head = dom.window.document.head;
    
    if (!head) return NextResponse.json({ error: 'No <head> found.' }, { status: 422 });

    const headByteSize = getByteSize(head.outerHTML);
    const originalElements: ElementRecord[] = [];
    const violations: ViolationRecord[] = [];
    let lowestWeightSeen = 11;

    Array.from(head.children).forEach((el) => {
      const weight = getElementWeight(el);
      const outerHTML = el.outerHTML.trim();
      const elByteSize = getByteSize(outerHTML);
      
      const elementData: ElementRecord = { tagName: el.tagName.toLowerCase(), weight, html: outerHTML, color: COLORS[weight] || COLORS[WEIGHTS.OTHER], sizeInBytes: elByteSize };
      originalElements.push(elementData);

      if ((elementData.tagName === 'script' || elementData.tagName === 'style') && elByteSize > 50000) {
          violations.push({
              element: elementData.tagName,
              html: elementData.html,
              severity: 'High',
              impactedMetric: 'Googlebot Indexing (2 MB Limit)',
              issue: `Massive inline ${elementData.tagName} (${Math.round(elByteSize/1024)} KB) threatens the 2 MB Googlebot HTML fetch limit.`,
              recommendation: `Extract this inline block into an external file.`
          });
      }

      if (weight < lowestWeightSeen) {
        lowestWeightSeen = weight;
      } else if (weight > lowestWeightSeen) {
        const blocker = originalElements.find(e => e.weight === lowestWeightSeen);
        violations.push({
          element: elementData.tagName,
          html: elementData.html,
          severity: weight - lowestWeightSeen > 4 ? 'High' : 'Medium',
          impactedMetric: (weight === WEIGHTS.SYNC_STYLES || weight === WEIGHTS.IMPORT_STYLES) ? 'FCP' : (weight === WEIGHTS.PRECONNECT || weight === WEIGHTS.PRELOAD) ? 'LCP' : 'Parsing & SEO',
          issue: `Critical asset blocked by lower-priority tag (${lowestWeightSeen}).`,
          recommendation: `Move this <${elementData.tagName}> above the blocking <${blocker?.tagName || 'element'}>.`
        });
      }
    });

    const optimizedElements = [...originalElements].map(el => {
      if ((el.tagName === 'script' || el.tagName === 'style') && el.sizeInBytes > 50000) {
        return { ...el, html: `<!-- Extracted inline ${el.tagName} (${Math.round(el.sizeInBytes / 1024)}KB) to external file for Googlebot Limits -->` };
      }
      return el;
    }).sort((a, b) => b.weight - a.weight);
    
    const optimizedHtmlSnippet = `<head>\n${optimizedElements.map(el => `  ${el.html}`).join('\n')}\n</head>`;
    const optimizedHeadByteSize = getByteSize(optimizedHtmlSnippet);
    const optimizedHtmlByteSize = htmlByteSize - headByteSize + optimizedHeadByteSize;

    return NextResponse.json({
      url: targetUrl,
      score: originalElements.length === 0 ? 100 : Math.max(0, Math.round(((originalElements.length - violations.length) / originalElements.length) * 100)),
      violations,
      originalElements,
      optimizedElements,
      optimizedHtmlSnippet,
      crawlerLimits: {
        htmlByteSize,
        headByteSize,
        headPercentage: Math.round((headByteSize / htmlByteSize) * 100),
        optimizedHtmlByteSize,
        optimizedHeadByteSize,
        optimizedHeadPercentage: Math.round((optimizedHeadByteSize / optimizedHtmlByteSize) * 100)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}