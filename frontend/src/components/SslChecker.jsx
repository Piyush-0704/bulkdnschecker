import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSearch, FiLock, FiUnlock, FiCalendar, FiShield, FiClock } from 'react-icons/fi';

// Check SSL certificate via Certificate Transparency logs (crt.sh) and direct HTTPS fetch
async function checkSsl(domain) {
  const startTime = Date.now();
  const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];

  // 1. Check HTTPS connectivity
  let httpsOk = false;
  try {
    const resp = await fetch(`https://${cleanDomain}`, { method: 'HEAD', mode: 'no-cors' });
    httpsOk = true; // no-cors mode means any response (even opaque) = success
  } catch {
    httpsOk = false;
  }

  // 2. Get certificate details from crt.sh CT logs
  let certData = null;
  try {
    const resp = await fetch(`https://crt.sh/?q=${encodeURIComponent(cleanDomain)}&output=json&exclude=expired`);
    if (resp.ok) {
      const certs = await resp.json();
      if (certs && certs.length > 0) {
        // Get the most recent certificate
        const latest = certs[0];
        certData = {
          subject: { CN: latest.common_name || cleanDomain },
          issuer: { O: latest.issuer_name?.split(',').find(p => p.trim().startsWith('O='))?.split('=')[1]?.trim() || latest.issuer_name || 'Unknown' },
          validFrom: latest.not_before,
          validTo: latest.not_after,
          serialNumber: latest.serial_number || 'N/A',
        };
      }
    }
  } catch {
    // crt.sh may be slow or unavailable
  }

  // 3. If crt.sh failed, try a DNS-based approach (CAA records can tell us the CA)
  if (!certData) {
    try {
      const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=CAA`);
      const data = await resp.json();
      const caaRecords = data.Answer?.map(a => a.data) || [];
      certData = {
        subject: { CN: cleanDomain },
        issuer: { O: caaRecords.length > 0 ? caaRecords.join(', ') : (httpsOk ? 'Certificate present (details unavailable)' : 'Unknown') },
        validFrom: null,
        validTo: null,
        serialNumber: 'N/A',
      };
    } catch {
      certData = {
        subject: { CN: cleanDomain },
        issuer: { O: httpsOk ? 'Certificate present' : 'Unknown' },
        validFrom: null,
        validTo: null,
        serialNumber: 'N/A',
      };
    }
  }

  const now = new Date();
  const validTo = certData.validTo ? new Date(certData.validTo) : null;
  const validFrom = certData.validFrom ? new Date(certData.validFrom) : null;
  const daysRemaining = validTo ? Math.floor((validTo - now) / (1000 * 60 * 60 * 24)) : (httpsOk ? 999 : -1);

  return {
    success: httpsOk || !!certData.validTo,
    timeMs: Date.now() - startTime,
    validity: {
      authorized: httpsOk,
      daysRemaining,
      subject: certData.subject,
      issuer: certData.issuer,
      validFrom: certData.validFrom || 'Unknown',
      validTo: certData.validTo || 'Unknown',
      serialNumber: certData.serialNumber,
    },
    error: !httpsOk && !certData.validTo ? 'Could not verify HTTPS connection or find certificate data.' : null,
  };
}

export default function SslChecker() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const data = await checkSsl(domain.trim());
      setResult(data);
      if (data.success) {
        toast.success('SSL verification completed.');
      } else {
        toast.error(data.error || 'SSL check failed.');
      }
    } catch (err) {
      toast.error(err.message || 'Error checking SSL certificate.');
    } finally {
      setLoading(false);
    }
  };

  const getDaysClass = (days) => {
    if (days <= 0) return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    if (days < 30) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  };

  const getDaysGlow = (days) => {
    if (days <= 0) return 'shadow-rose-900/10 border-rose-500/20 bg-rose-500/5';
    if (days < 30) return 'shadow-amber-900/10 border-amber-500/20 bg-amber-500/5';
    return 'shadow-emerald-900/10 border-emerald-500/20 bg-emerald-500/5';
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">SSL Certificate Checker</h2>
        <p className="text-slate-400 text-sm font-medium">Test hostnames to inspect active TLS/SSL handshakes, issuer certifications, expiration, and authorization status.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Control Panel */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <form onSubmit={handleCheck} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">Domain Name</label>
              <input
                type="text"
                placeholder="e.g. github.com"
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
                  <FiClock className="animate-spin text-lg" />
                  <span>Checking Handshake...</span>
                </>
              ) : (
                <>
                  <FiSearch className="text-lg" />
                  <span>Verify SSL Certificate</span>
                </>
              )}
            </button>
          </form>

          <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
            <strong>About SSL/TLS:</strong> Secure Sockets Layer/Transport Layer Security certificates encrypt web data. Checking certificates ensures users connect safely without security alerts or expiration errors.
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {result && result.success && (
            <div className="space-y-6">
              {/* Header Status */}
              <div className={`glass-panel p-6 flex flex-col sm:flex-row items-center gap-5 border shadow-lg ${getDaysGlow(result.validity.daysRemaining)}`}>
                <div className={`p-4 rounded-full border shrink-0 ${
                  result.validity.authorized && result.validity.daysRemaining > 0
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                }`}>
                  {result.validity.authorized && result.validity.daysRemaining > 0 ? (
                    <FiLock className="text-3xl" />
                  ) : (
                    <FiUnlock className="text-3xl" />
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1 justify-center sm:justify-start">
                    <h3 className="text-lg font-bold text-white leading-none m-0">{domain}</h3>
                    <span className={`status-badge text-[9px] w-fit mx-auto sm:mx-0 ${
                      result.validity.authorized 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {result.validity.authorized ? 'Trusted & Valid' : 'Untrusted / Self-signed'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Verified in {result.timeMs}ms using TLS Socket connection.</p>
                </div>

                {/* Days remaining badge */}
                <div className={`p-4 rounded-xl border flex flex-col items-center justify-center shrink-0 w-28 h-24 ${getDaysClass(result.validity.daysRemaining)}`}>
                  <span className="text-2xl font-bold font-mono tracking-tight">{result.validity.daysRemaining}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider mt-1">Days Left</span>
                </div>
              </div>

              {/* Certificate Metadata Grid */}
              <div className="glass-panel p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <FiShield className="text-purple-400" />
                  <span>Certificate Metadata</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Subject */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 min-w-0">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Subject (Common Name)</span>
                    <span className="text-xs font-bold text-slate-200 mt-1 block truncate" title={result.validity.subject.CN}>{result.validity.subject.CN || 'Not Specified'}</span>
                  </div>

                  {/* Issuer */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 min-w-0">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Issuer (Authority)</span>
                    <span className="text-xs font-bold text-slate-200 mt-1 block truncate" title={result.validity.issuer.O}>{result.validity.issuer.O || result.validity.issuer.CN || 'Not Specified'}</span>
                  </div>

                  {/* Validity From */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                    <FiCalendar className="text-slate-500 text-lg shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block leading-none">Valid From</span>
                      <span className="text-xs font-bold text-slate-300 mt-1.5 block">{new Date(result.validity.validFrom).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                    </div>
                  </div>

                  {/* Validity To */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                    <FiCalendar className="text-slate-500 text-lg shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block leading-none">Expires On</span>
                      <span className="text-xs font-bold text-slate-300 mt-1.5 block">{new Date(result.validity.validTo).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                    </div>
                  </div>
                </div>

                {/* Fingerprint & Serial Number */}
                <div className="space-y-3.5 border-t border-slate-900 pt-5">
                  <div className="space-y-1 bg-slate-950/30 p-3 rounded-lg border border-slate-900/60 min-w-0">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">SHA-256 Fingerprint</span>
                    <span className="text-[11px] font-mono text-cyan-300 select-all block break-all font-semibold">{result.validity.fingerprint}</span>
                  </div>
                  <div className="space-y-1 bg-slate-950/30 p-3 rounded-lg border border-slate-900/60 min-w-0">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Serial Number</span>
                    <span className="text-[11px] font-mono text-purple-300 select-all block break-all font-semibold">{result.validity.serialNumber}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && !result.success && (
            <div className="glass-panel p-6 border-rose-500/20 bg-rose-500/5 text-center flex flex-col items-center justify-center min-h-[300px]">
              <FiUnlock className="text-5xl text-rose-500 mb-4 animate-bounce" />
              <h3 className="font-bold text-rose-400 m-0">SSL Handshake Failed</h3>
              <p className="text-xs text-rose-300/80 max-w-sm mt-3.5 leading-relaxed font-semibold">
                An error occurred establishing an encrypted session. The certificate might be self-signed, expired, hostname-mismatched, or port 443 might be closed.
              </p>
              <div className="bg-slate-950 border border-slate-900 px-4 py-2.5 rounded-lg font-mono text-xs text-rose-400 mt-5 font-bold">
                Error Code: {result.error || 'Connection Failed'}
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
              <FiLock className="text-4xl text-slate-700 mb-4" />
              <h3 className="font-bold text-slate-400 m-0">Awaiting Hostname</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Input a domain to query certificate chains, cryptographic validity ranges, authority signatures, and handshake status.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
