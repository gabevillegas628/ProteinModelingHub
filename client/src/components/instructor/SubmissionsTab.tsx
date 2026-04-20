import { useState, useEffect } from 'react'
import * as instructorApi from '../../services/instructorApi'
import * as messageApi from '../../services/messageApi'
import JSmolViewer from '../shared/JSmolViewer'
import CommentThread from '../shared/CommentThread'
import DiscussionModal from '../shared/DiscussionModal'
import { useAuth } from '../../context/AuthContext'

interface Props {
  groupId: string
  proteinPdbId: string
}

interface ViewerState {
  isOpen: boolean
  fileUrl: string
  modelName: string
  proteinPdbId?: string
  templateId?: string
  submissionId?: string
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

export default function SubmissionsTab({ groupId, proteinPdbId }: Props) {
  const { user } = useAuth()
  const [models, setModels] = useState<instructorApi.ModelWithSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<ViewerState>({ isOpen: false, fileUrl: '', modelName: '' })
  const [comments, setComments] = useState<CommentsState>({})
  const [discussionModal, setDiscussionModal] = useState<{ submissionId: string; modelName: string } | null>(null)
  const [showRevisionBox, setShowRevisionBox] = useState<Record<string, boolean>>({})
  const [revisionFeedback, setRevisionFeedback] = useState<Record<string, string>>({})

  useEffect(() => {
    loadSubmissions()
  }, [groupId])

  const loadSubmissions = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await instructorApi.getGroupSubmissions(groupId)
      setModels(data)
      // Kick off comment loading for all submissions immediately
      const submissionIds = data.flatMap(m => m.submission ? [m.submission.id] : [])
      submissionIds.forEach(id => {
        setComments(prev => ({
          ...prev,
          [id]: { messages: [], loading: true, error: '', expanded: true, unreadCount: 0, readStatuses: [] }
        }))
      })
      await Promise.all(submissionIds.map(id => loadComments(id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const openViewer = (submissionId: string, modelName: string, templateId?: string) => {
    setViewer({
      isOpen: true,
      fileUrl: instructorApi.getSubmissionFileUrl(submissionId),
      modelName,
      proteinPdbId,
      templateId,
      submissionId
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

  const handleApprove = async (submissionId: string) => {
    try {
      await instructorApi.updateSubmission(submissionId, { status: 'APPROVED' })
      await loadSubmissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve submission')
    }
  }

  const handleRequestRevision = async (submissionId: string) => {
    try {
      const feedback = revisionFeedback[submissionId] || ''
      await instructorApi.updateSubmission(submissionId, {
        status: 'NEEDS_REVISION',
        feedback
      })
      if (feedback.trim()) {
        await messageApi.postSubmissionComment(submissionId, feedback)
      }
      setShowRevisionBox(prev => ({ ...prev, [submissionId]: false }))
      setRevisionFeedback(prev => ({ ...prev, [submissionId]: '' }))
      await loadSubmissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request revision')
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

  const postComment = async (submissionId: string, content: string) => {
    await messageApi.postSubmissionComment(submissionId, content)
    await loadComments(submissionId)
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

  return (
    <div>
      {models.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No model templates have been created yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {models.map((model) => (
            <div key={model.id} className={`bg-white rounded-lg shadow p-4 flex flex-col max-h-120 overflow-hidden ${!model.submission ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="text-lg font-semibold text-gray-800">{model.name}</h4>
                    {model.submission ? getStatusBadge(model.submission.status) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-400">No submission</span>
                    )}
                  </div>
                  {model.description && (
                    <p className="text-sm text-gray-600 mt-1">{model.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Primary action buttons — only for SUBMITTED */}
                  {model.submission?.status === 'SUBMITTED' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(model.submission!.id)}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setShowRevisionBox(prev => ({ ...prev, [model.submission!.id]: !prev[model.submission!.id] }))}
                        className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 transition-colors"
                      >
                        Request Revision
                      </button>
                    </div>
                  )}

                  {/* Escape-hatch dropdown — always present when there's a submission, intentionally muted */}
                  {model.submission && (
                    <select
                      value={model.submission.status}
                      onChange={(e) => handleStatusChange(model.submission!.id, e.target.value)}
                      className="text-xs border border-gray-200 text-gray-400 rounded px-2 py-1 focus:ring-1 focus:ring-gray-300 focus:border-gray-300 bg-transparent"
                      title="Override status"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="NEEDS_REVISION">Needs Revision</option>
                      <option value="APPROVED">Approved</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Revision feedback box */}
              {model.submission && showRevisionBox[model.submission.id] && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm font-medium text-amber-800 mb-2">Feedback for student:</p>
                  <textarea
                    value={revisionFeedback[model.submission.id] || ''}
                    onChange={(e) => setRevisionFeedback(prev => ({ ...prev, [model.submission!.id]: e.target.value }))}
                    placeholder="Describe what needs to be revised..."
                    rows={3}
                    className="w-full text-sm border border-amber-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleRequestRevision(model.submission!.id)}
                      className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded hover:bg-amber-600 transition-colors"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => setShowRevisionBox(prev => ({ ...prev, [model.submission!.id]: false }))}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {model.submission && (
                <div className="mt-3 flex gap-4 flex-1 min-h-0">
                  {/* Left: thumbnail + 3D button */}
                  <div className="flex flex-col gap-2 shrink-0 w-40">
                    <img
                      src={`${instructorApi.getSubmissionFileUrl(model.submission.id)}&t=${new Date(model.submission.updatedAt).getTime()}`}
                      alt={model.name}
                      className="w-full h-auto rounded-md border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity object-cover"
                      style={{ maxHeight: '200px' }}
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
                    <p className="text-xs text-gray-400 text-center">
                      by {model.submission.submittedBy.firstName} {model.submission.submittedBy.lastName}
                      <br />{formatDate(model.submission.createdAt)}
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
        groupId={groupId}
        templateId={viewer.templateId}
        submissionId={viewer.submissionId}
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
