import apiClient from './client';
import type {
  ApiResponse,
  OverviewResponse,
  TimelinePoint,
  DeviceAnalytics,
  BrowserAnalytics,
  OSAnalytics,
  ReferrerAnalytics,
  CountryAnalytics,
} from '../types/analytics';

export async function getOverviewApi(shortCode: string): Promise<OverviewResponse> {
  const res = await apiClient.get<ApiResponse<OverviewResponse>>(`/api/analytics/${shortCode}/overview`);
  return res.data.data;
}

export async function getTimelineApi(
  shortCode: string,
  params?: { startDate?: string; endDate?: string; interval?: string },
): Promise<TimelinePoint[]> {
  const res = await apiClient.get<ApiResponse<TimelinePoint[]>>(`/api/analytics/${shortCode}/timeline`, {
    params,
  });
  return res.data.data;
}

export async function getDevicesApi(
  shortCode: string,
  params?: { startDate?: string; endDate?: string },
): Promise<DeviceAnalytics[]> {
  const res = await apiClient.get<ApiResponse<DeviceAnalytics[]>>(`/api/analytics/${shortCode}/devices`, {
    params,
  });
  return res.data.data;
}

export async function getBrowsersApi(
  shortCode: string,
  params?: { startDate?: string; endDate?: string },
): Promise<BrowserAnalytics[]> {
  const res = await apiClient.get<ApiResponse<BrowserAnalytics[]>>(`/api/analytics/${shortCode}/browsers`, {
    params,
  });
  return res.data.data;
}

export async function getOperatingSystemsApi(
  shortCode: string,
  params?: { startDate?: string; endDate?: string },
): Promise<OSAnalytics[]> {
  const res = await apiClient.get<ApiResponse<OSAnalytics[]>>(`/api/analytics/${shortCode}/os`, {
    params,
  });
  return res.data.data;
}

export async function getReferrersApi(
  shortCode: string,
  params?: { startDate?: string; endDate?: string; limit?: number },
): Promise<ReferrerAnalytics[]> {
  const res = await apiClient.get<ApiResponse<ReferrerAnalytics[]>>(`/api/analytics/${shortCode}/referrers`, {
    params,
  });
  return res.data.data;
}

export async function getCountriesApi(
  shortCode: string,
  params?: { startDate?: string; endDate?: string; limit?: number },
): Promise<CountryAnalytics[]> {
  const res = await apiClient.get<ApiResponse<CountryAnalytics[]>>(`/api/analytics/${shortCode}/countries`, {
    params,
  });
  return res.data.data;
}
