import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import LandingPage from './pages/LandingPage.jsx'
import HRAuthPage from './pages/HRAuthPage.jsx'
import UserAuthPage from './pages/UserAuthPage.jsx'
import HRDashboard from './pages/HRDashboard.jsx'
import UserChat from './pages/UserChat.jsx'

function ProtectedRoute({ children, allowedRole }) {
  const { token, role } = useAuth()
  if (!token) return <Navigate to="/" replace />
  if (allowedRole && role !== allowedRole) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { token, role } = useAuth()

  return (
    <Routes>
      <Route
        path="/"
        element={
          token
            ? <Navigate to={role === 'HR' ? '/hr/dashboard' : '/chat'} replace />
            : <LandingPage />
        }
      />
      <Route path="/hr/login" element={<HRAuthPage />} />
      <Route path="/user/login" element={<UserAuthPage />} />
      <Route
        path="/hr/dashboard"
        element={
          <ProtectedRoute allowedRole="HR">
            <HRDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute allowedRole="USER">
            <UserChat />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
