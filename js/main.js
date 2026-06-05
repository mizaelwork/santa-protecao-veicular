/* ============================================================
   SANTA PROTEÇÃO VEICULAR — main.js
   ============================================================ */

// Texto pré-preenchido identifica o canal "site" para rastreamento de origem no painel
// (detectado por "vim pelo site" em lead-origem.ts do Gestão Comercial).
const WA_URL = 'https://wa.me/554888533236?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20Santa%20e%20gostaria%20de%20saber%20mais%20sobre%20prote%C3%A7%C3%A3o%20veicular.';

// Endpoint da API de Conversões (CAPI) hospedado no painel Gestão Comercial.
// Site estático não tem backend, por isso o evento de servidor é enviado cross-origin.
const CAPI_ENDPOINT = 'https://gestao.angelcode.shop/api/capi';

// Inject WhatsApp href into all WA links
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-wa]').forEach(el => {
    el.setAttribute('href', WA_URL);
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
    el.addEventListener('click', () => trackLead());
  });
});

/* ---------- META: EVENTO LEAD (Pixel + CAPI) ---------- */
// Dispara o mesmo evento pelo Pixel (navegador) e pela API de
// Conversões (servidor) usando um event_id em comum, para que a
// Meta deduplique e conte o Lead uma única vez.
function trackLead() {
  const eventId = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now() + '-' + Math.random().toString(16).slice(2));

  // Lado cliente (Pixel)
  if (typeof fbq === 'function') {
    fbq('track', 'Lead', {}, { eventID: eventId });
  }

  // Lado servidor (CAPI) — não bloqueia a navegação para o WhatsApp
  try {
    fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_name: 'Lead',
        event_id: eventId,
        event_source_url: window.location.href,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc'),
      }),
    }).catch(() => {});
  } catch (_) { /* falha de rede não deve impedir o WhatsApp */ }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/* ---------- NAVBAR ---------- */
const navbar = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

hamburger?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  hamburger.classList.toggle('active');
});

// Close nav on link click
navLinks?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.classList.remove('active');
  });
});

/* ---------- SCROLL REVEAL ---------- */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, entry.target.dataset.delay || 0);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach((el, i) => {
  el.dataset.delay = (i % 4) * 80;
  revealObserver.observe(el);
});

/* ---------- META: VIEWCONTENT (seções de interesse) ---------- */
// Dispara ViewContent uma única vez por seção quando o visitante rola até
// as áreas de maior intenção (Proteções/benefícios e Comparativo).
const vcSeen = new Set();
const vcObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !vcSeen.has(entry.target.id)) {
      vcSeen.add(entry.target.id);
      if (typeof fbq === 'function') {
        fbq('track', 'ViewContent', { content_name: entry.target.id });
      }
      vcObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });

['beneficios', 'comparacao'].forEach(id => {
  const el = document.getElementById(id);
  if (el) vcObserver.observe(el);
});

/* ---------- COUNTER ANIMATION ---------- */
function animateCounter(el) {
  const target = parseFloat(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const duration = 1800;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(ease * target);
    el.textContent = prefix + current.toLocaleString('pt-BR') + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-target]').forEach(el => {
  counterObserver.observe(el);
});

/* ---------- TESTIMONIALS CAROUSEL ---------- */
const track = document.getElementById('testimonialsTrack');
const dots = document.querySelectorAll('.carousel-dot');
const prevBtn = document.getElementById('carouselPrev');
const nextBtn = document.getElementById('carouselNext');

let currentSlide = 0;
const totalSlides = document.querySelectorAll('.testimonial-slide').length;

function goToSlide(index) {
  currentSlide = (index + totalSlides) % totalSlides;
  if (track) track.style.transform = `translateX(-${currentSlide * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
}

prevBtn?.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn?.addEventListener('click', () => goToSlide(currentSlide + 1));
dots.forEach((d, i) => d.addEventListener('click', () => goToSlide(i)));

// Auto-play
let autoPlay = setInterval(() => goToSlide(currentSlide + 1), 6000);

track?.parentElement?.addEventListener('mouseenter', () => clearInterval(autoPlay));
track?.parentElement?.addEventListener('mouseleave', () => {
  autoPlay = setInterval(() => goToSlide(currentSlide + 1), 6000);
});

// Touch swipe
let touchStartX = 0;
track?.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
track?.addEventListener('touchend', e => {
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 50) goToSlide(currentSlide + (diff > 0 ? 1 : -1));
});

/* ---------- FAQ ACCORDION ---------- */
document.querySelectorAll('.faq-item').forEach(item => {
  const question = item.querySelector('.faq-question');
  question?.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    // Open clicked (if was closed)
    if (!isOpen) item.classList.add('open');
  });
});

/* ---------- SMOOTH ANCHOR SCROLL ---------- */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ---------- WHATSAPP TOOLTIP ---------- */
const wpTooltip = document.getElementById('wpTooltip');
let tooltipTimeout;

if (wpTooltip) {
  // Show after 3 seconds
  tooltipTimeout = setTimeout(() => {
    wpTooltip.style.display = 'block';
    // Hide after 5 seconds
    setTimeout(() => { wpTooltip.style.display = 'none'; }, 5000);
  }, 3000);
}
