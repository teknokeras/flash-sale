import { createContext, useContext, useState, ReactNode } from 'react'
import { getToken, getRole, setToken, clearToken } from '../lib/api'

interface AuthState {
    token: string | null
    role: 'buyer' | 'admin' | null
}

interface AuthContextValue extends AuthState {
    login: (token: string, role: 'buyer' | 'admin') => void
    logout: () => void
    isLoggedIn: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [auth, setAuth] = useState<AuthState>({
        token: getToken(),
        role: getRole(),
    })

    function login(token: string, role: 'buyer' | 'admin') {
        setToken(token, role)
        setAuth({ token, role })
    }

    function logout() {
        clearToken()
        setAuth({ token: null, role: null })
    }

    return (
        <AuthContext.Provider value={{ ...auth, login, logout, isLoggedIn: !!auth.token }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
