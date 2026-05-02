import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AgGridReact } from '@ag-grid-community/react'
import { ModuleRegistry } from '@ag-grid-community/core'
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model'

import {
  getUserSchema,
  getUserRecords,
  addNewRecord,
  submitRecords,
  getAdminSchema,
  getAdminRecords,
  updateAdminRecords,
  getUserId,
  lockRecord,
  unlockRecord,
  getFileLocks,
  deleteRecord,
} from '../api'
import { parseDataType, validateCell, formatDate, formatDateTime, renderUrlsAsLinks, normalizeDateString, toBoolean } from '../utils/schemaHelpers.jsx'
import ContextPanel from '../components/ContextPanel'

ModuleRegistry.registerModules([ClientSideRowModelModule])

/**
 * Build AG Grid column definitions from schema.
 */
// System columns are managed explicitly in buildColumnDefs.
// They must be excluded from the schema-driven loop to prevent duplicates,
// because some workbooks include these fields in their Schema sheet as well.
const SYSTEM_FIELD_NAMES = new Set(['owner', 'vetter', 'record vetter', 'last updated', 'record status'])

// Lowercase names that identify the vetting-status field. Includes the
// current name ("vetted" — boolean) and legacy names ("vetting status",
// "record vetting status") so existing workbooks continue to work.
const VETTING_STATUS_FIELDS = new Set(['vetted', 'vetting status', 'record vetting status'])

/**
 * Build AG Grid column definitions from schema.
 *
 * @param {Array}  schema        - SchemaDefinition rows from the API
 * @param {boolean} isAdmin      - admin view bypasses per-row edit restrictions
 * @param {string}  currentUserId - uppercase userid of the logged-in user (user mode only)
 * @param {Function} onDeleteRecord - callback function(recordId) for delete button
 */
