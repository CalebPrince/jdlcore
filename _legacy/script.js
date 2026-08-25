// JDL Core — shared behavior across all pages (hub, Inspection, Analytics, Academy)

document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  document.querySelectorAll('#year').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // Mobile nav drawer
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.id = 'nav-backdrop';
    document.body.appendChild(backdrop);

    function setDrawerOpen(isOpen) {
      nav.classList.toggle('is-open', isOpen);
      toggle.classList.toggle('is-open', isOpen);
      backdrop.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    }

    toggle.addEventListener('click', () => setDrawerOpen(!nav.classList.contains('is-open')));
    backdrop.addEventListener('click', () => setDrawerOpen(false));
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setDrawerOpen(false));
    });
  }

  // Reveal-on-scroll
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // Stat counters (used only where data-count is present)
  const counters = document.querySelectorAll('.stat-num[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    const animate = (el) => {
      const target = parseInt(el.getAttribute('data-count'), 10);
      const suffix = el.getAttribute('data-suffix') || '';
      const duration = 1200;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { animate(entry.target); cio.unobserve(entry.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach((el) => cio.observe(el));
  }

  // Demo form handlers — client-side only, no backend wired up yet
  const quoteForm = document.getElementById('quote-form');
  if (quoteForm) {
    quoteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = document.getElementById('qf-note');
      if (note) note.textContent = 'Thanks — this demo form does not send anywhere yet. Wire it to a real inbox before launch.';
      quoteForm.reset();
    });
  }

  document.querySelectorAll('.waitlist-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = form.querySelector('.form-note');
      if (note) note.textContent = 'Thanks — this demo form does not send anywhere yet. Wire it to a real inbox before launch.';
      form.reset();
    });
  });
});
