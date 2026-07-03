import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/bulkdnschecker/' : '/',
  plugins: [
    tailwindcss(),
  ],
  server: {
    host: 'bulkdnschecker',
    port: 80,
    strictPort: true
  }
})