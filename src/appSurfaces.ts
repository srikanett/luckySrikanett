import { lazy } from 'react'

export const CeremonySurface = lazy(() => import('./App.tsx'))
export const AdminSurface = lazy(() => import('./admin/AdminApp.tsx'))
