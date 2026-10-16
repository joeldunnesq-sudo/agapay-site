// Generated from src/browser/myagapay/teaching-presentation.ts by npm run build:browser. Do not edit.
function podcastText(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || '';
}
function podcastEpisodeKey(guid, audioUrl) {
  return String(guid || '').trim() || String(audioUrl || '').trim();
}
function podcastDurationSeconds(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  const parts = raw.split(':').map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}
function parseKoinoniaPodcastFeed(xml, xmlUrl) {
  const documentNode = new DOMParser().parseFromString(xml, 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('This podcast feed could not be read.');
  const title = podcastText(documentNode, 'channel > title') || 'Podcast';
  const image =
    documentNode.querySelector('channel image[href]')?.getAttribute('href') ||
    podcastText(documentNode, 'channel > image > url');
  const episodes = [...documentNode.querySelectorAll('item')]
    .map((item) => {
      const enclosure = item.querySelector('enclosure');
      const audioUrl = enclosure?.getAttribute('url') || '';
      const guid = podcastText(item, 'guid');
      const duration = podcastText(item, 'duration');
      return {
        title: podcastText(item, 'title') || 'Untitled episode',
        show: title,
        guid,
        episodeKey: podcastEpisodeKey(guid, audioUrl),
        audioUrl,
        date: podcastText(item, 'pubDate'),
        duration,
        durationSeconds: podcastDurationSeconds(duration),
        description: podcastText(item, 'description')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 280),
        link: podcastText(item, 'link'),
        image: item.querySelector('image[href]')?.getAttribute('href') || image,
        xmlUrl,
      };
    })
    .filter((episode) => episode.audioUrl)
    .slice(0, 30);
  return { title, image, episodes };
}
function podcastTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}
function renderKoinoniaContinueListening() {
  const section = document.getElementById('koinoniaContinueListening');
  const list = document.getElementById('koinoniaContinueList');
  if (!section || !list) return;
  section.hidden = !koinoniaPodcastState.progressItems.length;
  list.innerHTML = koinoniaPodcastState.progressItems
    .map((item, index) => {
      const duration = Number(item.durationSeconds) || 0;
      const position = Math.max(0, Number(item.positionSeconds) || 0);
      const percent = duration ? Math.min(100, Math.round((position / duration) * 100)) : 0;
      return `<button type="button" class="koinonia-continue-item" onclick="resumeKoinoniaPodcastProgress(${index})">
      <span class="koinonia-continue-play" aria-hidden="true">${koinoniaIcon('play')}</span>
      <span><small>${teachingEscape(item.showTitle || 'Orthodox Podcast')}</small><strong>${teachingEscape(item.episodeTitle || 'Untitled episode')}</strong><span class="koinonia-continue-progress"><i style="width:${percent}%"></i></span><em>${podcastTime(position)}${duration ? ` of ${podcastTime(duration)}` : ' listened'}</em></span>
    </button>`;
    })
    .join('');
}
async function renderKoinoniaPodcastDownloads() {
  const list = document.getElementById('koinoniaPodcastDownloads');
  if (!list) return;
  const downloads = await loadKoinoniaPodcastDownloads().catch(() => []);
  list.innerHTML = downloads.length
    ? downloads
        .map(
          (episode, index) => `
    <div class="koinonia-podcast-latest-row">
      <button type="button" onclick="playDownloadedKoinoniaPodcast(${index})"><span class="koinonia-podcast-result-art">${episode.image ? `<img src="${teachingEscape(episode.image)}" alt="" loading="lazy" />` : koinoniaIcon('audio')}</span><span><small>${teachingEscape(episode.show)}</small><strong>${teachingEscape(episode.title)}</strong><em>Available offline</em></span><span aria-hidden="true">${koinoniaIcon('play')}</span></button>
      <button type="button" onclick="removeDownloadedKoinoniaPodcast(${index})" aria-label="Remove ${teachingEscape(episode.title)} download">Remove</button>
    </div>`
        )
        .join('')
    : '<div class="feed-empty"><strong>No downloads yet</strong><span>Open an episode, tap the three dots, and choose Download episode.</span></div>';
}
function renderKoinoniaPodcastSubscriptions() {
  const target = document.getElementById('koinoniaPodcastSubscriptions');
  if (!target) return;
  if (!koinoniaPodcastState.subscriptions.length) {
    target.innerHTML = `<div class="feed-empty"><strong>No subscriptions yet</strong><p>Discover an Orthodox podcast and choose Subscribe. Its newest episodes will then appear together under Latest.</p><button type="button" onclick="setKoinoniaPodcastLibraryView('discover')">Discover podcasts</button></div>`;
    return;
  }
  target.innerHTML = koinoniaPodcastState.subscriptions
    .map(
      (podcast, index) => `<article class="koinonia-podcast-subscription">
    <button type="button" onclick="openKoinoniaSubscribedPodcast(${index})"><span class="koinonia-podcast-cover">${podcast.artwork ? `<img src="${teachingEscape(podcast.artwork)}" alt="" loading="lazy" />` : '♪'}</span><span><strong>${teachingEscape(podcast.title)}</strong><small>${teachingEscape(podcast.author || 'Subscribed podcast')}</small></span></button>
    <button type="button" class="is-remove" onclick="unsubscribeKoinoniaPodcastByIndex(${index})">Unsubscribe</button>
  </article>`
    )
    .join('');
}
function renderKoinoniaPodcastLatest() {
  const target = document.getElementById('koinoniaPodcastLatest');
  const status = document.getElementById('koinoniaPodcastLatestStatus');
  if (!target || !status) return;
  if (!koinoniaPodcastState.subscriptions.length) {
    status.textContent = 'Subscribe to a podcast to build your latest-episode feed.';
    target.innerHTML = `<div class="feed-empty"><strong>Your newest episodes will live here</strong><p>No more checking each show separately.</p><button type="button" onclick="setKoinoniaPodcastLibraryView('discover')">Find podcasts</button></div>`;
    return;
  }
  status.textContent = koinoniaPodcastState.latestEpisodes.length
    ? `${koinoniaPodcastState.latestEpisodes.length} recent episodes from ${koinoniaPodcastState.subscriptions.length} subscription${koinoniaPodcastState.subscriptions.length === 1 ? '' : 's'}`
    : 'No playable recent episodes were found.';
  target.innerHTML = koinoniaPodcastState.latestEpisodes
    .map(
      (episode, index) => `<div class="koinonia-podcast-latest-row">
    <button type="button" onclick="playKoinoniaPodcastLatestEpisode(${index})"><span class="koinonia-podcast-cover">${episode.image ? `<img src="${teachingEscape(episode.image)}" alt="" loading="lazy" />` : koinoniaIcon('audio')}</span><span><small>${teachingEscape(episode.show)}</small><strong>${teachingEscape(episode.title)}</strong><em>${teachingEscape(teachingDate(episode.date))}${episode.duration ? ` · ${teachingEscape(episode.duration)}` : ''}</em></span><b>${koinoniaIcon('play')}</b></button>
    <button type="button" onclick="queueKoinoniaPodcastLatestEpisode(${index})">Up Next</button>
  </div>`
    )
    .join('');
}
function renderKoinoniaPodcastResults() {
  const target = document.getElementById('koinoniaPodcastResults');
  if (!target) return;
  target.innerHTML = koinoniaPodcastState.results.length
    ? koinoniaPodcastState.results
        .map(
          (podcast, index) => `
    <button type="button" class="koinonia-podcast-result" onclick="openKoinoniaPodcast(${index})">
      <span class="koinonia-podcast-cover">${podcast.artwork ? `<img src="${teachingEscape(podcast.artwork)}" alt="" loading="lazy" />` : '♪'}</span>
      <span><strong>${teachingEscape(podcast.title || 'Podcast')}</strong><small>${teachingEscape(podcast.author || podcast.category || 'Podcast')}</small></span>
      <em>Episodes →</em>
    </button>`
        )
        .join('')
    : '';
}
function renderKoinoniaPodcastShow() {
  const podcast = koinoniaPodcastState.show;
  const show = document.getElementById('koinoniaPodcastShow');
  if (!show || !podcast) return;
  const subscribed = koinoniaPodcastIsSubscribed(podcast.url);
  show.hidden = false;
  show.innerHTML = `<header><span class="koinonia-podcast-cover is-large">${podcast.image || podcast.artwork ? `<img src="${teachingEscape(podcast.image || podcast.artwork)}" alt="" />` : koinoniaIcon('audio')}</span><span><small>Podcast</small><h3>${teachingEscape(podcast.title)}</h3><p>${podcast.episodes.length} recent episodes</p></span><button type="button" class="koinonia-podcast-subscribe${subscribed ? ' is-subscribed' : ''}" onclick="${subscribed ? `unsubscribeKoinoniaPodcastByFeed()` : `subscribeKoinoniaPodcast()`}">${subscribed ? 'Subscribed' : 'Subscribe'}</button></header><div>${
    podcast.episodes
      .map(
        (episode, episodeIndex) => `
    <div class="koinonia-podcast-episode-row"><button type="button" class="koinonia-podcast-episode" onclick="playKoinoniaPodcastEpisode(${episodeIndex})">
      <span aria-hidden="true">${koinoniaIcon('play')}</span><span><strong>${teachingEscape(episode.title)}</strong><small>${teachingEscape(teachingDate(episode.date))}${episode.duration ? ` · ${teachingEscape(episode.duration)}` : ''}</small></span><em>Play</em>
    </button><button type="button" class="koinonia-podcast-queue" onclick="queueKoinoniaPodcastEpisode(${episodeIndex})" aria-label="Add ${teachingEscape(episode.title)} to Up Next">Up Next</button></div>`
      )
      .join('') ||
    '<div class="feed-empty"><strong>No playable episodes</strong><p>This feed did not provide audio enclosures.</p></div>'
  }</div>`;
}
function renderKoinoniaPodcastQueue() {
  const count = document.getElementById('koinoniaPodcastQueueCount');
  const list = document.getElementById('koinoniaPodcastQueueList');
  if (count) {
    count.hidden = !koinoniaPodcastState.queue.length;
    count.textContent = `${koinoniaPodcastState.queue.length} Up Next`;
  }
  if (list)
    list.innerHTML = koinoniaPodcastState.queue.length
      ? koinoniaPodcastState.queue
          .map(
            (episode, index) =>
              `<div><button type="button" onclick="playQueuedKoinoniaPodcast(${index})"><small>${teachingEscape(episode.show || 'Podcast')}</small><strong>${teachingEscape(episode.title)}</strong></button><button type="button" onclick="removeQueuedKoinoniaPodcast(${index})" aria-label="Remove from Up Next">×</button></div>`
          )
          .join('')
      : '<span>Your queue is empty.</span>';
}
function teachingEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function teachingDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(void 0, { month: 'long', day: 'numeric', year: 'numeric' });
}
function renderTeachingCategoryFilters() {
  const filters = document.getElementById('teachingCategoryFilters');
  if (!filters) return;
  filters.innerHTML = TEACHING_FILTERS.map(({ value, label }) => {
    const active = teachingState.filter === value;
    return `<button type="button" class="${active ? 'is-active' : ''}" aria-pressed="${active}" onclick="setTeachingCategoryFilter('${value}')"><span>${teachingEscape(label)}</span><strong>${teachingPostsForFilter(value).length}</strong></button>`;
  }).join('');
}
function renderTeaching() {
  const list = document.getElementById('teachingList');
  const summary = document.getElementById('teachingUnreadSummary');
  const unread = Math.max(0, Number(teachingState.unreadCount) || 0);
  summary.hidden = unread === 0;
  summary.textContent = `${unread} unread`;
  window.MyAgapayShell?.setTeachingUnreadCount(unread);
  renderTeachingCategoryFilters();
  if (!teachingState.posts.length) {
    list.innerHTML =
      '<div class="feed-empty"><strong>No recordings yet</strong><p>Your parish’s published audio and reflections will appear here.</p></div>';
    return;
  }
  const visiblePosts = teachingPostsForFilter(teachingState.filter);
  if (!visiblePosts.length) {
    const selected = TEACHING_FILTERS.find(({ value }) => value === teachingState.filter)?.label || 'selected';
    list.innerHTML = `<div class="feed-empty"><strong>No ${teachingEscape(selected.toLowerCase())} posts</strong><p>Published teaching in this category will appear here.</p></div>`;
    return;
  }
  list.innerHTML = visiblePosts
    .map(
      (post) => `
    <article class="feed-card teaching-card${post.read ? '' : ' is-unread'}" id="${teachingEscape(post.id)}" data-teaching-id="${teachingEscape(post.id)}">
      <button class="feed-card-summary" type="button" onclick="${post.audioUrl ? 'playParishTeachingAudio' : 'openTeachingPost'}('${teachingEscape(post.id)}')" aria-expanded="false"${post.audioUrl ? ` aria-label="Play ${teachingEscape(post.title)} in the Koinonia player"` : ''}>
        <span class="teaching-card-icon" aria-hidden="true">${post.audioUrl ? koinoniaIcon('play') : koinoniaIcon('audio')}</span>
        <span class="feed-card-copy"><span class="feed-card-flags">${post.pinned ? '<em class="feed-pinned">Pinned</em>' : ''}<em>${teachingEscape(TEACHING_FILTERS.find(({ value }) => value === (post.category || 'homilies'))?.label || 'Homilies')}</em>${post.audioUrl ? `<em>${post.audioSource === 'external' ? 'Linked audio' : 'Audio'}</em>` : '<em>Reflection</em>'}${post.read ? '' : '<em class="feed-new">New</em>'}</span><strong>${teachingEscape(post.title)}</strong><small>${post.audioUrl ? 'Play in Koinonia · ' : ''}${teachingEscape(teachingDate(post.publishedAt))}</small></span>
      </button>
      <div class="feed-card-detail teaching-card-detail" hidden>
        <div class="feed-card-body">${post.bodyHtml || teachingEscape(post.body)}</div>
      </div>
    </article>
  `
    )
    .join('');
}
function encodePodcastDownloadHeader(value, maxLength = 2e3) {
  return encodeURIComponent(String(value || '').slice(0, maxLength));
}
function decodePodcastDownloadHeader(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
}
function downloadedKoinoniaEpisode(response, request) {
  const read = (name) => decodePodcastDownloadHeader(response.headers.get(name));
  return {
    episodeKey: read('X-AGAPAY-Episode-Key') || new URL(request.url).searchParams.get('episode'),
    title: read('X-AGAPAY-Episode-Title') || 'Downloaded episode',
    show: read('X-AGAPAY-Show-Title') || 'Orthodox Podcast',
    audioUrl: read('X-AGAPAY-Audio-URL'),
    link: read('X-AGAPAY-Episode-Link'),
    image: read('X-AGAPAY-Episode-Image'),
    xmlUrl: read('X-AGAPAY-Feed-URL'),
    description: read('X-AGAPAY-Description') || 'Downloaded for offline listening.',
    downloadedAt: response.headers.get('X-AGAPAY-Downloaded-At') || '',
  };
}
