export function getJobLevel(job) {
  const levelText = job?.level || job?.requested_level || job?.required_level || "";
  const matched = String(levelText).match(/lv\s*(\d)/i);

  return matched ? `LV${matched[1]}` : "LV 협의";
}

export function getJobLevelSummary(job) {
  const level = getJobLevel(job);

  if (level === "LV1") return "LV1 · 일반 행사 운영 대응";
  if (level === "LV2") return "LV2 · 비즈니스 상담 대응";
  if (level === "LV3") return "LV3 · 전문 분야 통역";
  if (level === "LV4") return "LV4 · 고난도 비즈니스/VIP 대응";

  return "레벨 협의 · 운영팀 검토 후 배정";
}

export function getJobSpecialty(job) {
  return (
    job?.field ||
    job?.specialty ||
    job?.category ||
    job?.preference ||
    "한일 비즈니스 통역"
  );
}

export function getJobPayDisplay(job) {
  return (
    job?.pay ||
    job?.dailyPay ||
    job?.daily_pay ||
    job?.wage ||
    job?.price ||
    "협의"
  );
}
