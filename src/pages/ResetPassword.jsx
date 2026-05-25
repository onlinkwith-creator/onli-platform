import { useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import "./InterpreterAuth.css";

function ResetPassword({ onBackToLogin }) {
  const [form, setForm] = useState({
    password: "",
    passwordConfirm: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      return;
    }

    if (form.password !== form.passwordConfirm) {
      setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: form.password,
      });

      if (error) {
        throw error;
      }

      alert("비밀번호가 변경되었습니다.");
      onBackToLogin?.();
    } catch (error) {
      console.error("Password update failed:", error);
      alert(error.message || "비밀번호 변경에 실패했습니다.");
      setErrorMessage(error.message || "비밀번호 변경에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="interpreter-auth-page">
      <section className="interpreter-auth-card">
        <p className="interpreter-auth-kicker">ON-LI PASSWORD RESET</p>
        <h1>비밀번호 재설정</h1>
        <p>새롭게 사용할 안전한 비밀번호를 설정해주세요.</p>

        <form className="interpreter-auth-form" onSubmit={handleSubmit}>
          <label className="interpreter-auth-field">
            <span>새 비밀번호</span>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="6자리 이상 비밀번호"
              minLength={6}
              required
            />
          </label>
          <label className="interpreter-auth-field">
            <span>새 비밀번호 확인</span>
            <input
              name="passwordConfirm"
              type="password"
              value={form.passwordConfirm}
              onChange={handleChange}
              placeholder="비밀번호 재입력"
              minLength={6}
              required
            />
          </label>

          <button type="submit" className="interpreter-auth-primary" disabled={isSubmitting}>
            {isSubmitting ? "변경 중..." : "비밀번호 변경하기"}
          </button>
        </form>

        {errorMessage && <p className="interpreter-auth-message is-error">{errorMessage}</p>}

        <div className="interpreter-auth-links">
          <button type="button" onClick={onBackToLogin}>
            로그인 화면으로 이동
          </button>
        </div>
      </section>
    </main>
  );
}

export default ResetPassword;
