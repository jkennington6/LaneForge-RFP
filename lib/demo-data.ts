import { calculateLtlCharge } from "@/lib/pricing";

export const customers = [
  { id: "cust_bep", name: "Better Earth Packaging", industry: "Packaging", contact: "Operations Team", email: "ops@betterearth.example", mode: "LTL", status: "Active", notes: "Appointment required on most deliveries." },
  { id: "cust_arx", name: "Arxada", industry: "Chemicals", contact: "Logistics Team", email: "logistics@arxada.example", mode: "LTL", status: "Active", notes: "Carrier alternatives and routing guide sensitivity." }
];

export const carriers = [
  { id: "car_odfl", name: "Old Dominion", scac: "ODFL", contact: "ODFL Pricing", email: "pricing@odfl.example", service: "National LTL", status: "Active", coverage: "Strong national LTL network." },
  { id: "car_fxf", name: "FedEx Freight", scac: "FXFE", contact: "FedEx Pricing", email: "pricing@fedex.example", service: "National LTL", status: "Active", coverage: "Priority and economy network options." },
  { id: "car_saia", name: "Saia", scac: "SAIA", contact: "Saia Pricing", email: "pricing@saia.example", service: "National LTL", status: "Active", coverage: "Strong regional and national LTL coverage." },
  { id: "car_estes", name: "Estes", scac: "EXLA", contact: "Estes Pricing", email: "pricing@estes.example", service: "National LTL", status: "Active", coverage: "Strong national LTL carrier." },
  { id: "car_xpo", name: "XPO", scac: "XPO", contact: "XPO Pricing", email: "pricing@xpo.example", service: "National LTL", status: "Active", coverage: "Broad LTL coverage." },
  { id: "car_abf", name: "ABF", scac: "ABFS", contact: "ABF Pricing", email: "pricing@abf.example", service: "National LTL", status: "Active", coverage: "National LTL and union network." },
  { id: "car_rl", name: "R+L Carriers", scac: "RLCA", contact: "R+L Pricing", email: "pricing@rlcarriers.example", service: "National LTL", status: "Excluded", coverage: "Excluded for some customer programs." },
  { id: "car_sefl", name: "Southeastern Freight Lines", scac: "SEFL", contact: "SEFL Pricing", email: "pricing@sefl.example", service: "Regional LTL", status: "Active", coverage: "Excellent Southeast coverage; limited western direct coverage." },
  { id: "car_ct", name: "Central Transport", scac: "CTII", contact: "Central Pricing", email: "pricing@central.example", service: "National LTL", status: "Review", coverage: "Potential savings carrier, may require customer approval." }
];

export const rfps = [
  { id: "rfp_bep_2026", name: "Better Earth Packaging 2026 LTL RFP", customer: "Better Earth Packaging", mode: "LTL", status: "Active", dueDate: "2026-06-12", effectiveDate: "2026-07-01", expirationDate: "2027-06-30", invited: 7, submitted: 5 },
  { id: "rfp_arx_alt", name: "Arxada LTL Carrier Alternatives", customer: "Arxada", mode: "LTL", status: "Draft", dueDate: "2026-06-20", effectiveDate: "2026-08-01", expirationDate: "2027-07-31", invited: 5, submitted: 0 }
];

export const shipmentLanes = [
  { id: "lane_1", rfpId: "rfp_bep_2026", originState: "GA", destinationState: "FL", originZip3: "303", destinationZip3: "328", weightBreak: "501-1000", freightClass: "92.5", shipments: 84, historicalSpend: 21480 },
  { id: "lane_2", rfpId: "rfp_bep_2026", originState: "GA", destinationState: "TX", originZip3: "303", destinationZip3: "752", weightBreak: "1001-2000", freightClass: "92.5", shipments: 51, historicalSpend: 28700 },
  { id: "lane_3", rfpId: "rfp_bep_2026", originState: "CA", destinationState: "AZ", originZip3: "917", destinationZip3: "850", weightBreak: "501-1000", freightClass: "92.5", shipments: 39, historicalSpend: 12600 },
  { id: "lane_4", rfpId: "rfp_bep_2026", originState: "IL", destinationState: "PA", originZip3: "606", destinationZip3: "191", weightBreak: "2001-5000", freightClass: "92.5", shipments: 26, historicalSpend: 19650 },
  { id: "lane_5", rfpId: "rfp_bep_2026", originState: "NJ", destinationState: "FL", originZip3: "070", destinationZip3: "331", weightBreak: "1001-2000", freightClass: "92.5", shipments: 32, historicalSpend: 17400 }
];

