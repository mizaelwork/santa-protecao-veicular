/* ============================================================
   SANTA PROTEÇÃO VEICULAR — main-v2.js
   ============================================================ */

const WA_NUMERO = '554888533236';
const TEXTO_SITE_PADRAO = 'Olá! Vim pelo site da Santa e gostaria de saber mais sobre proteção veicular.';
const TEXTO_GOOGLE_PADRAO = 'Olá! Vim pelo Google e gostaria de saber mais sobre proteção veicular.';

// Endpoint do CAPI para rastreamento de servidor
const CAPI_ENDPOINT = '/api/capi';
const OBRIGADO_URL = `${window.location.origin}/obrigado`;

/* ---------- ORIGEM DA VISITA (gclid / UTMs) ---------- */
// Guardado na SESSÃO, não só lido da URL do momento: quem entra por um anúncio e navega até a
// calculadora antes de enviar já não tem o gclid na barra de endereços. Sem isso, o lead chega
// sem saber de qual campanha veio.
const CHAVES_TRACKING = [
  'gclid', 'gbraid', 'wbraid', 'fbclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
];

function coletarTracking() {
  let guardado = {};
  try {
    guardado = JSON.parse(sessionStorage.getItem('santa_tracking') || '{}');
  } catch (_) {}

  const p = new URLSearchParams(location.search);
  let mudou = false;

  CHAVES_TRACKING.forEach((chave) => {
    const valor = p.get(chave);
    // Só a PRIMEIRA ocorrência conta: a origem da visita é onde ela começou.
    if (valor && !guardado[chave]) {
      guardado[chave] = valor.slice(0, 120);
      mudou = true;
    }
  });

  if (!guardado.landing_url) {
    guardado.landing_url = location.href.slice(0, 500);
    mudou = true;
  }
  if (!guardado.referrer && document.referrer) {
    guardado.referrer = document.referrer.slice(0, 500);
    mudou = true;
  }

  if (mudou) {
    try { sessionStorage.setItem('santa_tracking', JSON.stringify(guardado)); } catch (_) {}
  }
  return guardado;
}

// Verifica se a visita tem origem no tráfego pago do Google
function veioDoGoogle() {
  const t = coletarTracking();
  return !!(t.gclid || t.gbraid || t.wbraid || (t.utm_source || '').toLowerCase() === 'google');
}

// Retorna a mensagem padrão baseada na origem
function obterMensagemPadrao() {
  return veioDoGoogle() ? TEXTO_GOOGLE_PADRAO : TEXTO_SITE_PADRAO;
}

// Constrói o link base do WhatsApp com mensagem customizada
function criarLinkWhatsapp(mensagem) {
  return `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(mensagem)}`;
}

function codificarBase64Url(json) {
  const utf8 = unescape(encodeURIComponent(json));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function montarTrackingObrigado() {
  const tracking = coletarTracking();
  return {
    landing_url: tracking.landing_url || location.href.slice(0, 500),
    referrer: tracking.referrer || document.referrer.slice(0, 500),
    utm_source: tracking.utm_source || undefined,
    utm_medium: tracking.utm_medium || undefined,
    utm_campaign: tracking.utm_campaign || undefined,
    utm_content: tracking.utm_content || undefined,
    utm_term: tracking.utm_term || undefined
  };
}

function montarUrlObrigado(eventId, nome, telefone, extras = {}) {
  const payload = {
    event_id: eventId,
    nome,
    telefone,
    lead_simulador: true,
    veiculo: extras.veiculo || undefined,
    opcionais: extras.opcionais && extras.opcionais.length ? extras.opcionais : undefined,
    tracking: montarTrackingObrigado(),
    sessao_id: typeof sessao === 'object' ? sessao.id : undefined,
    origem_simulacao: extras.origemSimulacao || undefined
  };

  return `${OBRIGADO_URL}#d=${codificarBase64Url(JSON.stringify(payload))}`;
}

/* ---------- RASTREAMENTO META E GOOGLE ADS (DEDUPLICADO) ---------- */
function trackLead(origemSimulacao = '', nome = '', telefone = '', extras = {}) {
  const eventId = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now() + '-' + Math.random().toString(16).slice(2));

  // Marca a visita como convertida: é o que separa, na medição, quem desistiu de quem pediu
  // cotação — sem isso o diagnóstico contaria o lead como "saiu sem fazer nada".
  if (typeof sessao === 'object') sessao.virouLead = true;

  // Pixel (navegador)
  if (typeof fbq === 'function') {
    fbq('track', 'Lead', {}, { eventID: eventId });
  }

  // Google Ads
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', { send_to: 'AW-10777457819/kzoICKrK0b8cEJvpi5Mo' });
  }

  // Lado Servidor (CAPI) — é por aqui que o lead vira registro no CRM e notificação no Telegram.
  const capiPromise = enviarCapi({
    event_name: 'Lead',
    event_id: eventId,
    lead_simulador: origemSimulacao || undefined,
    nome: nome || undefined,
    telefone: telefone || undefined,
    veiculo: extras.veiculo || undefined,
    opcionais: extras.opcionais && extras.opcionais.length ? extras.opcionais : undefined
  });

  return { eventId, capiPromise };
}

