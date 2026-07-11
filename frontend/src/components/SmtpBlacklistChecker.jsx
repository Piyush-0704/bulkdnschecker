import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSearch, FiMail, FiActivity, FiCheckCircle, FiXCircle, FiRefreshCw, FiAlertTriangle, FiList, FiGlobe } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

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

const DOMAIN_BLACKLISTS = [
  { name: 'Spamhaus DBL', host: 'dbl.spamhaus.org', description: 'Spamhaus Domain Block List' },
  { name: 'SURBL Multi', host: 'multi.surbl.org', description: 'SURBL Multi List' },
  { name: 'URIBL Multi', host: 'multi.uribl.com', description: 'URIBL Multi List' },
  { name: 'SORBS RHSBL', host: 'rhsbl.sorbs.net', description: 'SORBS RHSBL' },
  { name: 'Spam Eating Monkey URIBL', host: 'uribl.spameatingmonkey.net', description: 'Spam Eating Monkey URIBL' },
  { name: 'Spam Eating Monkey Fresh', host: 'fresh.spameatingmonkey.net', description: 'Freshly registered domains (<15 days)' },
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
      const resultIp = data.Answer[0].data;
      let blacklisted = false;

      // Filter out query block/refused codes (e.g. 127.255.255.254 or 127.0.0.1 for blocked)
      if (dnsbl.includes('spamhaus.org')) {
        if ((resultIp.startsWith('127.0.0.') || resultIp.startsWith('127.0.1.')) && 
            resultIp !== '127.255.255.252' && 
            resultIp !== '127.255.255.254' && 
            resultIp !== '127.255.255.255') {
          blacklisted = true;
        }
      } else if (dnsbl === 'bl.spamcop.net') {
        if (resultIp === '127.0.0.2') {
          blacklisted = true;
        }
      } else if (resultIp.startsWith('127.')) {
        if (resultIp !== '127.255.255.252' && 
            resultIp !== '127.255.255.254' && 
            resultIp !== '127.255.255.255' && 
            resultIp !== '127.0.0.1') {
          blacklisted = true;
        }
      }
      return { dnsbl, blacklisted, result: resultIp };
    }
    return { dnsbl, blacklisted: false };
  } catch {
    return { dnsbl, blacklisted: false, error: 'query failed' };
  }
}

