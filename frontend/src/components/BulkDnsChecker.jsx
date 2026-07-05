import React, { useState, useRef } from 'react';
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
  FiSettings,
  FiFileText
} from 'react-icons/fi';
import DashboardStats from './DashboardStats';

// DNS record type number mapping
const DNS_TYPE_NUMBERS = {
  A: 1, AAAA: 28, MX: 15, NS: 2, TXT: 16,
  CNAME: 5, SOA: 6, SRV: 33, CAA: 257, DNSKEY: 48, DS: 43
};

// Query DNS-over-HTTPS (Google) for a single domain+type
async function dohQuery(domain, type) {
  const typeNum = DNS_TYPE_NUMBERS[type] || 1;
  const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${typeNum}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`DoH HTTP ${resp.status}`);
  return resp.json();
}

// Lookup all requested record types for a domain
async function lookupDomain(domain, recordTypes) {
  const startTime = Date.now();
  const records = {};
  let ip = null;
  let hasAnyAnswer = false;

  // Always include NS in queries for the NS column, even if user didn't select it
  const queryTypes = recordTypes.includes('NS') ? recordTypes : [...recordTypes, 'NS'];

  await Promise.all(queryTypes.map(async (type) => {
    try {
      const data = await dohQuery(domain, type);
      // Status 0 = NOERROR, 3 = NXDOMAIN
      if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
        hasAnyAnswer = true;
        records[type] = data.Answer.map(a => a.data);
        if (type === 'A' && data.Answer.length > 0) {
          ip = data.Answer[0].data;
        }
      } else {
        records[type] = [];
      }
    } catch (e) {
      records[type] = [];
    }
  }));

  // GeoIP lookup if we have an IP (use ip-api.com — free, CORS-enabled)
  let country = '';
  let isp = '';
  if (ip) {
    try {
      const geoResp = await fetch(`http://ip-api.com/json/${ip}?fields=country,isp`);
      if (geoResp.ok) {
        const geo = await geoResp.json();
        country = geo.country || '';
        isp = geo.isp || '';
      }
    } catch {}
  }

  return {
    domain,
    success: hasAnyAnswer,
    records,
    ip: ip || '',
    country,
    isp,
    ns: records.NS || [],
    timeMs: Date.now() - startTime
  };
}

