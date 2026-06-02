'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import api from '@/lib/api';
import BrandWordmark from '@/components/layout/BrandWordmark';
import { clearAuth } from '@/lib/auth';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [church, setChurch] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Project name is required.'); return; }
    setSaving(true);
    try {
      const p = await api.createProject({
        name: name.trim(),
        church_name: church.trim() || undefined,
        address_street: street.trim() || undefined,
        address_city: city.trim() || undefined,
        address_state: state.trim() || undefined,
      } as any);
      router.push(`/projects/${p.id}`);
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create project.';
      if (/not authenticated|could not validate credentials|401/i.test(message)) {
        clearAuth();
        router.replace('/login?refresh=2&next=%2Fprojects%2Fnew');
        return;
      }
      setError(message);
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl p-8">
      <button
        onClick={() => router.push('/projects')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-ssg-dark mb-6 transition-colors"
      >
        <ArrowLeft size={15} /> All Projects
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-ssg-charcoal">New Project</h1>
        <div className="hidden pt-1 md:block">
          <BrandWordmark dark compact />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card max-w-xl p-6 space-y-4">
        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div>
          <label className="label">Project Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. St. Mary's Catholic Church" autoFocus />
        </div>
        <div>
          <label className="label">Church / Building Name</label>
          <input className="input" value={church} onChange={e => setChurch(e.target.value)}
            placeholder="If different from project name" />
        </div>
        <div>
          <label className="label">Street Address</label>
          <input className="input" value={street} onChange={e => setStreet(e.target.value)}
            placeholder="123 Main St" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City</label>
            <input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Denver" />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={state} onChange={e => setState(e.target.value)}
              placeholder="CO" maxLength={2} style={{ textTransform: 'uppercase' }} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            <Plus size={16} />
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
