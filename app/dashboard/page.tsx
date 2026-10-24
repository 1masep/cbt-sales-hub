import { BRAND } from "../../lib/brand";
import { COMMODITY_CATEGORIES, SALES_REPS } from "../../lib/config";
import { SalesDashboard } from "./sales-dashboard";

export const metadata = { title: `Sales · ${BRAND.name}` };

export default function DashboardPage() {
  return <SalesDashboard categories={[...COMMODITY_CATEGORIES]} reps={[...SALES_REPS]} />;
}
