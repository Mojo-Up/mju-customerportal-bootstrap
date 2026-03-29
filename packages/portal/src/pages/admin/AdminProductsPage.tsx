import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/client';
import { formatPrice } from '@{{ORG_SCOPE}}/shared';

interface PricingPlan {
  id: string;
  name: string;
  stripePriceId: string;
  interval: string;
  price: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
}

interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  logoUrl: string | null;
  isActive: boolean;
  features: string[];
  sortOrder: number;
  pricingPlans: PricingPlan[];
  _count: { subscriptions: number; licences: number; downloads: number };
}

export function AdminProductsPage() {
  const { apiFetch } = useApi();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formLogo, setFormLogo] = useState('');
  const [formFeatures, setFormFeatures] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Pricing plan form
  const [planProductId, setPlanProductId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [planStripePriceId, setPlanStripePriceId] = useState('');
  const [planInterval, setPlanInterval] = useState('month');
  const [planPrice, setPlanPrice] = useState('');
  const [planFeatures, setPlanFeatures] = useState('');

  const fetchProducts = () => {
    setLoading(true);
    apiFetch<AdminProduct[]>('/api/admin/products')
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchProducts, []);

  const resetProductForm = () => {
    setShowForm(false);
    setEditingProductId(null);
    setFormName('');
    setFormDesc('');
    setFormIcon('');
    setFormLogo('');
    setFormFeatures('');
  };

  const handleSaveProduct = async () => {
    setError(null);
    try {
      if (editingProductId) {
        await apiFetch(`/api/admin/products/${editingProductId}`, {
          method: 'PATCH',
          body: {
            name: formName,
            description: formDesc || undefined,
            iconUrl: formIcon || null,
            logoUrl: formLogo || null,
            features: formFeatures ? formFeatures.split('\n').filter((l) => l.trim()) : [],
          },
        });
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: {
            name: formName,
            description: formDesc || undefined,
            iconUrl: formIcon || undefined,
            logoUrl: formLogo || undefined,
            features: formFeatures ? formFeatures.split('\n').filter((l) => l.trim()) : undefined,
          },
        });
      }
      resetProductForm();
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    }
  };

  const startEditProduct = (product: AdminProduct) => {
    setEditingProductId(product.id);
    setFormName(product.name);
    setFormDesc(product.description ?? '');
    setFormIcon(product.iconUrl ?? '');
    setFormLogo(product.logoUrl ?? '');
    setFormFeatures(Array.isArray(product.features) ? product.features.join('\n') : '');
    setShowForm(true);
  };

  const handleToggleActive = async (product: AdminProduct) => {
    await apiFetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      body: { isActive: !product.isActive },
    });
    fetchProducts();
  };

  const handleTogglePlanActive = async (productId: string, plan: PricingPlan) => {
    await apiFetch(`/api/admin/products/${productId}/pricing-plans/${plan.id}`, {
      method: 'PATCH',
      body: { isActive: !plan.isActive },
    });
    fetchProducts();
  };

  const handleDeletePlan = async (productId: string, plan: PricingPlan) => {
    if (!window.confirm(`Delete pricing plan "${plan.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/products/${productId}/pricing-plans/${plan.id}`, {
        method: 'DELETE',
      });
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete plan');
    }
  };

  const handleCreatePlan = async () => {
    if (!planProductId) return;
    setError(null);
    try {
      if (editingPlanId) {
        await apiFetch(`/api/admin/products/${planProductId}/pricing-plans/${editingPlanId}`, {
          method: 'PATCH',
          body: {
            name: planName,
            stripePriceId: planStripePriceId,
            interval: planInterval,
            price: parseInt(planPrice, 10),
            features: planFeatures ? planFeatures.split('\n').filter((l) => l.trim()) : undefined,
          },
        });
      } else {
        await apiFetch(`/api/admin/products/${planProductId}/pricing-plans`, {
          method: 'POST',
          body: {
            name: planName,
            stripePriceId: planStripePriceId,
            interval: planInterval,
            price: parseInt(planPrice, 10),
            features: planFeatures ? planFeatures.split('\n').filter((l) => l.trim()) : undefined,
          },
        });
      }
      setPlanProductId(null);
      setEditingPlanId(null);
      setPlanName('');
      setPlanStripePriceId('');
      setPlanInterval('month');
      setPlanPrice('');
      setPlanFeatures('');
      fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
    }
  };

  if (loading) return <div className="py-20 text-center text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <Link to="/admin" className="text-sm text-teal hover:text-teal-dark">
            &larr; Admin Dashboard
          </Link>
        </div>
        <button
          onClick={() => {
            resetProductForm();
            setShowForm(true);
          }}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark"
        >
          New Product
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create product form */}
      {showForm && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="font-semibold text-gray-900">
            {editingProductId ? 'Edit Product' : 'New Product'}
          </h3>
          <div className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Product name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Description"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Icon URL (optional — small icon)"
              value={formIcon}
              onChange={(e) => setFormIcon(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Logo URL (optional — larger product logo)"
              value={formLogo}
              onChange={(e) => setFormLogo(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Features (one per line)"
              value={formFeatures}
              onChange={(e) => setFormFeatures(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={handleSaveProduct}
                disabled={!formName}
                className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
              >
                {editingProductId ? 'Save Changes' : 'Create'}
              </button>
              <button
                onClick={resetProductForm}
                className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create pricing plan form */}
      {planProductId && (
        <div className="mt-6 rounded-lg border border-teal/30 bg-teal/10 p-6">
          <h3 className="font-semibold text-gray-900">
            {editingPlanId ? 'Edit' : 'New'} Pricing Plan for{' '}
            {products.find((p) => p.id === planProductId)?.name}
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Plan name (e.g. Monthly)"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Stripe Price ID (price_...)"
              value={planStripePriceId}
              onChange={(e) => setPlanStripePriceId(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={planInterval}
              onChange={(e) => setPlanInterval(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="month">Monthly</option>
              <option value="year">Annual</option>
            </select>
            <input
              type="number"
              placeholder="Price in cents (e.g. 2900)"
              value={planPrice}
              onChange={(e) => setPlanPrice(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Plan features (one per line, optional)"
            value={planFeatures}
            onChange={(e) => setPlanFeatures(e.target.value)}
            rows={2}
            className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex gap-3">
            <button
              onClick={handleCreatePlan}
              disabled={!planName || !planStripePriceId || !planPrice}
              className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
            >
              {editingPlanId ? 'Save Changes' : 'Create Plan'}
            </button>
            <button
              onClick={() => {
                setPlanProductId(null);
                setEditingPlanId(null);
              }}
              className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Product list */}
      <div className="mt-8 space-y-6">
        {products.map((product) => (
          <div
            key={product.id}
            className={`rounded-lg border bg-white p-6 ${product.isActive ? 'border-gray-200' : 'border-orange-200 bg-orange-50'}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {product.iconUrl && <img src={product.iconUrl} alt="" className="h-10 w-10" />}
                {product.logoUrl && (
                  <img src={product.logoUrl} alt="" className="h-10 max-w-40 object-contain" />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {product.name}
                    {!product.isActive && (
                      <span className="ml-2 text-xs font-normal text-orange-600">Inactive</span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-500">{product.slug}</p>
                  <p className="font-mono text-xs text-gray-400 select-all">{product.id}</p>
                  {product.description && (
                    <p className="mt-1 text-sm text-gray-600">{product.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEditProduct(product)}
                  className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(product)}
                  className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                >
                  {product.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => setPlanProductId(product.id)}
                  className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                >
                  Add Plan
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 flex gap-6 text-sm text-gray-500">
              <span>{product._count.subscriptions} subscriptions</span>
              <span>{product._count.licences} licences</span>
              <span>{product._count.downloads} downloads</span>
            </div>

            {/* Pricing plans */}
            {product.pricingPlans.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700">Pricing Plans</h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {product.pricingPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`rounded border px-3 py-2 text-sm ${plan.isActive ? 'border-gray-200' : 'border-orange-200 bg-orange-50'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-medium">{plan.name}</span>
                          {!plan.isActive && (
                            <span className="ml-1 text-xs text-orange-600">Inactive</span>
                          )}
                          <span className="ml-2 text-gray-500">
                            {formatPrice(plan.price, plan.currency)}/
                            {plan.interval === 'month' ? 'mo' : 'yr'}
                            <span className="text-xs text-gray-400 ml-1">ex. GST</span>
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{plan.stripePriceId}</p>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => handleTogglePlanActive(product.id, plan)}
                          className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                        >
                          {plan.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => {
                            setPlanProductId(product.id);
                            setPlanName(plan.name);
                            setPlanStripePriceId(plan.stripePriceId);
                            setPlanInterval(plan.interval);
                            setPlanPrice(String(plan.price));
                            setPlanFeatures('');
                            setEditingPlanId(plan.id);
                          }}
                          className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePlan(product.id, plan)}
                          className="rounded bg-gray-100 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <p className="mt-8 text-center text-gray-500">No products yet. Create one above.</p>
      )}
    </div>
  );
}
