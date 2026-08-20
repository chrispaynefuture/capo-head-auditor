/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { Search, Copy, Download, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Activity, Loader2, FileCode, Zap, Gauge, Play, ArrowRight, Database, ListChecks, HelpCircle, Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ElementData = { tagName: string; weight: number; html: string; color: string; sizeInBytes?: number };
type Violation = { element: string; html: string; issue: string; recommendation: string; severity: string; impactedMetric: string };
type AuditResult = {
  url: string;
  score: number;
  violations: Violation[];
  originalElements: ElementData[];
  optimizedElements: ElementData[];
  optimizedHtmlSnippet: string;
  crawlerLimits?: {
    htmlByteSize: number;
    headByteSize: number;
    headPercentage: number;
    optimizedHtmlByteSize: number;
    optimizedHeadByteSize: number;
    optimizedHeadPercentage: number;
  };
};

type PageSpeedResult = {
  url: string;
  performanceScore: number;
  metrics: {
    fcp: string;
    fcpNumeric: number;
    lcp: string;
    lcpNumeric: number;
    cls: string;
    tbt: string;
    speedIndex: string;
  };
};

type RealWorldValidation = {
  originalFcpMs: number;
  optimizedFcpMs: number;
  fcpDiffMs: number;
  fcpImprovementPct: number;
  originalDomInteractiveMs: number;
  optimizedDomInteractiveMs: number;
};

const LEGEND_ITEMS = [
  { label: 'Meta Tags', weight: 10, color: '#9e0142' },
  { label: 'Title Tag', weight: 9, color: '#d53e4f' },
  { label: 'Preconnect', weight: 8, color: '#f46d43' },
  { label: 'Async Scripts', weight: 7, color: '#fdae61' },
  { label: 'Import Styles', weight: 6, color: '#fee08b' },
  { label: 'Sync Scripts', weight: 5, color: '#e6f598' },
  { label: 'Sync Stylesheets', weight: 4, color: '#abdda4' },
  { label: 'Preload / Modulepreload', weight: 3, color: '#66c2a5' },
  { label: 'Defer Scripts', weight: 2, color: '#3288bd' },
  { label: 'Prefetch / Prerender', weight: 1, color: '#5e4fa2' },
  { label: 'Other Elements', weight: 0, color: '#cccccc' }
];

export default function Auditor() {
  const [url, setUrl] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Single Mode States
  const [result, setResult] = useState<AuditResult | null>(null);
  const [psiLoading, setPsiLoading] = useState(false);
  const [realWorldLoading, setRealWorldLoading] = useState(false);
  const [psiResult, setPsiResult] = useState<PageSpeedResult | null>(null);
  const [realWorldResult, setRealWorldResult] = useState<RealWorldValidation | null>(null);

  // Batch Mode States
  const [batchResults, setBatchResults] = useState<AuditResult[] | null>(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');

  // Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setBatchResults(null);
    setPsiResult(null);
    setRealWorldResult(null);

    try {
      if (isBatchMode) {
        const urlsToProcess = batchUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
        if (urlsToProcess.length === 0) throw new Error('Please enter valid URLs starting with http:// or https://');
        
        setBatchProgress({ current: 0, total: urlsToProcess.length });
        const resultsArray: AuditResult[] = [];

        for (let i = 0; i < urlsToProcess.length; i++) {
          setBatchProgress({ current: i + 1, total: urlsToProcess.length });
          try {
            const res = await fetch('/api/audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: urlsToProcess[i] }),
            });
            if (res.ok) {
              const data: AuditResult = await res.json();
              resultsArray.push(data);
            } else {
               console.error(`Failed to audit ${urlsToProcess[i]}`);
            }
          } catch (err) {
            console.error(`Error auditing ${urlsToProcess[i]}:`, err);
          }
        }
        setBatchResults(resultsArray);
      } else {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to analyze URL');
        }

        const data: AuditResult = await res.json();
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  const runPageSpeedBenchmark = async () => { 
    if (!result?.url) return;
    setPsiLoading(true);
    try {
      const res = await fetch('/api/pagespeed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: result.url }) });
      if (!res.ok) throw new Error('Failed to fetch PageSpeed data');
      const data = await res.json();
      setPsiResult(data);
    } catch (err: any) {
      alert(`PageSpeed Error: ${err.message}`);
    } finally {
      setPsiLoading(false);
    }
  };

  const runRealWorldValidation = async () => { 
    if (!result) return;
    setRealWorldLoading(true);
    try {
      const res = await fetch('/api/validate-realworld', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: result.url, optimizedHtmlSnippet: result.optimizedHtmlSnippet }) });
      if (!res.ok) throw new Error('Real-world validation failed');
      const data = await res.json();
      setRealWorldResult(data);
    } catch (err: any) {
      alert(`Validation Error: ${err.message}`);
    } finally {
      setRealWorldLoading(false);
    }
  };

  const copyToClipboard = () => { if (result) navigator.clipboard.writeText(result.optimizedHtmlSnippet); };

  const downloadReport = (type: 'json' | 'csv') => {
    if (!result) return;
    let content = ''; let filename = `-audit-${new URL(result.url).hostname}`;
    if (type === 'json') { content = JSON.stringify({ ...result, pageSpeed: psiResult, realWorldValidation: realWorldResult }, null, 2); filename += '.json'; }
    else { content = 'Tag,Weight,Status,Severity,ImpactedMetric,HTML\n' + result.originalElements.map(el => { const v = result.violations.find(v => v.html === el.html); return `${el.tagName},${el.weight},${v ? 'Violation' : 'OK'},${v?.severity || 'None'},${v?.impactedMetric || 'None'},"${el.html.replace(/"/g, '""')}"`; }).join('\n'); filename += '.csv'; }
    const blob = new Blob([content], { type: 'text/plain' }); const urlBlob = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = urlBlob; a.download = filename; a.click(); URL.revokeObjectURL(urlBlob);
  };

  const downloadBatchCsv = () => {
    if (!batchResults || batchResults.length === 0) return;
    const header = 'URL,Score,Tags Analyzed,Violations,High Severity,HTML Size (MB),Head Size (MB),Crawl Horizon Status\n';
    const rows = batchResults.map(r => {
      const highSev = r.violations.filter(v => v.severity === 'High').length;
      const htmlMb = r.crawlerLimits ? (r.crawlerLimits.htmlByteSize / 1024 / 1024).toFixed(2) : 'N/A';
      const headMb = r.crawlerLimits ? (r.crawlerLimits.headByteSize / 1024 / 1024).toFixed(2) : 'N/A';
      const status = r.crawlerLimits && r.crawlerLimits.htmlByteSize > 2000000 ? 'WARNING (>2MB)' : 'OK';
      return `"${r.url}",${r.score}%,${r.originalElements.length},${r.violations.length},${highSev},${htmlMb},${headMb},${status}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/plain' });
    const urlBlob = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = urlBlob; a.download = '-batch-audit.csv'; a.click(); URL.revokeObjectURL(urlBlob);
  };

  const faqs = [
    {
      question: "Why does <head> element order matter?",
      answer: "Browsers parse HTML linearly. Placing render-blocking scripts or styles above critical meta tags or preconnect links delays painting content to the screen, damaging First Contentful Paint (FCP) and Largest Contentful Paint (LCP)."
    },
    {
      question: "How does the Order Score work?",
      answer: "The score evaluates tag weights from highest (10 - Meta Tags) to lowest (0 - Other). If a lower-priority tag sits above a critical high-priority tag, it triggers an order violation and lowers your score."
    },
    {
      question: "What is the 2 MB Crawl Horizon Limit?",
      answer: "Googlebot only fetches up to 2 MB of initial HTML. Massive inline scripts or CSS in your <head> consume this budget rapidly, which can lead to indexation drops or missing page elements."
    },
    {
      question: "How do I implement the fix?",
      answer: "Click 'Copy Optimized HTML' in Export Actions and replace your current <head> section with the optimized snippet. You can also export full reports via CSV/JSON for engineering hand-offs."
    }
  ];

  // Estimated Parse Time calculation for Timeline Axis
  const estCurrentTimeMs = psiResult?.metrics.fcpNumeric || (realWorldResult ? realWorldResult.originalFcpMs : 1250);
  const estOptTimeMs = realWorldResult ? realWorldResult.optimizedFcpMs : Math.round(estCurrentTimeMs * 0.48);
  const timeSavedMs = Math.max(0, estCurrentTimeMs - estOptTimeMs);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-slate-800 bg-slate-900/50 pt-16 pb-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-bold text-white tracking-tight">&lt;head&gt; Analyser</h1>
          </div>
          <p className="text-slate-400 mb-8 max-w-2xl">
            Analyze, visualize, and optimize the ordering of your document&apos;s &lt;head&gt; elements to drastically improve First Contentful Paint.
          </p>

          <form onSubmit={handleAudit} className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300">Target URL{isBatchMode ? 's' : ''}</label>
              <button type="button" onClick={() => setIsBatchMode(!isBatchMode)} className="text-xs text-indigo-400 hover:text-indigo-300 transition">
                Toggle {isBatchMode ? 'Single URL' : 'Batch Mode'}
              </button>
            </div>
            
            <div className="flex gap-4">
              {isBatchMode ? (
                <textarea
                  value={batchUrls}
                  onChange={(e) => setBatchUrls(e.target.value)}
                  placeholder="https://example.com&#10;https://example.com/about"
                  className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none font-mono text-sm"
                  required
                />
              ) : (
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-website.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-12 pr-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                    required
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 h-[50px] whitespace-nowrap disabled:opacity-50"
              >
                {loading && !isBatchMode && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading && isBatchMode && <span className="text-sm font-mono">{batchProgress.current} / {batchProgress.total}</span>}
                {!loading && 'Run Audit'}
              </button>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </form>
        </div>
      </header>

      {/* --- BATCH RESULTS VIEW --- */}
      {batchResults && (
        <main className="max-w-6xl mx-auto px-6 py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
             <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                <ListChecks className="w-6 h-6 text-indigo-400" />
                Batch Audit Results
             </h2>
             <button onClick={downloadBatchCsv} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <Download className="w-4 h-4" /> Download Batch CSV
             </button>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/50 text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">URL</th>
                    <th className="px-6 py-4 font-medium text-center">Score</th>
                    <th className="px-6 py-4 font-medium text-center">Violations</th>
                    <th className="px-6 py-4 font-medium text-right">HTML Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {batchResults.map((res, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4 font-mono text-indigo-300 truncate max-w-xs" title={res.url}>{new URL(res.url).pathname}</td>
                      <td className="px-6 py-4 text-center">
                         <span className={cn("font-bold", res.score > 80 ? "text-green-400" : res.score > 50 ? "text-yellow-400" : "text-red-400")}>{res.score}%</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className={res.violations.length > 0 ? "text-red-400" : "text-green-400"}>{res.violations.length}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                         {res.crawlerLimits && (
                            <span className={res.crawlerLimits.htmlByteSize > 2000000 ? "text-red-400 font-bold" : "text-slate-300"}>
                               {(res.crawlerLimits.htmlByteSize / 1024 / 1024).toFixed(2)} MB
                            </span>
                         )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* --- SINGLE RESULT VIEW --- */}
      {result && !batchResults && (
        <main className="max-w-6xl mx-auto px-6 py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Top 3 Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-center">
              <span className="text-sm font-medium text-slate-400 mb-2">Order Score</span>
              <div className="flex items-end gap-3"><span className={cn("text-5xl font-bold", result.score > 80 ? "text-green-400" : result.score > 50 ? "text-yellow-400" : "text-red-400")}>{result.score}%</span></div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-center">
              <span className="text-sm font-medium text-slate-400 mb-2">Tags Analyzed</span>
              <span className="text-4xl font-bold text-slate-100">{result.originalElements.length}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-center">
              <span className="text-sm font-medium text-slate-400 mb-2">Order Violations</span>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-red-400">{result.violations.length}</span>
                {result.violations.length === 0 && <CheckCircle2 className="w-8 h-8 text-green-500" />}
              </div>
            </div>
          </div>

          {/* Full-width Crawl Horizon Warning */}
          {result.crawlerLimits && (
            <div className={cn("w-full border rounded-xl p-6 mb-8 flex flex-col justify-center transition-colors", result.crawlerLimits.htmlByteSize > 2000000 ? "bg-red-950/20 border-red-900/50" : "bg-slate-900 border-slate-800")}>
              <span className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                <Database className="w-4 h-4" /> Crawl Horizon
              </span>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={cn("text-3xl font-bold", result.crawlerLimits.htmlByteSize > 2000000 ? "text-red-500" : "text-slate-100")}>
                  {(result.crawlerLimits.htmlByteSize / 1024 / 1024).toFixed(2)} MB
                </span>
                <span className="text-sm text-slate-500">/ 2.0 MB Max</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-800/80">
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  <span className="text-xs text-slate-400 block font-medium mb-1">Current &lt;head&gt; Allowance</span>
                  <span className="text-lg font-bold text-red-400">{result.crawlerLimits.headPercentage}% of 2 MB Crawl Budget</span>
                  <span className="text-xs text-slate-500 block mt-0.5">({(result.crawlerLimits.headByteSize / 1024).toFixed(1)} KB)</span>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  <span className="text-xs text-slate-400 block font-medium mb-1">Optimized &lt;head&gt; Allowance</span>
                  <span className="text-lg font-bold text-green-400">{result.crawlerLimits.optimizedHeadPercentage}% of 2 MB Crawl Budget</span>
                  <span className="text-xs text-slate-500 block mt-0.5">({(result.crawlerLimits.optimizedHeadByteSize / 1024).toFixed(1)} KB)</span>
                </div>
              </div>
            </div>
          )}

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2"><Gauge className="w-5 h-5 text-indigo-400" /> Live Core Web Vitals Benchmark</h2>
                <p className="text-sm text-slate-400 mt-1">Run Google PageSpeed Insights on the live target URL.</p>
              </div>
              <button onClick={runPageSpeedBenchmark} disabled={psiLoading} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 shrink-0 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                {psiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
                {psiResult ? 'Re-run PSI Benchmark' : 'Run PSI Benchmark'}
              </button>
            </div>
            {psiResult && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-slate-800">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">Lighthouse Score</span><span className={cn("text-2xl font-bold", psiResult.performanceScore > 80 ? "text-green-400" : psiResult.performanceScore > 50 ? "text-yellow-400" : "text-red-400")}>{psiResult.performanceScore}/100</span></div>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">First Contentful Paint</span><span className="text-xl font-bold text-slate-200">{psiResult.metrics.fcp}</span></div>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">Largest Contentful Paint</span><span className="text-xl font-bold text-slate-200">{psiResult.metrics.lcp}</span></div>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800"><span className="text-xs text-slate-400 block mb-1">Total Blocking Time</span><span className="text-xl font-bold text-slate-200">{psiResult.metrics.tbt}</span></div>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 col-span-2 md:col-span-1"><span className="text-xs text-slate-400 block mb-1">Speed Index</span><span className="text-xl font-bold text-slate-200">{psiResult.metrics.speedIndex}</span></div>
              </div>
            )}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2"><Play className="w-5 h-5 text-indigo-400 fill-indigo-400/20" /> Real-World Headless Chrome Validation</h2>
                <p className="text-sm text-slate-400 mt-1">Executes a live browser test intercepting the HTML to swap the &lt;head&gt; in real-time.</p>
              </div>
              <div title={!psiResult ? "Run the PSI Benchmark before running the real world test." : ""}>
                <button onClick={runRealWorldValidation} disabled={realWorldLoading || !psiResult} className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                  {realWorldLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {realWorldResult ? 'Re-run Real-World Test' : 'Run Real-World Test'}
                </button>
              </div>
            </div>
            {realWorldResult && (
              <div className="pt-4 border-t border-slate-800 space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wider font-semibold text-indigo-400">Headless Chrome Test Results</span><span className="text-xs text-green-400 font-semibold bg-green-950/50 border border-green-800/50 px-3 py-1 rounded-full">{realWorldResult.fcpImprovementPct}% Faster First Contentful Paint</span></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div><span className="text-xs text-slate-400 block mb-1">First Contentful Paint (FCP)</span><div className="flex items-center gap-3 mt-1"><span className="text-slate-400 text-lg">{realWorldResult.originalFcpMs} ms</span><ArrowRight className="w-4 h-4 text-slate-500" /><span className="text-2xl font-bold text-green-400">{realWorldResult.optimizedFcpMs} ms</span></div></div>
                    <span className="text-sm font-bold text-green-400 bg-green-950/40 px-3 py-1.5 rounded border border-green-900/50">-{realWorldResult.fcpDiffMs} ms</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Tag Order Visualization Section with Horizontal Timeline Axis */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-slate-400" /> Tag Order Visualization
              </h2>
              <div className="flex items-center gap-2 text-xs font-mono text-indigo-300 bg-indigo-950/50 border border-indigo-800/40 px-3 py-1 rounded-full">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Est. Delta: -{timeSavedMs} ms (~{Math.round((timeSavedMs / estCurrentTimeMs) * 100)}% faster FCP)</span>
              </div>
            </div>

            <div className="space-y-6">
              {/* Current Order Bar */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-slate-400 uppercase tracking-wider font-semibold">Current Order</label>
                  <span className="text-xs font-mono text-red-400">Parse Finish: ~{estCurrentTimeMs} ms</span>
                </div>
                <div className="relative flex h-12 w-full rounded overflow-hidden shadow-inner bg-slate-950 border border-slate-800">
                  {result.originalElements.map((el, i) => (
                    <div key={i} className="h-full border-r border-slate-950/20 hover:opacity-80 transition cursor-help" style={{ width: `${100 / result.originalElements.length}%`, backgroundColor: el.color }} title={`<${el.tagName}> (Weight: ${el.weight})`} />
                  ))}
                </div>
              </div>

              {/* Optimal Order Bar */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-slate-400 uppercase tracking-wider font-semibold">Optimal Order</label>
                  <span className="text-xs font-mono text-green-400">Parse Finish: ~{estOptTimeMs} ms (-{timeSavedMs} ms)</span>
                </div>
                <div className="relative flex h-12 w-full rounded overflow-hidden shadow-inner bg-slate-950 border border-slate-800">
                  {result.optimizedElements.map((el, i) => (
                    <div key={i} className="h-full border-r border-slate-950/20 hover:opacity-80 transition cursor-help" style={{ width: `${100 / result.optimizedElements.length}%`, backgroundColor: el.color }} title={`<${el.tagName}> (Weight: ${el.weight})`} />
                  ))}
                </div>
              </div>

              {/* Horizontal Parse Timeline Axis */}
              <div className="pt-2">
                <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1 px-1">
                  <span>0 ms (Navigation Start)</span>
                  <span>~{Math.round(estCurrentTimeMs * 0.25)} ms</span>
                  <span>~{Math.round(estCurrentTimeMs * 0.5)} ms</span>
                  <span>~{Math.round(estCurrentTimeMs * 0.75)} ms</span>
                  <span className="text-slate-300 font-semibold">~{estCurrentTimeMs} ms (FCP)</span>
                </div>
                {/* Visual Axis Line with Tick Marks */}
                <div className="relative w-full h-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between px-1">
                  <div className="w-1 h-2 bg-indigo-500/80 rounded" />
                  <div className="w-1 h-1.5 bg-slate-700 rounded" />
                  <div className="w-1 h-1.5 bg-slate-700 rounded" />
                  <div className="w-1 h-1.5 bg-slate-700 rounded" />
                  <div className="w-1 h-2 bg-red-500/80 rounded" />
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 text-green-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                    Optimized First Contentful Paint: ~{estOptTimeMs} ms
                  </span>
                  <span className="flex items-center gap-1.5 text-red-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                    Current First Contentful Paint: ~{estCurrentTimeMs} ms
                  </span>
                </div>
              </div>

              {/* Color Key / Legend */}
              <div className="pt-4 border-t border-slate-800/80">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3">Tag Weight Color Legend</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {LEGEND_ITEMS.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-950/60 p-2 rounded border border-slate-800/60 text-xs">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-300 truncate" title={`${item.label} (Wgt ${item.weight})`}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-slate-800 bg-slate-900/50"><h2 className="text-xl font-semibold text-white flex items-center gap-2"><FileCode className="w-5 h-5 text-slate-400" /> Detailed Tag Inspector</h2></div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/50 text-slate-400 sticky top-0 backdrop-blur-sm z-10">
                    <tr><th className="px-6 py-4 font-medium w-16">Wgt</th><th className="px-6 py-4 font-medium w-24">Tag</th><th className="px-6 py-4 font-medium">Source & Recommendations</th><th className="px-6 py-4 font-medium w-28">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {result.originalElements.map((el, idx) => {
                      const violation = result.violations.find(v => v.html === el.html);
                      return (
                        <tr key={idx} className={cn("hover:bg-slate-800/30 transition", violation && "bg-red-950/10")}>
                          <td className="px-6 py-4 align-top"><span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-slate-900" style={{ backgroundColor: el.color }}>{el.weight}</span></td>
                          <td className="px-6 py-4 font-mono text-indigo-300 align-top">{el.tagName}</td>
                          <td className="px-6 py-4 align-top"><code className="text-slate-400 text-xs bg-slate-950 px-3 py-2 rounded border border-slate-800 block break-all max-w-lg overflow-hidden">{el.html}</code>{violation && (<div className="mt-3 space-y-2 bg-slate-950/50 p-3 rounded-lg border border-red-900/30"><p className="text-red-400 text-xs flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="font-medium">{violation.issue}</span></p><p className="text-indigo-300 text-xs flex items-start gap-2"><Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span><strong>Fix:</strong> {violation.recommendation}</span></p></div>)}</td>
                          <td className="px-6 py-4 align-top">{violation ? (<span className={cn("inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border", violation.severity === 'High' ? "bg-red-900/50 text-red-400 border-red-800/50" : violation.severity === 'Medium' ? "bg-yellow-900/50 text-yellow-400 border-yellow-800/50" : "bg-orange-900/50 text-orange-400 border-orange-800/50")}>{violation.severity}</span>) : (<span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-900/50 text-green-400 border border-green-800/50">OK</span>)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Sidebar Column: Export Actions + Accordion FAQ/Guide */}
            <aside className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
                <h3 className="text-lg font-semibold text-white mb-2">Export Actions</h3>
                <button onClick={copyToClipboard} className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 rounded-lg text-sm font-medium transition"><span className="flex items-center gap-2"><Copy className="w-4 h-4" /> Copy Optimized HTML</span><ChevronRight className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => downloadReport('json')} className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 rounded-lg text-sm font-medium transition"><span className="flex items-center gap-2"><Download className="w-4 h-4" /> Download JSON Report</span><ChevronRight className="w-4 h-4 text-slate-500" /></button>
                <button onClick={() => downloadReport('csv')} className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 rounded-lg text-sm font-medium transition"><span className="flex items-center gap-2"><Download className="w-4 h-4" /> Download CSV Export</span><ChevronRight className="w-4 h-4 text-slate-500" /></button>
              </div>

              {/* Accordion FAQ / Readme Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 pb-2 border-b border-slate-800">
                  <HelpCircle className="w-5 h-5" />
                  <h3 className="text-lg font-semibold text-white">Guide & FAQ</h3>
                </div>

                <div className="space-y-3 pt-1">
                  {faqs.map((faq, idx) => (
                    <div key={idx} className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/40">
                      <button
                        onClick={() => toggleFaq(idx)}
                        className="w-full text-left p-3 flex items-center justify-between text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800/30 transition"
                      >
                        <span className="pr-2">{faq.question}</span>
                        {openFaq === idx ? (
                          <ChevronDown className="w-4 h-4 shrink-0 text-indigo-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" />
                        )}
                      </button>
                      {openFaq === idx && (
                        <div className="p-3 pt-0 text-xs text-slate-400 border-t border-slate-800/50 bg-slate-950/80 leading-relaxed">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
