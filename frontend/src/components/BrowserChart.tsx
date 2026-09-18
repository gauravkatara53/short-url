import React from 'react';
import { Globe } from 'lucide-react';
import type { BrowserAnalytics } from '../types/analytics';

interface BrowserChartProps {
  data: BrowserAnalytics[];
}

export const BrowserChart: React.FC<BrowserChartProps> = ({ data }) => {
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.browser} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-medium text-slate-700">{item.browser}</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-slate-500">{item.clicks.toLocaleString()} clicks</span>
              <span className="font-semibold text-[#f36601]">{item.percentage}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(item.percentage, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
