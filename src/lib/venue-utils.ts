export const tierOptions = [
  { value: 'approved', label: 'Approved' },
  { value: 'under_consideration', label: 'Under Consideration' },
  { value: 'to_be_assessed', label: 'To Be Assessed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'if_we_must', label: 'If We Must' },
  { value: 'gone_but_not_forgotten', label: 'Gone But Not Forgotten' },
] as const;

export type TierValue = (typeof tierOptions)[number]['value'];

export function normalizeTier(value: string | null | undefined): TierValue {
  const lookup: Record<string, TierValue> = {
    approved: 'approved',
    under_consideration: 'under_consideration',
    to_be_assessed: 'to_be_assessed',
    rejected: 'rejected',
    if_we_must: 'if_we_must',
    gone_but_not_forgotten: 'gone_but_not_forgotten',
    'Under Consideration': 'under_consideration',
    'To Be Assessed': 'to_be_assessed',
    'Rejected': 'rejected',
    'Approved': 'approved',
    'If We Must': 'if_we_must',
    'Gone But Not Forgotten': 'gone_but_not_forgotten',
  };

  return lookup[String(value ?? '').trim()] ?? 'approved';
}

export function displayTier(value: string | null | undefined) {
  return tierOptions.find((option) => option.value === normalizeTier(value))?.label ?? 'Approved';
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function parseOptionalText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
