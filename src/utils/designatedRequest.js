export function isDesignatedRequest(...items) {
  return items.filter(Boolean).some((item) =>
    Boolean(
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
  return isDesignatedRequest(...items) ? "지정의뢰" : "일반의뢰";
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
