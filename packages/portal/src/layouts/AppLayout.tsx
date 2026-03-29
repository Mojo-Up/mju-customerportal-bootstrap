import { Outlet, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useOrg } from '../contexts/OrgContext';
import { useApi } from '../api/client';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { currentOrg, organisations, setCurrentOrg } = useOrg();
  const { apiFetch } = useApi();
  const [isStaff, setIsStaff] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ isStaff: boolean }>('/api/me')
      .then((me) => setIsStaff(me.isStaff))
      .catch(() => {});
  }, []);

  const navLinks = currentOrg ? (
    <>
      <Link
        to="/dashboard"
        className="text-gray-700 hover:text-mojo"
        onClick={() => setMobileMenuOpen(false)}
      >
        Dashboard
      </Link>
      <Link
        to="/products"
        className="text-gray-700 hover:text-mojo"
        onClick={() => setMobileMenuOpen(false)}
      >
        Products
      </Link>
      <Link
        to="/licences"
        className="text-gray-700 hover:text-mojo"
        onClick={() => setMobileMenuOpen(false)}
      >
        Licences
      </Link>
      <Link
        to="/support"
        className="text-gray-700 hover:text-mojo"
        onClick={() => setMobileMenuOpen(false)}
      >
        Support
      </Link>
      <Link
        to="/downloads"
        className="text-gray-700 hover:text-mojo"
        onClick={() => setMobileMenuOpen(false)}
      >
        Downloads
      </Link>
      <Link
        to="/settings"
        className="text-gray-700 hover:text-mojo"
        onClick={() => setMobileMenuOpen(false)}
      >
        Organisation
      </Link>
      {isStaff && (
        <Link
          to="/admin"
          className="text-teal hover:text-teal-dark font-medium"
          onClick={() => setMobileMenuOpen(false)}
        >
          Admin
        </Link>
      )}
    </>
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Left: logo + desktop nav */}
            <div className="flex items-center gap-6 min-w-0">
              <Link to="/" className="flex items-center shrink-0">
                <img src="/assets/logo-black.png" alt="{{PROJECT_NAME}}" className="h-8" />
              </Link>
              <div className="hidden lg:flex items-center gap-4 text-sm">{navLinks}</div>
            </div>

            {/* Right: org switcher, email, sign out, hamburger */}
            <div className="flex items-center gap-3 shrink-0">
              {organisations.length > 1 && (
                <select
                  value={currentOrg?.id || ''}
                  onChange={(e) => {
                    const org = organisations.find((o) => o.id === e.target.value);
                    if (org) setCurrentOrg(org);
                  }}
                  className="hidden sm:block rounded border border-gray-300 px-2 py-1 text-sm max-w-40"
                >
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}

              <span className="hidden md:inline text-sm text-gray-600 truncate max-w-48">
                {user?.email}
              </span>
              <button
                onClick={() => logout()}
                className="hidden sm:block shrink-0 rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                Sign Out
              </button>

              {/* Hamburger button — visible below lg */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden inline-flex items-center justify-center rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 space-y-1">
              <div className="flex flex-col gap-2 text-sm">{navLinks}</div>
              <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                {organisations.length > 1 && (
                  <select
                    value={currentOrg?.id || ''}
                    onChange={(e) => {
                      const org = organisations.find((o) => o.id === e.target.value);
                      if (org) setCurrentOrg(org);
                    }}
                    className="sm:hidden w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    {organisations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="text-sm text-gray-600">{user?.email}</div>
                <button
                  onClick={() => logout()}
                  className="w-full rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 text-left"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Page Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
