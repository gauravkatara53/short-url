import React from 'react';
import { MapPin } from 'lucide-react';
import type { CountryAnalytics } from '../types/analytics';

interface CountryTableProps {
  data: CountryAnalytics[];
}

export const CountryTable: React.FC<CountryTableProps> = ({ data }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-slate-400 uppercase tracking-wider">
            <th className="pb-2.5 font-semibold">Country</th>
            <th className="pb-2.5 font-semibold text-right">Clicks</th>
            <th className="pb-2.5 font-semibold text-right">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 font-mono">
          {data.map((item, idx) => {
            const isUnknown = !item.country || item.country.toLowerCase() === 'unknown';

            return (
              <tr key={idx} className="group hover:bg-gray-50 transition-colors">
                <td className="py-2.5 font-sans">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-green-600" />
                    <span className="font-medium text-slate-700">
                      {isUnknown ? 'Unknown / Global' : item.country}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 text-right font-medium text-slate-700">
                  {item.clicks.toLocaleString()}
                </td>
                <td className="py-2.5 text-right">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold text-[11px]">
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
