import { useEffect } from 'react'
import CommentThread from './CommentThread'
import type { Message, ReadStatus } from '../../services/messageApi'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  messages: Message[]
  loading: boolean
  error: string
  onPost: (content: string) => Promise<void>
  onRefresh: () => void
  currentUserId?: string
  onMarkRead?: (lastReadAt: string) => void
  readStatuses?: ReadStatus[]
}

export default function DiscussionModal({
  isOpen,
  onClose,
  title,
  messages,
  loading,
  error,
  onPost,
  onRefresh,
  currentUserId,
  onMarkRead,
  readStatuses = []
}: Props) {
  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            <span className="text-sm text-gray-500">
              {messages.length} {messages.length === 1 ? 'comment' : 'comments'}
            </span>
          </div>
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

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="h-full">
            <CommentThread
              messages={messages}
              loading={loading}
              error={error}
              onPost={onPost}
              onRefresh={onRefresh}
              placeholder="Write a comment..."
              emptyMessage="No comments yet. Start the conversation!"
              currentUserId={currentUserId}
              onMarkRead={onMarkRead}
              readStatuses={readStatuses}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
