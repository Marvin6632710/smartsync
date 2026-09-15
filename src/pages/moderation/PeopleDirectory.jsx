import React from 'react'
import { Eye, MessageSquareWarning, ShieldOff, UserRoundCheck, UserRoundX } from 'lucide-react'

/**
 * Everyone on SmartSync, with what each person has actually done attached.
 *
 * Split out of ModerationPage. This is the screen for looking without waiting
 * to be told — reports say where to look, this does not need them. Public
 * profile data only: the private half of a profile is readable by its owner
 * and by nobody else, an admin included.
 */
export default function PeopleDirectory({
  user,
  people,
  watched,
  watchSearch,
  setWatchSearch,
  suspending,
  recording,
  setSuspendTarget,
  setRecorded,
  setRecordedReason,
  searching = false,
  searchFailed = false,
  windowFull = false,
}) {
  return (
    <>
      <section className="headline-block">
        <span className="eyebrow">Oversight</span>
        <h2>Everyone on SmartSync</h2>
        <p className="helper-text">
          {people.length} {people.length === 1 ? 'account' : 'accounts'}
          {windowFull ? ' loaded' : ''}. Anyone suspended, or with something taken down, is listed
          first. You are seeing public profiles — emails, real names behind anonymous mode and
          stored locations are not readable by anybody but their owner.
        </p>
        {/* Past the window the list is partial, and silently partial is the
            worst kind. Say so, and say what still works. */}
        {windowFull && (
          <p className="form-error" role="status">
            The first {people.length} accounts are loaded. Anyone else can still be found by
            searching — the search also asks the server.
          </p>
        )}
      </section>

      <label className="report-detail watch-search">
        Search everyone
        <input
          value={watchSearch}
          maxLength={60}
          placeholder="Name or @username"
          onChange={(event) => setWatchSearch(event.target.value)}
        />
      </label>
      {searching && (
        <p className="helper-text" role="status">
          Searching everyone…
        </p>
      )}
      {searchFailed && (
        <p className="form-error" role="alert">
          The server could not be searched just now — only the accounts already loaded are shown.
        </p>
      )}

      <div className="stack list-stack">
        {watched.slice(0, 40).map((person) => {
          const isMe = person.uid === user.uid
          const cannotTouch =
            isMe || person.rank === 'admin' || (person.rank !== 'user' && !user.isAdmin)
          return (
            <article className="report-card" key={person.uid}>
              <header>
                <span className="report-kind">
                  <Eye size={13} /> {person.rank}
                </span>
                {person.closed && <span className="report-repeat">closed</span>}
                {person.suspended && !person.closed && (
                  <span className="report-repeat">suspended</span>
                )}
                {person.warnings > 0 && (
                  <span className="report-repeat">
                    {person.warnings} warning{person.warnings === 1 ? '' : 's'}
                  </span>
                )}
                {person.removedCount > 0 && (
                  <span className="report-repeat">{person.removedCount} taken down</span>
                )}
              </header>

              <h3>
                {person.name}
                {isMe ? ' (you)' : ''}
              </h3>
              <p className="report-context">
                {person.username ? `${person.username} · ` : ''}
                {person.inWindow
                  ? `hosts ${person.hosts}, joined ${person.joinedCount}`
                  : 'found by search — activity counts not loaded'}
                {person.anonymous ? ' · anonymous mode on' : ''}
              </p>
              {(person.interests || []).length > 0 && (
                <p className="report-meta">{(person.interests || []).join(' · ')}</p>
              )}

              <div className="report-actions">
                {!cannotTouch && !person.closed && (
                  <button
                    className="secondary-button"
                    disabled={recording === person.uid}
                    onClick={() => {
                      setRecordedReason('')
                      setRecorded({ uid: person.uid, kind: 'warn' })
                    }}
                  >
                    <MessageSquareWarning size={15} />{' '}
                    {recording === person.uid ? 'Working…' : 'Warn'}
                  </button>
                )}
                {!cannotTouch && !person.suspended && !person.closed && (
                  <button
                    className="danger-button"
                    disabled={suspending === person.uid}
                    onClick={() => setSuspendTarget({ uid: person.uid, suspend: true })}
                  >
                    <UserRoundX size={15} />{' '}
                    {suspending === person.uid ? 'Suspending…' : 'Suspend account'}
                  </button>
                )}
                {!cannotTouch && person.suspended && !person.closed && (
                  <button
                    className="secondary-button"
                    disabled={suspending === person.uid}
                    onClick={() => setSuspendTarget({ uid: person.uid, suspend: false })}
                  >
                    <UserRoundCheck size={15} />{' '}
                    {suspending === person.uid ? 'Lifting…' : 'Lift suspension'}
                  </button>
                )}
                {/* The end of the ladder, and an admin's alone. */}
                {!cannotTouch && user.isAdmin && !person.closed && (
                  <button
                    className="danger-button"
                    disabled={recording === person.uid}
                    onClick={() => {
                      setRecordedReason('')
                      setRecorded({ uid: person.uid, kind: 'close' })
                    }}
                  >
                    <ShieldOff size={15} /> Close account
                  </button>
                )}
                {!cannotTouch && user.isAdmin && person.closed && (
                  <button
                    className="secondary-button"
                    disabled={recording === person.uid}
                    onClick={() => {
                      setRecordedReason('')
                      setRecorded({ uid: person.uid, kind: 'reopen' })
                    }}
                  >
                    <UserRoundCheck size={15} /> Reopen account
                  </button>
                )}
                {cannotTouch && !isMe && (
                  <span className="report-meta">
                    {person.rank === 'admin'
                      ? 'An admin. No rank can act on this account from inside the app.'
                      : 'A moderator. Only an admin can act on this account.'}
                  </span>
                )}
              </div>
            </article>
          )
        })}

        {watched.length === 0 && (
          <div className="empty-state">
            <Eye size={28} />
            <h3>Nobody matches that</h3>
            <p>Try part of a name, or clear the search to see everyone.</p>
          </div>
        )}

        {watched.length > 40 && (
          <p className="helper-text">
            Showing the first 40 of {watched.length}. Search to narrow it down.
          </p>
        )}
      </div>
    </>
  )
}
