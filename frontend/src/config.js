// Base URL Configuration for Frontend-Backend connection.
// Dynamically defaults to localhost for local development, 
// and can be configured with a production URL once the backend is deployed.

export const BACKEND_URL = window.location.hostname.includes('github.io')
  ? 'https://bulkdns-api.yourproductiondomain.com' // <-- REPLACE with your production backend API URL (e.g. Render, Railway, VPS, etc.)
  : `http://${window.location.hostname}:5001`;

