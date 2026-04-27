import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUserFiles, clearUserToken } from '../api'

export default function UserDashboard() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const userName = localStorage.getItem('conduvet_user_name') || 'User'

  useEffect(() => {
    getUserFiles()
      .then(data => {
        setFiles(data || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load files')
        setLoading(false)
      })
  }, [])

  function handleLogout() {
    clearUserToken()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-10 px-4">
        {/* Greeting */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Welcome, {userName}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Select a dataset to work with
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* File list */}
        {loading && (
          <div className="text-center py-16 text-gray-400">Loading datasets…</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4">
            {error}
          </div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="text-center py-16 text-gray-400 italic">
            No datasets are currently available.
          </div>
        )}
        {!loading && !error && files.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {files.map(file => (
              <button
                key={file.id}
                onClick={() => navigate(`/data/${file.id}`)}
                className="bg-white rounded-xl shadow hover:shadow-md border border-gray-200 p-6 text-left transition-all hover:border-blue-300 group"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">
                    {file.display_name || file.filename}
                  </h3>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                {file.filename && file.display_name && (
                  <p className="text-xs text-gray-400 mt-1">{file.filename}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
