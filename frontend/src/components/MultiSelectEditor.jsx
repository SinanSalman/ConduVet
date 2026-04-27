import React, { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react'

/**
 * Custom AG Grid v32 popup cell editor for Multiple(...) schema fields.
 *
 * Three specific problems solved here:
 *
 * 1. CHECKBOX CLICK BLOCKING
 *    Putting onMouseDown+preventDefault() on a container div blocks the browser
 *    from firing the subsequent `click` event on child elements — so native
 *    <input type="checkbox"> never toggles and onChange never fires.
 *    Fix: remove <input> entirely; use plain <div> rows driven by onMouseDown
 *    on each row individually. For plain divs, preventDefault() on mousedown
 *    suppresses the click event (preventing double-toggle) while still letting
 *    us call toggle() once, synchronously, before any focus change happens.
 *
 * 2. FOCUS / stopEditingWhenCellsLoseFocus RACE
 *    Each interactive element in the popup calls e.preventDefault() in its own
 *    onMouseDown. This prevents the browser from transferring focus away from
 *    the grid cell, so AG Grid's stopEditingWhenCellsLoseFocus never fires mid-
 *    interaction. <button> elements fire click even after mousedown is prevented,
 *    so Done/Clear still work via onClick.
 *
 * 3. setDataValue WITH DOT-PATH COLUMN ID
 *    Calling node.setDataValue('data.FieldName', v) relies on AG Grid resolving
 *    a dot-notation string as a column key — which can silently fail.
 *    Fix: pass the Column object directly from props so the lookup is exact.
 */
const MultiSelectEditor = forwardRef(function MultiSelectEditor(props, ref) {
  const { value, options, values, api, node, column, stopEditing, fieldName, colDef } = props
  const allOptions = options || values || []

  // Parse the current cell value (comma-separated string) into an array.
  const initial = value
    ? String(value).split(',').map(v => v.trim()).filter(Boolean)
    : []

  const [selected, setSelected] = useState(initial)

  // selectedRef is always current — getValue() reads this, not state.
  const selectedRef = useRef(initial)

  const containerRef = useRef(null)

  // Keep getValue() correct as a fallback in case AG Grid calls it.
  useImperativeHandle(ref, () => ({
    getValue: () => selectedRef.current.join(', '),
    isPopup:  () => true,
  }))

  function toggle(opt) {
    const next = selected.includes(opt)
      ? selected.filter(v => v !== opt)
      : [...selected, opt]
    selectedRef.current = next  // synchronous — always up to date for getValue()
    setSelected(next)
  }

  function commit() {
    // Format selected items as comma-separated text
    const newValue = selectedRef.current.length > 0
      ? selectedRef.current.join(', ')
      : ''

    if (node && newValue !== undefined) {
      const field = fieldName || colDef?.field

      if (field && field.includes('.')) {
        // Handle nested paths like "data.FieldName"
        const parts = field.split('.')
        const lastPart = parts[parts.length - 1]
        const parentPath = parts.slice(0, -1)

        // Create a deep copy of the data to avoid reference issues
        const updatedData = { ...node.data }
        let current = updatedData

        // Navigate/create the nested structure
        for (const part of parentPath) {
          if (!current[part]) {
            current[part] = {}
          }
          current[part] = { ...current[part] }
          current = current[part]
        }

        // Set the actual value
        current[lastPart] = newValue

        // Use applyTransaction to update with a new data object
        if (api) {
          api.applyTransaction({
            update: [updatedData]
          })
        } else if (column) {
          node.setDataValue(column, newValue)
        }
      } else if (column) {
        // Use Column object if available
        node.setDataValue(column, newValue)
      } else if (field) {
        // Simple field without nesting
        node.setDataValue(field, newValue)
      }
    }

    // Close the popup
    if (typeof stopEditing === 'function') {
      stopEditing()
    } else if (api?.stopEditing) {
      api.stopEditing()
    }
  }

  // Commit when the user clicks outside the popup.
  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        commit()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      // Prevent focus theft for clicks on non-interactive areas of the popup.
      onMouseDown={e => e.preventDefault()}
      className="bg-white border border-gray-300 shadow-lg rounded p-2 z-50 select-none"
      style={{ minWidth: '180px', maxHeight: '260px', display: 'flex', flexDirection: 'column' }}
    >
      {/* Option list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {allOptions.length === 0 && (
          <p className="text-gray-400 text-sm px-1 py-1">No options</p>
        )}
        {allOptions.map(opt => {
          const checked = selected.includes(opt)
          return (
            <div
              key={opt}
              // onMouseDown (not onClick) so toggle fires BEFORE any focus event.
              // preventDefault stops focus from moving AND stops the browser
              // from firing a subsequent click on this div (no double-toggle).
              onMouseDown={e => { e.preventDefault(); toggle(opt) }}
              className="flex items-center gap-2 px-1 py-1.5 hover:bg-gray-50 cursor-pointer rounded text-sm"
            >
              {/* Custom checkbox — avoids <input> click/focus quirks entirely */}
              <div
                className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                  checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 10 8" className="w-2.5 h-2" fill="none">
                    <path
                      d="M1 4l2.5 2.5L9 1"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span>{opt}</span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t mt-1 pt-1 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs text-gray-400">{selected.length} selected</span>
        <div className="flex gap-1">
          <button
            // preventDefault prevents focus theft; buttons still fire onClick.
            onMouseDown={e => e.preventDefault()}
            onClick={() => { selectedRef.current = []; setSelected([]) }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
          >
            Clear
          </button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={commit}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
})

export default MultiSelectEditor
