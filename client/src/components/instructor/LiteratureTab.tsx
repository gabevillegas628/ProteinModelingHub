import { useState, useEffect, useRef } from 'react'
import * as instructorApi from '../../services/instructorApi'

interface Props {
  groupId: string
}

export default function LiteratureTab({ groupId }: Props) {
  const [literature, setLiterature] = useState<instructorApi.Literature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadTitle.trim()) return

    try {
      setUploading(true)
      setUploadError('')
      const newItem = await instructorApi.uploadLiterature(
        groupId,
        uploadFile,
        uploadTitle.trim(),
        uploadDescription.trim() || undefined
      )
      setLiterature(prev => [newItem, ...prev])
      setShowUpload(false)
      setUploadTitle('')
      setUploadDescription('')
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this literature item?')) return
    try {
      setDeletingId(id)
      await instructorApi.deleteLiterature(id)
      setLiterature(prev => prev.filter(l => l.id !== id))
      if (previewId === id) setPreviewId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
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

  return (
    <div>
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Upload form */}
      {showUpload ? (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="text-base font-medium text-gray-800 mb-3">Upload Literature</h3>
          <form onSubmit={handleUpload} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paper title"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={uploadDescription}
                onChange={e => setUploadDescription(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PDF File *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600"
                required
              />
            </div>
            {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || !uploadFile || !uploadTitle.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                type="button"
                onClick={() => { setShowUpload(false); setUploadError('') }}
                className="px-4 py-2 border border-gray-300 text-sm rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-800">
            Literature ({literature.length} {literature.length === 1 ? 'item' : 'items'})
          </h3>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload
          </button>
        </div>
      )}

      {literature.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p>No literature has been uploaded for this group yet.</p>
        </div>
      ) : (
        <div className="flex gap-6 h-full">
          {/* Literature List */}
          <div className={`${previewId ? 'w-1/3' : 'w-full'} transition-all duration-300`}>
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

                    {/* Delete button */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(item.id) }}
                      disabled={deletingId === item.id}
                      className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
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
      )}
    </div>
  )
}
