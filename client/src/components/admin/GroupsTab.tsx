import { useState, useEffect } from 'react'
import * as adminApi from '../../services/adminApi'

export default function GroupsTab() {
  const [groups, setGroups] = useState<adminApi.Group[]>([])
  const [users, setUsers] = useState<adminApi.User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvData, setCsvData] = useState('')
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState<adminApi.CsvUploadResult | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', proteinPdbId: '', proteinName: '' })
  const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [groupsData, usersData] = await Promise.all([
        adminApi.getGroups(),
        adminApi.getUsers()
      ])
      setGroups(groupsData)
      setUsers(usersData.filter(u => u.role === 'STUDENT'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await adminApi.updateGroup(editingId, formData)
      } else {
        await adminApi.createGroup(formData)
      }
      setFormData({ name: '', proteinPdbId: '', proteinName: '' })
      setShowForm(false)
      setEditingId(null)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group')
    }
  }

  const handleEdit = (group: adminApi.Group) => {
    setFormData({
      name: group.name,
      proteinPdbId: group.proteinPdbId,
      proteinName: group.proteinName
    })
    setEditingId(group.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this group? All submissions and messages will be lost.')) return
    try {
      await adminApi.deleteGroup(id)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group')
    }
  }

  const handleAddMember = async (groupId: string) => {
    if (!selectedUserId) return
    try {
      await adminApi.addGroupMember(groupId, selectedUserId)
      setAddingMemberTo(null)
      setSelectedUserId('')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!confirm('Remove this member from the group?')) return
    try {
      await adminApi.removeGroupMember(groupId, userId)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleCsvUpload = async () => {
    if (!csvData.trim()) return
    try {
      setCsvUploading(true)
      setCsvResult(null)
      const result = await adminApi.uploadGroupsCsv(csvData)
      setCsvResult(result)
      if (result.success) {
        loadData()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CSV')
    } finally {
      setCsvUploading(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvData(text)
    }
    reader.readAsText(file)
  }

  const closeCsvModal = () => {
    setShowCsvModal(false)
    setCsvData('')
    setCsvResult(null)
  }

  // Get users not already in a group
  const getAvailableUsers = (groupId: string) => {
    const group = groups.find(g => g.id === groupId)
    const memberIds = group?.members.map(m => m.user.id) || []
    return users.filter(u => !memberIds.includes(u.id))
  }

  if (loading) {
    return <div className="text-gray-500">Loading groups...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Groups</h2>
          <p className="text-sm text-gray-500">Manage student groups and their protein assignments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCsvModal(true)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
          >
            Upload CSV
          </button>
          <button
            onClick={() => {
              setFormData({ name: '', proteinPdbId: '', proteinName: '' })
              setEditingId(null)
              setShowForm(true)
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Group
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-2">Upload Groups from CSV</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV file with group information. This creates groups only - students will select their group when they register.
            </p>

            <div className="bg-gray-50 p-3 rounded-md mb-4 text-sm">
              <p className="font-medium text-gray-700 mb-1">Expected CSV format:</p>
              <code className="text-xs text-gray-600">
                name,proteinPdbId,proteinName<br />
                Ridgefield High,1HHO,Hemoglobin<br />
                Westbrook Academy,1MBO,Myoglobin
              </code>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Choose a file or paste CSV data:
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2"
              />
              <textarea
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                rows={6}
                placeholder="name,proteinPdbId,proteinName&#10;Ridgefield High,1HHO,Hemoglobin"
              />
            </div>

            {csvResult && (
              <div className={`p-3 rounded-md mb-4 ${csvResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {csvResult.success ? (
                  <p>Successfully created {csvResult.created} of {csvResult.total} groups.</p>
                ) : (
                  <p>Upload failed.</p>
                )}
                {csvResult.errors && csvResult.errors.length > 0 && (
                  <ul className="mt-2 text-sm">
                    {csvResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCsvModal}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {csvResult?.success ? 'Close' : 'Cancel'}
              </button>
              {!csvResult?.success && (
                <button
                  onClick={handleCsvUpload}
                  disabled={csvUploading || !csvData.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {csvUploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Group' : 'New Group'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Ridgefield High"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Protein PDB ID</label>
                <input
                  type="text"
                  value={formData.proteinPdbId}
                  onChange={(e) => setFormData({ ...formData, proteinPdbId: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 1ABC"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Protein Name</label>
                <input
                  type="text"
                  value={formData.proteinName}
                  onChange={(e) => setFormData({ ...formData, proteinName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Hemoglobin"
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Groups List */}
      {groups.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No groups yet. Create one or upload a CSV to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{group.name}</h3>
                  <p className="text-sm text-gray-500">
                    Protein: {group.proteinName} ({group.proteinPdbId})
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(group)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(group.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Members */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Members ({group.members.length})</h4>
                  <button
                    onClick={() => setAddingMemberTo(addingMemberTo === group.id ? null : group.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {addingMemberTo === group.id ? 'Cancel' : '+ Add Member'}
                  </button>
                </div>

                {addingMemberTo === group.id && (
                  <div className="flex gap-2 mb-3">
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">Select a student...</option>
                      {getAvailableUsers(group.id).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.firstName} {user.lastName} ({user.email})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAddMember(group.id)}
                      disabled={!selectedUserId}
                      className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      Add
                    </button>
                  </div>
                )}

                {group.members.length === 0 ? (
                  <p className="text-sm text-gray-400">No members yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {group.members.map((member) => (
                      <span
                        key={member.id}
                        className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                      >
                        {member.user.firstName} {member.user.lastName}
                        <button
                          onClick={() => handleRemoveMember(group.id, member.user.id)}
                          className="text-gray-400 hover:text-red-600 ml-1"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
