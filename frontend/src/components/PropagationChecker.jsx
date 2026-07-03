import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSearch, FiGlobe, FiCheckCircle, FiXCircle, FiRefreshCw } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

export default function PropagationChecker() {
  const [domain, setDomain] = useState('');
  const [recordType, setRecordType] = useState('A');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const response = await axios.get(`${BACKEND_URL}/api/propagation?domain=${domain.trim()}&type=${recordType}`);
      setResults(response.data);
      toast.success('Propagation check completed.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error checking DNS propagation.');
    } finally {
      setLoading(false);
    }
  };

  const availableRecordTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">DNS Propagation Checker</h2>
        <p className="text-slate-400 text-sm font-medium">Verify your DNS records across multiple major DNS resolver networks worldwide to check update propagation status.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="glass-panel p-6 space-y-5">
          <form onSubmit={handleCheck} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">Domain Name</label>
              <input
                type="text"
                placeholder="e.g. cloudflare.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">Record Type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {availableRecordTypes.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setRecordType(type)}
                    className={`py-2 text-xs font-bold rounded-lg border text-center transition-all ${
                      recordType === type
                        ? 'bg-purple-600 border-purple-500 text-white shadow shadow-purple-500/20'
                        : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="glow-btn-purple w-full py-3"
            >
              {loading ? (
                <>
                  <FiRefreshCw className="animate-spin text-lg" />
                  <span>Querying Resolvers...</span>
                </>
              ) : (
                <>
                  <FiGlobe className="text-lg" />
                  <span>Check Propagation</span>
                </>
              )}
            </button>
          </form>

          <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
            <strong>About DNS Propagation:</strong> When you update DNS records, it can take up to 48 hours for changes to propagate worldwide because of client and server caching behaviors.
          </div>
        </div>

        {/* Results Grid */}
        <div className="lg:col-span-2 space-y-6">
          {results && (
            <div className="glass-panel p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Propagation Resolution</h3>
                <span className="text-xs font-mono font-bold text-purple-300 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded-md">
                  {results.recordType} Record
                </span>
              </div>

              {/* Servers list */}
              <div className="space-y-4">
                {results.results.map((server, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950/40 p-4 rounded-xl border border-slate-900 hover:border-slate-800/80 transition-colors gap-3 shadow-inner">
                    <div className="flex items-center gap-3 min-w-0">
                      {server.success && server.addresses.length > 0 ? (
                        <FiCheckCircle className="text-emerald-400 text-xl shrink-0" />
                      ) : (
                        <FiXCircle className="text-rose-400 text-xl shrink-0" />
                      )}
                      
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-200">{server.server}</span>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5">{server.dnsIp}</span>
                      </div>
                    </div>

                    {/* Resolved records block */}
                    <div className="flex-1 sm:max-w-md bg-slate-950/80 border border-slate-900 rounded-lg p-2.5 font-mono text-[11px] text-cyan-300 overflow-x-auto select-all leading-normal">
                      {server.success && server.addresses.length > 0 ? (
                        server.addresses.map((addr, idx) => (
                          <div key={idx} className="break-all">{addr}</div>
                        ))
                      ) : (
                        <span className="text-slate-600 font-semibold italic">
                          {server.success ? 'No records returned (Empty)' : `Query error: ${server.error}`}
                        </span>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold font-mono text-slate-500">{server.timeMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!results && !loading && (
            <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
              <FiGlobe className="text-4xl text-slate-700 mb-4 animate-pulse" />
              <h3 className="font-bold text-slate-400 m-0">Awaiting Query Input</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Input a domain and select a record type on the control panel to view resolved values across global nameserver nodes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
