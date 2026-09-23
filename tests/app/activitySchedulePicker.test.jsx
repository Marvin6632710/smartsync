// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ActivitySchedulePicker from '../../src/components/ActivitySchedulePicker'
import i18n from '../../src/i18n'

beforeEach(() => i18n.changeLanguage('en'))
afterEach(cleanup)

test('uses the in-app calendar and refuses dates before the supplied minimum', () => {
  const onDateChange = vi.fn()
  render(
    <ActivitySchedulePicker
      date="2030-05-10"
      time="19:00"
      minDate="2030-05-10"
      onDateChange={onDateChange}
      onTimeChange={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: /Change date/ }))
  expect(screen.getByRole('gridcell', { name: 'Thursday, 9 May 2030' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('gridcell', { name: 'Saturday, 11 May 2030' }))
  expect(onDateChange).toHaveBeenCalledWith('2030-05-11')
})

test('adjusts the alarm-style dial and offers useful time shortcuts', () => {
  const onTimeChange = vi.fn()
  render(
    <ActivitySchedulePicker
      date="2030-05-10"
      time="19:00"
      onDateChange={vi.fn()}
      onTimeChange={onTimeChange}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: /Change time/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Next hour' }))
  expect(onTimeChange).toHaveBeenLastCalledWith('20:00')

  fireEvent.click(screen.getByRole('button', { name: '9:00 · Morning' }))
  expect(onTimeChange).toHaveBeenLastCalledWith('09:00')
})
