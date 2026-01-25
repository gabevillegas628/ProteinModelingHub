import { useState, useEffect } from 'react'
import * as instructorApi from '../../services/instructorApi'

interface Props {
  groupId: string
}

export default function LiteratureTab({ groupId }: Props) {
  const [literature, setLiterature] = useState<instructorApi.Literature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    setPreviewId(null)
    loadLiterature()
  }, [groupId])

  const loadLiterature = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await instructorApi.getGroupLiterature(groupId)
      setLiterature(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load literature')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return <div className="text-gray-500">Loading literature...</div>
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-md">
        {error}
        <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
      </div>
    )
  }

  if (literature.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p>No literature has been uploaded for this group yet.</p>
        <p className="text-sm mt-2">Students can upload relevant papers and resources.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Literature List */}
      <div className={`${previewId ? 'w-1/3' : 'w-full'} transition-all duration-300`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-800">
            Literature ({literature.length} {literature.length === 1 ? 'item' : 'items'})
          </h3>
        </div>

        <div className="space-y-3">
          {literature.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all ${
                previewId === item.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
              }`}
              onClick={() => setPreviewId(previewId === item.id ? null : item.id)}
            >
              <div className="flex items-start gap-4">
                {/* PDF Icon */}
                <div className="shrink-0 w-10 h-10 bg-red-100 rounded flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-800">{item.title}</h4>
                  {item.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{item.fileName}</span>
                    <span>{formatFileSize(item.fileSize)}</span>
                    <span>
                      Uploaded by {item.uploadedBy.firstName} {item.uploadedBy.lastName}
                    </span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PDF Preview */}
      {previewId && (
        <div className="w-2/3 bg-white rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              {literature.find(l => l.id === previewId)?.title}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={instructorApi.getLiteratureFileUrl(previewId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Open in new tab
              </a>
              <button
                onClick={() => setPreviewId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <iframe
            src={instructorApi.getLiteratureFileUrl(previewId)}
            className="w-full h-[calc(100vh-220px)]"
            title="PDF Preview"
          />
        </div>
      )}
    </div>
  )
}
