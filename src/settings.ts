export type CompanySettings = {
  companyName: string;
  phone: string;
  email: string;
  address: string;
  quoteNotes: string;
  quoteValidityDays: number;
};

const SETTINGS_KEY = "catering-crm:settings";
const PIN_KEY = "catering-crm:pin";
const PIN_UNLOCKED_KEY = "catering-crm:pin-unlocked";

const defaultSettings: CompanySettings = {
  companyName: "Mi Catering",
  phone: "",
  email: "",
  address: "",
  quoteNotes: "Cotización válida por el plazo indicado. Precio sujeto a cambios de menú.",
  quoteValidityDays: 15,
};

export function loadCompanySettings(): CompanySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...(JSON.parse(raw) as CompanySettings) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveCompanySettings(settings: CompanySettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getStoredPin(): string | null {
  return localStorage.getItem(PIN_KEY);
}

export function setStoredPin(pin: string | null): void {
  if (!pin) {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(PIN_UNLOCKED_KEY);
    return;
  }
  localStorage.setItem(PIN_KEY, pin);
  localStorage.setItem(PIN_UNLOCKED_KEY, "1");
}

export function isPinUnlocked(): boolean {
  const pin = getStoredPin();
  if (!pin) return true;
  return sessionStorage.getItem(PIN_UNLOCKED_KEY) === "1";
}

export function unlockPin(pin: string): boolean {
  const stored = getStoredPin();
  if (!stored) return true;
  if (pin === stored) {
    sessionStorage.setItem(PIN_UNLOCKED_KEY, "1");
    return true;
  }
  return false;
}

export function lockPin(): void {
  sessionStorage.removeItem(PIN_UNLOCKED_KEY);
}
