import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Monitor, Smartphone, Tablet, HelpCircle } from 'lucide-react';
import type { DeviceAnalytics } from '../types/analytics';

interface DeviceChartProps {
  data: DeviceAnalytics[];
}

const COLORS = ['#ee6723', '#2563eb', '#16a34a', '#d97706'];

const getDeviceIcon = (device: string) => {
  const d = device.toLowerCase();
  if (d === 'desktop') return <Monitor className="w-4 h-4 text-[#f36601]" />;
  if (d === 'mobile') return <Smartphone className="w-4 h-4 text-blue-600" />;
  if (d === 'tablet') return <Tablet className="w-4 h-4 text-green-600" />;
  return <HelpCircle className="w-4 h-4 text-amber-600" />;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-lg">
        <div className="text-xs font-semibold text-slate-800 capitalize">{item.device}</div>
        <div className="text-xs text-slate-600">
          <span className="font-mono font-bold">{item.clicks.toLocaleString()}</span> clicks ({item.percentage}%)
        </div>
      </div>
    );
  }
  return null;
};

export const DeviceChart: React.FC<DeviceChartProps> = ({ data }) => {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-64">
      {/* Donut Chart */}
      <div className="w-full sm:w-1/2 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="clicks"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown list */}
      <div className="w-full sm:w-1/2 flex flex-col gap-2.5">
        {data.map((item, index) => (
          <div
            key={item.device}
            className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              {getDeviceIcon(item.device)}
              <span className="text-xs font-medium text-slate-700 capitalize">
                {item.device}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-500">{item.clicks}</span>
              <span className="font-semibold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                {item.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
