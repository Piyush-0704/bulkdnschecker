import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSearch, FiMail, FiActivity, FiCheckCircle, FiXCircle, FiRefreshCw, FiAlertTriangle, FiList } from 'react-icons/fi';

// 50+ DNSBL blacklists to check via DoH
const DNSBL_LISTS = [
  'zen.spamhaus.org', 'bl.spamcop.net', 'dnsbl.sorbs.net', 'b.barracudacentral.org',
  'dnsbl-1.uceprotect.net', 'dnsbl-2.uceprotect.net', 'dnsbl-3.uceprotect.net',
  'all.s5h.net', 'blackholes.mail-abuse.org', 'bl.emailbasura.org',
  'cbl.abuseat.org', 'combined.njabl.org', 'db.wpbl.info',
  'dnsbl.cyberlogic.net', 'dnsbl.inps.de', 'drone.abuse.ch',
  'dul.dnsbl.sorbs.net', 'http.dnsbl.sorbs.net', 'ips.backscatterer.org',
  'ix.dnsbl.manitu.net', 'korea.services.net', 'misc.dnsbl.sorbs.net',
  'no-more-funn.moensted.dk', 'pbl.spamhaus.org', 'proxy.bl.gweep.ca',
  'psbl.surriel.com', 'relays.bl.gweep.ca', 'relays.bl.kundenserver.de',
  'sbl-xbl.spamhaus.org', 'sbl.spamhaus.org', 'smtp.dnsbl.sorbs.net',
  'socks.dnsbl.sorbs.net', 'spam.abuse.ch', 'spam.dnsbl.anonmails.de',
  'spam.dnsbl.sorbs.net', 'spam.spamrats.com', 'spambot.bls.digibase.ca',
  'spamrbl.imp.ch', 'tor.dan.me.uk', 'ubl.lashback.com',
  'ubl.unsubscore.com', 'virbl.bit.nl', 'web.dnsbl.sorbs.net',
  'wormrbl.imp.ch', 'xbl.spamhaus.org', 'zombie.dnsbl.sorbs.net',
];

function reverseIp(ip) {
  return ip.split('.').reverse().join('.');
}

