import React, { useEffect, useState } from 'react'
import { getReport, downloadReport } from '../api'

const REPORT_LABELS = {
  'by-user': 'By User',
  'by-record': 'By Record',
  untouched: 'Untouched Records',
}

export default function ReportViewer({ fileId, reportType }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!fileId || !reportType) return
    setLoading(true)
    setError(null)
    setData(null)

    getReport(fileId, reportType)
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load report')
        setLoading(false)
      })
  }, [fileId, reportType])

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await downloadReport(fileId, reportType)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${reportType}-${fileId}.xlsx`
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

      {/* Content */}
      {loading && <p className="text-gray-500">Loading report…</p>}
      {error && <p className="text-red-500">{error}</p>}

      {data && (
        <div className="overflow-auto flex-1">
          {data.rows?.length === 0 ? (
            <p className="text-gray-400 italic">No data in this report.</p>
          ) : (
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 sticky top-0">
                  {(data.columns || []).map((col, i) => (
                    <th
                      key={i}
                      className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((row, ri) => (
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
    </div>
  )
}
