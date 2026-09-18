import React from 'react';
import { Cpu } from 'lucide-react';
import type { OSAnalytics } from '../types/analytics';

interface OSChartProps {
  data: OSAnalytics[];
}

export const OSChart: React.FC<OSChartProps> = ({ data }) => {
  return (
    <div className="space-y-3">
      {data.map((item) => {
        const name = item.os || item.operatingSystem || 'Other';
        return (
          <div key={name} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium text-slate-700">{name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-500">{item.clicks.toLocaleString()} clicks</span>
                <span className="font-semibold text-blue-600">{item.percentage}%</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.max(item.percentage, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
