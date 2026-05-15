import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getFieldHistory, getAdminFieldHistory } from '../api'
import { formatDateTime, renderUrlsAsLinks } from '../utils/schemaHelpers.jsx'

/**
 * ContextPanel — shown below the AG Grid.
 * Left column: field description + sample data.
 * Right column: edit history for the focused cell.
 *
 * Font sizes are two Tailwind steps smaller than the app default:
 *   was text-sm  (14px) → now text-xs  (12px)
 *   was text-xs  (12px) → now text-[10px]
 */
export default function ContextPanel({ fileId, focusedCell, schema, isAdmin, recordLocks = {}, newRecordIds = new Set(), rowData = [] }) {
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)

  const fieldDef = focusedCell?.fieldName
    ? schema?.find(f => f.field_name === focusedCell.fieldName)
    : null

  // Check if the focused record is a new record
  const isNewRecord = focusedCell?.recordId ? newRecordIds.has(focusedCell.recordId) : false

  useEffect(() => {
    if (!focusedCell?.recordId || !focusedCell?.fieldName || !fileId) {
      setHistory([])
      return
    }

    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)

    const fetchFn = isAdmin ? getAdminFieldHistory : getFieldHistory

    fetchFn(fileId, focusedCell.recordId, focusedCell.fieldName)
      .then(data => {
        if (!cancelled) {
          setHistory(data || [])
          setHistoryLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setHistoryError(err.response?.data?.detail || 'Failed to load history')
          setHistoryLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [fileId, focusedCell?.recordId, focusedCell?.fieldName, isAdmin])

  return (
    <div className="flex h-full border-t border-gray-200 bg-gray-50">

      {/* ── Left: field info ─────────────────────────────────────────────── */}
      <div className="w-1/2 p-4 overflow-y-auto border-r border-gray-200">
        {fieldDef ? (
          <>
            {/* Field name + type — was text-sm / text-xs */}
            <h3 className="font-semibold text-gray-800 mb-1 text-xs">
              {fieldDef.field_name}
              <span className="ml-2 font-normal text-gray-500 text-[10px]">
                ({fieldDef.data_type})
              </span>
            </h3>

            {/* Description markdown — prose-sm uses text-sm; override to text-xs */}
            {fieldDef.description ? (
              <div className="prose max-w-none text-gray-700 mb-3 text-xs
                              [&_p]:my-0.5 [&_ul]:my-0.5 [&_li]:my-0
                              [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs
                              [&_code]:text-[10px]">
                <ReactMarkdown>{fieldDef.description}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-gray-400 text-xs mb-3 italic">No description</p>
            )}

            {/* Sample value — was text-sm / text-xs */}
            {fieldDef.sample_data !== undefined && fieldDef.sample_data !== null && (
              <div>
                <span className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">
                  Sample
                </span>
                <p className="text-gray-700 mt-0.5 font-mono bg-white border border-gray-200 rounded px-2 py-0.5 text-xs">
                  {String(fieldDef.sample_data)}
                </p>
              </div>
            )}

            {/* Depends-on hint — was text-xs */}
            {fieldDef.depends_on && (
              <p className="text-gray-400 mt-2 text-[10px]">
                Depends on: <span className="font-mono">{fieldDef.depends_on}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-400 text-xs italic">
            Click a cell to see field details
          </p>
        )}
      </div>

      {/* ── Right: edit history ───────────────────────────────────────────── */}
      <div className="w-1/2 p-4 overflow-y-auto">
        {/* Header — was text-sm */}
        <h3 className="font-semibold text-gray-800 mb-2 text-xs">Edit History</h3>

        {/* Lock status */}
        {focusedCell?.recordId && recordLocks[focusedCell.recordId]?.locked_by && (
          <div className="bg-red-50 border border-red-300 rounded p-2 mb-3">
            <p className="text-red-700 font-semibold text-xs">
              🔒 Locked by: {recordLocks[focusedCell.recordId].locked_by}
            </p>
            <p className="text-red-600 text-[10px]">
              Since: {formatDateTime(recordLocks[focusedCell.recordId].locked_at)}
            </p>
          </div>
        )}

        {/* Protection status */}
        {fieldDef?.is_protected && !isNewRecord && !isAdmin && (
          <div className="bg-amber-50 border border-amber-300 rounded p-2 mb-3">
            <p className="text-amber-700 font-semibold text-xs">
              🔒 Protected Field
            </p>
            <p className="text-amber-600 text-[10px]">
              This field is protected and cannot be edited on existing records.
            </p>
          </div>
        )}

        {!focusedCell?.recordId ? (
          <p className="text-gray-400 text-xs italic">Select a cell to view history</p>
        ) : historyLoading ? (
          <p className="text-gray-400 text-xs">Loading…</p>
        ) : historyError ? (
          <p className="text-red-500 text-xs">{historyError}</p>
        ) : history.length === 0 ? (
          <p className="text-gray-400 text-xs italic">No edit history for this field</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((entry, i) => (
              /* History cards — was text-xs; now text-[10px] */
              <div key={i} className="bg-white border border-gray-200 rounded px-2 py-1 text-[10px]">
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span className="font-medium text-gray-700">
                    {entry.changed_by_name || entry.changed_by}
                  </span>
                  <span>{formatDateTime(entry.changed_at)}</span>
                </div>
                <div className="flex items-start gap-1 text-gray-600 flex-wrap">
                  <span className="bg-red-50 text-red-700 px-1 rounded line-through inline-block">
                    {entry.old_value ? renderUrlsAsLinks(entry.old_value) : <em>empty</em>}
                  </span>
                  <span className="flex-shrink-0">→</span>
                  <span className="bg-green-50 text-green-700 px-1 rounded inline-block">
                    {entry.new_value ? renderUrlsAsLinks(entry.new_value) : <em>empty</em>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
