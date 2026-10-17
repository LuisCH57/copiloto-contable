import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Al publicar en GitHub Pages vivirá en luisch57.github.io/copiloto-contable/
  base: command === 'build' ? '/copiloto-contable/' : '/',
  server: {
    // En desarrollo, "/api/..." se reenvía a la API del puerto 3000
    proxy: { '/api': 'http://localhost:3000' },
  },
}))
