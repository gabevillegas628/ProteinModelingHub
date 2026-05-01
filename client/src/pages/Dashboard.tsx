import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import * as instructorApi from '../services/instructorApi'
import InstructorSubmissionsTab from '../components/instructor/SubmissionsTab'
import InstructorLiteratureTab from '../components/instructor/LiteratureTab'
import InstructorDiscussionTab from '../components/instructor/DiscussionTab'
import InstructorSummaryTab from '../components/instructor/SummaryTab'
import InstructorPresentationsTab from '../components/instructor/PresentationsTab'
import MessagesInbox from '../components/instructor/MessagesInbox'
import ThreeDPrintPanel from '../components/instructor/ThreeDPrintPanel'
import JSmolViewer from '../components/shared/JSmolViewer'

type TabType = 'submissions' | 'literature' | 'discussion'
type SidebarView = 'overview' | 'presentations' | 'messages' | 'printing'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [groups, setGroups] = useState<instructorApi.Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [sidebarView, setSidebarView] = useState<SidebarView>('overview')
  const [activeTab, setActiveTab] = useState<TabType>('submissions')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [blankViewerOpen, setBlankViewerOpen] = useState(false)
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0)

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      setLoading(true)
      const data = await instructorApi.getGroups()
      setGroups(data)
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
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-5 py-3 flex justify-between items-center">
          <h1 className="text-base font-semibold text-gray-700">Protein Model Organizer</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setBlankViewerOpen(true)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
              3D Viewer
            </button>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">{user.firstName} {user.lastName}</span>
            <span className="bg-green-100 text-green-700 text-sm px-2 py-0.5 rounded-full font-medium">{user.role}</span>
            <button
              onClick={logout}
              className="text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 shrink-0 flex flex-col">
          <div className="px-3 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">Navigation</p>
          </div>

          {loading ? (
            <div className="px-5 py-3 text-gray-500 text-sm">Loading groups...</div>
          ) : error ? (
            <div className="px-5 py-3 text-red-500 text-sm">{error}</div>
          ) : groups.length === 0 ? (
            <div className="px-5 py-3 text-gray-500 text-sm">No groups yet.</div>
          ) : (
            <nav className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0.5">
              <button
                onClick={() => { setSelectedGroupId(null); setSidebarView('overview') }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedGroupId === null && sidebarView === 'overview'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Overview
              </button>
              <button
                onClick={() => { setSelectedGroupId(null); setSidebarView('presentations') }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  sidebarView === 'presentations' && selectedGroupId === null
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                Presentations
              </button>
              <button
                onClick={() => { setSelectedGroupId(null); setSidebarView('printing') }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  sidebarView === 'printing' && selectedGroupId === null
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                3D Printing
              </button>
              <button
                onClick={() => { setSelectedGroupId(null); setSidebarView('messages') }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2 ${
                  sidebarView === 'messages' && selectedGroupId === null
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Messages
                </span>
                {inboxUnreadCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-5 text-center">
                    {inboxUnreadCount}
                  </span>
                )}
              </button>

              <div className="px-2 pt-3 pb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Groups</p>
              </div>

              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => { setSelectedGroupId(group.id); setSidebarView('overview') }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                    selectedGroupId === group.id
                      ? 'bg-blue-50 text-blue-700 border-3 border-blue-400'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`font-medium text-sm truncate ${selectedGroupId === group.id ? 'text-blue-700' : 'text-gray-800'}`}>
                      {group.name.split(' - ')[0]}
                    </div>
                    {group.unreadMessageCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-5 text-center shrink-0">
                        {group.unreadMessageCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {group.proteinName}
                  </div>
                  <div className="flex gap-2 mt-1.5 text-xs flex-wrap">
                    <span className="text-gray-400">{group.proteinPdbId} &bull; {group.submissionCount} submitted</span>
                    {group.pendingCount > 0 && (
                      <span className="text-amber-600 font-medium">{group.pendingCount} pending</span>
                    )}
                    {group.readyForPrinting && (
                      <span className="text-violet-600 font-medium">Ready to print</span>
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
              {/* Group Header + Tabs (single surface) */}
              <div className="bg-white border-b border-gray-200 shrink-0">
                <div className="px-6 pt-4 pb-3 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">{selectedGroup.name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {selectedGroup.proteinName} ({selectedGroup.proteinPdbId})
                      &bull; {selectedGroup.memberCount} members
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !selectedGroup.readyForPrinting;
                      await instructorApi.updateGroupPrintingStatus(selectedGroup.id, next);
                      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, readyForPrinting: next } : g));
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedGroup.readyForPrinting
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    {selectedGroup.readyForPrinting ? 'Ready to Print' : 'Mark Ready to Print'}
                  </button>
                </div>
                <nav className="flex px-6">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === tab.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
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
                  <InstructorDiscussionTab groupId={selectedGroup.id} onMessagesRead={loadGroups} />
                )}
              </div>
            </>
          ) : sidebarView === 'printing' ? (
            <ThreeDPrintPanel />
          ) : sidebarView === 'messages' ? (
            <div className="flex-1 overflow-y-auto">
              <MessagesInbox onUnreadCountChange={setInboxUnreadCount} />
            </div>
          ) : sidebarView === 'presentations' ? (
            <div className="flex-1 overflow-y-auto">
              <InstructorPresentationsTab />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <InstructorSummaryTab
                groups={groups}
                onSelectGroup={(id) => { setSelectedGroupId(id); setActiveTab('submissions') }}
              />
            </div>
          )}
        </main>
      </div>
      <JSmolViewer
        isOpen={blankViewerOpen}
        onClose={() => setBlankViewerOpen(false)}
        fileUrl=""
        modelName="Viewer"
        dialogClassName="min-h-[85vh]"
      />
    </div>
  )
}
