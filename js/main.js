/* ============================================================
   SANTA PROTEÇÃO VEICULAR — main-v2.js
   ============================================================ */

const WA_NUMERO = '554888533236';
const TEXTO_SITE_PADRAO = 'Olá! Vim pelo site da Santa e gostaria de saber mais sobre proteção veicular.';
const TEXTO_GOOGLE_PADRAO = 'Olá! Vim pelo Google e gostaria de saber mais sobre proteção veicular.';

// Endpoint do CAPI para rastreamento de servidor
const CAPI_ENDPOINT = 'https://gestao.angelcode.com.br/api/capi';

// Verifica se a visita tem origem no tráfego pago do Google
function veioDoGoogle() {
  try {
    const p = new URLSearchParams(location.search);
    if (p.has('gclid') || (p.get('utm_source') || '').toLowerCase() === 'google') {
      sessionStorage.setItem('src_google', '1');
      return true;
    }
    return sessionStorage.getItem('src_google') === '1';
  } catch (_) {
    const p = new URLSearchParams(location.search);
    return p.has('gclid') || (p.get('utm_source') || '').toLowerCase() === 'google';
  }
}

// Retorna a mensagem padrão baseada na origem
function obterMensagemPadrao() {
  return veioDoGoogle() ? TEXTO_GOOGLE_PADRAO : TEXTO_SITE_PADRAO;
}

// Constrói o link base do WhatsApp com mensagem customizada
function criarLinkWhatsapp(mensagem) {
  return `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(mensagem)}`;
}

/* ---------- RASTREAMENTO META E GOOGLE ADS (DEDUPLICADO) ---------- */
function trackLead(origemSimulacao = '', nome = '', telefone = '') {
  const eventId = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now() + '-' + Math.random().toString(16).slice(2));

  // Pixel (navegador)
  if (typeof fbq === 'function') {
    fbq('track', 'Lead', {}, { eventID: eventId });
  }

  // Google Ads
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', { send_to: 'AW-10777457819/kzoICKrK0b8cEJvpi5Mo' });
  }

  // Lado Servidor (CAPI)
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
        lead_simulador: origemSimulacao || undefined,
        nome: nome || undefined,
        telefone: telefone || undefined
      }),
    }).catch(() => {});
  } catch (_) {}
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}


/* ---------- INICIALIZAÇÃO E EVENTOS ---------- */
document.addEventListener('DOMContentLoaded', () => {

  // 1. Aplicar máscara de telefone nos inputs
  document.querySelectorAll('input[type="tel"]').forEach(input => {
    aplicarMascaraTelefone(input);
  });

  // 2. Links padrões de WhatsApp (CTA Simples)
  document.querySelectorAll('[data-wa]:not(#heroSimularBtn):not(#calcSimularBtn)').forEach(el => {
    el.setAttribute('href', criarLinkWhatsapp(obterMensagemPadrao()));
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
    el.addEventListener('click', () => trackLead('CTA_Padrao'));
  });

  // 3. SIMULADOR DO HERO
  inicializarSimuladorHero();

  // 4. CALCULADORA DE OPCIONAIS
  inicializarCalculadoraOpcionais();

  // 5. MENU MOBILE
  inicializarMenuMobile();

  // 6. CARROSSEL DE DEPOIMENTOS
  inicializarCarrosselDepoimentos();

  // 7. ACCORDION FAQ
  inicializarFaqAccordion();

  // 8. SCROLL REVEAL E VIEWCONTENT OBSERVATION
  inicializarScrollObservers();
});


/* ---------- MÁSCARA DE TELEFONE ---------- */
function aplicarMascaraTelefone(input) {
  if (!input) return;
  
  const formatar = (valor) => {
    valor = valor.replace(/\D/g, ''); // Remove não-dígitos
    if (valor.length > 11) {
      valor = valor.slice(0, 11);
    }
    
    if (valor.length === 0) return '';
    if (valor.length <= 2) return `(${valor}`;
    if (valor.length <= 6) return `(${valor.slice(0, 2)}) ${valor.slice(2)}`;
    if (valor.length <= 10) return `(${valor.slice(0, 2)}) ${valor.slice(2, 6)}-${valor.slice(6)}`;
    return `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7)}`;
  };

  input.addEventListener('input', (e) => {
    e.target.value = formatar(e.target.value);
  });
  
  input.addEventListener('keypress', (e) => {
    // Permite apenas números (teclas físicas)
    if (!/[0-9]/.test(e.key) && e.key !== 'Enter') {
      e.preventDefault();
    }
  });
}


