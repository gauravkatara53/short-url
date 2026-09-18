export interface UrlDetails {
  id: string;
  shortCode: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface AnalyticsOverview {
  totalClicks: number;
  clicksToday: number;
  clicksLast7Days: number;
  clicksLast30Days: number;
}

export interface OverviewResponse {
  url: UrlDetails;
  overview: AnalyticsOverview;
}

export interface TimelinePoint {
  time: string;
  clicks: number;
}

export interface DeviceAnalytics {
  device: string;
  clicks: number;
  percentage: number;
}

export interface BrowserAnalytics {
  browser: string;
  clicks: number;
  percentage: number;
}

export interface OSAnalytics {
  os: string;
  operatingSystem?: string;
  clicks: number;
  percentage: number;
}

export interface ReferrerAnalytics {
  referrer: string;
  clicks: number;
  percentage: number;
}

export interface CountryAnalytics {
  country: string;
  clicks: number;
  percentage: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: unknown;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export type TimeRangePreset = '24h' | '7d' | '30d' | 'custom';
export type TimelineInterval = 'hour' | 'day' | 'week';

export interface DateFilter {
  preset: TimeRangePreset;
  startDate?: string;
  endDate?: string;
  interval: TimelineInterval;
}
