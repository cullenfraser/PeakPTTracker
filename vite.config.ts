import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Optional overrides for Netlify Live tunnels
  const hmrHost = env.VITE_HMR_HOST || undefined
  const hmrProtocol = env.VITE_HMR_PROTOCOL || undefined
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : undefined

  const useCustomHmr = Boolean(hmrHost || hmrProtocol || hmrClientPort)

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: true,
      hmr: useCustomHmr
        ? {
            host: hmrHost,
            protocol: hmrProtocol as any,
            clientPort: hmrClientPort,
          }
        : true,
    },
  }
})
