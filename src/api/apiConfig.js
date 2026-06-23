const DEFAULT_API_URL = 'http://localhost:3001';

const trimTrailingSlash = value => value.replace(/\/+$/, '');

export const getApiBaseUrl = () => {
  const rawUrl = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
  return trimTrailingSlash(rawUrl);
};

export const API_BASE_URL = getApiBaseUrl();
export const API_PREFIX = '/api';

export const getPublicAssetUrl = path => {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};
