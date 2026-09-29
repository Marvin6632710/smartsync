import React, { useId } from 'react'

import { formatNumber } from '../../i18n'

/**
 * The three shapes the console draws, and nothing else.
 *
 * Drawn in CSS rather than with a charting library: these are bars against a
 * baseline, the console already owns every colour they use, and a dependency
 * whose job is to draw a rectangle is a dependency that has to be updated for
 * the rest of the project's life.
 *
 * Three rules hold across all of them, and they are the reason this is a file
 * rather than three ad-hoc divs.
 *
 * **Every chart carries a table.** It is visually hidden, always present, and
 * holds the same numbers the bars encode. A value a reader can only get by
 * hovering is a value some readers cannot get at all — and it is also what
 * makes a screen reader's version of these pages worth reading.
 *
 * **Nothing is ever coloured alone.** A bar carries its value as text, or its
 * legend does. Colour ranks the segments; it never identifies them.
 *
 * **A gap is not a zero.** The feeds behind these are windows — the newest
 * three hundred log entries, the newest two hundred warnings — so a day before
 * the window opened is a day nothing is known about, which is not the same as
 * a day nothing happened on. Those days are drawn as absences and said so.
 */

/** Rounded to a whole number the eye can divide: 1, 2, 5, 10, 20, 50 … */
function niceCeiling(value) {
  if (value <= 5) return Math.max(1, value)
  const size = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * size
    if (candidate >= value) return candidate
  }
  return 10 * size
}

/**
 * Counts over time, one column per bucket.
 *
 * `points` are `{ key, label, full, value, known }`, oldest first — `label` is
 * what goes under the column and `full` is what the tooltip and the table say.
 * A single series, so one hue and no legend: the title names it.
 */
export function ColumnChart({ points, caption, emptyText, unknownText }) {
  const tableId = useId()
  const known = points.filter((p) => p.known)
  const top = niceCeiling(Math.max(1, ...known.map((p) => p.value)))
  const total = known.reduce((sum, p) => sum + p.value, 0)
  if (known.length === 0 || total === 0) {
    return <p className="con-chart-empty">{emptyText}</p>
  }
  // Which columns get a label underneath. All fourteen collide on a narrow
  // console, so it is the ends and the middle — the axis says where you are,
  // and the tooltip and the table say the rest.
  const marks = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  return (
    <figure className="con-chart" role="group">
      <div className="con-chart-plot" style={{ '--chart-top': top }}>
        <div className="con-chart-scale" aria-hidden="true">
          <span>{formatNumber(top)}</span>
          <span>0</span>
        </div>
        <ol className="con-columns">
          {points.map((point, index) => (
            <li
              key={point.key}
              className="con-column"
              data-known={point.known ? 'yes' : 'no'}
              data-marked={marks.has(index) ? 'yes' : 'no'}
            >
              <span
                className="con-column-track"
                tabIndex={0}
                // Hover and keyboard reach the same thing. The table below
                // carries it too, so this is never the only way to the number.
                aria-label={
                  point.known
                    ? `${point.full}: ${formatNumber(point.value)}`
                    : `${point.full}: ${unknownText}`
                }
              >
                <span
                  className="con-column-fill"
                  style={{ '--h': point.known ? `${(point.value / top) * 100}%` : '0%' }}
                />
                <span className="con-column-tip" aria-hidden="true">
                  {point.known
                    ? `${point.full} · ${formatNumber(point.value)}`
                    : `${point.full} · ${unknownText}`}
                </span>
              </span>
              <span className="con-column-label" aria-hidden="true">
                {point.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="sr-only" id={tableId}>
        {caption}
      </figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.full}</th>
              <td>{point.known ? formatNumber(point.value) : unknownText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/**
 * Magnitude across a handful of named things, biggest first.
 *
 * One series, so one hue for every bar: colouring each bar darker where it is
 * longer would spend the only free channel restating the length.
 */
export function BarList({ rows, caption, emptyText }) {
  const top = niceCeiling(Math.max(1, ...rows.map((r) => r.value)))
  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return <p className="con-chart-empty">{emptyText}</p>
  }
  return (
    <figure className="con-chart">
      <ol className="con-bars">
        {rows.map((row) => (
          <li className="con-bar-row" key={row.key}>
            <span className="con-bar-name">{row.label}</span>
            <span className="con-bar-track">
              <span className="con-bar-fill" style={{ '--w': `${(row.value / top) * 100}%` }} />
            </span>
            <span className="con-bar-value">{formatNumber(row.value)}</span>
          </li>
        ))}
      </ol>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{formatNumber(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/**
 * One whole, divided.
 *
 * The segments are ordered, so they are steps of one hue rather than separate
 * colours: light to dark, in the order given. The legend carries the name and
 * the number for each, because a segment too narrow to label is exactly the
 * segment a reader most needs told.
 *
 * A part that could not be counted makes the whole unknown — a bar drawn from
 * two of three numbers is a bar that lies about the third.
 */
export function SplitBar({ parts, caption, unknownText }) {
  const missing = parts.some((part) => part.value === null || part.value === undefined)
  const total = missing ? null : parts.reduce((sum, part) => sum + part.value, 0)
  if (missing || total === null) {
    return <p className="con-chart-empty">{unknownText}</p>
  }
  return (
    <figure className="con-chart con-split">
      <div className="con-split-bar" role="presentation">
        {total === 0 ? (
          <span className="con-split-empty" />
        ) : (
          parts.map(
            (part, index) =>
              part.value > 0 && (
                <span
                  key={part.key}
                  className="con-split-seg"
                  data-step={index + 1}
                  style={{ '--w': `${(part.value / total) * 100}%` }}
                />
              ),
          )
        )}
      </div>
      <ul className="con-split-keys">
        {parts.map((part, index) => (
          <li key={part.key}>
            <span className="con-split-dot" data-step={index + 1} aria-hidden="true" />
            <span className="con-split-name">{part.label}</span>
            <span className="con-split-value">{formatNumber(part.value)}</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {parts.map((part) => (
            <tr key={part.key}>
              <th scope="row">{part.label}</th>
              <td>{formatNumber(part.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
