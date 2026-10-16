import type { AudioPlayer } from './player.js';
export interface ListenEpisode {
  guid: string;
  url: string;
  title?: string;
  show?: string;
  xmlUrl?: string;
  duration?: string | number;
  date?: string;
  image?: string;
  description?: string;
  categories?: (string | null | undefined)[];
  likedAt?: number;
  lastPlayedAt?: number;
  position?: number;
  completed?: boolean;
}
export interface ListenSubscription {
  title?: string;
  xmlUrl: string;
  image?: string;
  addedAt?: number;
}
export interface ListenCuratedPodcast {
  title: string;
  author: string;
  category: string;
  description: string;
  url: string;
  image: string;
}
export type ListenCompatiblePlayer = AudioPlayer & {
  setPlaybackRate?: (rate: number) => void;
  audio?: HTMLAudioElement;
  playbackRate?: number;
};
export interface ListenState {
  screen: string;
  subs: ListenSubscription[];
  episodes: ListenEpisode[];
  current: ListenEpisode | null;
  currentShow: ListenSubscription | null;
  queue: ListenEpisode[];
  progress: number;
  playing: boolean;
  searchQuery: string;
  searchResults: ListenSearchFeed[];
  rssSheet: boolean;
  rssUrl: string;
  descriptionSheet: boolean;
  queueSheet: boolean;
  speedSheet: boolean;
  sleepSheet: boolean;
  activeCategory: string;
  playbackSpeed: number;
  history: ListenEpisode[];
  downloaded: Set<string>;
  downloadProgress: Record<string, number>;
  sleepEndsAt: number | null;
  sleepLabel: string;
  toast: string | null;
  liked: Set<string>;
  likedEpisodes: ListenEpisode[];
  downloads: Record<string, string>;
  user: { authenticated: boolean; name: string; initials: string; status: string };
}
export interface ListenSearchFeed {
  url?: string;
  xmlUrl?: string;
  title?: string;
  image?: string;
  artwork?: string;
  author?: string;
  description?: string;
}
