import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function LandingPage() {
  const { isAuthenticated, login } = useAuth();

  return (
    <div className="min-h-screen bg-dark">
      {/* Hero with mountain background */}
      <header className="relative min-h-[80vh] flex flex-col">
        {/* Full-bleed mountain background */}
        <div className="absolute inset-0">
          <img src="/assets/hero-mountain.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-dark" />
        </div>

        {/* Nav */}
        <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <img src="/assets/logo-white-combo.png" alt="{{PROJECT_NAME}}" className="h-10" />
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="rounded-full bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal-dark"
              >
                Go to Portal
              </Link>
            ) : (
              <button
                onClick={login}
                className="rounded-full bg-teal px-5 py-2 text-sm font-medium text-white hover:bg-teal-dark"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Hero content */}
        <div className="relative mx-auto mt-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Your Customer Portal
            <br />
            <span className="text-mojo">for {{PROJECT_NAME}} Products</span>
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-gray-300">
            Manage your subscriptions, licences, environments, and support across all {{PROJECT_NAME}}
            products from a single portal.
          </p>
          <div className="mt-10 flex gap-4">
            <Link
              to="/products"
              className="rounded-full bg-mojo px-6 py-3 text-base font-semibold text-white shadow hover:bg-mojo-dark"
            >
              Browse Products
            </Link>
            {!isAuthenticated && (
              <button
                onClick={login}
                className="rounded-full border-2 border-white/40 px-6 py-3 text-base font-semibold text-white hover:border-white hover:bg-white/10"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h3 className="text-center text-3xl font-bold text-white">Customer Portal Features</h3>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            {
              title: 'Subscription Management',
              desc: 'Manage your subscriptions, view billing history, and update payment methods across all products.',
            },
            {
              title: 'Environment Activation',
              desc: 'Register your environments and generate activation codes for your licensed products.',
            },
            {
              title: 'Downloads & Updates',
              desc: 'Download the latest solutions, Power BI models, and user guides for your products.',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-gray-800 bg-dark-soft p-6">
              <div className="mb-3 h-1 w-8 rounded bg-mojo" />
              <h4 className="text-lg font-semibold text-white">{f.title}</h4>
              <p className="mt-2 text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-sm text-gray-500">
        <img src="/assets/logo-mark.png" alt="{{PROJECT_NAME}}" className="mx-auto mb-4 h-10 opacity-60" />©{' '}
        {new Date().getFullYear()} {{PROJECT_NAME}}. All rights reserved.
      </footer>
    </div>
  );
}
