import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import AdminJobs from "./AdminJobs";
import "./Admin.css";

// TODO: 실서비스 전에는 Supabase Auth 관리자 권한 필요.

const TABS = [
  { id: "requests", label: "의뢰 관리" },
  { id: "jobs", label: "통역 공고 관리" },
  { id: "interpreters", label: "통역사 관리" },
  { id: "applications", label: "지원자 관리" },
];
const INTERPRETER_STATUSES = ["active", "warning", "suspended"];
const LEVELS = ["Lv1", "Lv2", "Lv3", "Lv4"];
const REQUEST_STATUSES = [
  "pending",
  "matching",
  "confirmed",
  "completed",
  "cancelled",
];
const CONTACT_STATUSES = [
  "not_contacted",
  "contacted",
  "group_created",
  "meeting_done",
];
const PAYMENT_STATUSES = ["unpaid", "paid"];
const APPLICATION_STATUSES = ["pending", "accepted", "rejected", "cancelled"];
const ONGOING_REQUEST_STATUSES = ["pending", "matching", "confirmed"];
const STATUS_LABELS = {
  active: "활동중",
  warning: "경고",
  suspended: "정지",
  pending: "대기",
  matching: "매칭중",
  confirmed: "확정",
  completed: "완료",
  cancelled: "취소",
  not_contacted: "미연락",
  contacted: "연락완료",
  group_created: "단톡방 생성",
  meeting_done: "미팅완료",
  unpaid: "미결제",
  paid: "결제완료",
  accepted: "수락",
  rejected: "거절",
};

