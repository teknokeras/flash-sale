import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: '0.0.0.0', // Allows you to open the web app from your host browser
        proxy: {
            // 1. Intercept your frontend's actual request to "/sales/active"
            '/sales': {
                target: 'http://sale-service:3001', // Use the compose name, NOT 0.0.0.0
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sales/, ''),
            },
            // 2. Keep standard API route mappings just in case
            '/api/sale': {
                target: 'http://sale-service:3001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/sale/, ''),
            },
            '/api/purchase': {
                target: 'http://purchase-service:3002',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/purchase/, ''),
            },
            '/api/admin': {
                target: 'http://admin-service:3003',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/admin/, ''),
            },
        },
    },
})