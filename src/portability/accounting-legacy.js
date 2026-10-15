// Generated from src/portability/accounting-legacy.ts by npm run build:server. Do not edit.
import { PORTABILITY_SCHEMA } from './schema.js';
const EMPTY_LEGACY_TABLES = new Set(
  `registrations donors donor_offerings commemorations app_settings stripe_events learn_households learn_children learn_school_years learn_terms learn_liturgical_days learn_household_streams learn_child_tracks learn_lesson_days learn_household_lesson_blocks learn_child_lesson_blocks learn_church_rhythm_practices learn_narration_logs learn_books learn_book_assignments learn_cycle_frameworks learn_cycle_years learn_cycle_topics learn_curriculum_packages learn_household_pace_profiles learn_season_adjustments learn_print_templates learn_print_jobs learn_report_cards learn_transcripts learn_academic_records`.split(
    ' '
  )
);
const accountingLegacyColumns = (name) => (EMPTY_LEGACY_TABLES.has(name) ? PORTABILITY_SCHEMA[name] : null);
export { accountingLegacyColumns };
