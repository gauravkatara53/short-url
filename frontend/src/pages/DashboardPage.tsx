import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Link2,
  Plus,
  BarChart3,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Calendar,
  ArrowRight,
  Clock,
  Layers,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { createUrlApi, getUserUrlsApi, deleteUrlApi } from '../api/urls';
import { getStoredToken } from '../api/auth';
import { getShortUrl } from '../api/client';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const [urls, setUrls] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Shortener form state
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [createdResult, setCreatedResult] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchUrls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserUrlsApi(1, 50);
      setUrls(data.urls || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load URLs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      navigate('/login');
      return;
    }
    fetchUrls();
  }, [navigate, fetchUrls]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalUrl.trim()) return;

    setCreating(true);
    setError(null);
    setCreatedResult(null);

    try {
      const expiryIso = expiresAt ? new Date(expiresAt).toISOString() : undefined;
      const res = await createUrlApi(originalUrl.trim(), expiryIso);
      setCreatedResult(res);
      setOriginalUrl('');
      setExpiresAt('');
      await fetchUrls();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create short URL');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this short URL?')) return;
    try {
      await deleteUrlApi(id);
      setUrls((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete URL');
    }
  };

  const handleCopy = (shortCode: string, id: string) => {
    const fullUrl = getShortUrl(shortCode);
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-slate-800 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero & Shorten URL Card */}
        <div className="p-8 rounded-2xl bg-white border border-gray-200 shadow-sm">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-[#f36601] border border-orange-200">
              <Layers className="w-3.5 h-3.5" />
              Event-Driven Clickstream Analytics
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-800">
              Shorten links. <span className="text-[#f36601]">Stream analytics.</span>
            </h1>
            <p className="text-sm text-slate-500">
              Capture every click event in real-time through Apache Kafka and analyze high-throughput clickstream data on ClickHouse Cloud.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleCreate} className="mt-8 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="url"
                  required
                  placeholder="Paste long destination URL (e.g. https://github.com/my-repo)"
                  value={originalUrl}
                  onChange={(e) => setOriginalUrl(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="px-6 py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-full flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer flex-shrink-0"
              >
                {creating ? (
                  <span className="inline-flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin" />
                    Shortening...
                  </span>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Shorten Link
                  </>
                )}
              </button>
            </div>

            {/* Optional Expiration */}
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Optional Expiration:</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-sm text-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </form>

          {/* Created Alert */}
          {createdResult && (
            <div className="mt-6 p-4 rounded-xl bg-green-50 border border-green-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-green-700">Short Link Created!</span>
                <div className="font-mono text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>{createdResult.shortUrl || getShortUrl(createdResult.url?.short_code)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(createdResult.url.short_code, 'just-created')}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedId === 'just-created' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === 'just-created' ? 'Copied' : 'Copy'}
                </button>
                <Link
                  to={`/analytics/${createdResult.url.short_code}`}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-gray-200 transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                  View Analytics
                </Link>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* URLs List Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              Your Shortened URLs ({urls.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-[#f36601]" />
              Loading your URLs...
            </div>
          ) : urls.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-gray-200 shadow-sm space-y-2">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-slate-400 mx-auto">
                <Link2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No URLs created yet</h3>
              <p className="text-sm text-slate-500">Shorten your first link above to see clickstream analytics.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {urls.map((u) => {
                const shortUrl = getShortUrl(u.short_code);

                return (
                  <div
                    key={u.id}
                    className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow hover:border-gray-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group card-hover"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-800">
                        <span className="text-[#f36601]">/{u.short_code}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs font-sans font-normal text-slate-400">
                          {new Date(u.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500 truncate max-w-lg">
                        {u.original_url}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleCopy(u.short_code, u.id)}
                        className="px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-slate-600 text-xs font-medium flex items-center gap-1.5 border border-gray-200 transition-colors cursor-pointer"
                      >
                        {copiedId === u.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId === u.id ? 'Copied' : 'Copy'}
                      </button>

                      <a
                        href={shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-slate-500 text-xs border border-gray-200 transition-colors"
                        title="Visit destination URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      <Link
                        to={`/analytics/${u.short_code}`}
                        className="px-3.5 py-1.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Analytics
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>

                      <button
                        onClick={() => handleDelete(u.id)}
                        title="Delete URL"
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
