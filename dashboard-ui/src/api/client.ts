const token = localStorage.getItem('authToken') || import.meta.env.VITE_AUTH_TOKEN || '';

interface RequestConfig extends RequestInit {
  params?: Record<string, string>;
}

interface ApiResponse<T> {
  data: T;
}

class FetchClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;

  constructor(config: { baseURL: string; headers: Record<string, string>; timeout: number }) {
    this.baseURL = config.baseURL;
    this.defaultHeaders = config.headers;
    this.timeout = config.timeout;
  }

  private async request<T = unknown>(url: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const absoluteBaseURL = new URL(this.baseURL, window.location.origin);
    const normalizedBaseURL = absoluteBaseURL.toString().endsWith('/') ? absoluteBaseURL.toString() : `${absoluteBaseURL.toString()}/`;
    const fullURL = /^https?:\/\//i.test(url)
      ? new URL(url)
      : new URL(url.replace(/^\/+/, ''), normalizedBaseURL);
    if (config.params) {
      Object.entries(config.params).forEach(([key, value]) => {
        fullURL.searchParams.set(key, value);
      });
    }

    const t = localStorage.getItem('authToken') || import.meta.env.VITE_AUTH_TOKEN || '';
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(config.headers as Record<string, string> || {}),
    };
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(fullURL.toString(), {
        ...config,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { response?: Response; status?: number };
        error.response = response;
        error.status = response.status;

        if (response.status === 401) {
          console.error('Authentication failed. Please check your auth token.');
        } else if (response.status === 403) {
          console.error('Access denied.');
        } else if (response.status >= 500) {
          console.error('Server error. Please try again later.');
        }

        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return { data: (await response.json()) as T };
      }
      return { data: response as unknown as T };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  get<T = unknown>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...config,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T = unknown>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }
}

export const apiClient = new FetchClient({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  timeout: 30000,
});

export default apiClient;
