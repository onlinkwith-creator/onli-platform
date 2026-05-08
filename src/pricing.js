export {
  calculateEstimatedPrice,
  calculateInterpreterPay,
  getLevelNumber,
  getUrgency,
} from "./utils/pricing";

export function formatKRW(value) {
  return `₩${Number(value || 0).toLocaleString()}`;
}
