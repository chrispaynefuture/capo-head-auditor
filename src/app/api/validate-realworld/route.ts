/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(req: Request) {
  try {
    const { url, optimizedHtmlSnippet } = await req.json();

    if (!url || !optimizedHtmlSnippet) {
      return NextResponse.json({ error: 'URL and optimized HTML are required.' }, { status: 400 });
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // --- 1. Measure Baseline (Original URL) ---
    const originalPage = await browser.newPage();
    const originalClient = await originalPage.target().createCDPSession();
    
    // Simulate Fast 4G Network & Mobile Viewport
    await originalClient.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 100,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
    });
    await originalPage.setViewport({ width: 390, height: 844, isMobile: true });

    await originalPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const originalMetrics = await originalPage.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        fcp: Math.round(fcp),
        domInteractive: Math.round(nav?.domInteractive || 0),
      };
    });
    await originalPage.close();

    // --- 2. Measure Optimized (<head> Intercepted) ---
    const optimizedPage = await browser.newPage();
    const optimizedClient = await optimizedPage.target().createCDPSession();
    
    await optimizedClient.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 100,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
    });
    await optimizedPage.setViewport({ width: 390, height: 844, isMobile: true });

    // Intercept main HTML document response and swap <head>
    await optimizedPage.setRequestInterception(true);
    optimizedPage.on('request', async (interceptedRequest) => {
      if (interceptedRequest.url() === url && interceptedRequest.isNavigationRequest()) {
        try {
          const fetchRes = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15' }
          });
          let html = await fetchRes.text();

          // Swap <head> section
          html = html.replace(/<head[\s\S]*?<\/head>/i, optimizedHtmlSnippet);

          interceptedRequest.respond({
            status: 200,
            contentType: 'text/html',
            body: html,
          });
        } catch {
          interceptedRequest.continue();
        }
      } else {
        interceptedRequest.continue();
      }
    });

    await optimizedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const optimizedMetrics = await optimizedPage.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        fcp: Math.round(fcp),
        domInteractive: Math.round(nav?.domInteractive || 0),
      };
    });

    await browser.close();

    // Calculate Millisecond & Percentage Improvement
    const fcpDiffMs = originalMetrics.fcp - optimizedMetrics.fcp;
    const fcpImprovementPct = originalMetrics.fcp > 0 
      ? Math.max(0, Math.round((fcpDiffMs / originalMetrics.fcp) * 100)) 
      : 0;

    return NextResponse.json({
      originalFcpMs: originalMetrics.fcp,
      optimizedFcpMs: optimizedMetrics.fcp,
      fcpDiffMs,
      fcpImprovementPct,
      originalDomInteractiveMs: originalMetrics.domInteractive,
      optimizedDomInteractiveMs: optimizedMetrics.domInteractive,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Real-world validation failed.' }, { status: 500 });
  }
}