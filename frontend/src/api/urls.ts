import apiClient from './client';
import type { ApiResponse, UrlDetails } from '../types/analytics';

export interface UrlListResponse {
  urls: Array<{
    id: string;
    user_id: string;
    original_url: string;
    short_code: string;
    created_at: string;
    expires_at: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUrlResponse {
  url: {
    id: string;
    user_id: string;
    original_url: string;
    short_code: string;
    created_at: string;
    expires_at: string | null;
  };
  shortUrl: string;
}

export async function createUrlApi(originalUrl: string, expiresAt?: string): Promise<CreateUrlResponse> {
  const res = await apiClient.post<ApiResponse<CreateUrlResponse>>('/api/urls', {
    originalUrl,
    expiresAt,
  });
  return res.data.data;
}

export async function getUserUrlsApi(page = 1, limit = 20): Promise<UrlListResponse> {
  const res = await apiClient.get<ApiResponse<UrlListResponse>>('/api/urls', {
    params: { page, limit },
  });
  return res.data.data;
}

export async function deleteUrlApi(urlId: string): Promise<void> {
  await apiClient.delete(`/api/urls/${urlId}`);
}
