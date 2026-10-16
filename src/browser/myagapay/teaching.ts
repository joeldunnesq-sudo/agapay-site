import type { TeachingPresentation as DownloadPresentation } from './teaching-presentation.js';
declare const encodePodcastDownloadHeader: DownloadPresentation['encodePodcastDownloadHeader'];
declare const downloadedKoinoniaEpisode: DownloadPresentation['downloadedKoinoniaEpisode'];
import type { TeachingPresentation } from './teaching-presentation.js';
declare const podcastEpisodeKey: TeachingPresentation['podcastEpisodeKey'];
declare const parseKoinoniaPodcastFeed: TeachingPresentation['parseKoinoniaPodcastFeed'];
declare const podcastTime: TeachingPresentation['podcastTime'];
declare const renderKoinoniaContinueListening: TeachingPresentation['renderKoinoniaContinueListening'];
declare const renderKoinoniaPodcastDownloads: TeachingPresentation['renderKoinoniaPodcastDownloads'];
declare const renderKoinoniaPodcastSubscriptions: TeachingPresentation['renderKoinoniaPodcastSubscriptions'];
declare const renderKoinoniaPodcastLatest: TeachingPresentation['renderKoinoniaPodcastLatest'];
declare const renderKoinoniaPodcastResults: TeachingPresentation['renderKoinoniaPodcastResults'];
declare const renderKoinoniaPodcastShow: TeachingPresentation['renderKoinoniaPodcastShow'];
declare const renderKoinoniaPodcastQueue: TeachingPresentation['renderKoinoniaPodcastQueue'];
declare const renderTeaching: TeachingPresentation['renderTeaching'];
import type {
  TeachingPost,
  TeachingEpisode,
  TeachingDownload,
  TeachingPodcast,
  TeachingProgress,
  TeachingApiPayload,
  TeachingPodcastState,
} from './teaching-contracts.js';
const TEACHING_FILTERS = Object.freeze([
  { value: 'all', label: 'All' },
  { value: 'homilies', label: 'Homilies' },
  { value: 'catechism', label: 'Catechism' },
  { value: 'liturgical', label: 'Liturgical' },
  { value: 'choir', label: 'Choir' },
  { value: 'special_events', label: 'Special Events' },
]);

let teachingState: { posts: TeachingPost[]; unreadCount: number; filter: string } = {
  posts: [],
  unreadCount: 0,
  filter: 'all',
};
const PODCAST_SAVE_INTERVAL_MS = 15000;
const PODCAST_COMPLETE_WINDOW_SECONDS = 5;
const PODCAST_PLAYBACK_RATES = new Set([1, 1.25, 1.5, 1.75, 2]);
const PODCAST_DOWNLOAD_CACHE = 'agapay-podcast-downloads-v1';
const KOINONIA_ICONS = Object.freeze({
  play: '<svg class="koinonia-ui-icon is-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg class="koinonia-ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  audio:
    '<svg class="koinonia-ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
});
function koinoniaIcon(name: keyof typeof KOINONIA_ICONS) {
  return KOINONIA_ICONS[name] || '';
}
// eslint-disable-next-line prefer-const -- Preserve the original writable classic binding.
let koinoniaPodcastState: TeachingPodcastState = {
  results: [],
  show: null,
  episodes: [],
  hasSearched: false,
  requestId: 0,
  progressItems: [],
  progressByKey: new Map(),
  progressLoaded: false,
  progressPromise: null,
  playbackRate: 1,
  currentEpisode: null,
  queue: [],
  saveTimer: null,
  switchingEpisode: false,
  subscriptions: [],
  subscriptionsLoaded: false,
  subscriptionsPromise: null,
  latestEpisodes: [],
  libraryView: 'latest',
  expanded: false,
  sleepTimer: null,
  sleepAtEnd: false,
  downloads: [],
  offlineObjectUrl: '',
};

function setAudioLibraryMode(mode: string = 'parish') {
  const selected = mode === 'podcasts' ? 'podcasts' : 'parish';
  document.querySelectorAll<HTMLElement>('[data-audio-library-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.audioLibraryPane !== selected;
  });
  document.querySelectorAll<HTMLElement>('[data-audio-library-mode]').forEach((button) => {
    const active = button.dataset.audioLibraryMode === selected;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (selected === 'podcasts') {
    void loadKoinoniaPodcastSubscriptions().then(() => loadKoinoniaPodcastLatest());
    if (!koinoniaPodcastState.hasSearched) void runKoinoniaPodcastSearch('Orthodox');
  }
}

async function openRequestedKoinoniaPodcastEpisode() {
  const parameters = new URLSearchParams(window.location.search);
  const feedUrl = parameters.get('feed') || '';
  const episodeKey = parameters.get('episode') || '';
  if (!feedUrl || !episodeKey) return false;
  const status = document.getElementById('koinoniaPodcastLatestStatus');
  if (status) status.textContent = 'Opening your selected episode…';
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(feedUrl)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('That podcast feed is unavailable right now.');
    const parsed = parseKoinoniaPodcastFeed(await response.text(), feedUrl);
    const episode = parsed.episodes.find((item) => item.episodeKey === episodeKey);
    if (!episode) throw new Error('That episode is no longer present in the podcast feed.');
    await playKoinoniaPodcast(episode);
    return true;
  } catch (error) {
    if (status) status.textContent = (error as Error).message || 'Unable to open that episode.';
    return false;
  }
}

async function loadKoinoniaPodcastProgress(force: boolean = false) {
  if (koinoniaPodcastState.progressLoaded && !force) return koinoniaPodcastState.progressItems;
  if (koinoniaPodcastState.progressPromise && !force) return koinoniaPodcastState.progressPromise;
  const request = (async () => {
    const response = await fetch('/api/listen/progress', { headers: teachingHeaders(), cache: 'no-store' });
    if (response.status === 401) return [];
    const data = (await response.json().catch(() => ({}))) as TeachingApiPayload;
    if (!response.ok) throw new Error(data.error || 'Unable to load listening progress.');
    koinoniaPodcastState.progressItems = Array.isArray(data.items) ? data.items : [];
    koinoniaPodcastState.progressByKey = new Map(
      koinoniaPodcastState.progressItems.map((item) => [item.episodeKey, item])
    );
    const rate = Number(data.playbackRate);
    koinoniaPodcastState.playbackRate = PODCAST_PLAYBACK_RATES.has(rate) ? rate : 1;
    koinoniaPodcastState.progressLoaded = true;
    const speed = document.getElementById('koinoniaPodcastSpeed') as HTMLSelectElement | null;
    if (speed) speed.value = String(koinoniaPodcastState.playbackRate);
    const fullSpeed = document.getElementById('koinoniaPodcastFullSpeed') as HTMLSelectElement | null;
    if (fullSpeed) fullSpeed.value = String(koinoniaPodcastState.playbackRate);
    renderKoinoniaContinueListening();
    return koinoniaPodcastState.progressItems;
  })()
    .catch(() => {
      koinoniaPodcastState.progressLoaded = true;
      renderKoinoniaContinueListening();
      return [];
    })
    .finally(() => {
      koinoniaPodcastState.progressPromise = null;
    });
  koinoniaPodcastState.progressPromise = request;
  return request;
}

