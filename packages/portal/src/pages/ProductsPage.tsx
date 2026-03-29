import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { formatPrice } from '@{{ORG_SCOPE}}/shared';
import type { ProductWithPlans } from '@{{ORG_SCOPE}}/shared';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function ProductsPage() {
  const { isAuthenticated } = useAuth();
  const [products, setProducts] = useState<ProductWithPlans[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/products`)
      .then((r) => r.json())
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading products...</div>;
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
            <Link to="/products" className="text-gray-700 hover:text-mojo font-medium">
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
              <Link
                to="/pricing"
                className="rounded-full bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-dark"
              >
                Get Started
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <p className="mt-2 text-gray-600">Browse {{PROJECT_NAME}} products and their subscription plans.</p>

        <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.slug}`}
              className="rounded-lg border border-gray-200 bg-white p-6 transition hover:border-teal hover:shadow-md"
            >
              {product.logoUrl ? (
                <img
                  src={product.logoUrl}
                  alt={product.name}
                  className="mb-4 h-12 max-w-full object-contain"
                />
              ) : product.iconUrl ? (
                <img src={product.iconUrl} alt={product.name} className="mb-4 h-12 w-12" />
              ) : null}
              <h2 className="text-xl font-semibold text-gray-900">{product.name}</h2>
              <p className="mt-2 text-sm text-gray-600 line-clamp-3">{product.description}</p>
              {product.pricingPlans.length > 0 && (
                <p className="mt-4 text-sm font-medium text-teal">
                  From{' '}
                  {formatPrice(
                    Math.min(...product.pricingPlans.map((p) => p.price)),
                    product.pricingPlans[0].currency,
                  )}
                  /{product.pricingPlans[0].interval}
                  <span className="text-xs text-gray-400 ml-1">ex. GST</span>
                </p>
              )}
            </Link>
          ))}
        </div>

        {products.length === 0 && (
          <p className="mt-10 text-center text-gray-500">No products available.</p>
        )}
      </div>
    </div>
  );
}
