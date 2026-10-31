import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'ar' | 'en'

const dict = {
  // general
  appName: ['CarbonAI', 'CarbonAI'],
  tagline: ['منصة إدارة الانبعاثات الكربونية', 'Carbon Emissions Management Platform'],
  login: ['تسجيل الدخول', 'Sign in'],
  logout: ['تسجيل الخروج', 'Sign out'],
  username: ['اسم المستخدم', 'Username'],
  password: ['كلمة المرور', 'Password'],
  newPassword: ['كلمة المرور الجديدة', 'New password'],
  currentPassword: ['كلمة المرور الحالية', 'Current password'],
  changePassword: ['تغيير كلمة المرور', 'Change password'],
  save: ['حفظ', 'Save'],
  cancel: ['إلغاء', 'Cancel'],
  close: ['إغلاق', 'Close'],
  create: ['إنشاء', 'Create'],
  edit: ['تعديل', 'Edit'],
  delete: ['حذف', 'Delete'],
  search: ['بحث...', 'Search...'],
  loading: ['جارٍ التحميل...', 'Loading...'],
  noData: ['لا توجد بيانات', 'No data'],
  all: ['الكل', 'All'],
  year: ['السنة', 'Year'],
  month: ['الشهر', 'Month'],
  status: ['الحالة', 'Status'],
  actions: ['إجراءات', 'Actions'],
  total: ['الإجمالي', 'Total'],
  required: ['إلزامي', 'required'],
  optional: ['اختياري', 'optional'],
  yes: ['نعم', 'Yes'],
  no: ['لا', 'No'],
  confirm: ['تأكيد', 'Confirm'],
  reason: ['السبب / المبرر', 'Reason'],
  name: ['الاسم', 'Name'],
  error: ['خطأ', 'Error'],
  success: ['تم بنجاح', 'Success'],
  createdAt: ['تاريخ الإنشاء', 'Created at'],
  kgCO2e: ['كجم مكافئ CO₂', 'kg CO₂e'],
  tCO2e: ['طن مكافئ CO₂', 't CO₂e'],

  // nav
  navDashboard: ['لوحة التحكم', 'Dashboard'],
  navNewRecord: ['إدخال نشاط', 'New Activity'],
  navRecords: ['سجل الأنشطة', 'Activity Records'],
  navSubmissions: ['تقارير المصانع', 'Factory Reports'],
  navConsolidated: ['التقرير الموحد', 'Consolidated'],
  navFactors: ['معاملات الانبعاث', 'Emission Factors'],
  navImport: ['استيراد البيانات', 'Import Data'],
  navReports: ['التقارير', 'Reports'],
  navPlans: ['خطط الخفض', 'Reduction Plans'],
  navOrganization: ['الفروع والمصانع', 'Organization'],
  navUsers: ['المستخدمون', 'Users'],
  navML: ['النموذج الذكي', 'ML Insights'],
  navSettings: ['الإعدادات', 'Settings'],
  groupOperations: ['العمليات', 'Operations'],
  groupAnalysis: ['التحليل', 'Analysis'],
  groupAdministration: ['الإدارة', 'Administration'],
  headOfficeView: ['الإدارة العامة — عرض شامل', 'Head Office — full view'],
  facilityScope: ['نطاق المصنع', 'Facility scope'],

  // dashboard
  totalEmissions: ['إجمالي الانبعاثات', 'Total emissions'],
  records: ['السجلات', 'Records'],
  calculated: ['محسوبة', 'Calculated'],
  needsReview: ['تحتاج مراجعة', 'Needs review'],
  verifiedShare: ['حصة المعاملات الموثقة', 'Verified-factor share'],
  monthlyEmissions: ['الانبعاثات الشهرية', 'Monthly emissions'],
  byScope: ['حسب النطاق', 'By scope'],
  facilityComparison: ['مقارنة المصانع والفروع', 'Facility comparison'],
  byCategory: ['حسب فئة النشاط', 'By activity category'],
  topSources: ['أكبر مصادر الانبعاثات', 'Top emission sources'],
  scope1: ['النطاق 1', 'Scope 1'],
  scope2: ['النطاق 2', 'Scope 2'],
  scope3: ['النطاق 3', 'Scope 3'],
  unscoped: ['غير مصنف', 'Unscoped'],
  noRecordsYet: ['لا توجد سجلات بعد — ابدأ بإدخال نشاط أو استيراد ملف.', 'No records yet — start by entering an activity or importing a file.'],
  avgMonthly: ['المتوسط الشهري (أشهر نشطة)', 'Avg monthly (active months)'],

  // records / calculator
  activityName: ['اسم النشاط', 'Activity name'],
  description: ['الوصف', 'Description'],
  activityDate: ['تاريخ النشاط', 'Activity date'],
  category: ['فئة النشاط', 'Activity category'],
  quantity: ['الكمية', 'Quantity'],
  unit: ['الوحدة', 'Unit'],
  country: ['الدولة', 'Country'],
  facility: ['الفرع / المصنع', 'Branch / Factory'],
  fuelMaterial: ['نوع الوقود/المادة', 'Fuel / material'],
  ownershipControl: ['ملكية/سيطرة المصدر', 'Ownership / control'],
  energyPurchased: ['هل الطاقة مشتراة؟', 'Is the energy purchased?'],
  valueChainRelation: ['علاقة سلسلة القيمة', 'Value-chain relationship'],
  scopeSuggestion: ['اقتراح النطاق', 'Scope suggestion'],
  confidence: ['الثقة', 'Confidence'],
  missingInfo: ['معلومات ناقصة', 'Missing information'],
  overrideScope: ['تعديل النطاق يدويًا', 'Override scope manually'],
  subcategory: ['الفئة الفرعية', 'Subcategory'],
  scope2Method: ['طريقة النطاق 2', 'Scope 2 method'],
  location: ['موقعي (location)', 'Location-based'],
  market: ['سوقي (market)', 'Market-based'],
  factorSource: ['مصدر المعامل', 'Factor source'],
  fromLibrary: ['من المكتبة', 'From library'],
  manualEntry: ['إدخال يدوي', 'Manual entry'],
  suggestFactor: ['اقترح معاملًا', 'Suggest factor'],
  chooseFactor: ['اختر المعامل', 'Choose factor'],
  factorValue: ['قيمة المعامل', 'Factor value'],
  factorManualSource: ['مصدر المعامل اليدوي (إلزامي)', 'Manual factor source (required)'],
  proxyConfirm: ['أؤكد استخدام معامل بديل (ليس وطنيًا لهذه الدولة)', 'I confirm using a substitute factor (not national for this country)'],
  proxyRationale: ['مبرر استخدام المعامل البديل (إلزامي)', 'Proxy rationale (required)'],
  saveAndCalculate: ['حفظ النشاط وحساب الانبعاثات', 'Save activity and calculate'],
  calculationResult: ['نتيجة الحساب', 'Calculation result'],
  formula: ['المعادلة', 'Formula'],
  warnings: ['تحذيرات', 'Warnings'],
  isEstimate: ['نتيجة تقديرية', 'Estimate'],
  duplicateExists: ['سجل مكرر موجود', 'Duplicate record exists'],
  allowDuplicate: ['السماح بسجل مكرر', 'Allow duplicate'],
  calcStatus: ['حالة الحساب', 'Calculation status'],
  factor: ['المعامل', 'Factor'],
  factorClass: ['نوع المعامل', 'Factor class'],
  factorVerification: ['حالة التحقق', 'Verification'],
  evidence: ['مرجع الإثبات', 'Evidence reference'],
  notes: ['ملاحظات', 'Notes'],
  recordDetail: ['تفاصيل السجل', 'Record detail'],
  overrideScopeTitle: ['تعديل النطاق', 'Override scope'],
  newReasonRequired: ['سبب الإلزامي', 'Reason (required)'],

  // submissions
  submitReport: ['إرسال تقرير للإدارة العامة', 'Submit report to head office'],
  submissionPeriod: ['فترة التقرير', 'Reporting period'],
  fullYear: ['سنة كاملة', 'Full year'],
  submissions: ['التقارير المرسلة', 'Submissions'],
  submitted: ['مُرسل', 'Submitted'],
  approved: ['معتمد', 'Approved'],
  rejected: ['مرفوض', 'Rejected'],
  withdrawn: ['مسحوب', 'Withdrawn'],
  reviewQueue: ['قائمة المراجعة', 'Review queue'],
  approve: ['اعتماد', 'Approve'],
  reject: ['رفض', 'Reject'],
  reviewNote: ['ملاحظة المراجعة', 'Review note'],
  rejectNoteRequired: ['الرفض يتطلب ملاحظة', 'Rejection requires a note'],
  submittedBy: ['أرسله', 'Submitted by'],
  reviewedBy: ['راجعه', 'Reviewed by'],
  recordsCount: ['عدد السجلات', 'Records'],
  consolidatedReport: ['التقرير الموحد للمنشأة', 'Organization consolidated report'],
  approvedOnly: ['التقارير المعتمدة فقط', 'Approved submissions only'],
  alreadyActive: ['يوجد تقرير نشط لنفس المصنع/الفترة', 'An active submission already exists for this facility/period'],

  // factors
  factorLibrary: ['مكتبة معاملات الانبعاث', 'Emission factor library'],
  countryCoverage: ['تغطية الدول', 'Country coverage'],
  registeredSources: ['المراجع المسجلة', 'Registered sources'],
  auditLog: ['سجل التغييرات', 'Audit log'],
  addFactor: ['إضافة معامل', 'Add factor'],
  verifyFactor: ['اعتماد / مراجعة المعامل', 'Verify / review factor'],
  factors: ['المعاملات', 'Factors'],
  nFactors: ['عدد المعاملات', 'Factors'],
  nVerified: ['موثقة', 'Verified'],
  suggestionMessage: ['رسالة الاقتراح', 'Suggestion'],
  candidates: ['المعاملات المرشحة', 'Candidates'],
  excluded: ['مستبعدة ولماذا', 'Excluded and why'],
  gwpSets: ['مجموعات GWP', 'GWP sets'],

  // import
  importFile: ['استيراد CSV / Excel', 'Import CSV / Excel'],
  preview: ['معاينة', 'Preview'],
  commit: ['استيراد مؤكد', 'Commit import'],
  accepted: ['مقبولة', 'Accepted'],
  rejectedRows: ['مرفوضة', 'Rejected'],
  importWarnings: ['تحذيرات', 'Warnings'],
  downloadTemplate: ['تنزيل القالب', 'Download template'],
  batches: ['دفعات الاستيراد السابقة', 'Previous batches'],
  keepDuplicates: ['إدخال الصفوف المكررة', 'Import duplicate rows'],

  // reports
  downloadCsv: ['تصدير CSV', 'Export CSV'],
  downloadPdfEn: ['تقرير PDF (إنجليزي)', 'PDF report (English)'],
  downloadPdfAr: ['تقرير PDF (عربي)', 'PDF report (Arabic)'],
  monthlySummaryCsv: ['ملخص شهري CSV', 'Monthly summary CSV'],

  // plans
  newPlan: ['خطة خفض جديدة', 'New reduction plan'],
  area: ['مجال التحسين', 'Improvement area'],
  owner: ['المسؤول', 'Owner'],
  targetDate: ['التاريخ المستهدف', 'Target date'],
  assumptions: ['الافتراضات الموثقة', 'Documented assumptions'],
  planned: ['مخطط', 'Planned'],
  inProgress: ['قيد التنفيذ', 'In progress'],
  done: ['منجز', 'Done'],
  cancelled: ['ملغى', 'Cancelled'],

  // org / users
  companies: ['المنشآت', 'Companies'],
  facilities: ['الفروع والمصانع', 'Branches & Factories'],
  newFacility: ['إضافة فرع/مصنع', 'Add branch/factory'],
  newCompany: ['إضافة منشأة', 'Add company'],
  controlStatus: ['حالة السيطرة', 'Control status'],
  internalRef: ['مرجع داخلي', 'Internal ref'],
  role: ['الدور', 'Role'],
  full_name: ['الاسم الكامل', 'Full name'],
  email: ['البريد الإلكتروني', 'Email'],
  active: ['نشط', 'Active'],
  inactive: ['موقوف', 'Inactive'],
  addUser: ['إضافة مستخدم', 'Add user'],
  resetPassword: ['إعادة تعيين كلمة المرور', 'Reset password'],
  roles: {
    admin: ['مدير النظام', 'Administrator'],
    head_office: ['الإدارة العامة', 'Head office'],
    factory_manager: ['مدير مصنع', 'Factory manager'],
    viewer: ['مشاهد', 'Viewer'],
  },

  // ml
  mlStatus: ['حالة النموذج', 'Model status'],
  mlNotLoaded: ['لا يوجد نموذج مدرَّب بعد', 'No trained model loaded'],
  mlTrain: ['تدريب النموذج من بيانات السجل', 'Train model from ledger data'],
  mlPredict: ['تقدير ذكي للانبعاثات', 'ML emission estimate'],
  mlPredictNote: ['تقدير للتخطيط فقط ولا يحل محل المحرك الحتمي', 'Planning estimate only; never replaces the deterministic engine'],
  mlTrainNote: ['يتطلب 40 سجلًا محسوبًا على الأقل', 'Requires at least 40 calculated records'],
  predicted: ['الانبعاثات المتوقعة', 'Predicted emissions'],

  // settings
  displayUnit: ['وحدة العرض', 'Display unit'],
  defaultCountry: ['الدولة الافتراضية', 'Default country'],
  defaultScope2: ['طريقة النطاق 2 الافتراضية', 'Default Scope 2 method'],
  backupNow: ['إنشاء نسخة احتياطية الآن', 'Create backup now'],
  dbInfo: ['معلومات قاعدة البيانات', 'Database info'],
  tonne: ['طن', 'tonne'],
  mustChange: ['يجب تغيير كلمة المرور قبل المتابعة', 'You must change your password before continuing'],
} as const

export type DictKey = keyof typeof dict | keyof (typeof dict)['roles']

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: DictKey) => string; dir: 'rtl' | 'ltr' }
const I18nContext = createContext<Ctx>({ lang: 'ar', setLang: () => {}, t: (k) => String(k), dir: 'rtl' })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('carbonai.lang') as Lang) || 'ar')
  useEffect(() => {
    localStorage.setItem('carbonai.lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  const t = (k: DictKey) => {
    const entry = (dict as any)[k]
    if (Array.isArray(entry)) return entry[lang === 'ar' ? 0 : 1]
    return String(k)
  }
  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir: lang === 'ar' ? 'rtl' : 'ltr' }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
