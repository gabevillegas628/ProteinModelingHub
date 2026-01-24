import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import StudentDashboard from './pages/StudentDashboard'
import Admin from './pages/Admin'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    )
  }

  // Determine default redirect based on role
  const getDefaultRoute = () => {
    if (!user) return '/login'
    return user.role === 'ADMIN' ? '/admin' : '/dashboard'
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={getDefaultRoute()} replace /> : <Login />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to={getDefaultRoute()} replace /> : <Register />}
      />
      <Route
        path="/reset-password"
        element={user ? <Navigate to={getDefaultRoute()} replace /> : <ResetPassword />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            {user?.role === 'STUDENT' ? <StudentDashboard /> : <Dashboard />}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        }
      />
      <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />
    </Routes>
  )
}

export default App
