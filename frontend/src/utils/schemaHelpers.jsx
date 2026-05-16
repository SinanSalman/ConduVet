/**
 * Parse a backend data_type string into a structured descriptor.
 *
 * Supported formats (matching the backend schema_parser exactly):
 *   Text (n)                      → { type: 'text', max_length: n }
 *   Number (a,b)                  → { type: 'number', min: a, max: b }
 *   List (a,b,c,...)              → { type: 'list', options: [...] }
 *   Multiple (a,b,c,...)          → { type: 'multiple', options: [...] }
 *   Date (DD/MM/YYYY)             → { type: 'date', date_format: 'DD/MM/YYYY' }
 *   Date (DD/MM/YYYY HH:MM:SS)    → { type: 'datetime', date_format: 'DD/MM/YYYY HH:MM:SS' }
 *   Boolean / Bool                → { type: 'boolean' }
 */
export function parseDataType(dataType) {
  if (!dataType) return { type: 'text' }
  const raw = dataType.trim()

  // Date with custom format — match "Date ( ... )" with flexible format
  const dateMatch = raw.match(/^date\s*\(\s*(.+?)\s*\)$/i)
  if (dateMatch) {
    const formatStr = dateMatch[1].trim()
    const isDatetime = /\s/.test(formatStr) || /HH/i.test(formatStr)
    return {
      type: isDatetime ? 'datetime' : 'date',
      date_format: formatStr
    }
  }
  // Text (n)
  const textMatch = raw.match(/^text\s*\(\s*(\d+)\s*\)$/i)
  if (textMatch) {
    return { type: 'text', max_length: parseInt(textMatch[1], 10) }
  }
  // Number (a,b)
  const numMatch = raw.match(/^number\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i)
  if (numMatch) {
    return { type: 'number', min: parseFloat(numMatch[1]), max: parseFloat(numMatch[2]) }
  }
  // List (...)
  const listMatch = raw.match(/^list\s*\((.+)\)$/i)
  if (listMatch) {
    return { type: 'list', options: listMatch[1].split(',').map(s => s.trim()) }
  }
  // Multiple (...)
  const multiMatch = raw.match(/^multiple\s*\((.+)\)$/i)
  if (multiMatch) {
    return { type: 'multiple', options: multiMatch[1].split(',').map(s => s.trim()) }
  }
  // Plain keyword fallbacks
  const lower = raw.toLowerCase()
  if (lower === 'number' || lower === 'integer' || lower === 'float' || lower === 'int') {
    return { type: 'number' }
  }
  if (lower === 'date') return { type: 'date' }
  if (lower === 'boolean' || lower === 'bool') return { type: 'boolean' }

  return { type: 'text' }
}

/**
 * Parse a depends_on string into an array of condition objects.
 *
 * Backend format (one condition per line, or semicolon-separated):
 *   "FieldName = value"
 *   "FieldName = val1 or val2 or val3"
 *
 * Returns: [{ field: string, values: string[] }, ...]
 */
function parseDependsOn(dependsOn) {
  if (!dependsOn || !dependsOn.trim()) return []

  const conditions = []
  // Split on newlines or semicolons to get individual conditions
  const lines = dependsOn.split(/[\n;]+/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Each line: "FieldName = value1 or value2"
    const eqMatch = trimmed.match(/^(.+?)\s*=\s*(.+)$/)
    if (!eqMatch) continue
    const field = eqMatch[1].trim()
    const valStr = eqMatch[2].trim()
    // Values are separated by the word "or"
    const values = valStr.split(/\bor\b/i).map(v => v.trim()).filter(Boolean)
    if (field && values.length) {
      conditions.push({ field, values })
    }
  }
  return conditions
}

/**
 * Generate an example date string for the given format.
 * Used in validation error messages to show the expected format.
 */
function getExampleDate(formatStr) {
  if (!formatStr) return '1/1/2024'

  // Use example date: January 15, 2024
  const day = '15'
  const month = '01'
  const year = '2024'

  let example = formatStr
    .replace(/DD/gi, day)
    .replace(/MM/gi, month)
    .replace(/YYYY/gi, year)
    .replace(/YY/gi, '24')

  return example
}

/**
 * Generate an example datetime string for the given format.
 * Used in validation error messages to show the expected format.
 */
function getExampleDateTime(formatStr) {
  if (!formatStr) return '1/1/2024 14:30:00'

  // Use example datetime: January 15, 2024 14:30:45
  const day = '15'
  const month = '01'
  const year = '2024'
  const hours = '14'
  const mins = '30'
  const secs = '45'

  let example = formatStr
    .replace(/DD/gi, day)
    .replace(/MM/gi, month)
    .replace(/YYYY/gi, year)
    .replace(/YY/gi, '24')
    .replace(/HH/gi, hours)
    .replace(/SS/gi, secs)

  return example
}

