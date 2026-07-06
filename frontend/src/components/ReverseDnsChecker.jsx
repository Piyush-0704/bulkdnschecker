import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import {
  FiUpload,
  FiPlay,
  FiSquare,
  FiDownload,
  FiSearch,
  FiFilter,
  FiChevronDown,
  FiChevronUp,
  FiRefreshCw,
  FiMapPin,
  FiActivity,
  FiSettings,
  FiLayers,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiFileText,
  FiCopy,
  FiExternalLink
} from 'react-icons/fi';

// ─── IP Validation ────────────────────────────────────────────────────────────
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

function isValidIp(ip) {
  if (IPV4_RE.test(ip)) {
    return ip.split('.').every(p => { const n = Number(p); return n >= 0 && n <= 255; });
  }
  return IPV6_RE.test(ip);
}

// ─── Convert IP to reverse arpa domain for PTR query ──────────────────────────
function ipToArpa(ip) {
  if (ip.includes('.')) {
    return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  }
  const expanded = ip.split(':').map(h => h.padStart(4, '0')).join('');
  return expanded.split('').reverse().join('.') + '.ip6.arpa';
}

// ─── Single PTR lookup via Google DNS-over-HTTPS ──────────────────────────────
async function reverseDnsLookup(ip) {
  const startTime = Date.now();
  try {
    const arpa = ipToArpa(ip);
    const url = `https://dns.google/resolve?name=${encodeURIComponent(arpa)}&type=PTR`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`DoH error: HTTP ${resp.status}`);
    const data = await resp.json();
    const timeMs = Date.now() - startTime;
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return {
        success: true,
        ip,
        hostnames: data.Answer.map(a => a.data.replace(/\.$/, '')),
        timeMs
      };
    }
    return { success: false, ip, hostnames: [], error: 'No PTR record found', timeMs };
  } catch (err) {
    return { success: false, ip, hostnames: [], error: err.message, timeMs: Date.now() - startTime };
  }
}

