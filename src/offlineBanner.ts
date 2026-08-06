/** Notifica a la UI cuando Netlify API falla y se usa localStorage. */
const FALLBACK_EVENT = "cateringcrm:offline-fallback";

let fallbackNotified = false;

export function notifyOfflineFallback(): void {
  if (fallbackNotified) return;
  fallbackNotified = true;
  window.dispatchEvent(new CustomEvent(FALLBACK_EVENT));
}

export function resetOfflineFallbackFlag(): void {
  fallbackNotified = false;
}

export function onOfflineFallback(handler: () => void): () => void {
  const fn = () => handler();
  window.addEventListener(FALLBACK_EVENT, fn);
  return () => window.removeEventListener(FALLBACK_EVENT, fn);
}
