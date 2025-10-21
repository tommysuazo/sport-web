export const NBA_API_BASE_URL = import.meta.env?.VITE_NBA_API_BASE_URL ?? 'http://localhost/api/nba';

export function buildNbaApiUrl(path = '') {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return `${NBA_API_BASE_URL.replace(/\/$/, '')}/${trimmed}`;
}
