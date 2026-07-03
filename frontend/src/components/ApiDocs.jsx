import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiBookOpen, FiPlay, FiCode, FiArrowRight, FiCopy, FiCheck } from 'react-icons/fi';
import { BACKEND_URL } from '../config';

export default function ApiDocs() {
  const [activeEndpoint, setActiveEndpoint] = useState('dns-lookup');
  
  // Interactive testing states
  const [testParams, setTestParams] = useState({
    domain: 'github.com',
    ip: '8.8.8.8',
    recordTypes: 'A, MX',
    dkimSelector: 'default',
    type: 'A'
  });
  
  const [responsePayload, setResponsePayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const endpoints = [
    {
      id: 'dns-lookup',
      method: 'POST',
      path: '/api/dns-lookup',
      description: 'Query specific DNS records for a single domain name.',
      bodyParam: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target domain name (e.g. google.com).' },
        { name: 'recordTypes', type: 'array', required: false, description: 'List of record types to query (A, AAAA, MX, TXT, NS, CNAME, SOA, SRV, CAA, DNSKEY, DS).' }
      ],
      samplePayload: {
        domain: 'github.com',
        recordTypes: ['A', 'MX']
      }
    },
    {
      id: 'reverse-dns',
      method: 'GET',
      path: '/api/reverse-dns',
      description: 'Query PTR records of a specific IPv4/IPv6 coordinate.',
      queryParams: true,
      params: [
        { name: 'ip', type: 'string', required: true, description: 'Target IP coordinate (e.g. 8.8.8.8).' }
      ]
    },
    {
      id: 'whois',
      method: 'GET',
      path: '/api/whois',
      description: 'Request domain registration and ownership WHOIS text.',
      queryParams: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target domain name.' }
      ]
    },
    {
      id: 'ssl-check',
      method: 'GET',
      path: '/api/ssl-check',
      description: 'Verify TLS connection validity and certificate parameters.',
      queryParams: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target secure domain.' }
      ]
    },
    {
      id: 'propagation',
      method: 'GET',
      path: '/api/propagation',
      description: 'Compare resolved records across major global nameservers.',
      queryParams: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target domain.' },
        { name: 'type', type: 'string', required: false, description: 'DNS Record type to verify (default: A).' }
      ]
    },
    {
      id: 'email-security',
      method: 'GET',
      path: '/api/email-security',
      description: 'Verify SPF, DMARC, selector DKIM, and DNSSEC statuses.',
      queryParams: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target domain.' },
        { name: 'dkimSelector', type: 'string', required: false, description: 'Selector key (default: default).' }
      ]
    },
    {
      id: 'header-analyzer',
      method: 'GET',
      path: '/api/header-analyzer',
      description: 'Inspect HTTP response headers for secure parameters.',
      queryParams: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target domain.' }
      ]
    },
    {
      id: 'smtp-check',
      method: 'GET',
      path: '/api/smtp-check',
      description: 'Connect to standard port 25 MX exchange to confirm mail headers.',
      queryParams: true,
      params: [
        { name: 'domain', type: 'string', required: true, description: 'Target domain.' }
      ]
    },
    {
      id: 'blacklist-check',
      method: 'GET',
      path: '/api/blacklist-check',
      description: 'Scan IPv4 server coordinates on main spam directories (DNSBL).',
      queryParams: true,
      params: [
        { name: 'ip', type: 'string', required: true, description: 'Target IPv4 coordinate.' }
      ]
    },
    {
      id: 'ip-geo',
      method: 'GET',
      path: '/api/ip-geo',
      description: 'Retrieve geographic coordinates and ISP details for any IP.',
      queryParams: true,
      params: [
        { name: 'ip', type: 'string', required: true, description: 'Target IP coordinate.' }
      ]
    }
  ];

  const currentEndpoint = endpoints.find(e => e.id === activeEndpoint);

  const handleCopyCode = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestApi = async () => {
    setLoading(true);
    setResponsePayload(null);
    
    const baseUrl = BACKEND_URL;
    try {
      let res;
      if (currentEndpoint.method === 'POST') {
        const body = {
          domain: testParams.domain,
          recordTypes: testParams.recordTypes.split(',').map(s => s.trim()).filter(Boolean)
        };
        res = await axios.post(`${baseUrl}${currentEndpoint.path}`, body);
      } else {
        // Build query string
        const params = {};
        if (currentEndpoint.id === 'reverse-dns' || currentEndpoint.id === 'blacklist-check' || currentEndpoint.id === 'ip-geo') {
          params.ip = testParams.ip;
        } else {
          params.domain = testParams.domain;
        }
        
        if (currentEndpoint.id === 'propagation') {
          params.type = testParams.type;
        }
        if (currentEndpoint.id === 'email-security') {
          params.dkimSelector = testParams.dkimSelector;
        }
        
        res = await axios.get(`${baseUrl}${currentEndpoint.path}`, { params });
      }
      
      setResponsePayload(res.data);
      toast.success('API response received.');
    } catch (err) {
      setResponsePayload(err.response?.data || { error: err.message });
      toast.error('API request failed.');
    } finally {
      setLoading(false);
    }
  };

  // Generate fetch snippet code
  const getSnippet = () => {
    const baseUrl = BACKEND_URL;
    if (currentEndpoint.method === 'POST') {
      return `fetch('${baseUrl}${currentEndpoint.path}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    domain: '${testParams.domain}',
    recordTypes: [${testParams.recordTypes.split(',').map(s => `'${s.trim()}'`).join(', ')}]
  })
})
.then(response => response.json())
.then(data => console.log(data));`;
    } else {
      let queryStr = '';
      if (currentEndpoint.id === 'reverse-dns' || currentEndpoint.id === 'blacklist-check' || currentEndpoint.id === 'ip-geo') {
        queryStr = `?ip=${testParams.ip}`;
      } else {
        queryStr = `?domain=${testParams.domain}`;
      }
      
      if (currentEndpoint.id === 'propagation') {
        queryStr += `&type=${testParams.type}`;
      }
      if (currentEndpoint.id === 'email-security') {
        queryStr += `&dkimSelector=${testParams.dkimSelector}`;
      }

      return `fetch('${baseUrl}${currentEndpoint.path}${queryStr}')
.then(response => response.json())
.then(data => console.log(data));`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">API Documentation Reference</h2>
        <p className="text-slate-400 text-sm font-medium">Use the interactive endpoint reference list and playground below to integrate BulkDNS Pro directly into your custom scripts.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Endpoint Navigation (Sidebar) */}
        <div className="glass-panel p-4 space-y-1.5 h-fit">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block p-2 mb-1">Developer APIs</span>
          {endpoints.map((ep) => (
            <button
              key={ep.id}
              onClick={() => { setActiveEndpoint(ep.id); setResponsePayload(null); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-left text-xs font-semibold ${
                activeEndpoint === ep.id
                  ? 'bg-purple-600/10 border-purple-500/35 text-white'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <span className="truncate pr-2">{ep.path}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                ep.method === 'POST' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                {ep.method}
              </span>
            </button>
          ))}
        </div>

        {/* Documentation & Playground */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-panel p-6 space-y-5">
            {/* Header info */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                  currentEndpoint.method === 'POST' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}>
                  {currentEndpoint.method}
                </span>
                <span className="font-mono text-sm font-bold text-slate-200">{currentEndpoint.path}</span>
              </div>
              <p className="text-sm text-slate-400 font-medium leading-relaxed">{currentEndpoint.description}</p>
            </div>

            {/* Parameters Table */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Query / Body Parameters</span>
              <div className="overflow-x-auto border border-slate-900 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-900/10 select-none">
                      <th className="p-3 text-slate-400 font-bold">Parameter</th>
                      <th className="p-3 text-slate-400 font-bold">Type</th>
                      <th className="p-3 text-slate-400 font-bold">Required</th>
                      <th className="p-3 text-slate-400 font-bold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/50">
                    {currentEndpoint.params.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-900/10">
                        <td className="p-3 font-mono font-bold text-purple-300">{p.name}</td>
                        <td className="p-3 font-mono text-slate-500 font-medium">{p.type}</td>
                        <td className="p-3">
                          {p.required ? (
                            <span className="text-rose-400 font-bold uppercase text-[9px]">Yes</span>
                          ) : (
                            <span className="text-slate-600 font-semibold uppercase text-[9px]">No</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-400 font-medium leading-normal">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Code Snippet Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FiCode className="text-purple-400" />
                  <span>Request Snippet (JavaScript)</span>
                </span>
                <button
                  onClick={() => handleCopyCode(getSnippet())}
                  className="bg-slate-950 border border-slate-900 hover:border-slate-800 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
                  title="Copy Code"
                >
                  {copied ? <FiCheck className="text-emerald-400" /> : <FiCopy />}
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-900 p-4 rounded-xl text-[11px] font-mono text-cyan-300 overflow-x-auto leading-relaxed shadow-inner">
                {getSnippet()}
              </pre>
            </div>

            {/* Playground inputs */}
            <div className="border-t border-slate-900 pt-5 space-y-4">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Interactive Playground Testing</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(currentEndpoint.id !== 'reverse-dns' && currentEndpoint.id !== 'blacklist-check' && currentEndpoint.id !== 'ip-geo') ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-semibold uppercase block">Test Domain</label>
                    <input
                      type="text"
                      value={testParams.domain}
                      onChange={(e) => setTestParams({ ...testParams, domain: e.target.value })}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-lg py-2 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-semibold uppercase block">Test IP Address</label>
                    <input
                      type="text"
                      value={testParams.ip}
                      onChange={(e) => setTestParams({ ...testParams, ip: e.target.value })}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-lg py-2 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                )}

                {currentEndpoint.id === 'dns-lookup' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-semibold uppercase block">Record Types (Comma Separated)</label>
                    <input
                      type="text"
                      value={testParams.recordTypes}
                      onChange={(e) => setTestParams({ ...testParams, recordTypes: e.target.value })}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-lg py-2 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                )}

                {currentEndpoint.id === 'propagation' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-semibold uppercase block">Check Record Type</label>
                    <select
                      value={testParams.type}
                      onChange={(e) => setTestParams({ ...testParams, type: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="A">A</option>
                      <option value="AAAA">AAAA</option>
                      <option value="MX">MX</option>
                      <option value="TXT">TXT</option>
                      <option value="NS">NS</option>
                    </select>
                  </div>
                )}

                {currentEndpoint.id === 'email-security' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-semibold uppercase block">DKIM Selector</label>
                    <input
                      type="text"
                      value={testParams.dkimSelector}
                      onChange={(e) => setTestParams({ ...testParams, dkimSelector: e.target.value })}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-lg py-2 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleTestApi}
                disabled={loading}
                className="glow-btn-purple w-full sm:w-auto px-5 py-2.5"
              >
                {loading ? (
                  <>
                    <FiRefreshCw className="animate-spin text-sm" />
                    <span>Executing Request...</span>
                  </>
                ) : (
                  <>
                    <FiPlay className="text-sm" />
                    <span>Send Test Query</span>
                    <FiArrowRight className="text-sm" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Playground live response */}
          {responsePayload && (
            <div className="glass-panel p-6 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Response Payload</h3>
              <pre className="bg-slate-950 border border-slate-900 p-5 rounded-xl text-xs font-mono text-cyan-300 leading-relaxed overflow-x-auto max-h-96 shadow-inner select-text">
                {JSON.stringify(responsePayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
