import { useState, useEffect, useCallback } from 'react'
import * as messageApi from '../../services/messageApi'
import * as instructorApi from '../../services/instructorApi'
import CommentThread from '../shared/CommentThread'
import JSmolViewer from '../shared/JSmolViewer'
import { useAuth } from '../../context/AuthContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  groupId: string
  groupName: string
  proteinPdbId: string
  submissionId: string | null
  label: string
  onRead?: () => void
}

export default function InboxThreadModal({
  isOpen,
  onClose,
  groupId,
  groupName,
  proteinPdbId,
  submissionId,
  label,
  onRead,
}: Props) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<messageApi.Message[]>([])
  const [readStatuses, setReadStatuses] = useState<messageApi.ReadStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewerOpen, setViewerOpen] = useState(false)

  const isGeneral = submissionId === null

  const load = useCallback(async () => {
    if (!isOpen) return
    setLoading(true)
    setError('')
    try {
      const data = isGeneral
        ? await messageApi.getGroupMessages(groupId)
        : await messageApi.getSubmissionComments(submissionId!)
      setMessages(data.messages)
      setReadStatuses(data.readStatuses)
    } catch {
      setError('Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [isOpen, groupId, submissionId, isGeneral])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handlePost = async (content: string) => {
    if (isGeneral) {
      await messageApi.postGroupMessage(groupId, content)
    } else {
      await messageApi.postSubmissionComment(submissionId!, content)
    }
    await load()
    onRead?.()
  }

  const handleMarkRead = async (lastReadAt: string) => {
    if (isGeneral) {
      await messageApi.markGroupRead(groupId, lastReadAt)
    } else {
      await messageApi.markSubmissionRead(submissionId!, lastReadAt)
    }
    onRead?.()
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3 min-w-0">
              <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-800 truncate">
                  {groupName}
                  <span className="text-gray-400 mx-1.5">·</span>
                  {label}
                </h2>
                <p className="text-xs text-gray-500">
                  {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {!isGeneral && (
                <button
                  onClick={() => setViewerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                  </svg>
                  View 3D
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden p-6">
            <CommentThread
              messages={messages}
              loading={loading}
              error={error}
              onPost={handlePost}
              onRefresh={load}
              currentUserId={user?.id}
              onMarkRead={handleMarkRead}
              readStatuses={readStatuses}
            />
          </div>
        </div>
      </div>

      {!isGeneral && (
        <JSmolViewer
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          fileUrl={instructorApi.getSubmissionFileUrl(submissionId!)}
          modelName={label}
          proteinPdbId={proteinPdbId}
        />
      )}
    </>
  )
}
