/** Normaliza un teléfono chileno/LATAM a dígitos internacionales para wa.me. */
export function whatsappPhoneUrl(phone: string, text?: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  let intl = digits;
  if (digits.length === 9 && digits.startsWith("9")) intl = `56${digits}`;
  else if (digits.length === 8) intl = `56${digits}`;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${intl}${q}`;
}

export function whatsappTextUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
