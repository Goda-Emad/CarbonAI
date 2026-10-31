import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api/client'
import { Card, EmptyState, Select, Spinner, StatCard, fmtKg } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'

type Summary = {
  total_kg_co2e: string; total_t_co2e: string
  by_scope_kg: Record<string, string>
  monthly_kg: Record<string, string>
  records: number; calculated: number; needs_review: number
  verified_pct: number | null
  avg_monthly_active_kg: string | null
  top_sources: { activity: string; total_kg_co2e: string }[]
  by_facility: { facility_id: number; facility_name: string; total_kg_co2e: string; total_t_co2e: string; records: number }[]
  by_category: { category_key: string; total_kg_co2e: string }[]
}
type Meta = { categories: { category_key: string; name_ar: string; name_en: string }[]; countries: { iso2_code: string; country_name_ar: string; country_name_en: string }[] }

const SCOPE_COLORS: Record<string, string> = {
  'Scope 1': '#059669', 'Scope 2': '#0284c7', 'Scope 3': '#7c3aed', unscoped: '#94a3b8',
}

export default function Dashboard() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [facilityId, setFacilityId] = useState('all')
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
    api.get('/dashboard/summary', { params }).then((r) => setS(r.data))
  }, [year, month, facilityId])

  if (!s) return <Spinner label={t('loading')} />
  const years = ['all', ...Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - i))]
  const monthly = Object.entries(s.monthly_kg).map(([k, v]) => ({ month: k, kg: Number(v), t: Number(v) / 1000 }))
  const scopes = Object.entries(s.by_scope_kg).map(([k, v]) => ({
    name: k === 'Scope 1' ? t('scope1') : k === 'Scope 2' ? t('scope2') : t('scope3'),
    key: k, kg: Number(v),
  }))
  const catName = (k: string) => {
    const c = meta?.categories.find((x) => x.category_key === k)
    if (!c) return k
    return lang === 'ar' ? c.name_ar : c.name_en
  }
  const isStaff = user?.role === 'admin' || user?.role === 'head_office'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="me-auto text-xl font-bold text-slate-800">{t('navDashboard')}</h1>
        {isStaff && (
          <Select value={facilityId} onChange={setFacilityId} className="w-52"
            label={t('facility')}
            options={[{ value: 'all', label: t('all') }, ...facilities.map((f) => ({ value: String(f.facility_id), label: f.name }))]} />
        )}
        <Select label={t('year')} value={year} onChange={setYear} className="w-32"
          options={years.map((y) => ({ value: y, label: y === 'all' ? t('all') : y }))} />
        <Select label={t('month')} value={month} onChange={setMonth} className="w-32"
          options={[{ value: 'all', label: t('all') }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('totalEmissions')} value={`${fmtKg(s.total_t_co2e, 2)} ${t('tCO2e')}`}
          sub={`${fmtKg(s.total_kg_co2e)} ${t('kgCO2e')}`} />
        <StatCard label={t('records')} value={`${s.calculated} / ${s.records}`} sub={t('calculated')} accent="sky" />
        <StatCard label={t('needsReview')} value={String(s.needs_review)} accent={s.needs_review > 0 ? 'amber' : 'brand'} />
        <StatCard label={t('verifiedShare')}
          value={s.verified_pct == null ? '—' : `${s.verified_pct.toFixed(1)}%`} accent="sky"
          sub={s.avg_monthly_active_kg ? `${t('avgMonthly')}: ${fmtKg(s.avg_monthly_active_kg)} kg` : undefined} />
      </div>

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
          {s.by_facility.length > 1 && (
            <Card title={t('facilityComparison')} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={s.by_facility} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="facility_name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
                  <Bar dataKey="kg" fill="#047857" radius={[4, 4, 0, 0]} />
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
