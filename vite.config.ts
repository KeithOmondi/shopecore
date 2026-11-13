import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In development the admin and the API share one address (the proxy below), so the browser sends the refresh
  // cookie without any cross-site settings. Point VITE_API_PROXY at a server on another port if needed.
  const api = env.VITE_API_PROXY || 'http://localhost:8080'
  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: { proxy: { '/v1': { target: api, changeOrigin: false }, '/health': { target: api } } },
  }
})
