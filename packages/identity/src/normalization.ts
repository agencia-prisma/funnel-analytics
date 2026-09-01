import type {
  BrowserIdentifyIdentifiersV1,
  IdentityIdentifierTypeV1,
  IdentityStrongIdentifierTypeV1,
} from '@funnel/event-contracts';

import { IdentityError } from './errors';

export interface NormalizedIdentifier {
  type: IdentityIdentifierTypeV1;
  value: string;
  strong: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeEmail(input: string): string {
  const value = input.trim().toLowerCase();

  if (value.length < 3 || value.length > 320 || !EMAIL_PATTERN.test(value)) {
    throw new IdentityError('IDENTITY_EMAIL_INVALID');
  }

  return value;
}

export function normalizePhone(input: string): string {
  const trimmed = input.trim();

  if (!trimmed.startsWith('+')) {
    throw new IdentityError('IDENTITY_PHONE_INVALID');
  }

  const value = '+' + trimmed.slice(1).replace(/[\s().-]/g, '');

  if (!E164_PATTERN.test(value)) {
    throw new IdentityError('IDENTITY_PHONE_INVALID');
  }

  return value;
}

function cpfDigit(base: string, factor: number): number {
  let total = 0;

  for (const character of base) {
    total += Number(character) * factor;
    factor -= 1;
  }

  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function normalizeCpf(input: string): string {
  const value = input.replace(/\D/g, '');

  if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) {
    throw new IdentityError('IDENTITY_CPF_INVALID');
  }

  const first = cpfDigit(value.slice(0, 9), 10);
  const second = cpfDigit(value.slice(0, 10), 11);

  if (first !== Number(value[9]) || second !== Number(value[10])) {
    throw new IdentityError('IDENTITY_CPF_INVALID');
  }

  return value;
}

export function normalizeName(input: string): string {
  const value = input.normalize('NFKC').trim().replace(/\s+/g, ' ');

  if (value.length < 1 || value.length > 200) {
    throw new IdentityError('IDENTITY_NAME_INVALID');
  }

  return value;
}

function normalizeByType(
  type: IdentityIdentifierTypeV1,
  value: string,
): string {
  switch (type) {
    case 'email':
      return normalizeEmail(value);
    case 'phone':
      return normalizePhone(value);
    case 'cpf':
      return normalizeCpf(value);
    case 'name':
      return normalizeName(value);
  }
}

export function isStrongIdentifierType(
  type: IdentityIdentifierTypeV1,
): type is IdentityStrongIdentifierTypeV1 {
  return type === 'email' || type === 'phone' || type === 'cpf';
}

export function normalizeIdentifierSet(
  input: BrowserIdentifyIdentifiersV1,
): NormalizedIdentifier[] {
  const entries = Object.entries(input).filter(
    (entry): entry is [IdentityIdentifierTypeV1, string] =>
      ['email', 'phone', 'cpf', 'name'].includes(entry[0]) &&
      typeof entry[1] === 'string' &&
      entry[1].trim().length > 0,
  );

  if (entries.length === 0 || entries.length > 4) {
    throw new IdentityError('IDENTITY_INVALID');
  }

  return entries.map(([type, raw]) => ({
    type,
    value: normalizeByType(type, raw),
    strong: isStrongIdentifierType(type),
  }));
}
