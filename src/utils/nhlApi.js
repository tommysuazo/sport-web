export const NHL_API_BASE_URL = import.meta.env?.VITE_NHL_API_BASE_URL ?? 'http://localhost/api/nhl';

export function buildNhlApiUrl(path = '') {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return `${NHL_API_BASE_URL.replace(/\/$/, '')}/${trimmed}`;
}
