export default function ChatTab() {
  return (
    <div className="bg-white rounded-lg shadow p-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Group Chat</h2>
        <p className="text-gray-500 mb-4">
          Chat functionality is coming soon. You'll be able to discuss your protein model
          with your group members and instructors here.
        </p>
        <div className="bg-gray-50 rounded-md p-4 text-left text-sm text-gray-600">
          <p className="font-medium mb-2">Planned features:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Real-time messaging with your group</li>
            <li>Direct communication with instructors</li>
            <li>File sharing and model references</li>
            <li>Message history and search</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
