import { PORTABILITY_SCHEMA } from './schema.js';

// Reviewed schema-only remnants found in an older accounting installation.
// These are NOT accounting data and are never exported under parish ownership.
// They are permitted only while empty, and frozen with the books after closure.
// Any row or additional table/column requires an explicit migration review.
const EMPTY_LEGACY_TABLES = new Set(`registrations donors donor_offerings commemorations app_settings stripe_events learn_households learn_children learn_school_years learn_terms learn_liturgical_days learn_household_streams learn_child_tracks learn_lesson_days learn_household_lesson_blocks learn_child_lesson_blocks learn_church_rhythm_practices learn_narration_logs learn_books learn_book_assignments learn_cycle_frameworks learn_cycle_years learn_cycle_topics learn_curriculum_packages learn_household_pace_profiles learn_season_adjustments learn_print_templates learn_print_jobs learn_report_cards learn_transcripts learn_academic_records`.split(' '));
export const accountingLegacyColumns = name => EMPTY_LEGACY_TABLES.has(name) ? PORTABILITY_SCHEMA[name] : null;