async function checkDomainBlacklist(domain, blacklistHost) {
  const query = `${domain}.${blacklistHost}`;
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(query)}&type=A`);
    const data = await resp.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      const ip = data.Answer[0].data;
      let blacklisted = false;

      if (blacklistHost === 'dbl.spamhaus.org') {
        // Spamhaus DBL: 127.0.1.255 is blocked, other 127.0.1.x are listed
        if (ip.startsWith('127.0.1.') && ip !== '127.0.1.255') {
          blacklisted = true;
        }
      } else if (blacklistHost === 'multi.uribl.com') {
        // URIBL: 127.0.0.1 is blocked/refused, 127.0.0.2/4/8 are listed
        if (ip.startsWith('127.0.0.') && ip !== '127.0.0.1') {
          blacklisted = true;
        }
      } else if (blacklistHost === 'multi.surbl.org') {
        // SURBL: 127.0.0.1 is blocked/refused, others in 127.0.0.x are listed
        if (ip.startsWith('127.0.0.') && ip !== '127.0.0.1') {
          blacklisted = true;
        }
      } else if (blacklistHost === 'rhsbl.sorbs.net') {
        // SORBS RHSBL: 127.0.0.1 is query refused, >=127.0.0.2 is listed
        if (ip.startsWith('127.0.0.')) {
          const parts = ip.split('.');
          const lastOctet = parseInt(parts[3], 10);
          if (lastOctet >= 2) {
            blacklisted = true;
          }
        }
      } else if (blacklistHost.includes('spameatingmonkey.net')) {
        // Spam Eating Monkey: 127.0.0.2 is listed, 127.0.0.1 is query refused/blocked
        if (ip === '127.0.0.2') {
          blacklisted = true;
        }
      } else {
        if (ip.startsWith('127.') && ip !== '127.0.0.1') {
          blacklisted = true;
        }
      }

      return { host: blacklistHost, blacklisted, result: ip };
    }
    return { host: blacklistHost, blacklisted: false };
  } catch {
    return { host: blacklistHost, blacklisted: false, error: 'query failed' };
  }
}

export default function SmtpBlacklistChecker() {
  const [activeSubTab, setActiveSubTab] = useState('blacklist'); // 'blacklist' or 'domain-blacklist'
  
  // Blacklist state
  const [ipAddress, setIpAddress] = useState('');
  const [blacklistLoading, setBlacklistLoading] = useState(false);
  const [blacklistResult, setBlacklistResult] = useState(null);

  // Domain Blacklist state
  const [blacklistDomain, setBlacklistDomain] = useState('');
  const [domainBlacklistLoading, setDomainBlacklistLoading] = useState(false);
  const [domainBlacklistResult, setDomainBlacklistResult] = useState(null);

  const handleBlacklistCheck = async (e) => {
    e.preventDefault();
    if (!ipAddress.trim()) {
      toast.error('Please enter an IP address.');
      return;
    }

    setBlacklistLoading(true);
    setBlacklistResult(null);

    try {
      const resp = await fetch(`${BACKEND_URL}/api/blacklist-check?ip=${encodeURIComponent(ipAddress.trim())}`);
      const data = await resp.json();
      if (data.success) {
        const blacklistedCount = data.results.filter(r => r.blacklisted).length;
        setBlacklistResult({
          success: true,
          ip: ipAddress.trim(),
          results: data.results,
          blacklistedCount,
          totalChecked: data.results.length
        });
        if (blacklistedCount > 0) {
          toast.error(`IP is blacklisted on ${blacklistedCount} list(s).`);
        } else {
          toast.success('IP is clean on all checked blacklists!');
        }
      } else {
        throw new Error(data.error || 'Backend blacklist check failed');
      }
    } catch (err) {
      toast.error(err.message || 'Error conducting blacklist lookups.');
    } finally {
      setBlacklistLoading(false);
    }
  };

  const handleDomainBlacklistCheck = async (e) => {
    e.preventDefault();
    if (!blacklistDomain.trim()) {
      toast.error('Please enter a domain.');
      return;
    }

    setDomainBlacklistLoading(true);
    setDomainBlacklistResult(null);

    let clean = blacklistDomain.trim().toLowerCase();
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '');
    clean = clean.split('/')[0].split(':')[0];

    try {
      const resp = await fetch(`${BACKEND_URL}/api/domain-blacklist-check?domain=${encodeURIComponent(clean)}`);
      const data = await resp.json();
      if (data.success) {
        const blacklistedCount = data.results.filter(r => r.blacklisted).length;
        setDomainBlacklistResult({
          success: true,
          domain: clean,
          results: data.results,
          blacklistedCount,
          totalChecked: data.results.length
        });
        if (blacklistedCount > 0) {
          toast.error(`Domain is blacklisted on ${blacklistedCount} list(s).`);
        } else {
          toast.success('Domain is clean on all checked blacklists!');
        }
      } else {
        throw new Error(data.error || 'Backend domain blacklist check failed');
      }
    } catch (err) {
      toast.error(err.message || 'Error conducting domain blacklist lookups.');
    } finally {
      setDomainBlacklistLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Blacklist Checker</h2>
        <p className="text-slate-400 text-sm font-medium">Inspect IP addresses and domains across global spam intelligence blacklists (DNSBL).</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-900 gap-1.5 p-1 bg-slate-900/10 rounded-xl w-fit">
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
        <button
          onClick={() => setActiveSubTab('domain-blacklist')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeSubTab === 'domain-blacklist'
              ? 'bg-purple-600 text-white shadow shadow-purple-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiGlobe />
          <span>Domain Blacklist Check</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

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

        {/* Tab 3: Domain Blacklist checker */}
        {activeSubTab === 'domain-blacklist' && (
          <>
            <div className="glass-panel p-6 flex flex-col justify-between">
              <form onSubmit={handleDomainBlacklistCheck} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-300 font-bold block">Domain Name</label>
                  <input
                    type="text"
                    placeholder="e.g. spammy-domain.xyz"
                    value={blacklistDomain}
                    onChange={(e) => setBlacklistDomain(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={domainBlacklistLoading}
                  className="glow-btn-purple w-full py-3"
                >
                  {domainBlacklistLoading ? (
                    <>
                      <FiRefreshCw className="animate-spin text-lg" />
                      <span>Checking Domain Blacklists...</span>
                    </>
                  ) : (
                    <>
                      <FiSearch className="text-lg" />
                      <span>Check Domain Blacklist</span>
                    </>
                  )}
                </button>
              </form>

              <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
                <strong>Domain Blacklist Check (URIBL/SURBL):</strong> Queries the domain against databases that keep track of domains appearing in spam emails (Spamhaus DBL, SURBL, URIBL, SORBS RHSBL).
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {domainBlacklistResult && domainBlacklistResult.success && (
                <div className="glass-panel p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Domain Blacklist Lookups</h3>
                    <span className="text-xs font-mono font-bold text-slate-400">Target Domain: {domainBlacklistResult.domain}</span>
                  </div>

                  <div className="space-y-3">
                    {domainBlacklistResult.results.map((r, i) => {
                      const dbInfo = DOMAIN_BLACKLISTS.find(db => db.host === r.host);
                      return (
                        <div key={i} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 p-4 rounded-xl shadow-inner">
                          <div>
                            <span className="text-xs font-bold text-slate-200 block">{dbInfo?.name || r.host}</span>
                            <span className="text-[10px] text-slate-500 font-medium">{dbInfo?.description}</span>
                          </div>
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
                      );
                    })}
                  </div>
                </div>
              )}

              {!domainBlacklistResult && !domainBlacklistLoading && (
                <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
                  <FiGlobe className="text-4xl text-slate-700 mb-4 animate-pulse" />
                  <h3 className="font-bold text-slate-400 m-0">Awaiting Domain Name</h3>
                  <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Input a domain name to scan its presence on major URI-based real-time blacklists.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
