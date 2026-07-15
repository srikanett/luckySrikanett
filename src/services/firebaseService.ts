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

/** Firebase SDK/Firestore write boundary. Keep this function as the only future integration point. */
export async function saveActivityToFirebase(record: ActivityRecord) {
  if (!getFirebaseEnvironment()) return false
  console.info('[firebase-ready] Connect Firestore adapter before enabling production writes.', record.id)
  return false
}