/* ---------- MEDIÇÃO DA VISITA (performance + engajamento) ---------- */
// Uma linha por visita no nosso banco, enviada na saída. Serve para responder por que quem não
// pediu cotação foi embora: se o site demorou a abrir (problema de velocidade) ou se abriu rápido
// e mesmo assim não convenceu (problema de conteúdo/oferta). As duas causas pedem ações opostas,
// e só dá para separá-las com os dois sinais medidos na MESMA visita.
//
// Não vai para a Meta e não carrega nenhum dado pessoal — é medição técnica anônima.
const SESSAO_ENDPOINT = 'https://gestao.angelcode.com.br/api/site/sessao';

const sessao = {
  id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2)),
  inicio: Date.now(),
  scrollMax: 0,
  ultimaSecao: null,
  interagiu: false,
  virouLead: false,
  lcp: null,
  enviada: false
};

function iniciarMedicaoSessao() {
  // LCP: quando o maior elemento da tela terminou de aparecer. É a métrica que o Google usa
  // para dizer se a página "abriu rápido" na percepção de quem está olhando.
  try {
    if (typeof PerformanceObserver === 'function') {
      const obs = new PerformanceObserver((lista) => {
        const entradas = lista.getEntries();
        const ultima = entradas[entradas.length - 1];
        if (ultima) sessao.lcp = Math.round(ultima.startTime);
      });
      obs.observe({ type: 'largest-contentful-paint', buffered: true });
    }
  } catch (_) {}

  // Profundidade de rolagem (0-100).
  let travado = false;
  window.addEventListener('scroll', () => {
    if (travado) return;
    travado = true;
    setTimeout(() => {
      travado = false;
      const altura = document.documentElement.scrollHeight - window.innerHeight;
      if (altura > 0) {
        const pct = Math.min(100, Math.round((window.scrollY / altura) * 100));
        if (pct > sessao.scrollMax) sessao.scrollMax = pct;
      }
    }, 250);
  }, { passive: true });

  // Interação real: clique ou digitação. Movimento de mouse não conta — o dedo passa pela tela
  // sem que a pessoa tenha feito nada.
  ['click', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, () => { sessao.interagiu = true; }, { passive: true, once: true });
  });

  // Última seção vista: onde a leitura parou.
  try {
    const obsSecao = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting && e.target.id) sessao.ultimaSecao = e.target.id;
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('section[id]').forEach((el) => obsSecao.observe(el));
  } catch (_) {}

  // Envio na saída. `visibilitychange → hidden` é o único evento confiável no mobile: o
  // `beforeunload` não dispara quando o app é trocado ou a aba é descartada.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') enviarSessao();
  });
  window.addEventListener('pagehide', enviarSessao);
}

/** Mesmo vocabulário do servidor: google | anuncio | site. */
function fonteDaVisita(t) {
  const source = (t.utm_source || '').toLowerCase();
  if (t.gclid || t.gbraid || t.wbraid || source === 'google') return 'google';
  if (t.fbclid || source === 'facebook' || source === 'instagram') return 'anuncio';
  return 'site';
}

function enviarSessao() {
  // O upsert no servidor é por sessao_id, então reenviar (voltou para a aba e saiu de novo) só
  // atualiza a mesma linha com o tempo e o scroll maiores.
  const t = coletarTracking();
  let ttfb = null, dom = null;
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      ttfb = Math.round(nav.responseStart);
      dom = Math.round(nav.domContentLoadedEventEnd);
    }
  } catch (_) {}

  const dados = {
    sessao_id: sessao.id,
    pagina: location.pathname,
    ttfb_ms: ttfb,
    dom_ms: dom,
    lcp_ms: sessao.lcp,
    duracao_ms: Date.now() - sessao.inicio,
    scroll_max: sessao.scrollMax,
    ultima_secao: sessao.ultimaSecao,
    interagiu: sessao.interagiu,
    virou_lead: sessao.virouLead,
    // Saiu com a página ainda carregando: o indício mais forte de desistência por lentidão.
    carregou: document.readyState === 'complete',
    fonte: fonteDaVisita(t),
    utm_campaign: t.utm_campaign || null,
    referrer: t.referrer || null
  };

  try {
    const corpo = JSON.stringify(dados);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(SESSAO_ENDPOINT, corpo);
    } else {
      fetch(SESSAO_ENDPOINT, { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
    }
    sessao.enviada = true;
  } catch (_) {}
}

/** POST no endpoint CAPI. keepalive garante o envio mesmo se a aba for fechada em seguida. */
function enviarCapi(dados) {
  try {
    return fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(Object.assign({
        event_source_url: window.location.href,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc'),
        tracking: coletarTracking()
      }, dados)),
    })
      .then((response) => response.ok)
      .catch(() => false);
  } catch (_) {}
  return Promise.resolve(false);
}

