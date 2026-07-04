// Base URL Configuration for Frontend-Backend connection.
// Dynamically defaults to localhost for local development, 
// and can be configured with a production URL once the backend is deployed.

export const BACKEND_URL = window.location.hostname.includes('github.io')
  ? 'https://piyushqweh-bulkdns-api.hf.space'
  : `http://${window.location.hostname}:5001`;

// Wake up the Hugging Face Space backend (it sleeps when idle).
// Called on app load so it's ready when users need SSL/WHOIS/Header checks.
export function wakeBackend() {
  if (!window.location.hostname.includes('github.io')) return;
  fetch('https://piyushqweh-bulkdns-api.hf.space/api/ip-geo?ip=8.8.8.8')
    .catch(() => {}); // fire-and-forget, ignore errors
}
