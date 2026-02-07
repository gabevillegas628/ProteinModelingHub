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
  const [viewer, setViewer] = useState<ViewerState>({ isOpen: false, fileUrl: '', modelName: '' })
  const [comments, setComments] = useState<CommentsState>({})
  const [discussionModal, setDiscussionModal] = useState<{ submissionId: string; modelName: string } | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [reviewStatus, setReviewStatus] = useState<studentApi.ReviewStatus | null>(null)
  const [requestingReview, setRequestingReview] = useState(false)
  const [reviewMessage, setReviewMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingProtein, setEditingProtein] = useState(false)
  const [proteinForm, setProteinForm] = useState({ pdbId: '', name: '' })
  const [savingProtein, setSavingProtein] = useState(false)

  useEffect(() => {
    loadModels()
    loadReviewStatus()
  }, [])

  // Update cooldown timer every minute
  useEffect(() => {
    if (reviewStatus?.cooldownEndsAt) {
      const interval = setInterval(() => {
        const now = Date.now()
        const endTime = new Date(reviewStatus.cooldownEndsAt!).getTime()
        if (now >= endTime) {
          setReviewStatus(prev => prev ? { ...prev, canRequest: true, cooldownEndsAt: null } : null)
        }
      }, 60000)
      return () => clearInterval(interval)
    }
  }, [reviewStatus?.cooldownEndsAt])

  const loadModels = async () => {
    try {
      setLoading(true)
      const response = await studentApi.getModels()
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  const loadReviewStatus = async () => {
    try {
      const status = await studentApi.getReviewStatus()
      setReviewStatus(status)
    } catch (err) {
      console.error('Failed to load review status:', err)
    }
  }

  const handleRequestReview = async () => {
    try {
      setRequestingReview(true)
      setReviewMessage(null)
      const response = await studentApi.requestReview()
      setReviewMessage({ type: 'success', text: response.message })
      setReviewStatus({
        lastReviewRequestedAt: response.lastReviewRequestedAt,
        canRequest: false,
        cooldownEndsAt: new Date(new Date(response.lastReviewRequestedAt).getTime() + 60 * 60 * 1000).toISOString()
      })
    } catch (err) {
      setReviewMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to request review' })
    } finally {
      setRequestingReview(false)
    }
  }

  const formatCooldownTime = (endTime: string) => {
    const remaining = new Date(endTime).getTime() - Date.now()
    if (remaining <= 0) return null
    const minutes = Math.ceil(remaining / (1000 * 60))
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    }
    return `${minutes}m`
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

  const closeViewer = () => {
    setViewer({ isOpen: false, fileUrl: '', modelName: '' })
  }

  const handleViewerSubmit = async (templateId: string, file: File) => {
    await handleFileSelect(templateId, file)
    // Close the viewer after successful submission
    closeViewer()
  }

  const toggleComments = async (submissionId: string) => {
    const current = comments[submissionId]

    if (current?.expanded) {
      // Collapse
      setComments(prev => ({
        ...prev,
        [submissionId]: { ...prev[submissionId], expanded: false }
      }))
    } else {
      // Expand and load comments
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          messages: prev[submissionId]?.messages || [],
          loading: true,
          error: '',
          expanded: true,
          unreadCount: prev[submissionId]?.unreadCount || 0,
          readStatuses: prev[submissionId]?.readStatuses || []
        }
      }))
      await loadComments(submissionId)
    }
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

        {/* Request Review Section */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleRequestReview}
            disabled={requestingReview || !reviewStatus?.canRequest}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              reviewStatus?.canRequest
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
            title={reviewStatus?.canRequest ? 'Send an email to instructors with your current submissions' : 'Please wait before requesting another review'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {requestingReview ? 'Sending...' : 'Request Review'}
          </button>
          {reviewStatus?.cooldownEndsAt && formatCooldownTime(reviewStatus.cooldownEndsAt) && (
            <span className="text-xs text-gray-500">
              Available again in {formatCooldownTime(reviewStatus.cooldownEndsAt)}
            </span>
          )}
          {reviewStatus?.lastReviewRequestedAt && reviewStatus.canRequest && (
            <span className="text-xs text-gray-500">
              Last requested: {new Date(reviewStatus.lastReviewRequestedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>
      </div>

      {/* Review Request Message */}
      {reviewMessage && (
        <div className={`mb-4 p-3 rounded-md ${
          reviewMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {reviewMessage.text}
          <button onClick={() => setReviewMessage(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {data.models.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No model templates have been created yet. Please wait for an administrator to set them up.
        </div>
      ) : (
        <div className="grid gap-4">
          {data.models.map((model) => (
            <div key={model.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-800">{model.name}</h3>
                    {model.submission && getStatusBadge(model.submission.status)}
                  </div>
                  {model.description && (
                    <p className="text-sm text-gray-600 mb-3">{model.description}</p>
                  )}

                  {model.submission ? (
                    <div className="bg-gray-50 rounded-md p-3 text-sm">
                      <div className="flex items-center gap-4 text-gray-600">
                        <span className="font-medium">{model.submission.fileName}</span>
                        <span>{formatFileSize(model.submission.fileSize)}</span>
                        <span>Uploaded {formatDate(model.submission.createdAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No submission yet</p>
                  )}
                </div>

                <div className="ml-4">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    ref={(el) => { fileInputRefs.current[model.id] = el }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleFileSelect(model.id, file)
                        e.target.value = ''
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    onClick={() => handleUploadClick(model.id)}
                    disabled={uploading === model.id}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors text-sm"
                  >
                    {uploading === model.id
                      ? 'Uploading...'
                      : model.submission
                        ? 'Replace'
                        : 'Upload'}
                  </button>
                </div>
              </div>

              {model.submission && (
                <>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex gap-4 items-start">
                      <img
                        src={`${studentApi.getModelFileUrl(model.submission.id)}&t=${new Date(model.submission.updatedAt).getTime()}`}
                        alt={model.name}
                        className="max-w-sm h-auto rounded-md border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ maxHeight: '250px' }}
                        onClick={() => openViewer(model.submission!.id, model.name, model.id)}
                      />
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => openViewer(model.submission!.id, model.name, model.id)}
                          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors text-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                          </svg>
                          View in 3D
                        </button>
                        <p className="text-xs text-gray-500">
                          Click image or button to open interactive 3D viewer
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleComments(model.submission!.id)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${comments[model.submission.id]?.expanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Comments
                        {comments[model.submission.id]?.messages?.length > 0 && (
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                            {comments[model.submission.id].messages.length}
                          </span>
                        )}
                        {(comments[model.submission.id]?.unreadCount ?? model.submission?.unreadCount ?? 0) > 0 && (
                          <span className="w-2 h-2 bg-red-500 rounded-full" title="Unread comments" />
                        )}
                      </button>
                      <button
                        onClick={() => openDiscussionModal(model.submission!.id, model.name)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Open in full view"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                    </div>

                    {comments[model.submission.id]?.expanded && (
                      <div className="mt-3 bg-gray-50 rounded-lg p-4 overflow-hidden" style={{ height: '400px' }}>
                        <CommentThread
                          messages={comments[model.submission.id]?.messages || []}
                          loading={comments[model.submission.id]?.loading || false}
                          error={comments[model.submission.id]?.error || ''}
                          onPost={(content) => postComment(model.submission!.id, content)}
                          onRefresh={() => loadComments(model.submission!.id)}
                          placeholder="Write a comment..."
                          emptyMessage="No comments yet. Start the conversation!"
                          currentUserId={user?.id}
                          onMarkRead={(lastReadAt) => markCommentsRead(model.submission!.id, lastReadAt)}
                          readStatuses={comments[model.submission.id]?.readStatuses || []}
                        />
                      </div>
                    )}
                  </div>
                </>
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
