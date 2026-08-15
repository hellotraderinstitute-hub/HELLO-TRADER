import axios from 'axios';

// Always use relative /api so Vercel server-side rewrites proxy calls to Render.
// This ensures cold-start buffering is handled by Vercel, preventing 15s timeout failures.
// vercel.json: { source: '/api/:path*', destination: 'https://hello-trader.onrender.com/api/:path*' }
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 60000, // 60s — accommodates Render free-tier cold start (~50s) + request processing
});

export let globalServerStatus = true;

// Request Interceptor: Attach Authorization Bearer token from localStorage
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor for handling retries, timeouts, and 401s
apiClient.interceptors.response.use(
  (response) => {
    globalServerStatus = true;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const isNetworkOrTimeoutError = !error.response || error.code === 'ECONNABORTED';
    if (isNetworkOrTimeoutError) {
      globalServerStatus = false;
    } else if (error.response?.status >= 500) {
      globalServerStatus = false;
    } else {
      globalServerStatus = true;
    }

    originalRequest._retryCount = originalRequest._retryCount || 0;
    const maxRetries = 2;

    if (isNetworkOrTimeoutError && originalRequest._retryCount < maxRetries) {
      originalRequest._retryCount += 1;
      const delay = Math.pow(2, originalRequest._retryCount - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiClient(originalRequest);
    }

    const isAuthRoute = originalRequest.url?.includes('/auth/');
    if (error.response?.status === 401 && !originalRequest._authRetried && !isAuthRoute) {
      originalRequest._authRetried = true;
      try {
        await apiClient.post('/auth/refresh');
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (error.response?.data?.error === 'No refresh token' || refreshError.response?.data?.error === 'No refresh token') {
          error.response.data.error = 'Session expired. Please log in again.';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