function Admin({ onBackClick, onJobsAdminClick }) {
  const [activeTab, setActiveTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [interpreters, setInterpreters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [expandedInterpreterId, setExpandedInterpreterId] = useState(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [interpreterFilters, setInterpreterFilters] = useState({
    search: "",
    level: "all",
    status: "all",
    approved: "all",
  });
  const [requestFilters, setRequestFilters] = useState({
    search: "",
    date: "",
    status: "all",
    public: "all",
  });

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [requestResult, interpreterResult, assignmentResult, applicationResult] =
      await Promise.all([
        supabase.from("requests").select("*").order("created_at", {
          ascending: false,
          nullsFirst: false,
        }),
        supabase.from("interpreters").select("*").order("id", {
          ascending: false,
        }),
        supabase
          .from("request_interpreters")
          .select(
            "id, request_id, interpreter_id, assigned_at, interpreter:interpreters(id, name, level, status, approved)"
          )
          .order("id", { ascending: false }),
        supabase
          .from("request_applications")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

    if (
      requestResult.error ||
      interpreterResult.error ||
      assignmentResult.error ||
      applicationResult.error
    ) {
      console.error(
        requestResult.error ||
          interpreterResult.error ||
          assignmentResult.error ||
          applicationResult.error
      );
      setErrorMessage("관리자 데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setRequests(requestResult.data || []);
    setInterpreters(interpreterResult.data || []);
    setAssignments(assignmentResult.data || []);
    setApplications(applicationResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(fetchAdminData);
  }, [fetchAdminData]);

  const assignmentsByRequest = useMemo(() => groupBy(assignments, "request_id"), [
    assignments,
  ]);
  const applicationsByRequest = useMemo(
    () => groupBy(applications, "request_id"),
    [applications]
  );
  const requestById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const search = requestFilters.search.trim().toLowerCase();

    return requests.filter((request) => {
      const searchableText = [
        request.company_name,
        request.event_name,
        request.event_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || searchableText.includes(search);
      const matchesDate =
        !requestFilters.date || request.event_date === requestFilters.date;
      const matchesStatus =
        requestFilters.status === "all" ||
        request.status === requestFilters.status;
      const matchesPublic =
        requestFilters.public === "all" ||
        String(Boolean(request.is_public)) === requestFilters.public;

      return matchesSearch && matchesDate && matchesStatus && matchesPublic;
    });
  }, [requestFilters, requests]);

  const filteredInterpreters = useMemo(() => {
    const search = interpreterFilters.search.trim().toLowerCase();

    return interpreters.filter((interpreter) => {
      const searchableText = [
        interpreter.name,
        interpreter.region,
        interpreter.school,
        interpreter.jlpt,
        formatList(interpreter.available_regions),
        formatList(interpreter.specialties),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || searchableText.includes(search);
      const matchesLevel =
        interpreterFilters.level === "all" ||
        interpreter.level === interpreterFilters.level;
      const matchesStatus =
        interpreterFilters.status === "all" ||
        interpreter.status === interpreterFilters.status;
      const matchesApproved =
        interpreterFilters.approved === "all" ||
        String(Boolean(interpreter.approved)) === interpreterFilters.approved;

      return matchesSearch && matchesLevel && matchesStatus && matchesApproved;
    });
  }, [interpreterFilters, interpreters]);

  const dashboard = useMemo(
    () => ({
      totalRequests: requests.length,
      ongoingRequests: requests.filter((request) =>
        ONGOING_REQUEST_STATUSES.includes(request.status || "pending")
      ).length,
      approvedInterpreters: interpreters.filter((item) => item.approved).length,
      pendingApprovals: interpreters.filter((item) => !item.approved).length,
      applications: applications.length,
    }),
    [applications.length, interpreters, requests]
  );

  const updateInterpreter = async (id, changes) => {
    setSavingKey(`interpreter-${id}`);
    const { error } = await supabase
      .from("interpreters")
      .update(changes)
      .eq("id", id);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("통역사 정보 변경에 실패했습니다.");
      return;
    }

    setInterpreters((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item))
    );
  };

  const updateRequest = async (id, changes) => {
    const request = requests.find((item) => item.id === id);
    const nextClientPrice =
      changes.client_price !== undefined
        ? Number(changes.client_price || 0)
        : Number(request?.client_price || 0);
    const nextInterpreterPrice =
      changes.interpreter_price !== undefined
        ? Number(changes.interpreter_price || 0)
        : Number(request?.interpreter_price || 0);
    const payload = {
      ...changes,
      profit: nextClientPrice - nextInterpreterPrice,
    };

    setSavingKey(`request-${id}`);
    const { error } = await supabase
      .from("requests")
      .update(payload)
      .eq("id", id);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("의뢰 정보 변경에 실패했습니다.");
      return;
    }

    setRequests((current) =>
      current.map((item) => (item.id === id ? { ...item, ...payload } : item))
    );
  };

  const handlePriceDraft = (requestId, field, value) => {
    setRequests((current) =>
      current.map((request) => {
        if (request.id !== requestId) return request;
        const nextRequest = { ...request, [field]: value };
        nextRequest.profit =
          Number(nextRequest.client_price || 0) -
          Number(nextRequest.interpreter_price || 0);
        return nextRequest;
      })
    );
  };

  const assignInterpreter = async (requestId) => {
    const interpreterId = Number(assignmentDrafts[requestId]);

    if (!interpreterId) {
      alert("배정할 통역사를 선택해주세요.");
      return;
    }

    setSavingKey(`assign-${requestId}`);
    const { error } = await supabase.from("request_interpreters").insert([
      {
        request_id: requestId,
        interpreter_id: interpreterId,
      },
    ]);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert(
        error.code === "23505"
          ? "이미 배정된 통역사입니다."
          : "통역사 배정에 실패했습니다."
      );
      return;
    }

    setAssignmentDrafts((current) => ({ ...current, [requestId]: "" }));
    fetchAdminData();
  };

  const removeAssignment = async (assignmentId) => {
    setSavingKey(`assignment-${assignmentId}`);
    const { error } = await supabase
      .from("request_interpreters")
      .delete()
      .eq("id", assignmentId);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("배정 해제에 실패했습니다.");
      return;
    }

    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== assignmentId)
    );
  };

  const updateApplicationStatus = async (application, status) => {
    setSavingKey(`application-${application.id}`);
    const { error } = await supabase
      .from("request_applications")
      .update({ status })
      .eq("id", application.id);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert("지원 상태 변경에 실패했습니다.");
      return;
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === application.id ? { ...item, status } : item
      )
    );
  };

  const assignAcceptedApplication = async (application) => {
    if (!application.interpreter_id) {
      alert(
        "로그인 없는 지원이라 연결된 interpreter_id가 없습니다. 등록 통역사 계정 연결 후 배정할 수 있습니다."
      );
      return;
    }

    setSavingKey(`application-assign-${application.id}`);
    const { error } = await supabase.from("request_interpreters").insert([
      {
        request_id: application.request_id,
        interpreter_id: application.interpreter_id,
      },
    ]);
    setSavingKey("");

    if (error) {
      console.error(error);
      alert(
        error.code === "23505"
          ? "이미 배정된 통역사입니다."
          : "지원자 배정에 실패했습니다."
      );
      return;
    }

    fetchAdminData();
  };

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <button type="button" onClick={onBackClick} className="admin-back">
          ← 메인으로
        </button>

        <header className="admin-header">
          <div>
            <p className="admin-kicker">ON-LI ADMIN</p>
            <h1>운영 대시보드</h1>
            <p>필요한 항목만 빠르게 확인하고 상태를 변경합니다.</p>
          </div>

          <button type="button" onClick={fetchAdminData} className="admin-refresh">
            새로고침
          </button>
        </header>

        {loading ? (
          <MessageBox text="관리자 데이터를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : (
          <>
            <section className="admin-metrics">
              <MetricCard label="전체 의뢰" value={`${dashboard.totalRequests}건`} />
              <MetricCard
                label="진행중 의뢰"
                value={`${dashboard.ongoingRequests}건`}
              />
              <MetricCard
                label="승인 통역사"
                value={`${dashboard.approvedInterpreters}명`}
              />
              <MetricCard
                label="승인 대기"
                value={`${dashboard.pendingApprovals}명`}
              />
              <MetricCard label="지원자" value={`${dashboard.applications}명`} />
            </section>

            <nav className="admin-tabs" aria-label="관리자 메뉴">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "is-active" : ""}
                  onClick={() => {
                    if (tab.id === "jobs") {
                      onJobsAdminClick();
                      return;
                    }
                    setActiveTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {activeTab === "requests" && (
              <RequestManagement
                applicationsByRequest={applicationsByRequest}
                assignmentDrafts={assignmentDrafts}
                assignmentsByRequest={assignmentsByRequest}
                expandedRequestId={expandedRequestId}
                filters={requestFilters}
                interpreters={interpreters}
                requests={filteredRequests}
                savingKey={savingKey}
                setAssignmentDrafts={setAssignmentDrafts}
                setExpandedRequestId={setExpandedRequestId}
                setFilters={setRequestFilters}
                assignInterpreter={assignInterpreter}
                handlePriceDraft={handlePriceDraft}
                removeAssignment={removeAssignment}
                updateApplicationStatus={updateApplicationStatus}
                updateRequest={updateRequest}
              />
            )}

            {activeTab === "interpreters" && (
              <InterpreterManagement
                expandedInterpreterId={expandedInterpreterId}
                filters={interpreterFilters}
                interpreters={filteredInterpreters}
                savingKey={savingKey}
                setExpandedInterpreterId={setExpandedInterpreterId}
                setFilters={setInterpreterFilters}
                setInterpreters={setInterpreters}
                updateInterpreter={updateInterpreter}
              />
            )}

            {activeTab === "jobs" && <AdminJobs embedded />}

            {activeTab === "applications" && (
              <ApplicationManagement
                applications={applications}
                requestById={requestById}
                savingKey={savingKey}
                assignAcceptedApplication={assignAcceptedApplication}
                updateApplicationStatus={updateApplicationStatus}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RequestManagement({
  applicationsByRequest,
  assignmentDrafts,
  assignmentsByRequest,
  expandedRequestId,
  filters,
  interpreters,
  requests,
  savingKey,
  setAssignmentDrafts,
  setExpandedRequestId,
  setFilters,
  assignInterpreter,
  handlePriceDraft,
  removeAssignment,
  updateApplicationStatus,
  updateRequest,
}) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${requests.length}건`} title="의뢰 관리" />
      <div className="admin-filters admin-request-filters">
        <input
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="기업명/행사명 검색"
        />
        <input
          type="date"
          value={filters.date}
          onChange={(event) =>
            setFilters((current) => ({ ...current, date: event.target.value }))
          }
        />
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">전체 상태</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusLabel(status)}
            </option>
          ))}
        </select>
        <select
          value={filters.public}
          onChange={(event) =>
            setFilters((current) => ({ ...current, public: event.target.value }))
          }
        >
          <option value="all">공개 전체</option>
          <option value="true">공개</option>
          <option value="false">비공개</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>행사명</th>
              <th>기업명</th>
              <th>날짜</th>
              <th>장소</th>
              <th>지원자</th>
              <th>의뢰 상태</th>
              <th>연락 상태</th>
              <th>결제 상태</th>
              <th>공고 공개</th>
              <th>상세/수정</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <EmptyTableRow colSpan="11" text="조건에 맞는 의뢰가 없습니다." />
            ) : (
              requests.map((request) => (
                <FragmentRequestRow
                  key={request.id}
                  applications={applicationsByRequest.get(request.id) || []}
                  assignmentDrafts={assignmentDrafts}
                  assignments={assignmentsByRequest.get(request.id) || []}
                  expanded={expandedRequestId === request.id}
                  interpreters={interpreters}
                  request={request}
                  savingKey={savingKey}
                  setAssignmentDrafts={setAssignmentDrafts}
                  setExpandedRequestId={setExpandedRequestId}
                  assignInterpreter={assignInterpreter}
                  handlePriceDraft={handlePriceDraft}
                  removeAssignment={removeAssignment}
                  updateApplicationStatus={updateApplicationStatus}
                  updateRequest={updateRequest}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentRequestRow({
  applications,
  assignmentDrafts,
  assignments,
  expanded,
  interpreters,
  request,
  savingKey,
  setAssignmentDrafts,
  setExpandedRequestId,
  assignInterpreter,
  handlePriceDraft,
  removeAssignment,
  updateApplicationStatus,
  updateRequest,
}) {
  return (
    <>
      <tr>
        <td>#{request.id}</td>
        <td className="admin-strong-cell">{request.event_name || "-"}</td>
        <td>{request.company_name || "-"}</td>
        <td>{request.event_date || "-"}</td>
        <td>{request.event_location || "-"}</td>
        <td>{applications.length}명</td>
        <td>
          <InlineSelect
            options={REQUEST_STATUSES}
            value={request.status || "pending"}
            onChange={(value) => updateRequest(request.id, { status: value })}
          />
        </td>
        <td>
          <InlineSelect
            options={CONTACT_STATUSES}
            value={request.contact_status || "not_contacted"}
            onChange={(value) =>
              updateRequest(request.id, { contact_status: value })
            }
          />
        </td>
        <td>
          <InlineSelect
            options={PAYMENT_STATUSES}
            value={request.payment_status || "unpaid"}
            onChange={(value) =>
              updateRequest(request.id, { payment_status: value })
            }
          />
        </td>
        <td>
          <InlineSelect
            options={[
              { label: "비공개", value: "false" },
              { label: "공개", value: "true" },
            ]}
            value={String(Boolean(request.is_public))}
            onChange={(value) =>
              updateRequest(request.id, { is_public: value === "true" })
            }
          />
        </td>
        <td>
          <button
            type="button"
            className="admin-link-button"
            onClick={() => setExpandedRequestId(expanded ? null : request.id)}
          >
            {expanded ? "닫기" : "상세 보기"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="admin-expanded-row">
          <td colSpan="11">
            <RequestDetailPanel
              applications={applications}
              assignmentDrafts={assignmentDrafts}
              assignments={assignments}
              interpreters={interpreters}
              request={request}
              savingKey={savingKey}
              setAssignmentDrafts={setAssignmentDrafts}
              assignInterpreter={assignInterpreter}
              handlePriceDraft={handlePriceDraft}
              removeAssignment={removeAssignment}
              updateApplicationStatus={updateApplicationStatus}
              updateRequest={updateRequest}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RequestDetailPanel({
  applications,
  assignmentDrafts,
  assignments,
  interpreters,
  request,
  savingKey,
  setAssignmentDrafts,
  assignInterpreter,
  handlePriceDraft,
  removeAssignment,
  updateApplicationStatus,
  updateRequest,
}) {
  return (
    <div className="admin-detail-panel">
      <div>
        <h3>의뢰 기본 정보</h3>
        <dl className="admin-detail-list compact">
          <Info label="담당자" value={request.manager_name} />
          <Info label="이메일" value={request.email} />
          <Info label="연락처" value={request.phone} />
          <Info label="근무시간" value={request.work_hours} />
          <Info
            label="희망 통역 레벨"
            value={request.requested_level || request.required_level}
          />
          <Info
            label="필요 인원 수"
            value={
              request.requested_people_count || request.required_count
                ? `${request.requested_people_count || request.required_count}명`
                : "-"
            }
          />
          <Info label="희망 성별" value={request.preferred_gender} />
        </dl>
      </div>

      <div>
        <h3>업무 내용</h3>
        <p>{request.job_description || request.request_detail || "-"}</p>
        <h3>복장/주의사항</h3>
        <p>{request.dress_code || "추후 안내"}</p>
      </div>

      <div>
        <h3>정산 관리</h3>
        <div className="admin-settlement">
          <NumberControl
            label="기업 금액"
            value={request.client_price || 0}
            onChange={(value) => handlePriceDraft(request.id, "client_price", value)}
          />
          <NumberControl
            label="통역사 지급"
            value={request.interpreter_price || 0}
            onChange={(value) =>
              handlePriceDraft(request.id, "interpreter_price", value)
            }
          />
          <div className="admin-profit">
            <span>플랫폼 수익</span>
            <strong>{formatKRW(request.profit || 0)}</strong>
          </div>
          <button
            type="button"
            className="admin-save"
            disabled={savingKey === `request-${request.id}`}
            onClick={() =>
              updateRequest(request.id, {
                client_price: Number(request.client_price || 0),
                interpreter_price: Number(request.interpreter_price || 0),
              })
            }
          >
            정산 저장
          </button>
        </div>
      </div>

      <div>
        <h3>매칭 통역사</h3>
        <ChipList
          emptyText="미배정"
          items={assignments.map((assignment) => ({
            id: assignment.id,
            label: assignment.interpreter?.name || "이름 미입력",
          }))}
          onRemove={removeAssignment}
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
            {interpreters
              .filter(
                (interpreter) =>
                  interpreter.approved && interpreter.status !== "suspended"
              )
              .map((interpreter) => (
                <option key={interpreter.id} value={interpreter.id}>
                  {interpreter.name || "이름 미입력"} · {interpreter.level || "Lv 미정"}
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
        {applications.length === 0 ? (
          <span className="admin-empty-chip">지원자 없음</span>
        ) : (
          <div className="admin-application-list">
            {applications.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                compact
                updateApplicationStatus={updateApplicationStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InterpreterManagement({
  expandedInterpreterId,
  filters,
  interpreters,
  savingKey,
  setExpandedInterpreterId,
  setFilters,
  setInterpreters,
  updateInterpreter,
}) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${interpreters.length}명`} title="통역사 관리" />
      <div className="admin-filters">
        <input
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="이름, 지역, 학교, JLPT 검색"
        />
        <select
          value={filters.level}
          onChange={(event) =>
            setFilters((current) => ({ ...current, level: event.target.value }))
          }
        >
          <option value="all">전체 레벨</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="all">전체 상태</option>
          {INTERPRETER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusLabel(status)}
            </option>
          ))}
        </select>
        <select
          value={filters.approved}
          onChange={(event) =>
            setFilters((current) => ({ ...current, approved: event.target.value }))
          }
        >
          <option value="all">전체 승인</option>
          <option value="true">승인</option>
          <option value="false">미승인</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>레벨</th>
              <th>JLPT</th>
              <th>경험</th>
              <th>전문 분야</th>
              <th>승인</th>
              <th>활동 상태</th>
              <th>경고</th>
              <th>상세/수정</th>
            </tr>
          </thead>
          <tbody>
            {interpreters.length === 0 ? (
              <EmptyTableRow colSpan="9" text="조건에 맞는 통역사가 없습니다." />
            ) : (
              interpreters.map((interpreter) => (
                <FragmentInterpreterRow
                  key={interpreter.id}
                  expanded={expandedInterpreterId === interpreter.id}
                  interpreter={interpreter}
                  savingKey={savingKey}
                  setExpandedInterpreterId={setExpandedInterpreterId}
                  setInterpreters={setInterpreters}
                  updateInterpreter={updateInterpreter}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentInterpreterRow({
  expanded,
  interpreter,
  savingKey,
  setExpandedInterpreterId,
  setInterpreters,
  updateInterpreter,
}) {
  return (
    <>
      <tr>
        <td className="admin-strong-cell">{interpreter.name || "이름 미입력"}</td>
        <td>
          <InlineSelect
            options={LEVELS}
            value={interpreter.level || "Lv1"}
            onChange={(value) => updateInterpreter(interpreter.id, { level: value })}
          />
        </td>
        <td>{interpreter.jlpt || "-"}</td>
        <td>{getExperienceLabel(interpreter)}</td>
        <td>{formatList(interpreter.specialties)}</td>
        <td>
          <div className="admin-approval-cell">
            <span
              className={
                interpreter.approved ? "admin-approved" : "admin-pending"
              }
            >
              {interpreter.approved ? "승인" : "미승인"}
            </span>
            <InlineSelect
              options={[
                { label: "미승인", value: "false" },
                { label: "승인", value: "true" },
              ]}
              value={String(Boolean(interpreter.approved))}
              onChange={(value) =>
                updateInterpreter(interpreter.id, { approved: value === "true" })
              }
            />
          </div>
        </td>
        <td>
          <InlineSelect
            options={INTERPRETER_STATUSES}
            value={interpreter.status || "active"}
            onChange={(value) => updateInterpreter(interpreter.id, { status: value })}
          />
        </td>
        <td>{interpreter.warning_count || 0}회</td>
        <td>
          <button
            type="button"
            className="admin-link-button"
            onClick={() =>
              setExpandedInterpreterId(expanded ? null : interpreter.id)
            }
          >
            {expanded ? "닫기" : "상세 보기"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="admin-expanded-row">
          <td colSpan="9">
            <InterpreterDetailPanel
              interpreter={interpreter}
              savingKey={savingKey}
              setInterpreters={setInterpreters}
              updateInterpreter={updateInterpreter}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function InterpreterDetailPanel({
  interpreter,
  savingKey,
  setInterpreters,
  updateInterpreter,
}) {
  return (
    <div className="admin-detail-panel interpreter-detail">
      <dl className="admin-detail-list">
        <Info label="연락처" value={interpreter.phone} />
        <Info label="이메일" value={interpreter.email} />
        <Info label="카카오/라인" value={interpreter.kakao_or_line} />
        <Info label="학교/전공" value={interpreter.school} />
        <Info label="거주 지역" value={interpreter.region} />
        <Info label="가능 지역" value={formatList(interpreter.available_regions)} />
        <Info label="전문 분야" value={formatList(interpreter.specialties)} />
        <Info label="가능 업무" value={interpreter.available_tasks} />
      </dl>

      <div>
        <h3>운영 상태</h3>
        <div className="admin-settlement">
          <NumberControl
            label="경고 횟수"
            value={interpreter.warning_count || 0}
            onChange={(value) =>
              setInterpreters((current) =>
                current.map((item) =>
                  item.id === interpreter.id
                    ? { ...item, warning_count: Math.max(0, Number(value || 0)) }
                    : item
                )
              )
            }
          />
          <button
            type="button"
            className="admin-save"
            disabled={savingKey === `interpreter-${interpreter.id}`}
            onClick={() =>
              updateInterpreter(interpreter.id, {
                warning_count: Number(interpreter.warning_count || 0),
                status:
                  Number(interpreter.warning_count || 0) > 0
                    ? "warning"
                    : interpreter.status,
              })
            }
          >
            경고 저장
          </button>
          <button
            type="button"
            className="admin-save dark"
            disabled={savingKey === `interpreter-${interpreter.id}`}
            onClick={() =>
              updateInterpreter(interpreter.id, {
                approved: !interpreter.approved,
              })
            }
          >
            {interpreter.approved ? "미승인으로 변경" : "승인하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicationManagement({
  applications,
  requestById,
  savingKey,
  assignAcceptedApplication,
  updateApplicationStatus,
}) {
  return (
    <section className="admin-section">
      <SectionTitle count={`${applications.length}명`} title="지원자 관리" />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>지원자</th>
              <th>공고</th>
              <th>이메일</th>
              <th>지원일</th>
              <th>상태</th>
              <th>배정</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <EmptyTableRow colSpan="6" text="아직 접수된 지원자가 없습니다." />
            ) : (
              applications.map((application) => (
                <tr key={application.id}>
                  <td className="admin-strong-cell">
                    {application.applicant_name || "이름 미입력"}
                  </td>
                  <td>
                    {requestById.get(application.request_id)?.event_name ||
                      `#${application.request_id}`}
                  </td>
                  <td>{application.applicant_email || "이메일 미입력"}</td>
                  <td>{formatDate(application.created_at)}</td>
                  <td>
                    <InlineSelect
                      options={APPLICATION_STATUSES}
                      value={application.status || "pending"}
                      onChange={(value) =>
                        updateApplicationStatus(application, value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin-link-button"
                      disabled={
                        application.status !== "accepted" ||
                        savingKey === `application-assign-${application.id}`
                      }
                      onClick={() => assignAcceptedApplication(application)}
                    >
                      배정 준비
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApplicationCard({ application, updateApplicationStatus }) {
  return (
    <article className="admin-application-card">
      <div>
        <strong>{application.applicant_name || "이름 미입력"}</strong>
        <span>{application.applicant_email || "이메일 미입력"} · ON-LI 운영팀 중개</span>
        <p>{application.message || "지원 메시지 없음"}</p>
      </div>
      <InlineSelect
        options={APPLICATION_STATUSES}
        value={application.status || "pending"}
        onChange={(value) => updateApplicationStatus(application, value)}
      />
    </article>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SectionTitle({ count, title }) {
  return (
    <div className="admin-section-title">
      <div>
        <p className="admin-kicker">MANAGE</p>
        <h2>{title}</h2>
      </div>
      <span className="admin-count">{count}</span>
    </div>
  );
}

function InlineSelect({ options, value, onChange }) {
  return (
    <select
      className="admin-inline-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => {
        const normalized =
          typeof option === "string" ? { label: getStatusLabel(option), value: option } : option;
        return (
          <option key={normalized.value} value={normalized.value}>
            {normalized.label}
          </option>
        );
      })}
    </select>
  );
}

function NumberControl({ label, value, onChange }) {
  return (
    <label className="admin-field-control">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function EmptyTableRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="admin-empty-row">
        {text}
      </td>
    </tr>
  );
}

function ChipList({ emptyText, items, onRemove }) {
  if (items.length === 0) {
    return <span className="admin-empty-chip">{emptyText}</span>;
  }

  return (
    <div className="admin-chip-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="admin-chip"
          onClick={() => onRemove(item.id)}
        >
          {item.label} ×
        </button>
      ))}
    </div>
  );
}

function MessageBox({ text }) {
  return <div className="admin-message">{text}</div>;
}

function formatKRW(value) {
  return `₩${Number(value || 0).toLocaleString()}`;
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function formatList(value) {
  if (Array.isArray(value) && value.length > 0) return value.join(", ");
  return value || "-";
}

function getExperienceLabel(interpreter) {
  const rawExperience =
    interpreter.interpretation_experience || interpreter.experience_count;
  const numericExperience = Number(rawExperience);

  if (!rawExperience && rawExperience !== 0) return "-";
  if (Number.isNaN(numericExperience)) return String(rawExperience);
  if (numericExperience >= 10) return "10회 이상";
  return `${numericExperience}회`;
}

function groupBy(items, key) {
  return items.reduce((map, item) => {
    const list = map.get(item[key]) || [];
    map.set(item[key], [...list, item]);
    return map;
  }, new Map());
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "-";
}

export default Admin;
