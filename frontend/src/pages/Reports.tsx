import { useEffect, useState } from 'react'
import { api, download } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Select } from '../components/ui'
import { useI18n } from '../i18n'

export default function Reports() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [facilities, setFacilities] = useState<any[]>([])
  const [f, setF] = useState({ year: String(new Date().getFullYear()), month: 'all', facility: 'all', scope: 'all' })
  const isStaff = user?.role === 'admin' || user?.role === 'head_office'

  useEffect(() => {
    if (isStaff) api.get('/org/facilities').then((r) => setFacilities(r.data))
  }, [isStaff])

  const qs = () => {
    const p = new URLSearchParams()
    if (f.year !== 'all') p.set('year', f.year)
    if (f.month !== 'all') p.set('month', f.month)
    if (f.facility !== 'all') p.set('facility_id', f.facility)
    if (f.scope !== 'all') p.set('scope', f.scope)
    return p.toString()
  }
  const period = () => `${f.year === 'all' ? 'all' : f.year}${f.month !== 'all' ? `-${String(f.month).padStart(2, '0')}` : ''}`

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">{t('navReports')}</h1>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Select label={t('year')} value={f.year} onChange={(v) => setF({ ...f, year: v })} className="w-32"
            options={['all', ...Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - i))].map((y) => ({ value: y, label: y === 'all' ? t('all') : y }))} />
          <Select label={t('month')} value={f.month} onChange={(v) => setF({ ...f, month: v })} className="w-32"
            options={[{ value: 'all', label: t('all') }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
          <Select label={t('byScope')} value={f.scope} onChange={(v) => setF({ ...f, scope: v })} className="w-32"
            options={[{ value: 'all', label: t('all') }, ...['Scope 1', 'Scope 2', 'Scope 3'].map((s) => ({ value: s, label: s }))]} />
          {isStaff && (
            <Select label={t('facility')} value={f.facility} onChange={(v) => setF({ ...f, facility: v })} className="w-56"
              options={[{ value: 'all', label: t('all') }, ...facilities.map((x: any) => ({ value: String(x.facility_id), label: x.name }))]} />
          )}
        </div>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => download(`/reports/csv?${qs()}`, `carbonai_records_${period()}.csv`)}>📄 {t('downloadCsv')}</Button>
        <Button variant="outline" onClick={() => download(`/reports/monthly-csv?${qs()}`, `carbonai_monthly_${period()}.csv`)}>📊 {t('monthlySummaryCsv')}</Button>
        <Button variant="outline" onClick={() => download(`/reports/pdf?${qs()}&lang=en`, `carbonai_report_${period()}_en.pdf`)}>🧾 {t('downloadPdfEn')}</Button>
        <Button variant="outline" onClick={() => download(`/reports/pdf?${qs()}&lang=ar`, `carbonai_report_${period()}_ar.pdf`)}>🧾 {t('downloadPdfAr')}</Button>
      </div>
      <Card>
        <p className="text-xs leading-5 text-slate-400">
          التقارير تستخدم نفس فلاتر لوحة التحكم ونفس منطق الحساب (سجلات «محسوبة» فقط؛ السجلات التي تحتاج معاملًا أو تاريخًا أو مراجعة تُذكر ولا تُحسب صفرًا).
          Reports use the same filters and the same summarize() path as the dashboard: only calculated rows count; rows needing a factor/date/review are listed, never counted as zero.
        </p>
      </Card>
    </div>
  )
}
