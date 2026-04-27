import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAdminFiles,
  uploadFile,
  deleteFile,
  downloadFile,
  getAdminConfig,
  updateAdminConfigYaml,
  updateAdminConfigUsers,
  setAppTitle,
  clearAdminToken,
} from '../api'
import ReportViewer from '../components/ReportViewer'
import { formatDate } from '../utils/schemaHelpers.jsx'

const TABS = ['Files', 'Reports', 'Configuration']

// ── File card ──────────────────────────────────────────────────────────────────
function FileCard({ file, onEdit, onDownload, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">
            {file.display_name || file.filename}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{file.filename}</p>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span>{file.record_count?.toLocaleString() ?? '?'} records</span>
            <span>Uploaded {formatDate(file.uploaded_at)}</span>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full shrink-0 ${
            file.is_active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {file.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onEdit(file)}
          className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg transition-colors"
        >
          View / Edit
        </button>
        <button
          onClick={() => onDownload(file)}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Download
        </button>
        {confirming ? (
          <div className="flex gap-1">
            <button
              onClick={() => onDelete(file)}
              className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ── Upload zone ────────────────────────────────────────────────────────────────
function UploadZone({ onUploaded }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const inputRef = useRef(null)

  async function doUpload(file) {
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await uploadFile(form)
      setUploadSuccess(`"${res.display_name}" uploaded successfully — ${res.record_count} record(s) imported.`)
      onUploaded()
    } catch (err) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setUploadError(detail)
      } else if (err.response?.status === 422) {
        setUploadError('The file could not be validated. Check that it is a valid .xlsx file with both a "Data" and a "Schema" sheet.')
      } else if (err.response?.status === 401) {
        setUploadError('Your admin session has expired. Please sign in again and retry the upload.')
      } else if (err.response?.status >= 500) {
        setUploadError(
          `The server encountered an error while processing the file (HTTP ${err.response.status}). ` +
          `This is likely a bug — check the backend logs for details. ` +
          `Common cause: date cells in the Excel file could not be stored. ` +
          `Try saving the file as a fresh .xlsx and re-uploading.`
        )
      } else if (!err.response) {
        setUploadError('Could not reach the server. Check that the backend is running and try again.')
      } else {
        setUploadError(`Upload failed (HTTP ${err.response.status}). Please check the file and try again.`)
      }
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) doUpload(file)
  }

  return (
    <div className="mb-6">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files[0]
            if (f) doUpload(f)
            e.target.value = ''
          }}
        />
        {uploading ? (
          <p className="text-gray-500">Uploading…</p>
        ) : (
          <>
            <svg className="mx-auto w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-sm text-gray-600 font-medium">Drop a file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Excel or CSV</p>
          </>
        )}
      </div>

      {uploadError && (
        <div className="mt-3 bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 text-sm">
          <p className="font-semibold mb-1">Upload failed</p>
          <p className="whitespace-pre-wrap">{uploadError}</p>
        </div>
      )}
      {uploadSuccess && (
        <div className="mt-3 bg-green-50 border border-green-300 text-green-700 rounded-lg p-3 text-sm">
          ✓ {uploadSuccess}
        </div>
      )}
    </div>
  )
}

