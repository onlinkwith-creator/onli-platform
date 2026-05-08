import { useEffect, useState } from "react";
import { supabase } from "../supabase";

function InterpreterList({ onBackClick, onDetailClick }) {
  const [interpreters, setInterpreters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchInterpreters = async () => {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("interpreters")
        .select("*")
        .eq("status", "approved")
        .order("id", { ascending: false });

      if (error) {
        console.error(error);
        setErrorMessage("통역사 정보를 불러오지 못했습니다.");
        setLoading(false);
        return;
      }

      setInterpreters(data || []);
      setLoading(false);
    };

    fetchInterpreters();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
        padding: "60px 24px",
        boxSizing: "border-box",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <button
          onClick={onBackClick}
          style={{
            marginBottom: "30px",
            padding: "12px 18px",
            borderRadius: "999px",
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          ← 메인으로
        </button>

        <div style={{ marginBottom: "36px" }}>
          <p
            style={{
              fontSize: "13px",
              letterSpacing: "5px",
              color: "#4f46e5",
              fontWeight: "700",
              marginBottom: "8px",
            }}
          >
            ON-LI INTERPRETERS
          </p>

          <h1
            style={{
              margin: 0,
              fontSize: "42px",
              fontWeight: "800",
              color: "#111827",
            }}
          >
            통역사 리스트
          </h1>

          <p
            style={{
              marginTop: "12px",
              color: "#6b7280",
              fontSize: "15px",
            }}
          >
            승인된 한일 비즈니스 통역사 정보를 확인할 수 있습니다.
          </p>
        </div>

        {loading ? (
          <MessageBox text="통역사 정보를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : interpreters.length === 0 ? (
          <MessageBox text="아직 승인된 통역사가 없습니다." />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "22px",
            }}
          >
            {interpreters.map((person) => (
              <div
                key={person.id}
                style={{
                  background: "rgba(255, 255, 255, 0.9)",
                  borderRadius: "24px",
                  padding: "26px",
                  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
                  border: "1px solid rgba(255,255,255,0.8)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "18px",
                    gap: "12px",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "24px",
                      fontWeight: "800",
                      color: "#111827",
                    }}
                  >
                    {person.name || "이름 미입력"}
                  </h2>

                  <span
                    style={{
                      padding: "6px 12px",
                      borderRadius: "999px",
                      background: "#eef2ff",
                      color: "#4f46e5",
                      fontSize: "12px",
                      fontWeight: "700",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {person.jlpt || "JLPT 미입력"}
                  </span>
                </div>

                <Info label="성별" value={person.gender} />
                <Info label="나이" value={person.age} />
                <Info label="거주 지역" value={person.region} />
                <Info label="학교/전공" value={person.school} />
                <Info label="일본 거주 기간" value={person.stay_period} />
                <Info
                  label="통역 경험"
                  value={
                    person.experience_count
                      ? `${person.experience_count}회`
                      : "-"
                  }
                />

                <button
  onClick={() => onDetailClick(person)}
  style={{
    marginTop: "20px",
    width: "100%",
    padding: "14px",
    borderRadius: "14px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "800",
    cursor: "pointer",
    fontSize: "14px",
  }}
>
  상세 보기
</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "9px 0",
        borderBottom: "1px solid #f1f5f9",
        fontSize: "14px",
      }}
    >
      <span style={{ color: "#6b7280", fontWeight: "600" }}>{label}</span>
      <span style={{ color: "#111827", textAlign: "right" }}>
        {value || "-"}
      </span>
    </div>
  );
}

function MessageBox({ text }) {
  return (
    <div
      style={{
        background: "white",
        padding: "40px",
        borderRadius: "20px",
        textAlign: "center",
        color: "#6b7280",
      }}
    >
      {text}
    </div>
  );
}

export default InterpreterList;