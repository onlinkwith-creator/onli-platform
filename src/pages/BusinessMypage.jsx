import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { isOnliCertified } from "../utils/publicInterpreter";
import {
  DOCUMENT_BUCKET,
  formatDocumentAmount,
  getDocumentTypeLabel,
} from "../utils/documents";
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

const getClientNotificationLabel = (eventType) => {
  switch (eventType) {
    case "request_created_client":
      return "의뢰 접수 완료";
    case "client_review_started":
      return "관리자 검토 시작";
    case "client_estimate_ready":
      return "견적 안내";
    case "client_recruiting_started":
      return "통역사 모집 시작";
    case "assignment_confirmed_client":
      return "배정 완료";
    case "client_work_preparing":
      return "업무 준비 시작";
    case "client_work_ready":
      return "진행 예정";
    case "client_work_completed":
      return "업무 완료";
    case "client_settlement_ready":
      return "정산/결제 안내";
    case "company_payment_invoice_sent":
      return "입금 안내";
    case "company_payment_paid":
      return "입금 확인";
    case "company_payment_overdue":
      return "입금 기한 초과";
    default:
      return "알림";
  }
};

const getNotificationPayload = (event = {}) => {
  if (!event.payload) return {};
  if (typeof event.payload === "string") {
    try {
      return JSON.parse(event.payload);
    } catch {
      return {};
    }
  }
  return event.payload;
};

const getClientNotificationText = (event) => {
  const payload = getNotificationPayload(event);
  const eventName = payload.event_name || payload.eventName || "";
  const requestNo = payload.request_no || payload.requestCode || "";
  const suffix = requestNo ? ` (${requestNo})` : "";

  switch (event.event_type) {
    case "request_created_client":
      return `등록하신 의뢰 [${eventName}] 접수가 완료되었습니다.${suffix}`;
    case "client_review_started":
      return `의뢰 [${eventName}] 검토를 진행하고 있습니다.${suffix}`;
    case "client_estimate_ready":
      return `의뢰 [${eventName}] 견적 준비가 완료되었습니다.${suffix}`;
    case "client_recruiting_started":
      return `의뢰 [${eventName}] 통역사 모집을 시작했습니다.${suffix}`;
    case "assignment_confirmed_client":
      return `의뢰 [${eventName}] 통역사 배정이 확정되었습니다.${suffix}`;
    case "client_work_preparing":
      return `의뢰 [${eventName}] 업무 준비가 시작되었습니다. 행사 자료를 업로드해 주세요.${suffix}`;
    case "client_work_ready":
      return `의뢰 [${eventName}] 업무 준비가 완료되었습니다. 진행 예정 상태입니다.${suffix}`;
    case "client_work_completed":
      return `의뢰 [${eventName}] 통역 업무가 종료되었습니다.${suffix}`;
    case "client_settlement_ready":
      return `의뢰 [${eventName}] 정산/결제 요청이 접수되었습니다.${suffix}`;
    case "company_payment_invoice_sent":
      return `의뢰 [${eventName}] 입금 안내가 발송되었습니다.${suffix}`;
    case "company_payment_paid":
      return `의뢰 [${eventName}] 입금이 확인되었습니다.${suffix}`;
    case "company_payment_overdue":
      return `의뢰 [${eventName}] 입금 기한이 지났습니다. 관리자에게 문의해주세요.${suffix}`;
    default:
      return `새로운 알림이 도착했습니다.`;
  }
};

