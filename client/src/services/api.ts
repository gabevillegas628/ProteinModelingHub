const API_BASE = '/api'

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT'
}

export interface AuthResponse {
  user: User
  token: string
}

export interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  role?: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT'
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
}

export function register(data: RegisterData): Promise<AuthResponse> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export function getCurrentUser(): Promise<{ user: User }> {
  return request('/auth/me')
}
