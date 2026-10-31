import { useCallback, useEffect, useState } from 'react'
import { api, errMsg } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, DataTable, Input, Select, StatusBadge, Textarea } from '../components/ui'
import { useI18n } from '../i18n'

const AREAS = ['رفع كفاءة الكهرباء', 'تحسين كفاءة الوقود', 'تحسين النقل والشحن', 'تقليل المخلفات',
  'تحسين كفاءة المياه', 'مراجعة المشتريات', 'Electricity efficiency', 'Fuel efficiency',
  'Transport & freight', 'Waste reduction', 'Water efficiency', 'Procurement review']
const EMPTY = { area: AREAS[0], description: '', owner: '', target_date: '', status: 'planned', linked_category_key: '', assumptions: '' }

export default function Plans() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [rows, setRows] = useState<any[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [edit, setEdit] = useState<any | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => { api.get('/plans').then((r) => setRows(r.data)) }, [])
  useEffect(load, [load])
  useEffect(() => { api.get('/records/meta').then((r) => setMeta(r.data)) }, [])

  const save = async () => {
    setMsg('')
    try {
      const body = { ...form, target_date: form.target_date || null, linked_category_key: form.linked_category_key || null }
      if (edit) await api.patch(`/plans/${edit.plan_id}`, body)
      else await api.post('/plans', body)
      setForm({ ...EMPTY }); setEdit(null); load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const canWrite = user?.role !== 'viewer'
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t('navPlans')}</h1>
      {msg && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{msg}</div>}
      {canWrite && (
        <Card title={edit ? `${t('edit')} #${edit.plan_id}` : t('newPlan')}>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label={t('area')} value={form.area} onChange={(v) => setForm({ ...form, area: v })}
              options={AREAS.map((a) => ({ value: a, label: a }))} />
            <Input label={t('owner')} value={form.owner} onChange={(v) => setForm({ ...form, owner: v })} />
            <Input label={t('targetDate')} type="date" value={form.target_date} onChange={(v) => setForm({ ...form, target_date: v })} />
            <Select label={t('status')} value={form.status} onChange={(v) => setForm({ ...form, status: v })}
              options={['planned', 'in_progress', 'done', 'cancelled'].map((s) => ({ value: s, label: t(s as any) }))} />
            <Select label={`${t('category')} (${t('optional')})`} value={form.linked_category_key} onChange={(v) => setForm({ ...form, linked_category_key: v })}
              options={[{ value: '', label: '—' }, ...(meta?.categories ?? []).map((c: any) => ({ value: c.category_key, label: c.category_key }))]} />
          </div>
          <Textarea label={t('description')} value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={2} className="mt-3" />
          <Textarea label={t('assumptions')} value={form.assumptions} onChange={(v) => setForm({ ...form, assumptions: v })} rows={2} className="mt-3" />
          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={!form.area}>{edit ? t('save') : t('create')}</Button>
            {edit && <Button variant="ghost" onClick={() => { setEdit(null); setForm({ ...EMPTY }) }}>{t('cancel')}</Button>}
          </div>
        </Card>
      )}
      <DataTable rows={rows} columns={[
        { key: 'plan_id', label: '#', sortable: true },
        { key: 'area', label: t('area') },
        { key: 'description', label: t('description') },
        { key: 'owner', label: t('owner') },
        { key: 'target_date', label: t('targetDate') },
        { key: 'status', label: t('status'), render: (r) => <StatusBadge status={r.status} /> },
        { key: 'linked_category_key', label: t('category') },
        ...(canWrite ? [{ key: 'act', label: t('actions'), render: (r: any) => (
          <Button variant="outline" className="!px-2 !py-1 text-xs" onClick={() => {
            setEdit(r); setForm({ area: r.area, description: r.description ?? '', owner: r.owner ?? '',
              target_date: r.target_date ?? '', status: r.status, linked_category_key: r.linked_category_key ?? '', assumptions: r.assumptions ?? '' })
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}>{t('edit')}</Button>
        ) } as any] : []),
      ]} />
    </div>
  )
}
