import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { comparisonRows } from "@/lib/demo-data";

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bid Comparison");
  sheet.columns = [
    { header: "Lane", key: "lane", width: 14 },
    { header: "ZIP3 Lane", key: "zip3Lane", width: 14 },
    { header: "Weight Break", key: "weightBreak", width: 16 },
    { header: "Class", key: "freightClass", width: 10 },
    { header: "Shipments", key: "shipments", width: 12 },
    { header: "Historical Avg", key: "historicalAvg", width: 16 },
    { header: "Primary Carrier", key: "primaryCarrier", width: 20 },
    { header: "Primary Cost", key: "primaryCost", width: 14 },
    { header: "Second Carrier", key: "secondCarrier", width: 20 },
    { header: "Second Cost", key: "secondCost", width: 14 },
    { header: "Third Carrier", key: "thirdCarrier", width: 20 },
    { header: "Third Cost", key: "thirdCost", width: 14 },
    { header: "Annual Savings", key: "annualSavings", width: 16 },
    { header: "Transit Days", key: "transitDays", width: 12 },
    { header: "Direct", key: "direct", width: 12 }
  ];
  sheet.addRows(comparisonRows);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "O1" };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=bid-comparison-demo.xlsx"
    }
  });
}
