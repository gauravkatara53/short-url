import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import type { TimeRangePreset, TimelineInterval } from '../types/analytics';

interface DateRangeSelectorProps {
  activePreset: TimeRangePreset;
  activeInterval: TimelineInterval;
  startDate?: string;
  endDate?: string;
  onPresetChange: (preset: TimeRangePreset, start?: string, end?: string) => void;
  onIntervalChange: (interval: TimelineInterval) => void;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  activePreset,
  activeInterval,
  startDate,
  endDate,
  onPresetChange,
  onIntervalChange,
}) => {
  const [customStart, setCustomStart] = useState(
    startDate ? startDate.substring(0, 10) : new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(
    endDate ? endDate.substring(0, 10) : new Date().toISOString().substring(0, 10),
  );
  const [showCustomPicker, setShowCustomPicker] = useState(activePreset === 'custom');

  const presets: Array<{ label: string; value: TimeRangePreset }> = [
    { label: '24 Hours', value: '24h' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: 'Custom Range', value: 'custom' },
  ];

  const intervals: Array<{ label: string; value: TimelineInterval }> = [
    { label: 'Hourly', value: 'hour' },
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
  ];

  const handleSelectPreset = (preset: TimeRangePreset) => {
    if (preset === 'custom') {
      setShowCustomPicker(true);
      const startIso = new Date(`${customStart}T00:00:00.000Z`).toISOString();
      const endIso = new Date(`${customEnd}T23:59:59.999Z`).toISOString();
      onPresetChange('custom', startIso, endIso);
    } else {
      setShowCustomPicker(false);
      const now = new Date();
      let start: Date;
      if (preset === '24h') {
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (preset === '7d') {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      onPresetChange(preset, start.toISOString(), undefined);
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const startIso = new Date(`${customStart}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${customEnd}T23:59:59.999Z`).toISOString();
    onPresetChange('custom', startIso, endIso);
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
      {/* Presets */}
      <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-lg">
        {presets.map((p) => {
          const isActive = activePreset === p.value;
          return (
            <button
              key={p.value}
              onClick={() => handleSelectPreset(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Interval Selector & Custom Date Inputs */}
      <div className="flex flex-wrap items-center gap-3">
        {showCustomPicker && (
          <form onSubmit={handleApplyCustom} className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Apply
            </button>
          </form>
        )}

        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <Clock className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
          {intervals.map((inv) => {
            const isActive = activeInterval === inv.value;
            return (
              <button
                key={inv.value}
                onClick={() => onIntervalChange(inv.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-800 font-semibold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                {inv.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
