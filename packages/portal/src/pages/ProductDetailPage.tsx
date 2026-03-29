import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { savePendingPurchase } from '../lib/pendingPurchase';
import { formatPrice } from '@{{ORG_SCOPE}}/shared';
import type { ProductWithPlans } from '@{{ORG_SCOPE}}/shared';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isAuthenticated, login } = useAuth();
  const [product, setProduct] = useState<ProductWithPlans | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/api/products/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Product not found');
        return r.json();
      })
      .then(setProduct)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubscribe = (pricingPlanId: string) => {
    if (!product) return;

    // Save the purchase intent so the post-login flow can pick it up
    savePendingPurchase({
      productId: product.id,
      productSlug: product.slug,
      pricingPlanId,
    });

    if (!isAuthenticated) {
      // Trigger login — MSAL will redirect back, PostLoginRouter handles the rest
      login();
    } else {
      // Already authenticated — go straight to post-login router
      window.location.href = '/post-login';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading product...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Product not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav bar */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src="/assets/logo-black.png" alt="{{PROJECT_NAME}}" className="h-8" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/products" className="text-gray-700 hover:text-mojo">
              Products
            </Link>
            <Link to="/pricing" className="text-gray-700 hover:text-mojo">
              Pricing
            </Link>
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="rounded-full bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-dark"
              >
                Go to Portal
              </Link>
            ) : (
              <button
                onClick={() => login()}
                className="rounded-full bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-dark"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <Link to="/products" className="text-sm text-gray-500 hover:text-mojo">
          &larr; All Products
        </Link>

        <div className="mt-6 flex items-start gap-4">
          {product.logoUrl ? (
            <img
              src={product.logoUrl}
              alt={product.name}
              className="h-16 max-w-48 object-contain"
            />
          ) : product.iconUrl ? (
            <img src={product.iconUrl} alt={product.name} className="h-16 w-16" />
          ) : null}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
            <p className="mt-2 text-gray-600">{product.description}</p>
          </div>
        </div>

        {/* Features */}
        {product.features && product.features.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">Features</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {product.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 text-green-500">✓</span>
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pricing Plans */}
        {product.pricingPlans.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900">Choose a Plan</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {product.pricingPlans.map((plan) => (
                <div key={plan.id} className="rounded-lg border border-gray-200 bg-white p-6">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {formatPrice(plan.price, plan.currency)}
                    <span className="text-base font-normal text-gray-500">
                      /{plan.interval === 'month' ? 'mo' : 'yr'}
                    </span>
                    <span className="text-sm font-normal text-gray-400 ml-1">ex. GST</span>
                  </p>
                  {plan.features && (
                    <ul className="mt-4 space-y-2">
                      {(plan.features as string[]).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-green-500">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    className="mt-6 w-full rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark"
                  >
                    {isAuthenticated ? 'Subscribe' : 'Sign Up & Subscribe'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
