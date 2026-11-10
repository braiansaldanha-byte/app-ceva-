import CevaiApp from "../ui/cevai-app";
import { publicConfig } from "../../lib/public-config";
export const dynamic = "force-dynamic";
export default function CashierPage() {
  return <CevaiApp config={publicConfig()} area="pub" />;
}
