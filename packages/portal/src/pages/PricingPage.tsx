import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice } from '@{{ORG_SCOPE}}/shared';
import type { ProductWithPlans } from '@{{ORG_SCOPE}}/shared';

export function PricingPage() {
  const [products, setProducts] = useState<ProductWithPlans[]>([]);
  const [loading, setLoading] = useState(true);

  const apiBase = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    fetch(`${apiBase}/api/products`)
      .then((r) => r.json())
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-center text-4xl font-bold text-gray-900">Pricing</h1>
        <p className="mt-4 text-center text-lg text-gray-600">
          Transparent pricing for all {{PROJECT_NAME}} products. Choose a product to see available plans.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
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
              <h3 className="text-2xl font-bold text-gray-900">{product.name}</h3>
              <p className="mt-2 text-sm text-gray-600 line-clamp-2">{product.description}</p>

              {product.pricingPlans.length > 0 && (
                <div className="mt-6 space-y-3">
                  {product.pricingPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-baseline justify-between border-b border-gray-100 pb-2"
                    >
                      <span className="text-sm text-gray-700">{plan.name}</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatPrice(plan.price, plan.currency)}/
                        {plan.interval === 'month' ? 'mo' : 'yr'}
                        <span className="text-xs font-normal text-gray-400 ml-1">ex. GST</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Link
                to={`/products/${product.slug}`}
                className="mt-6 block w-full rounded-lg bg-teal py-3 text-center text-sm font-semibold text-white hover:bg-teal-dark"
              >
                View Plans
              </Link>
            </div>
          ))}
        </div>

        {products.length === 0 && (
          <p className="mt-10 text-center text-gray-500">No products available yet.</p>
        )}
      </div>
    </div>
  );
}
