/** A tiny in-memory model of a checkout endpoint that refuses duplicate references. */

export const CURRENCIES = ['NGN', 'ZAR', 'AED', 'XAF'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Step = 'validate' | 'reference' | 'fee' | 'charge' | 'record';

export interface CheckoutResult {
  status: 201 | 400 | 409;
  message: string;
  /** Steps that ran, in order. The last one failed when status is not 201. */
  steps: Step[];
  amount?: number;
}

/** ISO 4217 minor units, as the browser's Intl data reports them. */
export function minorUnits(currency: Currency): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Round half away from zero at the currency's minor unit, without binary float drift. */
export function roundForCurrency(amount: number, currency: Currency): number {
  const digits = minorUnits(currency);
  const shifted = Number(`${Math.abs(amount)}e${digits}`);
  return Math.sign(amount) * Number(`${Math.round(shifted)}e-${digits}`);
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amount);
}

export class Checkout {
  readonly #seen = new Map<string, { amount: number; currency: Currency }>();

  pay(reference: string, rawAmount: string, currency: Currency): CheckoutResult {
    const amount = Number(rawAmount.replace(/,/g, '').trim());
    if (!rawAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      return { status: 400, message: 'Amount must be a number above zero.', steps: ['validate'] };
    }
    const rounded = roundForCurrency(amount, currency);
    if (rounded <= 0) {
      return { status: 400, message: `That rounds to nothing in ${currency}.`, steps: ['validate'] };
    }
    if (this.#seen.has(reference)) {
      return {
        status: 409,
        message: 'Duplicate reference. Nothing was charged.',
        steps: ['validate', 'reference'],
      };
    }
    this.#seen.set(reference, { amount: rounded, currency });
    return {
      status: 201,
      message: `Charged ${formatMoney(rounded, currency)}.`,
      steps: ['validate', 'reference', 'fee', 'charge', 'record'],
      amount: rounded,
    };
  }

  get charges(): number {
    return this.#seen.size;
  }
}

export function newReference(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return `PZ-${code}`;
}
