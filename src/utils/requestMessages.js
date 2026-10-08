export const MESSAGE_LIMIT = 2000;

export function mergeRequestMessages(current, incoming) {
  const items = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) items.set(item.id, item);
  return [...items.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
}

export function messageError(error) {
  if (/MESSAGE_RATE_LIMIT/.test(error?.message)) return "메시지를 너무 빠르게 보냈습니다. 잠시 후 다시 시도해 주세요.";
  if (/MESSAGE_INVALID_BODY/.test(error?.message)) return "메시지를 1~2,000자 이내로 입력해 주세요.";
  if (/MESSAGE_.*FORBIDDEN/.test(error?.message)) return "배정 상태나 대화 권한이 변경되었습니다. 대화 목록을 새로고침해 주세요.";
  return "연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
