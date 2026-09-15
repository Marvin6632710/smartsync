// @vitest-environment jsdom
/**
 * The two modal dialogs, and where focus goes while they are open.
 *
 * Both used to key their focus effect on the cancel/close callback. Every
 * caller passes an inline arrow, so the effect re-ran on each parent render —
 * and the prompt variant of ConfirmDialog re-renders its parent on every
 * keystroke. The cleanup handed focus to the button behind the dialog and the
 * new run moved it to Confirm: one character per click was all anybody could
 * type into a moderation reason. These pin the interaction, not the markup.
 */
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    submitReport: vi.fn(() => Promise.resolve(true)),
    blockPerson: vi.fn(() => Promise.resolve()),
    isBlocked: () => false,
    unsent: [],
    discardUnsent: vi.fn(),
  }),
}))

const { default: ConfirmDialog } = await import('../../src/components/ConfirmDialog')
const { default: ReportDialog } = await import('../../src/components/ReportDialog')

afterEach(cleanup)

/** The shape every moderation caller has: reason in the parent, inline arrows. */
function PromptHost({ onCancelSpy }) {
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <ConfirmDialog
        open={open}
        title="Warn this account?"
        body="body"
        promptLabel="What are you warning them about?"
        promptValue={reason}
        onPromptChange={setReason}
        onConfirm={() => {}}
        onCancel={() => {
          onCancelSpy?.(reason)
          setOpen(false)
        }}
      />
    </>
  )
}

const type = (input, text) => {
  let value = ''
  for (const char of text) {
    value += char
    fireEvent.change(input, { target: { value } })
  }
}

describe('ConfirmDialog', () => {
  test('several characters can be typed into the reason without losing focus', () => {
    render(<PromptHost />)
    fireEvent.click(screen.getByText('opener'))
    const input = screen.getByLabelText('What are you warning them about?')
    input.focus()

    type(input, 'Repeated safety reports')

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('Repeated safety reports')
    // Confirm only unlocks once there is a reason — that contract is unchanged.
    expect(screen.getByText('Confirm').disabled).toBe(false)
  })

  function PlainHost() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>opener</button>
        <ConfirmDialog
          open={open}
          title="Sign out?"
          body="body"
          onConfirm={() => {}}
          onCancel={() => setOpen(false)}
        />
      </>
    )
  }

  test('focus moves to Confirm on open and back to the opener on close', () => {
    render(<PlainHost />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByText('Confirm'))

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Confirm')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  test('with a prompt, focus lands in the prompt — Confirm is disabled until it is filled', () => {
    render(<PromptHost />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByLabelText('What are you warning them about?'))
    expect(screen.getByText('Confirm').disabled).toBe(true)

    fireEvent.click(screen.getByText('Cancel'))
    expect(document.activeElement).toBe(opener)
  })

  test('Escape calls the latest cancel handler, not the one from when it opened', () => {
    // The handler closes over `reason`, so a stale one would report the
    // reason as it was on open — empty. This is what the ref exists for.
    const spy = vi.fn()
    render(<PromptHost onCancelSpy={spy} />)
    fireEvent.click(screen.getByText('opener'))
    const input = screen.getByLabelText('What are you warning them about?')
    type(input, 'abc')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(spy).toHaveBeenCalledWith('abc')
    expect(screen.queryByText('Confirm')).toBeNull()
  })

  test('Tab is trapped inside the dialog in both directions', () => {
    render(<PromptHost />)
    fireEvent.click(screen.getByText('opener'))
    const input = screen.getByLabelText('What are you warning them about?')
    type(input, 'a reason')
    const cancel = screen.getByText('Cancel')
    const confirm = screen.getByText('Confirm')

    // The prompt is the first focusable, Confirm the last.
    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(input)

    input.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)

    // And Cancel is neither end, so Tab from it is left to the browser.
    cancel.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
  })
})

describe('ReportDialog', () => {
  function ReportHost() {
    // A parent that re-renders underneath the dialog, the way every real one
    // does whenever a Firestore snapshot lands or the minute clock ticks.
    const [tick, setTick] = useState(0)
    const [reporting, setReporting] = useState({
      type: 'user',
      id: 'bob',
      name: 'Bob',
      label: 'this person',
    })
    return (
      <>
        <button onClick={() => setTick(tick + 1)}>tick {tick}</button>
        <ReportDialog
          open={Boolean(reporting)}
          subject={reporting}
          onClose={() => setReporting(null)}
        />
      </>
    )
  }

  test('typing the detail survives the parent re-rendering', () => {
    render(<ReportHost />)
    const detail = screen.getByPlaceholderText('What happened, and when')
    detail.focus()
    type(detail, 'He kept')
    // A snapshot arrives mid-sentence.
    fireEvent.click(screen.getByText(/^tick/))
    type(detail, 'He kept messaging me')

    expect(document.activeElement).toBe(detail)
    expect(detail.value).toBe('He kept messaging me')
  })

  test('focus lands on the first reason when it opens, and Escape closes it', () => {
    render(<ReportHost />)
    expect(document.activeElement).toBe(screen.getByText('Harassment or abuse'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText(/Report this person/)).toBeNull()
  })
})
