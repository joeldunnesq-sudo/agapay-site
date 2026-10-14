const mediaVideo: DonorMediaVideo = {
  id: 'video-1',
  title: 'Parish video',
  publishedAt: '2026-10-14',
  thumbnailUrl: '/thumbnail',
};
nativeCard(mediaVideo, true);
openYouTubeMedia({ dataset: { youtubeVideoId: 'abcdef12345' } });
// @ts-expect-error Native video IDs must be strings.
nativeCard({ ...mediaVideo, id: 42 });
// @ts-expect-error A playback controller requires a video element.
setupPlayer(document.createElement('div'), '/signed-playlist', 'video-1');
// @ts-expect-error Playback URLs are strings.
setupPlayer(document.createElement('video'), 42, 'video-1');
const invalidHls: DonorHlsPlayer = {
  loadSource() {},
  destroy() {},
  // @ts-expect-error HLS attachments require video elements.
  attachMedia(video: string) {
    void video;
  },
};
void invalidHls;
