/**
 * AGAPAY Listen — AudioPlayer
 * Wraps HTMLAudioElement with progress events, skip, seek, and resume support.
 */
export class AudioPlayer {
  constructor() {
    this._audio = new Audio();
    this._audio.preload = 'metadata';
    this._listeners = {};
    this._bindAudio();
  }

  _bindAudio() {
    const a = this._audio;

    a.addEventListener('timeupdate', () => {
      if (!a.duration) return;
      this._emit('progress', {
        progress: (a.currentTime / a.duration) * 100,
        elapsed: a.currentTime,
        duration: a.duration,
      });
    });

    a.addEventListener('ended', () => this._emit('ended', {}));
    a.addEventListener('error', (e) => this._emit('error', e));
    a.addEventListener('playing', () => this._emit('playing', {}));
    a.addEventListener('pause', () => this._emit('pause', {}));
    a.addEventListener('loadedmetadata', () => {
      this._emit('loaded', { duration: a.duration });
    });
  }

  /** Load a new episode URL, optionally resuming at startTime (seconds). */
  load(url, startTime = 0) {
    if (!url) return;
    this._audio.src = url;
    this._audio.load();
    if (startTime > 0) {
      this._audio.addEventListener('loadedmetadata', () => {
        this._audio.currentTime = startTime;
      }, { once: true });
    }
  }

  play() {
    return this._audio.play().catch(() => {});
  }

  pause() {
    this._audio.pause();
  }

  /** seek: fraction 0–1 */
  seek(fraction) {
    if (!this._audio.duration) return;
    this._audio.currentTime = fraction * this._audio.duration;
  }

  skipBack(seconds = 15) {
    this._audio.currentTime = Math.max(0, this._audio.currentTime - seconds);
  }

  skipForward(seconds = 30) {
    if (!this._audio.duration) return;
    this._audio.currentTime = Math.min(this._audio.duration - 1, this._audio.currentTime + seconds);
  }

  setSpeed(rate) {
    this._audio.playbackRate = rate;
  }

  get elapsed() { return this._audio.currentTime || 0; }
  get duration() { return this._audio.duration || 0; }
  get paused()   { return this._audio.paused; }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