function setKoinoniaPodcastLibraryView(view: string = 'latest') {
  const selected = ['latest', 'subscriptions', 'discover', 'downloads'].includes(view) ? view : 'latest';
  koinoniaPodcastState.libraryView = selected;
  document.querySelectorAll<HTMLElement>('[data-podcast-library-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.podcastLibraryPane !== selected;
  });
  document
    .querySelectorAll<HTMLElement>('[data-podcast-library-view]')
    .forEach((button) => button.classList.toggle('is-active', button.dataset.podcastLibraryView === selected));
  if (selected === 'latest') void loadKoinoniaPodcastLatest();
  if (selected === 'subscriptions') void loadKoinoniaPodcastSubscriptions().then(renderKoinoniaPodcastSubscriptions);
  if (selected === 'discover' && !koinoniaPodcastState.hasSearched) void runKoinoniaPodcastSearch('Orthodox');
  if (selected === 'downloads') void renderKoinoniaPodcastDownloads();
}

function podcastOfflineRequest(episode: TeachingEpisode | undefined) {
  const key = podcastEpisodeKey(episode?.episodeKey, episode?.audioUrl);
  return new Request(`${window.location.origin}/myagapay/offline-podcast?episode=${encodeURIComponent(key)}`);
}

async function cachedKoinoniaPodcast(episode: TeachingEpisode | undefined) {
  if (!('caches' in window) || !episode) return null;
  const cache = await caches.open(PODCAST_DOWNLOAD_CACHE);
  return cache.match(podcastOfflineRequest(episode));
}

async function loadKoinoniaPodcastDownloads() {
  if (!('caches' in window)) return [];
  const cache = await caches.open(PODCAST_DOWNLOAD_CACHE);
  const requests = await cache.keys();
  const items = await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request);
      return response ? downloadedKoinoniaEpisode(response, request) : null;
    })
  );
  koinoniaPodcastState.downloads = (items.filter(Boolean) as TeachingDownload[]).sort((a, b) =>
    b.downloadedAt.localeCompare(a.downloadedAt)
  );
  return koinoniaPodcastState.downloads;
}

async function playDownloadedKoinoniaPodcast(index: number) {
  const episode = koinoniaPodcastState.downloads[index];
  if (episode) await playKoinoniaPodcast(episode);
}

async function removeDownloadedKoinoniaPodcast(index: number) {
  const episode = koinoniaPodcastState.downloads[index];
  if (!episode || !('caches' in window)) return;
  const cache = await caches.open(PODCAST_DOWNLOAD_CACHE);
  await cache.delete(podcastOfflineRequest(episode));
  await renderKoinoniaPodcastDownloads();
  await updateKoinoniaPodcastDownloadAction();
}

function koinoniaPodcastIsSubscribed(feedUrl: string) {
  return koinoniaPodcastState.subscriptions.some((item) => item.feedUrl === feedUrl);
}

async function loadKoinoniaPodcastSubscriptions(force: boolean = false) {
  if (koinoniaPodcastState.subscriptionsLoaded && !force) return koinoniaPodcastState.subscriptions;
  if (koinoniaPodcastState.subscriptionsPromise && !force) return koinoniaPodcastState.subscriptionsPromise;
  const request = fetch('/api/listen/subscriptions', { headers: teachingHeaders(), cache: 'no-store' })
    .then(async (response) => {
      if (response.status === 401) return { subscriptions: [] };
      const data = (await response.json().catch(() => ({}))) as TeachingApiPayload;
      if (!response.ok) throw new Error(data.error || 'Unable to load podcast subscriptions.');
      return data;
    })
    .then((data) => {
      koinoniaPodcastState.subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
      koinoniaPodcastState.subscriptionsLoaded = true;
      renderKoinoniaPodcastSubscriptions();
      renderKoinoniaPodcastResults();
      return koinoniaPodcastState.subscriptions;
    })
    .catch(() => {
      koinoniaPodcastState.subscriptionsLoaded = true;
      renderKoinoniaPodcastSubscriptions();
      return [];
    })
    .finally(() => {
      koinoniaPodcastState.subscriptionsPromise = null;
    });
  koinoniaPodcastState.subscriptionsPromise = request;
  return request;
}

async function loadKoinoniaPodcastLatest(force: boolean = false) {
  const status = document.getElementById('koinoniaPodcastLatestStatus');
  await loadKoinoniaPodcastSubscriptions(force);
  if (!koinoniaPodcastState.subscriptions.length) {
    koinoniaPodcastState.latestEpisodes = [];
    renderKoinoniaPodcastLatest();
    return [];
  }
  if (!force && koinoniaPodcastState.latestEpisodes.length) {
    renderKoinoniaPodcastLatest();
    return koinoniaPodcastState.latestEpisodes;
  }
  if (status) status.textContent = 'Checking your subscriptions for new episodes…';
  const results = await Promise.allSettled(
    koinoniaPodcastState.subscriptions.slice(0, 30).map(async (subscription) => {
      const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(subscription.feedUrl)}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Feed unavailable');
      const parsed = parseKoinoniaPodcastFeed(await response.text(), subscription.feedUrl);
      return parsed.episodes
        .slice(0, 8)
        .map((episode) => ({ ...episode, image: episode.image || subscription.artwork }));
    })
  );
  koinoniaPodcastState.latestEpisodes = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0))
    .slice(0, 60);
  renderKoinoniaPodcastLatest();
  return koinoniaPodcastState.latestEpisodes;
}

function playKoinoniaPodcastLatestEpisode(index: number) {
  return playKoinoniaPodcast(koinoniaPodcastState.latestEpisodes[index]);
}
function queueKoinoniaPodcastLatestEpisode(index: number) {
  return queueKoinoniaPodcast(koinoniaPodcastState.latestEpisodes[index]);
}

