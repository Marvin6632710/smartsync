// @vitest-environment jsdom
/**
 * The two screens that explain the ranking describe the weights in force.
 *
 * Both used to print the shipped defaults. Moving a slider changed the list
 * on AI Picks and left the "what the ranking counts" panel contradicting it.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

describe('what the ranking counts', () => {
  // The section draws the shares as one strip and a ranked list. The
  // numbers are the ones weightShares gives, strongest first; the strip is
  // a picture of the same numbers, so its segments grow by the share.
  const mount = () =>
    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <Routes>
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/weights" element={<p>weights page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  const rows = () =>
    [...document.querySelectorAll('.how-list li')].map((li) => ({
      label: li.querySelector('.how-label').textContent,
      share: li.querySelector('.how-share').textContent,
      off: li.hasAttribute('data-off'),
    }))
  const segments = () =>
    [...document.querySelectorAll('.how-strip > span')].map((s) => s.style.flexGrow)

  test('lists the six signals with the shipped shares, strongest first', () => {
    app = {
      recommendations: [pick],
      loading: false,
      weights: recommendationWeights,
      directory: new Map(),
    }
    mount()
    expect(rows()).toEqual([
      { label: 'Matches your interests', share: '35%', off: false },
      { label: 'Close to you', share: '20%', off: false },
      { label: 'Fits your preferred time', share: '15%', off: false },
      { label: 'Like things you have joined', share: '15%', off: false },
      { label: 'Popular with others', share: '10%', off: false },
      { label: 'Similar people are going', share: '5%', off: false },
    ])
    expect(segments()).toEqual(['35', '20', '15', '15', '10', '5'])
    // The strip is decoration for the list, not a second source of truth.
    expect(document.querySelector('.how-strip').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('region', { name: 'What the ranking counts' })).toBeTruthy()
  })

  test('a signal at zero is listed as off and takes no room on the strip', () => {
    app = { recommendations: [pick], loading: false, weights: onlyInterest, directory: new Map() }
    mount()
    expect(rows()[0]).toEqual({ label: 'Matches your interests', share: '100%', off: false })
    expect(
      rows()
        .slice(1)
        .every((row) => row.share === '0%' && row.off),
    ).toBe(true)
    expect(segments()).toEqual(['100'])
  })

  test('"Change what matters" leads to the sliders', () => {
    app = {
      recommendations: [pick],
      loading: false,
      weights: recommendationWeights,
      directory: new Map(),
    }
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Change what matters' }))
    expect(screen.getByText('weights page')).toBeTruthy()
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