// ── Files Tab ──────────────────────────────────────────────────────────────────
function FilesTab({ onEditFile }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  function loadFiles() {
    setLoading(true)
    setError(null)
    getAdminFiles()
      .then(data => { setFiles(data || []); setLoading(false) })
      .catch(err => {
        const detail = err.response?.data?.detail
        setError(typeof detail === 'string' ? detail : 'Could not load the file list. Check that the server is running and try refreshing.')
        setLoading(false)
      })
  }

  useEffect(() => { loadFiles() }, [])

  async function handleDownload(file) {
    setActionError(null)
    try {
      const blob = await downloadFile(file.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.filename || `file-${file.id}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const detail = err.response?.data?.detail
      setActionError(
        typeof detail === 'string'
          ? `Download failed: ${detail}`
          : `Download of "${file.display_name || file.filename}" failed. Please try again.`
      )
    }
  }

  async function handleDelete(file) {
    setActionError(null)
    try {
      await deleteFile(file.id)
      loadFiles()
    } catch (err) {
      const detail = err.response?.data?.detail
      setActionError(
        typeof detail === 'string'
          ? `Could not remove file: ${detail}`
          : `Could not remove "${file.display_name || file.filename}". Please try again.`
      )
    }
  }

  return (
    <div>
      <UploadZone onUploaded={loadFiles} />

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 text-sm flex items-start justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="shrink-0 text-red-400 hover:text-red-600 font-bold">✕</button>
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Loading files…</p>}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
      {!loading && !error && files.length === 0 && (
        <p className="text-gray-400 text-sm italic">No files uploaded yet. Use the area above to upload an Excel workbook.</p>
      )}
      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {files.map(f => (
            <FileCard
              key={f.id}
              file={f}
              onEdit={onEditFile}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Reports Tab ────────────────────────────────────────────────────────────────
function ReportsTab() {
  const [files, setFiles] = useState([])
  const [selectedFileId, setSelectedFileId] = useState('')
  const [reportType, setReportType] = useState(null)

  useEffect(() => {
    getAdminFiles()
      .then(data => { setFiles(data || []) })
      .catch(() => {})
  }, [])

  const REPORT_TYPES = [
    { key: 'by-user', label: 'By User' },
    { key: 'by-record', label: 'By Record' },
    { key: 'untouched', label: 'Untouched Records' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={selectedFileId}
          onChange={e => { setSelectedFileId(e.target.value); setReportType(null) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a file…</option>
          {files.map(f => (
            <option key={f.id} value={f.id}>
              {f.display_name || f.filename}
            </option>
          ))}
        </select>

        {selectedFileId && (
          <div className="flex gap-2">
            {REPORT_TYPES.map(rt => (
              <button
                key={rt.key}
                onClick={() => setReportType(rt.key)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  reportType === rt.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {rt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Report content */}
      {selectedFileId && reportType && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-auto max-h-[60vh]">
          <ReportViewer fileId={selectedFileId} reportType={reportType} />
        </div>
      )}

      {!selectedFileId && (
        <p className="text-gray-400 text-sm italic">Select a file to generate reports.</p>
      )}
      {selectedFileId && !reportType && (
        <p className="text-gray-400 text-sm italic">Choose a report type above.</p>
      )}
    </div>
  )
}

// ── Shared file-picker styles ──────────────────────────────────────────────────
const FILE_INPUT_CLS = `block w-full text-sm text-gray-600
  file:mr-3 file:py-1.5 file:px-3
  file:rounded-lg file:border-0
  file:text-sm file:font-medium
  file:bg-blue-50 file:text-blue-700
  hover:file:bg-blue-100
  border border-gray-300 rounded-lg cursor-pointer`

// ── Reusable status banner ─────────────────────────────────────────────────────
function StatusBanner({ msg, onDismiss }) {
  if (!msg) return null
  const isSuccess = msg.type === 'success'
  return (
    <div className={`flex items-start justify-between gap-2 rounded-lg p-3 text-sm ${
      isSuccess
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      <span className="whitespace-pre-wrap">{msg.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 opacity-50 hover:opacity-80 font-bold leading-none"
      >
        ✕
      </button>
    </div>
  )
}

// ── Configuration Tab ──────────────────────────────────────────────────────────
function ConfigurationTab() {
  const [config, setConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)

  // Separate state for each update card
  const [yamlFile, setYamlFile]       = useState(null)
  const [yamlSaving, setYamlSaving]   = useState(false)
  const [yamlMsg, setYamlMsg]         = useState(null)
  const [yamlKey, setYamlKey]         = useState(0)   // bumping resets the <input>

  const [usersFile, setUsersFile]     = useState(null)
  const [usersSaving, setUsersSaving] = useState(false)
  const [usersMsg, setUsersMsg]       = useState(null)
  const [usersKey, setUsersKey]       = useState(0)

  function loadConfig() {
    setConfigLoading(true)
    getAdminConfig()
      .then(data => { setConfig(data); setConfigLoading(false) })
      .catch(() => setConfigLoading(false))
  }

  useEffect(() => { loadConfig() }, [])

  // ── Update YAML ────────────────────────────────────────────────────────────
  async function handleYamlSubmit(e) {
    e.preventDefault()
    if (!yamlFile) {
      setYamlMsg({ type: 'error', text: 'Please select a configuration YAML file (.yaml or .yml).' })
      return
    }
    setYamlSaving(true)
    setYamlMsg(null)
    try {
      const res = await updateAdminConfigYaml(yamlFile)
      setYamlMsg({
        type: 'success',
        text: `Configuration updated — title: "${res.title}", admin account: "${res.admin_account}".`,
      })
      // Propagate the new title to the persistent header immediately
      setAppTitle(res.title)
      // Reset file picker so it is ready for another upload
      setYamlFile(null)
      setYamlKey(k => k + 1)
      // Reload the current-config display
      loadConfig()
    } catch (err) {
      const detail = err.response?.data?.detail
      setYamlMsg({
        type: 'error',
        text: typeof detail === 'string' ? detail : 'Failed to update configuration. Check the YAML file and try again.',
      })
    } finally {
      setYamlSaving(false)
    }
  }

  // ── Update Users ───────────────────────────────────────────────────────────
  async function handleUsersSubmit(e) {
    e.preventDefault()
    if (!usersFile) {
      setUsersMsg({ type: 'error', text: 'Please select a users CSV file (.csv).' })
      return
    }
    setUsersSaving(true)
    setUsersMsg(null)
    try {
      const res = await updateAdminConfigUsers(usersFile)
      setUsersMsg({
        type: 'success',
        text: `Users updated — ${res.user_count} user(s) loaded. All previous user accounts have been replaced.`,
      })
      // Reset file picker so it is ready for another upload
      setUsersFile(null)
      setUsersKey(k => k + 1)
    } catch (err) {
      const detail = err.response?.data?.detail
      setUsersMsg({
        type: 'error',
        text: typeof detail === 'string' ? detail : 'Failed to update users. Check the CSV file and try again.',
      })
    } finally {
      setUsersSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">

      {/* ── Current config display ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-3">Current Configuration</h3>
        {configLoading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : config ? (
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32 shrink-0">Title</dt>
              <dd className="text-gray-800 font-medium">{config.title || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32 shrink-0">Admin Account</dt>
              <dd className="text-gray-800 font-mono">{config.admin_account || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32 shrink-0">Backup Dir</dt>
              <dd className="text-gray-800 font-mono text-xs break-all">{config.backup_dir || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32 shrink-0">Auto-Logout</dt>
              <dd className="text-gray-800 font-medium">{config.auto_logout_minutes || 30} minute{config.auto_logout_minutes !== 1 ? 's' : ''}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-gray-400 text-sm">Could not load configuration.</p>
        )}
      </div>

      {/* ── Update YAML card ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-1">Update Configuration</h3>
        <p className="text-xs text-gray-400 mb-4">
          Replaces the application title and admin credentials. The YAML file must contain
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">title</code>,
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">admin_account</code>, and
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">admin_pass</code>.
          Optionally include
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">auto_logout_minutes</code>
          (1–480 min, default: 30) to set the inactivity timeout.
        </p>
        <form onSubmit={handleYamlSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Configuration YAML <span className="text-red-500">*</span>
            </label>
            <input
              key={yamlKey}
              type="file"
              accept=".yaml,.yml"
              onChange={e => setYamlFile(e.target.files[0] || null)}
              className={FILE_INPUT_CLS}
            />
            {yamlFile && (
              <p className="text-xs text-gray-400 mt-1">{yamlFile.name}</p>
            )}
          </div>
          <StatusBanner msg={yamlMsg} onDismiss={() => setYamlMsg(null)} />
          <button
            type="submit"
            disabled={yamlSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {yamlSaving ? 'Updating…' : 'Update Configuration'}
          </button>
        </form>
      </div>

      {/* ── Update Users card ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-1">Update Users</h3>
        <p className="text-xs text-gray-400 mb-4">
          Replaces <strong>all</strong> user accounts with the contents of the CSV file.
          The file must have columns:
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">userid</code>,
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">name</code>,
          <code className="mx-1 font-mono bg-gray-100 px-1 rounded">password</code>.
        </p>
        <form onSubmit={handleUsersSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Users CSV <span className="text-red-500">*</span>
            </label>
            <input
              key={usersKey}
              type="file"
              accept=".csv"
              onChange={e => setUsersFile(e.target.files[0] || null)}
              className={FILE_INPUT_CLS}
            />
            {usersFile && (
              <p className="text-xs text-gray-400 mt-1">{usersFile.name}</p>
            )}
          </div>
          <StatusBanner msg={usersMsg} onDismiss={() => setUsersMsg(null)} />
          <button
            type="submit"
            disabled={usersSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {usersSaving ? 'Updating…' : 'Update Users'}
          </button>
        </form>
      </div>

    </div>
  )
}

// ── Main AdminDashboard ────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Files')

  function handleLogout() {
    clearAdminToken()
    navigate('/admin/login')
  }

  function handleEditFile(file) {
    navigate(`/admin/data/${file.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sub-header */}
      <div className="bg-white border-b border-gray-200 px-6 py-0">
        <div className="flex items-center justify-between">
          <nav className="flex">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 py-3.5"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {activeTab === 'Files' && <FilesTab onEditFile={handleEditFile} />}
        {activeTab === 'Reports' && <ReportsTab />}
        {activeTab === 'Configuration' && <ConfigurationTab />}
      </div>
    </div>
  )
}
