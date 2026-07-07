import React from 'react';
import { 
  FiGrid, 
  FiRefreshCw, 
  FiSearch, 
  FiLock, 
  FiGlobe, 
  FiShield, 
  FiMail, 
  FiBookOpen,
  FiTerminal
} from 'react-icons/fi';

export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'bulk-dns', name: 'Bulk DNS Lookup', icon: FiGrid, description: 'Query thousands of domains' },
    { id: 'reverse-dns', name: 'Reverse DNS', icon: FiRefreshCw, description: 'Bulk resolve IPs to Hostnames' },
    { id: 'whois', name: 'WHOIS Lookup', icon: FiSearch, description: 'Domain ownership lookup' },
    { id: 'ssl-check', name: 'SSL Certificate Checker', icon: FiLock, description: 'Verify TLS certificates' },
    { id: 'propagation', name: 'DNS Propagation', icon: FiGlobe, description: 'Global DNS check' },
    { id: 'email-security', name: 'Email Deliverability', icon: FiShield, description: 'SPF, DKIM, DMARC, DNSSEC' },
    { id: 'dmarc-checker', name: 'DMARC Checker', icon: FiShield, description: 'Bulk DMARC record verification' },
    { id: 'smtp-blacklist', name: 'SMTP & Blacklist', icon: FiMail, description: 'Mail server check & DNSBL' },
    { id: 'api-docs', name: 'API Reference', icon: FiBookOpen, description: 'REST endpoints documentation' },
  ];

  return (
    <aside className="w-80 bg-slate-950/80 border-r border-slate-900 flex flex-col min-h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-900/60 flex items-center gap-3">
        <div className="h-10 w-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
          <FiTerminal className="text-xl text-white font-bold" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white m-0 leading-none">BulkDNS Pro</h1>
          <span className="text-xs text-purple-400 font-semibold tracking-wider uppercase">Network Intelligence</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-start gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-left group ${
                isActive 
                  ? 'bg-purple-600/10 border border-purple-500/30 text-white shadow-md' 
                  : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40'
              }`}
            >
              <Icon className={`text-lg mt-0.5 shrink-0 transition-transform group-hover:scale-110 ${
                isActive ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'
              }`} />
              <div>
                <div className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-slate-300'}`}>
                  {item.name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-medium leading-normal">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-900/60 text-center">
        <p className="text-xs text-slate-600 font-medium">BulkDNS Pro v1.0.0</p>
        <p className="text-[10px] text-slate-700 mt-1">Enterprise-Grade Intelligence</p>
      </div>
    </aside>
  );
}