/**
 * Validate a single cell value against its field definition.
 *
 * @param {*}      value    — current cell value
 * @param {object} fieldDef — schema field: { field_name, data_type, accept_null, depends_on, ... }
 * @param {object} rowData  — the full AG Grid row object (has a `data` sub-object for field values)
 * @returns {string|null} error message string, or null if valid
 */
export function validateCell(value, fieldDef, rowData) {
  const parsed = parseDataType(fieldDef.data_type)

  // --- depends_on check ---------------------------------------------------
  // If depends_on conditions are defined and none are satisfied, the field
  // is not applicable in this context — skip all validation.
  if (fieldDef.depends_on) {
    const conditions = parseDependsOn(fieldDef.depends_on)
    if (conditions.length > 0) {
      // The row's field values live in rowData.data (for nested grid rows)
      // or directly in rowData for flat objects
      const data = rowData?.data || rowData || {}
      const anyMet = conditions.some(({ field, values }) => {
        const fieldVal = String(data[field] ?? '').trim()
        return values.some(v => v.toLowerCase() === fieldVal.toLowerCase())
      })
      if (!anyMet) return null // field not yet applicable
    }
  }

  // --- Null / empty check -------------------------------------------------
  const isEmpty = value === null || value === undefined || String(value).trim() === ''

  if (!fieldDef.accept_null && isEmpty) {
    // If there's a depends_on condition, surface it so the user understands why
    if (fieldDef.depends_on) {
      const conds = parseDependsOn(fieldDef.depends_on)
      if (conds.length > 0) {
        const { field, values } = conds[0]
        const valLabel = values.join(' or ')
        return `"${fieldDef.field_name}" is required because "${field}" is set to "${valLabel}". Please fill in this field.`
      }
    }
    return `"${fieldDef.field_name}" is required and cannot be left blank.`
  }

  if (isEmpty) return null // null allowed and value is empty — OK

  // --- Type-specific validation -------------------------------------------

  if (parsed.type === 'number') {
    const num = Number(value)
    if (isNaN(num)) {
      return `"${fieldDef.field_name}" must be a number (e.g. 42 or 3.14). "${value}" is not a valid number — remove any letters, currency symbols, or commas.`
    }
    if (parsed.min !== undefined && parsed.max !== undefined && (num < parsed.min || num > parsed.max)) {
      return `"${fieldDef.field_name}" must be between ${fmtNum(parsed.min)} and ${fmtNum(parsed.max)} (got ${fmtNum(num)}).`
    }
    if (parsed.min !== undefined && num < parsed.min) {
      return `"${fieldDef.field_name}" must be at least ${fmtNum(parsed.min)} (got ${fmtNum(num)}).`
    }
    if (parsed.max !== undefined && num > parsed.max) {
      return `"${fieldDef.field_name}" must be at most ${fmtNum(parsed.max)} (got ${fmtNum(num)}).`
    }
  }

  if (parsed.type === 'list' && parsed.options) {
    const optionsLower = parsed.options.map(o => o.toLowerCase())
    if (!optionsLower.includes(String(value).toLowerCase())) {
      return `"${fieldDef.field_name}": "${value}" is not a valid choice. Select one of: ${parsed.options.join(', ')}.`
    }
  }

  if (parsed.type === 'multiple' && parsed.options) {
    const optionsLower = parsed.options.map(o => o.toLowerCase())
    const selected = String(value).split(',').map(v => v.trim()).filter(Boolean)
    const invalid = selected.filter(v => !optionsLower.includes(v.toLowerCase()))
    if (invalid.length > 0) {
      const bad = invalid.map(v => `"${v}"`).join(', ')
      return `"${fieldDef.field_name}": ${bad} ${invalid.length === 1 ? 'is' : 'are'} not a valid option. Allowed values: ${parsed.options.join(', ')}.`
    }
  }

  if (parsed.type === 'text' && parsed.max_length) {
    const len = String(value).length
    if (len > parsed.max_length) {
      const over = len - parsed.max_length
      return `"${fieldDef.field_name}" is ${len} characters long but the maximum is ${parsed.max_length}. Please shorten it by ${over} character(s).`
    }
  }

  if (parsed.type === 'date') {
    const str = String(value).trim()

    // If custom date_format is specified, use it for validation
    if (parsed.date_format) {
      // Build regex pattern from format string
      // Replace format tokens with regex patterns
      let pattern = parsed.date_format
        .replace(/DD/gi, '\\d{1,2}')
        .replace(/MM/gi, '\\d{1,2}')
        .replace(/YYYY/gi, '\\d{4}')
        .replace(/YY/gi, '\\d{2}')

      // Allow optional time component (stored dates might have 00:00:00 appended)
      const allowTimeRegex = new RegExp(`^${pattern}(\\s+\\d{2}:\\d{2}:\\d{2})?$`)

      // Also accept if it parses as a valid date
      if (!allowTimeRegex.test(str)) {
        // Try parsing to see if it's at least a valid date
        try {
          const d = new Date(str)
          if (isNaN(d.getTime())) {
            return `"${fieldDef.field_name}": "${value}" is not a valid date. Use ${parsed.date_format} format (e.g. ${getExampleDate(parsed.date_format)}).`
          }
        } catch {
          return `"${fieldDef.field_name}": "${value}" is not a valid date. Use ${parsed.date_format} format (e.g. ${getExampleDate(parsed.date_format)}).`
        }
      }
    } else {
      // Fallback to default formats if no custom format
      const ddmmyyyy = /^\d{1,2}\/\d{1,2}\/\d{4}(\s+\d{2}:\d{2}:\d{2})?$/.test(str)
      const yyyymmdd = /^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}:\d{2})?$/.test(str) && !isNaN(new Date(str).getTime())
      if (!ddmmyyyy && !yyyymmdd) {
        return `"${fieldDef.field_name}": "${value}" is not a valid date. Use DD/MM/YYYY format (e.g. 1/1/2024 or 31/12/2024).`
      }
    }
  }

  if (parsed.type === 'datetime') {
    const str = String(value).trim()

    // If custom date_format is specified, use it for validation
    if (parsed.date_format) {
      // Build regex pattern from format string
      let pattern = parsed.date_format
        .replace(/DD/gi, '\\d{1,2}')
        .replace(/MM/gi, '\\d{1,2}')
        .replace(/YYYY/gi, '\\d{4}')
        .replace(/YY/gi, '\\d{2}')
        .replace(/HH/gi, '\\d{2}')
        .replace(/SS/gi, '\\d{2}')

      const formatRegex = new RegExp(`^${pattern}$`)

      if (!formatRegex.test(str)) {
        // Try parsing to see if it's at least a valid datetime
        try {
          const d = new Date(str)
          if (isNaN(d.getTime())) {
            return `"${fieldDef.field_name}": "${value}" is not a valid date/time. Use ${parsed.date_format} format (e.g. ${getExampleDateTime(parsed.date_format)}).`
          }
        } catch {
          return `"${fieldDef.field_name}": "${value}" is not a valid date/time. Use ${parsed.date_format} format (e.g. ${getExampleDateTime(parsed.date_format)}).`
        }
      }
    } else {
      // Fallback to default formats if no custom format
      const ddmmFull = /^\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(str)
      const isoFull  = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str) && !isNaN(new Date(str).getTime())
      if (!ddmmFull && !isoFull) {
        return `"${fieldDef.field_name}": "${value}" is not a valid date/time. Use DD/MM/YYYY HH:MM:SS format (e.g. 1/1/2024 14:30:00).`
      }
    }
  }

  if (parsed.type === 'boolean') {
    if (typeof value === 'boolean') return null
    const s = String(value).trim().toLowerCase()
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(s)) {
      return `"${fieldDef.field_name}": "${value}" is not a valid boolean (use true or false).`
    }
  }

  return null
}

