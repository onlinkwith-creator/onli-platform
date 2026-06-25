import "./RoleSelection.css";

function RoleSelection({ onRegisterInterpreter, onRegisterBusiness, onBackClick }) {
  return (
    <main className="role-selection-page">
      <div className="role-bg-glow" />
      <section className="role-selection-card">
        <button type="button" onClick={onBackClick} className="role-back-btn">
          ← 홈으로
        </button>
        <p className="role-kicker">ON-LI ACCOUNT TYPE</p>
        <h1>계정 유형 선택</h1>
        <p className="role-desc">
          ON-LI 서비스 이용을 위해 원하시는 계정 유형을 선택하고 등록을 완료해 주세요.
        </p>

        <div className="role-options-grid">
          <article className="role-option-card">
            <div className="role-icon">🗣️</div>
            <h2>통역사로 활동하기</h2>
            <p>
              한국어와 일본어 능력을 발휘하여 다양한 비즈니스 현장(전시회, 미팅, 출장)에서 통역사로 활동해 보세요.
            </p>
            <button
              type="button"
              onClick={onRegisterInterpreter}
              className="btn-select-role interpreter-btn"
            >
              통역사 등록하기
            </button>
          </article>

          <article className="role-option-card">
            <div className="role-icon">🏢</div>
            <h2>기업으로 의뢰하기</h2>
            <p>
              일본 현장 통역 의뢰를 간편하게 등록하고, 검증된 통역사들과 매칭하여 일정을 편리하게 관리해 보세요.
            </p>
            <button
              type="button"
              onClick={onRegisterBusiness}
              className="btn-select-role business-btn"
            >
              기업 등록하기
            </button>
          </article>
        </div>
      </section>
    </main>
  );
}

export default RoleSelection;
