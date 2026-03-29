const STORAGE_KEY = 'pendingPurchase';

export interface PendingPurchase {
  productId: string;
  productSlug: string;
  pricingPlanId: string;
}

export function savePendingPurchase(purchase: PendingPurchase): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(purchase));
}

export function getPendingPurchase(): PendingPurchase | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.productId && parsed.productSlug && parsed.pricingPlanId) {
      return parsed as PendingPurchase;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingPurchase(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
