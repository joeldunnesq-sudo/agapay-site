// Generated from src/browser/listen/app-events.ts by npm run build:browser. Do not edit.
function bindListenEvents({
  setState,
  state,
  save,
  render,
  showToast,
  refreshAllFeeds,
  addToQueue,
  toggleLikeEpisode,
  episodeKey,
  removeDownload,
  downloadEpisode,
  playEpisode,
  player,
  updateMediaSessionPlaybackState,
  addRssFeed,
  setPlaybackSpeed,
  setSleepTimer,
  setSleepAtEpisodeEnd,
  clearSleepTimer,
  persistQueue,
  playQueuedEpisode,
  doSearch,
  fetchFeed,
}) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => setState({ screen: el.dataset.nav }));
  });
  document.querySelectorAll('.category-chip').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.category || 'All';
      save('agp_category', state.activeCategory);
      render();
    })
  );
  document.querySelectorAll('.show-row-tap').forEach((el) =>
    el.addEventListener('click', () => {
      try {
        setState({ currentShow: JSON.parse(decodeURIComponent(el.dataset.show)), screen: 'show' });
      } catch (error) {
        console.error('Could not open podcast:', error);
      }
    })
  );
  document.getElementById('refresh-feeds')?.addEventListener('click', async () => {
    showToast('Refreshing followed podcasts…');
    await refreshAllFeeds();
  });
  document.querySelectorAll('.ep-queue-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        addToQueue(JSON.parse(decodeURIComponent(btn.dataset.ep)));
      } catch {}
    })
  );
  document.querySelectorAll('.ep-play-next-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        addToQueue(JSON.parse(decodeURIComponent(btn.dataset.ep)), true);
      } catch (error) {
        console.error('Could not queue next:', error);
      }
    })
  );
  document.querySelectorAll('.ep-like-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        toggleLikeEpisode(JSON.parse(decodeURIComponent(btn.dataset.ep)));
      } catch (error) {
        console.error('Could not update like:', error);
      }
    })
  );
  document.querySelectorAll('.ep-download-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const ep = JSON.parse(decodeURIComponent(btn.dataset.ep));
        state.downloaded.has(episodeKey(ep)) ? removeDownload(ep) : downloadEpisode(ep);
      } catch {}
    })
  );
  document.querySelectorAll('.ep-tap').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.follow-btn') || e.target.closest('.unfollow-btn')) return;
      try {
        const episode = JSON.parse(decodeURIComponent(el.dataset.ep));
        playEpisode(episode).catch((error) => {
          console.error('Episode playback failed:', error, episode);
          showToast('Unable to play this episode');
        });
      } catch (error) {
        console.error('Could not read episode data:', error, el.dataset.ep);
        showToast('This episode could not be opened');
      }
    });
  });
  document.querySelector('.back-btn')?.addEventListener('click', () => setState({ screen: 'home' }));
  document.getElementById('mini-player-open')?.addEventListener('click', (e) => {
    if (e.target.closest('.mini-play-pause')) return;
    setState({ screen: 'player' });
  });
  document.querySelector('.mini-play-pause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.playing) {
      player.pause();
      setState({ playing: false });
    } else {
      player.play();
      setState({ playing: true });
    }
  });
  document.querySelector('.play-pause')?.addEventListener('click', async () => {
    if (state.playing) {
      player.pause();
      updateMediaSessionPlaybackState(false);
      setState({ playing: false });
    } else {
      try {
        const result = player.play();
        if (result && typeof result.then === 'function') await result;
        updateMediaSessionPlaybackState(true);
        setState({ playing: true });
      } catch (error) {
        console.error('Playback resume failed:', error);
        showToast('Could not resume playback');
      }
    }
  });
  document.querySelector('.skip-back')?.addEventListener('click', () => player.skipBack(15));
  document.querySelector('.skip-fwd')?.addEventListener('click', () => player.skipForward(30));
  document.getElementById('seekbar')?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.seek((e.clientX - r.left) / r.width);
  });
  document.querySelector('.like-btn')?.addEventListener('click', () => {
    if (state.current) toggleLikeEpisode(state.current);
  });
  document.querySelector('.open-rss')?.addEventListener('click', () => setState({ rssSheet: true }));
  document.getElementById('rss-backdrop')?.addEventListener('click', () => setState({ rssSheet: false }));
  document.getElementById('rss-cancel')?.addEventListener('click', () => setState({ rssSheet: false }));
  document.getElementById('rss-add-btn')?.addEventListener('click', () => {
    const val = document.getElementById('rss-input')?.value || '';
    addRssFeed(val);
  });
  document.getElementById('login-redirect-btn')?.addEventListener('click', () => {
    window.location.href = '/account/login?redirect=' + encodeURIComponent(window.location.href);
  });
  document.getElementById('open-desc-btn')?.addEventListener('click', () => setState({ descriptionSheet: true }));
  document.getElementById('desc-backdrop')?.addEventListener('click', () => setState({ descriptionSheet: false }));
  document.getElementById('desc-close-btn')?.addEventListener('click', () => setState({ descriptionSheet: false }));
  document.getElementById('sleep-btn')?.addEventListener('click', () => setState({ sleepSheet: true }));
  document.getElementById('speed-btn')?.addEventListener('click', () => setState({ speedSheet: true }));
  document.getElementById('open-queue-btn')?.addEventListener('click', () => setState({ screen: 'queue' }));
  document
    .getElementById('utility-backdrop')
    ?.addEventListener('click', () => setState({ queueSheet: false, speedSheet: false, sleepSheet: false }));
  document.querySelectorAll('.speed-option').forEach((btn) =>
    btn.addEventListener('click', () => {
      setPlaybackSpeed(btn.dataset.rate);
      setState({ speedSheet: false });
    })
  );
  document.querySelectorAll('.sleep-option').forEach((btn) =>
    btn.addEventListener('click', () => {
      setSleepTimer(btn.dataset.minutes);
      state.sleepSheet = false;
      render();
    })
  );
  document.getElementById('sleep-end-episode')?.addEventListener('click', () => {
    setSleepAtEpisodeEnd();
    state.sleepSheet = false;
    render();
  });
  document.getElementById('sleep-cancel')?.addEventListener('click', () => clearSleepTimer());
  document.getElementById('queue-clear')?.addEventListener('click', () => {
    persistQueue([]);
    render();
  });
  document.getElementById('history-clear')?.addEventListener('click', () => {
    state.history = [];
    save('agp_history', []);
    render();
  });
  document
    .querySelectorAll('.library-back-btn')
    .forEach((btn) => btn.addEventListener('click', () => setState({ screen: 'library' })));
  document.getElementById('queue-page-clear')?.addEventListener('click', () => {
    persistQueue([]);
    render();
  });
  document
    .querySelectorAll('.queue-page-play')
    .forEach((btn) => btn.addEventListener('click', () => playQueuedEpisode(Number(btn.dataset.index))));
  document.querySelectorAll('.queue-page-remove').forEach((btn) =>
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      persistQueue(state.queue.filter((_, i) => i !== index));
      render();
    })
  );
  document.querySelectorAll('.queue-move-up').forEach((btn) =>
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      if (index <= 0) return;
      const queue = [...state.queue];
      [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]];
      persistQueue(queue);
      render();
    })
  );
  document.querySelectorAll('.queue-move-down').forEach((btn) =>
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      if (index < 0 || index >= state.queue.length - 1) return;
      const queue = [...state.queue];
      [queue[index], queue[index + 1]] = [queue[index + 1], queue[index]];
      persistQueue(queue);
      render();
    })
  );
  document.querySelectorAll('.queue-remove').forEach((btn) =>
    btn.addEventListener('click', () => {
      persistQueue(state.queue.filter((ep) => episodeKey(ep) !== btn.dataset.key));
      render();
    })
  );
  document.querySelectorAll('.queue-play').forEach((btn) =>
    btn.addEventListener('click', () => {
      try {
        const ep = JSON.parse(decodeURIComponent(btn.dataset.ep));
        persistQueue(state.queue.filter((item) => episodeKey(item) !== episodeKey(ep)));
        playEpisode(ep, state.queue);
      } catch {}
    })
  );
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    doSearch(e.target.value);
  });
  document.querySelectorAll('.follow-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      const title = btn.dataset.title || url;
      if (!url || state.subs.find((s) => s.xmlUrl === url)) return;
      state.subs.push({ title, xmlUrl: url, image: '', addedAt: Date.now() });
      save('agp_subs', state.subs);
      showToast(`"${title}" added`);
      render();
      try {
        const { title: t, image } = await fetchFeed(url);
        const sub = state.subs.find((s) => s.xmlUrl === url);
        if (sub) {
          sub.title = t || title;
          sub.image = image || '';
          save('agp_subs', state.subs);
        }
        refreshAllFeeds();
      } catch {}
    });
  });
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    const ep = state.current;
    if (!ep) return;
    const shareData = {
      title: ep.title,
      text: `Listening to "${ep.title}" on AGAPAY Listen:`,
      url: ep.url || window.location.href,
    };
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failure:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast('Episode link copied to clipboard!');
      } catch {
        showToast('Unable to share track link.');
      }
    }
  });
  document.querySelectorAll('.show-row-tap').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.unfollow-btn')) return;
      try {
        const showData = JSON.parse(decodeURIComponent(el.dataset.show));
        setState({ screen: 'show', currentShow: showData });
      } catch (err) {
        console.error('Show detail state routing error:', err);
      }
    });
  });
  document.querySelector('.show-back-btn')?.addEventListener('click', () => {
    setState({ screen: 'library', currentShow: null });
  });
  document.querySelectorAll('.unfollow-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const url = btn.dataset.url;
      const title = btn.dataset.title;
      if (!url) return;
      const updatedSubs = state.subs.filter((s) => s.xmlUrl !== url);
      const updatedEps = state.episodes.filter((ep) => ep.xmlUrl !== url);
      save('agp_subs', updatedSubs);
      save('agp_eps', updatedEps);
      const exitingShowView = state.screen === 'show' && state.currentShow?.xmlUrl === url;
      setState({
        subs: updatedSubs,
        episodes: updatedEps,
        screen: exitingShowView ? 'library' : state.screen,
        currentShow: exitingShowView ? null : state.currentShow,
      });
      showToast(`Unfollowed "${title}"`);
    });
  });
}
export { bindListenEvents };
