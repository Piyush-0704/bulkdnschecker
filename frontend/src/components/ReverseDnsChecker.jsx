import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiMapPin, FiActivity } from 'react-icons/fi';

// Convert IP to reverse DNS arpa format for PTR lookups
function ipToArpa(ip) {
  // IPv4
  if (ip.includes('.')) {
    return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  }
  // IPv6: expand, reverse nibbles
  const expanded = ip.split(':').map(h => h.padStart(4, '0')).join('');
  return expanded.split('').reverse().join('.') + '.ip6.arpa';
}

async function reverseDnsLookup(ip) {
  const arpa = ipToArpa(ip);
  const url = `https://dns.google/resolve?name=${encodeURIComponent(arpa)}&type=PTR`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`DoH error: HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
    return { success: true, ip, hostnames: data.Answer.map(a => a.data.replace(/\.$/, '')) };
  }
  return { success: false, ip, hostnames: [], error: 'No PTR record found' };
}

export default function ReverseDnsChecker() {
  const [ipAddress, setIpAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [loadingGeo, setLoadingGeo] = useState(false);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!ipAddress.trim()) {
      toast.error('Please enter a valid IP address.');
      return;
    }

    setLoading(true);
    setResult(null);
    setGeoData(null);

    try {
      const res = await reverseDnsLookup(ipAddress.trim());
      if (res.success) {
        setResult(res);
        toast.success('Reverse DNS lookup complete.');
        fetchGeo(res.ip);
      } else {
        setResult(res);
        toast.error(res.error || 'No PTR records found.');
      }
    } catch (err) {
      toast.error(err.message || 'Error resolving Reverse DNS.');
    } finally {
      setLoading(false);
    }
  };

  const fetchGeo = async (ip) => {
    setLoadingGeo(true);
    try {
      const resp = await fetch(`https://ipapi.co/${ip}/json/`);
      const data = await resp.json();
      if (data && !data.error) {
        setGeoData({
          country: data.country_name,
          countryCode: data.country_code,
          city: data.city,
          region: data.region,
          org: data.org,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone
        });
      }
    } catch (err) {
      console.error('Failed to retrieve IP Geo details', err);
    } finally {
      setLoadingGeo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Reverse DNS Lookup</h2>
        <p className="text-slate-400 text-sm font-medium">Resolve IP addresses (IPv4 & IPv6) back to their corresponding domain names (PTR records) and explore location maps.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Card */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <form onSubmit={handleResolve} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-bold block">IP Address</label>
              <input
                type="text"
                placeholder="e.g. 8.8.8.8"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
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
                  <span>Resolving...</span>
                </>
              ) : (
                <>
                  <FiActivity className="text-lg" />
                  <span>Resolve IP Address</span>
                </>
              )}
            </button>
          </form>
          
          <div className="text-xs text-slate-500 mt-6 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
            <strong>About Reverse DNS:</strong> A reverse DNS lookup is a query of the DNS to determine the domain name associated with an IP address - the reverse of the usual forward DNS lookup.
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {result && (
            <div className="glass-panel p-6 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Lookup Results</h3>
                <div className="flex flex-col sm:flex-row items-baseline gap-2">
                  <span className="text-xs text-slate-500 font-medium">IP Address:</span>
                  <span className="font-mono text-lg font-bold text-white">{result.ip}</span>
                </div>
              </div>

              {/* Resolved Hostnames list */}
              <div className="space-y-2.5">
                <span className="text-xs text-slate-500 font-bold block">Associated Hostnames (PTR):</span>
                {result.hostnames && result.hostnames.length > 0 ? (
                  <div className="space-y-2">
                    {result.hostnames.map((host, i) => (
                      <div key={i} className="bg-slate-950/60 border border-slate-900 rounded-xl p-3.5 font-mono text-sm text-purple-300 font-semibold shadow-inner break-all">
                        {host}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-amber-400/90 font-semibold italic bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl">
                    No pointer (PTR) records configured for this IP.
                  </div>
                )}
              </div>

              {/* Geolocation Card */}
              {loadingGeo ? (
                <div className="flex items-center gap-2 text-slate-500 py-2">
                  <FiRefreshCw className="animate-spin text-sm" />
                  <span className="text-xs font-semibold">Locating IP address...</span>
                </div>
              ) : geoData && geoData.status !== 'fail' && geoData.country ? (
                <div className="border-t border-slate-900 pt-5 space-y-4">
                  <h4 className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <FiMapPin className="text-cyan-400" />
                    <span>IP Location Intelligence</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-900 shadow-inner">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Country</span>
                      <span className="text-xs font-bold text-slate-200 mt-1">{geoData.country} ({geoData.country_code || geoData.countryCode})</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">City / Region</span>
                      <span className="text-xs font-bold text-slate-200 mt-1">{geoData.city}, {geoData.region || geoData.regionName}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">ISP</span>
                      <span className="text-xs font-bold text-slate-200 mt-1 truncate" title={geoData.org || geoData.isp}>{geoData.org || geoData.isp}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">Coordinates</span>
                      <span className="text-xs font-bold text-slate-200 mt-1 font-mono">{geoData.latitude || geoData.lat}, {geoData.longitude || geoData.lon}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!result && !loading && (
            <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
              <FiActivity className="text-4xl text-slate-700 mb-4" />
              <h3 className="font-bold text-slate-400 m-0">Awaiting IP Input</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-2 leading-relaxed font-medium">Enter an IPv4 or IPv6 address in the sidebar panel to retrieve pointer records and geographic data.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
