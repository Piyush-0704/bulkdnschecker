import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSearch, FiGlobe, FiCalendar, FiClock, FiFileText, FiUser, FiMail, FiMapPin } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

// RDAP (Registration Data Access Protocol) — the modern WHOIS replacement
// Uses structured JSON from rdap.org, which proxies to the authoritative RDAP server
async function rdapLookup(domain) {
  const resp = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  if (!resp.ok) throw new Error(`RDAP error: HTTP ${resp.status}`);
  const data = await resp.json();

  // Extract registrar
  const registrarEntity = data.entities?.find(e => e.roles?.includes('registrar'));
  const registrar = registrarEntity?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'N/A';

  // Extract registrant from RDAP (often redacted due to GDPR, but organization/company is sometimes left public)
  let registrantName = null;
  
  const isRedacted = (val) => !val || 
    val.toLowerCase().includes('redacted') || 
    val.toLowerCase().includes('privacy') || 
    val.toLowerCase().includes('protected') ||
    val.toLowerCase().includes('not disclosed') ||
    val.toLowerCase().includes('data protected') ||
    val.toLowerCase() === 'n/a';

  const extractNameFromEntity = (entity) => {
    if (!entity) return null;
    const vcards = entity?.vcardArray?.[1] || [];
    const fnVal = vcards.find(v => v[0] === 'fn')?.[3];
    const orgVal = vcards.find(v => v[0] === 'org')?.[3];
    
    if (fnVal && !isRedacted(fnVal)) return fnVal;
    if (orgVal && !isRedacted(orgVal)) return orgVal;
    return null;
  };

  let registrantOrg = null;
  const registrantEntity = data.entities?.find(e => e.roles?.includes('registrant'));
  registrantName = extractNameFromEntity(registrantEntity);
  if (registrantEntity) {
    const vcards = registrantEntity.vcardArray?.[1] || [];
    const orgVal = vcards.find(v => v[0] === 'org')?.[3];
    if (orgVal && !isRedacted(orgVal)) {
      registrantOrg = orgVal;
    }
  }

  if (!registrantName && registrarEntity?.entities) {
    const nestedRegistrant = registrarEntity.entities.find(e => e.roles?.includes('registrant'));
    registrantName = extractNameFromEntity(nestedRegistrant);
    if (nestedRegistrant) {
      const vcards = nestedRegistrant.vcardArray?.[1] || [];
      const orgVal = vcards.find(v => v[0] === 'org')?.[3];
      if (orgVal && !isRedacted(orgVal)) {
        registrantOrg = orgVal;
      }
    }
  }

  // Fallback: Query registrar's authoritative RDAP server directly if link is provided (bypasses registry redactions)
  if (!registrantName) {
    let registrarRdapUrl = null;
    
    // 1. Prioritize root links for "related" which maps directly to registrar RDAP endpoint
    const relatedLink = data.links?.find(l => l.rel === 'related' && l.href);
    if (relatedLink && relatedLink.href) {
      registrarRdapUrl = relatedLink.href;
    }
    
    // 2. Fall back to parsing the registrar entity links
    if (!registrarRdapUrl && registrarEntity) {
      const rdapLink = registrarEntity.links?.find(l => 
        l.href && 
        l.href.includes('rdap.') && 
        !l.href.includes('identitydigital.services') && 
        !l.href.includes('donuts.')
      );
      const baseUrl = rdapLink ? rdapLink.href : null;
      if (baseUrl) {
        let base = baseUrl;
        if (!base.endsWith('/')) base += '/';
        registrarRdapUrl = `${base}domain/${encodeURIComponent(domain.trim().toLowerCase())}`;
      }
    }
    
    if (registrarRdapUrl) {
      try {
        const subResp = await fetch(registrarRdapUrl);
        if (subResp.ok) {
          const subData = await subResp.json();
          const subRegistrant = subData.entities?.find(e => e.roles?.includes('registrant'));
          const extracted = extractNameFromEntity(subRegistrant);
          if (extracted) registrantName = extracted;
          
          if (subRegistrant) {
            const vcards = subRegistrant.vcardArray?.[1] || [];
            const orgVal = vcards.find(v => v[0] === 'org')?.[3];
            if (orgVal && !isRedacted(orgVal)) {
              registrantOrg = orgVal;
            }
          }
        }
      } catch {}
    }
  }

  // Extract events
  const getEvent = (action) => data.events?.find(e => e.eventAction === action)?.eventDate || null;

  // Extract nameservers
  const nameservers = data.nameservers?.map(ns => ns.ldhName) || [];

  // Extract status
  const status = data.status || [];

  return {
    success: true,
    domain: data.ldhName || domain,
    registrar,
    registrantName,
    registrantOrg,
    creationDate: getEvent('registration'),
    expirationDate: getEvent('expiration'),
    updatedDate: getEvent('last changed'),
    nameservers,
    status,
    dnssec: data.secureDNS?.delegationSigned ? 'Signed' : 'Unsigned',
  };
}

