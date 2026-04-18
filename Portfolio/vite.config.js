import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use VITE_BASE_PATH for GitHub Pages; Railway defaults to '/'
  base: process.env.VITE_BASE_PATH || '/',
  preview: {
    // Allow Railway and any custom domain to serve the preview build
    allowedHosts: 'all',
  },
})
