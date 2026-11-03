import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api/client'
import { Card, EmptyState, Input, Select, Spinner, fmtKg } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'

type Summary = {
  total_kg_co2e: string; total_t_co2e: string
  by_scope_kg: Record<string, string>
  scopes_kpi: { scope: string; kg: string; t: string; share_pct: number | null; change_pct: number | null; comparable: boolean }[]
  comparison: { baseline_label: string; prev_total_kg: string; comparable: boolean; change_pct: number | null } | null
  monthly_kg: Record<string, string>
  records: number; calculated: number; needs_review: number
  verified_pct: number | null
  avg_monthly_active_kg: string | null
  top_sources: { activity: string; total_kg_co2e: string }[]
  by_facility: { facility_id: number; facility_name: string; total_kg_co2e: string; total_t_co2e: string; records: number }[]
  by_category: { category_key: string; total_kg_co2e: string }[]
  yearly_totals: Record<string, string>
  refrigerant: { kg: string; share_of_scope1_pct: number | null; records: number; by_equipment: { equipment: string; kg: string }[] }
}
type Meta = { categories: { category_key: string; name_ar: string; name_en: string }[] }

const SCOPE_COLORS: Record<string, string> = {
  'Scope 1': '#059669', 'Scope 2': '#0284c7', 'Scope 3': '#7c3aed', unscoped: '#94a3b8',
}

