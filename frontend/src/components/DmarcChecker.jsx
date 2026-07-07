import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import {
  FiUpload,
  FiPlay,
  FiSquare,
  FiDownload,
  FiSearch,
  FiShield,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi';

// Query DMARC record via DNS-over-HTTPS (Google)
async function queryDmarc(domain) {
  const dmarcDomain = `_dmarc.${domain}`;
  const url = `https://dns.google/resolve?name=${encodeURIComponent(dmarcDomain)}&type=16`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`DoH HTTP ${resp.status}`);
  const data = await resp.json();

  if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
    const txtRecords = data.Answer
      .filter(a => a.type === 16)
      .map(a => a.data?.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
    
    const dmarcRecord = txtRecords.find(r => r && r.toLowerCase().startsWith('v=dmarc1'));
    if (dmarcRecord) {
      return { found: true, record: dmarcRecord, parsed: parseDmarc(dmarcRecord) };
    }
  }

  return { found: false, record: null, parsed: null };
}

// Parse DMARC tags into structured object
function parseDmarc(record) {
  const tags = {};
  const parts = record.split(';').map(p => p.trim()).filter(Boolean);
  parts.forEach(part => {
    const [key, ...valueParts] = part.split('=');
    if (key && valueParts.length > 0) {
      tags[key.trim().toLowerCase()] = valueParts.join('=').trim();
    }
  });

  const policyLabel = (val) => {
    switch (val?.toLowerCase()) {
      case 'none': return { text: 'None (Monitor Only)', color: 'amber' };
      case 'quarantine': return { text: 'Quarantine', color: 'blue' };
      case 'reject': return { text: 'Reject', color: 'emerald' };
      default: return { text: val || 'Not Set', color: 'slate' };
    }
  };

  return {
    version: tags.v || 'DMARC1',
    policy: policyLabel(tags.p),
    subdomainPolicy: policyLabel(tags.sp),
    rua: tags.rua || null,
    ruf: tags.ruf || null,
    pct: tags.pct || '100',
    adkim: tags.adkim === 's' ? 'Strict' : 'Relaxed',
    aspf: tags.aspf === 's' ? 'Strict' : 'Relaxed',
    fo: tags.fo || '0',
    ri: tags.ri || '86400',
    raw: tags
  };
}