function buildColumnDefs(schema, isAdmin = false, currentUserId = '', onDeleteRecord = null) {
  // Resolve the canonical vetting-status field name from the schema once,
  // so per-cell handlers can read its value without repeatedly scanning row data.
  const vettingFieldDef = schema.find(f =>
    VETTING_STATUS_FIELDS.has(f.field_name.toLowerCase())
  )
  const vettingFieldName = vettingFieldDef?.field_name || null

  // Returns true when the row is "vetted-locked" for the current user —
  // i.e. they are the owner (not the vetter) and the vetter has marked Vetted = true.
  const isVettedLockedForCurrentUser = rowData => {
    if (isAdmin || !vettingFieldName) return false
    const isVetter = rowData?.vetter?.toUpperCase() === currentUserId
    if (isVetter) return false
    return toBoolean(rowData?.data?.[vettingFieldName])
  }
  // Cell renderer that makes URLs clickable
  const urlCellRenderer = (params) => {
    const value = params.value
    if (!value) return ''
    const rendered = renderUrlsAsLinks(String(value))
    // If renderUrlsAsLinks returns an array (URLs found), wrap in a div
    if (Array.isArray(rendered)) {
      return <div className="whitespace-normal break-words">{rendered}</div>
    }
    return value
  }

  const cols = []

  if (isAdmin) {
    cols.push({
      field: 'owner',
      headerName: 'Owner',
      editable: true,
      width: 120,
      pinned: 'left',
    })
  }

  for (const field of schema) {
    // Skip system columns — added explicitly below
    if (SYSTEM_FIELD_NAMES.has(field.field_name.toLowerCase())) continue
    const parsed = parseDataType(field.data_type)

    const isVettingStatusField =
      !isAdmin && VETTING_STATUS_FIELDS.has(field.field_name.toLowerCase())

    const col = {
      field: `data.${field.field_name}`,
      headerName: field.field_name,
      minWidth: 120,
      tooltipValueGetter: params => {
        const err = validateCell(params.value, field, params.data?.data)
        return err || ''
      },
      cellRenderer: urlCellRenderer,
    }

    if (isVettingStatusField) {
      // Only the assigned vetter for this record can edit the vetting status.
      col.editable = params => {
        if (params.data?.is_locked && params.data?.locked_by !== currentUserId) {
          return false  // Locked by another user
        }
        return params.data?.vetter?.toUpperCase() === currentUserId
      }
      col.cellStyle = params => {
        if (params.data?.is_locked && params.data?.locked_by !== currentUserId) {
          return { backgroundColor: '#f3f4f6', color: '#9ca3af', opacity: '0.6' }
        }
        const canEdit = params.data?.vetter?.toUpperCase() === currentUserId
        if (!canEdit) return { backgroundColor: '#f3f4f6', color: '#9ca3af' }
        const err = validateCell(params.value, field, params.data?.data)
        return err ? { backgroundColor: '#fee2e2', borderColor: '#fca5a5' } : {}
      }
    } else {
      col.editable = params => {
        // Disable editing if locked by another user (active-edit lock)
        if (params.data?.is_locked && params.data?.locked_by !== currentUserId) {
          return false
        }
        // Vetted-lock: owner cannot edit a record the vetter has marked vetted
        if (isVettedLockedForCurrentUser(params.data)) {
          return false
        }
        return true
      }
      col.cellStyle = params => {
        if (params.data?.is_locked && params.data?.locked_by !== currentUserId) {
          return { backgroundColor: '#f3f4f6', color: '#9ca3af', opacity: '0.6' }
        }
        if (isVettedLockedForCurrentUser(params.data)) {
          return { backgroundColor: '#f3f4f6', color: '#9ca3af' }
        }
        const err = validateCell(params.value, field, params.data?.data)
        return err ? { backgroundColor: '#fee2e2', borderColor: '#fca5a5' } : {}
      }
    }

    if (parsed.type === 'boolean') {
      // Capture the editability rule (set above for vetting / lock gates)
      // so the checkbox respects the same permissions.
      const editableRule = col.editable
      const isEditable = params =>
        typeof editableRule === 'function' ? editableRule(params) : editableRule !== false

      // Render as a true/false checkbox. Use a custom renderer so the cell
      // shows an actual checkbox rather than the string "true"/"false".
      col.cellRenderer = params => {
        const checked = toBoolean(params.value)
        const editable = isEditable(params)
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled={!editable}
            onChange={e => {
              // setDataValue triggers onCellValueChanged, which marks the row dirty.
              params.node.setDataValue(params.colDef.field, e.target.checked)
            }}
            style={{ cursor: editable ? 'pointer' : 'not-allowed' }}
          />
        )
      }
      // The custom renderer handles edits directly via setDataValue; suppress
      // AG Grid's default text editor (which would otherwise open on double-click).
      col.editable = false
      // Coerce any stored string ("true"/"false") to a real boolean for display.
      col.valueGetter = params => {
        const raw = params.data?.data?.[field.field_name]
        return toBoolean(raw)
      }
      col.valueSetter = params => {
        if (!params.data) return false
        if (!params.data.data) params.data.data = {}
        params.data.data[field.field_name] = toBoolean(params.newValue)
        return true
      }
    } else if (parsed.type === 'list') {
      col.cellEditor = 'agSelectCellEditor'
      col.cellEditorParams = { values: parsed.options || [] }
    } else if (parsed.type === 'multiple') {
      // Use text editor for multiple fields - user enters comma-separated values
      col.cellEditor = 'agTextCellEditor'
    } else if (parsed.type === 'number') {
      col.cellEditor = 'agNumberCellEditor'
      // Enforce min/max range validation on edit
      col.cellEditorValidator = params => {
        const num = Number(params.newValue)
        if (isNaN(num)) {
          return 'Must be a valid number'
        }
        if (parsed.min !== undefined && num < parsed.min) {
          return `Must be at least ${parsed.min}`
        }
        if (parsed.max !== undefined && num > parsed.max) {
          return `Must be at most ${parsed.max}`
        }
        return true
      }
    } else if (parsed.type === 'date') {
      col.cellEditor = 'agTextCellEditor'
      col.valueFormatter = params => formatDate(params.value)
    } else if (parsed.type === 'datetime') {
      col.cellEditor = 'agTextCellEditor'
      col.valueFormatter = params => formatDateTime(params.value)
    } else {
      col.cellEditor = 'agTextCellEditor'
      if (parsed.max_length) {
        col.cellEditorParams = { maxLength: parsed.max_length }
      }
    }

    cols.push(col)
  }

  // ── System columns (always read-only for users, always last) ──────────────

  // Vetter — who is assigned to vet this record (admin-only)
  if (isAdmin) {
    cols.push({
      field: 'vetter',
      headerName: 'Vetter',
      editable: true,
      width: 110,
      cellStyle: { color: '#6b7280' },
    })
  }

  // Record Status (system status: New / Updated / Old / Delete)
  cols.push({
    field: 'record_status',
    headerName: 'Record Status',
    editable: params => {
      // Admin can always edit
      if (isAdmin) return true
      // In user mode: owner cannot edit if vetted, but vetter can always edit
      const isOwner = params.data?.owner?.toUpperCase() === currentUserId
      const isVetter = params.data?.vetter?.toUpperCase() === currentUserId
      // Vetter can always edit
      if (isVetter) return true
      // Owner cannot edit if vetted (vetted-lock)
      if (isOwner && isVettedLockedForCurrentUser(params.data)) {
        return false
      }
      // Owner can edit (when not vetted), others cannot
      return isOwner
    },
    cellEditor: 'agSelectCellEditor',
    cellEditorParams: { values: ['Old', 'New', 'Updated', 'Delete'] },
    width: 120,
    cellStyle: params => {
      const isOwner = params.data?.owner?.toUpperCase() === currentUserId
      const isVetter = params.data?.vetter?.toUpperCase() === currentUserId
      // If not owner and not vetter and not admin, grey out
      if (!isOwner && !isVetter && !isAdmin) {
        return { backgroundColor: '#f3f4f6', color: '#9ca3af' }
      }
      // Check lock status
      if (params.data?.is_locked && params.data?.locked_by !== currentUserId) {
        return { backgroundColor: '#f3f4f6', color: '#9ca3af', opacity: '0.6' }
      }
      // Owner vetted-lock
      if (isOwner && isVettedLockedForCurrentUser(params.data)) {
        return { backgroundColor: '#f3f4f6', color: '#9ca3af' }
      }
      const s = params.value
      if (s === 'Old')      return { color: '#2c2c2c', fontWeight: '600' }
      if (s === 'New')      return { color: '#16a34a', fontWeight: '600' }
      if (s === 'Updated')  return { color: '#2563eb', fontWeight: '600' }
      if (s === 'Delete')   return { color: '#ff0000', fontWeight: '600' }
      return {}
    },
  })

  // Last Updated (always read-only — set by the server on submit)
  cols.push({
    field: 'last_updated',
    headerName: 'Last Updated',
    editable: false,
    width: 130,
    valueFormatter: params => formatDateTime(params.value),
  })

  // Delete button (vetter only — user mode only)
  if (!isAdmin && onDeleteRecord) {
    cols.push({
      field: 'delete',
      headerName: '',
      width: 50,
      editable: false,
      sortable: false,
      filter: false,
      pinned: 'right',
      cellRenderer: params => {
        const isVetter = params.data?.vetter?.toUpperCase() === currentUserId
        if (!isVetter) return null

        return (
          <button
            onClick={() => onDeleteRecord(params.data.id)}
            className="h-full w-full flex items-center justify-center text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            title="Delete record"
          >
            🗑️
          </button>
        )
      },
    })
  }

  return cols
}

