import React from 'react';

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
        <div className="h-6 w-48 bg-gray-200 rounded-lg" />
        <div className="h-4 w-96 bg-gray-100 rounded-md" />
      </div>

      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-white border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-8 w-28 bg-gray-200 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Timeline Chart Skeleton */}
      <div className="h-80 rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-60 w-full bg-gray-100 rounded-xl" />
      </div>

      {/* Grid Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-48 w-full bg-gray-100 rounded-xl" />
        </div>
        <div className="h-72 rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-48 w-full bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  );
};
