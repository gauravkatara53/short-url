import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  statusCode?: number;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = 'Failed to load analytics',
  message,
  onRetry,
  statusCode,
}) => {
  const is403 = statusCode === 403;
  const is404 = statusCode === 404;

  let displayTitle = title;
  let displayMessage = message;

  if (is403) {
    displayTitle = 'Access Denied';
    displayMessage = 'You do not have permission to view analytics for this URL. URLs are strictly protected and only accessible by their creator.';
  } else if (is404) {
    displayTitle = 'Short URL Not Found';
    displayMessage = 'The requested short code could not be found in the database.';
  }

  return (
    <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-4 my-6">
      <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-red-500 mx-auto">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">{displayTitle}</h3>
        <p className="text-sm text-red-600 max-w-md mx-auto">{displayMessage}</p>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        {onRetry && !is403 && !is404 && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
        )}
        <Link
          to="/"
          className="px-4 py-2 rounded-lg bg-white hover:bg-gray-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 border border-gray-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to URLs
        </Link>
      </div>
    </div>
  );
};
