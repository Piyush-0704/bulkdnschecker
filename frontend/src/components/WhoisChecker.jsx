import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSearch, FiGlobe, FiCalendar, FiClock, FiFileText } from 'react-icons/fi';

// RDAP (Registration Data Access Protocol) — the modern WHOIS replacement
// Uses structured JSON from rdap.org, which proxies to the authoritative RDAP server
async function rdapLookup(domain) {
  const resp = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  if (!resp.ok) throw new Error(`RDAP error: HTTP ${resp.status}`);
  const data = await resp.json();

  // Extract registrar
  const registrarEntity = data.entities?.find(e => e.roles?.includes('registrar'));
  const registrar = registrarEntity?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'N/A';

  // Extract events
  const getEvent = (action) => data.events?.find(e => e.eventAction === action)?.eventDate || null;

  // Extract nameservers
  const nameservers = data.nameservers?.map(ns => ns.ldhName) || [];

  // Extract status
  const status = data.status || [];

  // Build raw text representation
  const rawLines = [
    `Domain Name: ${data.ldhName || domain}`,
    `Registrar: ${registrar}`,
    `Status: ${status.join(', ')}`,
    `Registration Date: ${getEvent('registration') || 'N/A'}`,
    `Expiration Date: ${getEvent('expiration') || 'N/A'}`,
    `Last Updated: ${getEvent('last changed') || 'N/A'}`,
    `Nameservers: ${nameservers.join(', ')}`,
    `DNSSEC: ${data.secureDNS?.delegationSigned ? 'Signed' : 'Unsigned'}`,
  ];

  return {
    success: true,
    domain: data.ldhName || domain,
    registrar,
    creationDate: getEvent('registration'),
    expirationDate: getEvent('expiration'),
    updatedDate: getEvent('last changed'),
    nameservers,
    status,
    dnssec: data.secureDNS?.delegationSigned ? 'Signed' : 'Unsigned',
    raw: rawLines.join('\n'),
  };
}

export default function WhoisChecker() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const data = await rdapLookup(domain.trim());
      setResult(data);
      toast.success('WHOIS / RDAP data retrieved successfully.');
    } catch (err) {
      toast.error(err.message || 'Error retrieving WHOIS data.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'N/A';

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">WHOIS Lookup</h2>
        <p className="text-slate-400 text-sm font-medium">Retrieve domain ownership records, registration details, hostnames, and expiration schedules instantly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Panel */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <form onSubmit={handleLookup} className="space-y-4">
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
            
            <button
              type="submit"
              disabled={loading}
              className="glow-btn-purple w-full py-3"
            >
              {loading ? (
                <>
                  <FiClock className="animate-spin text-lg" />
                  <span>Querying Registry...</span>
                </>
              ) : (
                <>
                  <FiSearch className="text-lg" />
                  <span>Lookup WHOIS Records</span>
                </>
              )}
            </button>
          </form>

          <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
            <strong>About WHOIS:</strong> WHOIS is a query and response protocol widely used for querying databases that store the registered users or assignees of an Internet resource, such as a domain name.
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {result && (
            <div className="space-y-6">
              {/* Parse Info Grid */}
              <div className="glass-panel p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Record Intelligence</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Registrar */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 text-purple-400 shrink-0">
                      <FiGlobe className="text-lg" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Registrar</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={result.registrar}>{result.registrar}</span>
                    </div>
                  </div>

                  {/* Registrant */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400 shrink-0">
                      <FiFileText className="text-lg" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Status / DNSSEC</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 truncate">{result.dnssec} · {result.status?.length || 0} flags</span>
                    </div>
                  </div>

                  {/* Creation Date */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400 shrink-0">
                      <FiCalendar className="text-lg" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Creation Date</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 truncate">{formatDate(result.creationDate)}</span>
                    </div>
                  </div>

                  {/* Expiration Date */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                    <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-400 shrink-0">
                      <FiClock className="text-lg" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Expiration Date</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 truncate">{formatDate(result.expirationDate)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Raw Console */}
              <div className="glass-panel p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Raw WHOIS Record Content</h3>
                  <span className="text-[10px] bg-slate-950 border border-slate-800 rounded-md px-2 py-0.5 text-slate-500 font-bold uppercase">{domain.trim()}</span>
                </div>
                
                <pre className="bg-slate-950/80 border border-slate-900/80 p-5 rounded-xl text-xs font-mono text-slate-300 leading-relaxed overflow-y-auto max-h-[400px] shadow-inner select-text">
                  {result.raw}
                </pre>
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
              <FiGlobe className="text-4xl text-slate-700 mb-4" />
              <h3 className="font-bold text-slate-400 m-0">Awaiting Domain Name</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Input a web domain to fetch ownership registries, structural servers, contact cards, and life cycle intervals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
