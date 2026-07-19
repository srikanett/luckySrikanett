const SESSION_KEY = 'sri-ganesh-session-id'

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getSessionId() {
  try {
    const current = window.localStorage.getItem(SESSION_KEY)
    if (current) return current
    const next = createId()
    window.localStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return createId()
  }
}
