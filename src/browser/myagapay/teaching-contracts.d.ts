import type { TeachingWindowApi } from './teaching.js';
export interface TeachingPost {
  id: string;
  title: string;
  category?: string;
  audioUrl?: string;
  audioSource?: string;
  pinned?: boolean;
  read?: boolean;
  body?: string;
  bodyHtml?: string;
  publishedAt?: string;
}
export interface TeachingEpisode {
  episodeKey: string;
  audioUrl: string;
  title: string;
  guid?: string;
  show?: string;
  date?: string;
  duration?: string;
  durationSeconds?: number | null;
  description?: string;
  link?: string;
  image?: string;
  xmlUrl?: string;
  trackProgress?: boolean;
}
export interface TeachingDownload extends TeachingEpisode {
  downloadedAt: string;
}
export interface TeachingPodcast {
  url?: string;
  title?: string;
  artwork?: string;
  image?: string;
  link?: string;
  author?: string;
  category?: string;
}
export interface TeachingShow extends TeachingPodcast {
  url: string;
  episodes: TeachingEpisode[];
}
export interface TeachingSubscription {
  feedUrl: string;
  title?: string;
  artwork?: string;
  website?: string;
  author?: string;
}
export interface TeachingProgress {
  episodeKey: string;
  feedUrl?: string;
  showTitle?: string;
  episodeTitle?: string;
  positionSeconds: number;
  durationSeconds?: number | null;
  updatedAt?: string;
}
export interface TeachingApiPayload {
  error?: string;
  items?: TeachingProgress[];
  playbackRate?: number;
  subscriptions?: TeachingSubscription[];
  subscription?: TeachingSubscription;
  feeds?: TeachingPodcast[];
  posts?: TeachingPost[];
  unreadCount?: number;
  parish?: { name?: string };
}
export interface TeachingPodcastState {
  results: TeachingPodcast[];
  show: TeachingShow | null;
  episodes: TeachingEpisode[];
  hasSearched: boolean;
  requestId: number;
  progressItems: TeachingProgress[];
  progressByKey: Map<string, TeachingProgress>;
  progressLoaded: boolean;
  progressPromise: Promise<TeachingProgress[]> | null;
  playbackRate: number;
  currentEpisode: TeachingEpisode | null;
  queue: TeachingEpisode[];
  saveTimer: number | null;
  switchingEpisode: boolean;
  subscriptions: TeachingSubscription[];
  subscriptionsLoaded: boolean;
  subscriptionsPromise: Promise<TeachingSubscription[]> | null;
  latestEpisodes: TeachingEpisode[];
  libraryView: string;
  expanded: boolean;
  sleepTimer: number | null;
  sleepAtEnd: boolean;
  downloads: TeachingDownload[];
  offlineObjectUrl: string;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- This interface must merge the checked controller API into Window.
  interface Window extends TeachingWindowApi {}
}