function BusinessMypage({
  user,
  authLoading,
  onLoginClick,
  onRegisterClick,
  onHomeClick,
  onSignOut,
  onNewRequestClick,
  onDuplicateRequest,
}) {
  const [business, setBusiness] = useState(null);
  const [requests, setRequests] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState("requests"); // "requests", "profile", "interpreters", "materials", "inquiry"
  const [status, setStatus] = useState("loading"); // "loading", "ready", "notRegistered", "restricted", "signedOut"

  // Material selection states
  const [selectedMaterialRequestId, setSelectedMaterialRequestId] = useState("");
  const [materialCategory, setMaterialCategory] = useState("제품 소개서");
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const materialFileInputRef = useRef(null);

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

  // Fetch business profile, requests, assignments, and materials
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

      if (bizData.status === "검토중") {
        setStatus("pending");
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
        const fetchedRequests = reqData || [];
        setRequests(fetchedRequests);

        if (fetchedRequests.length > 0) {
          const requestIds = fetchedRequests.map((r) => r.id);

          // 1. Fetch assigned interpreters
          const { data: assignData, error: assignError } = await supabase
            .from("request_interpreters")
            .select(`
              id,
              request_id,
              is_contact_visible,
              interpreter:interpreters (
                id,
                name,
                level,
                approved,
                jlpt,
                specialties,
                experience_count,
                phone,
                kakao_or_line,
                email
              )
            `)
            .in("request_id", requestIds);

          if (assignError) {
            console.error("Error fetching assignments:", assignError);
          } else {
            setAssignments(assignData || []);
          }

          // 2. Fetch request materials
          const { data: matData, error: matError } = await supabase
            .from("request_materials")
            .select("*")
            .in("request_id", requestIds)
            .order("created_at", { ascending: false });

          if (matError) {
            console.error("Error fetching materials:", matError);
          } else {
            setMaterials(matData || []);
          }

          // 3. Fetch recent notifications
          const { data: notifData, error: notifError } = await supabase
            .from("notification_events")
            .select("*")
            .in("recipient_type", ["client", "company"])
            .in("target_id", requestIds.map(String))
            .eq("target_type", "request")
            .order("created_at", { ascending: false })
            .limit(5);

          if (notifError) {
            console.error("Error fetching notifications:", notifError);
          } else {
            setNotifications(notifData || []);
          }

          const { data: docData, error: docError } = await supabase
            .from("documents")
            .select("id, document_type, document_no, status, version, request_id, title, amount, storage_bucket, file_path, created_at")
            .in("request_id", requestIds)
            .in("document_type", ["estimate", "completion"])
            .eq("status", "issued")
            .order("created_at", { ascending: false });

          if (docError) {
            console.warn("Generated documents fetch skipped:", docError);
            setDocuments([]);
          } else {
            setDocuments(docData || []);
          }

          const { data: paymentData, error: paymentError } = await supabase
            .from("payments")
            .select("id, request_id, estimate_document_id, amount, payment_status, payment_method, paid_at, due_date, admin_memo, created_at, updated_at")
            .in("request_id", requestIds)
            .order("created_at", { ascending: false });

          if (paymentError) {
            console.warn("Payments fetch skipped:", paymentError);
            setPayments([]);
          } else {
            setPayments(paymentData || []);

            const paymentIds = (paymentData || []).map((payment) => String(payment.id));
            if (paymentIds.length > 0) {
              const { data: paymentNotifData, error: paymentNotifError } = await supabase
                .from("notification_events")
                .select("*")
                .eq("recipient_type", "company")
                .eq("target_type", "payment")
                .in("target_id", paymentIds)
                .order("created_at", { ascending: false })
                .limit(5);

              if (paymentNotifError) {
                console.warn("Payment notifications fetch skipped:", paymentNotifError);
              } else {
                const mergedNotifications = [...(notifData || []), ...(paymentNotifData || [])]
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .slice(0, 5);
                setNotifications(mergedNotifications);
              }
            }
          }

          // Set default selected request for materials tab if not set
          setSelectedMaterialRequestId((current) => current || String(fetchedRequests[0].id));
        } else {
          setAssignments([]);
          setMaterials([]);
          setDocuments([]);
          setPayments([]);
          setNotifications([]);
        }
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
    Promise.resolve().then(() => {
      fetchData();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleCancelEdit = () => {
    setIsEditing(false);
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

  // Upload Material Document
  const handleUploadMaterialClick = () => {
    if (materialFileInputRef.current) {
      materialFileInputRef.current.value = "";
      materialFileInputRef.current.click();
    }
  };

  const handleMaterialFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedMaterialRequestId) return;

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

    setUploadingMaterial(true);
    try {
      const timestamp = Date.now();
      const storageId = Math.random().toString(36).substring(2, 10);
      const filePath = `requests/reference_files/materials/${selectedMaterialRequestId}/${materialCategory}_${timestamp}_${storageId}.${fileExtension}`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("request-files")
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Insert record in public.request_materials
      const { error: dbError } = await supabase
        .from("request_materials")
        .insert([{
          request_id: Number(selectedMaterialRequestId),
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: materialCategory,
          uploaded_by: user.id
        }]);

      if (dbError) {
        // Cleanup storage file on db error
        await supabase.storage.from("request-files").remove([filePath]);
        throw dbError;
      }

      alert("자료가 업로드되었습니다.");
      fetchData();
    } catch (err) {
      console.error("Material upload error:", err);
      alert(`자료 업로드 실패: ${err.message || "다시 시도해주세요."}`);
    } finally {
      setUploadingMaterial(false);
    }
  };

  // Delete Material Document
  const handleDeleteMaterial = async (materialId, filePath) => {
    if (!window.confirm("이 행사 자료를 삭제하시겠습니까?")) return;

    setLoadingData(true);
    try {
      const { error: dbError } = await supabase
        .from("request_materials")
        .delete()
        .eq("id", materialId);

      if (dbError) throw dbError;

      try {
        await supabase.storage.from("request-files").remove([filePath]);
      } catch (err) {
        console.warn("Storage deletion warning:", err);
      }

      alert("행사 자료가 삭제되었습니다.");
      fetchData();
    } catch (err) {
      console.error("Material deletion error:", err);
      alert(`자료 삭제 실패: ${err.message || "다시 시도해주세요."}`);
    } finally {
      setLoadingData(false);
    }
  };

  // Download File via signed URL
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

  const handleOpenGeneratedDocument = async (documentRow) => {
    try {
      const { data, error } = await supabase.storage
        .from(documentRow.storage_bucket || DOCUMENT_BUCKET)
        .createSignedUrl(documentRow.file_path, 600, {
          download: false,
        });

      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Generated document signed URL failed:", error);
      alert("문서를 열 수 없습니다. 권한 또는 파일 상태를 확인해주세요.");
    }
  };

  const handleDownloadGeneratedDocument = async (documentRow) => {
    try {
      const { data, error } = await supabase.storage
        .from(documentRow.storage_bucket || DOCUMENT_BUCKET)
        .createSignedUrl(documentRow.file_path, 600, {
          download: `${documentRow.document_no || "ONLI-DOC"}.pdf`,
        });

      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Generated document download URL failed:", error);
      alert("문서를 다운로드할 수 없습니다. 권한 또는 파일 상태를 확인해주세요.");
    }
  };

  const handleApproveEstimate = async (requestId) => {
    if (!window.confirm("견적을 승인하시겠습니까? 승인 후 금액 수정은 관리자 문의가 필요합니다.")) return;

    // 1. Update request estimate status
    const { error } = await supabase
      .from("requests")
      .update({ estimate_status: "estimate_approved" })
      .eq("id", requestId)
      .eq("company_auth_user_id", user.id);

    if (error) {
      console.error("Estimate approval failed:", error);
      alert("견적 승인에 실패했습니다. 다시 시도해주세요.");
      return;
    }

    // 2. Fetch and update the latest estimate document's metadata
    try {
      const latestEstimate = documents
        .filter((doc) => doc.request_id === requestId && doc.document_type === "estimate" && doc.status === "issued")
        .sort((a, b) => b.version - a.version)[0];

      if (latestEstimate) {
        const { data: docData } = await supabase
          .from("documents")
          .select("metadata")
          .eq("id", latestEstimate.id)
          .maybeSingle();

        const updatedMetadata = {
          ...(docData?.metadata || {}),
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        };

        const { error: docUpdateError } = await supabase
          .from("documents")
          .update({ metadata: updatedMetadata })
          .eq("id", latestEstimate.id);

        if (docUpdateError) {
          console.warn("Failed to update estimate document metadata:", docUpdateError);
        } else {
          setDocuments((current) =>
            current.map((doc) =>
              doc.id === latestEstimate.id ? { ...doc, metadata: updatedMetadata } : doc
            )
          );
        }
      }
    } catch (err) {
      console.warn("Error updating document metadata on approval:", err);
    }

    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? { ...request, estimate_status: "estimate_approved" }
          : request
      )
    );

    const { data: paymentData, error: paymentError } = await supabase
      .from("payments")
      .select("id, request_id, estimate_document_id, amount, payment_status, payment_method, paid_at, due_date, admin_memo, created_at, updated_at")
      .eq("request_id", requestId)
      .maybeSingle();

    if (paymentError) {
      console.warn("Payment fetch after estimate approval skipped:", paymentError);
    } else if (paymentData) {
      setPayments((current) => {
        const exists = current.some((payment) => payment.id === paymentData.id);
        return exists
          ? current.map((payment) => (payment.id === paymentData.id ? paymentData : payment))
          : [paymentData, ...current];
      });
    }

    alert("견적 승인 완료");
  };

  // Dynamic corporate request status
  const getRequestStatusLabel = (req) => {
    if (req.matching_status === "cancelled" || req.status === "cancelled") {
      return "취소됨";
    }
    if (req.operation_status === "completed") {
      return "진행 완료";
    }
    if (req.assignment_status === "ready") {
      return "진행 예정";
    }
    if (req.assignment_status === "preparing") {
      return "업무 준비중";
    }
    if (req.assignment_status === "assigned") {
      return "배정 완료";
    }
    if (req.assignment_status === "assigning") {
      return "통역사 모집중";
    }
    if (req.admin_checked) {
      return "검토중";
    }
    return "접수 완료";
  };

  const getStatusBadgeClass = (statusLabel) => {
    const classes = {
      "접수 완료": "badge-blue",
      "검토중": "badge-yellow",
      "통역사 모집중": "badge-orange",
      "배정 완료": "badge-purple",
      "업무 준비중": "badge-teal",
      "진행 예정": "badge-cyan",
      "진행 완료": "badge-green",
      "취소됨": "badge-red",
    };
    return classes[statusLabel] || "badge-blue";
  };

  const getStatusStepIndex = (statusLabel) => {
    const steps = ["접수 완료", "검토중", "통역사 모집중", "배정 완료", "업무 준비중", "진행 예정", "진행 완료"];
    return steps.indexOf(statusLabel);
  };

  const getPaymentStatusLabel = (paymentStatus) => {
    const labels = {
      unpaid: "미입금",
      invoice_sent: "청구 완료",
      paid: "입금 완료",
      overdue: "연체",
      refunded: "환불",
    };
    return labels[paymentStatus] || "미입금";
  };

  const getPaymentStatusMessage = (paymentStatus) => {
    const messages = {
      unpaid: "입금 확인 전입니다.",
      invoice_sent: "입금 안내가 발송되었습니다.",
      paid: "입금이 확인되었습니다.",
      overdue: "입금 기한이 지났습니다. 관리자에게 문의해주세요.",
      refunded: "환불 처리된 결제 건입니다.",
    };
    return messages[paymentStatus] || "입금 확인 전입니다.";
  };

  const renderStatusSteps = (req) => {
    const statusLabel = getRequestStatusLabel(req);
    if (statusLabel === "취소됨") {
      return (
        <div className="status-timeline cancelled">
          <div className="timeline-step is-cancelled">
            <span className="step-num">❌</span>
            <strong className="step-name">취소됨</strong>
          </div>
        </div>
      );
    }

    const currentIndex = getStatusStepIndex(statusLabel);
    const steps = ["접수 완료", "검토중", "통역사 모집중", "배정 완료", "업무 준비중", "진행 예정", "진행 완료"];

    return (
      <div className="status-timeline">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          return (
            <div
              key={step}
              className={`timeline-step ${isCompleted ? "is-completed" : ""} ${
                isActive ? "is-active" : ""
              }`}
            >
              <span className="step-num">
                {isCompleted ? "✓" : String(idx + 1).padStart(2, "0")}
              </span>
              <strong className="step-name">{step}</strong>
            </div>
          );
        })}
      </div>
    );
  };

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

  if (status === "pending") {
    return (
      <main className="business-mypage-empty">
        <div className="empty-card">
          <span className="empty-icon">⏳</span>
          <h2>관리자 승인 대기 중입니다</h2>
          <p>관리자 승인 대기 중입니다.</p>
          <div className="empty-actions">
            <button onClick={onHomeClick} className="btn-secondary">메인으로</button>
            <button onClick={onSignOut} className="btn-signout">로그아웃</button>
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
          <h2>기업 등록이 반려되었습니다</h2>
          <p>기업 등록이 반려되었습니다. 관리자에게 문의해주세요.</p>
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
                className={`mypage-tab-btn ${activeTab === "interpreters" ? "is-active" : ""}`}
                onClick={() => setActiveTab("interpreters")}
              >
                <span className="tab-icon">🤝</span> 배정 통역
              </button>
              <button
                className={`mypage-tab-btn ${activeTab === "materials" ? "is-active" : ""}`}
                onClick={() => setActiveTab("materials")}
              >
                <span className="tab-icon">📂</span> 자료 관리
              </button>
              <button
                className={`mypage-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                <span className="tab-icon">👤</span> 기업 정보
              </button>
              <button
                className={`mypage-tab-btn ${activeTab === "inquiry" ? "is-active" : ""}`}
                onClick={() => setActiveTab("inquiry")}
              >
                <span className="tab-icon">💬</span> 문의
              </button>
            </nav>
            
            <div className="sidebar-contact-info">
              <h3>ON-LI 고객센터</h3>
              <p>의뢰 변경이나 매칭 관련 긴급 문의는 고객센터로 연락해 주세요.</p>
              <span className="contact-tel">010-4494-0418</span>
              <span className="contact-email">support@on-li.co.kr</span>
            </div>
          </aside>

          {/* Main Display Area */}
          <main className="business-mypage-main-content">
            
            {/* 1. 내 의뢰 현황 */}
            {activeTab === "requests" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>내 의뢰 현황</h2>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={onNewRequestClick}
                      className="btn-edit-trigger"
                      style={{ background: "linear-gradient(135deg, #5b5cf0, #7c3aed)", color: "#fff", border: "none" }}
                    >
                      + 새 통역 의뢰하기
                    </button>
                    <p className="data-count-label">총 {requests.length}건</p>
                  </div>
                </div>

                {/* 최근 알림 영역 */}
                {!loadingData && notifications.length > 0 && (
                  <div className="client-notifications-panel">
                    <h3 className="panel-title">
                      <span className="panel-icon">🔔</span> 최근 알림
                    </h3>
                    <ul className="notification-list">
                      {notifications.map((notif) => (
                        <li key={notif.id} className="notification-item">
                          <div className="notif-header">
                            <span className="notif-badge">
                              {getClientNotificationLabel(notif.event_type)}
                            </span>
                            <span className="notif-time">
                              {new Date(notif.created_at).toLocaleDateString("ko-KR", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="notif-text">{getClientNotificationText(notif)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {loadingData ? (
                  <div className="loading-placeholder">의뢰 불러오는 중...</div>
                ) : requests.length === 0 ? (
                  <div className="mypage-empty-state">
                    <span className="empty-state-symbol">📝</span>
                    <p>등록된 의뢰가 없습니다.</p>
                    <small>통역이 필요한 행사 일정을 등록해 보세요.</small>
                    <button
                      type="button"
                      onClick={onNewRequestClick}
                      className="btn-edit-trigger"
                      style={{ background: "linear-gradient(135deg, #5b5cf0, #7c3aed)", color: "#fff", border: "none", marginTop: "16px" }}
                    >
                      새 통역 의뢰하기
                    </button>
                  </div>
                ) : (
                  <div className="business-requests-list">
                    {requests.map((req) => {
                      const statusLabel = getRequestStatusLabel(req);
                      const requestDocuments = documents.filter((doc) => doc.request_id === req.id);
                      
                      // Filter to get only the latest version of each document type
                      const latestDocs = {};
                      requestDocuments.forEach((doc) => {
                        if (!latestDocs[doc.document_type] || doc.version > latestDocs[doc.document_type].version) {
                          latestDocs[doc.document_type] = doc;
                        }
                      });

                      const estimateDocument = latestDocs["estimate"];
                      const completionDocument = latestDocs["completion"];
                      const payment = payments.find((item) => item.request_id === req.id);

                      const estimateStatus =
                        ["estimate_approved", "company_approved"].includes(req.estimate_status)
                          ? "견적 승인 완료"
                          : estimateDocument
                            ? "견적 확인 필요"
                            : "견적 준비중";
                      return (
                        <article key={req.id} className="business-request-card">
                          <div className="request-card-header">
                            <span className="request-no-badge">
                              의뢰번호: {req.request_no || `REQ-${req.id}`}
                            </span>
                            <span className={`status-badge ${getStatusBadgeClass(statusLabel)}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <h3 className="request-card-title">{req.event_name || req.title || "제목 미입력 의뢰"}</h3>

                          <div className="request-meta-grid">
                            <div className="meta-item">
                              <span className="meta-label">일정</span>
                              <span className="meta-value">
                                {req.start_date || req.event_date} {req.end_date ? `~ ${req.end_date}` : ""}
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">장소</span>
                              <span className="meta-value">{req.event_location || req.location}</span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">필요 인원</span>
                              <span className="meta-value">{req.requested_people_count || req.required_count || 1}명</span>
                            </div>
                          </div>

                          <div className="request-meta-grid" style={{ marginTop: "14px" }}>
                            <div className="meta-item">
                              <span className="meta-label">견적 상태</span>
                              <span className="meta-value">{estimateStatus}</span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">견적 금액</span>
                              <span className="meta-value">
                                {estimateDocument ? formatDocumentAmount(estimateDocument.amount) : "-"}
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">문서</span>
                              <span className="meta-value">
                                {Object.keys(latestDocs).length === 0 ? (
                                  "-"
                                ) : (
                                  Object.values(latestDocs).map((doc) => (
                                    <button
                                      key={doc.id}
                                      type="button"
                                      className="file-download-btn"
                                      onClick={() => handleOpenGeneratedDocument(doc)}
                                      style={{ marginRight: "6px", marginBottom: "4px" }}
                                    >
                                      {getDocumentTypeLabel(doc.document_type)} PDF
                                    </button>
                                  ))
                                )}
                              </span>
                            </div>
                          </div>

                          {estimateDocument && !["estimate_approved", "company_approved"].includes(req.estimate_status) && (
                            <div className="request-card-actions">
                              <button
                                type="button"
                                className="btn-duplicate-request"
                                onClick={() => handleApproveEstimate(req.id)}
                              >
                                견적 승인
                              </button>
                            </div>
                          )}

                          {payment && (
                            <div className="business-payment-section">
                              <div className="business-payment-head">
                                <h4>결제 상태</h4>
                                <span className={`business-payment-badge status-${payment.payment_status || "unpaid"}`}>
                                  {getPaymentStatusLabel(payment.payment_status)}
                                </span>
                              </div>
                              <div className="request-meta-grid">
                                <div className="meta-item">
                                  <span className="meta-label">결제 금액</span>
                                  <span className="meta-value">{formatDocumentAmount(payment.amount)}</span>
                                </div>
                                <div className="meta-item">
                                  <span className="meta-label">입금 기한</span>
                                  <span className="meta-value">{payment.due_date || "-"}</span>
                                </div>
                                <div className="meta-item">
                                  <span className="meta-label">입금 완료일</span>
                                  <span className="meta-value">
                                    {payment.paid_at ? String(payment.paid_at).slice(0, 10) : "-"}
                                  </span>
                                </div>
                              </div>
                              <p>{getPaymentStatusMessage(payment.payment_status)}</p>
                            </div>
                          )}

                          {/* Interactive Step Progress Timeline */}
                          <div className="timeline-section">
                            {renderStatusSteps(req)}
                          </div>

                          {/* 업무확인서 영역 */}
                          <div
                            className="completion-document-section"
                            style={{
                              marginTop: "16px",
                              padding: "16px",
                              borderRadius: "10px",
                              background: "rgba(255, 255, 255, 0.45)",
                              border: "1px solid rgba(226, 232, 240, 0.8)",
                              backdropFilter: "blur(8px)",
                              marginBottom: "16px",
                            }}
                          >
                            <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "850", color: "#1e293b" }}>
                              업무확인서 발급 정보
                            </h4>
                            {completionDocument ? (
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "13px", color: "#475569" }}>
                                  발급 완료 ({completionDocument.document_no} - v{completionDocument.version})
                                </span>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    type="button"
                                    className="file-download-btn"
                                    onClick={() => handleOpenGeneratedDocument(completionDocument)}
                                    style={{ fontSize: "12px", padding: "6px 12px" }}
                                  >
                                    보기
                                  </button>
                                  <button
                                    type="button"
                                    className="file-download-btn secondary"
                                    onClick={() => handleDownloadGeneratedDocument(completionDocument)}
                                    style={{
                                      fontSize: "12px",
                                      padding: "6px 12px",
                                      background: "#f1f5f9",
                                      color: "#475569",
                                      border: "1px solid #cbd5e1",
                                    }}
                                  >
                                    다운로드
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                                업무 완료 후 확인서가 발급됩니다.
                              </p>
                            )}
                          </div>

                          {/* Action Button: Duplicate Request */}
                          {req.operation_status === "completed" && (
                            <div className="request-card-actions">
                              <button
                                type="button"
                                onClick={() => onDuplicateRequest(req)}
                                className="btn-duplicate-request"
                              >
                                🔄 같은 조건으로 다시 의뢰
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 2. 배정 통역 */}
            {activeTab === "interpreters" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>배정 통역사</h2>
                  <p className="data-count-label">총 {assignments.length}명 배정됨</p>
                </div>

                {loadingData ? (
                  <div className="loading-placeholder">배정 통역사 정보 불러오는 중...</div>
                ) : assignments.length === 0 ? (
                  <div className="mypage-empty-state">
                    <span className="empty-state-symbol">🤝</span>
                    <p>배정 완료된 통역사가 없습니다.</p>
                    <small>의뢰 검토 및 매칭이 완료되면 통역사 정보가 표시됩니다.</small>
                  </div>
                ) : (
                  <div className="assigned-interpreters-list">
                    {assignments.map((assign) => {
                      const req = requests.find((r) => r.id === assign.request_id);
                      const interpreter = assign.interpreter;
                      if (!interpreter) return null;

                      const isCertified = isOnliCertified(interpreter);
                      const displayLanguages = interpreter.jlpt || "한국어 · 일본어";
                      const specialtiesList = Array.isArray(interpreter.specialties)
                        ? interpreter.specialties.filter(Boolean)
                        : (interpreter.specialties || "").split(",").map((s) => s.trim()).filter(Boolean);

                      return (
                        <article key={assign.id} className="assigned-interpreter-card">
                          <div className="assignment-request-info">
                            <span className="req-indicator">배정 업무</span>
                            <span className="req-title">
                              [{req?.request_no || `REQ-${assign.request_id}`}] {req?.event_name || "행사"}
                            </span>
                          </div>

                          <div className="interpreter-card-body">
                            <div className="interpreter-card-profile">
                              <div className="profile-header">
                                <div className="profile-info-left">
                                  <h3 className="interpreter-name">{interpreter.name}</h3>
                                  <span className="interpreter-level-badge">{interpreter.level || "Lv1"}</span>
                                  {isCertified && (
                                    <span className="certified-badge">ON-LI 인증</span>
                                  )}
                                </div>
                              </div>

                              <dl className="interpreter-details-dl">
                                <div>
                                  <dt>가능 언어</dt>
                                  <dd>{displayLanguages}</dd>
                                </div>
                                <div>
                                  <dt>통역 경험 횟수</dt>
                                  <dd>{interpreter.experience_count || 0}회</dd>
                                </div>
                                <div className="full-width">
                                  <dt>전문 분야</dt>
                                  <dd>
                                    <div className="tags-container">
                                      {specialtiesList.length > 0 ? (
                                        specialtiesList.map((spec) => (
                                          <span key={spec} className="biz-field-tag">{spec}</span>
                                        ))
                                      ) : (
                                        <span className="no-data">일반 비즈니스</span>
                                      )}
                                    </div>
                                  </dd>
                                </div>
                              </dl>

                              {/* Protected Contacts Section */}
                              <div className="protected-contacts-box">
                                <h4>연락처 정보</h4>
                                {assign.is_contact_visible ? (
                                  <div className="contacts-grid">
                                    <div className="contact-item">
                                      <span className="contact-label">전화번호</span>
                                      <span className="contact-value">{interpreter.phone || "-"}</span>
                                    </div>
                                    <div className="contact-item">
                                      <span className="contact-label">이메일</span>
                                      <span className="contact-value">{interpreter.email || "-"}</span>
                                    </div>
                                    <div className="contact-item">
                                      <span className="contact-label">카카오톡</span>
                                      <span className="contact-value">{interpreter.kakao_or_line || "-"}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="contacts-masked">
                                    <span className="masked-icon">🔒</span>
                                    <p>관리자 승인 대기 중</p>
                                    <small>원활한 조율을 위해 매칭 확정 후 연락처가 공개됩니다.</small>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. 자료 관리 */}
            {activeTab === "materials" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>자료 관리</h2>
                  <p className="data-count-label">행사 관련 통역 참고 자료 관리</p>
                </div>

                {requests.length === 0 ? (
                  <div className="mypage-empty-state">
                    <span className="empty-state-symbol">📂</span>
                    <p>등록된 의뢰가 없습니다.</p>
                    <small>의뢰를 먼저 등록한 뒤 자료를 업로드할 수 있습니다.</small>
                  </div>
                ) : (
                  <div className="materials-management-container">
                    
                    {/* Request Selector */}
                    <div className="material-selector-row">
                      <label className="edit-field">
                        <span>행사 의뢰 선택</span>
                        <select
                          value={selectedMaterialRequestId}
                          onChange={(e) => setSelectedMaterialRequestId(e.target.value)}
                          className="edit-select"
                        >
                          {requests.map((r) => (
                            <option key={r.id} value={r.id}>
                              [{r.request_no || `REQ-${r.id}`}] {r.event_name || "행사"}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Upload Box */}
                    <div className="material-upload-box">
                      <h3>새 자료 업로드</h3>
                      <p>통역사의 원활한 행사 진행을 위한 참고 자료를 공유해 주세요.</p>
                      
                      <div className="upload-fields">
                        <label className="edit-field">
                          <span>자료 구분</span>
                          <select
                            value={materialCategory}
                            onChange={(e) => setMaterialCategory(e.target.value)}
                            className="edit-select"
                          >
                            <option value="제품 소개서">제품 소개서</option>
                            <option value="상담 자료">상담 자료</option>
                            <option value="발표 자료">발표 자료</option>
                            <option value="행사 안내문">행사 안내문</option>
                          </select>
                        </label>
                        
                        <div className="file-drop-zone">
                          <button
                            type="button"
                            disabled={uploadingMaterial}
                            onClick={handleUploadMaterialClick}
                            className="btn-save"
                          >
                            {uploadingMaterial ? "업로드 중..." : "📁 컴퓨터에서 파일 선택"}
                          </button>
                          <small>PDF, JPG, PNG 파일 형식만 지원합니다. (최대 10MB)</small>
                        </div>
                      </div>
                    </div>

                    {/* Uploaded Files List */}
                    <div className="materials-list-section">
                      <h3>업로드된 자료</h3>
                      {loadingData ? (
                        <div className="loading-placeholder">자료 목록 갱신 중...</div>
                      ) : (
                        (() => {
                          const currentRequestId = Number(selectedMaterialRequestId);
                          const filteredMaterials = materials.filter((m) => m.request_id === currentRequestId);

                          if (filteredMaterials.length === 0) {
                            return (
                              <div className="no-materials-box">
                                <p>해당 의뢰에 등록된 행사 자료가 없습니다.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="materials-table-wrapper">
                              <table className="materials-table">
                                <thead>
                                  <tr>
                                    <th>구분</th>
                                    <th>파일명</th>
                                    <th>크기</th>
                                    <th>등록일</th>
                                    <th>동작</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredMaterials.map((mat) => (
                                    <tr key={mat.id}>
                                      <td>
                                        <span className="material-type-pill">{mat.file_type}</span>
                                      </td>
                                      <td className="file-name-cell">
                                        <span
                                          onClick={() => handleDownloadFile(mat.file_path, mat.file_name)}
                                          className="clickable-file"
                                        >
                                          {mat.file_name}
                                        </span>
                                      </td>
                                      <td>{(mat.file_size / 1024 / 1024).toFixed(2)} MB</td>
                                      <td>{new Date(mat.created_at).toLocaleDateString()}</td>
                                      <td>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteMaterial(mat.id, mat.file_path)}
                                          className="btn-delete-link"
                                        >
                                          삭제
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. 기업 정보 */}
            {activeTab === "profile" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>기업 정보</h2>
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
                          onChange={handleEditChange}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>사업자등록번호</span>
                        <input
                          name="businessNumber"
                          type="text"
                          value={editForm.businessNumber}
                          onChange={handleEditChange}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>담당자명</span>
                        <input
                          name="contactName"
                          type="text"
                          value={editForm.contactName}
                          onChange={handleEditChange}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>담당자 연락처</span>
                        <input
                          name="contactPhone"
                          type="text"
                          value={editForm.contactPhone}
                          onChange={handleEditChange}
                          required
                        />
                      </label>
                      <label className="edit-field">
                        <span>국가</span>
                        <select
                          name="country"
                          value={editForm.country}
                          onChange={handleEditChange}
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
                        onChange={handleEditChange}
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

            {/* 5. 문의 */}
            {activeTab === "inquiry" && (
              <div className="business-mypage-card">
                <div className="card-header-with-action">
                  <h2>고객 지원 및 문의</h2>
                  <p className="data-count-label">ON-LI 담당자와 연결하기</p>
                </div>

                <div className="inquiry-content-wrapper">
                  <div className="inquiry-intro">
                    <span className="inquiry-icon">🛎️</span>
                    <h3>무엇을 도와드릴까요?</h3>
                    <p>
                      통역 일정 변경, 긴급 의뢰 접수, 추가 통역사 배정 요청 등 <br />
                      운영 관련 모든 요청은 아래 고객센터 또는 전담 매니저에게 연락주시면 친절하게 응대해 드립니다.
                    </p>
                  </div>

                  <div className="inquiry-channels">
                    <div className="channel-card">
                      <span className="channel-icon">📞</span>
                      <h4>대표 전화</h4>
                      <p className="channel-contact">010-4494-0418</p>
                      <small>평일 오전 9시 - 오후 6시 (주말/공휴일 제외)</small>
                    </div>

                    <div className="channel-card">
                      <span className="channel-icon">✉️</span>
                      <h4>이메일 문의</h4>
                      <p className="channel-contact">support@on-li.co.kr</p>
                      <small>24시간 접수 가능 (영업일 기준 3시간 이내 회신)</small>
                    </div>

                    <div className="channel-card">
                      <span className="channel-icon">💬</span>
                      <h4>카카오톡 실시간 상담</h4>
                      <p className="channel-contact">카카오톡 채널: @onli</p>
                      <small>친구 추가 후 실시간 1:1 조율이 가능합니다.</small>
                    </div>
                  </div>

                  <div className="inquiry-notice-box">
                    <h5>💡 꼭 확인해 주세요!</h5>
                    <ul>
                      <li>행사 3일 전 취소 시 취소 수수료가 발생할 수 있습니다.</li>
                      <li>통역사의 식사 제공 여부 등 행사 세부 진행 요건은 매칭 후 담당 매니저와 조율할 수 있습니다.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </main>

        </div>
      </div>

      {/* Hidden file input for uploading material documents */}
      <input
        type="file"
        ref={materialFileInputRef}
        onChange={handleMaterialFileChange}
        style={{ display: "none" }}
        accept=".pdf,.jpg,.jpeg,.png"
      />
    </div>
  );
}

export default BusinessMypage;
