import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errMsg } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, DataTable, StatusBadge } from '../components/ui'
import { useI18n } from '../i18n'

type Preview = {
  missing_columns: string[]
  accepted: any[]
  rejected: { row_number: number; reason: string }[]
  warnings: { row_number: number; text: string }[]
  facility_override: string | null
}

export default function ImportPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [batches, setBatches] = useState<any[]>([])

  const loadBatches = useCallback(() => api.get('/imports/batches').then((r) => setBatches(r.data)), [])
  useEffect(() => { loadBatches() }, [loadBatches])

  const doPreview = async () => {
    if (!file) return
    setMsg(''); setPreview(null); setResult(null); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/imports/preview', fd)
      setPreview(r.data)
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  const doCommit = async () => {
    if (!file) return
    setMsg(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/imports/commit', fd)
      setResult(r.data)
      setPreview(null)
      loadBatches()
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-xl font-bold text-slate-800">{t('importFile')}</h1>
        <Button variant="outline" onClick={() => api.get('/imports/template.csv', { responseType: 'blob' }).then((r) => {
          const url = URL.createObjectURL(r.data)
          const a = document.createElement('a'); a.href = url; a.download = 'carbonai_import_template.csv'; a.click()
        })}>⬇ {t('downloadTemplate')}</Button>
      </div>
      {msg && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{msg}</div>}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
          <Button variant="outline" onClick={doPreview} disabled={!file || busy}>{t('preview')}</Button>
          <Button onClick={doCommit} disabled={!file || busy}>📥 {t('commit')}</Button>
          {preview && preview.facility_override && (
            <span className="text-xs text-slate-500">
              ⚠ {t('facility')}: <b>{preview.facility_override}</b>
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          الأعمدة المطلوبة: النشاط، الكمية، الوحدة (والباقي اختياري: النطاق، التاريخ، الدولة، الشركة، الفرع، فئة النشاط، السيطرة، طاقة مشتراة، علاقة سلسلة القيمة) |
          Required: activity, quantity, unit — optional: scope, date, country, company, facility, category, control, energy_purchased, relation
        </p>
      </Card>

      {result && (
        <Card title={`✅ ${t('commit')}`}>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-brand-50 p-3"><div className="text-xs text-brand-600">{t('accepted')}</div><div className="text-xl font-bold">{result.added}</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-600">{t('needsReview')}</div><div className="text-xl font-bold">{result.needs_review}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('rejectedRows')}</div><div className="text-xl font-bold">{result.rejected}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('records')} dup</div><div className="text-xl font-bold">{result.duplicates?.length ?? 0}</div></div>
          </div>
          {result.failed?.length > 0 && (
            <div className="mt-3 rounded bg-rose-50 p-2 text-xs text-rose-700">
              {result.failed.map(([n, why]: any) => <div key={n}>row {n}: {why}</div>)}
            </div>
          )}
        </Card>
      )}

      {preview && (
        <>
          {preview.missing_columns.length > 0 && (
            <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
              missing columns: {preview.missing_columns.join(', ')}
            </div>
          )}
          <Card title={`${t('accepted')} (${preview.accepted.length})`}>
            <div className="max-h-72 overflow-auto">
              <DataTable rows={preview.accepted} pageSize={10} columns={[
                { key: 'row_number', label: '#' },
                { key: 'activity', label: t('activityName') },
                { key: 'quantity', label: t('quantity') },
                { key: 'unit', label: t('unit') },
                { key: 'date', label: t('activityDate') },
                { key: 'scope', label: t('byScope') },
                { key: 'category', label: t('category') },
                { key: 'country', label: t('country') },
              ]} />
            </div>
          </Card>
          {preview.rejected.length > 0 && (
            <Card title={`${t('rejectedRows')} (${preview.rejected.length})`}>
              <ul className="space-y-1 text-sm text-rose-700">
                {preview.rejected.map((r) => <li key={r.row_number}>row {r.row_number}: {r.reason}</li>)}
              </ul>
            </Card>
          )}
          {preview.warnings.length > 0 && (
            <Card title={`${t('importWarnings')} (${preview.warnings.length})`}>
              <ul className="space-y-1 text-sm text-amber-700">
                {preview.warnings.map((w) => <li key={w.row_number}>row {w.row_number}: {w.text}</li>)}
              </ul>
            </Card>
          )}
        </>
      )}

      {batches.length > 0 && (
        <Card title={t('batches')}>
          <DataTable rows={batches} pageSize={8} columns={[
            { key: 'batch_id', label: '#' },
            { key: 'file_name', label: 'File' },
            { key: 'imported_at', label: t('createdAt'), render: (r) => String(r.imported_at).slice(0, 19) },
            { key: 'rows_total', label: 'Total' },
            { key: 'rows_accepted', label: t('accepted') },
            { key: 'rows_rejected', label: t('rejectedRows') },
            { key: 'rows_duplicate', label: 'Dup' },
            { key: 'rows_needs_review', label: t('needsReview'), render: (r) => <StatusBadge status={r.rows_needs_review > 0 ? 'needs_review' : 'calculated'} /> },
          ]} />
        </Card>
      )}
    </div>
  )
}