const pricingInputs = [
  { laneId: "lane_1", carrier: "Saia", baseRate: 420, discountPercent: 0.78, minimumCharge: 125, fuelSurchargePercent: 0.32, accessorials: 35, transitDays: 2, direct: true },
  { laneId: "lane_1", carrier: "Estes", baseRate: 432, discountPercent: 0.79, minimumCharge: 129, fuelSurchargePercent: 0.32, accessorials: 35, transitDays: 2, direct: true },
  { laneId: "lane_1", carrier: "Old Dominion", baseRate: 455, discountPercent: 0.76, minimumCharge: 145, fuelSurchargePercent: 0.32, accessorials: 35, transitDays: 2, direct: true },
  { laneId: "lane_2", carrier: "XPO", baseRate: 825, discountPercent: 0.74, minimumCharge: 185, fuelSurchargePercent: 0.32, accessorials: 55, transitDays: 3, direct: true },
  { laneId: "lane_2", carrier: "FedEx Freight", baseRate: 860, discountPercent: 0.75, minimumCharge: 190, fuelSurchargePercent: 0.32, accessorials: 55, transitDays: 3, direct: true },
  { laneId: "lane_2", carrier: "Estes", baseRate: 872, discountPercent: 0.73, minimumCharge: 180, fuelSurchargePercent: 0.32, accessorials: 55, transitDays: 4, direct: true },
  { laneId: "lane_3", carrier: "Central Transport", baseRate: 390, discountPercent: 0.80, minimumCharge: 110, fuelSurchargePercent: 0.32, accessorials: 20, transitDays: 2, direct: true },
  { laneId: "lane_3", carrier: "XPO", baseRate: 405, discountPercent: 0.77, minimumCharge: 125, fuelSurchargePercent: 0.32, accessorials: 20, transitDays: 2, direct: true },
  { laneId: "lane_3", carrier: "Saia", baseRate: 430, discountPercent: 0.75, minimumCharge: 130, fuelSurchargePercent: 0.32, accessorials: 20, transitDays: 2, direct: true },
  { laneId: "lane_4", carrier: "ABF", baseRate: 990, discountPercent: 0.73, minimumCharge: 210, fuelSurchargePercent: 0.32, accessorials: 40, transitDays: 3, direct: true },
  { laneId: "lane_4", carrier: "Old Dominion", baseRate: 1020, discountPercent: 0.72, minimumCharge: 225, fuelSurchargePercent: 0.32, accessorials: 40, transitDays: 3, direct: true },
  { laneId: "lane_4", carrier: "FedEx Freight", baseRate: 1040, discountPercent: 0.72, minimumCharge: 220, fuelSurchargePercent: 0.32, accessorials: 40, transitDays: 3, direct: true },
  { laneId: "lane_5", carrier: "Estes", baseRate: 790, discountPercent: 0.74, minimumCharge: 175, fuelSurchargePercent: 0.32, accessorials: 60, transitDays: 4, direct: true },
  { laneId: "lane_5", carrier: "Saia", baseRate: 805, discountPercent: 0.74, minimumCharge: 180, fuelSurchargePercent: 0.32, accessorials: 60, transitDays: 4, direct: true },
  { laneId: "lane_5", carrier: "ABF", baseRate: 830, discountPercent: 0.73, minimumCharge: 185, fuelSurchargePercent: 0.32, accessorials: 60, transitDays: 4, direct: true }
];

export const bidLines = pricingInputs.map((row) => ({ ...row, ...calculateLtlCharge(row) }));

export const comparisonRows = shipmentLanes.map((lane) => {
  const rows = bidLines.filter((line) => line.laneId === lane.id).sort((a, b) => a.total - b.total);
  const winner = rows[0];
  const second = rows[1];
  const third = rows[2];
  const historicalAvg = lane.historicalSpend / lane.shipments;
  const savingsPerShipment = historicalAvg - winner.total;
  return {
    lane: `${lane.originState}-${lane.destinationState}`,
    zip3Lane: `${lane.originZip3}-${lane.destinationZip3}`,
    weightBreak: lane.weightBreak,
    freightClass: lane.freightClass,
    shipments: lane.shipments,
    historicalAvg: Number(historicalAvg.toFixed(2)),
    primaryCarrier: winner.carrier,
    primaryCost: winner.total,
    secondCarrier: second?.carrier ?? "Missing",
    secondCost: second?.total ?? 0,
    thirdCarrier: third?.carrier ?? "Missing",
    thirdCost: third?.total ?? 0,
    savingsPerShipment: Number(savingsPerShipment.toFixed(2)),
    annualSavings: Number((savingsPerShipment * lane.shipments).toFixed(2)),
    transitDays: winner.transitDays,
    direct: winner.direct ? "Direct" : "Interline"
  };
});

export const routingGuideRows = comparisonRows.map((row) => ({
  lane: row.lane,
  zip3Lane: row.zip3Lane,
  primary: row.primaryCarrier,
  backup1: row.secondCarrier,
  backup2: row.thirdCarrier,
  rule: "Lowest cost, direct coverage required",
  notes: row.primaryCarrier === "Central Transport" ? "Requires customer approval due to sensitivity." : "Award candidate"
}));

export const users = [
  { name: "Platform Owner", email: process.env.PLATFORM_OWNER_EMAIL ?? "you@example.com", role: "Owner", company: "LaneForge", status: "Protected", lastLogin: "Today" },
  { name: "Customer Reviewer", email: "customer@example.com", role: "Customer User", company: "Better Earth Packaging", status: "Active", lastLogin: "Yesterday" },
  { name: "Carrier Bidder", email: "carrier@example.com", role: "Carrier User", company: "Saia", status: "Active", lastLogin: "2 days ago" },
  { name: "Suspended User", email: "suspended@example.com", role: "Carrier User", company: "Central Transport", status: "Suspended", lastLogin: "Last week" }
];
