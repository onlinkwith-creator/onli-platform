const targets = {
  interpreter: new Set(["/interpreter-mypage?tab=assignments", "/interpreter-mypage?tab=applications", "/interpreter-mypage?tab=preparation", "/interpreter-mypage?tab=messages"]),
  company: new Set(["/business/mypage?tab=applicants", "/business/mypage?tab=work", "/business/mypage?tab=materials", "/business/mypage?tab=messages"]),
};

export function validWorkflowReturnTarget(path, role) {
  return role ? targets[role]?.has(path) === true : Object.values(targets).some((values) => values.has(path));
}
