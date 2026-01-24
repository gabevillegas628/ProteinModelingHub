import { useState, useEffect, useRef } from 'react'
import type { Message } from '../../services/messageApi'

interface Props {
  messages: Message[]
  loading: boolean
  error: string
  onPost: (content: string) => Promise<void>
  onRefresh: () => void
  placeholder?: string
  emptyMessage?: string
  currentUserId?: string
}

export default function CommentThread({
  messages,
  loading,
  error,
  onPost,
  onRefresh,
  placeholder = 'Write a comment...',
  emptyMessage = 'No comments yet. Be the first to comment!',
  currentUserId
}: Props) {
  const [newMessage, setNewMessage] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || posting) return

    setPosting(true)
    setPostError('')

    try {
      await onPost(newMessage.trim())
      setNewMessage('')
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post message')
    } finally {
      setPosting(false)
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const getRoleBadge = (role: string) => {
    if (role === 'INSTRUCTOR') {
      return (
        <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
          Instructor
        </span>
      )
    }
    if (role === 'ADMIN') {
      return (
        <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
          Admin
        </span>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500">
        <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Error display */}
      {error && (
        <div className="bg-red-50 text-red-600 px-3 py-2 text-sm rounded-md mb-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={onRefresh} className="underline ml-2">Retry</button>
        </div>
      )}

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-4 text-sm">
            {emptyMessage}
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.userId === currentUserId
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    isOwn
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className={`flex items-center text-xs mb-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                    <span className="font-medium">
                      {message.user.firstName} {message.user.lastName}
                    </span>
                    {!isOwn && getRoleBadge(message.user.role)}
                    <span className="mx-1.5">·</span>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={placeholder}
          disabled={posting}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || posting}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {posting ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </>
          )}
        </button>
      </form>

      {/* Post error */}
      {postError && (
        <div className="mt-2 text-red-600 text-xs">
          {postError}
        </div>
      )}
    </div>
  )
}
