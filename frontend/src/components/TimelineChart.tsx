import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TimelinePoint } from '../types/analytics';

interface TimelineChartProps {
  data: TimelinePoint[];
  interval?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    let formattedDate = label;
    try {
      const d = new Date(label);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch {}

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg">
        <div className="text-xs text-slate-500 font-medium mb-1">{formattedDate}</div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />
          <span className="text-sm font-bold text-slate-800 font-mono">
            {payload[0].value.toLocaleString()} <span className="text-xs font-normal text-slate-500">clicks</span>
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export const TimelineChart: React.FC<TimelineChartProps> = ({ data, interval }) => {
  const chartData = data.map((item) => {
    let displayTime = item.time;
    try {
      const d = new Date(item.time);
      if (!isNaN(d.getTime())) {
        if (interval === 'hour') {
          displayTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } else if (interval === 'week') {
          displayTime = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
        } else {
          displayTime = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      }
    } catch {}

    return {
      rawTime: item.time,
      displayTime,
      clicks: item.clicks,
    };
  });

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="clicksGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ee6723" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#ee6723" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="displayTime"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="clicks"
            stroke="#ee6723"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#clicksGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
