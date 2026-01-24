import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Protein Model Organizer</h1>
        <div className="user-info">
          <span>{user.firstName} {user.lastName}</span>
          <span className="role">{user.role}</span>
          <button onClick={logout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      <main>
        <div className="welcome-card">
          <h2>Welcome, {user.firstName}!</h2>
          <p>
            This is your protein modeling dashboard. Here you'll be able to:
          </p>
          <ul style={{ marginTop: '1rem', marginLeft: '1.5rem' }}>
            <li>View and manage protein model projects</li>
            <li>Upload and organize model versions</li>
            <li>Collaborate with instructors and students</li>
            <li>Access literature and resources</li>
          </ul>
          <p style={{ marginTop: '1rem', color: '#888' }}>
            More features coming soon as we build out the schema and functionality.
          </p>
        </div>
      </main>
    </div>
  )
}