async function subscribeKoinoniaPodcast() {
  const show = koinoniaPodcastState.show;
  if (!show?.url) return;
  const response = await fetch('/api/listen/subscriptions', {
    method: 'POST',
    headers: teachingHeaders(),
    body: JSON.stringify({
      feedUrl: show.url,
      title: show.title,
      artwork: show.image || show.artwork,
      website: show.link,
      author: show.author,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as TeachingApiPayload;
  if (!response.ok) {
    alert(data.error || 'Unable to subscribe to this podcast.');
    return;
  }
  koinoniaPodcastState.subscriptions = [
    data.subscription!,
    ...koinoniaPodcastState.subscriptions.filter((item) => item.feedUrl !== data.subscription!.feedUrl),
  ];
  koinoniaPodcastState.latestEpisodes = [];
  renderKoinoniaPodcastSubscriptions();
  renderKoinoniaPodcastShow();
  void loadKoinoniaPodcastLatest(true);
}

async function unsubscribeKoinoniaPodcast(feedUrl: string = '') {
  if (!feedUrl) return;
  const response = await fetch(`/api/listen/subscriptions?url=${encodeURIComponent(feedUrl)}`, {
    method: 'DELETE',
    headers: teachingHeaders(),
  });
  if (!response.ok) return;
  koinoniaPodcastState.subscriptions = koinoniaPodcastState.subscriptions.filter((item) => item.feedUrl !== feedUrl);
  koinoniaPodcastState.latestEpisodes = [];
  renderKoinoniaPodcastSubscriptions();
  renderKoinoniaPodcastShow();
  void loadKoinoniaPodcastLatest(true);
}

function unsubscribeKoinoniaPodcastByIndex(index: number) {
  const podcast = koinoniaPodcastState.subscriptions[index];
  if (podcast) void unsubscribeKoinoniaPodcast(podcast.feedUrl);
}

async function runKoinoniaPodcastSearch(query: string, button: HTMLButtonElement | null = null) {
  const status = document.getElementById('koinoniaPodcastStatus');
  const target = document.getElementById('koinoniaPodcastResults');
  if (!query || !status || !target) return;
  const requestId = ++koinoniaPodcastState.requestId;
  koinoniaPodcastState.hasSearched = true;
  if (button) button.disabled = true;
  status.dataset.tone = 'loading';
  status.textContent = 'Searching the podcast directory…';
  target.setAttribute('aria-busy', 'true');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/listen/search?q=${encodeURIComponent(query)}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as TeachingApiPayload;
    if (!response.ok || data.error) throw new Error(data.error || 'Podcast search is temporarily unavailable.');
    if (requestId !== koinoniaPodcastState.requestId) return;
    koinoniaPodcastState.results = data.feeds || [];
    status.dataset.tone = koinoniaPodcastState.results.length ? 'success' : 'empty';
    status.textContent = koinoniaPodcastState.results.length
      ? `${koinoniaPodcastState.results.length} podcasts found`
      : 'No podcasts matched that search.';
    document.getElementById('koinoniaPodcastShow')!.hidden = true;
    renderKoinoniaPodcastResults();
  } catch (error) {
    if (requestId !== koinoniaPodcastState.requestId) return;
    koinoniaPodcastState.results = [];
    renderKoinoniaPodcastResults();
    status.dataset.tone = 'error';
    status.textContent =
      (error as Error).name === 'AbortError'
        ? 'Podcast search took too long. Please try again.'
        : (error as Error).message || 'Podcast search is temporarily unavailable.';
  } finally {
    window.clearTimeout(timeout);
    target.setAttribute('aria-busy', 'false');
    if (button) button.disabled = false;
  }
}

async function searchKoinoniaPodcasts(event: SubmitEvent) {
  event.preventDefault();
  const query = (document.getElementById('koinoniaPodcastQuery') as HTMLInputElement | null)?.value.trim() || '';
  const button = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]');
  await runKoinoniaPodcastSearch(query, button);
}

async function importKoinoniaPodcastFeed(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const input = document.getElementById('koinoniaPodcastRssUrl') as HTMLInputElement | null;
  const status = document.getElementById('koinoniaPodcastRssStatus');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const feedUrl = input?.value.trim() || '';
  if (!feedUrl || !status || !button) return;
  button.disabled = true;
  status.dataset.tone = 'loading';
  status.textContent = 'Reading podcast feed…';
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(feedUrl)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('That RSS feed could not be reached.');
    const parsed = parseKoinoniaPodcastFeed(await response.text(), feedUrl);
    if (!parsed.episodes.length) throw new Error('That feed does not contain playable podcast episodes.');
    const subscriptionResponse = await fetch('/api/listen/subscriptions', {
      method: 'POST',
      headers: teachingHeaders(),
      body: JSON.stringify({ feedUrl, title: parsed.title, artwork: parsed.image }),
    });
    const data = (await subscriptionResponse.json().catch(() => ({}))) as TeachingApiPayload;
    if (!subscriptionResponse.ok) throw new Error(data.error || 'Unable to add this podcast.');
    koinoniaPodcastState.subscriptions = [
      data.subscription!,
      ...koinoniaPodcastState.subscriptions.filter((item) => item.feedUrl !== data.subscription!.feedUrl),
    ];
    koinoniaPodcastState.subscriptionsLoaded = true;
    koinoniaPodcastState.latestEpisodes = [];
    koinoniaPodcastState.show = { ...parsed, url: feedUrl };
    koinoniaPodcastState.episodes = parsed.episodes;
    renderKoinoniaPodcastSubscriptions();
    renderKoinoniaPodcastShow();
    status.dataset.tone = 'success';
    status.textContent = `${parsed.title} was added to your library.`;
    input!.value = '';
    void loadKoinoniaPodcastLatest(true);
  } catch (error) {
    status.dataset.tone = 'error';
    status.textContent = (error as Error).message || 'Unable to import that RSS feed.';
  } finally {
    button.disabled = false;
  }
}

function unsubscribeKoinoniaPodcastByFeed() {
  if (koinoniaPodcastState.show?.url) void unsubscribeKoinoniaPodcast(koinoniaPodcastState.show.url);
}

async function loadKoinoniaPodcastShow(podcast: TeachingPodcast) {
  const status = document.getElementById('koinoniaPodcastStatus');
  if (!podcast?.url) return;
  status!.textContent = `Loading ${podcast.title || 'podcast'}…`;
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(podcast.url)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('This podcast feed is temporarily unavailable.');
    const parsed = parseKoinoniaPodcastFeed(await response.text(), podcast.url);
    koinoniaPodcastState.show = { ...podcast, ...parsed, url: podcast.url };
    koinoniaPodcastState.episodes = parsed.episodes;
    renderKoinoniaPodcastShow();
    status!.textContent = '';
    document.getElementById('koinoniaPodcastShow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    status!.textContent = (error as Error).message || 'This podcast feed is temporarily unavailable.';
  }
}

async function openKoinoniaPodcast(index: number) {
  return loadKoinoniaPodcastShow(koinoniaPodcastState.results[index]);
}

async function openKoinoniaSubscribedPodcast(index: number) {
  const podcast = koinoniaPodcastState.subscriptions[index];
  if (!podcast) return;
  setKoinoniaPodcastLibraryView('discover');
  return loadKoinoniaPodcastShow({ ...podcast, url: podcast.feedUrl, link: podcast.website });
}

function waitForPodcastMetadata(audio: HTMLAudioElement) {
  if (audio.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      audio.removeEventListener('loadedmetadata', finish);
      audio.removeEventListener('error', finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 10000);
    audio.addEventListener('loadedmetadata', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
  });
}

async function playKoinoniaPodcast(episode: TeachingEpisode | undefined) {
  const player = document.getElementById('koinoniaPodcastPlayer');
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  if (!episode || !player || !audio) return;
  await loadKoinoniaPodcastProgress();
  if (koinoniaPodcastState.currentEpisode && koinoniaPodcastState.currentEpisode.episodeKey !== episode.episodeKey)
    void saveKoinoniaPodcastProgress();
  koinoniaPodcastState.switchingEpisode = true;
  audio.pause();
  koinoniaPodcastState.currentEpisode = episode;
  document.getElementById('koinoniaPodcastPlayerTitle')!.textContent = episode.title;
  document.getElementById('koinoniaPodcastPlayerShow')!.textContent = episode.show || 'Orthodox Podcast';
  document.getElementById('koinoniaPodcastPlayerDescription')!.textContent =
    episode.description || 'Listen now, save your place automatically, or add another episode to Up Next.';
  document.getElementById('koinoniaPodcastDetailsTitle')!.textContent = episode.title;
  document.getElementById('koinoniaPodcastFullTitle')!.textContent = episode.title;
  document.getElementById('koinoniaPodcastFullShow')!.textContent = episode.show || 'Orthodox Podcast';
  const image = document.getElementById('koinoniaPodcastPlayerImage') as HTMLImageElement | null;
  image!.src = episode.image || '/listen/images/app/icon-192.png';
  image!.alt = episode.show ? `${episode.show} artwork` : 'Podcast artwork';
  const fullImage = document.getElementById('koinoniaPodcastFullImage') as HTMLImageElement | null;
  fullImage!.src = image!.src;
  fullImage!.alt = image!.alt;
  player.hidden = false;
  if (koinoniaPodcastState.offlineObjectUrl) {
    URL.revokeObjectURL(koinoniaPodcastState.offlineObjectUrl);
    koinoniaPodcastState.offlineObjectUrl = '';
  }
  const offlineResponse = await cachedKoinoniaPodcast(episode).catch(() => null);
  if (offlineResponse) {
    koinoniaPodcastState.offlineObjectUrl = URL.createObjectURL(await offlineResponse.blob());
    audio.src = koinoniaPodcastState.offlineObjectUrl;
  } else {
    audio.src = episode.audioUrl;
  }
  audio.playbackRate = koinoniaPodcastState.playbackRate;
  audio.load();
  await waitForPodcastMetadata(audio);
  audio.playbackRate = koinoniaPodcastState.playbackRate;
  const saved = koinoniaPodcastState.progressByKey.get(episode.episodeKey);
  const duration = Number.isFinite(audio.duration)
    ? audio.duration
    : Number(saved?.durationSeconds || episode.durationSeconds || 0);
  const savedPosition = Number(saved?.positionSeconds) || 0;
  if (savedPosition > 0 && (!duration || savedPosition < duration - PODCAST_COMPLETE_WINDOW_SECONDS))
    audio.currentTime = savedPosition;
  koinoniaPodcastState.switchingEpisode = false;
  try {
    await audio.play();
  } catch {
    /* Browser may require a second explicit play gesture. */
  }
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: episode.title,
        artist: 'AGAPAY Audio',
        album: episode.show || 'Koinonia Audio Library',
        artwork: [{ src: image!.src, sizes: '192x192' }],
      });
    } catch {
      /* Metadata is optional. */
    }
  }
  await updateKoinoniaPodcastDownloadAction();
  updateKoinoniaPodcastActions();
  updateKoinoniaPodcastPlayer();
}

