import { saveActivityToFirebase, getFirebaseEnvironment } from './firebaseService'
import type { ActivityRecord } from '../types/ceremony'

async function saveActivityMock(record: ActivityRecord) {
  await new Promise((resolve) => window.setTimeout(resolve, 120))
  if (import.meta.env.DEV) console.info('[mock-activity] saved', record)
}

export async function saveActivityRecord(record: ActivityRecord, lineAccessToken?: string) {
  if (getFirebaseEnvironment()) {
    const saved = await saveActivityToFirebase(record, lineAccessToken)
    if (saved) return
  }
  await saveActivityMock(record)
}
