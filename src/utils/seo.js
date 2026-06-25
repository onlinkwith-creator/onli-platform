const SITE_URL = "https://onli-platform.vercel.app";

const DEFAULT_SEO = {
  title: "ON-LI | 한일 비즈니스 통역 매칭 플랫폼",
  description: "전시회, 상담회, 기업 미팅을 위한 검증된 한일 통역사를 빠르게 연결합니다.",
  robots: "index,follow",
};

const SEO_BY_PAGE = {
  home: DEFAULT_SEO,
  jobs: {
    title: "한일 통역 공고 | ON-LI",
    description: "일본 현장 통역, 전시회 통역, 비즈니스 통역 모집 정보를 확인하세요.",
  },
  list: {
    title: "ON-LI 인증 한일 통역사 찾기 | ON-LI",
    description: "검증된 한국어 일본어 비즈니스 통역사를 확인하고 프로젝트에 맞는 인재를 찾으세요.",
  },
  jobCreate: {
    title: "한일 비즈니스 통역 의뢰 | ON-LI",
    description: "일본 출장, 전시회, 상담회 통역 인력을 간편하게 요청하세요.",
  },
  request: {
    title: "한일 비즈니스 통역 의뢰 | ON-LI",
    description: "일본 출장, 전시회, 상담회 통역 인력을 간편하게 요청하세요.",
  },
  business: {
    title: "기업 한일 통역 서비스 | ON-LI",
    description: "일본 전시회, 상담회, 기업 미팅에 필요한 한일 비즈니스 통역사를 ON-LI에서 빠르게 매칭하세요.",
  },
  about: {
    title: "ON-LI 소개 | 한일 비즈니스 통역 플랫폼",
    description: "ON-LI가 한일 비즈니스 현장에 맞는 통역사를 연결하는 방식을 확인하세요.",
  },
  admin: {
    title: "ON-LI 관리자",
    description: "ON-LI 관리자 페이지입니다.",
    robots: "noindex,nofollow",
  },
};

const SEO_BY_POLICY_KEY = {
  privacy: {
    title: "개인정보처리방침 | ON-LI",
    description: "ON-LI 개인정보처리방침을 확인하세요.",
  },
  commonTerms: {
    title: "이용약관 | ON-LI",
    description: "ON-LI 서비스 이용약관을 확인하세요.",
  },
  clientPolicy: {
    title: "기업 이용약관 | ON-LI",
    description: "ON-LI 기업 고객 이용약관을 확인하세요.",
  },
  interpreterPolicy: {
    title: "통역사 활동 약관 | ON-LI",
    description: "ON-LI 통역사 활동 약관을 확인하세요.",
  },
};

export function applySeo(page, path, policyKey) {
  const policySeo = page === "policy" ? SEO_BY_POLICY_KEY[policyKey] : null;
  const seo = {
    ...DEFAULT_SEO,
    ...(SEO_BY_PAGE[page] || {}),
    ...(policySeo || {}),
  };
  const canonicalPath = path || window.location.pathname || "/";
  const canonicalUrl = `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`;

  document.title = seo.title;
  setMeta("name", "description", seo.description);
  setMeta("name", "robots", seo.robots || DEFAULT_SEO.robots);
  setMeta("property", "og:title", seo.title);
  setMeta("property", "og:description", seo.description);
  setCanonical(canonicalUrl);
}

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}