async function playKoinoniaPodcastEpisode(index: number) {
  return playKoinoniaPodcast(koinoniaPodcastState.episodes[index]);
}

function queueKoinoniaPodcast(episode: TeachingEpisode | undefined) {
  if (!episode || koinoniaPodcastState.queue.some((item) => item.episodeKey === episode.episodeKey)) return;
  koinoniaPodcastState.queue.push(episode);
  if (koinoniaPodcastState.queue.length > 25) koinoniaPodcastState.queue.shift();
  renderKoinoniaPodcastQueue();
}

function queueKoinoniaPodcastEpisode(index: number) {
  return queueKoinoniaPodcast(koinoniaPodcastState.episodes[index]);
}
function removeQueuedKoinoniaPodcast(index: number) {
  koinoniaPodcastState.queue.splice(index, 1);
  renderKoinoniaPodcastQueue();
}
function clearKoinoniaPodcastQueue() {
  koinoniaPodcastState.queue = [];
  renderKoinoniaPodcastQueue();
}
function playQueuedKoinoniaPodcast(index: number) {
  const episode = koinoniaPodcastState.queue.splice(index, 1)[0];
  renderKoinoniaPodcastQueue();
  if (episode) void playKoinoniaPodcast(episode);
}

function updateKoinoniaPodcastActions() {
  const episode = koinoniaPodcastState.currentEpisode;
  const original = document.getElementById('koinoniaPodcastOriginalLink') as HTMLAnchorElement | null;
  if (original) {
    original.hidden = !episode?.link;
    if (episode?.link) original.href = episode.link;
    else original.removeAttribute('href');
  }
}

function toggleKoinoniaPodcastActions(force?: boolean) {
  const menu = document.getElementById('koinoniaPodcastActionsMenu');
  const toggle = document.getElementById('koinoniaPodcastActionsToggle');
  if (!menu || !toggle) return;
  const open = typeof force === 'boolean' ? force : menu.hidden;
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
    toggleKoinoniaPodcastDetails(false);
    toggleKoinoniaPodcastQueue(false);
    void updateKoinoniaPodcastDownloadAction();
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }
}

function openKoinoniaPodcastDetailsFromMenu() {
  toggleKoinoniaPodcastActions(false);
  toggleKoinoniaPodcastDetails(true);
}

function restartKoinoniaPodcast() {
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  if (!audio?.src) return;
  audio.currentTime = 0;
  void audio.play();
  toggleKoinoniaPodcastActions(false);
}

async function copyKoinoniaPodcastLink() {
  const episode = koinoniaPodcastState.currentEpisode;
  const status = document.getElementById('koinoniaPodcastActionStatus');
  const link = episode?.link || episode?.audioUrl;
  if (!link) return;
  const copied = await navigator.clipboard
    ?.writeText(link)
    .then(() => true)
    .catch(() => false);
  if (status) status.textContent = copied ? 'Link copied to clipboard' : 'Your browser could not copy the link';
}

async function shareKoinoniaPodcastFromMenu() {
  await shareKoinoniaPodcastEpisode();
  toggleKoinoniaPodcastActions(false);
}

