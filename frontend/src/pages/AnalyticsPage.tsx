import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  Layers,
  Globe2,
  Cpu,
  Compass,
  MapPin,
  TrendingUp,
  Activity,
  BarChart2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { MetricCard } from '../components/MetricCard';
import { DateRangeSelector } from '../components/DateRangeSelector';
import { TimelineChart } from '../components/TimelineChart';
import { DeviceChart } from '../components/DeviceChart';
import { BrowserChart } from '../components/BrowserChart';
import { OSChart } from '../components/OSChart';
import { ReferrerTable } from '../components/ReferrerTable';
import { CountryTable } from '../components/CountryTable';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

import {
  getOverviewApi,
  getTimelineApi,
  getDevicesApi,
  getBrowsersApi,
  getOperatingSystemsApi,
  getReferrersApi,
  getCountriesApi,
} from '../api/analytics';
import { getShortUrl } from '../api/client';

import type {
  UrlDetails,
  AnalyticsOverview,
  TimelinePoint,
  DeviceAnalytics,
  BrowserAnalytics,
  OSAnalytics,
  ReferrerAnalytics,
  CountryAnalytics,
  TimeRangePreset,
  TimelineInterval,
} from '../types/analytics';

export const AnalyticsPage: React.FC = () => {
  const { shortCode } = useParams<{ shortCode: string }>();

  // State
  const [urlDetails, setUrlDetails] = useState<UrlDetails | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [devices, setDevices] = useState<DeviceAnalytics[]>([]);
  const [browsers, setBrowsers] = useState<BrowserAnalytics[]>([]);
  const [operatingSystems, setOperatingSystems] = useState<OSAnalytics[]>([]);
  const [referrers, setReferrers] = useState<ReferrerAnalytics[]>([]);
  const [countries, setCountries] = useState<CountryAnalytics[]>([]);

  // Filter state
  const [preset, setPreset] = useState<TimeRangePreset>('7d');
  const [interval, setTimelineInterval] = useState<TimelineInterval>('day');
  const [startDate, setStartDate] = useState<string | undefined>(() => {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  });
  const [endDate, setEndDate] = useState<string | undefined>(undefined);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string; statusCode?: number } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fullShortUrl = getShortUrl(shortCode || '');

  // Fetch overview & all metrics
  const fetchAllData = useCallback(async (isBackground: boolean = false) => {
    if (!shortCode) return;
    if (!isBackground) {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }

    try {
      const [
        overviewData,
        timelineData,
        devicesData,
        browsersData,
        osData,
        referrersData,
        countriesData,
      ] = await Promise.all([
        getOverviewApi(shortCode),
        getTimelineApi(shortCode, { startDate, endDate, interval }),
        getDevicesApi(shortCode, { startDate, endDate }),
        getBrowsersApi(shortCode, { startDate, endDate }),
        getOperatingSystemsApi(shortCode, { startDate, endDate }),
        getReferrersApi(shortCode, { startDate, endDate, limit: 10 }),
        getCountriesApi(shortCode, { startDate, endDate, limit: 10 }),
      ]);

      setUrlDetails(overviewData.url);
      setOverview(overviewData.overview);
      setTimeline(timelineData);
      setDevices(devicesData);
      setBrowsers(browsersData);
      setOperatingSystems(osData);
      setReferrers(referrersData);
      setCountries(countriesData);
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message || 'Failed to fetch analytics';
      if (!isBackground) {
        setError({ message, statusCode: status });
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [shortCode, startDate, endDate, interval]);

  // Initial load and filter change trigger
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Handlers for date filtering
  const handlePresetChange = (newPreset: TimeRangePreset, start?: string, end?: string) => {
    setPreset(newPreset);
    setStartDate(start);
    setEndDate(end);

    // Auto-adjust default interval for UX
    if (newPreset === '24h') {
      setTimelineInterval('hour');
    } else if (newPreset === '7d' || newPreset === '30d') {
      setTimelineInterval('day');
    }
  };

  const handleIntervalChange = (newInterval: TimelineInterval) => {
    setTimelineInterval(newInterval);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fullShortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-slate-800 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <Link
            to="/"
            className="flex items-center gap-1 hover:text-[#f36601] transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            My URLs
          </Link>
          <span>/</span>
          <span className="text-slate-700 font-semibold font-mono">{shortCode}</span>
          <span>/</span>
          <span className="text-[#f36601] font-medium">Clickstream Analytics</span>
        </div>

        {/* Loading State */}
        {loading && <LoadingSkeleton />}

        {/* Error State */}
        {!loading && error && (
          <ErrorBanner
            message={error.message}
            statusCode={error.statusCode}
            onRetry={fetchAllData}
          />
        )}

        {/* Main Content */}
        {!loading && !error && (
          <>
            {/* Header Details Card */}
            <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 font-mono flex items-center gap-2">
                      /{shortCode}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      Live Analytics
                    </span>
                  </div>

                  {urlDetails && (
                    <div className="flex items-center gap-2 text-sm text-slate-500 truncate max-w-xl">
                      <span className="text-slate-400">Target:</span>
                      <a
                        href={urlDetails.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-700 hover:underline truncate"
                      >
                        {urlDetails.originalUrl}
                      </a>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={async () => {
                      setRefreshing(true);
                      await fetchAllData();
                      setRefreshing(false);
                    }}
                    disabled={refreshing}
                    className="px-3.5 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-slate-600 border border-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Refresh analytics data"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>

                  <button
                    onClick={handleCopy}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      copied
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-50 hover:bg-gray-100 text-slate-600 border border-gray-200'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied URL' : 'Copy Link'}
                  </button>

                  <a
                    href={fullShortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Visit URL
                  </a>
                </div>
              </div>

              {urlDetails && (
                <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-6 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Created: {new Date(urlDetails.createdAt).toLocaleDateString()}</span>
                  </div>
                  {urlDetails.expiresAt && (
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Expires: {new Date(urlDetails.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <Activity className="w-3.5 h-3.5" />
                    <span>Stream: ClickHouse Cloud (ReplacingMergeTree)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Total Clicks"
                value={overview?.totalClicks || 0}
                subtitle="Lifetime recorded events"
                icon={BarChart2}
                color="coral"
              />
              <MetricCard
                title="Clicks Today"
                value={overview?.clicksToday || 0}
                subtitle="Since 00:00 UTC"
                icon={Activity}
                color="green"
              />
              <MetricCard
                title="Last 7 Days"
                value={overview?.clicksLast7Days || 0}
                subtitle="Past 168 hours activity"
                icon={TrendingUp}
                color="blue"
              />
              <MetricCard
                title="Last 30 Days"
                value={overview?.clicksLast30Days || 0}
                subtitle="Monthly clickstream volume"
                icon={Clock}
                color="amber"
              />
            </div>

            {/* Zero clicks empty state */}
            {overview && overview.totalClicks === 0 ? (
              <EmptyState
                shortUrl={fullShortUrl}
                onRefresh={fetchAllData}
              />
            ) : (
              <>
                {/* Time Range Filter Bar */}
                <DateRangeSelector
                  activePreset={preset}
                  activeInterval={interval}
                  startDate={startDate}
                  endDate={endDate}
                  onPresetChange={handlePresetChange}
                  onIntervalChange={handleIntervalChange}
                />

                {/* Timeline Chart */}
                <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4 relative">
                  {timelineLoading && (
                    <div className="absolute inset-0 bg-white/80 rounded-2xl z-20 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-sm text-[#f36601] font-medium">
                        <Activity className="w-4 h-4 animate-spin" />
                        Updating timeline...
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#f36601]" />
                        Click Activity Over Time
                      </h2>
                      <p className="text-sm text-slate-500">
                        Bucketed by {interval} intervals across selected date range
                      </p>
                    </div>
                  </div>

                  <TimelineChart data={timeline} interval={interval} />
                </div>

                {/* 2-Column Grid: Devices & Browsers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Device Analytics */}
                  <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
                    <div className="space-y-0.5">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#f36601]" />
                        Device Category Distribution
                      </h2>
                      <p className="text-sm text-slate-500">User device breakdown</p>
                    </div>

                    {devices.length > 0 ? (
                      <DeviceChart data={devices} />
                    ) : (
                      <div className="py-12 text-center text-sm text-slate-400">
                        No device data recorded in this range.
                      </div>
                    )}
                  </div>

                  {/* Browser Analytics */}
                  <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
                    <div className="space-y-0.5">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Globe2 className="w-4 h-4 text-blue-600" />
                        Browser Analytics
                      </h2>
                      <p className="text-sm text-slate-500">Top user web browsers</p>
                    </div>

                    {browsers.length > 0 ? (
                      <BrowserChart data={browsers} />
                    ) : (
                      <div className="py-12 text-center text-sm text-slate-400">
                        No browser data recorded in this range.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2-Column Grid: Operating Systems & Referrers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* OS Breakdown */}
                  <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
                    <div className="space-y-0.5">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-600" />
                        Operating Systems
                      </h2>
                      <p className="text-sm text-slate-500">Client platform breakdown</p>
                    </div>

                    {operatingSystems.length > 0 ? (
                      <OSChart data={operatingSystems} />
                    ) : (
                      <div className="py-12 text-center text-sm text-slate-400">
                        No OS data recorded in this range.
                      </div>
                    )}
                  </div>

                  {/* Referrer Table */}
                  <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
                    <div className="space-y-0.5">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Compass className="w-4 h-4 text-[#f36601]" />
                        Top Traffic Referrers
                      </h2>
                      <p className="text-sm text-slate-500">Source websites and direct visits</p>
                    </div>

                    {referrers.length > 0 ? (
                      <ReferrerTable data={referrers} />
                    ) : (
                      <div className="py-12 text-center text-sm text-slate-400">
                        No referrer data recorded in this range.
                      </div>
                    )}
                  </div>
                </div>

                {/* Geographic Distribution */}
                <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
                  <div className="space-y-0.5">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-green-600" />
                      Geographic Countries
                    </h2>
                    <p className="text-sm text-slate-500">Country of origin IP resolution</p>
                  </div>

                  {countries.length > 0 ? (
                    <CountryTable data={countries} />
                  ) : (
                    <div className="py-12 text-center text-sm text-slate-400">
                      No geographic country data recorded in this range.
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};
