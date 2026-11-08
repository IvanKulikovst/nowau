// Клиент API. Токен хранится в localStorage; при 401 — выход на /login.
export class ApiError extends Error {
  constructor(public status: number, message: string, public requestId?: string) { super(message); }
}

const TOKEN_KEY = "cp_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(`/api/v1${path}`, { ...init, headers });
  if (r.status === 401 && !path.startsWith("/auth/")) {
    setToken(null);
    if (location.pathname !== "/login") location.assign("/login");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || "Ошибка запроса", data.request_id);
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<Me>("/users/me"),
  changePassword: (old_password: string, new_password: string) =>
    request("/users/me/password", { method: "POST", body: JSON.stringify({ old_password, new_password }) }),
  subscription: () => request<{ status: string; tier: string; message?: string }>("/users/me/subscription"),
  analyze: (body: AnalyzeBody) => request<Summary>("/analyze", { method: "POST", body: JSON.stringify(body) }),
  analyses: () => request<AnalysisRow[]>("/analyses"),
  summary: (id: string) => request<Summary>(`/analysis/${id}`),
  details: (id: string) => request<Details>(`/analysis/${id}/details`),
  audit: (id: string) => request<Audit>(`/analysis/${id}/audit`),
  registry: (id: string) => request<RegistryResp>(`/analysis/${id}/registry`),
  setMode: (caseId: number, mode: string) =>
    request<Summary & { warning: string }>(`/cases/${caseId}/set-mode`, { method: "POST", body: JSON.stringify({ mode }) }),
  documents: (claimId: number) => request<Doc[]>(`/claims/${claimId}/documents`),
  upload: (claimId: number, file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return request<UploadResp>(`/claims/${claimId}/documents`, { method: "POST", body: fd });
  },
  docStatus: (id: number) => request<DocStatus>(`/documents/${id}/status`),
  confirmFacts: (id: number) =>
    request<{ confirmed: number; total: number; analysis_id: number | null }>(`/documents/${id}/confirm-facts`, { method: "POST", body: "{}" }),
};

export type Me = { id: number; email: string; role: string; tier: string;
  flags: { billing_enabled: boolean; public_signup: boolean; public_mode: boolean; show_cookie_banner: boolean; parsers_mode: string } };
export type ClaimBody = { amount?: number; construction_type?: string; claim_date?: string; execution_date?: string;
  executed_amount?: number; status?: string; crisis?: boolean; rescue_form?: boolean; unusual_conditions?: boolean };
export type ManualBody = { filing_date?: string; total_assets?: number; current_expenses?: number; sigma3?: number;
  judge?: { n_cases: number; approval_rate: number; is_significant: boolean };
  collateral?: { C: number; L: number }[] };
export type AnalyzeBody = { inn?: string; case_number?: string; claim?: ClaimBody; manual?: ManualBody; mode?: string };
export type Risk = { key: string; title: string; p: number; light: "red" | "yellow" | "green"; label: string };
export type Action = { key: string; title: string; reason: string; fee_rub: number; months: string; lawyers_rub: [number, number];
  expected_gain_rub: number | null; economically_justified: boolean };
export type Summary = {
  id: number; claim_id: number; case_id: number | null; mode: string; queue: string;
  case: { number?: string; court?: string; debtor?: string; inn?: string } | null;
  claim_amount: number; executed_amount: number; expected_amount: number; expected_pct: number;
  range_low_pct: number; range_high_pct: number; range_low: number; range_high: number;
  confidence: "low" | "medium" | "high"; probabilistic_label: string; risks: Risk[];
  recommendation: { title: string; reason: string } | null; assumptions: string[]; warnings: string[];
  status: string; manual_input_required: boolean; mode_manual: boolean; demo_data: boolean; manual_data: boolean;
  auto_mode: { mode: string; reason: string };
  disclaimers: { general: string; ads: string };
};
export type Scenario = { name: string; title: string; probability: number; payout_rub: number; payout_pct: number };
export type Details = {
  scenarios: Scenario[]; actions: Action[]; priorities: string[]; checklist: string[];
  calendar: { date: string | null; title: string }[];
  au: { name: string; sro: string; n_cases: number } | null;
  au_index: { score: number; critical: boolean; items: { label: string; points: number }[] };
  judge: { name: string; n_cases: number; approval_rate: number; is_significant: boolean } | null;
  information_levels: Record<string, number>;
  disclaimers: Record<string, string>;
};
export type Audit = {
  formulas: string[]; formula: string; method: string;
  probabilities: { p_sub: number; p_ch: number; p_zero: number; delta_practice: number; delta_au: number };
  judge: { name: string; n_cases: number; approval_rate: number; is_significant: boolean } | null;
  judge_delta: { deviation?: number; note?: string; profile?: boolean };
  au_index: { score: number; critical: boolean; items: { label: string; points: number }[] };
  modules: Record<string, Record<string, unknown>>;
  information_levels: Record<string, number>; assumptions: string[];
  sources: { title: string; url: string }[]; disclaimers: Record<string, string>;
  audit: Record<string, unknown>;
};
export type RegistryResp = { available: boolean; note: string | null; demo_data: boolean;
  rows: { name: string; amount: number; share: number; p_ch: number; challenge_candidate: boolean; own: boolean }[] };
export type AnalysisRow = { id: number; mode: string; case: { number?: string; debtor?: string } | null;
  expected_amount: number; expected_pct: number; calculated_at: string };
export type Doc = { id: number; document_type: string; mime_type: string; file_size: number; status: string };
export type UploadResp = { id: number; status: string; document_type: string; needs_confirmation: boolean;
  facts: { field: string; value: string; confidence: number }[] };
export type DocStatus = { id: number; status: string; document_type: string;
  facts: { id: number; field: string; value: string; confidence: number; confirmed: boolean; label: string }[] };
