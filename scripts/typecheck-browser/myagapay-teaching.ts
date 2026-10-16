import type {
  TeachingEpisode,
  TeachingProgress,
  TeachingSubscription,
} from '../../src/browser/myagapay/teaching-contracts.js';
const episode: TeachingEpisode = {
  episodeKey: 'episode',
  audioUrl: 'https://media.example.test/episode.mp3',
  title: 'Episode',
};
// @ts-expect-error Playable episodes must retain an audio URL.
const invalidEpisode: TeachingEpisode = { episodeKey: 'episode', title: 'Episode' };
const progress: TeachingProgress = { episodeKey: 'episode', positionSeconds: 80, durationSeconds: 300 };
// @ts-expect-error Saved progress uses numeric seconds.
const invalidProgress: TeachingProgress = { ...progress, positionSeconds: '1:20' };
const subscription: TeachingSubscription = { feedUrl: 'https://feed.example.test/show.xml' };
window.setAudioLibraryMode('podcasts');
window.skipKoinoniaPodcast(30);
// @ts-expect-error Skip offsets are numeric seconds.
window.skipKoinoniaPodcast('30');
void [episode, invalidEpisode, progress, invalidProgress, subscription];
