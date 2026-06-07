import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api/sale': {
                target: 'http://localhost:3001',
                rewrite: (path) => path.replace(/^\/api\/sale/, ''),
            },
            '/api/purchase': {
                target: 'http://localhost:3002',
                rewrite: (path) => path.replace(/^\/api\/purchase/, ''),
            },
            '/api/admin': {
                target: 'http://localhost:3003',
                rewrite: (path) => path.replace(/^\/api\/admin/, ''),
            },
        },
    },
})
