/** Standard price of one meal. Anything above it is flagged with a ★ in staff lists and printouts. */
export const STANDARD_MEAL_PRICE = 30000;

export function isPremiumPrice(price: number) {
  return price > STANDARD_MEAL_PRICE;
}
