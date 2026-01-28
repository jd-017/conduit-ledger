/**
 * Convert dollars to cents for internal storage.
 * Rounds to avoid floating point precision issues.
 */
export const dollarsToCents = (dollars: number): number => {
  return Math.round(dollars * 100);
};

/**
 * Convert cents back to dollars for API responses.
 */
export const centsToDollars = (cents: number): number => {
  return cents / 100;
};
