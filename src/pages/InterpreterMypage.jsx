import { useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
  getApplicationStatusLabel,
  getMatchingStatusLabel,
  getStatusBadgeClass,
} from "../utils/status";
import { normalizeLevel } from "../utils/levelBadge";
import "./InterpreterAuth.css";

const TABS = [
  { id: "profile", label: "프로필 정보", icon: "👤" },
  { id: "applications", label: "지원 내역", icon: "📄" },
  { id: "assignments", label: "배정 내역", icon: "💼" },
  { id: "schedule", label: "일정 및 캘린더", icon: "📅" },
];

function InterpreterMypage({
  authLoading,
  user,
  onLoginClick,
  onRegisterClick,
  onHomeClick,
  onSignOut,
}) {
  const [interpreter, setInterpreter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("loading");

  // Dynamic dashboard states
  const [applications, setApplications] = useState([]);
  const [matchings, setMatchings] = useState([]);
  const [activeTab, setActiveTab] = useState("profile");
  const [loadingData, setLoadingData] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Profile Edit Mode States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    gender: "",
    level: "Lv1",
  });
  const [specialtiesInput, setSpecialtiesInput] = useState("");
  const [regionsInput, setRegionsInput] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const handleStartEdit = () => {
    if (!interpreter) return;
    setEditForm({
      name: interpreter.name || "",
      phone: interpreter.phone || "",
      gender: interpreter.gender || "",
      level: interpreter.level || "Lv1",
    });
    setSpecialtiesInput(
      Array.isArray(interpreter.specialties)
        ? interpreter.specialties.filter(Boolean).join(", ")
        : ""
    );
    setRegionsInput(
      Array.isArray(interpreter.available_regions)
        ? interpreter.available_regions.filter(Boolean).join(", ")
        : ""
    );
    setIsEditingProfile(true);
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (isUpdatingProfile || !supabase || !interpreter) return;
    setIsUpdatingProfile(true);

    const specialties = specialtiesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const available_regions = regionsInput
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    const payload = {
      name: editForm.name,
      phone: editForm.phone,
      gender: editForm.gender,
      level: editForm.level,
      specialties,
      available_regions,
    };

    const { data, error } = await supabase
      .from("interpreters")
      .update(payload)
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update interpreter profile", error);
      alert("프로필 수정에 실패했습니다. 다시 시도해주세요.");
    } else {
      setInterpreter(data);
      setIsEditingProfile(false);
      alert("프로필 정보가 성공적으로 수정되었습니다.");
    }
    setIsUpdatingProfile(false);
  };

  const fetchApplicationsData = async (interpreterId) => {
    if (!supabase) return [];
    
    // Attempt joined query
    const { data, error } = await supabase
      .from("job_applications")
      .select(`
        id,
        application_no,
        job_id,
        applicant_name,
        phone,
        email,
        message,
        status,
        created_at,
        jobs (
          id,
          job_no,
          title,
          location,
          start_date,
          end_date,
          language
        )
      `)
      .eq("interpreter_id", interpreterId);

    if (error) {
      console.warn("Direct job_applications join failed, attempting fallback", error);
      // Fallback: fetch job_applications then fetch jobs separately
      const { data: apps, error: appsErr } = await supabase
        .from("job_applications")
        .select("*")
        .eq("interpreter_id", interpreterId);

      if (appsErr) {
        console.error("Fallback job_applications fetch failed", appsErr);
        return [];
      }

      if (!apps || apps.length === 0) return [];

      const jobIds = [...new Set(apps.map((a) => a.job_id).filter(Boolean))];
      if (jobIds.length === 0) {
        return apps.map((a) => ({ ...a, jobs: null }));
      }

      const { data: jobsList, error: jobsErr } = await supabase
        .from("jobs")
        .select("*")
        .in("id", jobIds);

      if (jobsErr) {
        console.error("Fallback jobs fetch failed", jobsErr);
        return apps.map((a) => ({ ...a, jobs: null }));
      }

      const jobsMap = new Map(jobsList.map((j) => [j.id, j]));
      return apps.map((a) => ({
        ...a,
        jobs: jobsMap.get(a.job_id) || null,
      }));
    }

    return data || [];
  };

  const fetchMatchingsData = async (interpreterId) => {
    if (!supabase) return [];

    // Attempt joined query
    const { data, error } = await supabase
      .from("matchings")
      .select(`
        id,
        matching_no,
        job_id,
        start_date,
        end_date,
        status,
        jobs (
          id,
          job_no,
          title,
          company_name,
          location,
          language
        )
      `)
      .eq("interpreter_id", interpreterId);

    if (error) {
      console.warn("Direct matchings join failed, attempting fallback", error);
      // Fallback
      const { data: mats, error: matsErr } = await supabase
        .from("matchings")
        .select("*")
        .eq("interpreter_id", interpreterId);

      if (matsErr) {
        console.error("Fallback matchings fetch failed", matsErr);
        return [];
      }

      if (!mats || mats.length === 0) return [];

      const jobIds = [...new Set(mats.map((m) => m.job_id).filter(Boolean))];
      if (jobIds.length === 0) {
        return mats.map((m) => ({ ...m, jobs: null }));
      }

      const { data: jobsList, error: jobsErr } = await supabase
        .from("jobs")
        .select("*")
        .in("id", jobIds);

      if (jobsErr) {
        console.error("Fallback jobs fetch failed for matchings", jobsErr);
        return mats.map((m) => ({ ...m, jobs: null }));
      }

      const jobsMap = new Map(jobsList.map((j) => [j.id, j]));
      return mats.map((m) => ({
        ...m,
        jobs: jobsMap.get(m.job_id) || null,
      }));
    }

    return data || [];
  };

  useEffect(() => {
    const fetchInterpreter = async () => {
      if (authLoading) return;

      if (!user) {
        setStatus("signedOut");
        setLoading(false);
        return;
      }

      if (!supabase) {
        setMessage(supabaseConfigError.message);
        setStatus("error");
        setLoading(false);
        return;
      }

      const normalizedUserEmail = normalizeEmail(user.email);
      if (!normalizedUserEmail) {
        setMessage("로그인 계정 이메일을 확인할 수 없습니다.");
        setStatus("error");
        setLoading(false);
        return;
      }

      setLoading(true);
      setMessage("");
      setStatus("loading");
      console.log("current user:", user);

      const { data, error } = await supabase
        .from("interpreters")
        .select("*")
        .ilike("email", normalizedUserEmail);

      if (error) {
        console.error("Interpreter profile fetch failed", error);
        setMessage("통역사 정보를 불러오지 못했습니다.");
        setStatus("error");
        setLoading(false);
        return;
      }

      let matches = (data || []).filter(
        (item) => normalizeEmail(item.email) === normalizedUserEmail
      );

      if (matches.length === 0) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("interpreters")
          .select("*");

        if (fallbackError) {
          console.error("Interpreter profile fallback fetch failed", fallbackError);
          setMessage("통역사 정보를 불러오지 못했습니다.");
          setStatus("error");
          setLoading(false);
          return;
        }

        matches = (fallbackData || []).filter(
          (item) => normalizeEmail(item.email) === normalizedUserEmail
        );
      }

      if (matches.length > 1) {
        console.warn("Duplicate interpreter email found", {
          email: normalizedUserEmail,
          ids: matches.map((item) => item.id),
        });
      }

      const nextInterpreter = matches[0] || null;
      setInterpreter(nextInterpreter);
      setStatus(nextInterpreter ? "ready" : "notRegistered");

      if (nextInterpreter) {
        // Link auth_user_id if not present
        if (
          Object.prototype.hasOwnProperty.call(nextInterpreter, "auth_user_id") &&
          !nextInterpreter.auth_user_id
        ) {
          const { data: updated, error: updateError } = await supabase
            .from("interpreters")
            .update({ auth_user_id: user.id })
            .eq("id", nextInterpreter.id)
            .select("*")
            .single();

          if (updateError) {
            console.warn("Interpreter auth_user_id update skipped", updateError);
          } else {
            setInterpreter(updated || nextInterpreter);
          }
        }

        // Fetch applications and matchings dynamically
        setLoadingData(true);
        try {
          const [apps, mats] = await Promise.all([
            fetchApplicationsData(nextInterpreter.id),
            fetchMatchingsData(nextInterpreter.id),
          ]);
          setApplications(apps);
          setMatchings(mats);
        } catch (err) {
          console.error("Failed to load applications/matchings", err);
        } finally {
          setLoadingData(false);
        }
      }

      setLoading(false);
    };

    queueMicrotask(fetchInterpreter);
  }, [authLoading, user]);

  const handleUpdateActivityStatus = async (newStatus) => {
    if (!interpreter || isUpdatingStatus || !supabase) return;
    setIsUpdatingStatus(true);

    const { data, error } = await supabase
      .from("interpreters")
      .update({ activity_status: newStatus })
      .eq("id", interpreter.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update activity status", error);
      alert("활동 상태 변경에 실패했습니다. 다시 시도해주세요.");
    } else {
      setInterpreter(data || { ...interpreter, activity_status: newStatus });
    }
    setIsUpdatingStatus(false);
  };

  if (authLoading || loading) {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>마이페이지를 준비 중입니다.</h1>
          <p>로그인 상태와 통역사 정보를 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>로그인이 필요합니다.</h1>
          <p>통역사 계정으로 로그인해주세요.</p>
          <div className="interpreter-auth-form">
            <button type="button" className="interpreter-auth-primary" onClick={onLoginClick}>
              통역사 로그인
            </button>
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로 돌아가기
            </button>
          </div>
        </section>
      </main>
    );
  }

  const activityStatus = getActivityStatus(interpreter);

  return (
    <main className="interpreter-mypage">
      <div className="interpreter-mypage-shell">
        <section className="interpreter-mypage-head">
          <div className="interpreter-mypage-userinfo">
            <p className="interpreter-auth-kicker">ON-LI INTERPRETER PROFILE</p>
            <h1>{interpreter ? `${interpreter.name} 통역사 마이페이지` : "통역사 마이페이지"}</h1>
            <p className="interpreter-mypage-email">{interpreter?.email || user.email}</p>
          </div>
          <div className="interpreter-mypage-actions">
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로
            </button>
            <button type="button" className="interpreter-auth-primary" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </section>

        {status === "error" && message && (
          <p className="interpreter-auth-message is-error">{message}</p>
        )}

        {status === "notRegistered" ? (
          <section className="interpreter-mypage-grid is-unregistered">
            <article className="interpreter-mypage-card">
              <h2>프로필 미등록 상태</h2>
              <p style={{ margin: "20px 0", lineHeight: "1.7", color: "#6b7280" }}>
                아직 이 계정({user.email})으로 등록된 통역사 프로필이 없습니다.
                통역 서비스 이용 및 공고 지원을 위해 아래 통역사 등록을 먼저 완료해주세요.
              </p>
              <div className="interpreter-mypage-actions">
                <button
                  type="button"
                  className="interpreter-auth-primary"
                  onClick={onRegisterClick}
                >
                  통역사 등록하기
                </button>
              </div>
            </article>
          </section>
        ) : (
          <>
            {/* Quick Metrics Dashboard Row */}
            <section className="interpreter-mypage-stats">
              <div className="mypage-stat-card">
                <span className="stat-icon">📄</span>
                <div className="stat-details">
                  <span className="stat-label">총 지원 건수</span>
                  <span className="stat-value">{applications.length}건</span>
                </div>
              </div>
              <div className="mypage-stat-card">
                <span className="stat-icon">💼</span>
                <div className="stat-details">
                  <span className="stat-label">배정 완료</span>
                  <span className="stat-value">
                    {
                      matchings.filter((m) =>
                        ["assigned", "confirmed", "in_progress", "completed", "settled"].includes(
                          String(m.status || "").toLowerCase()
                        )
                      ).length
                    }건
                  </span>
                </div>
              </div>
              <div className="mypage-stat-card">
                <span className="stat-icon">🌟</span>
                <div className="stat-details">
                  <span className="stat-label">전문 레벨</span>
                  <span className="stat-value">{normalizeLevel(interpreter?.level || "Lv1")}</span>
                </div>
              </div>
              <div className="mypage-stat-card">
                <span className="stat-icon">🟢</span>
                <div className="stat-details">
                  <span className="stat-label">활동 상태</span>
                  <span className={`stat-value status-${activityStatus}`}>
                    {getInterpreterActivityStatusLabel(activityStatus)}
                  </span>
                </div>
              </div>
            </section>

            {/* Dashboard Workspace */}
            <section className="interpreter-mypage-grid">
              {/* Sidebar Tabs */}
              <div className="interpreter-mypage-tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`mypage-tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="tab-icon">{tab.icon}</span>
                    <span className="tab-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Dynamic Content Pane */}
              <div className="interpreter-mypage-tab-pane">
                {activeTab === "profile" && interpreter && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <div className="card-header-with-action">
                      <h2>프로필 정보</h2>
                      <div className="profile-header-actions" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        {!isEditingProfile && (
                          <button
                            type="button"
                            className="interpreter-auth-secondary edit-btn"
                            onClick={handleStartEdit}
                            style={{ padding: "6px 12px", fontSize: "13px", height: "36px", display: "flex", alignItems: "center", gap: "6px", margin: 0 }}
                          >
                            ✏️ 프로필 수정
                          </button>
                        )}
                        <div className="status-selector-wrapper">
                          <label htmlFor="activity-status-select">활동 상태 수정:</label>
                          <select
                            id="activity-status-select"
                            value={activityStatus}
                            disabled={isUpdatingStatus}
                            onChange={(e) => handleUpdateActivityStatus(e.target.value)}
                            className="interpreter-status-select"
                          >
                            <option value="active">활동중 (공고 매칭 수신)</option>
                            <option value="paused">일시중지 (배정 제외)</option>
                            <option value="inactive">비활성 (활동 안함)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {isEditingProfile ? (
                      <form onSubmit={handleUpdateProfile} className="interpreter-edit-profile-form" style={{ marginTop: "20px" }}>
                        <div className="form-group-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                          <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>이름</span>
                            <input
                              type="text"
                              name="name"
                              value={editForm.name}
                              onChange={handleEditFormChange}
                              required
                              style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                            />
                          </label>
                          <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>연락처</span>
                            <input
                              type="text"
                              name="phone"
                              value={editForm.phone}
                              onChange={handleEditFormChange}
                              required
                              style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                            />
                          </label>
                          <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>이메일 (수정 불가)</span>
                            <input
                              type="email"
                              value={interpreter.email}
                              disabled
                              className="disabled-input"
                              style={{ width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", fontSize: "14px", background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" }}
                            />
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>성별</span>
                              <select
                                name="gender"
                                value={editForm.gender}
                                onChange={handleEditFormChange}
                                required
                                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", height: "42px" }}
                              >
                                <option value="여성">여성</option>
                                <option value="남성">남성</option>
                                <option value="기타/응답 안 함">기타/응답 안 함</option>
                              </select>
                            </label>
                            <label className="edit-form-label" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>일본어 레벨</span>
                              <select
                                name="level"
                                value={editForm.level}
                                onChange={handleEditFormChange}
                                required
                                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px", height: "42px" }}
                              >
                                <option value="Lv1">Lv1</option>
                                <option value="Lv2">Lv2</option>
                                <option value="Lv3">Lv3</option>
                                <option value="Lv4">Lv4</option>
                              </select>
                            </label>
                          </div>
                        </div>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "16px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>전문 분야 (쉼표로 구분)</span>
                          <input
                            type="text"
                            value={specialtiesInput}
                            onChange={(e) => setSpecialtiesInput(e.target.value)}
                            placeholder="예: IT, 의료, 제조, 비즈니스 미팅"
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                          />
                        </label>

                        <label className="edit-form-label full-width" style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "24px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#4b5563" }}>활동 가능 지역 (쉼표로 구분)</span>
                          <input
                            type="text"
                            value={regionsInput}
                            onChange={(e) => setRegionsInput(e.target.value)}
                            placeholder="예: 도쿄, 오사카, 서울, 후쿠오카"
                            style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "14px" }}
                          />
                        </label>

                        <div className="edit-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                          <button
                            type="button"
                            className="interpreter-auth-secondary"
                            onClick={handleCancelEdit}
                            disabled={isUpdatingProfile}
                            style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            className="interpreter-auth-primary"
                            disabled={isUpdatingProfile}
                            style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer", background: "#4f46e5", color: "#ffffff", border: "none" }}
                          >
                            {isUpdatingProfile ? "저장 중..." : "변경사항 저장"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <dl className="interpreter-profile-list">
                        <ProfileRow label="이름" value={interpreter.name || "미입력"} />
                        <ProfileRow label="이메일" value={interpreter.email || user.email} />
                        <ProfileRow label="연락처" value={interpreter.phone || "미입력"} />
                        <ProfileRow label="성별" value={interpreter.gender || "미입력"} />
                        <ProfileRow
                          label="승인 상태"
                          value={
                            <span
                              className={`status-badge ${
                                interpreter.status === "active" || interpreter.status === "승인 완료" || interpreter.status === "활동중"
                                  ? "badge-green"
                                  : interpreter.status === "rejected" || interpreter.status === "반려"
                                  ? "badge-red"
                                  : "badge-yellow"
                              }`}
                            >
                              {interpreter.status === "active" || interpreter.status === "승인 완료" || interpreter.status === "활동중"
                                ? "승인 완료"
                                : interpreter.status === "rejected" || interpreter.status === "반려"
                                ? "반려"
                                : "승인 대기"}
                            </span>
                          }
                        />
                        <ProfileRow
                          label="활동 상태"
                          value={
                            <span
                              className={`status-badge ${
                                activityStatus === "active"
                                  ? "badge-green"
                                  : activityStatus === "paused"
                                  ? "badge-yellow"
                                  : "badge-gray"
                              }`}
                            >
                              {getInterpreterActivityStatusLabel(activityStatus)}
                            </span>
                          }
                        />
                        <ProfileRow
                          label="일본어 레벨"
                          value={
                            <span className="interpreter-tag-level">
                              {normalizeLevel(interpreter.level || "Lv1")}
                            </span>
                          }
                        />
                        <ProfileRow
                          label="전문 분야"
                          value={
                            <div className="interpreter-specialties-tags">
                              {Array.isArray(interpreter.specialties) &&
                              interpreter.specialties.filter(Boolean).length > 0 ? (
                                interpreter.specialties
                                  .filter(Boolean)
                                  .map((spec, i) => (
                                    <span key={i} className="interpreter-tag spec">
                                      {spec}
                                    </span>
                                  ))
                              ) : (
                                <span className="no-tags">등록된 분야가 없습니다.</span>
                              )}
                            </div>
                          }
                        />
                        <ProfileRow
                          label="활동 가능 지역"
                          value={
                            <div className="interpreter-regions-tags">
                              {Array.isArray(interpreter.available_regions) &&
                              interpreter.available_regions.filter(Boolean).length > 0 ? (
                                interpreter.available_regions
                                  .filter(Boolean)
                                  .map((reg, i) => (
                                    <span key={i} className="interpreter-tag region">
                                      {reg}
                                    </span>
                                  ))
                              ) : (
                                <span className="no-tags">등록된 지역이 없습니다.</span>
                              )}
                            </div>
                          }
                        />
                      </dl>
                    )}
                  </article>
                )}

                {activeTab === "applications" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>지원 내역 목록</h2>
                    {loadingData ? (
                      <p className="loading-text">지원 내역을 불러오고 있습니다...</p>
                    ) : applications.length === 0 ? (
                      <div className="interpreter-empty-state">
                        <span className="empty-icon">📄</span>
                        <p>아직 지원한 통역 공고가 없습니다.</p>
                        <button
                          type="button"
                          className="interpreter-auth-primary"
                          onClick={onHomeClick}
                        >
                          통역 공고 둘러보기
                        </button>
                      </div>
                    ) : (
                      <div className="interpreter-application-list">
                        {applications.map((app) => {
                          const jobTitle = app.jobs?.title || "삭제되었거나 찾을 수 없는 공고";
                          const jobLocation = app.jobs?.location || "-";
                          const start = app.jobs?.start_date;
                          const end = app.jobs?.end_date;
                          const jobDates = start ? `${formatDate(start)} ~ ${formatDate(end)}` : "-";
                          const badgeClass = getStatusBadgeClass(app.status);
                          const statusLabel = getApplicationStatusLabel(app.status);

                          return (
                            <div key={app.id} className="interpreter-application-card">
                              <div className="card-top-row">
                                <span className="app-no">{app.application_no || `No.${app.id}`}</span>
                                <span className={`status-badge ${badgeClass}`}>{statusLabel}</span>
                              </div>
                              <h3>{jobTitle}</h3>
                              <div className="app-job-details">
                                <p>
                                  <span>📍 위치:</span> {jobLocation}
                                </p>
                                <p>
                                  <span>📅 일정:</span> {jobDates}
                                </p>
                                {app.message && (
                                  <div className="app-message-box">
                                    <span>✍️ 지원 메시지:</span>
                                    <p>{app.message}</p>
                                  </div>
                                )}
                              </div>
                              <div className="app-date-row">
                                지원 일시: {formatDate(app.created_at)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === "assignments" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>배정 내역 목록</h2>
                    {loadingData ? (
                      <p className="loading-text">배정 내역을 불러오고 있습니다...</p>
                    ) : matchings.length === 0 ? (
                      <div className="interpreter-empty-state">
                        <span className="empty-icon">💼</span>
                        <p>아직 배정 완료된 통역 일정이 없습니다.</p>
                        <p className="empty-sub">
                          프로필 정보와 활동 가능 지역을 최신화해두시면 더 활발하게 매칭 제안을
                          받으실 수 있습니다.
                        </p>
                      </div>
                    ) : (
                      <div className="interpreter-assignment-list">
                        {matchings.map((mat) => {
                          const jobTitle = mat.jobs?.title || "배정된 공고";
                          const companyName = mat.jobs?.company_name || "비공개 협력사";
                          const location = mat.jobs?.location || "-";
                          const start = mat.start_date || mat.jobs?.start_date;
                          const end = mat.end_date || mat.jobs?.end_date;
                          const dateRange = start ? `${formatDate(start)} ~ ${formatDate(end)}` : "-";
                          const statusLabel = getMatchingStatusLabel(mat.status);
                          const badgeClass = getStatusBadgeClass(mat.status);

                          return (
                            <div key={mat.id} className="interpreter-assignment-card">
                              <div className="card-top-row">
                                <span className="matching-no">
                                  {mat.matching_no || `Matching No.${mat.id}`}
                                </span>
                                <span className={`status-badge ${badgeClass}`}>{statusLabel}</span>
                              </div>
                              <h3>{jobTitle}</h3>
                              <div className="assignment-details">
                                <p>
                                  <span>🏢 파트너사:</span> {companyName}
                                </p>
                                <p>
                                  <span>📍 장소:</span> {location}
                                </p>
                                <p>
                                  <span>📅 근무 기간:</span> {dateRange}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === "schedule" && (
                  <article className="interpreter-mypage-card animate-fade-in">
                    <h2>내 일정 및 캘린더 타임라인</h2>
                    <p className="schedule-intro-text">
                      확정된 통역 매칭 일정 목록입니다. 이 기간 동안은 다른 공고 신청 시 일정이
                      중복될 수 있으니 사전에 참고해주시기 바랍니다.
                    </p>

                    {loadingData ? (
                      <p className="loading-text">일정을 불러오고 있습니다...</p>
                    ) : (
                      (() => {
                        const activeMatchings = matchings.filter((m) =>
                          ["assigned", "confirmed", "in_progress"].includes(
                            String(m.status || "").toLowerCase()
                          )
                        );

                        if (activeMatchings.length === 0) {
                          return (
                            <div className="interpreter-empty-state">
                              <span className="empty-icon">📅</span>
                              <p>예정된 통역 일정이 없습니다.</p>
                              <p className="empty-sub">
                                배정 완료된 통역 일정이 이곳에 일대일 타임라인 형식으로
                                정리됩니다.
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="interpreter-schedule-timeline">
                            {activeMatchings.map((mat) => {
                              const jobTitle = mat.jobs?.title || "배정된 통역";
                              const location = mat.jobs?.location || "-";
                              const start = mat.start_date || mat.jobs?.start_date;
                              const end = mat.end_date || mat.jobs?.end_date;
                              const rangeText = start ? `${formatDate(start)} ~ ${formatDate(end)}` : "-";
                              const countdown = getDaysRemaining(start);
                              const isUnderway = String(mat.status).toLowerCase() === "in_progress";

                              return (
                                <div key={mat.id} className="timeline-item">
                                  <div className="timeline-badge-column">
                                    <span
                                      className={`countdown-badge ${
                                        isUnderway ? "is-active" : ""
                                      }`}
                                    >
                                      {isUnderway ? "진행중" : countdown}
                                    </span>
                                    <span className="timeline-line"></span>
                                  </div>
                                  <div className="timeline-content-card">
                                    <h4>{jobTitle}</h4>
                                    <div className="timeline-job-meta">
                                      <p>📅 {rangeText}</p>
                                      <p>📍 {location}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </article>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDaysRemaining(startDateStr) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = start - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays < 0) return `완료`;
  return `D-${diffDays}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getActivityStatus(interpreter) {
  const status = String(interpreter?.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

export default InterpreterMypage;
