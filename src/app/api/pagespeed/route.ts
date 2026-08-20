import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Valid URL is required for PageSpeed test.' }, { status: 400 });
    }

    const apiKey = process.env.PAGESPEED_API_KEY?.trim();
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=PERFORMANCE&strategy=MOBILE${keyParam}`;

    const response = await fetch(psiUrl, { cache: 'no-store' });
    const responseText = await response.text();

    // Check if the response is actually JSON before parsing
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ 
        error: `Google API returned HTML instead of JSON (Status ${response.status}). Check that your API key is valid and PageSpeed Insights API is enabled in Google Cloud Console.` 
      }, { status: response.status || 500 });
    }

    if (!response.ok) {
      const googleErrorMessage = data.error?.message || response.statusText;
      return NextResponse.json({ 
        error: `Google API Error (${response.status}): ${googleErrorMessage}` 
      }, { status: response.status });
    }

    const lighthouse = data.lighthouseResult;
    if (!lighthouse) {
      return NextResponse.json({ error: 'Failed to retrieve Lighthouse audit results.' }, { status: 500 });
    }

    return NextResponse.json({
      url,
      performanceScore: Math.round((lighthouse.categories.performance?.score || 0) * 100),
      metrics: {
        fcp: lighthouse.audits['first-contentful-paint']?.displayValue || 'N/A',
        fcpNumeric: lighthouse.audits['first-contentful-paint']?.numericValue || 0,
        lcp: lighthouse.audits['largest-contentful-paint']?.displayValue || 'N/A',
        lcpNumeric: lighthouse.audits['largest-contentful-paint']?.numericValue || 0,
        cls: lighthouse.audits['cumulative-layout-shift']?.displayValue || 'N/A',
        tbt: lighthouse.audits['total-blocking-time']?.displayValue || 'N/A',
        speedIndex: lighthouse.audits['speed-index']?.displayValue || 'N/A',
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error running PageSpeed benchmark.' }, { status: 500 });
  }
}