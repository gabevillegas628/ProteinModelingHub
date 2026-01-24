import { useState, useEffect, useCallback } from 'react'
import * as messageApi from '../../services/messageApi'
import CommentThread from '../shared/CommentThread'
import { useAuth } from '../../context/AuthContext'

interface Props {
  groupId: string
}

export default function DiscussionTab({ groupId }: Props) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<messageApi.Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadMessages()
    // Poll for new messages every 10 seconds
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [groupId])

  const loadMessages = useCallback(async () => {
    try {
      setLoading(messages.length === 0)
      const data = await messageApi.getGroupMessages(groupId)
      setMessages(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [groupId, messages.length])

  const handlePost = async (content: string) => {
    await messageApi.postGroupMessage(groupId, content)
    await loadMessages()
  }

  return (
    <div className="bg-white rounded-lg shadow flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '400px' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <h2 className="text-lg font-semibold text-gray-800">Group Discussion</h2>
        <p className="text-sm text-gray-500">
          Chat with group members about their protein model
        </p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 p-6 overflow-hidden">
        <CommentThread
          messages={messages}
          loading={loading}
          error={error}
          onPost={handlePost}
          onRefresh={loadMessages}
          placeholder="Type a message..."
          emptyMessage="No messages yet. Start the conversation!"
          currentUserId={user?.id}
        />
      </div>
    </div>
  )
}