async function updateKoinoniaPodcastDownloadAction() {
  const button = document.getElementById('koinoniaPodcastDownloadAction') as HTMLButtonElement | null;
  const episode = koinoniaPodcastState.currentEpisode;
  if (!button || !episode) return;
  const downloaded = Boolean(await cachedKoinoniaPodcast(episode).catch(() => null));
  button.dataset.downloaded = String(downloaded);
  const copy = button.querySelector('b');
  if (copy)
    copy.innerHTML = downloaded
      ? 'Remove download<small>Free storage on this device</small>'
      : 'Download episode<small>Play it offline on this device</small>';
}

async function toggleKoinoniaPodcastDownload() {
  const episode = koinoniaPodcastState.currentEpisode;
  const button = document.getElementById('koinoniaPodcastDownloadAction') as HTMLButtonElement | null;
  const status = document.getElementById('koinoniaPodcastActionStatus');
  if (!episode || !button || !('caches' in window)) {
    if (status) status.textContent = 'Offline downloads are unavailable in this browser';
    return;
  }
  button.disabled = true;
  const cache = await caches.open(PODCAST_DOWNLOAD_CACHE);
  const request = podcastOfflineRequest(episode);
  try {
    if (await cache.match(request)) {
      await cache.delete(request);
      if (status) status.textContent = 'Download removed from this device';
    } else {
      if (!navigator.onLine) throw new Error('Connect to the internet before downloading an episode.');
      if (status) status.textContent = 'Downloading… keep My AGAPAY open';
      const response = await fetch(`/api/listen/audio?url=${encodeURIComponent(episode.audioUrl)}`, {
        headers: teachingHeaders(),
        cache: 'no-store',
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as TeachingApiPayload;
        throw new Error(payload.error || 'Unable to download this episode.');
      }
      const headers = new Headers(response.headers);
      headers.set('X-AGAPAY-Episode-Key', encodePodcastDownloadHeader(episode.episodeKey));
      headers.set('X-AGAPAY-Episode-Title', encodePodcastDownloadHeader(episode.title, 500));
      headers.set('X-AGAPAY-Show-Title', encodePodcastDownloadHeader(episode.show, 300));
      headers.set('X-AGAPAY-Audio-URL', encodePodcastDownloadHeader(episode.audioUrl));
      headers.set('X-AGAPAY-Episode-Link', encodePodcastDownloadHeader(episode.link));
      headers.set('X-AGAPAY-Episode-Image', encodePodcastDownloadHeader(episode.image));
      headers.set('X-AGAPAY-Feed-URL', encodePodcastDownloadHeader(episode.xmlUrl));
      headers.set('X-AGAPAY-Description', encodePodcastDownloadHeader(episode.description, 1800));
      headers.set('X-AGAPAY-Downloaded-At', new Date().toISOString());
      await cache.put(request, new Response(response.body, { status: 200, headers }));
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
      if (status) status.textContent = 'Downloaded — ready to play offline';
    }
    await renderKoinoniaPodcastDownloads();
    await updateKoinoniaPodcastDownloadAction();
  } catch (error) {
    if (status) status.textContent = (error as Error).message || 'Unable to save this episode for offline listening.';
  } finally {
    button.disabled = false;
  }
}

function toggleKoinoniaPodcastPlayerExpanded(force?: boolean) {
  const player = document.getElementById('koinoniaPodcastPlayer');
  if (!player || player.hidden) return;
  const expanded = typeof force === 'boolean' ? force : !player.classList.contains('is-expanded');
  player.classList.toggle('is-expanded', expanded);
  document.body.classList.toggle('podcast-player-expanded', expanded);
  player.querySelector('.koinonia-podcast-full-player')?.setAttribute('aria-hidden', String(!expanded));
  koinoniaPodcastState.expanded = expanded;
  const button = document.getElementById('koinoniaPodcastExpand');
  if (button) button.setAttribute('aria-label', expanded ? 'Close expanded player' : 'Open expanded player');
  if (!expanded) {
    toggleKoinoniaPodcastActions(false);
    toggleKoinoniaPodcastDetails(false);
    toggleKoinoniaPodcastQueue(false);
  }
}

function toggleKoinoniaPodcastDetails(force?: boolean) {
  const drawer = document.getElementById('koinoniaPodcastDetailsDrawer');
  const queue = document.getElementById('koinoniaPodcastQueueDrawer');
  if (!drawer) return;
  const open = typeof force === 'boolean' ? force : drawer.hidden;
  drawer.hidden = !open;
  if (open) {
    if (queue) queue.hidden = true;
    toggleKoinoniaPodcastActions(false);
  }
}

function toggleKoinoniaPodcastQueue(force?: boolean) {
  const drawer = document.getElementById('koinoniaPodcastQueueDrawer');
  const details = document.getElementById('koinoniaPodcastDetailsDrawer');
  if (!drawer) return;
  const open = typeof force === 'boolean' ? force : drawer.hidden;
  drawer.hidden = !open;
  if (open) {
    if (details) details.hidden = true;
    toggleKoinoniaPodcastActions(false);
  }
}

function setKoinoniaPodcastSleepTimer(value: unknown) {
  window.clearTimeout(koinoniaPodcastState.sleepTimer as number);
  koinoniaPodcastState.sleepTimer = null;
  koinoniaPodcastState.sleepAtEnd = value === 'end';
  const minutes = Number(value);
  if (Number.isFinite(minutes) && minutes > 0) {
    koinoniaPodcastState.sleepTimer = window.setTimeout(
      () => {
        (document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null)?.pause();
        koinoniaPodcastState.sleepTimer = null;
        const select = document.getElementById('koinoniaPodcastSleepTimer') as HTMLSelectElement | null;
        if (select) select.value = '0';
      },
      minutes * 60 * 1000
    );
  }
}

async function shareKoinoniaPodcastEpisode() {
  const episode = koinoniaPodcastState.currentEpisode;
  if (!episode) return;
  const button = document.getElementById('koinoniaPodcastShare');
  const data = {
    title: episode.title,
    text: `${episode.title} — ${episode.show || 'Orthodox Podcast'}`,
    url: episode.link || episode.audioUrl,
  };
  if (navigator.share) {
    await navigator.share(data).catch(() => {});
    return;
  }
  const copied = await navigator.clipboard
    ?.writeText(data.url)
    .then(() => true)
    .catch(() => false);
  if (copied && button) {
    button.textContent = 'Link copied';
    window.setTimeout(() => {
      button.innerHTML = '<span aria-hidden="true">↗</span> Share episode';
    }, 1600);
  }
}

async function resumeKoinoniaPodcastProgress(index: number) {
  const saved = koinoniaPodcastState.progressItems[index];
  const status = document.getElementById('koinoniaPodcastStatus');
  if (!saved) return;
  if (status) status.textContent = `Loading ${saved.episodeTitle || 'episode'}…`;
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(saved.feedUrl!)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('This podcast feed is temporarily unavailable.');
    const parsed = parseKoinoniaPodcastFeed(await response.text(), saved.feedUrl!);
    const episode = parsed.episodes.find((item) => item.episodeKey === saved.episodeKey);
    if (!episode) throw new Error('That episode is no longer available in its podcast feed.');
    if (status) status.textContent = '';
    await playKoinoniaPodcast(episode);
  } catch (error) {
    if (status) status.textContent = (error as Error).message || 'Unable to resume this episode.';
  }
}

