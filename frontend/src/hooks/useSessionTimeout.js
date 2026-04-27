import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearUserToken, clearAdminToken, getUserToken, getAdminToken } from '../api'

/**
 * useSessionTimeout — auto-logout on inactivity.
 *
 * Monitors user activity (click, keypress, mousemove, scroll) and logs out
 * after the specified timeout period of inactivity.
 *
 * @param {number} timeoutMinutes - Inactivity timeout in minutes (default: 30)
 */
export function useSessionTimeout(timeoutMinutes = 30) {
  const navigate = useNavigate()

  useEffect(() => {
    // Only set up inactivity timer if user is logged in
    const userToken = getUserToken()
    const adminToken = getAdminToken()
    if (!userToken && !adminToken) {
      return // Don't set up listeners if no one is logged in
    }

    let inactivityTimer

    const resetInactivityTimer = () => {
      // clearTimeout is a no-op on undefined/null, so the guard is unnecessary
      clearTimeout(inactivityTimer)

      // Set new timer for logout
      inactivityTimer = setTimeout(() => {
        // Determine which token to clear based on what's available
        if (getAdminToken()) {
          clearAdminToken()
        } else if (getUserToken()) {
          clearUserToken()
        }
        navigate('/login')
      }, timeoutMinutes * 60 * 1000)
    }

    // Activity event listeners — reset timer on user interaction
    const activityEvents = ['click', 'keypress', 'mousemove', 'scroll']
    activityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer)
    })

    // Start initial timer
    resetInactivityTimer()

    // Cleanup
    return () => {
      clearTimeout(inactivityTimer)
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer)
      })
    }
  }, [timeoutMinutes, navigate])
}
