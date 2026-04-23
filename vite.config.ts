import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/linersync-react-base/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  }
})
