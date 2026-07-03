import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import BulkDnsChecker from './components/BulkDnsChecker';
import ReverseDnsChecker from './components/ReverseDnsChecker';
import WhoisChecker from './components/WhoisChecker';
import SslChecker from './components/SslChecker';
import PropagationChecker from './components/PropagationChecker';
import EmailSecurityChecker from './components/EmailSecurityChecker';
import HeaderAnalyzer from './components/HeaderAnalyzer';
import SmtpBlacklistChecker from './components/SmtpBlacklistChecker';
import ApiDocs from './components/ApiDocs';

export default function App() {
  const [activeTab, setActiveTab] = useState('bulk-dns');

  // Render correct component based on active tab
  const renderActiveView = () => {
    switch (activeTab) {
      case 'bulk-dns':
        return <BulkDnsChecker />;
      case 'reverse-dns':
        return <ReverseDnsChecker />;
      case 'whois':
        return <WhoisChecker />;
      case 'ssl-check':
        return <SslChecker />;
      case 'propagation':
        return <PropagationChecker />;
      case 'email-security':
        return <EmailSecurityChecker />;
      case 'header-analyzer':
        return <HeaderAnalyzer />;
      case 'smtp-blacklist':
        return <SmtpBlacklistChecker />;
      case 'api-docs':
        return <ApiDocs />;
      default:
        return <BulkDnsChecker />;
    }
  };

  return (
    <div className="flex bg-slate-950 text-slate-100 min-h-screen overflow-x-hidden selection:bg-purple-600/30 selection:text-purple-300">
      {/* Toast Notification Provider */}
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#f8fafc',
            border: '1px solid rgba(147, 51, 234, 0.2)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff'
            }
          },
          error: {
            iconTheme: {
              primary: '#f43f5e',
              secondary: '#ffffff'
            }
          }
        }}
      />
      
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* Main Panel Content */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto max-h-screen">
        <div className="max-w-6xl mx-auto space-y-6">
          {renderActiveView()}
        </div>
      </main>
    </div>
  );
}