function podcastProgressPayload(completed: boolean = false) {
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  const episode = koinoniaPodcastState.currentEpisode;
  if (!audio || !episode || episode.trackProgress === false) return null;
  const duration = Number.isFinite(audio.duration) ? audio.duration : Number(episode.durationSeconds || 0);
  return {
    episodeKey: episode.episodeKey,
    feedUrl: episode.xmlUrl,
    showTitle: episode.show || 'Orthodox Podcast',
    episodeTitle: episode.title || 'Untitled episode',
    positionSeconds: completed ? Math.max(audio.currentTime, duration || 0) : audio.currentTime,
    durationSeconds: duration || null,
    playbackRate: koinoniaPodcastState.playbackRate,
    completed,
  };
}

async function saveKoinoniaPodcastProgress({
  completed = false,
  keepalive = false,
}: { completed?: boolean; keepalive?: boolean } = {}) {
  const payload = podcastProgressPayload(completed);
  if (!payload || (!completed && payload.positionSeconds < 1)) return;
  const request = fetch('/api/listen/progress', {
    method: 'POST',
    headers: teachingHeaders(),
    body: JSON.stringify(payload),
    keepalive,
  })
    .then(async (response) => {
      if (!response.ok) return;
      if (completed) {
        koinoniaPodcastState.progressByKey.delete(payload.episodeKey);
        koinoniaPodcastState.progressItems = koinoniaPodcastState.progressItems.filter(
          (item) => item.episodeKey !== payload.episodeKey
        );
      } else {
        const item: TeachingProgress & { playbackRate?: number; completed?: boolean } = {
          ...payload,
          updatedAt: new Date().toISOString(),
        };
        delete item.playbackRate;
        delete item.completed;
        koinoniaPodcastState.progressByKey.set(payload.episodeKey, item);
        koinoniaPodcastState.progressItems = [
          item,
          ...koinoniaPodcastState.progressItems.filter((entry) => entry.episodeKey !== payload.episodeKey),
        ];
      }
      renderKoinoniaContinueListening();
    })
    .catch(() => {});
  if (keepalive) {
    void request;
    return;
  }
  await request;
}

async function saveKoinoniaPodcastPlaybackRate() {
  await fetch('/api/listen/progress', {
    method: 'POST',
    headers: teachingHeaders(),
    body: JSON.stringify({ playbackRate: koinoniaPodcastState.playbackRate, preferenceOnly: true }),
  }).catch(() => {});
}

function startKoinoniaPodcastSaveTimer() {
  window.clearInterval(koinoniaPodcastState.saveTimer as number);
  koinoniaPodcastState.saveTimer = window.setInterval(() => {
    void saveKoinoniaPodcastProgress();
  }, PODCAST_SAVE_INTERVAL_MS);
}

function stopKoinoniaPodcastSaveTimer() {
  window.clearInterval(koinoniaPodcastState.saveTimer as number);
  koinoniaPodcastState.saveTimer = null;
}

function updateKoinoniaPodcastPlayer() {
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  const progress = document.getElementById('koinoniaPodcastProgress') as HTMLInputElement | null;
  const time = document.getElementById('koinoniaPodcastTime');
  const toggle = document.getElementById('koinoniaPodcastPlayToggle');
  const fullToggle = document.getElementById('koinoniaPodcastFullPlayToggle');
  const fullProgress = document.getElementById('koinoniaPodcastFullProgress') as HTMLInputElement | null;
  if (!audio || !progress || !time || !toggle) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const progressPercent = duration ? Math.min(100, Math.max(0, (audio.currentTime / duration) * 100)) : 0;
  const progressValue = String(Math.round(progressPercent * 10));
  progress.value = progressValue;
  progress.style.setProperty('--podcast-progress', `${progressPercent}%`);
  if (fullProgress) fullProgress.value = progressValue;
  time.textContent = `${podcastTime(audio.currentTime)} / ${podcastTime(duration)}`;
  toggle.innerHTML = koinoniaIcon(audio.paused ? 'play' : 'pause');
  toggle.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  if (fullToggle) {
    fullToggle.innerHTML = koinoniaIcon(audio.paused ? 'play' : 'pause');
    fullToggle.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }
  const elapsed = document.getElementById('koinoniaPodcastElapsed');
  const remaining = document.getElementById('koinoniaPodcastRemaining');
  if (elapsed) elapsed.textContent = podcastTime(audio.currentTime);
  if (remaining) remaining.textContent = `-${podcastTime(Math.max(0, duration - audio.currentTime))}`;
}

function toggleKoinoniaPodcastPlayback() {
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  if (!audio?.src) return;
  if (audio.paused) void audio.play();
  else audio.pause();
}

function skipKoinoniaPodcast(seconds: number) {
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  if (!audio?.src) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_SAFE_INTEGER;
  audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + Number(seconds || 0)));
}