export default function DmarcChecker() {
  const [inputText, setInputText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState({});
  const [stats, setStats] = useState({ total: 0, processed: 0, found: 0, notFound: 0 });

  const cancelRef = useRef(false);

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileType = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (fileType === 'txt') {
      reader.onload = (evt) => {
        setInputText(evt.target.result);
        toast.success('Loaded text file with domains.');
      };
      reader.readAsText(file);
    } else if (fileType === 'csv') {
      reader.onload = (evt) => {
        const domains = evt.target.result.split(/[\n,\r]+/).map(d => d.trim()).filter(Boolean);
        setInputText(domains.join('\n'));
        toast.success(`Loaded CSV with ${domains.length} domains.`);
      };
      reader.readAsText(file);
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const domains = json.flat().map(v => String(v || '').trim()).filter(Boolean);
          setInputText(domains.join('\n'));
          toast.success(`Loaded Excel with ${domains.length} entries.`);
        } catch {
          toast.error('Failed to parse Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error('Unsupported file type. Upload .txt, .csv, or .xlsx.');
    }
  };

  // Start bulk DMARC check
  const handleStart = async () => {
    if (!inputText.trim()) {
      toast.error('Please enter at least one domain.');
      return;
    }

    const domains = inputText
      .split(/[\n,\s]+/)
      .map(d => d.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0])
      .filter(Boolean);
    const uniqueDomains = Array.from(new Set(domains));
    const total = uniqueDomains.length;

    if (total === 0) {
      toast.error('No valid domains found.');
      return;
    }

    setIsRunning(true);
    setResults([]);
    setExpandedRows({});
    cancelRef.current = false;
    setStats({ total, processed: 0, found: 0, notFound: 0 });

    let processed = 0;
    let found = 0;
    let notFound = 0;
    let index = 0;

    const worker = async () => {
      while (index < uniqueDomains.length && !cancelRef.current) {
        const currentIdx = index++;
        if (currentIdx >= uniqueDomains.length) break;
        const domain = uniqueDomains[currentIdx];

        if (cancelRef.current) break;

        try {
          const startTime = Date.now();
          const dmarcResult = await queryDmarc(domain);
          const timeMs = Date.now() - startTime;

          processed++;
          if (dmarcResult.found) found++;
          else notFound++;

          setStats(prev => ({ ...prev, processed, found, notFound }));
          setResults(prev => [...prev, {
            domain,
            ...dmarcResult,
            timeMs,
            error: null
          }]);
        } catch (err) {
          processed++;
          notFound++;
          setStats(prev => ({ ...prev, processed, found, notFound }));
          setResults(prev => [...prev, {
            domain,
            found: false,
            record: null,
            parsed: null,
            timeMs: 0,
            error: err.message
          }]);
        }
      }
    };

    const numWorkers = Math.min(10, total);
    await Promise.all(Array.from({ length: numWorkers }, () => worker()));

    setIsRunning(false);
    if (cancelRef.current) {
      toast.error('DMARC check cancelled.');
    } else {
      toast.success('Bulk DMARC check completed!');
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsRunning(false);
  };

  const toggleRow = (domain) => {
    setExpandedRows(prev => ({ ...prev, [domain]: !prev[domain] }));
  };

  // Filter results
  const filteredResults = results.filter(item => {
    const matchesSearch = item.domain.includes(searchTerm.toLowerCase()) ||
      (item.record && item.record.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'found'
        ? item.found
        : !item.found;

    return matchesSearch && matchesStatus;
  });

  // Export CSV
  const exportToCSV = () => {
    if (results.length === 0) return;
    const headers = ['Domain', 'DMARC Found', 'Policy', 'Subdomain Policy', 'RUA', 'RUF', 'PCT', 'ADKIM', 'ASPF', 'Full Record'];
    const rows = results.map(item => [
      item.domain,
      item.found ? 'YES' : 'NO',
      item.parsed?.policy?.text || 'N/A',
      item.parsed?.subdomainPolicy?.text || 'N/A',
      item.parsed?.rua || 'N/A',
      item.parsed?.ruf || 'N/A',
      item.parsed?.pct || 'N/A',
      item.parsed?.adkim || 'N/A',
      item.parsed?.aspf || 'N/A',
      item.record || 'N/A'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dmarc_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Excel
  const exportToExcel = () => {
    if (results.length === 0) return;
    const dataToExport = results.map(item => ({
      Domain: item.domain,
      'DMARC Found': item.found ? 'Yes' : 'No',
      Policy: item.parsed?.policy?.text || 'N/A',
      'Subdomain Policy': item.parsed?.subdomainPolicy?.text || 'N/A',
      RUA: item.parsed?.rua || 'N/A',
      RUF: item.parsed?.ruf || 'N/A',
      'PCT (%)': item.parsed?.pct || 'N/A',
      ADKIM: item.parsed?.adkim || 'N/A',
      ASPF: item.parsed?.aspf || 'N/A',
      'Full Record': item.record || 'N/A'
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DMARC Results');
    XLSX.writeFile(workbook, `dmarc_results_${Date.now()}.xlsx`);
  };

  const getPolicyBadge = (policy) => {
    if (!policy) return null;
    const colorMap = {
      emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      slate: 'bg-slate-800/50 text-slate-400 border-slate-700/50'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${colorMap[policy.color] || colorMap.slate}`}>
        {policy.text}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">Bulk DMARC Checker</h2>
        <p className="text-slate-400 text-sm font-medium">Check DMARC records for thousands of domains in parallel. Verify email authentication policies and reporting configurations.</p>
      </div>

      {/* Input Panel */}
      <div className="glass-panel p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-300 font-bold flex items-center gap-1.5">
              <span>Domain List</span>
              <span className="text-[10px] text-slate-500 font-medium font-mono">(one per line or comma separated)</span>
            </label>
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
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isRunning}
            placeholder={"example.com\ngoogle.com\ngithub.com"}
            className="w-full h-40 bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none transition-colors"
          />
        </div>

        {/* Info panel */}
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FiShield className="text-purple-400 text-lg" />
              <span className="text-sm text-slate-300 font-bold">What is DMARC?</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              DMARC (Domain-based Message Authentication, Reporting & Conformance) is an email authentication protocol that builds on SPF and DKIM to protect domains from unauthorized use like phishing and spoofing.
            </p>
          </div>

          <div className="bg-slate-950/40 rounded-lg border border-slate-900/60 p-3.5 space-y-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Policy Levels</span>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                <span className="text-xs text-slate-400 font-medium"><strong className="text-slate-300">none</strong> — Monitor only, no action</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0"></span>
                <span className="text-xs text-slate-400 font-medium"><strong className="text-slate-300">quarantine</strong> — Mark as suspicious</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                <span className="text-xs text-slate-400 font-medium"><strong className="text-slate-300">reject</strong> — Block unauthorized email</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="glass-panel p-5 flex items-center justify-between">
        <div className="text-xs text-slate-400 font-semibold">
          {inputText.trim()
            ? `${inputText.split(/[\n,\s]+/).filter(Boolean).length} domain(s) ready`
            : 'Enter domains above to begin'}
        </div>
        <div className="flex gap-3">
          {isRunning ? (
            <button onClick={handleCancel} className="glow-btn-danger px-6 py-2.5">
              <FiSquare />
              <span>Cancel</span>
            </button>
          ) : (
            <button onClick={handleStart} className="glow-btn-purple px-6 py-2.5">
              <FiPlay />
              <span>Check DMARC</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="w-full glass-panel p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Checking DMARC records...</span>
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

      {/* Stats cards */}
      {(stats.processed > 0 || results.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-extrabold text-white">{stats.total}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Total Domains</div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-extrabold text-purple-400">{stats.processed}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Processed</div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-extrabold text-emerald-400">{stats.found}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">DMARC Found</div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-extrabold text-rose-400">{stats.notFound}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">No DMARC</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="glass-panel overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-900 bg-slate-900/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm" />
                  <input
                    type="text"
                    placeholder="Search domain or record..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

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
                    onClick={() => setStatusFilter('found')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                      statusFilter === 'found' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    DMARC Found
                  </button>
                  <button
                    onClick={() => setStatusFilter('notfound')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                      statusFilter === 'notfound' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    No DMARC
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-900/15 select-none">
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-12 text-center">#</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Domain</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Policy</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Subdomain Policy</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">RUA (Reports)</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-600 text-sm font-semibold">
                        No matching records found.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((item, idx) => {
                      const isExpanded = !!expandedRows[item.domain];
                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-slate-900/20 transition-colors group cursor-pointer" onClick={() => toggleRow(item.domain)}>
                            <td className="p-4 text-center text-xs text-slate-500 font-mono">{idx + 1}</td>
                            <td className="p-4 font-bold text-sm text-slate-200">{item.domain}</td>
                            <td className="p-4">
                              {item.found ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                  <FiCheckCircle className="text-sm" />
                                  Found
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400">
                                  <FiXCircle className="text-sm" />
                                  Not Found
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              {item.parsed ? getPolicyBadge(item.parsed.policy) : (
                                <span className="text-xs text-slate-600 italic">—</span>
                              )}
                            </td>
                            <td className="p-4">
                              {item.parsed ? getPolicyBadge(item.parsed.subdomainPolicy) : (
                                <span className="text-xs text-slate-600 italic">—</span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className="text-xs font-mono text-slate-400 truncate max-w-[200px] block" title={item.parsed?.rua || ''}>
                                {item.parsed?.rua || <span className="text-slate-600 italic">—</span>}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              {isExpanded ? (
                                <FiChevronUp className="text-slate-400 text-sm" />
                              ) : (
                                <FiChevronDown className="text-slate-400 text-sm" />
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-900/10 border-l-2 border-purple-500">
                              <td colSpan={7} className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* Parsed details */}
                                  <div className="space-y-4">
                                    <h4 className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                      <FiShield className="text-purple-400" />
                                      <span>DMARC Policy Details</span>
                                    </h4>
                                    {item.found && item.parsed ? (
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Policy (p)</span>
                                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{item.parsed.policy.text}</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Subdomain (sp)</span>
                                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{item.parsed.subdomainPolicy.text}</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Percentage (pct)</span>
                                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{item.parsed.pct}%</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase block">DKIM Alignment</span>
                                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{item.parsed.adkim}</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase block">SPF Alignment</span>
                                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{item.parsed.aspf}</span>
                                        </div>
                                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Report Interval</span>
                                          <span className="text-xs font-bold text-slate-200 mt-0.5 block">{Math.round(parseInt(item.parsed.ri) / 3600)}h</span>
                                        </div>
                                        {item.parsed.rua && (
                                          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900 col-span-2">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase block">Aggregate Reports (rua)</span>
                                            <span className="text-xs font-mono text-cyan-300 mt-0.5 block break-all">{item.parsed.rua}</span>
                                          </div>
                                        )}
                                        {item.parsed.ruf && (
                                          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900 col-span-2">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase block">Forensic Reports (ruf)</span>
                                            <span className="text-xs font-mono text-cyan-300 mt-0.5 block break-all">{item.parsed.ruf}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="bg-slate-950/40 p-4 rounded-lg border border-rose-500/20 text-center">
                                        <FiAlertTriangle className="text-rose-400 text-xl mx-auto mb-2" />
                                        <p className="text-xs text-rose-400 font-semibold">No DMARC record configured</p>
                                        <p className="text-[10px] text-slate-500 mt-1">This domain is vulnerable to email spoofing attacks.</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Raw record */}
                                  <div className="space-y-4">
                                    <h4 className="text-xs text-slate-300 font-bold uppercase tracking-wider">Full DMARC Record</h4>
                                    <pre className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-60 leading-relaxed shadow-inner whitespace-pre-wrap break-all">
                                      {item.record || 'No DMARC record found for this domain.'}
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

            {/* Footer exports */}
            <div className="flex items-center justify-between gap-4 p-4 border-t border-slate-900 bg-slate-950/40">
              <div className="text-xs text-slate-400 font-semibold">
                <span className="font-extrabold text-white">{filteredResults.length}</span> of <span className="font-extrabold text-white">{results.length}</span> results shown
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
                  onClick={exportToExcel}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 text-xs shadow-md shadow-blue-900/10 cursor-pointer"
                >
                  <FiDownload />
                  <span>Excel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !isRunning && (
        <div className="glass-panel p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[200px]">
          <FiShield className="text-4xl text-slate-700 mb-4" />
          <h3 className="font-bold text-slate-400 m-0">Ready to Check DMARC Records</h3>
          <p className="text-xs text-slate-600 max-w-sm mt-2 leading-relaxed font-medium">Enter your domains above and click "Check DMARC" to verify email authentication policies across all your domains in bulk.</p>
        </div>
      )}
    </div>
  );
}
