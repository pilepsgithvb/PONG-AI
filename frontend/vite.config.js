import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This tells Vite to process Tailwind styling rules directly natively
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
})