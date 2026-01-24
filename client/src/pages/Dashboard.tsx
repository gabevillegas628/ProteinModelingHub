import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()

  if (!user) return null

  const roleColors = {
    ADMIN: 'bg-purple-600',
    INSTRUCTOR: 'bg-green-600',
    STUDENT: 'bg-blue-600'
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Protein Model Organizer</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user.firstName} {user.lastName}</span>
            <span className={`${roleColors[user.role]} text-white text-sm px-3 py-1 rounded-full`}>
              {user.role}
            </span>
            <button
              onClick={logout}
              className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Welcome, {user.firstName}!
          </h2>
          <p className="text-gray-600 mb-4">
            This is your protein modeling dashboard. Here you'll be able to:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
            <li>View and manage protein model projects</li>
            <li>Upload and organize model versions</li>
            <li>Collaborate with instructors and students</li>
            <li>Access literature and resources</li>
          </ul>
          <p className="text-gray-400 text-sm">
            More features coming soon as we build out the functionality.
          </p>
        </div>
      </main>
    </div>
  )
}
