import { useState } from "react";
import { supabase } from "../supabase";

const specialtyOptions = [
  "뷰티",
  "전시회",
  "스타트업",
  "게임/콘텐츠",
  "F&B",
  "패션",
  "관광",
  "일반 비즈니스",
];

const regionOptions = [
  "도쿄",
  "가나가와",
  "치바",
  "사이타마",
  "오사카",
  "교토",
  "효고",
  "나고야",
  "후쿠오카",
  "기타",
];

const inputStyle = {
  width: "100%",
  padding: "15px 16px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  fontSize: "14px",
  outline: "none",
  color: "#111827",
  boxSizing: "border-box",
};

const submitButtonStyle = {
  marginTop: "12px",
  padding: "16px",
  borderRadius: "14px",
  border: "none",
  background: "linear-gradient(135deg, #111827, #374151)",
  color: "white",
  fontSize: "16px",
  fontWeight: "700",
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(17, 24, 39, 0.25)",
};

const backButtonStyle = {
  marginTop: "14px",
  width: "100%",
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #395597",
  backgroundColor: "#395597",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "700",
  cursor: "pointer",
};

function RegisterInterpreter({ onBackClick }) {
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    gender: "",
    age: "",
    region: "",
    email: "",
    phone: "",
    school: "",
    kakaoOrLine: "",
    jlpt: "",
    stayPeriod: "",
    experienceCount: "",
    specialties: [],
    availableRegions: [],
    availableTasks: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const toggleArrayValue = (field, value) => {
    setForm((current) => {
      const values = current[field];
      const hasValue = values.includes(value);
      return {
        ...current,
        [field]: hasValue
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!form.gender) {
      setErrorMessage("성별을 선택해주세요.");
      return;
    }

    if (form.availableRegions.length === 0) {
      setErrorMessage("활동 가능 지역을 선택해주세요.");
      return;
    }

    if (form.specialties.length === 0) {
      setErrorMessage("전문 분야를 1개 이상 선택해주세요.");
      return;
    }

    const { error } = await supabase.from("interpreters").insert([
      {
        name: form.name,
        gender: form.gender,
        age: form.age,
        region: form.region,
        email: form.email,
        phone: form.phone,
        school: form.school,
        kakao_or_line: form.kakaoOrLine,
        jlpt: form.jlpt,
        stay_period: form.stayPeriod,
        experience_count: form.experienceCount,
        specialties: form.specialties,
        available_regions: form.availableRegions,
        available_tasks: form.availableTasks,
      },
    ]);

    if (error) {
      console.error("등록 실패 원인:", error.message);
      alert(error.message);
      return;
    }

    alert("등록 완료");
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.badge}>ON-LI INTERPRETER</div>
          <h1 style={styles.title}>통역사 등록</h1>
          <p style={styles.description}>
            한일 비즈니스 통역 매칭을 위한 기본 정보를 입력해주세요.
          </p>
        </div>

        <div style={styles.card}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <input style={inputStyle} name="name" placeholder="성명" value={form.name} onChange={handleChange} required />
            <input style={inputStyle} name="age" placeholder="나이" value={form.age} onChange={handleChange} required />

            <select
              style={inputStyle}
              name="gender"
              value={form.gender}
              onChange={handleChange}
              required
            >
              <option value="">성별 선택</option>
              <option value="남자">남자</option>
              <option value="여자">여자</option>
            </select>

            <input style={inputStyle} name="region" placeholder="거주 지역 (예: 도쿄)" value={form.region} onChange={handleChange} required />
            <input style={inputStyle} name="email" type="email" placeholder="이메일" value={form.email} onChange={handleChange} required />
            <input style={inputStyle} name="phone" placeholder="일본 연락처" value={form.phone} onChange={handleChange} required />
            <input style={inputStyle} name="school" placeholder="학교 및 전공" value={form.school} onChange={handleChange} />
            <input style={inputStyle} name="kakaoOrLine" placeholder="카카오/라인 ID" value={form.kakaoOrLine} onChange={handleChange} />
            <input style={inputStyle} name="jlpt" placeholder="JLPT 급수 및 점수" value={form.jlpt} onChange={handleChange} required />
            <input style={inputStyle} name="stayPeriod" placeholder="일본 거주 기간 (0년 0개월)" value={form.stayPeriod} onChange={handleChange} required />
            <input style={inputStyle} name="experienceCount" placeholder="통역 경험 횟수" value={form.experienceCount} onChange={handleChange} />

            <CheckboxGroup
              title="활동 가능 지역"
              options={regionOptions}
              values={form.availableRegions}
              onToggle={(value) => toggleArrayValue("availableRegions", value)}
            />

            <CheckboxGroup
              title="전문 분야"
              options={specialtyOptions}
              values={form.specialties}
              onToggle={(value) => toggleArrayValue("specialties", value)}
            />

            <input
              style={{ ...inputStyle, ...styles.fullWidth }}
              name="availableTasks"
              placeholder="통역 가능 업무 (예: 상담 통역, 부스 응대, 바이어 미팅, 제품 설명 등)"
              value={form.availableTasks}
              onChange={handleChange}
            />

            {errorMessage && (
              <p style={styles.errorMessage}>{errorMessage}</p>
            )}

            <button type="submit" style={{ ...submitButtonStyle, ...styles.fullWidth }}>
              등록하기
            </button>
          </form>

          <button
            type="button"
            onClick={onBackClick}
            className="main-return-button"
            style={backButtonStyle}
          >
            메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckboxGroup({ title, options, values, onToggle }) {
  return (
    <div style={styles.fullWidth}>
      <p style={styles.groupLabel}>{title}</p>
      <div style={styles.checkGrid}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            style={{
              ...styles.checkLabel,
              ...(values.includes(option) ? styles.checkLabelActive : {}),
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #ffffff 100%)",
    color: "#111827",
    padding: "70px 20px",
    boxSizing: "border-box",
  },
  container: {
    maxWidth: "720px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: "28px",
  },
  badge: {
    display: "inline-block",
    padding: "8px 16px",
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#000000",
    fontSize: "13px",
    fontWeight: "700",
    marginBottom: "14px",
  },
  title: {
    margin: 0,
    fontSize: "34px",
    fontWeight: "800",
    color: "#111827",
  },
  description: {
    marginTop: "12px",
    color: "#484c55",
    fontSize: "15px",
    lineHeight: "1.7",
  },
  card: {
    background: "rgba(255, 255, 255, 0.88)",
    backdropFilter: "blur(16px)",
    padding: "42px",
    borderRadius: "28px",
    border: "1px solid rgba(255, 255, 255, 0.8)",
    boxShadow: "0 30px 80px rgba(15, 23, 42, 0.14)",
  },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "16px",
  },
  fullWidth: {
    gridColumn: "1 / 3",
  },
  groupLabel: {
    margin: "4px 0 10px",
    color: "#374151",
    fontSize: "14px",
    fontWeight: "800",
    textAlign: "left",
  },
  checkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "10px",
  },
  checkLabel: {
    padding: "11px 12px",
    borderRadius: "14px",
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#111827",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "center",
  },
  checkLabelActive: {
    background: "#eef2ff",
    borderColor: "#4f46e5",
    color: "#4f46e5",
  },
  errorMessage: {
    gridColumn: "1 / 3",
    margin: "0",
    color: "#dc2626",
    fontSize: "14px",
    fontWeight: "800",
    textAlign: "left",
  },
};

export default RegisterInterpreter;
