export function normalizeLevel(level) {
  const matched = String(level || "").match(/lv\s*(\d)/i);
  return matched ? `Lv${matched[1]}` : level || "Lv 미정";
}

export function getLevelBadgeClass(level) {
  const matched = String(level || "").match(/(?:lv|level)?\s*(\d)/i);
  const levelNumber = matched?.[1];

  if (levelNumber === "4") return "lv4";
  if (levelNumber === "3") return "lv3";
  if (levelNumber === "2") return "lv2";
  return "lv1";
}

export function getLevelBadgeStyle(level) {
  const levelClass = getLevelBadgeClass(level);
  const colors = {
    lv1: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },
    lv2: {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    },
    lv3: {
      background: "#ecfdf5",
      color: "#047857",
      border: "1px solid #a7f3d0",
    },
    lv4: {
      background: "#f5f3ff",
      color: "#6d28d9",
      border: "1px solid #c4b5fd",
    },
  };
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
  };

  return { ...base, ...colors[levelClass] };
}
