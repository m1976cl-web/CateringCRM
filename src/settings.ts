export type CompanySettings = {
  companyName: string;
  phone: string;
  email: string;
  address: string;
  quoteNotes: string;
  quoteValidityDays: number;
  addIva: boolean;
  ivaRate: number;
};

const SETTINGS_KEY = "catering-crm:settings";

const defaultSettings: CompanySettings = {
  companyName: "",
  phone: "",
  email: "",
  address: "",
  quoteNotes: "Cotización válida por el plazo indicado. Precio sujeto a cambios de menú.",
  quoteValidityDays: 15,
  addIva: true,
  ivaRate: 19,
};

export type QuoteTaxBreakdown = {
  net: number;
  iva: number;
  total: number;
  addIva: boolean;
  ivaRate: number;
};

export function quoteTaxBreakdown(net: number, settings?: CompanySettings): QuoteTaxBreakdown {
  const cfg = settings ?? loadCompanySettings();
  const rate = cfg.ivaRate > 0 ? cfg.ivaRate : 19;
  if (!cfg.addIva) {
    return { net, iva: 0, total: net, addIva: false, ivaRate: rate };
  }
  const iva = Math.round(net * (rate / 100));
  return { net, iva, total: net + iva, addIva: true, ivaRate: rate };
}

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