/**
 * Coerce any incoming value (boolean, string, number, null) into a true/false boolean.
 * Strings "true", "1", "yes" (case-insensitive) → true; everything else → false.
 */
export function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return false
  const s = String(value).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

/** Format a number for display: drop the decimal part if it's a whole number. */
function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(n)
}

/**
 * Normalize a date string to always use leading zeros (DD/MM/YYYY format).
 * Converts "1/1/2024" to "01/01/2024"
 * Converts "1/1/2024 14:30:00" to "01/01/2024 14:30:00"
 *
 * @param {string} dateStr - Date string to normalize
 * @returns {string} - Normalized date string
 */
export function normalizeDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr

  // Match DD/MM/YYYY HH:MM:SS format (with optional leading zeros)
  const datetimeMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s(\d{2}):(\d{2}):(\d{2})$/)
  if (datetimeMatch) {
    const [, day, month, year, hours, mins, secs] = datetimeMatch
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} ${hours}:${mins}:${secs}`
  }

  // Match DD/MM/YYYY format (with optional leading zeros)
  const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dateMatch) {
    const [, day, month, year] = dateMatch
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  }

  // Return as-is if it doesn't match our patterns
  return dateStr
}

/**
 * Format a date according to a custom format string.
 *
 * Format string uses: DD, MM, YYYY, HH, MM, SS (case-insensitive)
 * Separators: /, :, -, ., space
 *
 * Handles dates that may have time components even if format doesn't include them
 * (e.g., "01/06/2024 00:00:00" with format "DD/MM/YYYY" will display as "01/06/2024")
 *
 * @param {Date|string} value - Date object or ISO date string (may include time)
 * @param {string} formatStr - Format string (e.g., "DD/MM/YYYY", "YYYY-MM-DD HH:MM:SS")
 * @returns {string} - Formatted date string
 */
export function formatDateByFormat(value, formatStr) {
  if (!value || !formatStr) return String(value || '')

  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)

  // Extract components from date
  const day    = String(d.getDate()).padStart(2, '0')
  const month  = String(d.getMonth() + 1).padStart(2, '0')
  const year   = String(d.getFullYear())
  const hours  = String(d.getHours()).padStart(2, '0')
  const mins   = String(d.getMinutes()).padStart(2, '0')
  const secs   = String(d.getSeconds()).padStart(2, '0')

  // Map the format string tokens to date components
  // Process in order of longest to shortest to avoid partial replacements
  let result = formatStr

  // Case-insensitive replacements
  result = result.replace(/YYYY/gi, year)
  result = result.replace(/DD/gi, day)
  result = result.replace(/MM/gi, match => {
    // Check if this MM is part of HH:MM:SS (minutes) or DD/MM/YYYY (month)
    // Simple heuristic: if surrounded by colons or after HH, it's minutes
    const idx = result.indexOf(match)
    const before = result.substring(Math.max(0, idx - 3), idx).toUpperCase()
    const after = result.substring(idx + 2, Math.min(result.length, idx + 5)).toUpperCase()
    if (before.includes('HH') || after.includes('SS') || before.includes(':') || after.includes(':')) {
      return mins  // minutes
    }
    return month  // month
  })
  result = result.replace(/HH/gi, hours)
  result = result.replace(/SS/gi, secs)

  return result
}

/**
 * Format a date/datetime ISO string to DD/MM/YYYY for display.
 */
export function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

/**
 * Format a date/datetime ISO string to DD/MM/YYYY HH:MM for display.
 * Used wherever both date and time are meaningful (e.g. edit history).
 */
export function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  const day    = String(d.getDate()).padStart(2, '0')
  const month  = String(d.getMonth() + 1).padStart(2, '0')
  const hours  = String(d.getHours()).padStart(2, '0')
  const mins   = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()} ${hours}:${mins}`
}

