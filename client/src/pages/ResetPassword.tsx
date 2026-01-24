import { useState, useEffect, FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { resetPassword } from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.')
    }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (!token) {
      setError('Invalid reset token')
      return
    }

    setLoading(true)

    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-600 via-blue-700 to-blue-900 relative overflow-hidden">
        {/* Decorative Background Pattern */}
        <div className="absolute inset-0 overflow-hidden">
          <svg className="absolute top-0 left-0 w-full h-64 opacity-10" viewBox="0 0 800 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fadeRight" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: 'white', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: 'white', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <g fill="url(#fadeRight)">
              <rect x="20" y="30" width="20" height="20" opacity="0.8" />
              <rect x="60" y="50" width="15" height="15" opacity="0.6" />
              <rect x="100" y="20" width="25" height="25" opacity="0.7" />
              <rect x="150" y="60" width="12" height="12" opacity="0.5" />
              <rect x="200" y="35" width="18" height="18" opacity="0.6" />
            </g>
          </svg>
        </div>

        <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-blue-800 px-6 py-5">
                <h1 className="text-2xl font-bold text-white text-center">
                  Password Reset Complete
                </h1>
              </div>
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="inline-block bg-blue-800 text-white py-3 px-8 rounded-lg hover:bg-blue-900 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                >
                  Sign In
                </button>
              </div>
            </div>

            {/* Footer Text */}
            <p className="text-center text-blue-200 text-sm mt-6 opacity-80">
              Protein Model Organizer &bull; Waksman Student Scholars Program
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-600 via-blue-700 to-blue-900 relative overflow-hidden">
      {/* Decorative Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <svg className="absolute top-0 left-0 w-full h-64 opacity-10" viewBox="0 0 800 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="fadeRight2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'white', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'white', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <g fill="url(#fadeRight2)">
            <rect x="20" y="30" width="20" height="20" opacity="0.8" />
            <rect x="60" y="50" width="15" height="15" opacity="0.6" />
            <rect x="100" y="20" width="25" height="25" opacity="0.7" />
            <rect x="150" y="60" width="12" height="12" opacity="0.5" />
            <rect x="200" y="35" width="18" height="18" opacity="0.6" />
            <rect x="250" y="70" width="10" height="10" opacity="0.4" />
            <rect x="300" y="25" width="22" height="22" opacity="0.7" />
            <rect x="350" y="55" width="14" height="14" opacity="0.5" />
            <rect x="400" y="40" width="16" height="16" opacity="0.6" />
          </g>
        </svg>
        <svg className="absolute bottom-0 right-0 w-full h-48" viewBox="0 0 1200 200" preserveAspectRatio="none">
          <path
            d="M0,100 C300,150 600,50 900,100 C1050,125 1150,80 1200,100 L1200,200 L0,200 Z"
            fill="rgba(255,255,255,0.05)"
          />
        </svg>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Reset Password Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Blue Header */}
            <div className="bg-blue-800 px-6 py-5">
              <h1 className="text-2xl font-bold text-white text-center">
                Create New Password
              </h1>
              <p className="text-blue-200 text-center text-sm mt-1">Enter your new password below</p>
            </div>

            {/* Form Content */}
            <div className="p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-700 text-sm font-medium">{error}</p>
                  </div>
                </div>
              )}

              {!token ? (
                <div className="text-center py-4">
                  <p className="text-gray-600 mb-4">
                    This reset link is invalid or has expired.
                  </p>
                  <Link
                    to="/login"
                    className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    Return to login
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors"
                        placeholder="At least 6 characters"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors"
                      placeholder="Confirm your new password"
                      required
                      minLength={6}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-800 text-white py-4 px-6 rounded-lg hover:bg-blue-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Resetting password...</span>
                      </div>
                    ) : (
                      'Reset Password'
                    )}
                  </button>
                </form>
              )}

              <div className="mt-8 text-center">
                <Link to="/login" className="text-gray-500 hover:text-blue-600 transition-colors text-sm">
                  Back to login
                </Link>
              </div>
            </div>
          </div>

          {/* Footer Text */}
          <p className="text-center text-blue-200 text-sm mt-6 opacity-80">
            Protein Model Organizer &bull; Waksman Student Scholars Program
          </p>
        </div>
      </div>
    </div>
  )
}
