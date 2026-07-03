import React from 'react';
import { FiLayers, FiCheckCircle, FiAlertTriangle, FiClock } from 'react-icons/fi';

export default function DashboardStats({ stats }) {
  const { total, processed, successful, failed, avgTimeMs } = stats;
  
  const successRate = processed > 0 ? Math.round((successful / processed) * 100) : 0;
  const failureRate = processed > 0 ? Math.round((failed / processed) * 100) : 0;

  const cardItems = [
    {
      title: 'Total Domains',
      value: total,
      subtext: `${processed} of ${total} processed`,
      icon: FiLayers,
      colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      valueColor: 'text-blue-100'
    },
    {
      title: 'Successful Lookups',
      value: successful,
      subtext: `${successRate}% Success Rate`,
      icon: FiCheckCircle,
      colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      valueColor: 'text-emerald-400'
    },
    {
      title: 'Failed/No Records',
      value: failed,
      subtext: `${failureRate}% Failure Rate`,
      icon: FiAlertTriangle,
      colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      valueColor: 'text-amber-400'
    },
    {
      title: 'Average Latency',
      value: `${avgTimeMs}ms`,
      subtext: avgTimeMs < 100 ? 'Excellent response speed' : avgTimeMs < 300 ? 'Standard latency' : 'Slow response speed',
      icon: FiClock,
      colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      valueColor: 'text-purple-400'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {cardItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={index} className="glass-panel p-5 flex flex-col relative overflow-hidden group">
            {/* Background Glow */}
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

            <div className="text-xs text-slate-500 mt-2 font-medium flex items-center gap-1.5">
              {item.subtext}
            </div>

            {/* Micro-Progress Bar for Processed */}
            {item.title === 'Total Domains' && total > 0 && (
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, (processed / total) * 100)}%` }} 
                />
              </div>
            )}
            
            {item.title === 'Successful Lookups' && processed > 0 && (
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${successRate}%` }} 
                />
              </div>
            )}

            {item.title === 'Failed/No Records' && processed > 0 && (
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${failureRate}%` }} 
                />
              </div>
            )}

            {item.title === 'Average Latency' && processed > 0 && (
              <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, (avgTimeMs / 600) * 100)}%` }} 
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
