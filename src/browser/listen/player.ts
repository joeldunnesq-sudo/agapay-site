export interface AudioPlayerEvents {
  progress: { progress: number; elapsed: number; duration: number };
  ended: Record<string, never>;
  error: Event;
  playing: Record<string, never>;
  pause: Record<string, never>;
  loaded: { duration: number };
}
type PlayerEvent = keyof AudioPlayerEvents;
type PlayerListener = (data: AudioPlayerEvents[PlayerEvent]) => void;
/**
 * AGAPAY Listen — AudioPlayer
 * Wraps HTMLAudioElement with progress events, skip, seek, and resume support.
 */
export class AudioPlayer {
  declare _audio: HTMLAudioElement;
  declare _listeners: Partial<Record<PlayerEvent, PlayerListener[]>>;
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
  load(url: string, startTime = 0) {
    if (!url) return;
    this._audio.src = url;
    this._audio.load();
    if (startTime > 0) {
      this._audio.addEventListener(
        'loadedmetadata',
        () => {
          this._audio.currentTime = startTime;
        },
        { once: true }
      );
    }
  }

  play() {
    return this._audio.play().catch(() => {});
  }

  pause() {
    this._audio.pause();
  }

  /** seek: fraction 0–1 */
  seek(fraction: number) {
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

  setSpeed(rate: number) {
    this._audio.playbackRate = rate;
  }

  get elapsed() {
    return this._audio.currentTime || 0;
  }
  get duration() {
    return this._audio.duration || 0;
  }
  get paused() {
    return this._audio.paused;
  }

  on<K extends PlayerEvent>(event: K, fn: (data: AudioPlayerEvents[K]) => void) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event]!.push(fn as PlayerListener);
    return this;
  }

  off<K extends PlayerEvent>(event: K, fn: (data: AudioPlayerEvents[K]) => void) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
    }
  }

  _emit(event: PlayerEvent, data: AudioPlayerEvents[PlayerEvent]) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }
}