/* ---------- SIMULADOR DO HERO ---------- */
function inicializarSimuladorHero() {
  const options = document.querySelectorAll('.selector-option');
  const nomeInput = document.getElementById('heroNomeInput');
  const telefoneInput = document.getElementById('heroTelefoneInput');
  const simularBtn = document.getElementById('heroSimularBtn');
  
  let veiculoSelecionado = 'Carro'; // valor padrão

  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      veiculoSelecionado = opt.dataset.type;
    });
  });

  if (simularBtn) {
    simularBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const nome = nomeInput ? nomeInput.value.trim() : '';
      const telefone = telefoneInput ? telefoneInput.value.trim() : '';

      if (nome.length < 2) {
        alert('Por favor, digite o seu nome para continuar.');
        if (nomeInput) nomeInput.focus();
        return;
      }
      
      const apenasDigitos = telefone.replace(/\D/g, '');
      if (apenasDigitos.length < 10) {
        alert('Por favor, digite um número de WhatsApp válido com DDD.');
        if (telefoneInput) telefoneInput.focus();
        return;
      }

      const canal = veioDoGoogle() ? 'Google' : 'site da Santa';
      const mensagem = `Olá! Meu nome é ${nome} (WhatsApp: ${telefone}). Vim pelo ${canal} e gostaria de simular uma proteção para meu(minha) ${veiculoSelecionado}. Pode me ajudar?`;

      const link = criarLinkWhatsapp(mensagem);
      window.open(link, '_blank', 'noopener,noreferrer');
      
      trackLead(`Simulador_Hero_${veiculoSelecionado}`, nome, telefone);
    });
  }
}


/* ---------- CALCULADORA DE OPCIONAIS ---------- */
function inicializarCalculadoraOpcionais() {
  const checkboxItems = document.querySelectorAll('.calc-checkbox-item');
  const progressBarFill = document.getElementById('calcProgressBar');
  const progressText = document.getElementById('calcProgressText');
  const calcSimularBtn = document.getElementById('calcSimularBtn');
  const nomeInput = document.getElementById('calcNomeInput');
  const telefoneInput = document.getElementById('calcTelefoneInput');
  
  function atualizarCalculadora() {
    const totalItens = checkboxItems.length;
    const marcados = document.querySelectorAll('.calc-checkbox-item.checked').length;
    const porcentagem = Math.round((marcados / totalItens) * 100);

    // Atualiza barra de progresso
    if (progressBarFill) {
      progressBarFill.style.width = `${porcentagem}%`;
    }

    // Atualiza nível de segurança
    if (progressText) {
      if (porcentagem < 40) {
        progressText.textContent = 'Proteção Básica';
        progressText.style.color = '#ef4444';
      } else if (porcentagem < 80) {
        progressText.textContent = 'Proteção Recomendada';
        progressText.style.color = '#F5A623';
      } else {
        progressText.textContent = 'Proteção Total e Completa!';
        progressText.style.color = '#4ade80';
      }
    }
  }

  checkboxItems.forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('checked');
      atualizarCalculadora();
    });
  });

  if (calcSimularBtn) {
    calcSimularBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const nome = nomeInput ? nomeInput.value.trim() : '';
      const telefone = telefoneInput ? telefoneInput.value.trim() : '';

      if (nome.length < 2) {
        alert('Por favor, digite o seu nome para continuar.');
        if (nomeInput) nomeInput.focus();
        return;
      }
      
      const apenasDigitos = telefone.replace(/\D/g, '');
      if (apenasDigitos.length < 10) {
        alert('Por favor, digite um número de WhatsApp válido com DDD.');
        if (telefoneInput) telefoneInput.focus();
        return;
      }

      const canal = veioDoGoogle() ? 'Google' : 'site da Santa';
      let mensagem = `Olá! Meu nome é ${nome} (WhatsApp: ${telefone}). Vim pelo ${canal} e montei uma proteção sob medida. Gostaria de simular a contratação.\n\nBenefícios selecionados:\n`;
      
      const itensMarcados = [];
      document.querySelectorAll('.calc-checkbox-item.checked').forEach(item => {
        itensMarcados.push(`- ${item.dataset.title}`);
      });
      
      mensagem += itensMarcados.join('\n');

      const link = criarLinkWhatsapp(mensagem);
      window.open(link, '_blank', 'noopener,noreferrer');

      const itensNomes = Array.from(document.querySelectorAll('.calc-checkbox-item.checked')).map(i => i.dataset.title);
      trackLead(`Calculadora_Opcionais: ${itensNomes.join(',')}`, nome, telefone);
    });
  }

  // Inicializa o estado visual
  atualizarCalculadora();
}