/**
 * Manda a visita também pelo servidor. O Pixel do navegador já dispara PageView, mas ele se perde
 * com bloqueador de anúncio, iOS e cookie negado — que é justamente o público que o CAPI recupera.
 *
 * Depende do `window.__pageViewId` criado no snippet do Pixel (<head>): é o mesmo id nos dois
 * lados, e é ele que faz a Meta entender que é UMA visita, não duas. Sem o id, não mandamos nada
 * — inflar o número seria pior que não medir.
 */
function rastrearPageView() {
  if (!window.__pageViewId) return;
  // Espera o fbevents.js gravar os cookies _fbp/_fbc: eles são o que liga a visita ao perfil.
  setTimeout(function () {
    enviarCapi({ event_name: 'PageView', event_id: window.__pageViewId });
  }, 1500);
}

/**
 * Trava de duplo clique. Cada clique gerava um Lead novo na Meta, uma conversão nova no Ads e
 * agora geraria também um push no Telegram — tudo pela mesma pessoa.
 */
function travarBotao(botao, ms = 3000) {
  if (!botao || botao.dataset.enviando === '1') return false;
  botao.dataset.enviando = '1';
  botao.disabled = true;
  setTimeout(() => {
    botao.dataset.enviando = '0';
    botao.disabled = false;
  }, ms);
  return true;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}


/* ---------- INICIALIZAÇÃO E EVENTOS ---------- */
document.addEventListener('DOMContentLoaded', () => {

  // 0. Visita pelo servidor (CAPI), deduplicada com o Pixel do navegador
  rastrearPageView();
  iniciarMedicaoSessao();

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

      if (!travarBotao(simularBtn)) return;

      const origemSimulacao = `Simulador_Hero_${veiculoSelecionado}`;
      const { eventId, capiPromise } = trackLead(origemSimulacao, nome, telefone, {
        veiculo: veiculoSelecionado
      });

      capiPromise.then((ok) => {
        if (!ok) {
          alert('Não conseguimos concluir o envio agora. Tente novamente em alguns instantes.');
          return;
        }

        window.location.assign(montarUrlObrigado(eventId, nome, telefone, {
          veiculo: veiculoSelecionado,
          origemSimulacao
        }));
      });
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

      if (!travarBotao(calcSimularBtn)) return;

      const itensNomes = Array.from(document.querySelectorAll('.calc-checkbox-item.checked'))
        .map(i => i.dataset.title)
        .filter(Boolean);

      const origemSimulacao = `Calculadora_Opcionais: ${itensNomes.join(',')}`;
      const { eventId, capiPromise } = trackLead(origemSimulacao, nome, telefone, {
        opcionais: itensNomes
      });

      capiPromise.then((ok) => {
        if (!ok) {
          alert('Não conseguimos concluir o envio agora. Tente novamente em alguns instantes.');
          return;
        }

        window.location.assign(montarUrlObrigado(eventId, nome, telefone, {
          opcionais: itensNomes,
          origemSimulacao
        }));
      });
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
  const dotsContainer = document.getElementById('carouselDots-v2');
  const prevBtn = document.getElementById('carouselPrev-v2');
  const nextBtn = document.getElementById('carouselNext-v2');

  if (!track) return;

  let currentSlide = 0;
  const slides = document.querySelectorAll('.testimonial-slide-v2');
  const totalSlides = slides.length;

  // Gera um dot por slide dinamicamente
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot-v2';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-selected', 'false');
    dot.setAttribute('aria-label', `Slide ${i + 1}`);
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
  });
  const dots = document.querySelectorAll('.carousel-dot-v2');

  const mqDesktop = window.matchMedia('(min-width: 769px)');

  function visibleCount() {
    return mqDesktop.matches ? 2 : 1;
  }

  function goToSlide(index) {
    currentSlide = (index + totalSlides) % totalSlides;
    track.style.transform = `translateX(-${currentSlide * slides[0].offsetWidth}px)`;
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === currentSlide);
      d.setAttribute('aria-selected', i === currentSlide ? 'true' : 'false');
    });
    const count = visibleCount();
    slides.forEach((s, i) => {
      const emView = (i - currentSlide + totalSlides) % totalSlides < count;
      s.classList.toggle('active-slide', emView);
    });
  }

  goToSlide(0);

  // Reajusta a posição (em px) se a janela for redimensionada
  window.addEventListener('resize', () => goToSlide(currentSlide));

  prevBtn?.addEventListener('click', () => goToSlide(currentSlide - 1));
  nextBtn?.addEventListener('click', () => goToSlide(currentSlide + 1));

  // Auto-play trocando uma imagem por vez
  let autoPlay = setInterval(() => goToSlide(currentSlide + 1), 4500);

  track.parentElement.addEventListener('mouseenter', () => clearInterval(autoPlay));
  track.parentElement.addEventListener('mouseleave', () => {
    autoPlay = setInterval(() => goToSlide(currentSlide + 1), 4500);
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
