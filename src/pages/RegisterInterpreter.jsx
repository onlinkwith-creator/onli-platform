import { useState } from "react";
import { supabase } from "../supabase";

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
  padding: "14px",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#374151",
  fontSize: "14px",
  fontWeight: "600",
  cursor: "pointer",
};

function RegisterInterpreter() {
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
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const values = Object.values(form);
    const hasEmpty = values.some((value) => value.trim() === "");

    if (hasEmpty) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    const { error } = await supabase
  .from("interpreters")
  .insert([{ ...form }]);

if (error) {
  console.error(error);
  alert("등록 중 오류가 발생했습니다.");
  return;
}
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        background:
          "linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #ffffff 100%)",
        color: "#111827",
        padding: "70px 20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: "999px",
              background: "#eef2ff",
              color: "#000000",
              fontSize: "13px",
              fontWeight: "700",
              marginBottom: "14px",
            }}
          >
            ON-LI INTERPRETER
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "34px",
              fontWeight: "800",
              letterSpacing: "-0.8px",
              color: "#111827",
            }}
          >
            통역사 등록
          </h1>

          <p
            style={{
              marginTop: "12px",
              color: "#484c55",
              fontSize: "15px",
              lineHeight: "1.7",
            }}
          >
            한일 비즈니스 통역 매칭을 위한 기본 정보를 입력해주세요.
          </p>
        </div>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(16px)",
            padding: "42px",
            borderRadius: "28px",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 30px 80px rgba(15, 23, 42, 0.14)",
            color: "#004cff",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <input style={inputStyle} name="name" placeholder="성명" value={form.name} onChange={handleChange} />
            <input style={inputStyle} name="gender" placeholder="성별" value={form.gender} onChange={handleChange} />
            <input style={inputStyle} name="age" placeholder="나이" value={form.age} onChange={handleChange} />
            <input style={inputStyle} name="region" placeholder="거주 지역 (예: 東京都)" value={form.region} onChange={handleChange} />
            <input style={inputStyle} name="email" placeholder="이메일" value={form.email} onChange={handleChange} />
            <input style={inputStyle} name="phone" placeholder="일본 연락처" value={form.phone} onChange={handleChange} />
            <input style={inputStyle} name="school" placeholder="학교 및 전공" value={form.school} onChange={handleChange} />
            <input style={inputStyle} name="kakaoOrLine" placeholder="카카오/라인 ID" value={form.kakaoOrLine} onChange={handleChange} />
            <input style={inputStyle} name="jlpt" placeholder="JLPT 급수 및 점수" value={form.jlpt} onChange={handleChange} />
            <input style={inputStyle} name="stayPeriod" placeholder="일본 거주 기간 (0년 0개월)" value={form.stayPeriod} onChange={handleChange} />

            <input
              style={{
                ...inputStyle,
                gridColumn: "1 / 3",
              }}
              name="experienceCount"
              placeholder="통역 경험 횟수"
              value={form.experienceCount}
              onChange={handleChange}
            />

            <button
              type="submit"
              style={{
                ...submitButtonStyle,
                gridColumn: "1 / 3",
              }}
            >
              등록하기
            </button>
          </form>

          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            style={backButtonStyle}
          >
            메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

export default RegisterInterpreter;