#!/usr/bin/env python3
"""Patch RequestDetailPanel in Admin.jsx with tab-based UI.

This script replaces ONLY the return statement block of RequestDetailPanel
(from the 'return (' line to the closing '}' of the function),
while keeping ALL content before and after intact.
"""

with open('/workspaces/onli-platform/src/pages/Admin.jsx', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

print(f"Total lines: {len(lines)}")

# ── Find RequestDetailPanel body start ──
panel_start = None
for i, line in enumerate(lines):
    if line.strip() == 'function RequestDetailPanel({':
        panel_start = i
        break

print(f"panel_start: {panel_start + 1}")

# ── Find function body opening brace "}) {" ──
body_start = None
for i in range(panel_start, panel_start + 50):
    if lines[i].strip() == '}) {':
        body_start = i
        break

print(f"body_start: {body_start + 1}: {repr(lines[body_start])}")

# ── Find end of function body (matching close brace) ──
# Start depth at 1 (after the opening "{" in "}) {")
depth = 1
panel_end = None
for i in range(body_start + 1, len(lines)):
    for ch in lines[i]:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
    if depth == 0:
        panel_end = i
        break

print(f"panel_end: {panel_end + 1}: {repr(lines[panel_end])}")

# ── Find top-level return statement at 2-space indent ──
return_line = None
for i in range(body_start + 1, panel_end):
    if lines[i] == '  return (':
        return_line = i

print(f"return_line: {return_line + 1}: {repr(lines[return_line])}")

# The new return + closing brace block (replaces lines[return_line..panel_end] inclusive)
new_return_block = """\
  // Activity logs & notes for this request
  const targetType = "request";
  const targetId = request.id;
  const targetKey = `${targetType}:${String(targetId)}`;
  const allTargetNotes = adminNotes.filter(
    (note) => note.target_type === targetType && String(note.target_id) === String(targetId)
  );
  const allTargetLogs = adminActivityLogs.filter(
    (log) => log.target_type === targetType && String(log.target_id) === String(targetId)
  );
  const LOGS_DEFAULT_LIMIT = 5;
  const visibleLogs = showAllLogs ? allTargetLogs : allTargetLogs.slice(0, LOGS_DEFAULT_LIMIT);

  const tabs = [
    { id: "basic", label: "기본 정보" },
    { id: "operation", label: "운영 정보" },
    { id: "documents", label: "문서" },
    { id: "memo", label: `메모 · 이력${allTargetLogs.length > 0 ? ` (${allTargetLogs.length})` : ""}` },
  ];

  return (
    <div className="admin-detail-tab-panel">
      {/* Tab navigation */}
      <div className="admin-detail-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-detail-tab-btn${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: 기본 정보 ── */}
      {activeTab === "basic" && (
        <div className="admin-detail-tab-content admin-detail-panel">
          <ManagementNumberBlock label="관리번호" value={request.request_no} />

          <div>
            <h3>의뢰 기본 정보</h3>
            <dl className="admin-detail-list compact">
              <Info label="의뢰번호" value={formatManagementNumber(request.request_no)} />
              <Info label="담당자" value={request.manager_name} />
              <Info label="의뢰 유형" value={requestType.label} />
              <Info label="지정 요청 통역사" value={designatedInterpreterName} />
              <Info label="지정 요청 상태" value={designatedRequestCheckStatus} />
              <Info label="배정 통역사" value={assignedInterpreterName} />
              <Info label="약관 동의" value={getAgreementStatusLabel(request)} />
              <Info label="동의 시간" value={formatDateTime(request.agreed_at)} />
              <Info label="이메일" value={request.email} />
              <Info label="연락처" value={request.phone} />
              <Info
                label="행사 기간"
                value={formatDateRange(
                  request.start_date,
                  request.end_date,
                  request.event_date
                )}
              />
              <Info label="근무시간" value={request.work_hours} />
              <Info
                label="희망 레벨"
                value={request.requested_level || request.required_level}
              />
              <Info
                label="필요 인원"
                value={
                  request.requested_people_count || request.required_count
                    ? `${request.requested_people_count || request.required_count}명`
                    : "-"
                }
              />
              <Info label="희망 성별" value={request.preferred_gender} />
              <Info label="언어 방향" value={request.language_direction} />
              <Info label="진행 시간" value={formatTimeRange(request.event_start_time, request.event_end_time)} />
              <Info label="견적 상태" value={getEstimateStatusLabel(request.estimate_status)} />
              <Info label="자료 업로드" value={request.materials_available ? "가능" : "없음/미정"} />
            </dl>
          </div>

          {businessProfile && (
            <div>
              <h3>기업 상세 정보</h3>
              <dl className="admin-detail-list compact">
                <Info label="회사명" value={businessProfile.company_name} />
                <Info label="사업자번호" value={businessProfile.business_number} />
                <Info label="담당자명" value={businessProfile.contact_name} />
                <Info label="담당자 연락처" value={businessProfile.contact_phone} />
                <Info label="담당자 이메일" value={businessProfile.contact_email} />
                <Info label="국가" value={businessProfile.country} />
                <Info label="주요 분야" value={businessProfile.primary_fields?.join(", ") || "-"} />
                <Info label="세금계산서" value={businessProfile.tax_invoice_required ? "필요" : "불필요"} />
                <Info label="기타 메모" value={businessProfile.notes || "-"} />
              </dl>
            </div>
          )}

          <div>
            <h3>기업 히스토리</h3>
            <dl className="admin-detail-list compact">
              <Info label="과거 의뢰" value={`${companyHistory.requestCount}건`} />
              <Info label="진행한 행사" value={companyHistory.events || "-"} />
              <Info label="이용 통역사" value={companyHistory.interpreters || "-"} />
              <Info label="총 이용 금액" value={formatJPY(companyHistory.totalAmount)} />
              <Info label="관리자 메모" value={companyHistory.memo || "-"} />
            </dl>
          </div>

          {companyPreviousRequests.length > 0 && (
            <div>
              <h3>이전 의뢰 기록</h3>
              <div className="admin-previous-requests-list" style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px", background: "#f8fafc" }}>
                {companyPreviousRequests.map(prev => (
                  <div key={prev.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid #f1f5f9", fontSize: "12px" }}>
                    <span style={{ fontWeight: "700" }}>{prev.event_name || prev.title || `REQ-${prev.id}`} ({prev.start_date})</span>
                    <span className="badge-gray" style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
                      {prev.status || prev.matching_status || "접수"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3>기업 내부 메모</h3>
            <textarea
              className="admin-textarea"
              rows={4}
              defaultValue={request.company_internal_memo || ""}
              onBlur={(event) => {
                if (event.target.value !== (request.company_internal_memo || "")) {
                  updateRequest(request.id, { company_internal_memo: event.target.value });
                }
              }}
              placeholder="담당자 특징, 요청사항, 주의사항, 결제 관련 기록"
            />
          </div>

          <div>
            <h3>업무 내용</h3>
            <p>{visibleRequestDescription || "-"}</p>
            <RequestReferenceFileBlock
              file={referenceFile}
              onOpen={handleOpenReferenceFile}
              onDownload={handleDownloadReferenceFile}
            />
            <div style={{ marginTop: "16px" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: "850", color: "#334155" }}>업로드 행사 자료</h4>
              {uploadedMaterials.length === 0 ? (
                <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>업로드된 행사 자료가 없습니다.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {uploadedMaterials.map(mat => (
                    <div key={mat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc", fontSize: "12px" }}>
                      <div>
                        <span className="badge-green" style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", marginRight: "8px" }}>{mat.file_type}</span>
                        <strong style={{ color: "#334155" }}>{mat.file_name}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadMaterial(mat.file_path, mat.file_name)}
                        className="admin-link-button"
                        style={{ fontSize: "11px", color: "#5b5cf0", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                      >
                        다운로드
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <h3 style={{ marginTop: "16px" }}>복장/주의사항</h3>
            <p>{request.dress_code || "추후 안내"}</p>
          </div>
        </div>
      )}

      {/* ── TAB: 운영 정보 ── */}
      {activeTab === "operation" && (
        <div className="admin-detail-tab-content admin-detail-panel">
          <div className="admin-flow-status-panel">
            <h3>운영 단계</h3>
            <OperationFlowStatusControls
              item={flowSource}
              disabled={savingKey === `request-${request.id}`}
              onChange={(changes) => updateRequestFlowStatus(request, changes)}
            />
          </div>

          <div>
            <h3>행사 기간 수정</h3>
            <div className="admin-date-range-panel">
              <DateRangeInput
                required
                label="행사 기간"
                startDate={getDateRangeStart(request.start_date, request.event_date)}
                endDate={getDateRangeEnd(request.end_date, request.event_date)}
                onChange={({ startDate, endDate }) => {
                  if (startDate && endDate && endDate < startDate) {
                    alert("종료일은 시작일보다 빠를 수 없습니다.");
                    return;
                  }
                  updateRequest(request.id, {
                    start_date: startDate,
                    end_date: endDate,
                    event_date: startDate,
                  });
                }}
              />
            </div>
          </div>

          <div>
            <h3>정산 관리</h3>
            <div className="admin-settlement">
              <p className="admin-settlement-note">
                희망 통역 레벨 기준 금액이 자동 입력됩니다. 필요 시 직접 수정할 수 있습니다.
              </p>
              <NumberControl
                label="기업 금액"
                value={getCompanyAmount(request)}
                onChange={(value) => handlePriceDraft(request.id, "company_amount", value)}
              />
              <NumberControl
                label="통역사 지급액"
                value={getInterpreterPayment(request)}
                onChange={(value) =>
                  handlePriceDraft(request.id, "interpreter_payment", value)
                }
              />
              <div className="admin-profit">
                <span>플랫폼 수익</span>
                <strong className={getPlatformProfit(request) < 0 ? "is-negative" : ""}>
                  {formatJPY(getPlatformProfit(request))}
                </strong>
              </div>
              <button
                type="button"
                className="admin-save"
                disabled={savingKey === `request-${request.id}`}
                onClick={() => saveSettlement(request)}
              >
                정산 저장
              </button>
            </div>
          </div>

          <div>
            <h3>매칭 통역사</h3>
            <AssignmentList
              emptyText="미배정"
              items={assignments.map((assignment) => ({
                id: assignment.id,
                assignment,
                label: getAssignedInterpreterLabel(
                  getAssignmentInterpreter(assignment, interpreters)
                ),
              }))}
              onRemove={removeAssignment}
              onToggleContactVisibility={toggleContactVisibility}
            />
            <div className="admin-assign-row">
              <select
                value={assignmentDrafts[request.id] || ""}
                onChange={(event) =>
                  setAssignmentDrafts((current) => ({
                    ...current,
                    [request.id]: event.target.value,
                  }))
                }
              >
                <option value="">통역사 선택</option>
                {assignableInterpreters.map((interpreter) => (
                  <option key={interpreter.id} value={interpreter.id}>
                    {getInterpreterSelectLabel(interpreter)}
                    {hasInterpreterScheduleConflict(
                      getInterpreterScheduleConflicts,
                      interpreter.id,
                      scheduleRange
                    )
                      ? " (일정 충돌)"
                      : ""}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => assignInterpreter(request.id)}>
                배정
              </button>
            </div>
          </div>

          <div>
            <h3>지원자 목록</h3>
            <JobApplicationsPanel
              applications={applications}
              assignments={assignments}
              getInterpreterScheduleConflicts={getInterpreterScheduleConflicts}
              interpreters={interpreters}
              request={request}
              onRemoveAssignment={removeAssignment}
              onStatusChange={updateApplicationStatus}
            />
          </div>

          {["assigned", "preparing", "ready"].includes(request.assignment_status) && (
            <PreparationChecklistPanel requestId={request.id} />
          )}
        </div>
      )}

      {/* ── TAB: 문서 ── */}
      {activeTab === "documents" && (
        <div className="admin-detail-tab-content admin-detail-panel">
          <div>
            <h3>견적서 관리</h3>
            <div className="admin-settlement" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <p className="admin-settlement-note">
                의뢰인용 견적서를 발급하거나 수정할 수 있습니다.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  type="button"
                  className="admin-save"
                  onClick={() => onOpenDocumentPreview("estimate", request)}
                  style={{ width: "auto", minWidth: "150px" }}
                >
                  견적서 생성
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3>업무확인서 관리</h3>
            <div className="admin-settlement" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <p className="admin-settlement-note">
                의뢰 상태가 '완료'일 때만 업무확인서 발급이 가능합니다.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  type="button"
                  className="admin-save"
                  disabled={normalizeOperationStatus(request) !== OPERATION_STATUS.COMPLETED}
                  onClick={() => onOpenDocumentPreview("completion", request)}
                  style={{ width: "auto", minWidth: "150px" }}
                >
                  업무확인서 생성
                </button>
                {normalizeOperationStatus(request) !== OPERATION_STATUS.COMPLETED && (
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#dc2626" }}>
                    ⚠️ 업무 완료 후 생성 가능
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3>발급 문서 관리</h3>
            <div className="admin-settlement" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {(() => {
                const requestDocs = generatedDocuments.filter((doc) => doc.request_id === request.id);
                const latestEstimate = requestDocs
                  .filter((d) => d.document_type === "estimate")
                  .sort((a, b) => b.version - a.version)[0];
                const latestCompletion = requestDocs
                  .filter((d) => d.document_type === "completion")
                  .sort((a, b) => b.version - a.version)[0];

                if (requestDocs.length === 0) {
                  return <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>발급된 문서가 없습니다.</p>;
                }

                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        background: "#f8fafc",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#1e293b", marginRight: "8px" }}>📄 최신 견적서</strong>
                        {latestEstimate ? (
                          <span style={{ color: "#475569" }}>
                            {latestEstimate.document_no} (v{latestEstimate.version})
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>미발급</span>
                        )}
                      </div>
                      {latestEstimate && (
                        <button
                          type="button"
                          className="admin-link-button"
                          onClick={() => openDocumentSignedUrl(supabase, latestEstimate)}
                          style={{ fontSize: "12px", color: "#4f46e5", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                          보기
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        background: "#f8fafc",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#1e293b", marginRight: "8px" }}>📋 최신 업무확인서</strong>
                        {latestCompletion ? (
                          <span style={{ color: "#475569" }}>
                            {latestCompletion.document_no} (v{latestCompletion.version})
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>미발급</span>
                        )}
                      </div>
                      {latestCompletion && (
                        <button
                          type="button"
                          className="admin-link-button"
                          onClick={() => openDocumentSignedUrl(supabase, latestCompletion)}
                          style={{ fontSize: "12px", color: "#4f46e5", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                          보기
                        </button>
                      )}
                    </div>

                    {requestDocs.length > 0 && (
                      <div style={{ marginTop: "8px" }}>
                        <h4 style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#475569", fontWeight: "700" }}>
                          전체 문서 발급 이력 ({requestDocs.length}건)
                        </h4>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            maxHeight: "150px",
                            overflowY: "auto",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            background: "#ffffff",
                          }}
                        >
                          {requestDocs.map((doc) => (
                            <div
                              key={doc.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "12px",
                                padding: "4px 0",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <span style={{ color: "#334155" }}>
                                <strong style={{ color: "#111827", marginRight: "6px" }}>
                                  [{getDocumentTypeLabel(doc.document_type)}]
                                </strong>
                                {doc.document_no} <span style={{ color: "#9ca3af" }}>(v{doc.version})</span>
                              </span>
                              <button
                                type="button"
                                className="admin-link-button"
                                onClick={() => openDocumentSignedUrl(supabase, doc)}
                                style={{ fontSize: "12px", color: "#4f46e5", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                              >
                                보기
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: 메모 · 처리이력 ── */}
      {activeTab === "memo" && (
        <div className="admin-detail-tab-content admin-detail-memo-tab">
          {/* 내부 메모 작성 */}
          <div className="admin-memo-section">
            <h3>내부 메모</h3>
            {allTargetNotes.length === 0 ? (
              <p className="admin-empty-text">아직 등록된 내부 메모가 없습니다.</p>
            ) : (
              <div className="admin-operations-list">
                {allTargetNotes.map((note) => (
                  <article className="admin-operation-log-item" key={note.id}>
                    <p>{note.note}</p>
                    <span>{formatDateTime(note.created_at)}</span>
                  </article>
                ))}
              </div>
            )}
            <label className="admin-field-control admin-note-input" style={{ marginTop: "12px" }}>
              <span>새 메모</span>
              <textarea
                rows={4}
                value={noteDrafts[targetKey] || ""}
                onChange={(event) =>
                  onChangeNoteDraft?.(targetType, targetId, event.target.value)
                }
                placeholder="운영팀 내부 확인 내용을 남겨주세요."
                style={{ resize: "vertical" }}
              />
            </label>
            <button
              type="button"
              className="admin-save"
              disabled={savingKey === `admin-note-request:${request.id}`}
              onClick={() => onCreateNote?.(targetType, targetId)}
            >
              {savingKey === `admin-note-request:${request.id}` ? "저장 중..." : "메모 저장"}
            </button>
          </div>

          {/* 처리 이력 */}
          <div className="admin-memo-section">
            <div className="admin-memo-section-header">
              <h3>처리 이력</h3>
              {allTargetLogs.length > 0 && (
                <span className="admin-log-count-badge">{allTargetLogs.length}건</span>
              )}
            </div>
            {allTargetLogs.length === 0 ? (
              <p className="admin-empty-text">아직 처리 이력이 없습니다.</p>
            ) : (
              <div className="admin-activity-log-list">
                {visibleLogs.map((log) => {
                  const beforeVal = summarizeAdminLogValue(log.before_value);
                  const afterVal = summarizeAdminLogValue(log.after_value);
                  const isMemo = log.action_type === "memo_created";
                  return (
                    <article key={log.id} className="admin-activity-log-card">
                      <div className="admin-activity-log-card-header">
                        <span className={`admin-activity-log-type-badge admin-activity-type-${(log.action_type || "default").replace(/_/g, "-")}`}>
                          {getAdminActionTypeLabel(log.action_type)}
                        </span>
                        <time className="admin-activity-log-time">{formatDateTime(log.created_at)}</time>
                      </div>
                      {!isMemo && (beforeVal || afterVal) && (
                        <div className="admin-activity-log-change">
                          {beforeVal && (
                            <span className="admin-activity-log-before">{beforeVal}</span>
                          )}
                          {beforeVal && afterVal && (
                            <span className="admin-activity-log-arrow">→</span>
                          )}
                          {afterVal && (
                            <span className="admin-activity-log-after">{afterVal}</span>
                          )}
                        </div>
                      )}
                      {isMemo && (
                        <p className="admin-activity-log-desc">관리자가 내부 메모를 추가했습니다.</p>
                      )}
                    </article>
                  );
                })}
                {allTargetLogs.length > LOGS_DEFAULT_LIMIT && (
                  <button
                    type="button"
                    className="admin-log-toggle-btn"
                    onClick={() => setShowAllLogs((v) => !v)}
                  >
                    {showAllLogs
                      ? "▲ 접기"
                      : `▼ 더 보기 (${allTargetLogs.length - LOGS_DEFAULT_LIMIT}건 더)`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}"""

# ── Rebuild the file ──
# Keep: lines before return_line (0..return_line-1)
# Replace: lines[return_line..panel_end] with new block
# Keep: lines after panel_end (panel_end+1..end)

before_part = lines[:return_line]
new_block_lines = new_return_block.split('\n')
after_part = lines[panel_end + 1:]

new_lines = before_part + new_block_lines + after_part
new_content = '\n'.join(new_lines)

with open('/workspaces/onli-platform/src/pages/Admin.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"SUCCESS!")
print(f"Original lines: {len(lines)}")
print(f"Return block replaced: lines {return_line+1} to {panel_end+1} ({panel_end - return_line + 1} lines)")
print(f"New block: {len(new_block_lines)} lines")
print(f"After part: {len(after_part)} lines")
print(f"New total: {len(new_lines)} lines")
