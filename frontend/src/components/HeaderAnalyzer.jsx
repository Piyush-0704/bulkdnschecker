import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSearch, FiCode, FiAward, FiCheckCircle, FiXCircle, FiRefreshCw } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

export default function HeaderAnalyzer() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await axios.get(`${BACKEND_URL}/api/header-analyzer?domain=${domain.trim()}`);
      setResult(response.data);
      if (response.data.success) {
        toast.success('HTTP Header analysis complete.');
      } else {
        toast.error(`Analysis failed: ${response.data.error}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error analyzing website headers.');
    } finally {
      setLoading(false);
    }
  };

  const getGradeClass = (grade) => {
    if (grade.startsWith('A')) return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
    if (grade === 'B') return 'text-blue-400 border-blue-500/20 bg-blue-500/5';
    if (grade === 'C') return 'text-amber-500 border-amber-500/20 bg-amber-500/5';
    return 'text-rose-500 border-rose-500/20 bg-rose-500/5';
  };

  const headerDescriptions = {
    'Content-Security-Policy': 'Mitigates Cross-Site Scripting (XSS) and data injection attacks by restricting resources that can load on your site.',
    'Strict-Transport-Security': 'Forces connections over secure HTTPS instead of HTTP, preventing eavesdropping and man-in-the-middle attacks.',
    'X-Frame-Options': 'Protects against clickjacking attempts by specifying whether the page can render inside an iframe.',
    'X-Content-Type-Options': 'Stops browsers from sniffing MIME types away from declared headers, protecting against script injection.',
    'Referrer-Policy': 'Controls what referrer information is sent along with requests made from your site.',
    'Permissions-Policy': 'Allows web developers to selectively enable, disable, and modify browser features and APIs.',
    'Server-Header': 'Disclosing detailed server application headers (e.g. Apache, Nginx, PHP version) helps attackers find software vulnerabilities.'
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Website Header Analyzer</h2>
        <p className="text-slate-400 text-sm font-medium">Verify the deployment and health of secure HTTP headers on target websites to prevent client-side exploits.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">Website Domain</label>
              <input
                type="text"
                placeholder="e.g. google.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="glow-btn-purple w-full py-3"
            >
              {loading ? (
                <>
                  <FiRefreshCw className="animate-spin text-lg" />
                  <span>Requesting Headers...</span>
                </>
              ) : (
                <>
                  <FiCode className="text-lg" />
                  <span>Analyze Security Headers</span>
                </>
              )}
            </button>
          </form>

          <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
            <strong>About HTTP Security Headers:</strong> HTTP response headers provide guidelines to user browsers on how to execute script boundaries, control frames, structure caching, and load external components securely.
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {result && result.success && (
            <div className="space-y-6">
              {/* Score and Grade Banner */}
              <div className={`glass-panel p-6 flex flex-col sm:flex-row items-center gap-5 border shadow-lg ${getGradeClass(result.grade)}`}>
                <div className="p-4 rounded-full bg-slate-950/40 border border-slate-900 flex items-center justify-center shrink-0 w-20 h-20 shadow-inner">
                  <FiAward className="text-3xl text-purple-400" />
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-lg font-bold text-white leading-none mb-1.5">{domain}</h3>
                  <p className="text-xs text-slate-400 font-semibold">
                    HTTP Response Status Code: <span className="font-mono text-cyan-300 font-bold">{result.statusCode}</span>
                  </p>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-cyan-500 h-full rounded-full"
                      style={{ width: `${(result.score / result.maxScore) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Grade display */}
                <div className="flex flex-col items-center justify-center shrink-0 w-24 h-24 rounded-2xl bg-slate-950/40 border border-slate-900/80 shadow-inner">
                  <span className="text-3xl font-extrabold tracking-tight">{result.grade}</span>
                  <span className="text-[10px] text-slate-500 font-bold mt-1 tracking-wider uppercase">Grade Score</span>
                </div>
              </div>

              {/* Individual Header Status Check */}
              <div className="glass-panel p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Detailed Security Auditing</h3>
                
                <div className="space-y-4 divide-y divide-slate-900/60">
                  {Object.entries(result.analysis).map(([header, status], idx) => {
                    const isMissing = status === 'Missing';
                    const isServerHeader = header === 'Server-Header';
                    const isGood = isServerHeader ? status === 'Not Disclosed' : status === 'Present';
                    
                    return (
                      <div key={idx} className={`pt-4 ${idx === 0 ? 'pt-0' : ''} flex flex-col sm:flex-row items-start justify-between gap-4`}>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-200 font-mono">{header}</span>
                            <span className={`status-badge text-[9px] ${
                              isGood 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : isServerHeader 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-normal mt-1 font-medium">
                            {headerDescriptions[header]}
                          </p>
                        </div>
                        
                        <div className="shrink-0 pt-0.5">
                          {isGood ? (
                            <FiCheckCircle className="text-emerald-400 text-lg" />
                          ) : (
                            <FiXCircle className="text-rose-400 text-lg" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Raw Response Headers Dump */}
              <div className="glass-panel p-6 space-y-3">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Raw Response Headers</h3>
                <pre className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl text-xs font-mono text-cyan-300 overflow-x-auto max-h-72 leading-relaxed shadow-inner">
                  {JSON.stringify(result.rawHeaders, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {result && !result.success && (
            <div className="glass-panel p-6 border-rose-500/20 bg-rose-500/5 text-center flex flex-col items-center justify-center min-h-[300px]">
              <FiXCircle className="text-5xl text-rose-500 mb-4 animate-pulse" />
              <h3 className="font-bold text-rose-400 m-0">Failed connection</h3>
              <p className="text-xs text-rose-300/80 max-w-sm mt-3.5 leading-relaxed font-semibold">
                An error occurred attempting to fetch website headers. Please ensure the domain name is correct and hosts an active web server listening on port 443.
              </p>
              <div className="bg-slate-950 border border-slate-900 px-4 py-2.5 rounded-lg font-mono text-xs text-rose-400 mt-5 font-bold">
                Error Code: {result.error || 'Connection Timeout'}
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
              <FiCode className="text-4xl text-slate-700 mb-4" />
              <h3 className="font-bold text-slate-400 m-0">Awaiting Request Input</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Enter a site domain on the sidebar panel to audit HTTP headers, inspect cookie structures, and rate vulnerability indices.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
