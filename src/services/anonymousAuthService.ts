import { getFirebaseEnvironment } from './firebaseService'

let authenticationPromise: Promise<string> | undefined

/** Creates a persistent, invisible Firebase identity. No login form is shown. */
export function initializeAnonymousUser() {
  authenticationPromise ??= (async () => {
    const environment = getFirebaseEnvironment()
    if (!environment) throw new Error('ระบบยังไม่ได้เชื่อมต่อ Firebase')

    const [{ getApp, getApps, initializeApp }, { browserLocalPersistence, getAuth, setPersistence, signInAnonymously }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ])
    const app = getApps().length ? getApp() : initializeApp(environment)
    const auth = getAuth(app)
    await setPersistence(auth, browserLocalPersistence)
    if (auth.currentUser) return auth.currentUser.uid
    return (await signInAnonymously(auth)).user.uid
  })()

  return authenticationPromise
}
