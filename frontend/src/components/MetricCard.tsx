import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'coral' | 'green' | 'blue' | 'amber';
  trend?: string;
}

const colorMap = {
  coral: {
    bg: 'bg-white',
    iconBg: 'bg-orange-50 text-[#f36601] border-orange-200',
    trendBg: 'bg-green-50 text-green-700',
  },
  green: {
    bg: 'bg-white',
    iconBg: 'bg-green-50 text-green-600 border-green-200',
    trendBg: 'bg-green-50 text-green-700',
  },
  blue: {
    bg: 'bg-white',
    iconBg: 'bg-blue-50 text-blue-600 border-blue-200',
    trendBg: 'bg-green-50 text-green-700',
  },
  amber: {
    bg: 'bg-white',
    iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
    trendBg: 'bg-green-50 text-green-700',
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'coral',
  trend,
}) => {
  const styles = colorMap[color];

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${styles.bg} border border-gray-200 p-5 shadow-sm hover:shadow hover:border-gray-300 transition-all group`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className={`p-2.5 rounded-xl border ${styles.iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-3xl font-extrabold tracking-tight text-slate-800 font-mono">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles.trendBg}`}>
            {trend}
          </span>
        )}
      </div>

      {subtitle && (
        <div className="mt-1 text-xs text-slate-400">{subtitle}</div>
      )}
    </div>
  );
};
