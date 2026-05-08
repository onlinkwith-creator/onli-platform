export function getLevelNumber(level) {
  if (!level) return 1;

  const text = String(level).toLowerCase();

  if (text.includes("4")) return 4;
  if (text.includes("3")) return 3;
  if (text.includes("2")) return 2;
  return 1;
}

export function getUrgency(eventDate) {
  const today = new Date();
  const target = new Date(eventDate);

  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return "D-1";
  if (diffDays <= 3) return "D-3";
  if (diffDays <= 7) return "D-7";
  return "NORMAL";
}

export function calculateEstimatedPrice({
  level,
  experienceCount,
  urgency,
  workHours,
}) {
  const levelNumber = getLevelNumber(level);

  const basePrice = {
    1: 200000,
    2: 220000,
    3: 250000,
    4: 280000,
  };

  let price = basePrice[levelNumber];

  const experience = Number(experienceCount || 0);
  const hours = Number(workHours || 8);

  if (experience >= 20) price += 20000;
  else if (experience >= 10) price += 10000;

  if (urgency === "D-1") price += 30000;
  else if (urgency === "D-3") price += 15000;
  else if (urgency === "D-7") price += 5000;

  if (hours > 8) {
    price += (hours - 8) * 10000;
  }

  return price;
}

export function calculateInterpreterPay(estimatedPrice) {
  return Math.floor(estimatedPrice * 0.8);
}

export function formatKRW(value) {
  return `₩${Number(value || 0).toLocaleString()}`;
}