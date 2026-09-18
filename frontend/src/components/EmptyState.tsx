import React from 'react';
import { MousePointerClick, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  onRefresh?: () => void;
  shortUrl?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No click data available yet',
  message = 'Share your short link to start capturing real-time clickstream events and analytics.',
  onRefresh,
  shortUrl,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4 my-6">
      <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#f36601]">
        <MousePointerClick className="w-8 h-8 animate-bounce" />
      </div>

      <div className="space-y-1 max-w-md">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
      </div>

      {shortUrl && (
        <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm text-[#f36601] max-w-sm truncate">
          {shortUrl}
        </div>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          className="mt-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-slate-700 flex items-center gap-2 border border-gray-200 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Check for New Clicks
        </button>
      )}
    </div>
  );
};
