import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSearch, FiMail, FiActivity, FiCheckCircle, FiXCircle, FiRefreshCw, FiAlertTriangle, FiList } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

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
      const response = await axios.get(`${BACKEND_URL}/api/smtp-check?domain=${domain.trim()}`);
      setSmtpResult(response.data);
      if (response.data.success) {
        toast.success('SMTP check completed successfully.');
      } else {
        toast.error(`SMTP connection failed: ${response.data.error}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error checking SMTP configuration.');
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
      const response = await axios.get(`${BACKEND_URL}/api/blacklist-check?ip=${ipAddress.trim()}`);
      setBlacklistResult(response.data);
      if (response.data.success) {
        const blacklistCount = response.data.results.filter(r => r.blacklisted).length;
        if (blacklistCount > 0) {
          toast.warning(`IP is blacklisted on ${blacklistCount} server list(s).`);
        } else {
          toast.success('IP is clean on all check server lists.');
        }
      } else {
        toast.error(`Blacklist check error: ${response.data.error}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error conducting blacklist lookups.');
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
                      <h3 className="text-sm font-bold text-white leading-none mb-1">Mail Host Active</h3>
                      <p className="text-xs text-slate-400 font-semibold">MX exchange responds properly on TCP port 25.</p>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-slate-900 pt-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Resolved MX Host</span>
                      <span className="text-xs font-bold text-slate-200 mt-1 font-mono">{smtpResult.mxHost}</span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">SMTP Banner Greeting</span>
                      <pre className="bg-slate-950 border border-slate-900 p-4 rounded-xl text-xs font-mono text-cyan-300 break-all shadow-inner leading-relaxed select-text mt-1.5 font-semibold">
                        {smtpResult.smtpBanner}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {smtpResult && !smtpResult.success && (
                <div className="glass-panel p-6 border-rose-500/20 bg-rose-500/5 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <FiXCircle className="text-5xl text-rose-500 mb-4 animate-pulse" />
                  <h3 className="font-bold text-rose-400 m-0">SMTP Check Failed</h3>
                  <p className="text-xs text-rose-300/80 max-w-sm mt-3.5 leading-relaxed font-semibold">
                    Could not complete the SMTP handshake. The host port 25 might be blocked by the firewall or ISP, or the mail service is offline.
                  </p>
                  <div className="bg-slate-950 border border-slate-900 px-4 py-2.5 rounded-lg font-mono text-xs text-rose-400 mt-5 font-bold">
                    Error Log: {smtpResult.error}
                  </div>
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
                        <span className="text-xs font-bold text-slate-200">{r.list}</span>
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
