import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./BusinessMypage.css";

const PRIMARY_FIELDS_OPTIONS = [
  "뷰티",
  "패션",
  "식품",
  "의료",
  "IT",
  "관광",
  "제조",
  "비즈니스",
  "기타",
];

const COUNTRY_OPTIONS = [
  { value: "한국", label: "한국" },
  { value: "일본", label: "일본" },
  { value: "기타", label: "기타 (미국, 중국 등)" },
];

function BusinessMypage({
  user,
  authLoading,
  onLoginClick,
  onRegisterClick,
  onHomeClick,
  onSignOut,
}) {
  const [business, setBusiness] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState("requests"); // "requests" or "profile"
  const [status, setStatus] = useState("loading"); // "loading", "ready", "notRegistered", "restricted", "signedOut"

  // Edit profile states
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    companyName: "",
    businessNumber: "",
    contactName: "",
    contactPhone: "",
    country: "한국",
    primaryFields: [],
    taxInvoiceRequired: false,
    notes: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // File upload state per request
  const [uploadingRequestId, setUploadingRequestId] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch business profile and requests
  const fetchData = async () => {
    if (authLoading) return;
    if (!user) {
      setStatus("signedOut");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: bizData, error: bizError } = await supabase
        .from("businesses")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (bizError) {
        console.error("Error fetching business profile:", bizError);
        setStatus("error");
        setLoading(false);
        return;
      }

      if (!bizData) {
        setStatus("notRegistered");
        setLoading(false);
        return;
      }

      setBusiness(bizData);

      if (bizData.status === "이용 제한") {
        setStatus("restricted");
        setLoading(false);
        return;
      }

      setStatus("ready");

      // Fetch requests
      setLoadingData(true);
      const { data: reqData, error: reqError } = await supabase
        .from("requests")
        .select("*")
        .eq("company_auth_user_id", user.id)
        .order("created_at", { ascending: false });

      if (reqError) {
        console.error("Error fetching requests:", reqError);
      } else {
        setRequests(reqData || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching business data:", err);
      setStatus("error");
    } finally {
      setLoadingData(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, authLoading]);

  const handleStartEdit = () => {
    if (!business) return;
    setEditForm({
      companyName: business.company_name,
      businessNumber: business.business_number,
      contactName: business.contact_name,
      contactPhone: business.contact_phone,
      country: business.country,
      primaryFields: business.primary_fields || [],
      taxInvoiceRequired: business.tax_invoice_required,
      notes: business.notes || "",
    });
    setErrorMessage("");
    setIsEditing(true);
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleFieldToggle = (field) => {
    setEditForm((current) => {
      const exists = current.primaryFields.includes(field);
      const nextFields = exists
        ? current.primaryFields.filter((f) => f !== field)
        : [...current.primaryFields, field];
      return { ...current, primaryFields: nextFields };
    });
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!supabase || !business) return;

    if (!editForm.companyName.trim()) {
      setErrorMessage("회사명을 입력해주세요.");
      return;
    }
    if (!editForm.businessNumber.trim()) {
      setErrorMessage("사업자등록번호를 입력해주세요.");
      return;
    }
    if (!editForm.contactName.trim()) {
      setErrorMessage("담당자명을 입력해주세요.");
      return;
    }
    if (!editForm.contactPhone.trim()) {
      setErrorMessage("담당자 연락처를 입력해주세요.");
      return;
    }

    setIsSavingProfile(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("businesses")
        .update({
          company_name: editForm.companyName.trim(),
          business_number: editForm.businessNumber.trim(),
          contact_name: editForm.contactName.trim(),
          contact_phone: editForm.contactPhone.trim(),
          country: editForm.country,
          primary_fields: editForm.primaryFields,
          tax_invoice_required: editForm.taxInvoiceRequired,
          notes: editForm.notes.trim(),
        })
        .eq("id", business.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setBusiness(data);
      setIsEditing(false);
      alert("기업 정보가 수정되었습니다.");
    } catch (err) {
      console.error("Error updating business profile:", err);
      setErrorMessage(err.message || "프로필 수정에 실패했습니다.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Upload reference file
  const handleUploadFileClick = (requestId) => {
    setUploadingRequestId(requestId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    const requestId = uploadingRequestId;
    setUploadingRequestId(null);
    if (!file || !requestId) return;

    // Validate size and extensions
    const maxSize = 10 * 1024 * 1024; // 10MB
    const fileExtension = file.name.split(".").pop().toLowerCase();
    const allowedExtensions = ["pdf", "jpg", "jpeg", "png"];

    if (!allowedExtensions.includes(fileExtension)) {
      alert("PDF, JPG, JPEG, PNG 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > maxSize) {
      alert("파일 크기는 최대 10MB까지 지원합니다.");
      return;
    }

    setLoadingData(true);
    try {
      const timestamp = Date.now();
      const storageId = Math.random().toString(36).substring(2, 10);
      const filePath = `requests/reference_files/request_${timestamp}_${storageId}.${fileExtension}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("request-files")
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Update database
      const { error: dbError } = await supabase
        .from("requests")
        .update({
          reference_file_name: file.name,
          reference_file_path: filePath,
          reference_file_url: filePath,
        })
        .eq("id", requestId);

      if (dbError) throw dbError;

      alert("참고 자료가 업로드되었습니다.");
      fetchData();
    } catch (err) {
      console.error("File upload error:", err);
      alert(`파일 업로드 실패: ${err.message || "다시 시도해주세요."}`);
    } finally {
      setLoadingData(false);
    }
  };

  // Download reference file
  const handleDownloadFile = async (path, name) => {
    if (!path) return;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("request-files")
        .createSignedUrl(path, 600, { download: name || true });

      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Error creating signed URL:", err);
      alert("파일을 다운로드할 수 없습니다. 권한이 없거나 만료되었습니다.");
    }
  };

  // Render Status Badges
  const getRequestStatusBadge = (req) => {
    const isMatched = Boolean(req.assigned_interpreter_id || req.matched_interpreter_id);
    const hasEstimate = req.estimated_amount !== null && req.estimated_amount !== undefined;

    if (req.progress_status === "completed") {
      return <span className="status-badge badge-green">진행 완료</span>;
    }
    if (req.progress_status === "cancelled") {
      return <span className="status-badge badge-red">취소됨</span>;
    }
    if (isMatched) {
      return <span className="status-badge badge-purple">통역사 배정 완료</span>;
    }
    if (hasEstimate) {
      return <span className="status-badge badge-yellow">견적 발행 완료</span>;
    }
    return <span className="status-badge badge-blue">의뢰 검토 중</span>;
  };

  // Render Views
  if (loading) {
    return (
      <div className="business-mypage-loading">
        <div className="spinner" />
        <p>불러오는 중...</p>
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <main className="business-mypage-empty">
        <div className="empty-card">
          <span className="empty-icon">🔒</span>
          <h2>로그인이 필요합니다</h2>
          <p>기업 서비스를 이용하려면 계정에 로그인해 주세요.</p>
          <div className="empty-actions">
            <button onClick={onLoginClick} className="btn-primary">로그인</button>
            <button onClick={onHomeClick} className="btn-secondary">메인으로</button>
          </div>
        </div>
      </main>
    );
  }

  if (status === "notRegistered") {
    return (
      <main className="business-mypage-empty">
        <div className="empty-card">
          <span className="empty-icon">🏢</span>
          <h2>기업 정보를 등록해 주세요</h2>
          <p>회원가입 후 최초 1회 기업 등록이 필요합니다.</p>
          <div className="empty-actions">
            <button onClick={onRegisterClick} className="btn-primary">기업 등록하기</button>
            <button onClick={onHomeClick} className="btn-secondary">메인으로</button>
          </div>
        </div>
      </main>
    );
  }

  if (status === "restricted") {
    return (
      <main className="business-mypage-empty">
        <div className="empty-card restriction-card">
          <span className="empty-icon text-red">⚠️</span>
          <h2>이용이 제한된 계정입니다</h2>
          <p>
            해당 기업 계정은 관리자에 의해 활동이 정지되었습니다. <br />
            자세한 문의 사항은 ON-LI 고객센터로 문의해 주시기 바랍니다.
          </p>
          <div className="empty-actions">
            <button onClick={onSignOut} className="btn-danger">로그아웃</button>
            <button onClick={onHomeClick} className="btn-secondary">메인으로</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="business-mypage">
      <div className="mypage-bg-glow" />
      <div className="business-mypage-shell">
        
        {/* Header Section */}
        <header className="business-mypage-head">
          <div className="head-left">
            <p className="head-kicker">ON-LI BUSINESS MYPAGE</p>
            <h1>{business.company_name} 님, 안녕하세요</h1>
            <div className="head-status-row">
              <span className="profile-badge">기업 회원</span>
              <span className={`status-pill ${business.status === "승인 완료" ? "approved" : "pending"}`}>
                {business.status}
              </span>
            </div>
          </div>
          <div className="business-mypage-actions">
            <button onClick={onHomeClick} className="btn-nav">홈으로</button>
            <button onClick={onSignOut} className="btn-signout">로그아웃</button>
          </div>
        </header>

        {/* Dashboard Content Layout */}
        <div className="business-mypage-grid">
          
          {/* Navigation Sidebar */}
          <aside className="business-mypage-sidebar">
            <nav className="business-mypage-tabs">
              <button
                className={`mypage-tab-btn ${activeTab === "requests" ? "is-active" : ""}`}
                onClick={() => setActiveTab("requests")}
              >
                <span className="tab-icon">📋</span> 내 의뢰 현황
              </button>
              <button
                className={`mypage-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                <span className="tab-icon">👤</span> 기업 정보 관리
              </button>
            </nav>
            
            <div className="sidebar-contact-info">
              <h3>ON-LI 고객센터</h3>
              <p>의뢰 변경이나 매칭 관련 긴급 문의는 고객센터로 연락해 주세요.</p>
              <span className="contact-tel">010-XXXX-XXXX</span>
              <span className="contact-email">support@on-li.co.kr</span>
            </div>
          </aside>

          {/* Main Display Area */}
          <main className="business-mypage-main-content">
            {activeTab === "requests" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>내 의뢰 현황</h2>
                  <p className="data-count-label">총 {requests.length}건</p>
                </div>

                {loadingData ? (
                  <div className="loading-placeholder">의뢰 불러오는 중...</div>
                ) : requests.length === 0 ? (
                  <div className="mypage-empty-state">
                    <span className="empty-state-symbol">📝</span>
                    <p>등록된 의뢰가 없습니다.</p>
                    <small>통역이 필요한 행사 일정을 등록해 보세요.</small>
                  </div>
                ) : (
                  <div className="business-requests-list">
                    {requests.map((req) => (
                      <article key={req.id} className="business-request-card">
                        <div className="request-card-header">
                          <span className="request-date">
                            등록일: {new Date(req.created_at).toLocaleDateString()}
                          </span>
                          {getRequestStatusBadge(req)}
                        </div>

                        <h3>{req.event_name || req.title || "제목 미입력 의뢰"}</h3>

                        <div className="request-meta-grid">
                          <div className="meta-item">
                            <span className="meta-label">일정</span>
                            <span className="meta-value">
                              {req.start_date || req.event_date} {req.end_date ? `~ ${req.end_date}` : ""}
                            </span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">장소</span>
                            <span className="meta-value">{req.location || req.event_location}</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">분야/언어</span>
                            <span className="meta-value">
                              {req.specialty || req.category} / {req.language || req.language_pair || "한일 통역"}
                            </span>
                          </div>
                        </div>

                        {/* Reference File Section */}
                        <div className="request-file-section">
                          <span className="file-section-title">행사 참고 자료</span>
                          {req.reference_file_path ? (
                            <div className="file-info-bar">
                              <span className="file-name" title={req.reference_file_name}>
                                📄 {req.reference_file_name || "첨부 파일"}
                              </span>
                              <div className="file-actions">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadFile(req.reference_file_path, req.reference_file_name)}
                                  className="btn-download"
                                >
                                  보기
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUploadFileClick(req.id)}
                                  className="btn-reupload"
                                >
                                  변경
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="file-empty-bar">
                              <span className="file-empty-message">등록된 참고 자료가 없습니다. (통역용 세부 정보)</span>
                              <button
                                type="button"
                                onClick={() => handleUploadFileClick(req.id)}
                                className="btn-upload"
                              >
                                + 자료 추가
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "profile" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>기업 정보 관리</h2>
                  {!isEditing && (
                    <button onClick={handleStartEdit} className="btn-edit-trigger">
                      수정하기
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <form onSubmit={handleSaveProfile} className="profile-edit-form">
                    <div className="form-grid-2col">
                      <label className="edit-field">
                        <span>회사명</span>
                        <input
                          name="companyName"
                          type="text"
                          value={editForm.companyName}
                          onChange={editChange => handleEditChange(editChange)}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>사업자등록번호</span>
                        <input
                          name="businessNumber"
                          type="text"
                          value={editForm.businessNumber}
                          onChange={editChange => handleEditChange(editChange)}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>담당자명</span>
                        <input
                          name="contactName"
                          type="text"
                          value={editForm.contactName}
                          onChange={editChange => handleEditChange(editChange)}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>담당자 연락처</span>
                        <input
                          name="contactPhone"
                          type="text"
                          value={editForm.contactPhone}
                          onChange={editChange => handleEditChange(editChange)}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>국가</span>
                        <select
                          name="country"
                          value={editForm.country}
                          onChange={editChange => handleEditChange(editChange)}
                          className="edit-select"
                        >
                          {COUNTRY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="edit-field field-full">
                      <span>주요 의뢰 분야 (중복 선택)</span>
                      <div className="chips-grid">
                        {PRIMARY_FIELDS_OPTIONS.map((field) => {
                          const selected = editForm.primaryFields.includes(field);
                          return (
                            <button
                              key={field}
                              type="button"
                              className={`field-chip ${selected ? "active" : ""}`}
                              onClick={() => handleFieldToggle(field)}
                            >
                              {field}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="edit-field field-full">
                      <span>세금계산서 필요 여부</span>
                      <div className="radio-group">
                        <label className="radio-opt">
                          <input
                            type="radio"
                            name="taxInvoiceRequired"
                            checked={editForm.taxInvoiceRequired === false}
                            onChange={() => setEditForm((c) => ({ ...c, taxInvoiceRequired: false }))}
                          />
                          <span>발행 불필요</span>
                        </label>
                        <label className="radio-opt">
                          <input
                            type="radio"
                            name="taxInvoiceRequired"
                            checked={editForm.taxInvoiceRequired === true}
                            onChange={() => setEditForm((c) => ({ ...c, taxInvoiceRequired: true }))}
                          />
                          <span>발행 필요</span>
                        </label>
                      </div>
                    </div>

                    <label className="edit-field field-full">
                      <span>기타 요청사항</span>
                      <textarea
                        name="notes"
                        value={editForm.notes}
                        onChange={editChange => handleEditChange(editChange)}
                        rows={3}
                      />
                    </label>

                    {errorMessage && <div className="edit-error">{errorMessage}</div>}

                    <div className="form-actions">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isSavingProfile}
                        className="btn-cancel"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="btn-save"
                      >
                        {isSavingProfile ? "저장 중..." : "저장 완료"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="profile-detail-view">
                    <dl className="profile-dl">
                      <div>
                        <dt>회사명</dt>
                        <dd>{business.company_name}</dd>
                      </div>
                      <div>
                        <dt>사업자등록번호</dt>
                        <dd>{business.business_number}</dd>
                      </div>
                      <div>
                        <dt>담당자명</dt>
                        <dd>{business.contact_name}</dd>
                      </div>
                      <div>
                        <dt>담당자 이메일</dt>
                        <dd>{business.contact_email}</dd>
                      </div>
                      <div>
                        <dt>담당자 연락처</dt>
                        <dd>{business.contact_phone}</dd>
                      </div>
                      <div>
                        <dt>국가</dt>
                        <dd>{business.country}</dd>
                      </div>
                      <div className="full-width">
                        <dt>주요 의뢰 분야</dt>
                        <dd>
                          <div className="tags-container">
                            {business.primary_fields && business.primary_fields.length > 0 ? (
                              business.primary_fields.map((f) => (
                                <span key={f} className="biz-field-tag">{f}</span>
                              ))
                            ) : (
                              <span className="no-data">지정되지 않음</span>
                            )}
                          </div>
                        </dd>
                      </div>
                      <div>
                        <dt>세금계산서 필요 여부</dt>
                        <dd>{business.tax_invoice_required ? "필요" : "발행 불필요"}</dd>
                      </div>
                      <div className="full-width">
                        <dt>기타 요청사항</dt>
                        <dd className="pre-wrap">{business.notes || "기타 요청사항이 없습니다."}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            )}
          </main>

        </div>
      </div>

      {/* Hidden file input for uploading reference files */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
        accept=".pdf,.jpg,.jpeg,.png"
      />
    </div>
  );
}

export default BusinessMypage;
