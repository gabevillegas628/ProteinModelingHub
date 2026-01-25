import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import ModelTemplatesTab from '../components/admin/ModelTemplatesTab'
import GroupsTab from '../components/admin/GroupsTab'
import UsersTab from '../components/admin/UsersTab'
import DangerZoneTab from '../components/admin/DangerZoneTab'

type TabId = 'models' | 'groups' | 'users' | 'danger'

interface Tab {
  id: TabId
  label: string
  danger?: boolean
}

const tabs: Tab[] = [
  { id: 'models', label: 'Model Templates' },
  { id: 'groups', label: 'Groups' },
  { id: 'users', label: 'Users' },
  { id: 'danger', label: 'Danger Zone', danger: true },
]

export default function Admin() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('models')

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-red-600">Access denied. Admin only.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-sm text-gray-500">Protein Model Organizer</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user.firstName} {user.lastName}</span>
            <span className="bg-purple-600 text-white text-sm px-3 py-1 rounded-full">
              ADMIN
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

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? tab.danger
                      ? 'border-red-500 text-red-600'
                      : 'border-blue-500 text-blue-600'
                    : tab.danger
                      ? 'border-transparent text-red-400 hover:text-red-600 hover:border-red-300'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'models' && <ModelTemplatesTab />}
        {activeTab === 'groups' && <GroupsTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'danger' && <DangerZoneTab />}
      </main>
    </div>
  )
}