function bindKoinoniaPodcastPlayer() {
  const audio = document.getElementById('koinoniaPodcastAudio') as HTMLAudioElement | null;
  const progress = document.getElementById('koinoniaPodcastProgress') as HTMLInputElement | null;
  const speed = document.getElementById('koinoniaPodcastSpeed') as HTMLSelectElement | null;
  const fullProgress = document.getElementById('koinoniaPodcastFullProgress') as HTMLInputElement | null;
  const fullSpeed = document.getElementById('koinoniaPodcastFullSpeed') as HTMLSelectElement | null;
  if (!audio || !progress || !speed) return;
  audio.addEventListener('play', () => {
    startKoinoniaPodcastSaveTimer();
    updateKoinoniaPodcastPlayer();
  });
  audio.addEventListener('pause', () => {
    stopKoinoniaPodcastSaveTimer();
    updateKoinoniaPodcastPlayer();
    if (!koinoniaPodcastState.switchingEpisode && !audio.ended) void saveKoinoniaPodcastProgress();
  });
  audio.addEventListener('timeupdate', updateKoinoniaPodcastPlayer);
  audio.addEventListener('loadedmetadata', updateKoinoniaPodcastPlayer);
  audio.addEventListener('seeked', () => {
    updateKoinoniaPodcastPlayer();
    void saveKoinoniaPodcastProgress();
  });
  audio.addEventListener('ended', async () => {
    stopKoinoniaPodcastSaveTimer();
    await saveKoinoniaPodcastProgress({ completed: true });
    if (koinoniaPodcastState.sleepAtEnd) {
      koinoniaPodcastState.sleepAtEnd = false;
      const sleep = document.getElementById('koinoniaPodcastSleepTimer') as HTMLSelectElement | null;
      if (sleep) sleep.value = '0';
      return;
    }
    const next = koinoniaPodcastState.queue.shift();
    renderKoinoniaPodcastQueue();
    if (next) await playKoinoniaPodcast(next);
  });
  progress.addEventListener('change', () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
  });
  fullProgress?.addEventListener('change', () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(fullProgress.value) / 1000) * audio.duration;
  });
  const changePlaybackRate = (event: Event) => {
    const rate = Number((event.currentTarget as HTMLSelectElement).value);
    if (!PODCAST_PLAYBACK_RATES.has(rate)) return;
    koinoniaPodcastState.playbackRate = rate;
    audio.playbackRate = rate;
    speed.value = String(rate);
    if (fullSpeed) fullSpeed.value = String(rate);
    void saveKoinoniaPodcastPlaybackRate();
    void saveKoinoniaPodcastProgress();
  };
  speed.addEventListener('change', changePlaybackRate);
  fullSpeed?.addEventListener('change', changePlaybackRate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveKoinoniaPodcastProgress({ keepalive: true });
  });
  window.addEventListener('pagehide', () => {
    void saveKoinoniaPodcastProgress({ keepalive: true });
    koinoniaPodcastState.queue = [];
  });
  window.addEventListener('beforeunload', () => {
    void saveKoinoniaPodcastProgress({ keepalive: true });
    koinoniaPodcastState.queue = [];
  });
  document.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('.koinonia-player-actions')) toggleKoinoniaPodcastActions(false);
  });
  document
    .getElementById('koinoniaPodcastOriginalLink')
    ?.addEventListener('click', () => toggleKoinoniaPodcastActions(false));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !koinoniaPodcastState.expanded) return;
    const actions = document.getElementById('koinoniaPodcastActionsMenu');
    const details = document.getElementById('koinoniaPodcastDetailsDrawer');
    const queue = document.getElementById('koinoniaPodcastQueueDrawer');
    if (actions && !actions.hidden) toggleKoinoniaPodcastActions(false);
    else if (details && !details.hidden) toggleKoinoniaPodcastDetails(false);
    else if (queue && !queue.hidden) toggleKoinoniaPodcastQueue(false);
    else toggleKoinoniaPodcastPlayerExpanded(false);
  });
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => void audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('seekbackward', (details) =>
        skipKoinoniaPodcast(-(details.seekOffset || 15))
      );
      navigator.mediaSession.setActionHandler('seekforward', (details) =>
        skipKoinoniaPodcast(details.seekOffset || 30)
      );
    } catch {
      /* Some browsers expose Media Session without every action handler. */
    }
  }
}

function teachingHeaders() {
  return window.MyAgapayShell?.authHeaders({ 'Content-Type': 'application/json' }) || {};
}

function teachingPostsForFilter(filter: string) {
  if (filter === 'all') return teachingState.posts;
  return teachingState.posts.filter((post) => (post.category || 'homilies') === filter);
}

function setTeachingCategoryFilter(filter: string) {
  if (!TEACHING_FILTERS.some(({ value }) => value === filter)) return;
  teachingState.filter = filter;
  renderTeaching();
}

async function playParishTeachingAudio(teachingId: string) {
  const post = teachingState.posts.find((item) => item.id === teachingId);
  if (!post?.audioUrl) return;
  const parishName = document.getElementById('teachingParishName')?.textContent?.trim() || 'Your parish';
  await playKoinoniaPodcast({
    title: post.title,
    show: parishName,
    episodeKey: `parish-audio:${post.id}`,
    audioUrl: post.audioUrl,
    description: post.body || 'A recording shared by your parish.',
    link: post.audioUrl,
    image: '/images/app/icon-512.png',
    trackProgress: false,
  });
  if (post.read) return;
  const response = await fetch(`/api/donor/teaching/${encodeURIComponent(teachingId)}/read`, {
    method: 'POST',
    headers: teachingHeaders(),
  });
  if (!response.ok) return;
  post.read = true;
  teachingState.unreadCount = Math.max(0, teachingState.unreadCount - 1);
  renderTeaching();
}

async function openTeachingPost(teachingId: string) {
  const post = teachingState.posts.find((item) => item.id === teachingId);
  const card = document.querySelector<HTMLElement>(`[data-teaching-id="${CSS.escape(teachingId)}"]`);
  if (!post || !card) return;
  const detail = card.querySelector<HTMLElement>('.feed-card-detail');
  const button = card.querySelector<HTMLElement>('.feed-card-summary');
  const opening = detail!.hidden;
  detail!.hidden = !opening;
  button!.setAttribute('aria-expanded', String(opening));
  if (!opening || post.read) return;
  const response = await fetch(`/api/donor/teaching/${encodeURIComponent(teachingId)}/read`, {
    method: 'POST',
    headers: teachingHeaders(),
  });
  if (!response.ok) return;
  post.read = true;
  teachingState.unreadCount = Math.max(0, teachingState.unreadCount - 1);
  renderTeaching();
  const reopened = document.querySelector<HTMLElement>(`[data-teaching-id="${CSS.escape(teachingId)}"]`);
  if (reopened) {
    reopened.querySelector<HTMLElement>('.feed-card-detail')!.hidden = false;
    reopened.querySelector<HTMLElement>('.feed-card-summary')!.setAttribute('aria-expanded', 'true');
  }
}

async function loadTeaching() {
  const status = document.getElementById('teachingStatus');
  try {
    const response = await fetch('/api/donor/teaching', { headers: teachingHeaders(), cache: 'no-store' });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = (await response.json().catch(() => ({}))) as TeachingApiPayload;
    if (!response.ok) throw new Error(data.error || 'Unable to load parish teaching.');
    teachingState = {
      posts: data.posts || [],
      unreadCount: Number(data.unreadCount || 0),
      filter: teachingState.filter || 'all',
    };
    if (data.parish?.name) document.getElementById('teachingParishName')!.textContent = data.parish.name;
    status!.hidden = true;
    renderTeaching();
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    const targetPost = teachingState.posts.find(({ id }) => id === targetId);
    if (targetPost) void (targetPost.audioUrl ? playParishTeachingAudio(targetId) : openTeachingPost(targetId));
  } catch (error) {
    status!.hidden = false;
    status!.textContent = (error as Error).message || 'Unable to load parish teaching.';
  }
}

