import { useState, useEffect, useRef } from 'react'
import * as studentApi from '../../services/studentApi'

export default function PresentationsTab() {
  const [presentations, setPresentations] = useState<studentApi.Presentation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({ title: '', description: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPresentations()
  }, [])

  const loadPresentations = async () => {
    try {
      setLoading(true)
      const data = await studentApi.getPresentations()
      setPresentations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presentations')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      if (!formData.title) {
        const nameWithoutExt = file.name.replace(/\.(pptx?)$/i, '')
        setFormData(prev => ({ ...prev, title: nameWithoutExt }))
      }
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !formData.title.trim()) return

    try {
      setUploading(true)
      setError('')
      await studentApi.uploadPresentation(selectedFile, formData.title, formData.description)
      await loadPresentations()
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload presentation')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this presentation?')) return

    try {
      await studentApi.deletePresentation(id)
      await loadPresentations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete presentation')
    }
  }

  const closeModal = () => {
    setShowUploadModal(false)
    setSelectedFile(null)
    setFormData({ title: '', description: '' })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return <div className="text-gray-500">Loading presentations...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Presentations</h2>
          <p className="text-sm text-gray-500">Upload and manage PowerPoint files for your student presentation</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Upload Presentation
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {presentations.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No presentations uploaded yet. Upload a PowerPoint file to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {presentations.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">{item.title}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{item.fileName}</span>
                      <span>{formatFileSize(item.fileSize)}</span>
                      {item.slideCount != null && <span>{item.slideCount} slides</span>}
                      <span>Uploaded by {item.uploadedBy.firstName} on {formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={studentApi.getPresentationFileUrl(item.id)}
                    download={item.fileName}
                    className="text-blue-600 hover:text-blue-800 p-1"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-gray-400 hover:text-red-600 p-1"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Upload Presentation</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PowerPoint File</label>
                <input
                  type="file"
                  accept=".ppt,.pptx"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {selectedFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a descriptive title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Brief description or notes about this presentation"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile || !formData.title.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
