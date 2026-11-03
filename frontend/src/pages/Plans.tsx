import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, errMsg } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Card, DataTable, Input, Select, StatusBadge, Textarea } from '../components/ui'
import { useI18n } from '../i18n'

const AREAS = ['رفع كفاءة الكهرباء', 'تحسين كفاءة الوقود', 'تحسين النقل والشحن', 'تقليل المخلفات',
  'تحسين كفاءة المياه', 'مراجعة المشتريات', 'Electricity efficiency', 'Fuel efficiency',
  'Transport & freight', 'Waste reduction', 'Water efficiency', 'Procurement review']
const EMPTY = {
  area: AREAS[0], description: '', owner: '', target_date: '', status: 'planned',
  linked_category_key: '', assumptions: '', target_scope: '', target_facility_id: '',
  activity: '', baseline_kg: '', expected_reduction_pct: '', kpi: '', priority: 'medium',
  reference_source: '', plan_year: '',
}

export default function Plans() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [rows, setRows] = useState<any[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [roadmap, setRoadmap] = useState<any>(null)
  const [form, setForm] = useState({ ...EMPTY } as any)
  const [edit, setEdit] = useState<any | null>(null)
  const [target, setTarget] = useState({ baseline_year: String(new Date().getFullYear()), target_year: String(new Date().getFullYear() + 1), reduction_pct: '10', note: '' })
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    api.get('/plans').then((r) => setRows(r.data))
    api.get('/plans/insights').then((r) => setInsights(r.data)).catch(() => {})
    api.get('/plans/roadmap').then((r) => setRoadmap(r.data)).catch(() => {})
  }, [])
  useEffect(load, [load])
  useEffect(() => { api.get('/records/meta').then((r) => setMeta(r.data)) }, [])

  const save = async () => {
    setMsg('')
    try {
      const body: any = {
        ...form,
        expected_reduction_pct: form.expected_reduction_pct === '' ? null : Number(form.expected_reduction_pct),
        plan_year: form.plan_year === '' ? null : Number(form.plan_year),
        target_facility_id: form.target_facility_id === '' ? null : Number(form.target_facility_id),
        target_date: form.target_date || null, linked_category_key: form.linked_category_key || null,
        target_scope: form.target_scope || null, activity: form.activity || null,
        baseline_kg: form.baseline_kg === '' ? null : String(form.baseline_kg),
        reference_source: form.reference_source || null, kpi: form.kpi || null,
      }
      if (edit) await api.patch(`/plans/${edit.plan_id}`, body)
      else await api.post('/plans', body)
      setForm({ ...EMPTY }); setEdit(null); load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const addTarget = async () => {
    setMsg('')
    try {
      await api.post('/plans/targets', {
        baseline_year: Number(target.baseline_year), target_year: Number(target.target_year),
        reduction_pct: target.reduction_pct === '' ? null : Number(target.reduction_pct),
        note: target.note,
      })
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const canWrite = user?.role !== 'viewer'
  const isAdmin = user?.role === 'admin' || user?.role === 'head_office'
  const roadmapData = (roadmap?.years ?? []).map((r: any) => ({
    year: String(r.year), actual: r.actual_kg ? Number(r.actual_kg) : null,
    target: r.target_kg ? Number(r.target_kg) : null,
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t('navPlans')}</h1>
      {msg && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{msg}</div>}

      {insights && (
        <Card title={t('insights')}>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-400">{t('totalEmissions')}</div>
              <div className="font-bold tabular-nums">{Number(insights.total_kg).toLocaleString()} kg</div>
              <div className="text-xs text-slate-400">top scope: {insights.top_scope ?? '—'}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Top facilities</div>
              {insights.facilities.slice(0, 3).map((f: any) => (
                <div key={f.facility_name} className="flex justify-between text-xs">
                  <span>{f.facility_name}</span><span className="tabular-nums">{Number(f.kg).toLocaleString()} kg</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Top categories</div>
              {insights.categories.slice(0, 3).map((c: any) => (
                <div key={c.category_key} className="flex justify-between text-xs">
                  <span>{c.category_key}</span><span className="tabular-nums">{Number(c.kg).toLocaleString()} kg</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {insights.suggestions.map((s: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm">{s.area}</b>
                  <Badge tone={s.priority === 'high' ? 'red' : 'amber'}>{s.priority}</Badge>
                  <Badge tone="gray">{s.category_key}</Badge>
                  <span className="text-xs text-slate-500">{t('baseline')}: {Number(s.baseline_kg).toLocaleString()} kg</span>
                  <Button variant="outline" className="ms-auto !px-2 !py-1 text-xs" onClick={() => setForm({
                    ...EMPTY, area: s.area, linked_category_key: s.category_key, baseline_kg: s.baseline_kg,
                    priority: s.priority, reference_source: s.reference, description: s.methodology,
                  })}>{t('useSuggestion')}</Button>
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.rationale}</div>
                <div className="text-xs text-slate-400">📚 {s.reference}</div>
                <div className="text-xs text-slate-400">{s.methodology}</div>
              </div>
            ))}
            {insights.suggestions.length === 0 && <p className="text-xs text-slate-400">{t('noData')}</p>}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{insights.disclaimer}</p>
        </Card>
      )}

      {canWrite && (
        <Card title={edit ? `${t('edit')} #${edit.plan_id}` : t('newPlan')}>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label={t('area')} value={form.area} onChange={(v) => setForm({ ...form, area: v })}
              options={AREAS.map((a) => ({ value: a, label: a }))} />
            <Input label={t('owner')} value={form.owner} onChange={(v) => setForm({ ...form, owner: v })} />
            <Input label={t('targetDate')} type="date" value={form.target_date} onChange={(v) => setForm({ ...form, target_date: v })} />
            <Select label={t('status')} value={form.status} onChange={(v) => setForm({ ...form, status: v })}
              options={['planned', 'in_progress', 'done', 'cancelled'].map((s) => ({ value: s, label: t(s as any) }))} />
            <Select label={t('priority')} value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
              options={['high', 'medium', 'low'].map((p) => ({ value: p, label: p }))} />
            <Select label={`${t('category')} (${t('optional')})`} value={form.linked_category_key} onChange={(v) => setForm({ ...form, linked_category_key: v })}
              options={[{ value: '', label: '—' }, ...(meta?.categories ?? []).map((c: any) => ({ value: c.category_key, label: c.category_key }))]} />
            <Input label={t('baseline') + ' (kg)'} type="number" step="any" value={form.baseline_kg} onChange={(v) => setForm({ ...form, baseline_kg: v })} />
            <Input label={t('expectedReduction')} type="number" step="any" value={form.expected_reduction_pct} onChange={(v) => setForm({ ...form, expected_reduction_pct: v })} />
            <Input label={t('kpi')} value={form.kpi} onChange={(v) => setForm({ ...form, kpi: v })} />
            <Input label={t('referenceSource')} value={form.reference_source} onChange={(v) => setForm({ ...form, reference_source: v })} className="md:col-span-2" />
            <Input label={t('planYear')} type="number" value={form.plan_year} onChange={(v) => setForm({ ...form, plan_year: v })} />
          </div>
          <Textarea label={t('description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={2} className="mt-3" />
          <Textarea label={t('assumptions')} value={form.assumptions} onChange={(v) => setForm({ ...form, assumptions: v })} rows={2} className="mt-3" />
          <div className="mt-2 flex gap-2">
            <Button onClick={save} disabled={!form.area}>{edit ? t('save') : t('create')}</Button>
            {edit && <Button variant="ghost" onClick={() => { setEdit(null); setForm({ ...EMPTY }) }}>{t('cancel')}</Button>}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            لا تُقبل نسبة خفض متوقعة دون مصدر مرجعي ومؤشر متابعة. Decrease percentages require a reference source and a KPI.
          </p>
        </Card>
      )}

      {isAdmin && (
        <Card title={t('addTarget')}>
          <div className="flex flex-wrap items-end gap-3">
            <Input label={t('baseline')} type="number" value={target.baseline_year} onChange={(v) => setTarget({ ...target, baseline_year: v })} className="w-28" />
            <Input label={t('targetYear')} type="number" value={target.target_year} onChange={(v) => setTarget({ ...target, target_year: v })} className="w-28" />
            <Input label={t('targetReductionPct')} type="number" step="any" value={target.reduction_pct} onChange={(v) => setTarget({ ...target, reduction_pct: v })} className="w-40" />
            <Input label={t('notes')} value={target.note} onChange={(v) => setTarget({ ...target, note: v })} className="w-64" />
            <Button onClick={addTarget}>{t('addTarget')}</Button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{t('targetNote')}</p>
        </Card>
      )}

      {roadmapData.length > 0 && (
        <Card title={t('roadmap')}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={roadmapData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
              <Legend iconSize={10} formatter={(v) => <span className="text-xs">{v}</span>} />
              <Bar dataKey="actual" name={t('actual')} fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="target" name={t('target')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <DataTable rows={rows} columns={[
        { key: 'plan_id', label: '#', sortable: true },
        { key: 'area', label: t('area') },
        { key: 'description', label: t('description') },
        { key: 'priority', label: t('priority') },
        { key: 'owner', label: t('owner') },
        { key: 'target_date', label: t('targetDate') },
        { key: 'status', label: t('status'), render: (r) => <StatusBadge status={r.status} /> },
        { key: 'baseline_kg', label: t('baseline'), render: (r) => r.baseline_kg ? `${Number(r.baseline_kg).toLocaleString()} kg` : '—' },
        { key: 'expected_reduction_pct', label: '%', render: (r) => r.expected_reduction_pct != null ? `${r.expected_reduction_pct}%` : '—' },
        { key: 'linked_category_key', label: t('category') },
        ...(canWrite ? [{
          key: 'act', label: t('actions'), render: (r: any) => (
            <Button variant="outline" className="!px-2 !py-1 text-xs" onClick={() => {
              setEdit(r)
              setForm({
                area: r.area, description: r.description ?? '', owner: r.owner ?? '', target_date: r.target_date ?? '',
                status: r.status, linked_category_key: r.linked_category_key ?? '', assumptions: r.assumptions ?? '',
                target_scope: r.target_scope ?? '', target_facility_id: r.target_facility_id ?? '', activity: r.activity ?? '',
                baseline_kg: r.baseline_kg ?? '', expected_reduction_pct: r.expected_reduction_pct ?? '',
                kpi: r.kpi ?? '', priority: r.priority ?? 'medium', reference_source: r.reference_source ?? '',
                plan_year: r.plan_year ?? '',
              })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}>{t('edit')}</Button>
          )
        } as any] : []),
      ]} />
      <p className="text-[11px] text-slate-400">
        توصيات المخططات مبنية على الانبعاثات المحسوبة فعليًا ولا تعني خفضًا مضمونًا.
        Projected reductions are not guaranteed; every figure requires a documented site-specific basis.
      </p>
    </div>
  )
}