window.setAudioLibraryMode = setAudioLibraryMode;
window.playParishTeachingAudio = playParishTeachingAudio;
window.searchKoinoniaPodcasts = searchKoinoniaPodcasts;
window.importKoinoniaPodcastFeed = importKoinoniaPodcastFeed;
window.openKoinoniaPodcast = openKoinoniaPodcast;
window.playKoinoniaPodcastEpisode = playKoinoniaPodcastEpisode;
window.queueKoinoniaPodcastEpisode = queueKoinoniaPodcastEpisode;
window.queueKoinoniaPodcastLatestEpisode = queueKoinoniaPodcastLatestEpisode;
window.playKoinoniaPodcastLatestEpisode = playKoinoniaPodcastLatestEpisode;
window.openKoinoniaSubscribedPodcast = openKoinoniaSubscribedPodcast;
window.setKoinoniaPodcastLibraryView = setKoinoniaPodcastLibraryView;
window.loadKoinoniaPodcastLatest = loadKoinoniaPodcastLatest;
window.subscribeKoinoniaPodcast = subscribeKoinoniaPodcast;
window.unsubscribeKoinoniaPodcastByIndex = unsubscribeKoinoniaPodcastByIndex;
window.unsubscribeKoinoniaPodcastByFeed = unsubscribeKoinoniaPodcastByFeed;
window.resumeKoinoniaPodcastProgress = resumeKoinoniaPodcastProgress;
window.toggleKoinoniaPodcastPlayback = toggleKoinoniaPodcastPlayback;
window.skipKoinoniaPodcast = skipKoinoniaPodcast;
window.toggleKoinoniaPodcastPlayerExpanded = toggleKoinoniaPodcastPlayerExpanded;
window.toggleKoinoniaPodcastDetails = toggleKoinoniaPodcastDetails;
window.toggleKoinoniaPodcastQueue = toggleKoinoniaPodcastQueue;
window.toggleKoinoniaPodcastActions = toggleKoinoniaPodcastActions;
window.openKoinoniaPodcastDetailsFromMenu = openKoinoniaPodcastDetailsFromMenu;
window.restartKoinoniaPodcast = restartKoinoniaPodcast;
window.copyKoinoniaPodcastLink = copyKoinoniaPodcastLink;
window.shareKoinoniaPodcastFromMenu = shareKoinoniaPodcastFromMenu;
window.toggleKoinoniaPodcastDownload = toggleKoinoniaPodcastDownload;
window.playDownloadedKoinoniaPodcast = playDownloadedKoinoniaPodcast;
window.removeDownloadedKoinoniaPodcast = removeDownloadedKoinoniaPodcast;
window.setKoinoniaPodcastSleepTimer = setKoinoniaPodcastSleepTimer;
window.shareKoinoniaPodcastEpisode = shareKoinoniaPodcastEpisode;
window.clearKoinoniaPodcastQueue = clearKoinoniaPodcastQueue;
window.removeQueuedKoinoniaPodcast = removeQueuedKoinoniaPodcast;
window.playQueuedKoinoniaPodcast = playQueuedKoinoniaPodcast;
document.addEventListener('DOMContentLoaded', () => {
  const requestedMode = new URLSearchParams(window.location.search).get('mode');
  bindKoinoniaPodcastPlayer();
  void loadKoinoniaPodcastProgress();
  setKoinoniaPodcastLibraryView('latest');
  setAudioLibraryMode(requestedMode === 'podcasts' ? 'podcasts' : 'parish');
  if (requestedMode === 'podcasts') void openRequestedKoinoniaPodcastEpisode();
  void loadTeaching();
});

export type TeachingWindowApi = {
  setAudioLibraryMode: typeof setAudioLibraryMode;
  playParishTeachingAudio: typeof playParishTeachingAudio;
  searchKoinoniaPodcasts: typeof searchKoinoniaPodcasts;
  importKoinoniaPodcastFeed: typeof importKoinoniaPodcastFeed;
  openKoinoniaPodcast: typeof openKoinoniaPodcast;
  playKoinoniaPodcastEpisode: typeof playKoinoniaPodcastEpisode;
  queueKoinoniaPodcastEpisode: typeof queueKoinoniaPodcastEpisode;
  queueKoinoniaPodcastLatestEpisode: typeof queueKoinoniaPodcastLatestEpisode;
  playKoinoniaPodcastLatestEpisode: typeof playKoinoniaPodcastLatestEpisode;
  openKoinoniaSubscribedPodcast: typeof openKoinoniaSubscribedPodcast;
  setKoinoniaPodcastLibraryView: typeof setKoinoniaPodcastLibraryView;
  loadKoinoniaPodcastLatest: typeof loadKoinoniaPodcastLatest;
  subscribeKoinoniaPodcast: typeof subscribeKoinoniaPodcast;
  unsubscribeKoinoniaPodcastByIndex: typeof unsubscribeKoinoniaPodcastByIndex;
  unsubscribeKoinoniaPodcastByFeed: typeof unsubscribeKoinoniaPodcastByFeed;
  resumeKoinoniaPodcastProgress: typeof resumeKoinoniaPodcastProgress;
  toggleKoinoniaPodcastPlayback: typeof toggleKoinoniaPodcastPlayback;
  skipKoinoniaPodcast: typeof skipKoinoniaPodcast;
  toggleKoinoniaPodcastPlayerExpanded: typeof toggleKoinoniaPodcastPlayerExpanded;
  toggleKoinoniaPodcastDetails: typeof toggleKoinoniaPodcastDetails;
  toggleKoinoniaPodcastQueue: typeof toggleKoinoniaPodcastQueue;
  toggleKoinoniaPodcastActions: typeof toggleKoinoniaPodcastActions;
  openKoinoniaPodcastDetailsFromMenu: typeof openKoinoniaPodcastDetailsFromMenu;
  restartKoinoniaPodcast: typeof restartKoinoniaPodcast;
  copyKoinoniaPodcastLink: typeof copyKoinoniaPodcastLink;
  shareKoinoniaPodcastFromMenu: typeof shareKoinoniaPodcastFromMenu;
  toggleKoinoniaPodcastDownload: typeof toggleKoinoniaPodcastDownload;
  playDownloadedKoinoniaPodcast: typeof playDownloadedKoinoniaPodcast;
  removeDownloadedKoinoniaPodcast: typeof removeDownloadedKoinoniaPodcast;
  setKoinoniaPodcastSleepTimer: typeof setKoinoniaPodcastSleepTimer;
  shareKoinoniaPodcastEpisode: typeof shareKoinoniaPodcastEpisode;
  clearKoinoniaPodcastQueue: typeof clearKoinoniaPodcastQueue;
  removeQueuedKoinoniaPodcast: typeof removeQueuedKoinoniaPodcast;
  playQueuedKoinoniaPodcast: typeof playQueuedKoinoniaPodcast;
};

export type TeachingBindings = {
  koinoniaPodcastState: typeof koinoniaPodcastState;
  koinoniaIcon: typeof koinoniaIcon;
  loadKoinoniaPodcastDownloads: typeof loadKoinoniaPodcastDownloads;
  koinoniaPodcastIsSubscribed: typeof koinoniaPodcastIsSubscribed;
  TEACHING_FILTERS: typeof TEACHING_FILTERS;
  teachingState: typeof teachingState;
  teachingPostsForFilter: typeof teachingPostsForFilter;
};
