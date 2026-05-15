import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { userLogin, requestPIN, verifyPIN, setUserToken, setUserId, setUserName, getAppTitle } from '../api'

export default function UserLogin() {
  const navigate = useNavigate()

  // Step control: "user-id" (initial) | "pin" (PIN entry) | "password" (password auth)
  const [authStep, setAuthStep] = useState('user-id')
  const [userid, setUserid] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [resendTimer, setResendTimer] = useState(0)

  const title = getAppTitle()

  // Resend PIN timer
  useEffect(() => {
    let interval
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [resendTimer])

  async function handleRequestPIN(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await requestPIN(userid)
      setMaskedEmail(data.email)
      setAuthStep('pin')
      setResendTimer(30)
      setPin('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send PIN. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyPIN(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await verifyPIN(userid, pin)
      setUserToken(data.access_token)
      if (data.name) {
        setUserName(data.name)
      }
      if (data.userid) {
        setUserId(data.userid)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid PIN. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await userLogin(userid, password)
      setUserToken(data.access_token)
      if (data.name) {
        setUserName(data.name)
      }
      if (data.userid) {
        setUserId(data.userid)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendPIN(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await requestPIN(userid)
      setMaskedEmail(data.email)
      setResendTimer(30)
      setPin('')
      setError(null) // Clear any previous error
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend PIN. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleBackToUserID() {
    setAuthStep('user-id')
    setPin('')
    setPassword('')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            ConduVet{title ? `: ${title}` : ''}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {authStep === 'user-id' && 'Please sign in to continue'}
            {authStep === 'pin' && 'Enter your PIN'}
            {authStep === 'password' && 'Enter your password'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: User ID Entry */}
        {authStep === 'user-id' && (
          <form onSubmit={handleRequestPIN} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User ID
              </label>
              <input
                type="text"
                value={userid}
                onChange={e => setUserid(e.target.value.toUpperCase())}
                required
                autoComplete="username"
                placeholder="Enter your user ID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !userid.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending PIN…' : 'Login with PIN'}
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setAuthStep('password')
                setError(null)
              }}
              className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              Use Password
            </button>
          </form>
        )}

        {/* Step 2: PIN Entry */}
        {authStep === 'pin' && (
          <form onSubmit={handleVerifyPIN} className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-sm text-gray-600">
                PIN sent to <span className="font-semibold">{maskedEmail}</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter 5-digit PIN
              </label>
              <input
                type="text"
                value={pin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 5)
                  setPin(val)
                }}
                maxLength="5"
                required
                placeholder="00000"
                className="w-full text-center text-2xl tracking-widest border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || pin.length !== 5}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify PIN'}
            </button>

            <button
              type="button"
              onClick={handleResendPIN}
              disabled={loading || resendTimer > 0}
              className="w-full text-blue-600 hover:text-blue-700 font-medium text-sm py-2 disabled:opacity-50"
            >
              {resendTimer > 0 ? `Resend PIN (${resendTimer}s)` : 'Resend PIN'}
            </button>

            <button
              type="button"
              onClick={handleBackToUserID}
              className="w-full text-gray-600 hover:text-gray-700 font-medium text-sm py-2"
            >
              ← Back to User ID
            </button>
          </form>
        )}

        {/* Step 3: Password Login */}
        {authStep === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User ID
              </label>
              <input
                type="text"
                value={userid}
                onChange={e => setUserid(e.target.value)}
                required
                autoComplete="username"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthStep('user-id')
                setPassword('')
                setError(null)
              }}
              className="w-full text-gray-600 hover:text-gray-700 font-medium text-sm py-2"
            >
              ← Back to User ID
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/admin/login" className="text-xs text-gray-400 hover:text-gray-600">
            Admin login →
          </Link>
        </div>
      </div>
    </div>
  )
}
