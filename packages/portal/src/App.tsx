import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { msalInstance } from './auth/msalConfig';
import { OrgProvider } from './contexts/OrgContext';
import { AppLayout } from './layouts/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { LicencesPage } from './pages/LicencesPage';
import { SupportPage } from './pages/SupportPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { OrgSettingsPage } from './pages/OrgSettingsPage';
import { BillingPage } from './pages/BillingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminProductsPage } from './pages/admin/AdminProductsPage';
import { AdminOrganisationsPage } from './pages/admin/AdminOrganisationsPage';
import { AdminOrgDetailPage } from './pages/admin/AdminOrgDetailPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { PostLoginRouter } from './pages/PostLoginRouter';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <Navigate to="/" replace />
      </UnauthenticatedTemplate>
    </>
  );
}

export function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:slug" element={<ProductDetailPage />} />

          {/* Post-login redirect handler */}
          <Route
            path="/post-login"
            element={
              <ProtectedRoute>
                <OrgProvider>
                  <PostLoginRouter />
                </OrgProvider>
              </ProtectedRoute>
            }
          />

          {/* Authenticated routes */}
          <Route
            element={
              <ProtectedRoute>
                <OrgProvider>
                  <AppLayout />
                </OrgProvider>
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/licences" element={<LicencesPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/settings" element={<OrgSettingsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/organisations" element={<AdminOrganisationsPage />} />
            <Route path="/admin/organisations/:orgId" element={<AdminOrgDetailPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </MsalProvider>
  );
}
