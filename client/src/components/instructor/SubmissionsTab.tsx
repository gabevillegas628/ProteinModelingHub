import { useState, useEffect } from 'react'
import * as instructorApi from '../../services/instructorApi'
import JSmolViewer from '../shared/JSmolViewer'

interface Props {
  groupId: string
  proteinPdbId: string
}

interface ViewerState {
  isOpen: boolean
  fileUrl: string
  modelName: string
  proteinPdbId?: string
}

export default function SubmissionsTab({ groupId, proteinPdbId }: Props) {
  const [models, setModels] = useState<instructorApi.ModelWithSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<ViewerState>({ isOpen: false, fileUrl: '', modelName: '' })
  const [editingFeedback, setEditingFeedback] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)

  useEffect(() => {
    loadSubmissions()
  }, [groupId])

  const loadSubmissions = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await instructorApi.getGroupSubmissions(groupId)
      setModels(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const openViewer = (submissionId: string, modelName: string) => {
    setViewer({
      isOpen: true,
      fileUrl: instructorApi.getSubmissionFileUrl(submissionId),
      modelName,
      proteinPdbId
    })
  }

  const closeViewer = () => {
    setViewer({ isOpen: false, fileUrl: '', modelName: '' })
  }

  const handleStatusChange = async (submissionId: string, newStatus: string) => {
    try {
      await instructorApi.updateSubmission(submissionId, { status: newStatus })
      await loadSubmissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const startEditFeedback = (submissionId: string, currentFeedback: string | null) => {
    setEditingFeedback(submissionId)
    setFeedbackText(currentFeedback || '')
  }

  const saveFeedback = async (submissionId: string) => {
    try {
      setSavingFeedback(true)
      await instructorApi.updateSubmission(submissionId, { feedback: feedbackText })
      setEditingFeedback(null)
      await loadSubmissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save feedback')
    } finally {
      setSavingFeedback(false)
    }
  }

  const cancelEditFeedback = () => {
    setEditingFeedback(null)
    setFeedbackText('')
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-600',
      SUBMITTED: 'bg-blue-100 text-blue-700',
      NEEDS_REVISION: 'bg-amber-100 text-amber-700',
      APPROVED: 'bg-green-100 text-green-700'
    }
    const labels: Record<string, string> = {
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      NEEDS_REVISION: 'Needs Revision',
      APPROVED: 'Approved'
    }
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${styles[status] || styles.DRAFT}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return <div className="text-gray-500">Loading submissions...</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-md">
        {error}
        <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
      </div>
    )
  }

  const submittedModels = models.filter(m => m.submission)
  const pendingModels = models.filter(m => !m.submission)

  return (
    <div>
      {submittedModels.length === 0 && pendingModels.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No model templates have been created yet.
        </div>
      ) : (
        <>
          {/* Submitted Models */}
          {submittedModels.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-800">
                Submitted Models ({submittedModels.length})
              </h3>
              {submittedModels.map((model) => (
                <div key={model.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-semibold text-gray-800">{model.name}</h4>
                        {model.submission && getStatusBadge(model.submission.status)}
                      </div>
                      {model.description && (
                        <p className="text-sm text-gray-600 mt-1">{model.description}</p>
                      )}
                    </div>

                    {/* Status Dropdown */}
                    {model.submission && (
                      <select
                        value={model.submission.status}
                        onChange={(e) => handleStatusChange(model.submission!.id, e.target.value)}
                        className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="SUBMITTED">Submitted</option>
                        <option value="NEEDS_REVISION">Needs Revision</option>
                        <option value="APPROVED">Approved</option>
                      </select>
                    )}
                  </div>

                  {model.submission && (
                    <>
                      {/* Submission Info */}
                      <div className="text-sm text-gray-500 mb-4">
                        Submitted by{' '}
                        <span className="font-medium text-gray-700">
                          {model.submission.submittedBy.firstName} {model.submission.submittedBy.lastName}
                        </span>
                        {' '}on {formatDate(model.submission.createdAt)}
                      </div>

                      {/* Image and Viewer */}
                      <div className="flex gap-4 items-start mb-4">
                        <img
                          src={instructorApi.getSubmissionFileUrl(model.submission.id)}
                          alt={model.name}
                          className="max-w-md h-auto rounded-md border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          style={{ maxHeight: '300px' }}
                          onClick={() => openViewer(model.submission!.id, model.name)}
                        />
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => openViewer(model.submission!.id, model.name)}
                            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors text-sm"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                            </svg>
                            View in 3D
                          </button>
                          <p className="text-xs text-gray-500">
                            Click image or button to open interactive viewer
                          </p>
                        </div>
                      </div>

                      {/* Feedback Section */}
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-700">Feedback</h5>
                          {editingFeedback !== model.submission.id && (
                            <button
                              onClick={() => startEditFeedback(model.submission!.id, model.submission!.feedback)}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              {model.submission.feedback ? 'Edit' : 'Add Feedback'}
                            </button>
                          )}
                        </div>

                        {editingFeedback === model.submission.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              placeholder="Enter feedback for the student..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveFeedback(model.submission!.id)}
                                disabled={savingFeedback}
                                className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingFeedback ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditFeedback}
                                className="text-gray-600 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : model.submission.feedback ? (
                          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                            {model.submission.feedback}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No feedback yet</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pending Models */}
          {pendingModels.length > 0 && (
            <div className={submittedModels.length > 0 ? 'mt-8' : ''}>
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                Awaiting Submission ({pendingModels.length})
              </h3>
              <div className="grid gap-3">
                {pendingModels.map((model) => (
                  <div key={model.id} className="bg-white rounded-lg shadow p-4 opacity-60">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="font-medium text-gray-700">{model.name}</h4>
                        {model.description && (
                          <p className="text-sm text-gray-500">{model.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 3D Viewer Modal */}
      <JSmolViewer
        isOpen={viewer.isOpen}
        onClose={closeViewer}
        fileUrl={viewer.fileUrl}
        modelName={viewer.modelName}
        proteinPdbId={viewer.proteinPdbId}
      />
    </div>
  )
}
