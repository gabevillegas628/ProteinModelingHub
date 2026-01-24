interface Props {
  groupId: string
}

export default function DiscussionTab({ groupId: _groupId }: Props) {
  return (
    <div className="bg-white rounded-lg shadow p-8 text-center">
      <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <h3 className="text-lg font-medium text-gray-800 mb-2">Discussion Coming Soon</h3>
      <p className="text-gray-500 max-w-md mx-auto">
        This feature will allow instructors and students to have threaded discussions
        about the protein models, share insights, and collaborate on their research.
      </p>
      <div className="mt-6 p-4 bg-blue-50 rounded-lg max-w-md mx-auto">
        <p className="text-sm text-blue-700">
          <span className="font-medium">Planned features:</span>
          <br />
          • Threaded message discussions
          <br />
          • Reference specific submissions
          <br />
          • Mention other group members
          <br />
          • File attachments
        </p>
      </div>
    </div>
  )
}
