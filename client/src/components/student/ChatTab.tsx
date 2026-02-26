import { useState, useEffect, useCallback } from 'react'
import * as studentApi from '../../services/studentApi'
import * as messageApi from '../../services/messageApi'
import CommentThread from '../shared/CommentThread'
import { useAuth } from '../../context/AuthContext'

export default function ChatTab() {
  const { user } = useAuth()
  const [group, setGroup] = useState<studentApi.Group | null>(null)
  const [messages, setMessages] = useState<messageApi.Message[]>([])
  const [readStatuses, setReadStatuses] = useState<messageApi.ReadStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadGroup()
  }, [])

  useEffect(() => {
    if (group) {
      loadMessages()
      // Poll for new messages every 10 seconds
      const interval = setInterval(loadMessages, 10000)
      return () => clearInterval(interval)
    }
  }, [group?.id])

  const loadGroup = async () => {
    try {
      setLoading(true)
      const response = await studentApi.getModels()
      setGroup(response.group)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = useCallback(async () => {
    if (!group) return
    try {
      setMessagesLoading(messages.length === 0)
      const response = await messageApi.getGroupMessages(group.id)
      setMessages(response.messages)
      setReadStatuses(response.readStatuses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setMessagesLoading(false)
    }
  }, [group?.id, messages.length])

  const handlePost = async (content: string) => {
    if (!group) return
    await messageApi.postGroupMessage(group.id, content)
    await loadMessages()
  }

  const markAsRead = async (lastReadAt: string) => {
    if (!group) return
    try {
      await messageApi.markGroupRead(group.id, lastReadAt)
    } catch (err) {
      console.error('Failed to mark messages as read:', err)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 flex items-center justify-center">
        <div className="text-gray-500">Loading chat...</div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="bg-amber-50 text-amber-700 p-4 rounded-md">
        {error || 'You are not assigned to a group yet. Please contact an administrator.'}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <h2 className="text-lg font-semibold text-gray-800">Group Chat</h2>
        <p className="text-sm text-gray-500">
          {group.name} - {group.proteinName} ({group.proteinPdbId})
        </p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 p-6 overflow-hidden">
        <CommentThread
          messages={messages}
          loading={messagesLoading}
          error={error}
          onPost={handlePost}
          onRefresh={loadMessages}
          placeholder="Type a message..."
          emptyMessage="No messages yet. Start the conversation with your group!"
          currentUserId={user?.id}
          onMarkRead={markAsRead}
          readStatuses={readStatuses}
        />
      </div>
    </div>
  )
}
