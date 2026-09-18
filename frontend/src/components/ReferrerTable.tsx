import React from 'react';
import { ExternalLink, Compass } from 'lucide-react';
import type { ReferrerAnalytics } from '../types/analytics';

interface ReferrerTableProps {
  data: ReferrerAnalytics[];
}

export const ReferrerTable: React.FC<ReferrerTableProps> = ({ data }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-slate-400 uppercase tracking-wider">
            <th className="pb-2.5 font-semibold">Source</th>
            <th className="pb-2.5 font-semibold text-right">Clicks</th>
            <th className="pb-2.5 font-semibold text-right">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 font-mono">
          {data.map((item, idx) => {
            const isDirect =
              !item.referrer ||
              item.referrer.toLowerCase().includes('direct') ||
              item.referrer.toLowerCase().includes('none');

            return (
              <tr key={idx} className="group hover:bg-gray-50 transition-colors">
                <td className="py-2.5 font-sans">
                  <div className="flex items-center gap-2">
                    {isDirect ? (
                      <span className="inline-flex items-center gap-1 text-slate-600 font-medium bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                        <Compass className="w-3 h-3 text-slate-400" />
                        Direct / None
                      </span>
                    ) : (
                      <a
                        href={item.referrer.startsWith('http') ? item.referrer : `https://${item.referrer}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline transition-colors truncate max-w-[200px] sm:max-w-xs"
                      >
                        <span className="truncate">{item.referrer}</span>
                        <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="py-2.5 text-right font-medium text-slate-700">
                  {item.clicks.toLocaleString()}
                </td>
                <td className="py-2.5 text-right">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-orange-50 text-[#f36601] font-semibold text-[11px]">
                    {item.percentage}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
