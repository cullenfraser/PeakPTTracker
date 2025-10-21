import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { Toaster } from './components/ui/toaster'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import CalculatorPage from './pages/CalculatorPage'
import ClientEntryPage from './pages/ClientEntryPage'
import ContractPage from './pages/ContractPage'
import ContractInvoicePage from './pages/ContractInvoicePage'
import ContractSchedulePage from './pages/ContractSchedulePage'
import HoursPage from './pages/HoursPage'
import ClientsPage from './pages/ClientsPage'
import CalendarPage from './pages/CalendarPage'
import AdminPage from './pages/AdminPage'
import NewAdminDashboard from './pages/NewAdminDashboard'
import DashboardPage from './pages/DashboardPage'
import ElevateLandingPage from './pages/ElevateLandingPage'
import ElevateWizardPage from './pages/ElevateWizardPage'
import ElevateReportPage from './pages/ElevateReportPage'
import ElevateScreenLandingPage from './pages/ElevateScreenLandingPage'
import PulseWizardPage from './pages/PulseWizardPage'
import ElevateMovementScreenPage from './pages/ElevateMovementScreenPage'
import ElevationMapPage from './pages/ElevationMapPage'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calculator"
            element={
              <ProtectedRoute>
                <CalculatorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contract/clients"
            element={
              <ProtectedRoute>
                <ClientEntryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contract/:contractId"
            element={
              <ProtectedRoute>
                <ContractPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contract/:contractId/invoice"
            element={
              <ProtectedRoute>
                <ContractInvoicePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contract/:contractId/schedule"
            element={
              <ProtectedRoute>
                <ContractSchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hours"
            element={
              <ProtectedRoute>
                <HoursPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <ClientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <NewAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/old"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate"
            element={
              <ProtectedRoute>
                <ElevateLandingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate/:clientId/new"
            element={
              <ProtectedRoute>
                <ElevateWizardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate/checkin"
            element={
              <ProtectedRoute>
                <PulseWizardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate/screen"
            element={
              <ProtectedRoute>
                <ElevateScreenLandingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate/:sessionId"
            element={
              <ProtectedRoute>
                <ElevateReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate/screen/:pattern"
            element={
              <ProtectedRoute>
                <ElevateMovementScreenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/elevate/map"
            element={
              <ProtectedRoute>
                <ElevationMapPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
      <Toaster />
    </AuthProvider>
  )
}

export default App
