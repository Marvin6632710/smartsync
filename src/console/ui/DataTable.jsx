import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The dense table every list in the console is drawn as.
 *
 * Rows are the unit: one is selected, which opens the details panel. The
 * keyboard works the way a queue expects — the arrow keys or j/k move
 * between rows, Enter opens one — so an admin can work down a queue
 * without reaching for the mouse. Sorting and filtering are the caller's:
 * this draws what it is given, in the order it is given.
 *
 * `columns`: [{ key, label, render(row), align, width, className }].
 * `tone(row)`: a word the stylesheet stripes the row with.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  selectedId = null,
  onSelect,
  tone,
  empty,
  loading = false,
  label,
  className = '',
  dense = true,
}) {
  const { t } = useTranslation()
  const bodyRef = useRef(null)

  const focusRow = (from, step) => {
    const trs = [...(bodyRef.current?.querySelectorAll('tr[data-row]') || [])]
    const index = trs.indexOf(from)
    const next = trs[index + step]
    next?.focus()
  }

  const onRowKeyDown = (event, row) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        event.preventDefault()
        focusRow(event.currentTarget, 1)
        break
      case 'ArrowUp':
      case 'k':
        event.preventDefault()
        focusRow(event.currentTarget, -1)
        break
      case 'Home':
        event.preventDefault()
        bodyRef.current?.querySelector('tr[data-row]')?.focus()
        break
      case 'End': {
        event.preventDefault()
        const trs = bodyRef.current?.querySelectorAll('tr[data-row]')
        trs?.[trs.length - 1]?.focus()
        break
      }
      case 'Enter':
        event.preventDefault()
        onSelect?.(row)
        break
      default:
    }
  }

  return (
    <div className={`con-table-wrap ${className}`}>
      <table className={`con-table ${dense ? 'dense' : ''}`} aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                className={`${column.align ? `align-${column.align}` : ''} ${column.className || ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((row) => {
            const id = rowKey(row)
            const selected = id === selectedId
            return (
              <tr
                key={id}
                data-row={id}
                data-tone={tone?.(row) || undefined}
                aria-selected={selected}
                className={selected ? 'selected' : ''}
                tabIndex={0}
                onClick={() => onSelect?.(row)}
                onKeyDown={(event) => onRowKeyDown(event, row)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${column.align ? `align-${column.align}` : ''} ${column.className || ''}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {loading && rows.length === 0 && (
        <p className="con-table-note" role="status">
          {t('common.loading')}
        </p>
      )}
      {!loading && rows.length === 0 && empty}
    </div>
  )
}
