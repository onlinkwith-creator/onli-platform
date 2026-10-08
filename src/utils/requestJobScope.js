const id = (value) => value == null ? "" : String(value);

export function getRequestJobScope(request, jobs = [], requests = []) {
  const requestId = id(request?.id);
  if (!requestId) return { jobs: [], error: "의뢰 정보를 확인할 수 없습니다." };
  const linkedId = id(request.job_id);
  const candidates = jobs.filter((job) =>
    (linkedId && id(job.id) === linkedId) || id(job.request_id) === requestId
  );
  const conflict = candidates.some((job) =>
    (id(job.request_id) && id(job.request_id) !== requestId) ||
    requests.some((other) => id(other.id) !== requestId && id(other.job_id) === id(job.id))
  );
  if (conflict) return { jobs: [], error: "공고가 다른 의뢰에도 연결되어 있습니다. 연결 정보를 확인해 주세요." };
  if (linkedId && !candidates.some((job) => id(job.id) === linkedId)) {
    return { jobs: [], error: "연결된 공고를 불러오지 못했습니다. 새로고침 후 연결 정보를 확인해 주세요." };
  }
  return { jobs: candidates, error: "" };
}
