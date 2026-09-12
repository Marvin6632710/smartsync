import React from 'react'
import { ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react'

/**
 * Who holds the moderator rank, and appointing somebody to it.
 *
 * Split out of ModerationPage. Admin-only, but it does not decide that: the
 * page above does, once, for every section — a guard reimplemented per screen
 * is a guard that will eventually disagree with itself.
 */
export default function ModeratorList({
  moderators,
  admins,
  appointable,
  personSearch,
  setPersonSearch,
  changingRole,
  suspendedIds,
  onChangeRole,
  nameFor,
}) {
  return (
    <>
      <section className="headline-block">
        <span className="eyebrow">Admin</span>
        <h2>Moderators</h2>
        <p className="helper-text">
          Who can work this queue. From the moment they are appointed they can take activities down
          and suspend ordinary users, and they are told so.
        </p>
      </section>

      <div className="stack list-stack">
        {moderators.map((account) => (
          <article className="report-card" key={account.uid}>
            <header>
              <span className="report-kind">
                <ShieldCheck size={13} /> moderator
              </span>
              {account.suspended && <span className="report-repeat">suspended</span>}
            </header>
            <h3>{nameFor(account.uid)}</h3>
            {account.suspended && (
              <p className="report-context">
                Suspended, so they hold the rank and use none of it. Lift it above to give the
                powers back.
              </p>
            )}
            <div className="report-actions">
              <button
                className="danger-button"
                disabled={changingRole === account.uid}
                onClick={() => onChangeRole({ uid: account.uid, role: 'user' })}
              >
                <UserRoundX size={15} />{' '}
                {changingRole === account.uid ? 'Dismissing…' : 'Dismiss as moderator'}
              </button>
            </div>
          </article>
        ))}

        {moderators.length === 0 && (
          <div className="empty-state">
            <ShieldCheck size={28} />
            <h3>No moderators yet</h3>
            <p>Every report is yours alone until you appoint somebody.</p>
          </div>
        )}

        <article className="report-card">
          <h3>Appoint someone</h3>
          <label className="report-detail">
            Search people by name
            <input
              value={personSearch}
              maxLength={60}
              placeholder="Start typing a name"
              onChange={(event) => setPersonSearch(event.target.value)}
            />
          </label>

          {!personSearch.trim() ? (
            <p className="report-meta">
              Type a name to find somebody. Current moderators and admins are not listed here.
            </p>
          ) : appointable.length === 0 ? (
            <p className="report-meta">
              Nobody else matches “{personSearch.trim()}”. Anyone already holding a rank is left out
              of this list.
            </p>
          ) : (
            appointable.map((person) => (
              <div className="report-actions appoint-row" key={person.uid}>
                <span>
                  {person.name}
                  {person.username ? ` · ${person.username}` : ''}
                  {/* A rank somebody cannot currently use is worth saying
                      out loud before it is handed to them, not after. */}
                  {suspendedIds.has(person.uid) && <em className="appoint-note"> · suspended</em>}
                </span>
                <button
                  className="secondary-button"
                  disabled={changingRole === person.uid}
                  onClick={() => onChangeRole({ uid: person.uid, role: 'moderator' })}
                >
                  <UserRoundCheck size={15} />{' '}
                  {changingRole === person.uid ? 'Appointing…' : 'Appoint'}
                </button>
              </div>
            ))
          )}
        </article>
      </div>

      <p className="helper-text">
        {admins.length === 1
          ? `Admin: ${nameFor(admins[0].uid)}.`
          : `Admins: ${admins.map((a) => nameFor(a.uid)).join(', ')}.`}{' '}
        That rank is granted in the Firebase console and nowhere else — there is no button for it
        here, on purpose.
      </p>
    </>
  )
}
