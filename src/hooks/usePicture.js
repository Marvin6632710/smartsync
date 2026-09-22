import { useCallback, useSyncExternalStore } from 'react'

// One listener for a picture even when several cards show the same person.
// Session + version keys prevent an old image flashing after account switches
// or replacements. Drop both the listener and bytes when the last view leaves.
const entries = new Map()

export function usePicture(viewer, kind, id, version) {
  const key = viewer && id && version ? JSON.stringify([viewer, kind, id, version]) : null
  const subscribe = useCallback(
    (notify) => {
      if (!key) return () => {}
      let entry = entries.get(key)
      if (!entry) {
        entry = { value: null, listeners: new Set(), stop: null }
        entries.set(key, entry)
        const deliver = (value) => {
          if (entries.get(key) !== entry) return
          entry.value = value
          entry.listeners.forEach((listener) => listener())
        }
        import('../firebase/pictures')
          .then(({ watchPicture }) => {
            if (entries.get(key) !== entry) return
            entry.stop = watchPicture(
              kind,
              id,
              (picture) =>
                deliver(
                  kind === 'chat'
                    ? picture?.dataUrl || null
                    : picture?.version === version
                      ? picture.dataUrl
                      : null,
                ),
              () => deliver(null),
            )
          })
          .catch(() => deliver(null))
      }
      entry.listeners.add(notify)
      return () => {
        entry.listeners.delete(notify)
        if (!entry.listeners.size) {
          entries.delete(key)
          entry.stop?.()
        }
      }
    },
    [key, kind, id, version],
  )
  const snapshot = useCallback(() => entries.get(key)?.value || null, [key])
  return useSyncExternalStore(subscribe, snapshot, () => null)
}
