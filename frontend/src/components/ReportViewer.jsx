import React, { useEffect, useState, useMemo } from 'react'
import { getReport, downloadReport, getActiveUsersReport, downloadActiveUsersReport } from '../api'

const REPORT_LABELS = {
  'by-user': 'By User',
  'by-record': 'By Record',
  untouched: 'Untouched Records',
  'active-users': 'Currently Logged In Users',
}

export default function ReportViewer({ fileId, reportType, isSystemWide = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' or 'desc'

  useEffect(() => {
    if (!reportType || (!isSystemWide && !fileId)) return
    setLoading(true)
    setError(null)
    setData(null)
    setSearchTerm('')
    setSortColumn(null)
    setSortDirection('asc')

    const fetchReport = isSystemWide
      ? getActiveUsersReport
      : () => getReport(fileId, reportType)

    fetchReport()
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load report')
        setLoading(false)
      })
  }, [fileId, reportType, isSystemWide])

  // Handle column header click to sort
  const handleSort = (columnIndex) => {
    if (sortColumn === columnIndex) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new column and reset to ascending
      setSortColumn(columnIndex)
      setSortDirection('asc')
    }
  }

  // Filter and sort the data
  const processedData = useMemo(() => {
    if (!data?.rows) return { columns: data?.columns || [], rows: [] }

    let filtered = data.rows

    // Apply search filter across all columns
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = data.rows.filter(row =>
        row.some(cell => String(cell ?? '').toLowerCase().includes(searchLower))
      )
    }

    // Apply sorting
    if (sortColumn !== null) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn] ?? ''
        const bVal = b[sortColumn] ?? ''

        // Try to parse as numbers if both look like numbers
        const aNum = parseFloat(aVal)
        const bNum = parseFloat(bVal)

        if (!isNaN(aNum) && !isNaN(bNum)) {
          // Numeric sort
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
        }

        // String sort
        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()
        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr)
        } else {
          return bStr.localeCompare(aStr)
        }
      })
    }

    return { columns: data.columns || [], rows: filtered }
  }, [data, searchTerm, sortColumn, sortDirection])

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = isSystemWide
        ? await downloadActiveUsersReport()
        : await downloadReport(fileId, reportType)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = isSystemWide
        ? `report-${reportType}.xlsx`
        : `report-${reportType}-${fileId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Download failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">
          {REPORT_LABELS[reportType] || reportType}
        </h3>
        {data && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded disabled:opacity-50"
          >
            {downloading ? 'Downloading…' : 'Download Excel'}
          </button>
        )}
      </div>

      {/* Search Filter */}
      {data && data.rows?.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search all columns..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      )}

      {/* Content */}
      {loading && <p className="text-gray-500">Loading report…</p>}
      {error && <p className="text-red-500">{error}</p>}

      {data && (
        <div className="overflow-auto flex-1">
          {data.rows?.length === 0 ? (
            <p className="text-gray-400 italic">No data in this report.</p>
          ) : processedData.rows.length === 0 ? (
            <p className="text-gray-400 italic">No results match your search.</p>
          ) : (
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 sticky top-0">
                  {(processedData.columns || []).map((col, i) => (
                    <th
                      key={i}
                      onClick={() => handleSort(i)}
                      className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap cursor-pointer hover:bg-gray-200 transition-colors select-none"
                      title="Click to sort"
                    >
                      <div className="flex items-center gap-2">
                        {col}
                        {sortColumn === i && (
                          <span className="text-xs">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(processedData.rows || []).map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="border border-gray-200 px-3 py-1.5 text-gray-700 whitespace-nowrap"
                      >
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Results count */}
      {data && data.rows?.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          Showing {processedData.rows.length} of {data.rows.length} rows
          {searchTerm && ` (filtered by "${searchTerm}")`}
        </div>
      )}
    </div>
  )
}
