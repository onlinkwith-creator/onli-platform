const REQUEST_TYPE_LABELS = {
  general: "일반의뢰",
  designated: "지정의뢰",
  urgent: "긴급의뢰",
  private: "비공개의뢰",
  일반의뢰: "일반의뢰",
  지정의뢰: "지정의뢰",
  긴급의뢰: "긴급의뢰",
  비공개의뢰: "비공개의뢰",
  "통역사 지정 의뢰": "지정의뢰",
};

export function normalizeRequestType(value, fallback = "general") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (["general", "designated", "urgent", "private"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "지정의뢰" || normalized === "통역사 지정 의뢰") {
    return "designated";
  }
  if (normalized === "긴급의뢰") {
    return "urgent";
  }
  if (normalized === "비공개의뢰") {
    return "private";
  }
  return fallback;
}

export function getRequestTypeValue(...items) {
  const targets = items.filter(Boolean);
  for (const item of targets) {
    const type = normalizeRequestType(item.request_type, "");
    if (type) return type;
  }
  return isDesignatedRequest(...targets) ? "designated" : "general";
}

export function getRequestTypeDisplayLabel(...items) {
  const type = getRequestTypeValue(...items);
  return REQUEST_TYPE_LABELS[type] || "일반의뢰";
}

export function isDesignatedRequest(...items) {
  return items.filter(Boolean).some((item) =>
    Boolean(
      normalizeRequestType(item.request_type, "") === "designated" ||
        item.request_type === "지정의뢰" ||
        item.request_type === "통역사 지정 의뢰" ||
        item.selected_interpreter_id ||
        item.selected_interpreter_name ||
        item.interpreter_id ||
        item.interpreter_name ||
        item.designated_interpreter_id ||
        item.designated_interpreter_name
    )
  );
}

export function getRequestTypeLabel(...items) {
  return getRequestTypeDisplayLabel(...items);
}

export function getDesignatedInterpreterName(items = [], interpreters = []) {
  const targets = Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean);

  for (const item of targets) {
    const name =
      item.selected_interpreter_name ||
      item.interpreter_name ||
      item.designated_interpreter_name;
    if (name) return name;
  }

  for (const item of targets) {
    const id =
      item.selected_interpreter_id ||
      item.interpreter_id ||
      item.designated_interpreter_id;
    if (!id) continue;

    const interpreter = interpreters.find((person) => String(person.id) === String(id));
    if (interpreter?.name) return interpreter.name;
    return `#${id}`;
  }

  return "-";
}
