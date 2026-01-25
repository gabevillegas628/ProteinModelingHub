import { useState, useEffect, useRef } from 'react'
import * as studentApi from '../../services/studentApi'
import * as messageApi from '../../services/messageApi'
import JSmolViewer from '../shared/JSmolViewer'
import CommentThread from '../shared/CommentThread'
import { useAuth } from '../../context/AuthContext'

interface ViewerState {
  isOpen: boolean
  fileUrl: string
  modelName: string
  proteinPdbId?: string
}

interface CommentsState {
  [submissionId: string]: {
    messages: messageApi.Message[]
    loading: boolean
    error: string
    expanded: boolean
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
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    loadModels()
  }, [])

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

  const openViewer = (submissionId: string, modelName: string) => {
    setViewer({
      isOpen: true,
      fileUrl: studentApi.getModelFileUrl(submissionId),
      modelName,
      proteinPdbId: data?.group.proteinPdbId
    })
  }

  const closeViewer = () => {
    setViewer({ isOpen: false, fileUrl: '', modelName: '' })
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
          expanded: true
        }
      }))
      await loadComments(submissionId)
    }
  }

  const loadComments = async (submissionId: string) => {
    try {
      const messages = await messageApi.getSubmissionComments(submissionId)
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          messages,
          loading: false,
          error: '',
          expanded: true
        }
      }))
    } catch (err) {
      setComments(prev => ({
        ...prev,
        [submissionId]: {
          messages: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load comments',
          expanded: true
        }
      }))
    }
  }

  const postComment = async (submissionId: string, content: string) => {
    await messageApi.postSubmissionComment(submissionId, content)
    await loadComments(submissionId)
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
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Your Models</h2>
        <p className="text-sm text-gray-500">
          Group: {data.group.name} | Protein: {data.group.proteinName} ({data.group.proteinPdbId})
        </p>
      </div>

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
                          Click image or button to open interactive 3D viewer
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
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
                    </button>

                    {comments[model.submission.id]?.expanded && (
                      <div className="mt-3 bg-gray-50 rounded-lg p-4" style={{ maxHeight: '400px' }}>
                        <CommentThread
                          messages={comments[model.submission.id]?.messages || []}
                          loading={comments[model.submission.id]?.loading || false}
                          error={comments[model.submission.id]?.error || ''}
                          onPost={(content) => postComment(model.submission!.id, content)}
                          onRefresh={() => loadComments(model.submission!.id)}
                          placeholder="Write a comment..."
                          emptyMessage="No comments yet. Start the conversation!"
                          currentUserId={user?.id}
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
      />
    </div>
  )
}
