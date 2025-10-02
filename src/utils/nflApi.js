export const NFL_API_BASE_URL = import.meta.env?.VITE_NFL_API_BASE_URL ?? 'http://localhost/api/nfl';

export function buildNflApiUrl(path = '') {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return `${NFL_API_BASE_URL.replace(/\/$/, '')}/${trimmed}`;
}
