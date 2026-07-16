import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AdminSurface, CeremonySurface } from './appSurfaces'
const isAdminSurface = window.location.pathname.startsWith('/admin') || window.location.hostname.startsWith('admin.')

if (isAdminSurface) document.documentElement.classList.add('is-admin-surface')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<main className="app-loading" aria-live="polite">กำลังเปิดระบบ</main>}>
      {isAdminSurface ? <AdminSurface /> : <CeremonySurface />}
    </Suspense>
  </StrictMode>,
)