export default function DataEntry({ isAdmin = false }) {
  const { fileId } = useParams()
  const navigate = useNavigate()

  // Current user's uppercase userid — used to enforce per-row edit restrictions.
  // Populated from localStorage after login; empty string if not found (safe fallback).
  const currentUserId = isAdmin ? '' : (getUserId() || '')

  const [schema, setSchema] = useState([])
  const [rowData, setRowData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState(null)
  const [serverFieldErrors, setServerFieldErrors] = useState({}) // { record_id: {field: msg} }
  const [addRecordError, setAddRecordError] = useState(null)
  const [displayName, setDisplayName] = useState('')

  // Track dirty rows by record id
  const dirtyIds = useRef(new Set())
  const gridRef = useRef(null)

  // Focused cell state for context panel
  const [focusedCell, setFocusedCell] = useState(null)

  // Record lock status — maps record ID to lock info
  const [recordLocks, setRecordLocks] = useState({})

  // Handle record deletion
  const handleDeleteRecord = useCallback(async (recordId) => {
    const record = rowData.find(r => r.id === recordId)
    if (!record) return

    const confirmDelete = window.confirm(
      `Are you sure you want to delete this record? This action cannot be undone.\n\nRecord ID: ${recordId}`
    )
    if (!confirmDelete) return

    try {
      await deleteRecord(fileId, recordId)
      // Remove the record from the grid
      setRowData(prev => prev.filter(r => r.id !== recordId))
      // Remove from locks if it was locked
      setRecordLocks(prev => {
        const updated = { ...prev }
        delete updated[recordId]
        return updated
      })
    } catch (err) {
      const detail = err.response?.data?.detail
      alert(
        typeof detail === 'string'
          ? `Failed to delete record: ${detail}`
          : 'Failed to delete record. You may only delete records assigned to you as a vetter.'
      )
    }
  }, [fileId, rowData])

  const columnDefs = useMemo(
    () => buildColumnDefs(schema, isAdmin, currentUserId, handleDeleteRecord),
    [schema, isAdmin, currentUserId, handleDeleteRecord],
  )

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
    filter: true,
    floatingFilter: false,
    tooltipShowDelay: 200,
  }), [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [schemaData, recordsData] = await Promise.all([
          isAdmin ? getAdminSchema(fileId) : getUserSchema(fileId),
          isAdmin ? getAdminRecords(fileId) : getUserRecords(fileId),
        ])

        // Handle new schema response format with display_name and fields
        const schemaFields = schemaData?.fields || schemaData || []
        const datasetName = schemaData?.display_name || ''

        setSchema(schemaFields)
        setDisplayName(datasetName)
        setRowData(recordsData || [])

        // Load lock status for all records
        try {
          const locks = await getFileLocks(fileId)
          const lockMap = {}
          locks.forEach(lock => {
            lockMap[lock.id] = lock
          })
          setRecordLocks(lockMap)
        } catch (err) {
          // Silently fail lock loading — it's informational
          console.error('Failed to load record locks:', err)
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [fileId, isAdmin])

  // Periodically refresh records and lock status to detect changes from other users
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      try {
        const freshRecords = await (isAdmin ? getAdminRecords(fileId) : getUserRecords(fileId))

        setRowData(prev => {
          // Update only unlocked and non-dirty records with fresh data
          // This preserves user's local changes while showing updates from others
          return prev.map(oldRecord => {
            // If user is actively editing this record (it's locked by them), don't update it
            if (oldRecord.id && dirtyIds.current.has(oldRecord.id)) {
              return oldRecord
            }

            // Find the fresh version of this record
            const freshRecord = freshRecords?.find(r => r.id === oldRecord.id)

            // If no fresh record found, keep the old one (it may have been deleted)
            if (!freshRecord) return oldRecord

            // Return the fresh record (will update the UI if data changed)
            return freshRecord
          })
        })
      } catch (err) {
        // Silently fail refresh — it's not critical
        console.error('Failed to refresh records:', err)
      }

      // Also refresh lock status so users see up-to-date lock info
      if (!isAdmin) {
        try {
          const locks = await getFileLocks(fileId)
          const lockMap = {}
          locks.forEach(lock => { lockMap[lock.id] = lock })
          setRecordLocks(lockMap)
        } catch (err) {
          // Silently fail — lock info is informational
        }
      }
    }, 10000) // Refresh every 10 seconds

    return () => clearInterval(refreshInterval)
  }, [fileId, isAdmin])


  // Mark a row dirty when edited
  const onCellValueChanged = useCallback(params => {
    if (params.data?.id) {
      dirtyIds.current.add(params.data.id)
    }
  }, [])

  // Track focused cell
  const onCellFocused = useCallback(params => {
    if (!params.column || !gridRef.current) return
    const colId = params.column.getColId()
    // Extract field name from colId like "data.field_name"
    const fieldMatch = colId.match(/^data\.(.+)$/)
    const fieldName = fieldMatch ? fieldMatch[1] : null

    // Get record id from row
    const rowNode = gridRef.current.api?.getDisplayedRowAtIndex(params.rowIndex)
    const recordId = rowNode?.data?.id ?? null

    setFocusedCell({ recordId, fieldName })
  }, [])

  // Lock record when user starts editing
  const onCellEditingStarted = useCallback(async params => {
    if (!params.data?.id || isAdmin) return

    try {
      await lockRecord(fileId, params.data.id)
      // Update local lock state
      setRecordLocks(prev => ({
        ...prev,
        [params.data.id]: {
          id: params.data.id,
          locked_by: currentUserId,
          locked_at: new Date().toISOString(),
        },
      }))
    } catch (err) {
      if (err.response?.status === 409) {
        // Another user has it locked
        const lockedBy = err.response.data.detail?.match(/locked by (\w+)/i)?.[1] || 'another user'
        alert(`This record is being edited by ${lockedBy}`)
        params.api.stopEditing(true)  // Cancel edit
      } else {
        console.error('Failed to lock record:', err)
      }
    }
  }, [fileId, currentUserId, isAdmin])

  // Add new record
  async function handleAddRecord() {
    setAddRecordError(null)
    try {
      const newRecord = await addNewRecord(fileId)
      // Default the vetting-status field for new records.
      if (!newRecord.data) newRecord.data = {}

      // Find the actual vetting status field name in the schema (case-insensitive match)
      const vettingStatusField = schema.find(
        f => VETTING_STATUS_FIELDS.has(f.field_name.toLowerCase())
      )

      if (vettingStatusField) {
        const parsed = parseDataType(vettingStatusField.data_type)
        // Boolean "Vetted" defaults to false; legacy list-based "Vetting Status" → "Unvetted".
        newRecord.data[vettingStatusField.field_name] =
          parsed.type === 'boolean' ? false : 'Unvetted'
      }

      setRowData(prev => [...prev, newRecord])
      dirtyIds.current.add(newRecord.id)
    } catch (err) {
      const detail = err.response?.data?.detail
      setAddRecordError(
        typeof detail === 'string'
          ? detail
          : 'Could not add a new record. Please try again or reload the page.'
      )
    }
  }

  // Submit (user flow) or save (admin flow)
  async function handleSubmit() {
    if (!gridRef.current?.api) return
    setSubmitting(true)
    setSubmitMsg(null)

    try {
      // Collect all rows (or only dirty rows for user submit)
      const allRows = []
      gridRef.current.api.forEachNode(node => {
        if (node.data) allRows.push(node.data)
      })

      const toSend = isAdmin
        ? allRows
        : allRows.filter(r => dirtyIds.current.has(r.id))

      if (toSend.length === 0 && !isAdmin) {
        setSubmitMsg({ type: 'info', text: 'No changes to submit.' })
        setSubmitting(false)
        return
      }

      const payload = toSend.map(r => {
        // Normalize date fields to ensure proper DD/MM/YYYY format
        const normalizedData = { ...r.data }
        for (const field of schema) {
          const parsed = parseDataType(field.data_type)
          if ((parsed.type === 'date' || parsed.type === 'datetime') && normalizedData[field.field_name]) {
            normalizedData[field.field_name] = normalizeDateString(normalizedData[field.field_name])
          }
        }

        const payloadItem = {
          id: r.id,
          owner: r.owner,
          record_status: r.record_status,
          data: normalizedData,
        }

        // For admin: include vetter field if present
        if (isAdmin && r.vetter !== undefined) {
          payloadItem.vetter = r.vetter
        }

        return payloadItem
      })

      setServerFieldErrors({})

      if (isAdmin) {
        await updateAdminRecords(fileId, payload)
        setSubmitMsg({ type: 'success', text: 'Records saved successfully.' })
        dirtyIds.current.clear()
        // Unlock records for admin
        for (const record of payload) {
          try {
            await unlockRecord(fileId, record.id)
          } catch (err) {
            console.error('Failed to unlock record:', err)
          }
        }
      } else {
        const result = await submitRecords(fileId, payload)
        setSubmitMsg({
          type: 'success',
          text: `Submitted successfully — ${result.saved ?? toSend.length} record(s) saved.`,
        })
        dirtyIds.current.clear()
        // Unlock records for user
        for (const record of payload) {
          try {
            await unlockRecord(fileId, record.id)
          } catch (err) {
            console.error('Failed to unlock record:', err)
          }
        }
        // Update lock status in UI
        setRecordLocks(prev => {
          const updated = { ...prev }
          payload.forEach(r => {
            delete updated[r.id]
          })
          return updated
        })
        setTimeout(() => navigate('/dashboard'), 1500)
      }
    } catch (err) {
      const detail = err.response?.data?.detail

      // Server-side validation errors come back as:
      // { message: "Validation failed", errors: { record_id: { field: "error msg" } } }
      if (detail && typeof detail === 'object' && detail.errors) {
        const errMap = detail.errors
        setServerFieldErrors(errMap)

        const recordCount  = Object.keys(errMap).length
        const fieldCount   = Object.values(errMap).reduce((n, fields) => n + Object.keys(fields).length, 0)
        const firstErrors  = Object.values(errMap)
          .flatMap(fields => Object.values(fields))
          .slice(0, 3)
        const preview = firstErrors.map(m => `• ${m}`).join('\n')

        setSubmitMsg({
          type: 'error',
          text:
            `${fieldCount} field error(s) in ${recordCount} record(s) must be fixed before saving. ` +
            `Invalid cells are highlighted in red — hover over them for details.\n${preview}` +
            (fieldCount > 3 ? `\n• …and ${fieldCount - 3} more.` : ''),
        })
      } else {
        setSubmitMsg({
          type: 'error',
          text:
            typeof detail === 'string'
              ? detail
              : 'Submission failed. Please review your data and try again.',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-lg">
        Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/dashboard')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <span className="text-gray-300">|</span>
          <h2 className="font-semibold text-gray-800 text-sm">
            {displayName || `File ${fileId}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && (
            <button
              onClick={handleAddRecord}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              + Add Record
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isAdmin ? 'Save All' : 'Submit'}
          </button>
        </div>
      </div>

      {/* Add-record error */}
      {addRecordError && (
        <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200 flex items-center justify-between shrink-0">
          <span>{addRecordError}</span>
          <button onClick={() => setAddRecordError(null)} className="ml-3 text-red-400 hover:text-red-600 font-bold">✕</button>
        </div>
      )}

      {/* Submit message */}
      {submitMsg && (
        <div
          className={`px-4 py-2 text-sm shrink-0 flex items-start justify-between gap-2 ${
            submitMsg.type === 'success'
              ? 'bg-green-50 text-green-700 border-b border-green-200'
              : submitMsg.type === 'error'
              ? 'bg-red-50 text-red-700 border-b border-red-200'
              : 'bg-blue-50 text-blue-700 border-b border-blue-200'
          }`}
        >
          <pre className="whitespace-pre-wrap font-sans">{submitMsg.text}</pre>
          <button
            onClick={() => { setSubmitMsg(null); setServerFieldErrors({}) }}
            className="shrink-0 text-current opacity-50 hover:opacity-80 font-bold leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* AG Grid — fills remaining vertical space between toolbar and context panel.
           The wrapper must have a concrete height; flex-1 + overflow-hidden achieves
           that when the parent is a flex column with h-full.
           AG Grid v32 also needs height:100% set directly on the component. */}
      <div className="ag-theme-alpine" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onCellValueChanged={onCellValueChanged}
          onCellFocused={onCellFocused}
          onCellEditingStarted={onCellEditingStarted}
          style={{ height: '100%', width: '100%' }}
          enableRangeSelection={false}
          stopEditingWhenCellsLoseFocus={true}
          tooltipInteraction={true}
          rowSelection="single"
          getRowId={params => String(params.data.id)}
        />
      </div>

      {/* Context Panel — fixed ~300px height */}
      <div className="shrink-0" style={{ height: '280px' }}>
        <ContextPanel
          fileId={fileId}
          focusedCell={focusedCell}
          schema={schema}
          isAdmin={isAdmin}
          recordLocks={recordLocks}
        />
      </div>
    </div>
  )
}
