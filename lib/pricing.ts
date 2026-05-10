export type LtlRatingInput = {
  baseRate: number;
  discountPercent: number;
  minimumCharge: number;
  fuelSurchargePercent: number;
  accessorials: number;
};

export function calculateLtlCharge(input: LtlRatingInput) {
  const discountedLinehaul = input.baseRate * (1 - input.discountPercent);
  const netLinehaul = Math.max(discountedLinehaul, input.minimumCharge);
  const fuel = netLinehaul * input.fuelSurchargePercent;
  const total = netLinehaul + fuel + input.accessorials;

  return {
    discountedLinehaul: roundMoney(discountedLinehaul),
    netLinehaul: roundMoney(netLinehaul),
    fuel: roundMoney(fuel),
    accessorials: roundMoney(input.accessorials),
    total: roundMoney(total)
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
