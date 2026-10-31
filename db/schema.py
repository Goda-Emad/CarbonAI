"""Additive schema + migrations. No DROP / DELETE statements anywhere in this module."""
from __future__ import annotations

import sqlite3

from db.connection import backup_file, db_path, now_iso, transaction

SCHEMA_VERSION = 2

DDL = [
"""CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)""",

"""CREATE TABLE IF NOT EXISTS countries (
    country_id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_name_ar TEXT NOT NULL,
    country_name_en TEXT NOT NULL,
    iso2_code TEXT NOT NULL UNIQUE,
    iso3_code TEXT NOT NULL UNIQUE,
    region TEXT,
    is_active INTEGER NOT NULL DEFAULT 1)""",

"""CREATE TABLE IF NOT EXISTS sources (
    reference_id TEXT PRIMARY KEY,
    organization_name TEXT NOT NULL,
    organization_type TEXT,
    country_id INTEGER REFERENCES countries(country_id),
    document_title TEXT NOT NULL,
    document_version TEXT,
    publication_year INTEGER,
    publication_date TEXT,
    source_url TEXT,
    document_url TEXT,
    methodology_description TEXT,
    geographic_scope TEXT,
    license_or_usage_notes TEXT,
    last_checked_at TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified')""",

"""CREATE TABLE IF NOT EXISTS activity_categories (
    category_key TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    unified_classification TEXT,
    industry_sector TEXT,
    fuel_or_material_types TEXT,
    compatible_units TEXT,
    expected_scope TEXT,
    related_subcategories TEXT)""",

"""CREATE TABLE IF NOT EXISTS emission_factors (
    factor_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    factor_name_ar TEXT,
    factor_name_en TEXT,
    country_code TEXT NOT NULL,            -- ISO2, 'GLOBAL' or 'REGION:xx'
    factor_class TEXT NOT NULL,            -- official_national|regional|global_default|proxy|user_supplied|test_synthetic
    activity_category TEXT NOT NULL,
    activity TEXT NOT NULL,
    activity_description TEXT,
    industry_sector TEXT,
    gas_type TEXT,                         -- 'CO2e' when value is a published CO2e total
    scope TEXT,                            -- informational default only; real scope comes from classification
    scope_subcategory TEXT,
    activity_unit TEXT NOT NULL,           -- denominator unit
    factor_unit TEXT NOT NULL,             -- e.g. 'kg CO2e/kWh'
    co2e_factor_value TEXT,                -- Decimal as text
    components_json TEXT,                  -- [[gas, value, basis], ...]
    gwp_set_id TEXT,
    reference_id TEXT REFERENCES sources(reference_id),
    source_organization TEXT,
    source_document TEXT,
    source_url TEXT,
    source_locator TEXT,
    publication_year INTEGER,
    year_from INTEGER NOT NULL,
    year_to INTEGER NOT NULL,
    geographic_coverage TEXT,
    technology_or_fuel_type TEXT,
    methodology TEXT,
    boundary_note TEXT,
    data_quality TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    last_verified_at TEXT,
    verified_by TEXT,
    license_note TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (factor_id, version))""",

"""CREATE TABLE IF NOT EXISTS factor_audit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    factor_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    action TEXT NOT NULL,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_at TEXT NOT NULL,
    changed_by TEXT,
    reason TEXT,
    reference_id TEXT)""",

"""CREATE TABLE IF NOT EXISTS companies (
    company_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country_code TEXT,
    industry_sector TEXT,
    boundary_approach TEXT,   -- operational_control|financial_control|equity_share (user-declared)
    boundary_notes TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (name, country_code))""",

"""CREATE TABLE IF NOT EXISTS facilities (
    facility_id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    name TEXT NOT NULL,
    country_code TEXT,
    internal_ref TEXT,
    control_status TEXT,      -- owned_controlled|leased_controlled|leased_not_controlled|not_controlled|unknown
    created_at TEXT NOT NULL,
    UNIQUE (company_id, name))""",

# One row per activity record. Original demo columns are kept verbatim (Arabic names
# live in the compat view/DataFrame layer); factor + result are SNAPSHOTS and are
# never recomputed when the library changes.
"""CREATE TABLE IF NOT EXISTS activity_records (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL UNIQUE,
    activity_name TEXT NOT NULL,
    description TEXT,
    company_id INTEGER REFERENCES companies(company_id),
    facility_id INTEGER REFERENCES facilities(facility_id),
    country_code TEXT,
    industry_sector TEXT,
    activity_date TEXT,                    -- ISO date or NULL (never invented)
    activity_year INTEGER,
    activity_month INTEGER,
    quantity TEXT NOT NULL,
    unit TEXT NOT NULL,
    fuel_or_material TEXT,
    category_key TEXT,
    scope TEXT,                            -- 'Scope 1'|'Scope 2'|'Scope 3'|NULL (undetermined)
    scope_subcategory TEXT,
    scope3_category INTEGER,
    scope_status TEXT NOT NULL DEFAULT 'needs_review',  -- suggested|confirmed|needs_review|undetermined
    scope_confidence TEXT,
    scope_reason TEXT,
    scope_missing_info TEXT,
    scope_manual_override INTEGER NOT NULL DEFAULT 0,
    scope2_method TEXT,                    -- location|market|NULL
    ownership_control TEXT,
    energy_purchased TEXT,                 -- yes|no|unknown
    value_chain_relation TEXT,
    factor_id TEXT,
    factor_version INTEGER,
    factor_snapshot_json TEXT,
    factor_value TEXT,
    factor_unit TEXT,
    factor_source TEXT,
    factor_source_url TEXT,
    factor_class TEXT,
    factor_verification TEXT,
    factor_selection_reason TEXT,
    kg_co2e TEXT,
    t_co2e TEXT,
    calc_status TEXT NOT NULL,             -- calculated|needs_factor|needs_date|needs_review|rejected_unit
    calc_notes TEXT,
    engine_version TEXT,
    data_verification TEXT NOT NULL DEFAULT 'unverified',
    notes TEXT,
    evidence_ref TEXT,
    origin TEXT,                           -- manual|import:<file>|migrated_session
    imported_batch_id INTEGER,
    created_at TEXT NOT NULL)""",

"""CREATE TABLE IF NOT EXISTS scope_audit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL REFERENCES activity_records(record_id),
    old_scope TEXT, new_scope TEXT,
    old_subcategory TEXT, new_subcategory TEXT,
    changed_at TEXT NOT NULL, changed_by TEXT, reason TEXT NOT NULL)""",

"""CREATE TABLE IF NOT EXISTS import_batches (
    batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT, imported_at TEXT NOT NULL,
    rows_total INTEGER, rows_accepted INTEGER, rows_rejected INTEGER,
    rows_duplicate INTEGER, rows_needs_review INTEGER, notes TEXT)""",

"""CREATE TABLE IF NOT EXISTS import_rejections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER REFERENCES import_batches(batch_id),
    row_number INTEGER, reason TEXT, raw_json TEXT)""",

"""CREATE TABLE IF NOT EXISTS reduction_plans (
    plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL, description TEXT, owner TEXT, target_date TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    linked_category_key TEXT, assumptions TEXT, created_at TEXT NOT NULL)""",

"""CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)""",

"""CREATE TABLE IF NOT EXISTS update_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, source TEXT,
    outcome TEXT NOT NULL, detail TEXT)""",

"""CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    role TEXT NOT NULL,                    -- admin|head_office|factory_manager|viewer
    company_id INTEGER REFERENCES companies(company_id),
    facility_id INTEGER REFERENCES facilities(facility_id),
    locale TEXT NOT NULL DEFAULT 'ar',
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT)""",

# One submission per facility per period while it is active (submitted/approved); a rejected
# submission frees the period for resubmission. Enforced with a partial unique index below.
"""CREATE TABLE IF NOT EXISTS report_submissions (
    submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(company_id),
    facility_id INTEGER NOT NULL REFERENCES facilities(facility_id),
    period_year INTEGER NOT NULL,
    period_month INTEGER,                  -- NULL = full year
    title TEXT,
    status TEXT NOT NULL DEFAULT 'submitted',   -- submitted|approved|rejected
    total_kg_co2e TEXT,
    by_scope_json TEXT,
    monthly_json TEXT,
    records_count INTEGER,
    calculated_count INTEGER,
    needs_review_count INTEGER,
    verified_factor_pct REAL,
    records_json TEXT,                     -- immutable snapshot of the submitted records
    submitted_by TEXT,
    submitted_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    review_note TEXT)""",

"""CREATE TABLE IF NOT EXISTS submission_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES report_submissions(submission_id),
    action TEXT NOT NULL,                  -- submitted|approved|rejected|review_note
    at TEXT NOT NULL,
    by TEXT,
    note TEXT)""",

"CREATE INDEX IF NOT EXISTS ix_factor_lookup ON emission_factors(country_code, activity_category, activity, year_from, year_to)",
"CREATE INDEX IF NOT EXISTS ix_rec_period ON activity_records(activity_year, activity_month)",
"CREATE INDEX IF NOT EXISTS ix_rec_company ON activity_records(company_id, facility_id)",
"CREATE INDEX IF NOT EXISTS ix_rec_facility ON activity_records(facility_id, activity_year, activity_month)",
"CREATE INDEX IF NOT EXISTS ix_users_company ON users(company_id, facility_id)",
"CREATE INDEX IF NOT EXISTS ix_submissions_status ON report_submissions(company_id, facility_id, status, period_year, period_month)",
"CREATE UNIQUE INDEX IF NOT EXISTS ux_submissions_active "
"ON report_submissions(facility_id, period_year, IFNULL(period_month, 0)) "
"WHERE status IN ('submitted', 'approved')",
]


def init_db(con: sqlite3.Connection, *, backup: bool = True) -> None:
    """Create/upgrade tables idempotently. Existing rows are never touched."""
    p = db_path()
    existing = p.exists() and p.stat().st_size > 0
    if backup and existing:
        row = None
        try:
            row = con.execute("SELECT value FROM schema_meta WHERE key='schema_version'").fetchone()
        except sqlite3.OperationalError:
            pass
        if row is None or int(row["value"]) < SCHEMA_VERSION:
            backup_file(p, label="pre_migration")
    with transaction(con):
        for stmt in DDL:
            con.execute(stmt)
        con.execute("INSERT OR IGNORE INTO schema_meta VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
        con.execute("INSERT OR IGNORE INTO schema_meta VALUES ('created_at', ?)", (now_iso(),))
