import type { ActivityRecord } from '../types/ceremony'

export interface FirebaseEnvironment {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

export function getFirebaseEnvironment(): FirebaseEnvironment | null {
  const environment = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }

  return Object.values(environment).every(Boolean) ? environment : null
}

interface RecordLuckyActivityResponse {
  activityId: string
}

/** Sends a completed ritual to the callable backend. LINE tokens never enter Firestore. */
export async function saveActivityToFirebase(record: ActivityRecord, lineAccessToken?: string) {
  if (!getFirebaseEnvironment()) return false

  const environment = getFirebaseEnvironment()
  if (!environment) return false

  const [{ getApp, getApps, initializeApp }, { getFunctions, httpsCallable }] = await Promise.all([
    import('firebase/app'),
    import('firebase/functions'),
  ])
  const app = getApps().length ? getApp() : initializeApp(environment)
  const functions = getFunctions(app, 'asia-southeast1')
  const recordActivity = httpsCallable<
    Pick<ActivityRecord, 'sessionId' | 'deity' | 'activity' | 'type' | 'result' | 'digitLength'> & { lineAccessToken?: string },
    RecordLuckyActivityResponse
  >(functions, 'recordLuckyActivity')

  await recordActivity({
    sessionId: record.sessionId,
    deity: record.deity,
    activity: record.activity,
    type: record.type,
    result: record.result,
    digitLength: record.digitLength,
    ...(lineAccessToken ? { lineAccessToken } : {}),
  })
  return true
}
