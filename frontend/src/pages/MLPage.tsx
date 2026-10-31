import { useCallback, useEffect, useState } from 'react'
import { api, errMsg } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Input, Select, Spinner } from '../components/ui'
import { useI18n } from '../i18n'

type Status = {
  loaded: boolean; path: string; reason?: string; features?: string[]
  metrics?: any; trained_at?: string; train_rows?: number; sklearn_version?: string; notes?: string
}

export default function MLPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [st, setSt] = useState<Status | null>(null)
  const [msg, setMsg] = useState('')
  const [pred, setPred] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState<any>(null)
  const [form, setForm] = useState({ quantity: '', unit: 'kWh', category_key: 'electricity', scope: 'Scope 2', month: String(new Date().getMonth() + 1) })

  const load = useCallback(() => { api.get('/ml/status').then((r) => setSt(r.data)) }, [])
  useEffect(load, [load])
  useEffect(() => { api.get('/records/meta').then((r) => setMeta(r.data)) }, [])

  const train = async () => {
    setMsg(''); setBusy(true)
    try { await api.post('/ml/train', { min_rows: 40 }); load() } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }
  const predict = async () => {
    setMsg(''); setPred(null); setBusy(true)
    try {
      const r = await api.post('/ml/predict', {
        quantity: Number(form.quantity), unit: form.unit, category_key: form.category_key,
        scope: form.scope, activity_month: Number(form.month),
      })
      setPred(r.data)
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }
  if (!st) return <Spinner label={t('loading')} />
  const isAdmin = user?.role === 'admin'

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t('navML')}</h1>
      {msg && <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{msg}</div>}

      <Card title={t('mlStatus')} actions={isAdmin ? <Button variant="outline" onClick={train} disabled={busy}>⚙ {t('mlTrain')}</Button> : undefined}>
        {st.loaded ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-brand-50 px-2 py-0.5 font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">carbonai.ml/1</span>
              <span className="rounded-md bg-slate-50 px-2 py-0.5 text-slate-600">scikit-learn {st.sklearn_version}</span>
              <span className="rounded-md bg-slate-50 px-2 py-0.5 text-slate-600">{st.train_rows} rows · {st.trained_at?.slice(0, 10)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {st.metrics?.mae_kg != null && <div><div className="text-xs text-slate-400">MAE</div><div className="font-semibold tabular-nums">{st.metrics.mae_kg} kg</div></div>}
              {st.metrics?.r2 != null && <div><div className="text-xs text-slate-400">R²</div><div className="font-semibold tabular-nums">{st.metrics.r2}</div></div>}
              {st.metrics?.train_rows != null && <div><div className="text-xs text-slate-400">train rows</div><div className="font-semibold tabular-nums">{st.metrics.train_rows}</div></div>}
              {st.metrics?.test_rows != null && <div><div className="text-xs text-slate-400">test rows</div><div className="font-semibold tabular-nums">{st.metrics.test_rows}</div></div>}
            </div>
            <p className="text-xs text-slate-400">{st.notes}</p>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            🤖 {t('mlNotLoaded')}
            <div className="mt-1 text-xs text-slate-400">{st.reason}</div>
            {isAdmin && <div className="mt-1 text-xs">{t('mlTrain')} — {t('mlTrainNote')}</div>}
          </div>
        )}
      </Card>

      <Card title={t('mlPredict')}>
        <div className="flex flex-wrap items-end gap-3">
          <Input label={t('quantity')} type="number" step="any" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} className="w-36" />
          <Select label={t('unit')} value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} className="w-28"
            options={(meta?.units ?? ['kWh']).map((u: string) => ({ value: u, label: u }))} />
          <Select label={t('category')} value={form.category_key} onChange={(v) => setForm({ ...form, category_key: v })} className="w-48"
            options={(meta?.categories ?? []).map((c: any) => ({ value: c.category_key, label: c.category_key }))} />
          <Select label={t('byScope')} value={form.scope} onChange={(v) => setForm({ ...form, scope: v })} className="w-32"
            options={['Scope 1', 'Scope 2', 'Scope 3'].map((s) => ({ value: s, label: s }))} />
          <Select label={t('month')} value={form.month} onChange={(v) => setForm({ ...form, month: v })} className="w-24"
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
          <Button onClick={predict} disabled={busy || !st.loaded || !form.quantity}>🔮 {t('mlPredict')}</Button>
        </div>
        {pred && (
          <div className="mt-4 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 p-4 text-white">
            <div className="text-xs opacity-80">{t('predicted')}</div>
            <div className="text-2xl font-bold tabular-nums">{pred.predicted_kg_co2e.toLocaleString()} kg CO₂e</div>
            <div className="text-xs opacity-75">{pred.disclaimer}</div>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">{t('mlPredictNote')}</p>
      </Card>
    </div>
  )
}