// Fetch raw WHOIS from backend (TCP port 43 — contains registrant info)
async function backendWhoisLookup(domain) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/whois?domain=${encodeURIComponent(domain)}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Client-side parser fallback for older backends
function parseWhoisRegistrant(rawWhois) {
  if (!rawWhois || typeof rawWhois !== 'string') return {};
  
  const extract = (patterns) => {
    for (const pattern of patterns) {
      const match = rawWhois.match(pattern);
      if (match && match[1] && match[1].trim() && !match[1].trim().toLowerCase().includes('redacted')) {
        const val = match[1].trim();
        // Skip privacy-protected values
        if (val.toLowerCase().includes('privacy') || 
            val.toLowerCase().includes('protected') ||
            val.toLowerCase().includes('not disclosed') ||
            val.toLowerCase().includes('data protected') ||
            val.toLowerCase() === 'n/a') {
          continue;
        }
        return val;
      }
    }
    return null;
  };

  const name = extract([
    /Registrant Name:\s*(.+)/i,
    /Registrant:\s*(.+)/i,
    /owner:\s*(.+)/i,
    /holder:\s*(.+)/i,
    /Registrant Contact Name:\s*(.+)/i
  ]);

  const org = extract([
    /Registrant Organization:\s*(.+)/i,
    /Registrant Organisation:\s*(.+)/i,
    /org-name:\s*(.+)/i,
    /Organization:\s*(.+)/i,
    /Registrant Contact Organisation:\s*(.+)/i
  ]);

  return {
    registrantName: name || org,
    registrantOrg: org,
    registrantEmail: extract([
      /Registrant Email:\s*(.+)/i,
      /Registrant Contact Email:\s*(.+)/i,
      /e-mail:\s*(.+)/i
    ]),
    registrantCountry: extract([
      /Registrant Country:\s*(.+)/i,
      /Registrant Contact Country:\s*(.+)/i,
      /country:\s*(.+)/i
    ]),
    registrantState: extract([
      /Registrant State\/Province:\s*(.+)/i,
      /Registrant State:\s*(.+)/i
    ]),
    registrar: extract([
      /Registrar:\s*(.+)/i,
      /Sponsoring Registrar:\s*(.+)/i,
      /registrar:\s*(.+)/i
    ]),
    creationDate: extract([
      /Creation Date:\s*(.+)/i,
      /Registration Date:\s*(.+)/i,
      /Created Date:\s*(.+)/i,
      /created:\s*(.+)/i,
      /Registration Time:\s*(.+)/i
    ]),
    expirationDate: extract([
      /(?:Registry )?Expir(?:y|ation) Date:\s*(.+)/i,
      /Expiration Date:\s*(.+)/i,
      /paid-till:\s*(.+)/i,
      /Expiry date:\s*(.+)/i
    ]),
    updatedDate: extract([
      /Updated Date:\s*(.+)/i,
      /Last Updated:\s*(.+)/i,
      /last-modified:\s*(.+)/i,
      /Last Modified:\s*(.+)/i
    ])
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
      // Run both lookups in parallel
      const [rdapData, backendData] = await Promise.all([
        rdapLookup(domain.trim()).catch(() => null),
        backendWhoisLookup(domain.trim())
      ]);

      if (!rdapData && !backendData) {
        throw new Error('Could not retrieve WHOIS data from any source.');
      }

      // Build combined result — prefer backend parsed for registrant info, fallback to client-side parsing of raw data if backend isn't updated
      const parsed = (backendData?.parsed && Object.keys(backendData.parsed).length > 0)
        ? backendData.parsed
        : parseWhoisRegistrant(backendData?.data || backendData);
      
      // Use backend registrant if available, else RDAP, else fallback to organization if name not found/redacted, else N/A
      const registrantOrg = parsed.registrantOrg || rdapData?.registrantOrg || null;
      const registrantName = parsed.registrantName || rdapData?.registrantName || registrantOrg || 'N/A';
      const registrantEmail = parsed.registrantEmail || null;
      const registrantCountry = parsed.registrantCountry || null;
      const registrantState = parsed.registrantState || null;

      // For other fields: prefer RDAP (structured) with backend fallback
      const registrar = rdapData?.registrar !== 'N/A' ? rdapData?.registrar : (parsed.registrar || 'N/A');
      
      // Build raw text with all available info
      const rawLines = [
        `Domain Name: ${rdapData?.domain || domain.trim()}`,
        `Registrar: ${registrar}`,
        `Registrant Name: ${registrantName}`,
        registrantOrg ? `Registrant Organization: ${registrantOrg}` : null,
        registrantEmail ? `Registrant Email: ${registrantEmail}` : null,
        registrantCountry ? `Registrant Country: ${registrantCountry}` : null,
        registrantState ? `Registrant State: ${registrantState}` : null,
        `Status: ${(rdapData?.status || []).join(', ')}`,
        `Registration Date: ${rdapData?.creationDate || parsed.creationDate || 'N/A'}`,
        `Expiration Date: ${rdapData?.expirationDate || parsed.expirationDate || 'N/A'}`,
        `Last Updated: ${rdapData?.updatedDate || parsed.updatedDate || 'N/A'}`,
        `Nameservers: ${(rdapData?.nameservers || []).join(', ')}`,
        `DNSSEC: ${rdapData?.dnssec || 'Unknown'}`,
      ].filter(Boolean);

      const combined = {
        success: true,
        domain: rdapData?.domain || domain.trim(),
        registrar,
        registrantName,
        registrantOrg,
        registrantEmail,
        registrantCountry,
        registrantState,
        creationDate: rdapData?.creationDate || parsed.creationDate || null,
        expirationDate: rdapData?.expirationDate || parsed.expirationDate || null,
        updatedDate: rdapData?.updatedDate || parsed.updatedDate || null,
        nameservers: rdapData?.nameservers || [],
        status: rdapData?.status || [],
        dnssec: rdapData?.dnssec || 'Unknown',
        raw: rawLines.join('\n'),
        rawWhois: backendData?.data || null,
      };

      setResult(combined);
      toast.success('WHOIS data retrieved successfully.');
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
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

                  {/* Account Holder / Registrant Name */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-cyan-500/20 flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-cyan-400 shrink-0">
                      <FiUser className="text-lg" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Account Holder</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={result.registrantName}>{result.registrantName}</span>
                    </div>
                  </div>

                  {/* Registrant Organization */}
                  {result.registrantOrg && (
                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-400 shrink-0">
                        <FiFileText className="text-lg" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Organization</span>
                        <span className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={result.registrantOrg}>{result.registrantOrg}</span>
                      </div>
                    </div>
                  )}

                  {/* Registrant Email */}
                  {result.registrantEmail && (
                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                      <div className="p-2 bg-pink-500/10 rounded-lg border border-pink-500/20 text-pink-400 shrink-0">
                        <FiMail className="text-lg" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Registrant Email</span>
                        <span className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={result.registrantEmail}>{result.registrantEmail}</span>
                      </div>
                    </div>
                  )}

                  {/* Registrant Location */}
                  {(result.registrantCountry || result.registrantState) && (
                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center gap-3">
                      <div className="p-2 bg-teal-500/10 rounded-lg border border-teal-500/20 text-teal-400 shrink-0">
                        <FiMapPin className="text-lg" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Location</span>
                        <span className="text-xs font-bold text-slate-200 mt-0.5 truncate">
                          {[result.registrantState, result.registrantCountry].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Status / DNSSEC */}
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

              {/* Full Raw WHOIS Console */}
              <div className="glass-panel p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Raw WHOIS Record</h3>
                  <span className="text-[10px] bg-slate-950 border border-slate-800 rounded-md px-2 py-0.5 text-slate-500 font-bold uppercase">{domain.trim()}</span>
                </div>
                
                <pre className="bg-slate-950/80 border border-slate-900/80 p-5 rounded-xl text-xs font-mono text-slate-300 leading-relaxed overflow-y-auto max-h-[400px] shadow-inner select-text whitespace-pre-wrap break-all">
                  {(!result.rawWhois || result.rawWhois.startsWith('Error retrieving WHOIS data')) ? result.raw : result.rawWhois}
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
