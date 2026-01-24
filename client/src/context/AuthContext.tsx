import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import * as api from '../services/api'

export type Role = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  isApproved?: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<{ needsApproval: boolean }>
  logout: () => void
}

interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  role?: Role
  groupId?: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.getCurrentUser()
        .then(data => setUser(data.user))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password)
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  const register = async (registerData: RegisterData): Promise<{ needsApproval: boolean }> => {
    const data = await api.register(registerData)

    // If we got a token, the user was auto-approved (admin)
    if (data.token) {
      localStorage.setItem('token', data.token)
      setUser(data.user)
      return { needsApproval: false }
    }

    // No token means pending approval
    return { needsApproval: true }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
