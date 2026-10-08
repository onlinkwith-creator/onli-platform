const targets = {
  interpreter: new Set(["/interpreter-mypage?tab=assignments", "/interpreter-mypage?tab=applications", "/interpreter-mypage?tab=preparation", "/interpreter-mypage?tab=messages", "/interpreter-mypage?tab=changes"]),
  company: new Set(["/business/mypage?tab=applicants", "/business/mypage?tab=work", "/business/mypage?tab=materials", "/business/mypage?tab=messages", "/business/mypage?tab=changes"]),
};

export function validWorkflowReturnTarget(path, role) {
  return role ? targets[role]?.has(path) === true : Object.values(targets).some((values) => values.has(path));
}