// ─── Geolocation lookup (ip-api.com — free, CORS-enabled) ────────────────────
async function fetchGeoData(ip) {
  try {
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode,city,regionName,org,isp,lat,lon,timezone`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.country) {
      return {
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        region: data.regionName,
        org: data.org || data.isp,
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone
      };
    }
  } catch {}
  return null;
}

// ─── Flag emoji helper ───────────────────────────────────────────────────────
function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ReverseDnsChecker() {
  // ─── Input state ──────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');
  const [concurrency, setConcurrency] = useState(10);
  const [delay, setDelay] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // ─── Execution state ─────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ total: 0, processed: 0, successful: 0, failed: 0, avgTimeMs: 0 });
  const [results, setResults] = useState([]);
  const cancelRef = useRef(false);

  // ─── Table state ──────────────────────────────────────────────────────────
  const [expandedRows, setExpandedRows] = useState({});
  const [geoCache, setGeoCache] = useState({});
  const [loadingGeo, setLoadingGeo] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedIps, setSelectedIps] = useState([]);

  // ─── File upload ──────────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (ext === 'txt') {
      reader.onload = (evt) => {
        setInputText(evt.target.result);
        toast.success('Loaded IP addresses from text file.');
      };
      reader.readAsText(file);
    } else if (ext === 'csv') {
      reader.onload = (evt) => {
        const ips = evt.target.result.split(/[\n,\r]+/).map(d => d.trim()).filter(Boolean);
        setInputText(ips.join('\n'));
        toast.success(`Loaded ${ips.length} entries from CSV.`);
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const ips = json.flat().map(v => String(v || '').trim()).filter(Boolean);
          setInputText(ips.join('\n'));
          toast.success(`Loaded ${ips.length} entries from Excel.`);
        } catch {
          toast.error('Failed to parse Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error('Unsupported file type. Please upload .txt, .csv, or .xlsx.');
    }
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  // ─── Start bulk lookup ────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!inputText.trim()) {
      toast.error('Please input or upload at least one IP address.');
      return;
    }

    const rawIps = inputText.split(/[\n,\s]+/).map(d => d.trim()).filter(Boolean);
    const uniqueIps = Array.from(new Set(rawIps));

    // Validate IPs
    const validIps = uniqueIps.filter(isValidIp);
    const invalidCount = uniqueIps.length - validIps.length;

    if (validIps.length === 0) {
      toast.error('No valid IP addresses found. Please check your input.');
      return;
    }

    if (invalidCount > 0) {
      toast.error(`Skipped ${invalidCount} invalid IP address${invalidCount > 1 ? 'es' : ''}.`);
    }

    const total = validIps.length;
    setIsRunning(true);
    setResults([]);
    setExpandedRows({});
    setSelectedIps([]);
    cancelRef.current = false;

    setStats({ total, processed: 0, successful: 0, failed: 0, avgTimeMs: 0 });

    let processed = 0;
    let successful = 0;
    let failed = 0;
    let totalTime = 0;
    let index = 0;

    // Concurrency queue worker
    const worker = async () => {
      while (index < validIps.length && !cancelRef.current) {
        const currentIdx = index++;
        if (currentIdx >= validIps.length) break;
        const ip = validIps[currentIdx];

        if (delay > 0 && currentIdx > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
        if (cancelRef.current) break;

        try {
          const result = await reverseDnsLookup(ip);
          if (cancelRef.current) break;

          processed++;
          if (result.success) {
            successful++;
          } else {
            failed++;
          }
          totalTime += result.timeMs;

          setStats(prev => ({
            ...prev,
            processed,
            successful,
            failed
          }));
          setResults(prev => [result, ...prev]);
        } catch (err) {
          if (cancelRef.current) break;
          processed++;
          failed++;
          const failedResult = {
            success: false,
            ip,
            hostnames: [],
            error: err.message,
            timeMs: 0
          };
          setStats(prev => ({
            ...prev,
            processed,
            successful,
            failed
          }));
          setResults(prev => [failedResult, ...prev]);
        }
      }
    };

    const numWorkers = Math.min(concurrency, total);
    const workers = Array.from({ length: numWorkers }, () => worker());
    await Promise.all(workers);

    setIsRunning(false);

    if (cancelRef.current) {
      toast('Bulk reverse DNS lookup cancelled.', { icon: '⚠️' });
    } else {
      setStats(prev => ({
        ...prev,
        avgTimeMs: processed > 0 ? Math.round(totalTime / processed) : 0
      }));
      toast.success(`Bulk reverse DNS complete — ${successful} resolved, ${failed} failed.`);
    }
  };

  // ─── Cancel ───────────────────────────────────────────────────────────────
  const handleCancel = () => {
    cancelRef.current = true;
    setIsRunning(false);
  };

  // ─── Row expand + lazy geo fetch ──────────────────────────────────────────
  const toggleRow = (ip) => {
    const isExpanding = !expandedRows[ip];
    setExpandedRows(prev => ({ ...prev, [ip]: !prev[ip] }));

    // Lazy-load geo data on expand
    if (isExpanding && !geoCache[ip] && !loadingGeo[ip]) {
      setLoadingGeo(prev => ({ ...prev, [ip]: true }));
      fetchGeoData(ip).then(geo => {
        if (geo) {
          setGeoCache(prev => ({ ...prev, [ip]: geo }));
        }
        setLoadingGeo(prev => ({ ...prev, [ip]: false }));
      });
    }
  };

  // ─── Filtering ────────────────────────────────────────────────────────────
  const filteredResults = results.filter(item => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term ||
      item.ip.toLowerCase().includes(term) ||
      item.hostnames.some(h => h.toLowerCase().includes(term)) ||
      (item.error && item.error.toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'resolved'
        ? item.success
        : !item.success;

    return matchesSearch && matchesStatus;
  });

  // ─── Sorting ──────────────────────────────────────────────────────────────
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedResults = useMemo(() => {
    let items = [...filteredResults];
    if (sortConfig.key) {
      items.sort((a, b) => {
        let aVal, bVal;
        if (sortConfig.key === 'ip') {
          // Sort IPs numerically by octets
          aVal = a.ip.split('.').map(n => n.padStart(3, '0')).join('.');
          bVal = b.ip.split('.').map(n => n.padStart(3, '0')).join('.');
        } else if (sortConfig.key === 'hostnames') {
          aVal = a.hostnames.join(', ');
          bVal = b.hostnames.join(', ');
        } else if (sortConfig.key === 'status') {
          aVal = a.success ? 'a' : 'z';
          bVal = b.success ? 'a' : 'z';
        } else if (sortConfig.key === 'timeMs') {
          aVal = a.timeMs;
          bVal = b.timeMs;
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        } else {
          aVal = a[sortConfig.key] || '';
          bVal = b[sortConfig.key] || '';
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [filteredResults, sortConfig]);

  // ─── Selection ────────────────────────────────────────────────────────────
  const toggleSelectIp = (ip) => {
    setSelectedIps(prev =>
      prev.includes(ip) ? prev.filter(i => i !== ip) : [...prev, ip]
    );
  };

  const toggleSelectAll = () => {
    if (filteredResults.length === 0) return;
    const allSelected = filteredResults.every(r => selectedIps.includes(r.ip));
    if (allSelected) {
      const filtered = filteredResults.map(r => r.ip);
      setSelectedIps(prev => prev.filter(i => !filtered.includes(i)));
    } else {
      const ipsToAdd = filteredResults.map(r => r.ip);
      setSelectedIps(prev => Array.from(new Set([...prev, ...ipsToAdd])));
    }
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  const getExportTargets = () => {
    return selectedIps.length > 0
      ? results.filter(r => selectedIps.includes(r.ip))
      : results;
  };

  const exportToCSV = () => {
    const targets = getExportTargets();
    if (targets.length === 0) return;

    const headers = ['IP Address', 'Status', 'Hostname(s)', 'Response Time (ms)'];
    const rows = targets.map(item => [
      item.ip,
      item.success ? 'Resolved' : 'Failed',
      item.hostnames.length > 0 ? item.hostnames.join(' | ') : (item.error || 'No PTR'),
      item.timeMs
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rdns_lookup_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported to CSV.');
  };

  const exportToJSON = () => {
    const targets = getExportTargets();
    if (targets.length === 0) return;

    const blob = new Blob([JSON.stringify(targets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rdns_lookup_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported to JSON.');
  };

  const exportToExcel = () => {
    const targets = getExportTargets();
    if (targets.length === 0) return;

    const data = targets.map(item => ({
      'IP Address': item.ip,
      'Status': item.success ? 'Resolved' : 'Failed',
      'Hostname(s)': item.hostnames.join(' | ') || item.error || 'No PTR',
      'Response Time (ms)': item.timeMs
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RDNS Lookups');
    XLSX.writeFile(workbook, `rdns_lookup_${Date.now()}.xlsx`);
    toast.success('Exported to Excel.');
  };

  // ─── Copy all hostnames ───────────────────────────────────────────────────
  const copyHostnames = () => {
    const targets = getExportTargets().filter(r => r.success);
    const text = targets.map(r => `${r.ip}\t${r.hostnames.join(', ')}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Hostnames copied to clipboard.');
  };

  // ─── Sort icon helper ────────────────────────────────────────────────────
  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <FiChevronDown className="text-slate-700 text-xs" />;
    }
    return sortConfig.direction === 'asc'
      ? <FiChevronUp className="text-purple-400 text-xs" />
      : <FiChevronDown className="text-purple-400 text-xs" />;
  };

  // ─── Progress percentage ──────────────────────────────────────────────────
  const progressPct = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ─── Title ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Bulk Reverse DNS Lookup</h2>
        <p className="text-slate-400 text-sm font-medium">Resolve hundreds of IP addresses (IPv4 & IPv6) to their PTR hostnames in parallel.</p>
      </div>

      {/* ─── Control Panel ──────────────────────────────────────────────────── */}
      <div className="glass-panel p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-300 font-bold flex items-center gap-1.5">
              <span>IP Address List</span>
              <span className="text-[10px] text-slate-500 font-medium font-mono">(one per line, comma or space separated)</span>
            </label>
            <label className="cursor-pointer glow-btn-purple !py-1.5 !px-3 !text-xs !font-semibold !shadow-none">
              <FiUpload className="text-xs" />
              <span>Import File</span>
              <input
                type="file"
                accept=".txt,.csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <textarea
            rows={8}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`8.8.8.8\n1.1.1.1\n208.67.222.222\n9.9.9.9`}
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-4 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 resize-none leading-relaxed"
            disabled={isRunning}
          />

          {/* IP count hint */}
          {inputText.trim() && (
            <div className="text-xs text-slate-500 font-medium">
              {Array.from(new Set(inputText.split(/[\n,\s]+/).map(d => d.trim()).filter(Boolean))).length} unique IPs detected
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="space-y-5">
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors font-semibold"
          >
            <FiSettings className={`transition-transform ${showSettings ? 'rotate-90' : ''}`} />
            <span>Advanced Settings</span>
            {showSettings ? <FiChevronUp className="text-xs" /> : <FiChevronDown className="text-xs" />}
          </button>

          {showSettings && (
            <div className="space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-900/60">
              {/* Concurrency */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400 font-semibold">Concurrency</label>
                  <span className="text-xs text-purple-400 font-mono font-bold">{concurrency}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full accent-purple-500 h-1.5"
                />
                <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>

              {/* Delay */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400 font-semibold">Delay Between Requests</label>
                  <span className="text-xs text-purple-400 font-mono font-bold">{delay}ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="50"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="w-full accent-purple-500 h-1.5"
                />
                <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                  <span>0ms</span>
                  <span>500ms</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={!inputText.trim()}
                className="glow-btn-purple w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FiPlay className="text-lg" />
                <span>Start Bulk RDNS Lookup</span>
              </button>
            ) : (
              <button
                onClick={handleCancel}
                className="glow-btn-danger w-full py-3"
              >
                <FiSquare className="text-lg" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          {/* Info */}
          <div className="text-xs text-slate-500 leading-relaxed bg-slate-950/30 p-3.5 rounded-lg border border-slate-900/60">
            <strong>About Bulk RDNS:</strong> Performs PTR record lookups via Google DNS-over-HTTPS for each IP. Expand any row to view geolocation intelligence.
          </div>
        </div>
      </div>

      {/* ─── Progress Bar (while running) ───────────────────────────────────── */}
      {isRunning && stats.total > 0 && (
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiRefreshCw className="animate-spin text-purple-400" />
              <span className="text-sm text-slate-300 font-semibold">Resolving IP addresses…</span>
            </div>
            <span className="text-xs text-slate-400 font-mono font-bold">{stats.processed} / {stats.total}</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #9333ea, #7c3aed, #6d28d9)'
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
            <span>{progressPct}% complete</span>
            <span className="flex items-center gap-3">
              <span className="text-emerald-500">✓ {stats.successful}</span>
              <span className="text-amber-500">✗ {stats.failed}</span>
            </span>
          </div>
        </div>
      )}

      {/* ─── Stats Dashboard ────────────────────────────────────────────────── */}
      {stats.processed > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              title: 'Total IPs',
              value: stats.total,
              subtext: `${stats.processed} of ${stats.total} processed`,
              icon: FiLayers,
              colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
              valueColor: 'text-blue-100',
              progress: stats.total > 0 ? (stats.processed / stats.total) * 100 : 0,
              barColor: 'bg-blue-500'
            },
            {
              title: 'Resolved (PTR Found)',
              value: stats.successful,
              subtext: `${stats.processed > 0 ? Math.round((stats.successful / stats.processed) * 100) : 0}% Success Rate`,
              icon: FiCheckCircle,
              colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
              valueColor: 'text-emerald-400',
              progress: stats.processed > 0 ? (stats.successful / stats.processed) * 100 : 0,
              barColor: 'bg-emerald-500'
            },
            {
              title: 'Failed / No PTR',
              value: stats.failed,
              subtext: `${stats.processed > 0 ? Math.round((stats.failed / stats.processed) * 100) : 0}% Failure Rate`,
              icon: FiAlertTriangle,
              colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
              valueColor: 'text-amber-400',
              progress: stats.processed > 0 ? (stats.failed / stats.processed) * 100 : 0,
              barColor: 'bg-amber-500'
            },
            {
              title: 'Avg Response Time',
              value: `${stats.avgTimeMs || (stats.processed > 0 ? Math.round(results.reduce((s, r) => s + r.timeMs, 0) / stats.processed) : 0)}ms`,
              subtext: (() => {
                const avg = stats.avgTimeMs || (stats.processed > 0 ? Math.round(results.reduce((s, r) => s + r.timeMs, 0) / stats.processed) : 0);
                return avg < 100 ? 'Excellent speed' : avg < 300 ? 'Standard latency' : 'Slow responses';
              })(),
              icon: FiClock,
              colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
              valueColor: 'text-purple-400',
              progress: Math.min(100, ((stats.avgTimeMs || 0) / 600) * 100),
              barColor: 'bg-purple-500'
            }
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="glass-panel p-5 flex flex-col relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-purple-600/5 rounded-full blur-xl group-hover:bg-purple-600/10 transition-colors" />
                <div className="flex items-center justify-between mb-3.5">
                  <span className="text-sm text-slate-400 font-semibold">{item.title}</span>
                  <div className={`p-2 rounded-lg border ${item.colorClass}`}>
                    <Icon className="text-lg" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold tracking-tight ${item.valueColor}`}>{item.value}</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 font-medium">{item.subtext}</div>
                {stats.processed > 0 && (
                  <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`${item.barColor} h-full rounded-full transition-all duration-500`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Results Table ──────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="glass-panel overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
              <input
                type="text"
                placeholder="Search IPs or hostnames…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-300 focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="resolved">Resolved</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={copyHostnames}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-purple-500/30 transition-all font-semibold"
                title="Copy hostnames to clipboard"
              >
                <FiCopy className="text-xs" />
                <span>Copy</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-purple-500/30 transition-all font-semibold"
                title="Export to CSV"
              >
                <FiDownload className="text-xs" />
                <span>CSV</span>
              </button>
              <button
                onClick={exportToJSON}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-purple-500/30 transition-all font-semibold"
                title="Export to JSON"
              >
                <FiDownload className="text-xs" />
                <span>JSON</span>
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-purple-500/30 transition-all font-semibold"
                title="Export to Excel"
              >
                <FiFileText className="text-xs" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Selection summary */}
          {selectedIps.length > 0 && (
            <div className="px-4 py-2 bg-purple-500/5 border-b border-purple-500/10 flex items-center justify-between">
              <span className="text-xs text-purple-300 font-semibold">
                {selectedIps.length} IP{selectedIps.length > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedIps([])}
                className="text-xs text-slate-400 hover:text-white transition-colors font-medium"
              >
                Clear selection
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/60 text-left">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filteredResults.length > 0 && filteredResults.every(r => selectedIps.includes(r.ip))}
                      onChange={toggleSelectAll}
                      className="accent-purple-500 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 w-10 text-xs text-slate-500 font-bold">#</th>
                  <th
                    className="px-4 py-3 text-xs text-slate-400 font-bold uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => requestSort('ip')}
                  >
                    <span className="flex items-center gap-1">IP Address <SortIcon columnKey="ip" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-xs text-slate-400 font-bold uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => requestSort('hostnames')}
                  >
                    <span className="flex items-center gap-1">Hostname(s) <SortIcon columnKey="hostnames" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-xs text-slate-400 font-bold uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => requestSort('status')}
                  >
                    <span className="flex items-center gap-1">Status <SortIcon columnKey="status" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-xs text-slate-400 font-bold uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => requestSort('timeMs')}
                  >
                    <span className="flex items-center gap-1">Time <SortIcon columnKey="timeMs" /></span>
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((item, idx) => (
                  <React.Fragment key={item.ip + '-' + idx}>
                    {/* Main Row */}
                    <tr
                      className={`border-t border-slate-900/40 transition-colors cursor-pointer ${
                        expandedRows[item.ip] ? 'bg-slate-900/30' : 'hover:bg-slate-900/20'
                      }`}
                      onClick={() => toggleRow(item.ip)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIps.includes(item.ip)}
                          onChange={() => toggleSelectIp(item.ip)}
                          className="accent-purple-500 rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono text-slate-200 font-semibold text-xs">{item.ip}</td>
                      <td className="px-4 py-3 max-w-xs">
                        {item.success && item.hostnames.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {item.hostnames.map((h, i) => (
                              <span
                                key={i}
                                className="inline-block bg-purple-500/10 border border-purple-500/20 text-purple-300 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold truncate max-w-[280px]"
                                title={h}
                              >
                                {h}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 italic font-medium">
                            {item.error || 'No PTR record'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.success ? (
                          <span className="status-badge text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                            Resolved
                          </span>
                        ) : (
                          <span className="status-badge text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono font-semibold">{item.timeMs}ms</td>
                      <td className="px-4 py-3">
                        {expandedRows[item.ip]
                          ? <FiChevronUp className="text-purple-400" />
                          : <FiChevronDown className="text-slate-600" />
                        }
                      </td>
                    </tr>

                    {/* Expanded Geolocation Row */}
                    {expandedRows[item.ip] && (
                      <tr className="bg-slate-950/40">
                        <td colSpan={7} className="px-6 py-5">
                          {loadingGeo[item.ip] ? (
                            <div className="flex items-center gap-2 text-slate-500 py-2">
                              <FiRefreshCw className="animate-spin text-sm" />
                              <span className="text-xs font-semibold">Loading geolocation data…</span>
                            </div>
                          ) : geoCache[item.ip] ? (
                            <div className="space-y-4">
                              <h4 className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <FiMapPin className="text-cyan-400" />
                                <span>IP Location Intelligence</span>
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-900 shadow-inner">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Country</span>
                                  <span className="text-xs font-bold text-slate-200 mt-1">
                                    {getFlagEmoji(geoCache[item.ip].countryCode)} {geoCache[item.ip].country}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase">City / Region</span>
                                  <span className="text-xs font-bold text-slate-200 mt-1">
                                    {geoCache[item.ip].city}{geoCache[item.ip].region ? `, ${geoCache[item.ip].region}` : ''}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase">ISP / Org</span>
                                  <span className="text-xs font-bold text-slate-200 mt-1 truncate" title={geoCache[item.ip].org}>
                                    {geoCache[item.ip].org}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Coordinates</span>
                                  <span className="text-xs font-bold text-slate-200 mt-1 font-mono">
                                    {geoCache[item.ip].latitude}, {geoCache[item.ip].longitude}
                                  </span>
                                </div>
                              </div>
                              {geoCache[item.ip].timezone && (
                                <div className="text-[10px] text-slate-500 font-medium">
                                  Timezone: <span className="text-slate-400 font-semibold">{geoCache[item.ip].timezone}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-600 italic font-medium py-2">
                              Geolocation data unavailable for this IP.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="px-4 py-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Showing {sortedResults.length} of {results.length} results
              {statusFilter !== 'all' && <span className="text-purple-400"> (filtered)</span>}
            </span>
          </div>
        </div>
      )}

      {/* ─── Empty State ────────────────────────────────────────────────────── */}
      {results.length === 0 && !isRunning && (
        <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[300px]">
          <FiActivity className="text-4xl text-slate-700 mb-4" />
          <h3 className="font-bold text-slate-400 m-0">Ready for Bulk RDNS Lookup</h3>
          <p className="text-xs text-slate-600 max-w-sm mt-2 leading-relaxed font-medium">
            Enter IP addresses in the input panel above, or import a file (.txt, .csv, .xlsx) to resolve PTR records and discover hostnames at scale.
          </p>
        </div>
      )}
    </div>
  );
}
