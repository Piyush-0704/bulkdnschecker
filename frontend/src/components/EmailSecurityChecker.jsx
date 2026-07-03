import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSearch, FiShield, FiAlertTriangle, FiCheckCircle, FiXCircle, FiInfo, FiRefreshCw } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

export default function EmailSecurityChecker() {
  const [domain, setDomain] = useState('');
  const [dkimSelector, setDkimSelector] = useState('default');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await axios.get(`${BACKEND_URL}/api/email-security?domain=${domain.trim()}&dkimSelector=${dkimSelector.trim()}`);
      setResult(response.data);
      toast.success('Email security settings verified.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error resolving mail security keys.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Email Deliverability & Security</h2>
        <p className="text-slate-400 text-sm font-medium">Analyze SPF, DMARC, DKIM records, and DNSSEC keys to optimize SMTP relay trust and prevent email spoofing.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="glass-panel p-6 space-y-4">
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">Domain Name</label>
              <input
                type="text"
                placeholder="e.g. google.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">DKIM Selector</label>
              <input
                type="text"
                placeholder="default (e.g. google, mandrill)"
                value={dkimSelector}
                onChange={(e) => setDkimSelector(e.target.value)}
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
                  <span>Analyzing Records...</span>
                </>
              ) : (
                <>
                  <FiShield className="text-lg" />
                  <span>Verify Email Security</span>
                </>
              )}
            </button>
          </form>

          <div className="text-xs text-slate-500 leading-relaxed bg-slate-950/30 p-4 rounded-lg border border-slate-900/60 space-y-2">
            <div>
              <strong>SPF:</strong> Authorized mail servers list.
            </div>
            <div>
              <strong>DKIM:</strong> Cryptographic signatures for authenticity.
            </div>
            <div>
              <strong>DMARC:</strong> Action policy if SPF/DKIM validation fails.
            </div>
            <div>
              <strong>DNSSEC:</strong> Secure zone file chain validation.
            </div>
          </div>
        </div>

        {/* Results Workspace */}
        <div className="lg:col-span-2 space-y-6">
          {result && (
            <div className="space-y-5">
              {/* SPF Panel */}
              <div className="glass-panel p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <FiShield className="text-purple-400" />
                    <span>Sender Policy Framework (SPF)</span>
                  </h3>
                  {result.spf.found ? (
                    <span className="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Configured</span>
                  ) : (
                    <span className="status-badge bg-rose-500/10 text-rose-400 border border-rose-500/20">Missing</span>
                  )}
                </div>
                {result.spf.found ? (
                  <pre className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl text-xs font-mono text-cyan-300 break-all select-all shadow-inner">
                    {result.spf.records.join('\n')}
                  </pre>
                ) : (
                  <div className="text-xs text-slate-500 italic bg-slate-950/30 p-3 rounded-lg border border-slate-900/60 flex items-center gap-2 font-medium">
                    <FiAlertTriangle className="text-amber-500 shrink-0 text-sm" />
                    <span>No SPF TXT record was found. Spammers might spoof this domain.</span>
                  </div>
                )}
              </div>

              {/* DMARC Panel */}
              <div className="glass-panel p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <FiShield className="text-blue-400" />
                    <span>DMARC Authentication policy</span>
                  </h3>
                  {result.dmarc.found ? (
                    <span className="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Configured</span>
                  ) : (
                    <span className="status-badge bg-rose-500/10 text-rose-400 border border-rose-500/20">Missing</span>
                  )}
                </div>
                {result.dmarc.found ? (
                  <pre className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl text-xs font-mono text-cyan-300 break-all select-all shadow-inner">
                    {result.dmarc.records.join('\n')}
                  </pre>
                ) : (
                  <div className="text-xs text-slate-500 italic bg-slate-950/30 p-3 rounded-lg border border-slate-900/60 flex items-center gap-2 font-medium">
                    <FiAlertTriangle className="text-amber-500 shrink-0 text-sm" />
                    <span>No DMARC record configured under _dmarc.{domain}. Spoof policies default to none.</span>
                  </div>
                )}
              </div>

              {/* DKIM Panel */}
              <div className="glass-panel p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <FiShield className="text-cyan-400" />
                    <span>DomainKeys Identified Mail (DKIM)</span>
                  </h3>
                  {result.dkim.found ? (
                    <span className="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Configured</span>
                  ) : (
                    <span className="status-badge bg-amber-500/10 text-amber-400 border border-amber-500/20">Lookup Failed</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-semibold mb-1">
                  Selector: <span className="font-mono text-slate-300">{dkimSelector}</span>
                </div>
                {result.dkim.found ? (
                  <pre className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl text-xs font-mono text-cyan-300 break-all select-all shadow-inner">
                    {result.dkim.records.join('\n')}
                  </pre>
                ) : (
                  <div className="text-xs text-slate-500 italic bg-slate-950/30 p-3 rounded-lg border border-slate-900/60 flex items-center gap-2 font-medium">
                    <FiInfo className="text-blue-400 shrink-0 text-sm" />
                    <span>Could not find DKIM public keys at selector "{dkimSelector}". Try a different selector if active.</span>
                  </div>
                )}
              </div>

              {/* DNSSEC Panel */}
              <div className="glass-panel p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <FiShield className="text-emerald-400" />
                    <span>DNS Security Extensions (DNSSEC)</span>
                  </h3>
                  {result.dnssec.enabled ? (
                    <span className="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Enabled</span>
                  ) : (
                    <span className="status-badge bg-slate-900 text-slate-500 border border-slate-800">Disabled</span>
                  )}
                </div>
                {result.dnssec.enabled ? (
                  <div className="space-y-2.5">
                    {result.dnssec.dnskey.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">DNSKEY Records</span>
                        <div className="bg-slate-950/80 border border-slate-900 p-3.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed shadow-inner">
                          {result.dnssec.dnskey.map((key, i) => (
                            <div key={i} className="break-all">Flags: {key.flags}, Protocol: {key.protocol}, Algorithm: {key.algorithm}, Key: {key.key}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.dnssec.ds.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">DS Records</span>
                        <div className="bg-slate-950/80 border border-slate-900 p-3.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed shadow-inner">
                          {result.dnssec.ds.map((ds, i) => (
                            <div key={i} className="break-all">Key Tag: {ds.keyTag}, Algorithm: {ds.algorithm}, Digest Type: {ds.digestType}, Digest: {ds.digest}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic bg-slate-950/30 p-3 rounded-lg border border-slate-900/60 flex items-center gap-2 font-medium">
                    <FiInfo className="text-slate-500 shrink-0 text-sm" />
                    <span>No active DNSSEC chain signatures found (No DNSKEY/DS records resolved).</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
              <FiShield className="text-4xl text-slate-700 mb-4" />
              <h3 className="font-bold text-slate-400 m-0">Awaiting Analysis</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Submit a corporate or server domain to perform deep SPF, DMARC, selector DKIM, and cryptographic DNSSEC verification checking.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
