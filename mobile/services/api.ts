/**
 * SSG Platform API Client
 *
 * All calls go through this module. Token is injected from AuthContext.
 * Set EXPO_PUBLIC_API_URL in .env (your Mac's LAN IP for device testing).
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface Window {
  id: string;
  project_id: string;
  number: number;
  name: string | null;
  notes: string | null;
  created_at: string;
  sort_order: number;
  photo_count?: number;
}

export interface Photo {
  id: string;
  project_id: string;
  window_id: string | null;
  storage_url: string;
  thumbnail_url: string | null;
  original_filename: string | null;
  filename: string | null;
  window_number: string | null;
  panel_letter: string | null;
  elevation: string | null;
  notes: string | null;
  sort_order: number;
  uploaded_at: string;
  captured_at: string | null;
  capture_sequence: number | null;
  letter_override: string | null;
  label?: string;
}

export interface Estimate {
  id: string;
  project_id: string;
  status: string;
  total_amount: number;
  notes: string | null;
  line_items: EstimateLineItem[];
  created_at: string;
}

export interface EstimateLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface ProjectDetail extends Project {
  photos: Photo[];
  latest_report: Report | null;
  latest_estimate: Estimate | null;
}

export interface Report {
  id: string;
  project_id: string;
  narrative: Record<string, string> | null;
  spreadsheet_url: string | null;
  pdf_url: string | null;
  generated_at: string;
}

// ─── API Client ───────────────────────────────────────────────────────────────

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.detail ?? detail;
      } catch {}
      throw new Error(detail);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(code: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('POST', '/auth/login', { code });
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('GET', '/projects');
  }

  async createProject(data: {
    name: string;
    church_name?: string;
    address_street?: string;
    address_city?: string;
    address_state?: string;
    address_zip?: string;
  }): Promise<Project> {
    return this.request<Project>('POST', '/projects', data);
  }

  async getProject(id: string): Promise<ProjectDetail> {
    return this.request<ProjectDetail>('GET', `/projects/${id}`);
  }

  async updateProject(
    id: string,
    data: Partial<Pick<Project, 'name' | 'church_name' | 'status' | 'general_notes'>>,
  ): Promise<Project> {
    return this.request<Project>('PATCH', `/projects/${id}`, data);
  }

  // ── Windows ───────────────────────────────────────────────────────────────

  async listWindows(projectId: string): Promise<Window[]> {
    return this.request<Window[]>('GET', `/projects/${projectId}/windows`);
  }

  async createWindow(projectId: string, data: {
    number: number;
    name?: string;
    notes?: string;
    sort_order?: number;
  }): Promise<Window> {
    return this.request<Window>('POST', `/projects/${projectId}/windows`, data);
  }

  async getWindow(windowId: string): Promise<Window> {
    return this.request<Window>('GET', `/windows/${windowId}`);
  }

  async updateWindow(windowId: string, data: {
    number?: number;
    name?: string;
    notes?: string;
    sort_order?: number;
  }): Promise<Window> {
    return this.request<Window>('PATCH', `/windows/${windowId}`, data);
  }

  async deleteWindow(windowId: string): Promise<void> {
    return this.request<void>('DELETE', `/windows/${windowId}`);
  }

  async listWindowPhotos(windowId: string): Promise<Photo[]> {
    return this.request<Photo[]>('GET', `/windows/${windowId}/photos`);
  }

  // ── Photos ────────────────────────────────────────────────────────────────

  async uploadPhoto(
    projectId: string,
    photoUri: string,
    notes: string,
    takenAt?: string,
  ): Promise<Photo> {
    const formData = new FormData();

    // React Native FormData accepts {uri, type, name} for files
    formData.append('file', {
      uri: photoUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as unknown as Blob);

    formData.append('notes', notes);
    if (takenAt) {
      formData.append('taken_at', takenAt);
    }

    const res = await fetch(`${BASE_URL}/projects/${projectId}/photos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        // Note: do NOT set Content-Type manually for multipart — fetch sets it with boundary
      },
      body: formData,
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.detail ?? detail;
      } catch {}
      throw new Error(detail);
    }

    return res.json() as Promise<Photo>;
  }

  async uploadPhotoToWindow(
    windowId: string,
    photoUri: string,
    notes: string,
    capturedAt: string,
    captureSequence?: number,
  ): Promise<Photo> {
    const formData = new FormData();

    formData.append('file', {
      uri: photoUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as unknown as Blob);

    if (notes) {
      formData.append('notes', notes);
    }
    formData.append('captured_at', capturedAt);
    if (captureSequence !== undefined) {
      formData.append('capture_sequence', captureSequence.toString());
    }

    const res = await fetch(`${BASE_URL}/windows/${windowId}/photos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.detail ?? detail;
      } catch {}
      throw new Error(detail);
    }

    return res.json() as Promise<Photo>;
  }

  async updatePhoto(
    photoId: string,
    data: { notes?: string; sort_order?: number },
  ): Promise<Photo> {
    return this.request<Photo>('PATCH', `/photos/${photoId}`, data);
  }

  async deletePhoto(photoId: string): Promise<void> {
    return this.request<void>('DELETE', `/photos/${photoId}`);
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  async generateReport(
    projectId: string,
    narrative?: Record<string, string>,
  ): Promise<Report> {
    return this.request<Report>('POST', `/projects/${projectId}/generate-report`, {
      narrative: narrative ?? {},
      parsing_mode: 'shorthand',
      count_pieces: false,
      glass_flavor: 'stained',
    });
  }

  async getReport(projectId: string): Promise<Report> {
    return this.request<Report>('GET', `/projects/${projectId}/report`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns the full URL for a photo (handles relative /uploads/ paths) */
  photoUrl(url: string): string {
    if (url.startsWith('http')) return url;
    return `${BASE_URL}${url}`;
  }
}

// Module-level singleton — call api.setToken(token) after login
export const api = new ApiClient();
export default api;
