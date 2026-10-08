const targets = {
  interpreter: new Set(["/interpreter-mypage?tab=assignments", "/interpreter-mypage?tab=applications", "/interpreter-mypage?tab=preparation"]),
  company: new Set(["/business/mypage?tab=applicants", "/business/mypage?tab=work", "/business/mypage?tab=materials"]),
};

export function validWorkflowReturnTarget(path, role) {
  return role ? targets[role]?.has(path) === true : Object.values(targets).some((values) => values.has(path));
}
