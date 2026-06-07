import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import SalePage from './pages/SalePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminPage from './pages/AdminPage'

const qc = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 0,
            retry: 1,
        },
    },
})

export default function App() {
    return (
        <QueryClientProvider client={qc}>
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<SalePage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    )
}
