(function () {
  document.querySelectorAll('[data-koinonia-preview]').forEach((preview) => {
    const track = preview.querySelector('.give-koinonia-track');
    const slides = Array.from(track.children);
    const controls = preview.querySelector('.koinonia-preview-controls');
    const pauseButton = preview.querySelector('[data-koinonia-pause]');
    const nextButton = preview.querySelector('[data-koinonia-next]');
    const caption = preview.querySelector('[data-koinonia-caption]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = reducedMotion.matches;
    let visible = !('IntersectionObserver' in window);
    let ready = false;
    let loading = false;
    let index = 0;
    let timer = null;

    function schedule() {
      clearTimeout(timer);
      pauseButton.textContent = paused ? 'Play preview' : 'Pause preview';
      caption.setAttribute('aria-live', paused ? 'polite' : 'off');
      if (ready && visible && !paused && !document.hidden) {
        timer = setTimeout(() => show((index + 1) % slides.length), 4500);
      }
    }

    function show(nextIndex) {
      index = nextIndex;
      track.style.transform = `translateY(-${index * 100 / slides.length}%)`;
      slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
      caption.textContent = `${slides[index].dataset.screenName} · ${index + 1} of ${slides.length}`;
      schedule();
    }

    async function loadScreens() {
      if (loading) return;
      loading = true;
      const images = Array.from(track.querySelectorAll('img'));
      images.forEach((image) => { image.loading = 'eager'; });
      const results = await Promise.allSettled(images.map((image) => image.decode()));
      if (results.some((result) => result.status === 'rejected')) {
        caption.textContent = 'Preview unavailable. Please reload to try again.';
        return;
      }
      ready = true;
      controls.hidden = false;
      schedule();
    }

    pauseButton.addEventListener('click', () => {
      paused = !paused;
      schedule();
    });
    nextButton.addEventListener('click', () => {
      paused = true;
      show((index + 1) % slides.length);
    });
    reducedMotion.addEventListener('change', (event) => {
      paused = event.matches;
      schedule();
    });
    document.addEventListener('visibilitychange', schedule);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) loadScreens();
        schedule();
      }, { threshold: 0.15 });
      observer.observe(preview);
    } else {
      loadScreens();
    }
  });
})();
