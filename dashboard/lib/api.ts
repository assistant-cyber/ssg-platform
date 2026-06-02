/**
 * SSG Dashboard API Client
 * Mirrors the mobile app's api.ts but adapted for Next.js / browser.
 */

// Route browser traffic through the Next/Vercel app so mobile Safari never
// talks to the temporary tunnel directly.
const BASE = '/api-proxy';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
  user_id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  church_name: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  status: string;
  customer_access_code: string | null;
  general_notes: string | null;
  created_at: string;
  updated_at: string | null;
  photo_count: number;
}

export interface Photo {
  id: string;
  project_id: string;
  storage_url: string;
  thumbnail_url: string | null;
  original_filename?: string | null;
  filename: string | null;
  window_number: string | null;
  panel_letter: string | null;
  elevation: string | null;
  notes: string | null;
  sort_order: number;
  uploaded_at: string;
  condition_data?: ConditionData | null;
}

export interface ProjectDetail extends Project {
  photos: Photo[];
  latest_report: Report | null;
  latest_estimate: Estimate | null;
}

export interface ConditionData {
  id: string;
  window_num: string | null;
  panel_letter: string | null;
  elevation: string | null;
  warping: number | null;
  lead_det: number | null;
  breaks: number | null;
  wood_rot: boolean | null;
  paint_fail: boolean | null;
  pieces: number | null;
  panel_w: number | null;
  panel_h: number | null;
  overall_w: number | null;
  overall_h: number | null;
  is_overall_only: boolean;
  parsed_notes: string | null;
}

export interface Report {
  id: string;
  project_id: string;
  narrative: Record<string, unknown> | null;
  spreadsheet_url: string | null;
  pdf_url: string | null;
  generated_at: string;
}

export interface EstimateLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface Estimate {
  id: string;
  project_id: string;
  status: string;
  total_amount: number;
  notes: string | null;
  line_items: EstimateLineItem[];
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
}

export interface Proposal {
  id: string;
  project_id: string;
  estimate_id: string | null;
  pdf_url: string | null;
  generated_at: string | null;
  viewed_at: string | null;
  viewed_by_customer: boolean;
  status: string;
}

// ── Client class ──────────────────────────────────────────────────────────────

class ApiClient {
  constructor(private readonly tokenKey = 'ssg_token') {}

  getToken(): string | null {
    try {
      return typeof globalThis.localStorage?.getItem === 'function'
        ? localStorage.getItem(this.tokenKey)
        : null;
    } catch { return null; }
  }

  setToken(token: string | null) {
    try {
      if (typeof globalThis.localStorage?.setItem !== 'function') return;
      if (token) localStorage.setItem(this.tokenKey, token);
      else localStorage.removeItem(this.tokenKey);
    } catch {}
  }

  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const e = await res.json(); detail = e.detail ?? detail; } catch {}
      throw new Error(detail);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async login(code: string): Promise<LoginResponse> {
    return this.request('POST', '/auth/login', { code });
  }

  // ── Projects ──────────────────────────────────────────────────────────────
  async listProjects(): Promise<Project[]> {
    return this.request('GET', '/projects');
  }

  async getProject(id: string): Promise<ProjectDetail> {
    return this.request('GET', `/projects/${id}`);
  }

  async createProject(data: Partial<Project>): Promise<Project> {
    return this.request('POST', '/projects', data);
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    return this.request('PATCH', `/projects/${id}`, data);
  }

  async deleteProject(id: string): Promise<void> {
    return this.request('DELETE', `/projects/${id}`);
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  async uploadPhoto(
    projectId: string,
    file: File,
    notes: string,
    options?: { filenameOverride?: string; takenAt?: string },
  ): Promise<Photo> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('notes', notes);

    if (options?.takenAt) {
      formData.append('taken_at', options.takenAt);
    }
    if (options?.filenameOverride) {
      formData.append('filename_override', options.filenameOverride);
    }

    const token = this.getToken();
    const res = await fetch(`${BASE}/projects/${projectId}/photos`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const e = await res.json(); detail = e.detail ?? detail; } catch {}
      throw new Error(detail);
    }

    return res.json();
  }

  async updatePhoto(id: string, data: { notes?: string }): Promise<Photo> {
    return this.request('PATCH', `/photos/${id}`, data);
  }

  async deletePhoto(id: string): Promise<void> {
    return this.request('DELETE', `/photos/${id}`);
  }

  async downloadPhotosArchive(projectId: string, photoIds: string[] = []): Promise<Blob> {
    const token = this.getToken();
    const res = await fetch(`${BASE}/projects/${projectId}/photos/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ photo_ids: photoIds }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const e = await res.json(); detail = e.detail ?? detail; } catch {}
      throw new Error(detail);
    }

    return res.blob();
  }

  async downloadSelectedPhotos(photoIds: string[]): Promise<Blob> {
    const token = this.getToken();
    const res = await fetch(`${BASE}/photos/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ photo_ids: photoIds }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const e = await res.json(); detail = e.detail ?? detail; } catch {}
      throw new Error(detail);
    }

    return res.blob();
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  async generateReport(
    projectId: string,
    narrative?: unknown,
    mode = 'shorthand',
    publishToPortal = true,
  ): Promise<Report> {
    return this.request('POST', `/projects/${projectId}/generate-report`, {
      narrative: narrative ?? {},
      parsing_mode: mode,
      count_pieces: false,
      glass_flavor: 'stained',
      publish_to_portal: publishToPortal,
    });
  }

  async getReport(projectId: string): Promise<Report> {
    return this.request('GET', `/projects/${projectId}/report`);
  }

  async saveReportDraft(
    projectId: string,
    narrative: unknown,
  ): Promise<Report> {
    return this.request('PATCH', `/projects/${projectId}/report`, { narrative });
  }

  async generateAiReportDraft(
    projectId: string,
    data: { additional_context?: string; voice: 'pastoral_confident' | 'heritage_stewardship' | 'concise_executive' },
  ): Promise<Report> {
    return this.request('POST', `/projects/${projectId}/generate-report-draft`, data);
  }

  async improveBrief(projectId: string, text: string): Promise<{ text: string }> {
    return this.request('POST', `/projects/${projectId}/improve-brief`, { text });
  }

  // ── Estimates ─────────────────────────────────────────────────────────────
  async getEstimate(projectId: string): Promise<Estimate> {
    return this.request('GET', `/projects/${projectId}/estimate`);
  }

  async saveEstimate(
    projectId: string,
    lineItems: Omit<EstimateLineItem, 'id' | 'total'>[],
    notes?: string,
  ): Promise<Estimate> {
    return this.request('POST', `/projects/${projectId}/estimate`, {
      line_items: lineItems,
      notes,
    });
  }

  async sendEstimate(projectId: string): Promise<Estimate> {
    return this.request('POST', `/projects/${projectId}/estimate/send`);
  }

  // ── Proposals ─────────────────────────────────────────────────────────────
  async generateProposal(projectId: string): Promise<Proposal> {
    return this.request('POST', `/projects/${projectId}/generate-proposal`);
  }

  async getProposal(projectId: string): Promise<Proposal> {
    return this.request('GET', `/projects/${projectId}/proposal`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  mediaUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${BASE}${url}`;
  }
}

export const api = new ApiClient();
export const portalApi = new ApiClient('ssg_portal_token');
export default api;
