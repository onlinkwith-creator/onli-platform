export function normalizeLevel(level) {
  const matched = String(level || "").match(/lv\s*(\d)/i);
  return matched ? `Lv${matched[1]}` : level || "Lv 미정";
}

export function getLevelBadgeStyle(level) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    background: "rgba(99, 102, 241, 0.08)",
    color: "#4f46e5",
    border: "1px solid rgba(99, 102, 241, 0.15)",
  };

  return base;
}