export default function BulkDnsChecker() {
  const [inputText, setInputText] = useState('');
  const [recordTypes, setRecordTypes] = useState(['A', 'MX', 'TXT']);
  const [dnsServer, setDnsServer] = useState('');
  const [concurrency, setConcurrency] = useState(10);
  const [delay, setDelay] = useState(0);
  const [isCustomResolver, setIsCustomResolver] = useState(false);
  const [customResolverIp, setCustomResolverIp] = useState('');
  
  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ total: 0, processed: 0, successful: 0, failed: 0, avgTimeMs: 0 });
  const [results, setResults] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  
  // Table filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [recordFilter, setRecordFilter] = useState('all');

  // Selection and Visible columns
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState({
    ip: true,
    domain: true,
    country: true,
    isp: true,
    records: true
  });
  
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const cancelRef = useRef(false);

  const availableRecordTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'SRV', 'CAA', 'DNSKEY', 'DS'];

  // Handle file import
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (fileType === 'txt') {
      reader.onload = (evt) => {
        const text = evt.target.result;
        setInputText(text);
        toast.success(`Loaded text file with domains.`);
      };
      reader.readAsText(file);
    } else if (fileType === 'csv') {
      reader.onload = (evt) => {
        const text = evt.target.result;
        // Simple extraction of commas or newlines
        const domains = text.split(/[\n,\r]+/).map(d => d.trim()).filter(Boolean);
        setInputText(domains.join('\n'));
        toast.success(`Loaded CSV file with ${domains.length} rows.`);
      };
      reader.readAsText(file);
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const domains = json.flat().map(v => String(v || '').trim()).filter(Boolean);
          setInputText(domains.join('\n'));
          toast.success(`Loaded Excel sheet with ${domains.length} entries.`);
        } catch (err) {
          toast.error('Failed to parse Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error('Unsupported file type. Please upload .txt, .csv, or .xlsx.');
    }
  };

  // Toggle record type selection (Single selection only)
  const toggleRecordType = (type) => {
    setRecordTypes([type]);
  };

  // Start Lookup
  const handleStart = async () => {
    if (!inputText.trim()) {
      toast.error('Please input or upload at least one domain.');
      return;
    }

    const domains = inputText
      .split(/[\n,\s]+/)
      .map(d => d.trim())
      .filter(Boolean);

    const uniqueDomains = Array.from(new Set(domains));
    const total = uniqueDomains.length;

    if (total === 0) {
      toast.error('No valid domains found.');
      return;
    }

    const resolver = isCustomResolver ? customResolverIp.trim() : dnsServer;
    if (isCustomResolver && !customResolverIp.trim()) {
      toast.error('Please enter a custom DNS resolver IP.');
      return;
    }

    setIsRunning(true);
    setResults([]);
    setExpandedRows({});
    cancelRef.current = false;

    setStats({
      total,
      processed: 0,
      successful: 0,
      failed: 0,
      avgTimeMs: 0
    });

    let processed = 0;
    let successful = 0;
    let failed = 0;
    let totalTime = 0;
    let index = 0;

    // Concurrency queue worker
    const worker = async () => {
      while (index < uniqueDomains.length && !cancelRef.current) {
        const currentIdx = index++;
        if (currentIdx >= uniqueDomains.length) break;
        const domain = uniqueDomains[currentIdx];

        if (delay > 0 && currentIdx > 0) {
          await new Promise(r => setTimeout(r, delay));
        }

        if (cancelRef.current) break;

        try {
          const result = await lookupDomain(domain, recordTypes);

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
            domain,
            success: false,
            error: err.message,
            records: {},
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

    // Spawn workers based on concurrency setting
    const numWorkers = Math.min(concurrency, total);
    const workers = Array.from({ length: numWorkers }, () => worker());

    await Promise.all(workers);

    setIsRunning(false);
    
    if (cancelRef.current) {
      toast.error('Bulk DNS check cancelled.');
    } else {
      setStats(prev => ({
        ...prev,
        avgTimeMs: processed > 0 ? Math.round(totalTime / processed) : 0
      }));
      toast.success('Bulk DNS check completed successfully!');
    }
  };

  // Cancel Lookup
  const handleCancel = () => {
    cancelRef.current = true;
    setIsRunning(false);
  };

  // Toggle Row Expand
  const toggleRow = (domain) => {
    setExpandedRows(prev => ({
      ...prev,
      [domain]: !prev[domain]
    }));
  };

  // Filtered Results list
  const filteredResults = results.filter(item => {
    const matchesSearch = item.domain.includes(searchTerm.toLowerCase()) || 
      Object.values(item.records).flat().some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.ip && item.ip.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.country && item.country.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.isp && item.isp.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' 
      ? true 
      : statusFilter === 'success' 
        ? item.success 
        : !item.success;

    const matchesRecord = recordFilter === 'all'
      ? true
      : item.records[recordFilter] && item.records[recordFilter].length > 0;

    return matchesSearch && matchesStatus && matchesRecord;
  });

  // Flag emoji helper
  const getFlagEmoji = (countryCode) => {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  // Sorting Handler
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedResults = React.useMemo(() => {
    let sortableItems = [...filteredResults];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal, bVal;
        if (sortConfig.key === 'ip') {
          aVal = a.ip || '';
          bVal = b.ip || '';
        } else if (sortConfig.key === 'domain') {
          aVal = a.domain || '';
          bVal = b.domain || '';
        } else if (sortConfig.key === 'country') {
          aVal = a.country || '';
          bVal = b.country || '';
        } else if (sortConfig.key === 'isp') {
          aVal = a.isp || '';
          bVal = b.isp || '';
        } else if (sortConfig.key === 'ns') {
          aVal = (a.ns || []).join(', ');
          bVal = (b.ns || []).join(', ');
        } else if (sortConfig.key.startsWith('record_')) {
          const type = sortConfig.key.substring(7);
          aVal = (a.records?.[type] || []).join(', ');
          bVal = (b.records?.[type] || []).join(', ');
        } else {
          aVal = a[sortConfig.key] || '';
          bVal = b[sortConfig.key] || '';
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredResults, sortConfig]);

  // Selection Handlers
  const toggleSelectDomain = (domain) => {
    setSelectedDomains(prev => 
      prev.includes(domain) 
        ? prev.filter(d => d !== domain) 
        : [...prev, domain]
    );
  };

  const toggleSelectAll = () => {
    if (filteredResults.length === 0) return;
    
    // Check if all filtered domains are currently selected
    const allSelected = filteredResults.every(r => selectedDomains.includes(r.domain));
    if (allSelected) {
      // Remove only the filtered ones from selection
      const filteredDomains = filteredResults.map(r => r.domain);
      setSelectedDomains(prev => prev.filter(d => !filteredDomains.includes(d)));
    } else {
      // Add all filtered ones to selection (keeping existing selections too)
      const domainsToAdd = filteredResults.map(r => r.domain);
      setSelectedDomains(prev => Array.from(new Set([...prev, ...domainsToAdd])));
    }
  };

  // Export options
  const exportToCSV = () => {
    if (results.length === 0) return;
    
    const targets = selectedDomains.length > 0 
      ? results.filter(r => selectedDomains.includes(r.domain)) 
      : results;

    // Construct CSV Header
    const headers = ['Domain', 'Success', 'Latency (ms)', 'IP Address', 'Country', 'ISP / Organization', 'Nameservers'];
    
    const rows = targets.map(item => {
      return [
        item.domain, 
        item.success ? 'TRUE' : 'FALSE', 
        item.timeMs,
        item.ip || 'N/A',
        item.country || 'N/A',
        item.isp || 'N/A',
        (item.ns || []).join(' | ')
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dns_records_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (results.length === 0) return;

    const targets = selectedDomains.length > 0 
      ? results.filter(r => selectedDomains.includes(r.domain)) 
      : results;

    const blob = new Blob([JSON.stringify(targets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dns_records_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    if (results.length === 0) return;
    
    const targets = selectedDomains.length > 0 
      ? results.filter(r => selectedDomains.includes(r.domain)) 
      : results;

    const dataToExport = targets.map(item => {
      return {
        Domain: item.domain,
        Success: item.success ? 'Yes' : 'No',
        'Latency (ms)': item.timeMs,
        'IP Address': item.ip || 'N/A',
        Country: item.country || 'N/A',
        'ISP / Organization': item.isp || 'N/A',
        Nameservers: (item.ns || []).join(' | ')
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DNS Lookups');
    XLSX.writeFile(workbook, `dns_records_${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Bulk DNS Lookup</h2>
        <p className="text-slate-400 text-sm font-medium">Verify, resolve, and analyze DNS records of thousands of domains in parallel.</p>
      </div>

      {/* Control Panel (Glass Card) */}
      <div className="glass-panel p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-300 font-bold flex items-center gap-1.5">
              <span>Domain List</span>
              <span className="text-[10px] text-slate-500 font-medium font-mono">(one per line or comma separated)</span>
            </label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors font-medium">
                <FiUpload className="text-sm" />
                <span>Upload File</span>
                <input 
                  type="file" 
                  accept=".txt,.csv,.xlsx,.xls" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>
          
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isRunning}
            placeholder="example.com&#10;google.com&#10;github.com"
            className="w-full h-40 bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none transition-colors"
          />
        </div>

        {/* Right: Record Selector & Server Options */}
        <div className="space-y-5">
          {/* Record Selection */}
          <div className="space-y-2">
            <span className="text-sm text-slate-300 font-bold block">Record Types</span>
            <div className="flex flex-wrap gap-1.5">
              {availableRecordTypes.map((type) => {
                const isSelected = recordTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleRecordType(type)}
                    disabled={isRunning}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-150 ${
                      isSelected
                        ? 'bg-purple-600 border border-purple-500 text-white shadow shadow-purple-500/20'
                        : 'bg-slate-950 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DNS Server Options */}
          <div className="space-y-2">
            <span className="text-sm text-slate-300 font-bold block">DNS Server (Resolver)</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setIsCustomResolver(false); setDnsServer(''); }}
                disabled={isRunning}
                className={`py-2 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  !isCustomResolver && dnsServer === ''
                    ? 'bg-purple-600/10 border-purple-500/30 text-purple-300 font-bold'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                System Default
              </button>
              <button
                type="button"
                onClick={() => { setIsCustomResolver(false); setDnsServer('1.1.1.1'); }}
                disabled={isRunning}
                className={`py-2 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  !isCustomResolver && dnsServer === '1.1.1.1'
                    ? 'bg-purple-600/10 border-purple-500/30 text-purple-300 font-bold'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                Cloudflare (1.1.1.1)
              </button>
              <button
                type="button"
                onClick={() => { setIsCustomResolver(false); setDnsServer('8.8.8.8'); }}
                disabled={isRunning}
                className={`py-2 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  !isCustomResolver && dnsServer === '8.8.8.8'
                    ? 'bg-purple-600/10 border-purple-500/30 text-purple-300 font-bold'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                Google (8.8.8.8)
              </button>
              <button
                type="button"
                onClick={() => setIsCustomResolver(true)}
                disabled={isRunning}
                className={`py-2 text-xs font-semibold rounded-lg border text-center transition-colors ${
                  isCustomResolver
                    ? 'bg-purple-600/10 border-purple-500/30 text-purple-300 font-bold'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                Custom IP
              </button>
            </div>
            {isCustomResolver && (
              <input
                type="text"
                value={customResolverIp}
                onChange={(e) => setCustomResolverIp(e.target.value)}
                placeholder="e.g. 208.67.222.222"
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-purple-500/50 mt-1"
              />
            )}
          </div>
        </div>
      </div>

      {/* Speed Controls & Execution buttons */}
      <div className="glass-panel p-5 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex flex-col md:flex-row gap-5 items-center w-full md:w-auto">
          {/* Concurrency slider */}
          <div className="flex items-center gap-3 w-full md:w-60">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Concurrency:</span>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value))}
              disabled={isRunning}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-slate-200 w-8">{concurrency}</span>
          </div>

          {/* Delay slider */}
          <div className="flex items-center gap-3 w-full md:w-60">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Delay (ms):</span>
            <input 
              type="range" 
              min="0" 
              max="1000" 
              step="50"
              value={delay}
              onChange={(e) => setDelay(parseInt(e.target.value))}
              disabled={isRunning}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-slate-200 w-12">{delay}ms</span>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto shrink-0 justify-end">
          {isRunning ? (
            <button onClick={handleCancel} className="glow-btn-danger px-6 py-2.5 w-full md:w-auto">
              <FiSquare />
              <span>Cancel Check</span>
            </button>
          ) : (
            <button onClick={handleStart} className="glow-btn-purple px-6 py-2.5 w-full md:w-auto">
              <FiPlay />
              <span>Run Lookup</span>
            </button>
          )}
        </div>
      </div>

      {/* Dashboard KPI cards */}
      <DashboardStats stats={stats} />

      {/* Progress Bar */}
      {isRunning && (
        <div className="w-full glass-panel p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Resolving DNS Queries...</span>
            <span className="font-mono">{stats.processed} / {stats.total} ({Math.round((stats.processed / stats.total) * 100)}%)</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-900">
            <div 
              className="bg-gradient-to-r from-purple-500 to-cyan-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${(stats.processed / stats.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results Workspace */}
      {results.length > 0 && (
        <div className="space-y-3">
          {/* Header counts block */}
          <div className="text-slate-400 text-sm font-semibold select-none flex items-center">
            <span className="font-extrabold text-white text-base mr-1.5">
              {results.filter(r => r.success).length} of {results.length}
            </span>
            hosts processed successfully
          </div>

          <div className="glass-panel overflow-hidden">
            {/* Action Toolbar */}
            <div className="p-4 border-b border-slate-900 bg-slate-900/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* Search bar */}
                <div className="relative w-full sm:w-64">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
                  <input
                    type="text"
                    placeholder="Search domain or value..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                {/* Status filter */}
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                      statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('success')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                      statusFilter === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Resolved
                  </button>
                  <button
                    onClick={() => setStatusFilter('failed')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                      statusFilter === 'failed' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Failed
                  </button>
                </div>
              </div>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-900/15 select-none">
                    {/* Header Checkbox */}
                    <th className="p-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={sortedResults.length > 0 && sortedResults.every(r => selectedDomains.includes(r.domain))}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    
                    {visibleColumns.ip && (
                      <th 
                        onClick={() => requestSort('ip')} 
                        className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center gap-1">
                          <span>IP Address</span>
                          <span className="text-[10px] text-slate-600">⇅</span>
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.domain && (
                      <th 
                        onClick={() => requestSort('domain')} 
                        className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center gap-1">
                          <span>Domain</span>
                          <span className="text-[10px] text-slate-600">⇅</span>
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.country && (
                      <th 
                        onClick={() => requestSort('country')} 
                        className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center gap-1">
                          <span>Country</span>
                          <span className="text-[10px] text-slate-600">⇅</span>
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.isp && (
                      <th 
                        onClick={() => requestSort('isp')} 
                        className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center gap-1">
                          <span>ISP / Organization</span>
                          <span className="text-[10px] text-slate-600">⇅</span>
                        </div>
                      </th>
                    )}
                    
                    {visibleColumns.records && recordTypes.map((type) => (
                      <th 
                        key={type}
                        onClick={() => requestSort(`record_${type}`)} 
                        className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center gap-1">
                          <span>{type} Record</span>
                          <span className="text-[10px] text-slate-600">⇅</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40">
                  {sortedResults.length === 0 ? (
                    <tr>
                      <td colSpan={1 + (visibleColumns.ip ? 1 : 0) + (visibleColumns.domain ? 1 : 0) + (visibleColumns.country ? 1 : 0) + (visibleColumns.isp ? 1 : 0) + (visibleColumns.records ? recordTypes.length : 0)} className="p-12 text-center text-slate-600 text-sm font-semibold">
                        No matching records found.
                      </td>
                    </tr>
                  ) : (
                    sortedResults.map((item, idx) => {
                      const isExpanded = !!expandedRows[item.domain];
                      const isRowSelected = selectedDomains.includes(item.domain);
                      const activeColCount = 1 + 
                        (visibleColumns.ip ? 1 : 0) + 
                        (visibleColumns.domain ? 1 : 0) + 
                        (visibleColumns.country ? 1 : 0) + 
                        (visibleColumns.isp ? 1 : 0) + 
                        (visibleColumns.records ? recordTypes.length : 0);

                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-slate-900/20 transition-colors group">
                            {/* Row Checkbox */}
                            <td className="p-4 text-center">
                              <input
                                type="checkbox"
                                checked={isRowSelected}
                                onChange={() => toggleSelectDomain(item.domain)}
                                className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>

                            {visibleColumns.ip && (
                              <td 
                                onClick={() => toggleRow(item.domain)}
                                className="p-4 font-mono text-sm text-slate-200 cursor-pointer"
                              >
                                {item.ip || 'N/A'}
                              </td>
                            )}

                            {visibleColumns.domain && (
                              <td 
                                onClick={() => toggleRow(item.domain)}
                                className="p-4 font-bold text-sm text-slate-200 cursor-pointer"
                              >
                                {item.domain}
                              </td>
                            )}

                            {visibleColumns.country && (
                              <td 
                                onClick={() => toggleRow(item.domain)}
                                className="p-4 text-sm text-slate-300 cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5">
                                  {item.countryCode ? (
                                    <span className="text-base leading-none" role="img" aria-label="Flag">
                                      {getFlagEmoji(item.countryCode)}
                                    </span>
                                  ) : null}
                                  <span>{item.country}</span>
                                </span>
                              </td>
                            )}

                            {visibleColumns.isp && (
                              <td 
                                onClick={() => toggleRow(item.domain)}
                                className="p-4 text-sm text-slate-300 cursor-pointer max-w-xs truncate"
                                title={item.isp}
                              >
                                {item.isp}
                              </td>
                            )}

                            {visibleColumns.records && recordTypes.map((type) => (
                              <td 
                                key={type}
                                onClick={() => toggleRow(item.domain)}
                                className="p-4 cursor-pointer"
                              >
                                <div className="font-mono text-xs text-slate-400 space-y-0.5 leading-normal max-w-xs">
                                  {item.records?.[type] && item.records[type].length > 0 ? (
                                    item.records[type].map((val, i) => (
                                      <div key={i} className="truncate" title={val}>{val}</div>
                                    ))
                                  ) : (
                                    <span className="text-slate-600 italic">No {type} records</span>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-900/10 border-l-2 border-purple-500">
                              <td colSpan={activeColCount} className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* Left Side: Record Details */}
                                  <div className="space-y-4">
                                    <h4 className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                      <FiSettings className="text-purple-400" />
                                      <span>DNS Record Breakdown</span>
                                    </h4>
                                    <div className="space-y-2.5">
                                      {Object.entries(item.records)
                                        .filter(([type]) => !type.startsWith('_'))
                                        .map(([type, list]) => (
                                          <div key={type} className="flex flex-col border-b border-slate-900/60 pb-2">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/25">{type}</span>
                                              <span className="text-[10px] text-slate-500 font-medium">{list.length} item(s) found</span>
                                            </div>
                                            {list.length > 0 ? (
                                              <ul className="list-disc list-inside pl-1 space-y-1">
                                                {list.map((r, i) => (
                                                  <li key={i} className="text-xs font-mono text-slate-300 break-all">{r}</li>
                                                ))}
                                              </ul>
                                            ) : (
                                              <span className="text-xs text-slate-600 font-semibold italic pl-1">No records detected</span>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  </div>

                                  {/* Right Side: Raw JSON View */}
                                  <div className="space-y-4">
                                    <h4 className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                      <FiFileText className="text-cyan-400" />
                                      <span>Raw API Data Payload</span>
                                    </h4>
                                    <pre className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-80 leading-relaxed shadow-inner">
                                      {JSON.stringify(item, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer column controls and exports */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-t border-slate-900 bg-slate-950/40">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-400">
                <span className="text-slate-500 font-bold">Columns:</span>
                {Object.keys(visibleColumns).map((col) => (
                  <label key={col} className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
                      className="rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                    />
                    <span className="uppercase">{col === 'isp' ? 'ISP' : (col === 'records' ? 'Records' : col)}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportToCSV}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 text-xs shadow-md shadow-blue-900/10 cursor-pointer"
                >
                  <FiDownload />
                  <span>CSV</span>
                </button>
                <button
                  onClick={exportToJSON}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 text-xs shadow-md shadow-blue-900/10 cursor-pointer"
                >
                  <FiDownload />
                  <span>JSON</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
