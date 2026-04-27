import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { checkConfigured, getUserToken, getAdminToken, getAppTitle, getAutoLogoutMinutes } from './api'
import { useSessionTimeout } from './hooks/useSessionTimeout'

import AdminSetup from './pages/AdminSetup'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import UserLogin from './pages/UserLogin'
import UserDashboard from './pages/UserDashboard'
import DataEntry from './pages/DataEntry'

const APP_VERSION = '0.1'
const GITHUB_URL  = 'https://github.com/conduvet/conduvet'

// ── Route guards ──────────────────────────────────────────────────────────────

function RequireUser({ children }) {
  const token = getUserToken()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const token = getAdminToken()
  if (!token) return <Navigate to="/admin/login" replace />
  return children
}

// ── Shared route list used by both Header and Footer ─────────────────────────
const AUTH_PATHS = ['/admin/setup', '/admin/login', '/login']

// ── Persistent header ─────────────────────────────────────────────────────────

function Header({ title }) {
  const location = useLocation()
  if (AUTH_PATHS.includes(location.pathname)) return null

  const displayTitle = title || 'ConduVet'

  return (
    <header className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between shrink-0 z-10">
      <Link to="/" className="font-bold text-lg tracking-wide hover:text-gray-200 transition-colors">
        {displayTitle}
      </Link>
      <Link
        to="/admin/login"
        className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        Admin
      </Link>
    </header>
  )
}

// ── Persistent footer ─────────────────────────────────────────────────────────
// Fixed at bottom-right; uses pointer-events-none on the wrapper so it never
// blocks clicks on content beneath it.

function Footer() {
  return (
    <div className="fixed bottom-0 right-0 p-2 pointer-events-none z-50">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        ConduVet v{APP_VERSION}
      </a>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [configured, setConfigured] = useState(null) // null = loading
  const [title, setTitle] = useState(getAppTitle)
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(30)

  useEffect(() => {
    checkConfigured()
      .then(data => setConfigured(data.configured))
      .catch(() => setConfigured(true)) // can't reach backend — don't block UI

    // Fetch auto-logout timeout from config
    getAutoLogoutMinutes()
      .then(mins => setAutoLogoutMinutes(mins))
      .catch(() => {}) // Use default if fetch fails
  }, [])

  // Listen for title changes fired by setAppTitle() in the same tab,
  // and for cross-tab changes via the standard storage event.
  useEffect(() => {
    function onTitleEvent(e) {
      setTitle(e.detail ?? getAppTitle())
    }
    function onStorage(e) {
      if (e.key === 'conduvet_title') setTitle(e.newValue || '')
    }
    window.addEventListener('conduvet:title', onTitleEvent)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('conduvet:title', onTitleEvent)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Auto-logout on inactivity
  useSessionTimeout(autoLogoutMinutes)

  // While checking configuration status, show a loading indicator
  if (configured === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title={title} />

      <main className="flex-1 min-h-0 overflow-hidden">
        <Routes>

          {/* ── Root redirect ── */}
          <Route
            path="/"
            element={
              !configured
                ? <Navigate to="/admin/setup" replace />
                : getUserToken()
                ? <Navigate to="/dashboard" replace />
                : <Navigate to="/login" replace />
            }
          />

          {/* ── Auth ── */}
          <Route path="/login" element={<UserLogin />} />
          <Route path="/dashboard" element={
            <RequireUser>
              <div className="h-full overflow-y-auto">
                <UserDashboard />
              </div>
            </RequireUser>
          } />

          {/* ── User data entry ── */}
          <Route path="/data/:fileId" element={
            <RequireUser>
              <DataEntry isAdmin={false} />
            </RequireUser>
          } />

          {/* ── Admin ── */}
          <Route path="/admin" element={
            getAdminToken()
              ? <Navigate to="/admin/dashboard" replace />
              : <Navigate to="/admin/login" replace />
          } />
          <Route path="/admin/setup" element={<AdminSetup />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={
            <RequireAdmin>
              <div className="h-full overflow-y-auto">
                <AdminDashboard />
              </div>
            </RequireAdmin>
          } />
          <Route path="/admin/data/:fileId" element={
            <RequireAdmin>
              <DataEntry isAdmin={true} />
            </RequireAdmin>
          } />

          {/* ── 404 fallback ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />
    </div>
  )
}
