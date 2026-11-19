function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');

  if (/^\+/.test(raw)) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}

function phoneLookupVariants(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  const digits = normalized.slice(1);
  const variants = [normalized, digits];
  if (digits.startsWith('91')) variants.push(digits.slice(2));
  return [...new Set(variants)];
}

module.exports = { normalizePhone, phoneLookupVariants };
