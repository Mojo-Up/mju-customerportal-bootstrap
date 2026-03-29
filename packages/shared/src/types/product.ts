export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconUrl?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  features?: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPricingPlan {
  id: string;
  productId: string;
  name: string;
  stripePriceId: string;
  interval: 'month' | 'year';
  price: number; // cents
  currency: string;
  features?: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface ProductWithPlans extends Product {
  pricingPlans: ProductPricingPlan[];
}

/** Map of ISO 4217 currency codes to their symbols */
const CURRENCY_SYMBOLS: Record<string, string> = {
  aud: 'A$',
  usd: '$',
  eur: '€',
  gbp: '£',
  nzd: 'NZ$',
  cad: 'CA$',
};

/** Format a price in cents to a display string with currency symbol, e.g. "A$29.00" */
export function formatPrice(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase() + ' ';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
