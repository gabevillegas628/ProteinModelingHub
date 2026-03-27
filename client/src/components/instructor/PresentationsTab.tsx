import { useState, useEffect, useMemo } from 'react'
import * as instructorApi from '../../services/instructorApi'

type SortCol = 'title' | 'group' | 'uploadedBy' | 'date' | 'size' | 'slides'
type SortDir = 'asc' | 'desc'

export default function InstructorPresentationsTab() {
  const [presentations, setPresentations] = useState<instructorApi.Presentation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPresentations()
  }, [])

  const loadPresentations = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await instructorApi.getAllPresentations()
      setPresentations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presentations')
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'date' ? 'desc' : 'asc')
    }
  }

  const filtered = useMemo(() => {
    let result = [...presentations]

    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter(p => new Date(p.createdAt) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(p => new Date(p.createdAt) <= to)
    }

    result.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'group':
          cmp = a.group.name.localeCompare(b.group.name)
          break
        case 'uploadedBy':
          cmp = `${a.uploadedBy.lastName} ${a.uploadedBy.firstName}`
            .localeCompare(`${b.uploadedBy.lastName} ${b.uploadedBy.firstName}`)
          break
        case 'date':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'size':
          cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0)
          break
        case 'slides':
          cmp = (a.slideCount ?? 0) - (b.slideCount ?? 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [presentations, sortCol, sortDir, dateFrom, dateTo])

  const allVisibleSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(p => next.add(p.id))
        return next
      })
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const downloadSelected = () => {
    const toDownload = filtered.filter(p => selected.has(p.id))
    toDownload.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = instructorApi.getPresentationFileUrl(p.id)
        a.download = p.fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, i * 300)
    })
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '—'
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

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) {
      return (
        <svg className="w-3 h-3 text-gray-300 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const ColHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className={`flex items-center text-xs font-medium uppercase tracking-wider hover:text-gray-800 transition-colors ${
        sortCol === col ? 'text-blue-600' : 'text-gray-500'
      }`}
    >
      {label}
      <SortIcon col={col} />
    </button>
  )

  if (loading) {
    return <div className="p-6 text-gray-500">Loading presentations...</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-md">
          {error}
          <button onClick={loadPresentations} className="ml-2 underline">Retry</button>
        </div>
      </div>
    )
  }

  const selectedCount = filtered.filter(p => selected.has(p.id)).length

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">All Presentations</h2>
        <p className="text-sm text-gray-500">
          {presentations.length} {presentations.length === 1 ? 'file' : 'files'} across all groups
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-end gap-4">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        )}

        <div className="flex-1" />

        {selectedCount > 0 && (
          <button
            onClick={downloadSelected}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download selected ({selectedCount})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {presentations.length === 0
            ? 'No presentations have been uploaded yet.'
            : 'No presentations match the selected date range.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_1fr_8rem_8rem_5rem_6rem_2.5rem] gap-4 px-4 py-3 bg-gray-50 border-b items-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <ColHeader col="title" label="Title" />
            <ColHeader col="group" label="Group" />
            <ColHeader col="uploadedBy" label="Uploaded by" />
            <ColHeader col="date" label="Date" />
            <ColHeader col="size" label="Size" />
            <ColHeader col="slides" label="Slides" />
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {filtered.map(item => (
              <div
                key={item.id}
                className={`grid grid-cols-[2rem_1fr_1fr_8rem_8rem_5rem_6rem_2.5rem] gap-4 px-4 py-3 items-center hover:bg-gray-50 transition-colors ${
                  selected.has(item.id) ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{item.title}</div>
                  {item.description && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">{item.description}</div>
                  )}
                  <div className="text-xs text-gray-400 truncate mt-0.5">{item.fileName}</div>
                </div>
                <div className="text-sm text-gray-600 truncate">{item.group.name}</div>
                <div className="text-sm text-gray-600 truncate">
                  {item.uploadedBy.firstName} {item.uploadedBy.lastName}
                </div>
                <div className="text-sm text-gray-600">{formatDate(item.createdAt)}</div>
                <div className="text-sm text-gray-500">{formatFileSize(item.fileSize)}</div>
                <div className="text-sm text-gray-500">
                  {item.slideCount != null ? item.slideCount : '—'}
                </div>
                <a
                  href={instructorApi.getPresentationFileUrl(item.id)}
                  download={item.fileName}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