/**
 * Render text with URLs as clickable links.
 * Detects multiple URL types:
 * - http://, https://, ftp://, and other protocols
 * - www. URLs (auto-prefixed with https://)
 * Returns an array of strings and React elements.
 *
 * @param {string} text - The text to process
 * @returns {string|array} - Original string if no URLs, or array of strings/elements if URLs found
 */
export function renderUrlsAsLinks(text) {
  if (!text || typeof text !== 'string') return text

  // Regex patterns for different URL types:
  // 1. URLs with explicit protocols (http, https, ftp, file, etc.)
  // 2. URLs starting with www. (no protocol)
  const urlWithProtocolRegex = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s<>"{}|\\^`\[\]]+)/g
  const wwwUrlRegex = /(www\.[^\s<>"{}|\\^`\[\]]+)/g

  const parts = []
  let lastIndex = 0

  // Helper function to add link
  const addLink = (url, displayUrl, href) => {
    parts.push(
      <a
        key={`url-${lastIndex}-${Math.random()}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 underline break-all"
        onClick={(e) => e.stopPropagation()}
        title={href}
      >
        {displayUrl}
      </a>
    )
  }

  // Helper function to process matches
  const processMatches = (regex) => {
    const matches = []
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push({ index: match.index, length: match[0].length, url: match[0] })
    }
    return matches
  }

  // Get all matches from both patterns
  const allMatches = [
    ...processMatches(urlWithProtocolRegex),
    ...processMatches(wwwUrlRegex),
  ]

  // Sort matches by index to process them in order
  allMatches.sort((a, b) => a.index - b.index)

  // Remove duplicate/overlapping matches
  const uniqueMatches = []
  for (const match of allMatches) {
    const overlaps = uniqueMatches.some(
      m => match.index < m.index + m.length && match.index + match.length > m.index
    )
    if (!overlaps) {
      uniqueMatches.push(match)
    }
  }

  // Build the parts array with text and links
  for (const match of uniqueMatches) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }

    // Add the URL as a clickable link
    const url = match.url
    const href = url.startsWith('www.') ? `https://${url}` : url
    addLink(url, url, href)

    lastIndex = match.index + match.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? parts : text
}