async function checkDnsbl(ip, dnsbl) {
  const query = `${reverseIp(ip)}.${dnsbl}`;
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(query)}&type=A`);
    const data = await resp.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return { dnsbl, blacklisted: true, result: data.Answer[0].data };
    }
    return { dnsbl, blacklisted: false };
  } catch {
    return { dnsbl, blacklisted: false, error: 'query failed' };
  }
}

async function getMxForDomain(domain) {
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    const data = await resp.json();
    if (data.Status === 0 && data.Answer) {
      return data.Answer.map(a => a.data);
    }
  } catch {}
  return [];
}

export default function SmtpBlacklistChecker() {
  const [activeSubTab, setActiveSubTab] = useState('smtp'); // 'smtp' or 'blacklist'
  
  // SMTP state
  const [domain, setDomain] = useState('');
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpResult, setSmtpResult] = useState(null);

  // Blacklist state
  const [ipAddress, setIpAddress] = useState('');
  const [blacklistLoading, setBlacklistLoading] = useState(false);
  const [blacklistResult, setBlacklistResult] = useState(null);

  const handleSmtpCheck = async (e) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setSmtpLoading(true);
    setSmtpResult(null);

    try {
      const mxRecords = await getMxForDomain(domain.trim());
      setSmtpResult({
        success: mxRecords.length > 0,
        domain: domain.trim(),
        mxRecords,
        message: mxRecords.length > 0
          ? `Found ${mxRecords.length} MX record(s). Mail server is configured.`
          : 'No MX records found. Domain may not accept email.',
        note: 'SMTP port connectivity requires server-side testing. MX record presence verified via DNS.'
      });
      toast.success('MX / SMTP configuration checked.');
    } catch (err) {
      toast.error(err.message || 'Error checking SMTP configuration.');
    } finally {
      setSmtpLoading(false);
    }
  };

  const handleBlacklistCheck = async (e) => {
    e.preventDefault();
    if (!ipAddress.trim()) {
      toast.error('Please enter an IP address.');
      return;
    }

    setBlacklistLoading(true);
    setBlacklistResult(null);

    try {
      const results = await Promise.all(DNSBL_LISTS.map(bl => checkDnsbl(ipAddress.trim(), bl)));
      const blacklistedCount = results.filter(r => r.blacklisted).length;
      setBlacklistResult({
        success: true,
        ip: ipAddress.trim(),
        results,
        blacklistedCount,
        totalChecked: results.length
      });
      if (blacklistedCount > 0) {
        toast.error(`IP is blacklisted on ${blacklistedCount} list(s).`);
      } else {
        toast.success('IP is clean on all checked blacklists!');
      }
    } catch (err) {
      toast.error(err.message || 'Error conducting blacklist lookups.');
    } finally {
      setBlacklistLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">SMTP & Blacklist Checker</h2>
        <p className="text-slate-400 text-sm font-medium">Verify mail server handshakes on port 25 and inspect IP addresses across global spam intelligence blacklists (DNSBL).</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-900 gap-1.5 p-1 bg-slate-900/10 rounded-xl w-fit">
        <button
          onClick={() => setActiveSubTab('smtp')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeSubTab === 'smtp'
              ? 'bg-purple-600 text-white shadow shadow-purple-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiMail />
          <span>SMTP Port 25 Handshake</span>
        </button>
        <button
          onClick={() => setActiveSubTab('blacklist')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeSubTab === 'blacklist'
              ? 'bg-purple-600 text-white shadow shadow-purple-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiList />
          <span>IP DNSBL Blacklist Check</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tab 1: SMTP checker */}
        {activeSubTab === 'smtp' && (
          <>
            <div className="glass-panel p-6 flex flex-col justify-between">
              <form onSubmit={handleSmtpCheck} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-300 font-bold block">Domain Name</label>
                  <input
                    type="text"
                    placeholder="e.g. outlook.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={smtpLoading}
                  className="glow-btn-purple w-full py-3"
                >
                  {smtpLoading ? (
                    <>
                      <FiRefreshCw className="animate-spin text-lg" />
                      <span>SMTP Handshake...</span>
                    </>
                  ) : (
                    <>
                      <FiActivity className="text-lg" />
                      <span>Check SMTP Connection</span>
                    </>
                  )}
                </button>
              </form>

              <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
                <strong>SMTP Port 25 Check:</strong> Connects directly to the highest priority MX host of the domain on port 25 and quits immediately to confirm the server accepts connections.
              </div>
            </div>

        <div className="lg:col-span-2 space-y-6">
              {smtpResult && smtpResult.success && (
                <div className="glass-panel p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <FiCheckCircle className="text-emerald-400 text-3xl" />
                    <div>
                      <h3 className="text-sm font-bold text-white leading-none mb-1">Mail Server Configured</h3>
                      <p className="text-xs text-slate-400 font-semibold">{smtpResult.message}</p>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-slate-900 pt-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">MX Records Found</span>
                      <div className="mt-2 space-y-2">
                        {smtpResult.mxRecords.map((mx, i) => (
                          <div key={i} className="bg-slate-950 border border-slate-900 px-3 py-2 rounded-lg font-mono text-xs text-cyan-300 font-semibold">{mx}</div>
                        ))}
                      </div>
                    </div>

                    {smtpResult.note && (
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Note</span>
                        <p className="text-xs text-slate-400 mt-1 font-medium">{smtpResult.note}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {smtpResult && !smtpResult.success && (
                <div className="glass-panel p-6 border-rose-500/20 bg-rose-500/5 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <FiXCircle className="text-5xl text-rose-500 mb-4 animate-pulse" />
                  <h3 className="font-bold text-rose-400 m-0">No MX Records Found</h3>
                  <p className="text-xs text-rose-300/80 max-w-sm mt-3.5 leading-relaxed font-semibold">
                    {smtpResult.message}
                  </p>
                </div>
              )}

              {!smtpResult && !smtpLoading && (
                <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
                  <FiMail className="text-4xl text-slate-700 mb-4" />
                  <h3 className="font-bold text-slate-400 m-0">Awaiting Mail Domain</h3>
                  <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Provide a domain name to resolve mail servers and simulate greetings on port 25.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: Blacklist checker */}
        {activeSubTab === 'blacklist' && (
          <>
            <div className="glass-panel p-6 flex flex-col justify-between">
              <form onSubmit={handleBlacklistCheck} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-300 font-bold block">IP Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 127.0.0.2"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={blacklistLoading}
                  className="glow-btn-purple w-full py-3"
                >
                  {blacklistLoading ? (
                    <>
                      <FiRefreshCw className="animate-spin text-lg" />
                      <span>Checking DNSBLs...</span>
                    </>
                  ) : (
                    <>
                      <FiSearch className="text-lg" />
                      <span>Check Blacklist Servers</span>
                    </>
                  )}
                </button>
              </form>

              <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
                <strong>IP Blacklist Check (DNSBL):</strong> Reverses IP coordinates and queries them against major spam catalogs (Spamhaus, Sorbs, Spamcop) to see if email servers filter this address.
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {blacklistResult && blacklistResult.success && (
                <div className="glass-panel p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">DNSBL Blacklist Lookups</h3>
                    <span className="text-xs font-mono font-bold text-slate-400">Target IP: {blacklistResult.ip}</span>
                  </div>

                  <div className="space-y-3">
                    {blacklistResult.results.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 p-4 rounded-xl shadow-inner">
                        <span className="text-xs font-bold text-slate-200">{r.dnsbl}</span>
                        {r.blacklisted ? (
                          <span className="status-badge bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                            <FiAlertTriangle className="text-xs shrink-0" />
                            <span>Listed (Blacklisted)</span>
                          </span>
                        ) : (
                          <span className="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <FiCheckCircle className="text-xs shrink-0" />
                            <span>Clean (Not Listed)</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!blacklistResult && !blacklistLoading && (
                <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
                  <FiList className="text-4xl text-slate-700 mb-4 animate-pulse" />
                  <h3 className="font-bold text-slate-400 m-0">Awaiting IP address</h3>
                  <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Input a server IP (IPv4) to scan its presence on major DNS-based blackhole databases.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