/* ---------- MENU MOBILE ---------- */
function inicializarMenuMobile() {
  const navbar = document.getElementById('navbar-v2');
  const hamburger = document.getElementById('hamburger-v2');
  const navLinks = document.getElementById('navLinks-v2');

  window.addEventListener('scroll', () => {
    if (navbar) {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    }
  });

  hamburger?.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('active');
  });

  navLinks?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.classList.remove('active');
    });
  });
}


/* ---------- CARROSSEL DE DEPOIMENTOS ---------- */
function inicializarCarrosselDepoimentos() {
  const track = document.getElementById('testimonialsTrack-v2');
  const dots = document.querySelectorAll('.carousel-dot-v2');
  const prevBtn = document.getElementById('carouselPrev-v2');
  const nextBtn = document.getElementById('carouselNext-v2');

  if (!track) return;

  let currentSlide = 0;
  const slides = document.querySelectorAll('.testimonial-slide-v2');
  const totalSlides = slides.length;

  function goToSlide(index) {
    currentSlide = (index + totalSlides) % totalSlides;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
  }

  prevBtn?.addEventListener('click', () => goToSlide(currentSlide - 1));
  nextBtn?.addEventListener('click', () => goToSlide(currentSlide + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => goToSlide(i)));

  // Auto-play de 7 segundos
  let autoPlay = setInterval(() => goToSlide(currentSlide + 1), 7000);

  track.parentElement.addEventListener('mouseenter', () => clearInterval(autoPlay));
  track.parentElement.addEventListener('mouseleave', () => {
    autoPlay = setInterval(() => goToSlide(currentSlide + 1), 7000);
  });

  // Touch/Swipe responsivo
  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      goToSlide(currentSlide + (diff > 0 ? 1 : -1));
    }
  }, { passive: true });
}


/* ---------- FAQ ACCORDION ---------- */
function inicializarFaqAccordion() {
  document.querySelectorAll('.faq-item-v2').forEach(item => {
    const question = item.querySelector('.faq-question-v2');
    const answer = item.querySelector('.faq-answer-v2');

    // Abre o primeiro FAQ por padrão se tiver a classe 'open'
    if (item.classList.contains('open') && answer) {
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }

    question?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      
      // Fecha todos os FAQs
      document.querySelectorAll('.faq-item-v2').forEach(i => {
        i.classList.remove('open');
        const ans = i.querySelector('.faq-answer-v2');
        if (ans) ans.style.maxHeight = '0px';
      });

      // Se o clicado estava fechado, abre-o
      if (!isOpen && answer) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}


/* ---------- SCROLL REVEAL E VIEWCONTENT ---------- */
function inicializarScrollObservers() {
  // Animação Counter
  function animateCounter(el) {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4); // Quartic ease-out
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
  }, { threshold: 0.3 });

  document.querySelectorAll('[data-target]').forEach(el => {
    counterObserver.observe(el);
  });

  // Scroll Reveal para fade-in-up
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, entry.target.dataset.delay || 0);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal-v2').forEach((el, i) => {
    el.dataset.delay = (i % 3) * 100; // escalonamento de atraso
    revealObserver.observe(el);
  });

  // Meta ViewContent (Seções Principais)
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

  ['beneficios', 'comparacao', 'calculadora'].forEach(id => {
    const el = document.getElementById(id);
    if (el) vcObserver.observe(el);
  });

  // Whatsapp Tooltip temporizado
  const wpTooltip = document.getElementById('wpTooltip-v2');
  if (wpTooltip) {
    setTimeout(() => {
      wpTooltip.style.display = 'block';
      setTimeout(() => {
        wpTooltip.style.display = 'none';
      }, 6000);
    }, 4000);
  }

  // Smooth Scroll para links internos
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
}
