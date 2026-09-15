// @vitest-environment jsdom
/**
 * The two screens that explain the ranking describe the weights in force.
 *
 * Both used to print the shipped defaults. Moving a slider changed the list
 * on AI Picks and left the "what the ranking counts" panel contradicting it.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

let app = {}
vi.mock('../../src/context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', interests: ['Coffee'], name: 'Me' } }),
}))

const { default: RecommendationsPage } = await import('../../src/pages/RecommendationsPage')
const { default: RecommendationDetailsPage } =
  await import('../../src/pages/RecommendationDetailsPage')
const { weightShares, recommendationWeights } =
  await import('../../src/services/recommendationService')

afterEach(cleanup)

const pick = {
  id: 'a1',
  title: 'Flat white club',
  category: 'Coffee',
  status: 'active',
  matchScore: 71,
  reasons: ['Matches your Coffee interest'],
  participantUids: ['h'],
  participants: 1,
  capacity: 6,
  hostId: 'h',
}

// Only one signal counts. Shares: interest 100%, everything else 0%.
const onlyInterest = { interest: 50, distance: 0, time: 0, history: 0, popularity: 0, behavior: 0 }

describe('weightShares', () => {
  test('the defaults are their own shares', () => {
    expect(weightShares(recommendationWeights)).toEqual(recommendationWeights)
  })
  test('shares are of the total, not raw slider positions', () => {
    expect(weightShares({ ...recommendationWeights, interest: 50, distance: 50 })).toMatchObject({
      interest: 34,
      distance: 34,
    })
    expect(weightShares(onlyInterest)).toEqual({
      interest: 100,
      distance: 0,
      time: 0,
      history: 0,
      popularity: 0,
      behavior: 0,
    })
  })
  test('a broken stored value falls back rather than printing NaN', () => {
    const shares = weightShares({ interest: 'lots' })
    expect(Object.values(shares).every(Number.isFinite)).toBe(true)
  })
})

describe('AI Picks', () => {
  test('describes the ranking with the weights in force', () => {
    app = { recommendations: [pick], loading: false, weights: onlyInterest, directory: new Map() }
    render(
      <MemoryRouter>
        <RecommendationsPage />
      </MemoryRouter>,
    )
    const rows = screen.getAllByText(/%$/).map((el) => el.textContent)
    expect(rows).toContain('100%')
    expect(rows).not.toContain('35%')
    expect(rows).not.toContain('20%')
  })
})

describe('the score breakdown', () => {
  test('shows the same shares', () => {
    app = { activities: [pick], recommendations: [pick], weights: onlyInterest, loading: false }
    render(
      <MemoryRouter initialEntries={['/recommendations/a1']}>
        <Routes>
          <Route path="/recommendations/:id" element={<RecommendationDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const cells = screen.getAllByText(/^\d+%$/).map((el) => el.textContent)
    expect(cells).toContain('100%')
    expect(cells).not.toContain('35%')
  })
})
