import type { ListenEpisode, ListenState } from '../../src/browser/listen/app-contracts.js';
import type { LearnViewEntity } from '../../src/browser/learn/view-model-contracts.js';

const migrationEpisode: ListenEpisode = { guid: 'episode', url: '/episode.mp3', duration: 300 };
const migrationRssEpisode: ListenEpisode = { guid: 'rss', url: '/rss.mp3', duration: '00:05:00' };
// @ts-expect-error An episode must have its persistent identity and audio URL.
const missingAudio: ListenEpisode = { guid: 'episode' };
// @ts-expect-error Playback progress is numeric, not a formatted time label.
const invalidProgress: Pick<ListenState, 'progress'> = { progress: '00:20' };
const attendanceProjection: LearnViewEntity = { attendance: { summary: { byChild: [{ childId: 'child' }] } } };
// @ts-expect-error Attendance summaries contain child rows, not a label.
const invalidAttendance: LearnViewEntity = { byChild: 'child' };
// @ts-expect-error Academic year totals are numeric.
const invalidViewTotal: LearnViewEntity = { total: '12' };
const sacramentSlot: SacSlotSelection = { date: '2026-10-16', time: '10:00' };
// @ts-expect-error Selected sacrament slots require a time as well as a date.
const invalidSacramentSlot: SacSlotSelection = { date: '2026-10-16' };
void [
  migrationEpisode,
  migrationRssEpisode,
  missingAudio,
  invalidProgress,
  attendanceProjection,
  invalidAttendance,
  invalidViewTotal,
  sacramentSlot,
  invalidSacramentSlot,
];
