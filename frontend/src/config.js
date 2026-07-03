// Base URL Configuration for Frontend-Backend connection.
// Dynamically defaults to localhost for local development, 
// and can be configured with a production URL once the backend is deployed.

export const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://bulkdns-api.yourproductiondomain.com'; // <-- REPLACE with your production backend API URL (e.g. Render, Railway, VPS, etc.)
