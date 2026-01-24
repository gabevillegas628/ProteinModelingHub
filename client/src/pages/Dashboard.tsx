import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import * as instructorApi from '../services/instructorApi'
import InstructorSubmissionsTab from '../components/instructor/SubmissionsTab'
import InstructorLiteratureTab from '../components/instructor/LiteratureTab'
import InstructorDiscussionTab from '../components/instructor/DiscussionTab'

type TabType = 'submissions' | 'literature' | 'discussion'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [groups, setGroups] = useState<instructorApi.Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('submissions')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      setLoading(true)
      const data = await instructorApi.getGroups()
      setGroups(data)
      if (data.length > 0) {
        setSelectedGroupId(data[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const selectedGroup = groups.find(g => g.id === selectedGroupId)

  const tabs: { id: TabType; label: string; icon: JSX.Element }[] = [
    {
      id: 'submissions',
      label: 'Submissions',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 'literature',
      label: 'Literature',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
    {
      id: 'discussion',
      label: 'Discussion',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow flex-shrink-0">
        <div className="max-w-full mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Protein Model Organizer</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user.firstName} {user.lastName}</span>
            <span className="bg-green-600 text-white text-sm px-3 py-1 rounded-full">
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

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-lg flex-shrink-0 flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Your Groups
            </h2>
          </div>

          {loading ? (
            <div className="p-4 text-gray-500 text-sm">Loading groups...</div>
          ) : error ? (
            <div className="p-4 text-red-500 text-sm">{error}</div>
          ) : groups.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">
              You are not assigned to any groups yet.
            </div>
          ) : (
            <nav className="flex-1 overflow-y-auto">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                    selectedGroupId === group.id
                      ? 'bg-blue-50 border-l-4 border-l-blue-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-gray-800 truncate">{group.name}</div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {group.proteinName} ({group.proteinPdbId})
                  </div>
                  <div className="flex gap-3 mt-2 text-xs">
                    <span className="text-gray-500">
                      {group.submissionCount} submissions
                    </span>
                    {group.pendingCount > 0 && (
                      <span className="text-amber-600 font-medium">
                        {group.pendingCount} pending
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </nav>
          )}
        </aside>

        {/* Main Panel */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedGroup ? (
            <>
              {/* Group Header */}
              <div className="bg-white shadow-sm px-6 py-4 shrink-0">
                <h2 className="text-xl font-semibold text-gray-800">{selectedGroup.name}</h2>
                <p className="text-sm text-gray-500">
                  Protein: {selectedGroup.proteinName} ({selectedGroup.proteinPdbId})
                  &bull; {selectedGroup.memberCount} members
                </p>
              </div>

              {/* Tab Navigation */}
              <div className="bg-white border-b flex-shrink-0">
                <nav className="flex px-6">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'border-b-2 border-blue-600 text-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'submissions' && (
                  <InstructorSubmissionsTab
                    groupId={selectedGroup.id}
                    proteinPdbId={selectedGroup.proteinPdbId}
                  />
                )}
                {activeTab === 'literature' && (
                  <InstructorLiteratureTab groupId={selectedGroup.id} />
                )}
                {activeTab === 'discussion' && (
                  <InstructorDiscussionTab groupId={selectedGroup.id} />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {loading ? 'Loading...' : 'Select a group to view its content'}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
