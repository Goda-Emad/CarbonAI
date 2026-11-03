import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errMsg } from '../api/client'
import { Button, Card, DataTable, Select, StatusBadge } from '../components/ui'
import { useI18n } from '../i18n'

type Suggestion = { column: string; confidence: number; method: string; ambiguous: boolean; alternatives: { column: string; confidence: number }[] }
type Analysis = { columns: string[]; suggestions: Record<string, Suggestion>; required_missing: string[]; critical_ambiguous: string[]; file_hash: string; duplicate_file: { batch_id: number; file_name: string; imported_at: string } | null }
type Preview = {
  missing_columns: string[]; accepted: any[]; rejected: { row_number: number; reason: string }[]
  warnings: { row_number: number; text: string }[]; factor_preview: any[]; facility_override: string | null
}

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'activity', label: 'Activity name', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'unit', label: 'Unit', required: true },
  { key: 'date', label: 'Activity date' },
  { key: 'category', label: 'Activity category' },
  { key: 'scope', label: 'Scope' },
  { key: 'fuel', label: 'Fuel / material' },
  { key: 'factor', label: 'Factor (from file)' },
  { key: 'source', label: 'Source' },
  { key: 'country', label: 'Country' },
  { key: 'facility', label: 'Facility' },
  { key: 'company', label: 'Company' },
  { key: 'description', label: 'Description' },
  { key: 'control', label: 'Ownership control' },
  { key: 'energy_purchased', label: 'Energy purchased' },
  { key: 'relation', label: 'Value-chain relation' },
]

