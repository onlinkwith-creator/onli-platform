import {
  addManagementNumber,
  isManagementNumberConflict,
} from "./managementNumber.js";
import {
  buildLegacyJobApplicationPayload,
  isAgreementColumnError,
  isStatusValueError,
} from "./applicationContact.js";

const LEGACY_PENDING_STATUS = "지원완료";

export async function insertJobApplicationWithFallback({
  supabase,
  application,
  managementConfig,
}) {
  let insertPayload = await addManagementNumber({
    supabase,
    table: "job_applications",
    payload: application,
    ...managementConfig,
  });

  let result = await insertJobApplication(supabase, insertPayload);

  if (isManagementNumberConflict(result.error, managementConfig.column)) {
    insertPayload = await addManagementNumber({
      supabase,
      table: "job_applications",
      payload: application,
      ...managementConfig,
    });
    result = await insertJobApplication(supabase, insertPayload);
  }

  if (result.error && shouldRetryWithLegacyStatus(result.error, insertPayload)) {
    const legacyApplication = {
      ...application,
      status: LEGACY_PENDING_STATUS,
    };
    insertPayload = await addManagementNumber({
      supabase,
      table: "job_applications",
      payload: legacyApplication,
      ...managementConfig,
    });
    result = await insertJobApplication(supabase, insertPayload);
  }

  if (result.error && isAgreementColumnError(result.error)) {
    insertPayload = buildLegacyJobApplicationPayload(result.error, insertPayload);
    result = await insertJobApplication(supabase, insertPayload);
  }

  return {
    data: result.data,
    error: result.error,
    insertPayload,
  };
}

async function insertJobApplication(supabase, payload) {
  return supabase
    .from("job_applications")
    .insert([payload])
    .select("id")
    .single();
}

function shouldRetryWithLegacyStatus(error, payload = {}) {
  return payload.status !== LEGACY_PENDING_STATUS && isStatusValueError(error);
}
