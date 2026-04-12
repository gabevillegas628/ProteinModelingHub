import { useState, useEffect, useRef } from 'react'
import * as studentApi from '../../services/studentApi'
import * as messageApi from '../../services/messageApi'
import JSmolViewer from '../shared/JSmolViewer'
import CommentThread from '../shared/CommentThread'
import DiscussionModal from '../shared/DiscussionModal'
import { useAuth } from '../../context/AuthContext'

interface ViewerState {
  isOpen: boolean
  fileUrl: string
  modelName: string
  proteinPdbId?: string
  templateId?: string
}

interface CommentsState {
  [submissionId: string]: {
    messages: messageApi.Message[]
    loading: boolean
    error: string
    expanded: boolean
    unreadCount: number
    readStatuses: messageApi.ReadStatus[]
  }
}

export default function ModelsTab() {
  const { user } = useAuth()
  const [data, setData] = useState<studentApi.ModelsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [viewer, setViewer] = useState<ViewerState>({ isOpen: false, fileUrl: '', modelName: '' })
  const [comments, setComments] = useState<CommentsState>({})
  const [discussionModal, setDiscussionModal] = useState<{ submissionId: string; modelName: string } | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [editingProtein, setEditingProtein] = useState(false)
  const [proteinForm, setProteinForm] = useState({ pdbId: '', name: '' })
  const [savingProtein, setSavingProtein] = useState(false)
  const [newPickerOpen, setNewPickerOpen] = useState<string | null>(null)

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    try {
      setLoading(true)
      const response = await studentApi.getModels()
      setData(response)
      // Kick off comment loading for all submissions immediately
      const submissionIds = response.models.flatMap(m => m.submission ? [m.submission.id] : [])
      submissionIds.forEach(id => {
        setComments(prev => ({
          ...prev,
          [id]: { messages: [], loading: true, error: '', expanded: true, unreadCount: 0, readStatuses: [] }
        }))
      })
      await Promise.all(submissionIds.map(id => loadComments(id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitForReview = async (templateId: string) => {
    try {
      setSubmitting(templateId)
      setError('')
      await studentApi.submitModel(templateId)
      await loadModels()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit model')
    } finally {
      setSubmitting(null)
    }
  }

  const handleStartOver = async (model: studentApi.ModelWithSubmission) => {
    const status = model.submission?.status
    if (!status || status === 'DRAFT' || status === 'NEEDS_REVISION') {
      setNewPickerOpen(model.id)
      return
    }

    const msg = status === 'SUBMITTED'
      ? 'Starting over will withdraw your submission from review and reset it to a draft. Continue?'
      : 'Starting over will reset your approved model back to a draft. Continue?'
    if (!window.confirm(msg)) return

    try {
      setResetting(model.id)
      await studentApi.resetModel(model.submission!.id)
      await loadModels()
      setNewPickerOpen(model.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset model')
    } finally {
      setResetting(null)
    }
  }

  const handleWithdraw = async (submissionId: string) => {
    try {
      setWithdrawing(submissionId)
      setError('')
      await studentApi.withdrawModel(submissionId)
      await loadModels()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw submission')
    } finally {
      setWithdrawing(null)
    }
  }

  const startEditingProtein = () => {
    if (data) {
      setProteinForm({
        pdbId: data.group.proteinPdbId,
        name: data.group.proteinName
      })
      setEditingProtein(true)
    }
  }

  const cancelEditingProtein = () => {
    setEditingProtein(false)
    setError('')
  }

  const saveProteinInfo = async () => {
    try {
      setSavingProtein(true)
      setError('')
      const updated = await studentApi.updateGroup({
        proteinPdbId: proteinForm.pdbId,
        proteinName: proteinForm.name
      })
      setData(prev => prev ? { ...prev, group: updated } : null)
      setEditingProtein(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update protein info')
    } finally {
      setSavingProtein(false)
    }
  }

  const handleFileSelect = async (templateId: string, file: File) => {
    try {
      setUploading(templateId)
      setError('')
      await studentApi.uploadModel(templateId, file)
      await loadModels()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload model')
    } finally {
      setUploading(null)
    }
  }

  const handleUploadClick = (templateId: string) => {
    fileInputRefs.current[templateId]?.click()
  }

  const openViewer = (submissionId: string, modelName: string, templateId: string) => {
    setViewer({
      isOpen: true,
      fileUrl: studentApi.getModelFileUrl(submissionId),
      modelName,
      proteinPdbId: data?.group.proteinPdbId,
      templateId
    })
  }

  const openNewViewer = (templateId: string, modelName: string, sourceFileUrl?: string) => {
    setNewPickerOpen(null)
    setViewer({
      isOpen: true,
      fileUrl: sourceFileUrl ?? '',
      modelName,
      proteinPdbId: data?.group.proteinPdbId,
      templateId
    })
  }

  const closeViewer = () => {
    setViewer({ isOpen: false, fileUrl: '', modelName: '' })
  }

  const handleViewerSubmit = async (templateId: string, file: File) => {
    await handleFileSelect(templateId, file)
    // Close the viewer after successful submission
    closeViewer()
  }

  const loadComments = async (submissionId: string) => {
    try {
      const response = await messageApi.getSubmissionComments(submissionId)
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          messages: response.messages,
          loading: false,
          error: '',
          expanded: prev[submissionId]?.expanded ?? true,
          unreadCount: response.unreadCount,
          readStatuses: response.readStatuses
        }
      }))
    } catch (err) {
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          messages: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load comments',
          expanded: prev[submissionId]?.expanded ?? true,
          unreadCount: 0,
          readStatuses: []
        }
      }))
    }
  }

  const markCommentsRead = async (submissionId: string, lastReadAt: string) => {
    try {
      await messageApi.markSubmissionRead(submissionId, lastReadAt)
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          ...prev[submissionId],
          unreadCount: 0
        }
      }))
    } catch (err) {
      console.error('Failed to mark comments as read:', err)
    }
  }

  const postComment = async (submissionId: string, content: string) => {
    await messageApi.postSubmissionComment(submissionId, content)
    await loadComments(submissionId)
  }

  const openDiscussionModal = async (submissionId: string, modelName: string) => {
    setDiscussionModal({ submissionId, modelName })
    // Load comments if not already loaded
    if (!comments[submissionId]?.messages?.length && !comments[submissionId]?.loading) {
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          messages: prev[submissionId]?.messages || [],
          loading: true,
          error: '',
          expanded: prev[submissionId]?.expanded || false,
          unreadCount: prev[submissionId]?.unreadCount || 0,
          readStatuses: prev[submissionId]?.readStatuses || []
        }
      }))
      await loadComments(submissionId)
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    return <div className="text-gray-500">Loading models...</div>
  }

  if (!data) {
    return (
      <div className="bg-amber-50 text-amber-700 p-4 rounded-md">
        {error || 'You are not assigned to a group yet. Please contact an administrator.'}
      </div>
    )
  }

  const visibleModels = data.models.filter(m => !m.unlocksAt || new Date(m.unlocksAt) <= new Date())

  return (
    <div>
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Your Models</h2>
          {editingProtein ? (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm text-gray-500">Group: {data.group.name} |</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={proteinForm.name}
                  onChange={(e) => setProteinForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Protein name"
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ width: '150px' }}
                />
                <input
                  type="text"
                  value={proteinForm.pdbId}
                  onChange={(e) => setProteinForm(prev => ({ ...prev, pdbId: e.target.value.toUpperCase() }))}
                  placeholder="PDB ID"
                  maxLength={4}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  style={{ width: '70px' }}
                />
                <button
                  onClick={saveProteinInfo}
                  disabled={savingProtein || !proteinForm.pdbId || !proteinForm.name.trim()}
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {savingProtein ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditingProtein}
                  className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Group: {data.group.name} | Protein: {data.group.proteinName} ({data.group.proteinPdbId})
              <button
                onClick={startEditingProtein}
                className="ml-2 text-blue-600 hover:text-blue-800 hover:underline"
                title="Edit protein info"
              >
                <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </p>
          )}
        </div>

      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {visibleModels.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {data.models.length === 0
            ? 'No model templates have been created yet. Please wait for an administrator to set them up.'
            : 'No models are available yet. Check back later.'}
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleModels.map((model) => (
            <div key={model.id} className={`bg-white rounded-lg shadow p-4 flex flex-col max-h-120 ${model.submission ? '' : ''}`}>

              {/* Hidden file input */}
              <input
                type="file"
                accept=".jpg,.jpeg,.png"
                ref={(el) => { fileInputRefs.current[model.id] = el }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) { handleFileSelect(model.id, file); e.target.value = '' }
                }}
                className="hidden"
              />

              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-800">{model.name}</h3>
                    {model.submission ? getStatusBadge(model.submission.status) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-400">No submission</span>
                    )}
                  </div>
                  {model.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{model.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {/* Upload — only for editable states */}
                  {(!model.submission || model.submission.status === 'DRAFT' || model.submission.status === 'NEEDS_REVISION') && (
                    <button
                      onClick={() => handleUploadClick(model.id)}
                      disabled={uploading === model.id}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                    >
                      {uploading === model.id ? 'Uploading...' : model.submission ? 'Upload PNG' : 'Upload'}
                    </button>
                  )}

                  {/* New (no submission) or Start Over (has submission) */}
                  {!model.submission ? (
                    <button
                      onClick={() => setNewPickerOpen(newPickerOpen === model.id ? null : model.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors font-medium ${
                        newPickerOpen === model.id ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {newPickerOpen !== model.id && (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                      {newPickerOpen === model.id ? 'Cancel' : 'New'}
                    </button>
                  ) : (
                    <button
                      onClick={() => newPickerOpen === model.id ? setNewPickerOpen(null) : handleStartOver(model)}
                      disabled={resetting === model.id}
                      className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors font-medium ${
                        newPickerOpen === model.id
                          ? 'bg-gray-500 text-white hover:bg-gray-600'
                          : model.submission.status === 'SUBMITTED' || model.submission.status === 'APPROVED'
                            ? 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-gray-300'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300'
                      }`}
                    >
                      {newPickerOpen === model.id ? 'Cancel' : resetting === model.id ? 'Resetting...' : 'Start Over'}
                    </button>
                  )}

                  {/* Submit / Resubmit */}
                  {model.submission?.status === 'DRAFT' && (
                    <button
                      onClick={() => handleSubmitForReview(model.id)}
                      disabled={submitting === model.id}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                    >
                      {submitting === model.id ? 'Submitting...' : 'Submit for Review'}
                    </button>
                  )}
                  {model.submission?.status === 'NEEDS_REVISION' && (
                    <button
                      onClick={() => handleSubmitForReview(model.id)}
                      disabled={submitting === model.id}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                    >
                      {submitting === model.id ? 'Submitting...' : 'Resubmit for Review'}
                    </button>
                  )}

                  {/* Withdraw — stays as subtle text link */}
                  {model.submission?.status === 'SUBMITTED' && (
                    <button
                      onClick={() => handleWithdraw(model.submission!.id)}
                      disabled={withdrawing === model.submission.id}
                      className="text-sm text-gray-400 hover:text-red-600 underline disabled:opacity-50 transition-colors"
                    >
                      {withdrawing === model.submission.id ? 'Withdrawing...' : 'Withdraw'}
                    </button>
                  )}
                </div>
              </div>

              {/* NEEDS_REVISION feedback banner */}
              {model.submission?.status === 'NEEDS_REVISION' && model.submission.feedback && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm">
                  <span className="font-medium text-amber-800">Feedback: </span>
                  <span className="text-amber-700">{model.submission.feedback}</span>
                </div>
              )}

              {/* New model picker */}
              {(!model.submission || model.submission.status === 'DRAFT' || model.submission.status === 'NEEDS_REVISION') && newPickerOpen === model.id && (
                <div className="mb-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Start from</p>
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => openNewViewer(model.id, model.name)}
                      className="flex flex-col items-center gap-1.5 p-3 w-28 border-2 border-indigo-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 bg-white transition-colors"
                    >
                      <div className="w-20 h-12 flex items-center justify-center bg-indigo-50 rounded">
                        <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-indigo-700">PDB Structure</span>
                      <span className="text-xs text-gray-400">{data.group.proteinPdbId}</span>
                    </button>
                    {data.models.filter(m => m.submission && m.id !== model.id).map(sourceModel => (
                      <button
                        key={sourceModel.id}
                        onClick={() => openNewViewer(model.id, model.name, studentApi.getModelFileUrl(sourceModel.submission!.id))}
                        className="flex flex-col items-center gap-1.5 p-3 w-28 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 bg-white transition-colors"
                      >
                        <img
                          src={`${studentApi.getModelFileUrl(sourceModel.submission!.id)}&t=${new Date(sourceModel.submission!.updatedAt).getTime()}`}
                          alt={sourceModel.name}
                          className="w-20 h-12 object-cover rounded"
                        />
                        <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{sourceModel.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Two-column body — only when submission exists */}
              {model.submission && (
                <div className="flex gap-4 flex-1 min-h-0">
                  {/* Left: thumbnail + viewer button + meta */}
                  <div className="w-40 shrink-0 flex flex-col gap-2">
                    <img
                      src={`${studentApi.getModelFileUrl(model.submission.id)}&t=${new Date(model.submission.updatedAt).getTime()}`}
                      alt={model.name}
                      className="w-full h-auto rounded-md border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity object-cover"
                      style={{ maxHeight: '160px' }}
                      onClick={() => openViewer(model.submission!.id, model.name, model.id)}
                    />
                    <button
                      onClick={() => openViewer(model.submission!.id, model.name, model.id)}
                      className="flex items-center justify-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                      </svg>
                      View in 3D
                    </button>
                    <p className="text-xs text-gray-400 text-center leading-snug">
                      {model.submission.fileName}<br />
                      {formatFileSize(model.submission.fileSize)} · {formatDate(model.submission.createdAt)}
                    </p>
                  </div>

                  {/* Right: comment thread */}
                  <div className="flex-1 flex flex-col min-w-0 border border-gray-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                      <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Comments
                        {(comments[model.submission.id]?.unreadCount ?? model.submission.unreadCount ?? 0) > 0 && (
                          <span className="w-2 h-2 bg-red-500 rounded-full" title="Unread comments" />
                        )}
                      </span>
                      <button
                        onClick={() => openDiscussionModal(model.submission!.id, model.name)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Open in full view"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 p-3">
                      <CommentThread
                        messages={comments[model.submission.id]?.messages || []}
                        loading={comments[model.submission.id]?.loading || false}
                        error={comments[model.submission.id]?.error || ''}
                        onPost={(content) => postComment(model.submission!.id, content)}
                        onRefresh={() => loadComments(model.submission!.id)}
                        placeholder="Write a comment..."
                        emptyMessage="No comments yet."
                        currentUserId={user?.id}
                        onMarkRead={(lastReadAt) => markCommentsRead(model.submission!.id, lastReadAt)}
                        readStatuses={comments[model.submission.id]?.readStatuses || []}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3D Viewer Modal */}
      <JSmolViewer
        isOpen={viewer.isOpen}
        onClose={closeViewer}
        fileUrl={viewer.fileUrl}
        modelName={viewer.modelName}
        proteinPdbId={viewer.proteinPdbId}
        templateId={viewer.templateId}
        onSubmit={handleViewerSubmit}
        groupId={data?.group.id}
      />

      {/* Discussion Modal */}
      {discussionModal && (
        <DiscussionModal
          isOpen={true}
          onClose={() => setDiscussionModal(null)}
          title={`${discussionModal.modelName} Discussion`}
          messages={comments[discussionModal.submissionId]?.messages || []}
          loading={comments[discussionModal.submissionId]?.loading || false}
          error={comments[discussionModal.submissionId]?.error || ''}
          onPost={(content) => postComment(discussionModal.submissionId, content)}
          onRefresh={() => loadComments(discussionModal.submissionId)}
          currentUserId={user?.id}
          onMarkRead={(lastReadAt) => markCommentsRead(discussionModal.submissionId, lastReadAt)}
          readStatuses={comments[discussionModal.submissionId]?.readStatuses || []}
        />
      )}
    </div>
  )
}
