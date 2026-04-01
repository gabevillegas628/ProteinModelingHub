import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Apply from './pages/Apply'
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
    // If a token exists but user is null, the server was likely temporarily
    // unavailable when we tried to verify it. Show a reconnect prompt instead
    // of the login form so the user knows to retry rather than re-enter credentials.
    if (localStorage.getItem('modeling_token')) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 text-lg mb-4">Could not connect to the server.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
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
    if (localStorage.getItem('modeling_token')) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 text-lg mb-4">Could not connect to the server.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
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
        path="/apply"
        element={user ? <Navigate to={getDefaultRoute()} replace /> : <Apply />}
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
