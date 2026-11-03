import { useCallback, useEffect, useState } from 'react'
import { api, download, errMsg } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Card, DataTable, Input, Modal, Select, StatusBadge, Textarea } from '../components/ui'
import { useI18n } from '../i18n'

const EMPTY = {
  factor_id: '', country_code: 'EG', factor_class: 'official_national', category: 'electricity', activity: '',
  unit: 'kWh', value: '', year_from: String(new Date().getFullYear()), year_to: String(new Date().getFullYear()),
  reference_id: '', source_organization: '', source_document: '', source_url: '', source_locator: '',
  reason: '', boundary_note: '', methodology: '',
}

const CLASS_LABEL: Record<string, [string, 'green' | 'blue' | 'amber' | 'gray']> = {
  egypt_official: ['Egypt official', 'green'],
  egypt_research: ['Egypt research', 'blue'],
  international_egypt_specific: ['Intl Egypt-specific', 'amber'],
  international_default: ['Intl default', 'gray'],
}

export default function Factors() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'lib' | 'cov' | 'src' | 'eg' | 'add' | 'audit'>('lib')
  const [rows, setRows] = useState<any[]>([])
  const [cov, setCov] = useState<any[]>([])
  const [covYears, setCovYears] = useState<any[]>([])
  const [covYear, setCovYear] = useState('2024')
  const [covRows, setCovRows] = useState<any[]>([])
  const [egRows, setEgRows] = useState<any[]>([])
  const [srcs, setSrcs] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [filters, setFilters] = useState({ country: 'all', category: 'all', status: 'all', q: '' })
  const [form, setForm] = useState({ ...EMPTY })
  const [msg, setMsg] = useState('')
  const [verify, setVerify] = useState<{ id: string; ver: number; status: string; reason: string } | null>(null)

  const load = useCallback(() => {
    const params: any = {}
    if (filters.country !== 'all') params.country = filters.country
    if (filters.category !== 'all') params.category = filters.category
    if (filters.status !== 'all') params.status = filters.status
    if (filters.q) params.activity_like = filters.q
    api.get('/factors', { params }).then((r) => setRows(r.data))
  }, [filters])
  useEffect(load, [load])
  useEffect(() => {
    api.get('/factors/coverage').then((r) => setCov(r.data))
    api.get('/factors/sources').then((r) => setSrcs(r.data))
    api.get('/records/meta').then((r) => setMeta(r.data))
    api.get('/factors/egypt').then((r) => setEgRows(r.data))
  }, [])
  useEffect(() => {
    if (tab === 'cov') api.get('/factors/coverage-matrix', { params: { year: covYear } })
      .then((r) => { setCovYears(r.data.summary); setCovRows(r.data.rows) })
  }, [tab, covYear])
  useEffect(() => {
    if (tab === 'audit' && isAdmin) api.get('/factors/audit').then((r) => setAudit(r.data))
  }, [tab, isAdmin])

  const add = async () => {
    setMsg('')
    try {
      await api.post('/factors', { ...form, year_from: Number(form.year_from), year_to: Number(form.year_to) })
      setForm({ ...EMPTY }); setTab('lib'); load()
    } catch (e) { setMsg(errMsg(e)) }
  }
  const doVerify = async () => {
    if (!verify) return
    setMsg('')
    try {
      await api.post(`/factors/${verify.id}/${verify.ver}/verify`, { status: verify.status, reviewer_reason: verify.reason })
      setVerify(null); load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const tabs: [typeof tab, string][] = [
    ['lib', t('factors')], ['cov', t('countryCoverage')], ['src', t('registeredSources')],
    ['eg', t('egyptFactors')],
    ...(isAdmin ? [['add', t('addFactor')], ['audit', t('auditLog')]] as [typeof tab, string][] : []),
  ]
  const year2025 = covYears.find((x: any) => x.year === 2025)
  const year2026 = covYears.find((x: any) => x.year === 2026)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-xl font-bold text-slate-800">{t('factorLibrary')}</h1>
        <Button variant="outline" onClick={() => download('/factors/export.csv?country=EG', 'carbonai_factors_EG.csv')}>
          ⬇ {t('exportCsv')}
        </Button>
      </div>
      {msg && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{msg}</div>}

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'lib' && (
        <>
          <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <Input label={t('search')} value={filters.q} onChange={(v) => setFilters({ ...filters, q: v })} className="w-56" />
            <Select label={t('country')} value={filters.country} onChange={(v) => setFilters({ ...filters, country: v })} className="w-32"
              options={[{ value: 'all', label: t('all') }, ...(meta?.countries ?? []).map((c: any) => ({ value: c.iso2_code, label: c.iso2_code }))]} />
            <Select label={t('category')} value={filters.category} onChange={(v) => setFilters({ ...filters, category: v })} className="w-44"
              options={[{ value: 'all', label: t('all') }, ...(meta?.categories ?? []).map((c: any) => ({ value: c.category_key, label: c.category_key }))]} />
            <Select label={t('factorVerification')} value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} className="w-40"
              options={[{ value: 'all', label: t('all') }, ...['verified', 'unverified', 'pending_review', 'superseded', 'rejected'].map((s) => ({ value: s, label: s }))]} />
          </div>
          <DataTable rows={rows} pageSize={15}
            columns={[
              { key: 'factor_id', label: 'ID', render: (r) => <span className="font-medium">{r.factor_id} <span className="text-slate-400">v{r.version}</span></span> },
              { key: 'activity_category', label: t('category') },
              { key: 'activity', label: t('activityName') },
              { key: 'country_code', label: t('country') },
              { key: 'co2e_factor_value', label: t('factorValue'), render: (r) => `${r.co2e_factor_value} kg/${r.activity_unit}` },
              { key: 'country_scope', label: t('classification'), render: (r) => {
                const [label, tone] = CLASS_LABEL[r.country_scope] ?? ['—', 'gray']
                return <Badge tone={tone}>{label}</Badge>
              } },
              { key: 'verification_status', label: t('factorVerification'), render: (r) => <StatusBadge status={r.verification_status} /> },
              { key: 'source_organization', label: t('factorSource') },
              ...(isAdmin ? [{
                key: 'verify', label: t('actions'), render: (r: any) => (
                  <Button variant="outline" className="!px-2 !py-1 text-xs"
                    onClick={() => setVerify({ id: r.factor_id, ver: r.version, status: r.verification_status === 'verified' ? 'pending_review' : 'verified', reason: '' })}>
                    {r.verification_status === 'verified' ? '↩' : '✓'}
                  </Button>
                ),
              } as any] : []),
            ]}
          />
        </>
      )}

      {tab === 'cov' && (
        <>
          <Card title={`${t('coverageMatrix')} — 2025/2026 assessment`}>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Badge tone="green">{t('coverageAvailable')}: {year2025?.statuses?.available ?? 0}</Badge>
              <Badge tone="gray">{t('coverageIntlDefault')}: {year2025?.statuses?.international_default ?? 0}</Badge>
              <Badge tone="amber">{t('coveragePending')}: {year2025?.statuses?.pending ?? 0}</Badge>
              <span className="mx-2">|</span>
              <b>2026:</b>
              <Badge tone="green">{t('coverageAvailable')}: {year2026?.statuses?.available ?? 0}</Badge>
              <Badge tone="gray">{t('coverageIntlDefault')}: {year2026?.statuses?.international_default ?? 0}</Badge>
              <Badge tone="amber">{t('coveragePending')}: {year2026?.statuses?.pending ?? 0}</Badge>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Select label={t('year')} value={covYear} onChange={setCovYear} className="w-28"
                options={Array.from({ length: 21 }, (_, i) => String(2026 - i)).map((y) => ({ value: y, label: y }))} />
            </div>
            <div className="mt-3">
              <DataTable rows={covRows} pageSize={12} columns={[
                { key: 'year', label: t('year') },
                { key: 'sector', label: t('sector') },
                { key: 'activity', label: t('activityName') },
                { key: 'coverage_status', label: t('status'), render: (r) => {
                  const map: Record<string, [string, any]> = {
                    available: [t('coverageAvailable'), 'green'], international_default: [t('coverageIntlDefault'), 'gray'],
                    pending: [t('coveragePending'), 'amber'], unavailable: [t('coverageUnavailable'), 'red'],
                    provisional: [t('coverageProvisional'), 'blue'], estimated: [t('coverageEstimated'), 'blue'],
                    not_applicable: [t('coverageNA'), 'gray'],
                  }
                  const [label, tone] = map[r.coverage_status] ?? [r.coverage_status, 'gray']
                  return <Badge tone={tone}>{label}</Badge>
                } },
                { key: 'missing_reason', label: t('missingReason') ?? 'missing reason' },
              ]} />
            </div>
          </Card>
        </>
      )}

      {tab === 'src' && (
        <DataTable rows={srcs} pageSize={15} columns={[
          { key: 'reference_id', label: 'ID' },
          { key: 'organization_name', label: 'Organization' },
          { key: 'document_title', label: 'Document' },
          { key: 'publication_year', label: 'Year' },
          { key: 'verification_status', label: t('status'), render: (r) => <StatusBadge status={r.verification_status} /> },
          { key: 'source_url', label: 'URL', render: (r) => r.source_url ? <a className="text-brand-600 hover:underline" href={r.source_url} target="_blank" rel="noreferrer">link</a> : '—' },
        ]} />
      )}

      {tab === 'eg' && (
        <Card title={t('egyptFactors')}>
          <p className="mb-3 text-xs text-slate-400">
            {t('egyptNote')}
          </p>
          <DataTable rows={egRows} pageSize={15} columns={[
            { key: 'factor_id', label: 'ID', render: (r) => <span className="font-medium">{r.factor_id} <span className="text-slate-400">v{r.version}</span></span> },
            { key: 'sector', label: t('sector') },
            { key: 'activity', label: t('activityName') },
            { key: 'gas', label: t('gas') },
            { key: 'co2e_factor_value', label: t('factorValue'), render: (r) => `${r.co2e_factor_value} kg/${r.activity_unit}` },
            { key: 'year_from', label: t('year'), render: (r) => r.year_from === r.year_to ? String(r.year_from) : `${r.year_from}–${r.year_to}` },
            { key: 'country_scope', label: t('classification'), render: (r) => {
              const [label, tone] = CLASS_LABEL[r.country_scope] ?? ['—', 'gray']
              return <Badge tone={tone}>{label}</Badge>
            } },
            { key: 'source_organization', label: t('factorSource') },
            { key: 'source_page', label: t('sourcePage') },
            { key: 'verification_status', label: t('status'), render: (r) => <StatusBadge status={r.verification_status} /> },
          ]} />
        </Card>
      )}

      {tab === 'add' && isAdmin && (
        <Card title={t('addFactor')}>
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="factor_id" value={form.factor_id} onChange={(v) => setForm({ ...form, factor_id: v })} />
            <Select label={t('country')} value={form.country_code} onChange={(v) => setForm({ ...form, country_code: v })}
              options={(meta?.countries ?? []).map((c: any) => ({ value: c.iso2_code, label: `${c.country_name_en} (${c.iso2_code})` }))} />
            <Select label={t('factorClass')} value={form.factor_class} onChange={(v) => setForm({ ...form, factor_class: v })}
              options={['official_national', 'regional', 'global_default', 'proxy'].map((c) => ({ value: c, label: c }))} />
            <Select label={t('category')} value={form.category} onChange={(v) => setForm({ ...form, category: v })}
              options={(meta?.categories ?? []).map((c: any) => ({ value: c.category_key, label: c.category_key }))} />
            <Input label={t('activityName')} value={form.activity} onChange={(v) => setForm({ ...form, activity: v })} />
            <Select label={t('unit')} value={form.unit} onChange={(v) => setForm({ ...form, unit: v })}
              options={(meta?.units ?? []).map((u: string) => ({ value: u, label: u }))} />
            <Input label={`${t('factorValue')} (kg CO₂e/${t('unit')})`} type="number" step="any" value={form.value} onChange={(v) => setForm({ ...form, value: v })} />
            <Input label={`${t('year')} from`} type="number" value={form.year_from} onChange={(v) => setForm({ ...form, year_from: v })} />
            <Input label={`${t('year')} to`} type="number" value={form.year_to} onChange={(v) => setForm({ ...form, year_to: v })} />
            <Input label="source_organization" value={form.source_organization} onChange={(v) => setForm({ ...form, source_organization: v })} />
            <Input label="source_document" value={form.source_document} onChange={(v) => setForm({ ...form, source_document: v })} />
            <Input label="source_locator" value={form.source_locator} onChange={(v) => setForm({ ...form, source_locator: v })} />
            <Input label="source_url" value={form.source_url} onChange={(v) => setForm({ ...form, source_url: v })} />
            <Input label="reference_id" value={form.reference_id} onChange={(v) => setForm({ ...form, reference_id: v })} />
          </div>
          <Textarea label={t('reason')} value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} rows={2} className="mt-3" />
          <Button onClick={add} className="mt-3" disabled={!form.factor_id || !form.value || !form.reason || !form.source_organization || !form.source_document}>
            {t('save')}
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            كل إضافة تُسجَّل كإصدار جديد «غير متحقق منه» ولا تُعتمد إلا بمراجع مسمّى وسبب واضح |
            Every addition is stored as a new UNVERIFIED version; promotion requires a named reviewer and a reason.
          </p>
        </Card>
      )}

      {tab === 'audit' && isAdmin && (
        <DataTable rows={audit} pageSize={15} columns={[
          { key: 'log_id', label: '#' }, { key: 'factor_id', label: 'ID' }, { key: 'version', label: 'v' },
          { key: 'action', label: 'Action' }, { key: 'field_name', label: 'Field' },
          { key: 'old_value', label: 'Old' }, { key: 'new_value', label: 'New' },
          { key: 'changed_at', label: t('createdAt'), render: (r) => String(r.changed_at).slice(0, 19) },
          { key: 'changed_by', label: 'By' }, { key: 'reason', label: t('reason') },
        ]} />
      )}

      <Modal open={!!verify} title={t('verifyFactor')} onClose={() => setVerify(null)}>
        {verify && (
          <div className="space-y-3">
            <div className="text-sm"><b>{verify.id}</b> v{verify.ver}</div>
            <Select label={t('factorVerification')} value={verify.status} onChange={(v) => setVerify({ ...verify, status: v })}
              options={['verified', 'pending_review', 'unverified', 'rejected'].map((s) => ({ value: s, label: s }))} />
            <Textarea label={t('reason')} value={verify.reason} onChange={(v) => setVerify({ ...verify, reason: v })} rows={2} />
            <Button onClick={doVerify} disabled={!verify.reason.trim()}>{t('save')}</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
