import axios from 'axios'

// ── Token helpers ─────────────────────────────────────────────────────────────
const USER_TOKEN_KEY  = 'conduvet_token'
const ADMIN_TOKEN_KEY = 'conduvet_admin_token'
const USER_ID_KEY     = 'conduvet_user_id'
const USER_NAME_KEY   = 'conduvet_user_name'
const TITLE_KEY       = 'conduvet_title'

// ── App title helpers ─────────────────────────────────────────────────────────
// These helpers centralise title reads/writes and fire a custom DOM event so
// same-tab components (e.g. the persistent Header) update immediately without
// relying on polling.

export function getAppTitle() {
  return localStorage.getItem(TITLE_KEY) || ''
}

export function setAppTitle(title) {
  localStorage.setItem(TITLE_KEY, title)
  // Notify same-tab listeners instantly
  window.dispatchEvent(
    new CustomEvent('conduvet:title', { detail: String(title) })
  )
}

export function getUserToken() {
  return localStorage.getItem(USER_TOKEN_KEY)
}
export function setUserToken(token) {
  localStorage.setItem(USER_TOKEN_KEY, token)
}
export function clearUserToken() {
  localStorage.removeItem(USER_TOKEN_KEY)
  localStorage.removeItem(USER_NAME_KEY)
  localStorage.removeItem(USER_ID_KEY)
}

export function getUserId() {
  return localStorage.getItem(USER_ID_KEY)
}
export function setUserId(id) {
  localStorage.setItem(USER_ID_KEY, id)
}

export function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || ''
}
export function setUserName(name) {
  localStorage.setItem(USER_NAME_KEY, name)
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}
export function setAdminToken(token) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}
export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

/** Clear every conduvet key from localStorage (used after a full reset). */
export function clearAllLocalStorage() {
  ;[USER_TOKEN_KEY, ADMIN_TOKEN_KEY, USER_ID_KEY, USER_NAME_KEY, TITLE_KEY].forEach(k =>
    localStorage.removeItem(k)
  )
}

// ── Axios instances ───────────────────────────────────────────────────────────

// User axios instance
const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = getUserToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearUserToken()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Admin axios instance
const adminApi = axios.create({ baseURL: '/api' })

adminApi.interceptors.request.use(config => {
  const token = getAdminToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApi.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearAdminToken()
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function checkConfigured() {
  const res = await axios.get('/api/admin/status')
  return res.data
}

export async function adminSetup(formData) {
  const res = await axios.post('/api/admin/setup', formData)
  return res.data
}

export async function adminLogin(username, password) {
  const form = new FormData()
  form.append('username', username)
  form.append('password', password)
  const res = await axios.post('/api/admin/login', form)
  return res.data
}

export async function userLogin(username, password) {
  const form = new FormData()
  form.append('username', username)
  form.append('password', password)
  const res = await axios.post('/api/auth/login', form)
  return res.data
}

export async function requestPIN(userid) {
  const res = await axios.post('/api/auth/request-pin', { userid })
  return res.data
}

export async function verifyPIN(userid, pinCode) {
  const res = await axios.post('/api/auth/verify-pin', { userid, pin_code: pinCode })
  return res.data
}

// ── Admin – Files ─────────────────────────────────────────────────────────────

export async function getAdminFiles() {
  const res = await adminApi.get('/admin/files')
  return res.data
}

export async function uploadFile(formData) {
  const res = await adminApi.post('/admin/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function deleteFile(fileId) {
  const res = await adminApi.delete(`/admin/files/${fileId}`)
  return res.data
}

export async function downloadFile(fileId) {
  const res = await adminApi.get(`/admin/files/${fileId}/download`, {
    responseType: 'blob',
  })
  return res.data
}

// ── Admin – Schema & Records ──────────────────────────────────────────────────

export async function getAdminSchema(fileId) {
  const res = await adminApi.get(`/admin/files/${fileId}/schema`)
  return res.data
}

export async function getAdminRecords(fileId) {
  const res = await adminApi.get(`/admin/files/${fileId}/records`)
  return res.data
}

export async function updateAdminRecords(fileId, records) {
  const res = await adminApi.put(`/admin/files/${fileId}/records`, records)
  return res.data
}

export async function getAdminFieldHistory(fileId, recordId, fieldName) {
  const res = await adminApi.get(
    `/admin/files/${fileId}/records/${recordId}/history/${fieldName}`
  )
  return res.data
}

// ── Admin – Config ────────────────────────────────────────────────────────────

export async function getAdminConfig() {
  const res = await adminApi.get('/admin/config')
  return res.data
}

export async function updateAdminConfigYaml(yamlFile) {
  const form = new FormData()
  form.append('yaml_file', yamlFile)
  const res = await adminApi.post('/admin/config/yaml', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function updateAdminConfigUsers(usersFile) {
  const form = new FormData()
  form.append('users_file', usersFile)
  const res = await adminApi.post('/admin/config/users', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function resetAllData() {
  const res = await adminApi.post('/admin/reset')
  return res.data
}

// ── Admin – Reports ───────────────────────────────────────────────────────────

export async function getReport(fileId, type) {
  const res = await adminApi.get(`/admin/reports/${fileId}/${type}`)
  return res.data
}

export async function downloadReport(fileId, type) {
  const res = await adminApi.get(`/admin/reports/${fileId}/${type}/download`, {
    responseType: 'blob',
  })
  return res.data
}

// ── User – Files & Records ────────────────────────────────────────────────────

export async function getUserFiles() {
  const res = await api.get('/files')
  return res.data
}

export async function getUserSchema(fileId) {
  const res = await api.get(`/files/${fileId}/schema`)
  return res.data
}

export async function getUserRecords(fileId) {
  const res = await api.get(`/files/${fileId}/records`)
  return res.data
}

export async function addNewRecord(fileId) {
  const res = await api.post(`/files/${fileId}/records/new`)
  return res.data
}

export async function submitRecords(fileId, records) {
  const res = await api.post(`/files/${fileId}/submit`, records)
  return res.data
}

export async function getFieldHistory(fileId, recordId, fieldName) {
  const res = await api.get(
    `/files/${fileId}/records/${recordId}/history/${fieldName}`
  )
  return res.data
}

// ---------------------------------------------------------------------------
// Record Locking API
// ---------------------------------------------------------------------------

export async function lockRecord(fileId, recordId) {
  const res = await api.post(`/files/${fileId}/records/${recordId}/lock`)
  return res.data
}

export async function unlockRecord(fileId, recordId) {
  const res = await api.post(`/files/${fileId}/records/${recordId}/unlock`)
  return res.data
}

export async function getFileLocks(fileId) {
  const res = await api.get(`/files/${fileId}/locks`)
  return res.data
}

export async function getAutoLogoutMinutes() {
  try {
    // Only attempt to fetch if user is logged in; avoid auth errors on login page
    const userToken = getUserToken()
    const adminToken = getAdminToken()
    if (!userToken && !adminToken) {
      return 30
    }

    // Use the appropriate API instance based on who's logged in
    const apiInstance = adminToken ? adminApi : api
    const res = await apiInstance.get('/admin/config')
    return res.data.auto_logout_minutes || 30
  } catch (err) {
    // Default to 30 minutes if config not available
    return 30
  }
}

export async function deleteRecord(fileId, recordId) {
  const res = await api.delete(`/files/${fileId}/records/${recordId}`)
  return res.data
}
