export function normalizeLevel(level) {
  const matched = String(level || "").match(/lv\s*(\d)/i);
  return matched ? `Lv${matched[1]}` : level || "Lv 미정";
}

export function getLevelBadgeStyle(level) {
  const normalized = normalizeLevel(level).toLowerCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
    lineHeight: 1,
    whiteSpace: "nowrap",
    border: "1px solid transparent",
  };

  if (normalized === "lv2") {
    return { ...base, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" };
  }
  if (normalized === "lv3") {
    return { ...base, background: "#ecfdf5", color: "#047857", borderColor: "#bbf7d0" };
  }
  if (normalized === "lv4") {
    return { ...base, background: "#f5f3ff", color: "#6d28d9", borderColor: "#ddd6fe" };
  }

  return { ...base, background: "#f3f4f6", color: "#4b5563", borderColor: "#e5e7eb" };
}