export default function ImportPage() {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [batches, setBatches] = useState<any[]>([])
  const [country, setCountry] = useState('EG')

  const loadBatches = useCallback(() => api.get('/imports/batches').then((r) => setBatches(r.data)), [])
  useEffect(() => { loadBatches() }, [loadBatches])

  const reset = () => { setAnalysis(null); setPreview(null); setResult(null); setMsg('') }

  const analyze = async () => {
    if (!file) return
    setBusy(true); reset()
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await api.post('/imports/analyze', fd)
      setAnalysis(r.data)
      const m: Record<string, string> = {}
      for (const [field, s] of Object.entries(r.data.suggestions as Record<string, Suggestion>)) {
        if (!s.ambiguous) m[field] = s.column
      }
      setMapping(m)
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  const form = (extra: Record<string, string> = {}) => {
    if (!file) throw new Error('no file')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mapping', JSON.stringify(mapping))
    fd.append('default_country', country)
    for (const [k, v] of Object.entries(extra)) fd.append(k, v)
    return fd
  }

  const doPreview = async () => {
    setBusy(true); setMsg(''); setResult(null)
    try {
      const r = await api.post('/imports/preview-mapped', form())
      setPreview(r.data)
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  const doCommit = async (force = false) => {
    setBusy(true); setMsg('')
    try {
      const r = await api.post('/imports/commit-mapped', form(force ? { force: 'true' } : {}))
      setResult(r.data)
      setPreview(null)
      loadBatches()
    } catch (e: any) {
      if (e?.response?.status === 409 && e.response.data?.detail?.previous_batch) {
        const prev = e.response.data.detail.previous_batch
        setMsg(`${t('duplicateFile')}: ${prev.file_name} (${String(prev.imported_at).slice(0, 19)}). ${t('forceHint')}`)
      } else setMsg(errMsg(e))
    } finally { setBusy(false) }
  }

  const suggestions = analysis?.suggestions ?? {}
  const missingRequired = ['activity', 'quantity', 'unit'].filter((f) => !mapping[f])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-xl font-bold text-slate-800">{t('navImport')}</h1>
        <Button variant="outline" onClick={() => api.get('/imports/template.csv', { responseType: 'blob' }).then((r) => {
          const url = URL.createObjectURL(r.data)
          const a = document.createElement('a'); a.href = url; a.download = 'carbonai_import_template.csv'; a.click()
        })}>⬇ {t('downloadTemplate')}</Button>
      </div>
      {msg && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20">{msg}</div>}

      <Card title={t('importFile')}>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset() }}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
          <Select value={country} onChange={setCountry} className="w-24"
            options={['EG', 'SA', 'AE', 'JO', 'QA', 'KW', 'OM', 'BH', 'MA', 'DZ', 'TN', 'SD', 'IQ', 'LB']
              .map((c) => ({ value: c, label: c }))} />
          <Button onClick={analyze} disabled={!file || busy}>🔎 {t('analyzeFile')}</Button>
        </div>
        {analysis && (
          <div className="mt-3 text-xs text-slate-500">
            {analysis.columns.length} columns · {analysis.required_missing.length ? `missing: ${analysis.required_missing.join(', ')}` : 'required fields detected'}
            {analysis.duplicate_file && (
              <span className="ms-2 rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                ⚠ {t('duplicateFile')}: {analysis.duplicate_file.file_name}
              </span>
            )}
          </div>
        )}
        {analysis && analysis.critical_ambiguous.length > 0 && (
          <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('ambiguousMapping')}: {analysis.critical_ambiguous.join(', ')} — {t('confirmMapping')}
          </div>
        )}
      </Card>

      {analysis && (
        <Card title={t('columnMapping')}>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => {
              const sug = suggestions[f.key]
              return (
                <label key={f.key} className="block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
                    {f.label}{f.required && <span className="text-rose-500">*</span>}
                    {sug && mapping[f.key] === sug.column && (
                      <span className={`rounded px-1 text-[10px] ${sug.confidence >= 0.85 ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
                        {Math.round(sug.confidence * 100)}% {sug.method}
                      </span>
                    )}
                  </span>
                  <select value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500">
                    <option value="">— {t('notMapped')} —</option>
                    {analysis.columns.map((c) => (
                      <option key={c} value={c}>{c}{sug?.column === c ? `  ✓ (${Math.round(sug.confidence * 100)}%)` : ''}</option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={doPreview} disabled={busy || missingRequired.length > 0}>👁 {t('preview')}</Button>
            <Button onClick={() => doCommit(false)} disabled={busy || missingRequired.length > 0 || !preview}>📥 {t('commit')}</Button>
          </div>
          {missingRequired.length > 0 && <p className="mt-2 text-xs text-rose-600">{t('required')}: {missingRequired.join(', ')}</p>}
        </Card>
      )}

      {result && (
        <Card title={`✅ ${t('commit')}`}>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-brand-50 p-3"><div className="text-xs text-brand-600">{t('accepted')}</div><div className="text-xl font-bold">{result.added}</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-600">{t('needsReview')}</div><div className="text-xl font-bold">{result.needs_review}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('rejectedRows')}</div><div className="text-xl font-bold">{result.rejected}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">duplicates</div><div className="text-xl font-bold">{result.duplicates?.length ?? 0}</div></div>
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
            <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">missing: {preview.missing_columns.join(', ')}</div>
          )}
          <Card title={`${t('accepted')} (${preview.accepted.length})`} actions={
            <Button onClick={() => doCommit(false)} disabled={busy}>📥 {t('commit')}</Button>
          }>
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
          </Card>
          {preview.factor_preview.length > 0 && (
            <Card title={t('factorPreview')}>
              <DataTable rows={preview.factor_preview} pageSize={8} columns={[
                { key: 'row_number', label: '#' },
                { key: 'status', label: t('status'), render: (r) => <StatusBadge status={r.status === 'auto' ? 'approved' : r.status === 'from_file' ? 'calculated' : 'needs_review'} /> },
                { key: 'message', label: t('factor') },
                { key: 'chosen', label: t('factorValue'), render: (r) => r.chosen ? `${r.chosen.value} kg/${r.chosen.unit} · ${r.chosen.source}` : '—' },
              ]} />
              <p className="mt-2 text-xs text-slate-400">{t('factorPreviewNote')}</p>
            </Card>
          )}
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
            { key: 'file_hash', label: 'Hash', render: (r) => r.file_hash ? String(r.file_hash).slice(0, 10) : '—' },
          ]} />
        </Card>
      )}
    </div>
  )
}
