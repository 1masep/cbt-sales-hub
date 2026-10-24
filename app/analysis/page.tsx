import { BRAND } from "../../lib/brand";
import { COMMODITY_CATEGORIES, SALES_REPS } from "../../lib/config";
import { AnalysisHub } from "./hub";

export const metadata = { title: `CBT Data Analysis Hub · ${BRAND.name}` };

export default function AnalysisPage() {
  return <AnalysisHub categories={[...COMMODITY_CATEGORIES]} reps={[...SALES_REPS]} />;
}
