import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, errMsg } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Card, DataTable, Input, Select, StatusBadge, Textarea } from '../components/ui'
import { useI18n } from '../i18n'

const TYPES = ['commercial_ac', 'central_hvac', 'chiller', 'refrigerator_freezer',
  'industrial_refrigeration', 'cold_storage', 'other']

export default function Refrigerants() {
  const { t } = useI18n()
  const { user } = useAuth()
  const isStaff = user?.role === 'admin' || user?.role === 'head_office'
  const [refs, setRefs] = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [kpi, setKpi] = useState<any>(null)
  const [facilities, setFacilities] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [facilityFilter, setFacilityFilter] = useState('all')
  const [year, setYear] = useState('all')

  const [eqForm, setEqForm] = useState({ facility_id: '', identifier: '', equipment_type: 'chiller', refrigerant_key: 'R410A', charge_kg: '', installed_year: '', notes: '' })
  const [svForm, setSvForm] = useState({ equipment_id: '', service_date: '', gwp_basis: 'AR5', added_kg: '', recovered_kg: '', leaked_kg: '', ownership_control: 'owned_controlled', evidence_ref: '', notes: '' })

  const load = useCallback(() => {
    const p: any = {}
    if (facilityFilter !== 'all') p.facility_id = facilityFilter
    if (year !== 'all') p.year = year
    api.get('/refrigerants').then((r) => setRefs(r.data))
    api.get('/cooling/equipment', { params: p }).then((r) => setEquipment(r.data))
    api.get('/cooling/records', { params: p }).then((r) => setServices(r.data))
    api.get('/cooling/kpi', { params: p }).then((r) => setKpi(r.data))
  }, [facilityFilter, year])
  useEffect(load, [load])
  useEffect(() => { if (isStaff) api.get('/org/facilities').then((r) => setFacilities(r.data)) }, [isStaff])

  const canWrite = user?.role !== 'viewer'

  const addEquipment = async () => {
    setMsg(''); setBusy(true)
    try {
      await api.post('/cooling/equipment', {
        facility_id: isStaff && eqForm.facility_id ? Number(eqForm.facility_id) : undefined,
        identifier: eqForm.identifier, equipment_type: eqForm.equipment_type,
        refrigerant_key: eqForm.refrigerant_key, charge_kg: eqForm.charge_kg || null,
        installed_year: eqForm.installed_year ? Number(eqForm.installed_year) : null, notes: eqForm.notes,
      })
      setEqForm({ ...eqForm, identifier: '', charge_kg: '', installed_year: '', notes: '' })
      load()
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  const addService = async () => {
    setMsg(''); setResult(null); setBusy(true)
    try {
      const r = await api.post('/cooling/records', {
        equipment_id: Number(svForm.equipment_id), service_date: svForm.service_date,
        gwp_basis: svForm.gwp_basis,
        added_kg: svForm.added_kg || null, recovered_kg: svForm.recovered_kg || null,
        leaked_kg: svForm.leaked_kg || null, ownership_control: svForm.ownership_control,
        evidence_ref: svForm.evidence_ref || null, notes: svForm.notes,
      })
      setResult(r.data)
      setSvForm({ ...svForm, added_kg: '', recovered_kg: '', leaked_kg: '', evidence_ref: '', notes: '' })
      load()
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  const chartData = (kpi?.by_equipment ?? []).map((x: any) => ({ name: x.equipment.slice(0, 22), kg: Number(x.kg) }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-xl font-bold text-slate-800">{t('navRefrigerants')}</h1>
        {isStaff && (
          <Select value={facilityFilter} onChange={setFacilityFilter} className="w-48"
            options={[{ value: 'all', label: t('all') }, ...facilities.map((f: any) => ({ value: String(f.facility_id), label: f.name }))]} />
        )}
        <Select value={year} onChange={setYear} className="w-28"
          options={[{ value: 'all', label: t('all') }, ...Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => ({ value: y, label: y }))]} />
      </div>
      {msg && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{msg}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 p-4 text-white">
          <div className="text-xs opacity-80">{t('refrigerantKpi')}</div>
          <div className="text-2xl font-bold tabular-nums">{Number(kpi?.refrigerant_kg ?? 0).toLocaleString()} <span className="text-xs font-normal">kg</span></div>
          <div className="text-xs opacity-75">{Number(kpi?.refrigerant_t ?? 0).toFixed(2)} t CO₂e</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">{t('shareOfScope1')}</div>
          <div className="text-2xl font-bold tabular-nums">{kpi?.share_of_scope1_pct ?? '—'}%</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">{t('records')}</div>
          <div className="text-2xl font-bold tabular-nums">{kpi?.records ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">{t('equipmentInventory')}</div>
          <div className="text-2xl font-bold tabular-nums">{equipment.length}</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <Card title={t('byEquipment')}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip formatter={(v: number) => `${v.toLocaleString()} kg`} />
              <Bar dataKey="kg" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {canWrite && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('newEquipment')}>
            <div className="grid gap-3 md:grid-cols-2">
              {isStaff && (
                <Select label={t('facility')} value={eqForm.facility_id} onChange={(v) => setEqForm({ ...eqForm, facility_id: v })}
                  options={[{ value: '', label: '—' }, ...facilities.map((f: any) => ({ value: String(f.facility_id), label: f.name }))]} />
              )}
              <Input label={t('identifier')} value={eqForm.identifier} onChange={(v) => setEqForm({ ...eqForm, identifier: v })} />
              <Select label={t('equipmentType')} value={eqForm.equipment_type} onChange={(v) => setEqForm({ ...eqForm, equipment_type: v })}
                options={TYPES.map((x) => ({ value: x, label: x }))} />
              <Select label={t('refrigerant')} value={eqForm.refrigerant_key} onChange={(v) => setEqForm({ ...eqForm, refrigerant_key: v })}
                options={refs.map((r: any) => ({ value: r.refrigerant_key, label: `${r.designation} (${r.family})` }))} />
              <Input label={t('chargeKg')} type="number" step="any" value={eqForm.charge_kg} onChange={(v) => setEqForm({ ...eqForm, charge_kg: v })} />
              <Input label={t('installedYear')} type="number" value={eqForm.installed_year} onChange={(v) => setEqForm({ ...eqForm, installed_year: v })} />
            </div>
            <Button className="mt-3" onClick={addEquipment} disabled={busy || !eqForm.identifier}>{t('create')}</Button>
          </Card>

          <Card title={t('newServiceRecord')}>
            <div className="grid gap-3 md:grid-cols-2">
              <Select label={t('equipment')} value={svForm.equipment_id} onChange={(v) => setSvForm({ ...svForm, equipment_id: v })}
                options={[{ value: '', label: '—' }, ...equipment.map((e: any) => ({ value: String(e.equipment_id), label: `${e.identifier} (${e.refrigerant_key ?? '—'})` }))]} />
              <Input label={t('serviceDate')} type="date" value={svForm.service_date} onChange={(v) => setSvForm({ ...svForm, service_date: v })} />
              <Input label={t('addedKg')} type="number" step="any" value={svForm.added_kg} onChange={(v) => setSvForm({ ...svForm, added_kg: v })} />
              <Input label={t('recoveredKg')} type="number" step="any" value={svForm.recovered_kg} onChange={(v) => setSvForm({ ...svForm, recovered_kg: v })} />
              <Input label={`${t('leakedKg')} (${t('optional')})`} type="number" step="any" value={svForm.leaked_kg} onChange={(v) => setSvForm({ ...svForm, leaked_kg: v })} />
              <Select label={t('gwpBasis')} value={svForm.gwp_basis} onChange={(v) => setSvForm({ ...svForm, gwp_basis: v })}
                options={['AR4', 'AR5', 'AR6'].map((b) => ({ value: b, label: b }))} />
              <Select label={t('ownershipControl')} value={svForm.ownership_control} onChange={(v) => setSvForm({ ...svForm, ownership_control: v })}
                options={['owned_controlled', 'leased_controlled', 'not_controlled'].map((x) => ({ value: x, label: x }))} />
              <Input label={t('evidence')} value={svForm.evidence_ref} onChange={(v) => setSvForm({ ...svForm, evidence_ref: v })} />
            </div>
            <Button className="mt-3" onClick={addService}
              disabled={busy || !svForm.equipment_id || !svForm.service_date || (!svForm.leaked_kg && !svForm.added_kg)}>
              🧮 {t('calculate')}
            </Button>
            <p className="mt-1 text-[11px] text-slate-400">{t('leakageNote')}</p>
            {result && (
              <div className="mt-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                <div className="font-semibold">{result.refrigerant} · {result.gwp_basis} GWP {result.gwp}</div>
                <div>{t('leaked')}: {result.leaked_kg} kg → <b>{Number(result.kg_co2e).toLocaleString()} kg CO₂e</b></div>
                <div className="text-xs">{result.methodology}</div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Card title={t('equipmentInventory')}>
        <DataTable rows={equipment} pageSize={10} columns={[
          { key: 'equipment_id', label: '#' },
          { key: 'identifier', label: t('identifier') },
          { key: 'equipment_type', label: t('equipmentType') },
          { key: 'refrigerant_key', label: t('refrigerant') },
          { key: 'charge_kg', label: t('chargeKg') },
          { key: 'facility_name', label: t('facility') },
          { key: 'services', label: t('serviceRecords') },
          { key: 'total_kg', label: t('kgCO2e'), render: (r) => Number(r.total_kg ?? 0).toLocaleString() },
        ]} />
      </Card>

      <Card title={t('serviceRecords')}>
        <DataTable rows={services} pageSize={12} columns={[
          { key: 'service_date', label: t('serviceDate'), sortable: true },
          { key: 'identifier', label: t('equipment') },
          { key: 'refrigerant_key', label: t('refrigerant') },
          { key: 'gwp_basis', label: t('gwpBasis') },
          { key: 'added_kg', label: t('addedKg') },
          { key: 'recovered_kg', label: t('recoveredKg') },
          { key: 'leaked_calculated_kg', label: t('leaked') },
          { key: 'kg_co2e', label: t('kgCO2e'), render: (r) => Number(r.kg_co2e ?? 0).toLocaleString() },
          { key: 'status', label: t('status'), render: (r) => <StatusBadge status={r.record_id ? 'calculated' : 'needs_review'} /> },
        ]} />
      </Card>

      <Card title={t('refrigerantDb')}>
        <DataTable rows={refs} pageSize={10} columns={[
          { key: 'designation', label: t('refrigerant') },
          { key: 'chemical_name', label: t('chemicalName') },
          { key: 'formula', label: t('chemFormula') },
          { key: 'family', label: t('family'), render: (r) => <Badge tone={r.family?.includes('HFC') ? 'blue' : r.family === 'natural' ? 'green' : 'purple'}>{r.family}</Badge> },
          { key: 'gwp_100_ar4', label: 'AR4' },
          { key: 'gwp_100_ar5', label: 'AR5' },
          { key: 'gwp_100_ar6', label: 'AR6' },
        ]} />
        <p className="mt-2 text-[11px] text-slate-400">{t('gwpNote')}</p>
      </Card>
    </div>
  )
}