function KpiCard({ label, kg, share, change, comparable, accent }: {
  label: string; kg: string; share: number | null; change: number | null
  comparable: boolean; accent: string
}) {
  const up = change != null && change > 0
  return (
    <div className={`rounded-xl bg-gradient-to-br ${accent} p-4 text-white shadow-sm`}>
      <div className="flex items-center justify-between text-xs/5 opacity-80">
        <span>{label}</span>
        {comparable && change != null ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${up ? 'bg-rose-500/30' : 'bg-emerald-400/30'}`}>
            {up ? '▲' : '▼'} {Math.abs(change)}%
          </span>
        ) : <span className="text-[10px] opacity-60">—</span>}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{fmtKg(kg)} <span className="text-xs font-normal opacity-80">kg</span></div>
      <div className="text-xs opacity-75">{(Number(kg) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t CO₂e</div>
      <div className="mt-1 text-[11px] opacity-80">{share == null ? '—' : `${share}% of total`}</div>
    </div>
  )
}

export default function Dashboard() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [facilityId, setFacilityId] = useState('all')
  const [scope, setScope] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [s, setS] = useState<Summary | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [facilities, setFacilities] = useState<{ facility_id: number; name: string }[]>([])

  useEffect(() => {
    api.get('/records/meta').then((r) => setMeta(r.data))
    if (user && user.role !== 'factory_manager' && user.role !== 'viewer')
      api.get('/org/facilities').then((r) => setFacilities(r.data))
  }, [user])

  useEffect(() => {
    const params: Record<string, string> = {}
    if (year !== 'all') params.year = year
    if (month !== 'all') params.month = month
    if (facilityId !== 'all') params.facility_id = facilityId
    if (scope !== 'all') params.scope = scope
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    api.get('/dashboard/summary', { params }).then((r) => setS(r.data))
  }, [year, month, facilityId, scope, dateFrom, dateTo])

  if (!s) return <Spinner label={t('loading')} />
  const years = ['all', ...Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - i))]
  const monthly = Object.entries(s.monthly_kg).map(([k, v]) => ({ month: k, kg: Number(v) }))
  const scopes = Object.entries(s.by_scope_kg).map(([k, v]) => ({
    name: k, key: k, kg: Number(v),
  }))
  const catName = (k: string) => {
    const c = meta?.categories.find((x) => x.category_key === k)
    if (!c) return k
    return lang === 'ar' ? c.name_ar : c.name_en
  }
  const isStaff = user?.role === 'admin' || user?.role === 'head_office'
  const kpiBy = (name: string) => s.scopes_kpi.find((k) => k.scope === name)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="me-auto text-xl font-bold text-slate-800">{t('navDashboard')}</h1>
        {isStaff && (
          <Select value={facilityId} onChange={setFacilityId} className="w-48" label={t('facility')}
            options={[{ value: 'all', label: t('all') }, ...facilities.map((f) => ({ value: String(f.facility_id), label: f.name }))]} />
        )}
        <Select label={t('year')} value={year} onChange={setYear} className="w-28"
          options={years.map((y) => ({ value: y, label: y === 'all' ? t('all') : y }))} />
        <Select label={t('month')} value={month} onChange={setMonth} className="w-24"
          options={[{ value: 'all', label: t('all') }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
        <Select label={t('byScope')} value={scope} onChange={setScope} className="w-32"
          options={[{ value: 'all', label: t('all') }, ...['Scope 1', 'Scope 2', 'Scope 3'].map((x) => ({ value: x, label: x }))]} />
        <Input label="From" type="date" value={dateFrom} onChange={setDateFrom} className="w-36" />
        <Input label="To" type="date" value={dateTo} onChange={setDateTo} className="w-36" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-white shadow-sm">
          <div className="flex items-center justify-between text-xs/5 opacity-80">
            <span>{t('totalEmissions')}</span>
            {s.comparison?.comparable && s.comparison.change_pct != null ? (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.comparison.change_pct > 0 ? 'bg-rose-500/30' : 'bg-emerald-400/30'}`}>
                {s.comparison.change_pct > 0 ? '▲' : '▼'} {Math.abs(s.comparison.change_pct)}%
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{fmtKg(s.total_kg_co2e)} <span className="text-xs font-normal opacity-80">kg</span></div>
          <div className="text-xs opacity-75">{fmtKg(s.total_t_co2e, 2)} {t('tCO2e')}</div>
          <div className="mt-1 text-[11px] opacity-60">
            {s.comparison?.comparable ? `vs ${s.comparison.baseline_label}` : s.comparison ? 'no baseline data' : 'no comparison period'}
          </div>
        </div>
        <KpiCard label={t('scope1')} kg={kpiBy('Scope 1')?.kg ?? '0'} share={kpiBy('Scope 1')?.share_pct ?? null}
          change={kpiBy('Scope 1')?.change_pct ?? null} comparable={kpiBy('Scope 1')?.comparable ?? false}
          accent="from-brand-600 to-brand-800" />
        <KpiCard label={t('scope2')} kg={kpiBy('Scope 2')?.kg ?? '0'} share={kpiBy('Scope 2')?.share_pct ?? null}
          change={kpiBy('Scope 2')?.change_pct ?? null} comparable={kpiBy('Scope 2')?.comparable ?? false}
          accent="from-sky-500 to-sky-700" />
        <KpiCard label={t('scope3')} kg={kpiBy('Scope 3')?.kg ?? '0'} share={kpiBy('Scope 3')?.share_pct ?? null}
          change={kpiBy('Scope 3')?.change_pct ?? null} comparable={kpiBy('Scope 3')?.comparable ?? false}
          accent="from-violet-500 to-violet-700" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="text-xs text-slate-400">{t('records')}</div>
          <div className="text-lg font-bold tabular-nums">{s.calculated} / {s.records}</div>
          <div className="text-[11px] text-slate-400">{t('calculated')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="text-xs text-slate-400">{t('needsReview')}</div>
          <div className={`text-lg font-bold tabular-nums ${s.needs_review > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{s.needs_review}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="text-xs text-slate-400">{t('verifiedShare')}</div>
          <div className="text-lg font-bold tabular-nums">{s.verified_pct == null ? '—' : `${s.verified_pct.toFixed(1)}%`}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="text-xs text-slate-400">{t('avgMonthly')}</div>
          <div className="text-lg font-bold tabular-nums">{s.avg_monthly_active_kg ? fmtKg(s.avg_monthly_active_kg) : '—'} <span className="text-xs font-normal">kg</span></div>
        </div>
      </div>

      {s.refrigerant?.records > 0 && (
        <Card title={t('refrigerantKpi')}>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs text-slate-400">{t('kgCO2e')}</div>
              <div className="text-2xl font-bold tabular-nums text-teal-700">{fmtKg(s.refrigerant.kg)} kg</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('shareOfScope1')}</div>
              <div className="text-2xl font-bold tabular-nums">{s.refrigerant.share_of_scope1_pct ?? '—'}%</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t('records')}</div>
              <div className="text-2xl font-bold tabular-nums">{s.refrigerant.records}</div>
            </div>
            <div className="flex-1">
              {s.refrigerant.by_equipment.slice(0, 4).map((e) => (
                <div key={e.equipment} className="flex justify-between text-xs text-slate-500">
                  <span>{e.equipment}</span><span className="tabular-nums">{fmtKg(e.kg)} kg</span>
                </div>
              ))}
            </div>
            <Link to="/refrigerants" className="text-xs font-medium text-teal-700 hover:underline">{t('navRefrigerants')} →</Link>
          </div>
        </Card>
      )}

      {s.records === 0 ? (
        <EmptyState text={t('noRecordsYet')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('monthlyEmissions')}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                <Line type="monotone" dataKey="kg" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Card title={t('byScope')}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={scopes} dataKey="kg" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {scopes.map((e) => <Cell key={e.key} fill={SCOPE_COLORS[e.key] ?? '#94a3b8'} />)}
                </Pie>
                <Legend iconSize={10} formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card title={`${t('yearlyTotals') ?? 'Annual'}`}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={Object.entries(s.yearly_totals).map(([y, v]) => ({ year: y, kg: Number(v) }))}
                margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                <Bar dataKey="kg" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          {s.by_facility.length > 1 && (
            <Card title={t('facilityComparison')}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={s.by_facility} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="facility_name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                  <Bar dataKey="total_kg_co2e" name="kg CO₂e" fill="#047857" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          <Card title={t('byCategory')}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={s.by_category.map((c) => ({ name: catName(c.category_key), kg: Number(c.total_kg_co2e) }))}
                layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={10} width={110} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                <Bar dataKey="kg" fill="#0284c7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title={t('topSources')}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {s.top_sources.map((r) => (
                  <tr key={r.activity}>
                    <td className="py-2 text-slate-700">{r.activity}</td>
                    <td className="py-2 text-end font-medium tabular-nums text-slate-800">{fmtKg(r.total_kg_co2e)} kg</td>
                  </tr>
                ))}
                {s.top_sources.length === 0 && <tr><td className="py-6 text-center text-slate-400">{t('noData')}</td></tr>}
              </tbody>
            </table>
            <Link to="/records" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
              {t('navRecords')} →
            </Link>
          </Card>
        </div>
      )}
    </div>
  )
}
