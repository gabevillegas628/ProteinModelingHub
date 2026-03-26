import { useState, useEffect } from 'react'
import * as adminApi from '../../services/adminApi'

export default function ModelTemplatesTab() {
  const [templates, setTemplates] = useState<adminApi.ModelTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '', unlocksAt: '' })
  const [inlineUnlocksAt, setInlineUnlocksAt] = useState<{ id: string; value: string } | null>(null)
  const [bulkUnlocksAt, setBulkUnlocksAt] = useState('')
  const [applyingBulk, setApplyingBulk] = useState(false)

  // datetime-local inputs work in local time; the server stores UTC.
  // Convert UTC ISO → local value for inputs, and local input value → UTC ISO before sending.
  const toLocalInputValue = (utcIso: string) => {
    const d = new Date(utcIso)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const toUtcIso = (localInput: string) => new Date(localInput).toISOString()

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const data = await adminApi.getModelTemplates()
      setTemplates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        unlocksAt: formData.unlocksAt ? toUtcIso(formData.unlocksAt) : null
      }
      if (editingId) {
        await adminApi.updateModelTemplate(editingId, payload)
      } else {
        await adminApi.createModelTemplate(payload)
      }
      setFormData({ name: '', description: '', unlocksAt: '' })
      setShowForm(false)
      setEditingId(null)
      loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }

  const handleEdit = (template: adminApi.ModelTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      unlocksAt: template.unlocksAt ? toLocalInputValue(template.unlocksAt) : ''
    })
    setEditingId(template.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    try {
      await adminApi.deleteModelTemplate(id)
      loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  const handleToggleActive = async (template: adminApi.ModelTemplate) => {
    try {
      await adminApi.updateModelTemplate(template.id, { isActive: !template.isActive })
      loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template')
    }
  }

  const applyBulkUnlocksAt = async () => {
    try {
      setApplyingBulk(true)
      await Promise.all(templates.map(t =>
        adminApi.updateModelTemplate(t.id, { unlocksAt: bulkUnlocksAt ? toUtcIso(bulkUnlocksAt) : null })
      ))
      setBulkUnlocksAt('')
      loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply unlock date')
    } finally {
      setApplyingBulk(false)
    }
  }

  const saveInlineUnlocksAt = async (id: string, value: string) => {
    try {
      await adminApi.updateModelTemplate(id, { unlocksAt: value ? toUtcIso(value) : null })
      setInlineUnlocksAt(null)
      loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update unlock date')
    }
  }

  if (loading) {
    return <div className="text-gray-500">Loading templates...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Model Templates</h2>
          <p className="text-sm text-gray-500">Define the model submissions students must complete</p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: '', description: '', unlocksAt: '' })
            setEditingId(null)
            setShowForm(true)
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Add Template
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Template' : 'New Template'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Model 1: Active Site View"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this model should show..."
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unlocks At
                  <span className="ml-1 text-xs text-gray-400 font-normal">(students cannot submit before this date)</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.unlocksAt}
                  onChange={(e) => setFormData({ ...formData, unlocksAt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formData.unlocksAt && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, unlocksAt: '' })}
                    className="mt-1 text-xs text-red-600 hover:underline"
                  >
                    Clear lockout date
                  </button>
                )}
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

      {/* Bulk Unlock Date */}
      {templates.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-white rounded-lg shadow px-4 py-3">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Set all unlock dates:</span>
          <input
            type="datetime-local"
            value={bulkUnlocksAt}
            onChange={(e) => setBulkUnlocksAt(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={applyBulkUnlocksAt}
            disabled={applyingBulk || !bulkUnlocksAt}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {applyingBulk ? 'Applying...' : 'Apply to all'}
          </button>
          <span className="text-xs text-gray-400">Individual dates can still be overridden from the table.</span>
        </div>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No model templates yet. Create one to get started.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unlocks At
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {templates.map((template, index) => (
                <tr key={template.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {template.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {template.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleActive(template)}
                      className={`px-2 py-1 text-xs rounded-full ${
                        template.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {template.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {inlineUnlocksAt?.id === template.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="datetime-local"
                          value={inlineUnlocksAt.value}
                          onChange={(e) => setInlineUnlocksAt({ id: template.id, value: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => saveInlineUnlocksAt(template.id, inlineUnlocksAt.value)}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          Save
                        </button>
                        {inlineUnlocksAt.value && (
                          <button
                            onClick={() => saveInlineUnlocksAt(template.id, '')}
                            className="px-2 py-1 text-red-600 hover:text-red-800 text-xs"
                            title="Clear lockout date"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          onClick={() => setInlineUnlocksAt(null)}
                          className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setInlineUnlocksAt({
                          id: template.id,
                          value: template.unlocksAt ? toLocalInputValue(template.unlocksAt) : ''
                        })}
                        className="group flex items-center gap-1.5 text-left"
                      >
                        {template.unlocksAt ? (
                          <span className={new Date(template.unlocksAt) > new Date() ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                            {new Date(template.unlocksAt).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                            {new Date(template.unlocksAt) > new Date() && ' (locked)'}
                          </span>
                        ) : (
                          <span className="text-gray-300 group-hover:text-gray-500">Set date</span>
                        )}
                        <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleEdit(template)}
                      className="text-blue-600 hover:text-blue-800 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
