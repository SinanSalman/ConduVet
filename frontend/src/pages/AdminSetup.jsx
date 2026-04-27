import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSetup } from '../api'

export default function AdminSetup() {
  const navigate = useNavigate()
  const [yamlFile, setYamlFile] = useState(null)
  const [usersFile, setUsersFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!yamlFile && !usersFile) {
      setError('Please select both a configuration YAML file and a users CSV file before continuing.')
      return
    }
    if (!yamlFile) {
      setError('Please select a configuration YAML file (.yaml or .yml).')
      return
    }
    if (!usersFile) {
      setError('Please select a users CSV file (.csv).')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('yaml_file', yamlFile)
      form.append('users_file', usersFile)
      await adminSetup(form)
      navigate('/admin/login')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(
        typeof detail === 'string'
          ? detail
          : 'Setup failed. Check that your YAML file has the required keys (title, admin_account, admin_pass) and that your CSV has userid, name, and password columns.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">ConduVet</h1>
          <p className="text-gray-500 mt-2 text-sm">Initial Setup</p>
        </div>

        <p className="text-gray-600 text-sm mb-6">
          Welcome to ConduVet. Before you can use this application, please upload
          your configuration YAML file and initial users CSV file.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 mb-4 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Configuration YAML File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".yaml,.yml"
              onChange={e => setYamlFile(e.target.files[0] || null)}
              className="block w-full text-sm text-gray-600
                file:mr-3 file:py-2 file:px-3
                file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                border border-gray-300 rounded-lg cursor-pointer"
            />
            {yamlFile && (
              <p className="text-xs text-gray-500 mt-1">{yamlFile.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Users CSV File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={e => setUsersFile(e.target.files[0] || null)}
              className="block w-full text-sm text-gray-600
                file:mr-3 file:py-2 file:px-3
                file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                border border-gray-300 rounded-lg cursor-pointer"
            />
            {usersFile && (
              <p className="text-xs text-gray-500 mt-1">{usersFile.name}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting up…' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  )
}
