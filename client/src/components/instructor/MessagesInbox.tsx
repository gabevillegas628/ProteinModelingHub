import { useState, useEffect, useCallback } from 'react'
import * as instructorApi from '../../services/instructorApi'
import InboxThreadModal from './InboxThreadModal'

interface Props {
  onUnreadCountChange: (count: number) => void
}

function formatTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function MessagesInbox({ onUnreadCountChange }: Props) {
  const [threads, setThreads] = useState<instructorApi.MessageThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openThread, setOpenThread] = useState<instructorApi.MessageThread | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await instructorApi.getMessageThreads()
      setThreads(data)
      onUnreadCountChange(data.reduce((sum, t) => sum + t.unreadCount, 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [onUnreadCountChange])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) {
    return <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
  }
  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">{error}</div>
  }
  if (threads.length === 0) {
    return <div className="p-8 text-center text-gray-500 text-sm">No messages yet across any groups.</div>
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Messages</h2>

      <div className="bg-white rounded-lg shadow overflow-hidden divide-y divide-gray-100">
        {threads.map((thread) => {
          const hasUnread = thread.unreadCount > 0
          const key = `${thread.groupId}-${thread.submissionId ?? 'general'}`

          return (
            <button
              key={key}
              onClick={() => setOpenThread(thread)}
              className={`w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-start gap-4 ${
                hasUnread ? 'bg-blue-50/40' : ''
              }`}
            >
              {/* Thread type icon */}
              <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                thread.submissionId ? 'bg-purple-100' : 'bg-green-100'
              }`}>
                {thread.submissionId ? (
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {thread.groupName}
                    <span className="text-gray-400 mx-1.5 font-normal">·</span>
                    {thread.label}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{formatTime(thread.latestMessage.createdAt)}</span>
                    {hasUnread && (
                      <span className="bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-5 text-center">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 truncate">
                  <span className="text-gray-600">
                    {thread.latestMessage.user.firstName}:
                  </span>{' '}
                  {thread.latestMessage.content}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {openThread && (
        <InboxThreadModal
          isOpen
          onClose={() => setOpenThread(null)}
          groupId={openThread.groupId}
          groupName={openThread.groupName}
          proteinPdbId={openThread.proteinPdbId}
          submissionId={openThread.submissionId}
          label={openThread.label}
          onRead={load}
        />
      )}
    </div>
  )
}
