const CAPI_ENDPOINT = 'https://gestao.angelcode.com.br/api/capi';
const SESSAO_ENDPOINT = 'https://gestao.angelcode.com.br/api/site/sessao';
const OBRIGADO_URL = `${window.location.origin}/obrigado`;

const CHAVES_TRACKING = [
  'gclid', 'gbraid', 'wbraid', 'fbclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
];

const sessao = {
  id: (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  inicio: Date.now(),
  scrollMax: 0,
  ultimaSecao: null,
  interagiu: false,
  virouLead: false,
  lcp: null
};

function coletarTracking() {
  let guardado = {};
  try {
    guardado = JSON.parse(sessionStorage.getItem('santa_tracking') || '{}');
  } catch (_) {}

  const params = new URLSearchParams(window.location.search);
  let mudou = false;

  CHAVES_TRACKING.forEach((chave) => {
    const valor = params.get(chave);
    if (valor && !guardado[chave]) {
      guardado[chave] = valor.slice(0, 120);
      mudou = true;
    }
  });

  if (!guardado.landing_url) {
    guardado.landing_url = window.location.href.slice(0, 500);
    mudou = true;
  }

  if (!guardado.referrer && document.referrer) {
    guardado.referrer = document.referrer.slice(0, 500);
    mudou = true;
  }

  if (mudou) {
    try {
      sessionStorage.setItem('santa_tracking', JSON.stringify(guardado));
    } catch (_) {}
  }

  return guardado;
}

function codificarBase64Url(json) {
  const utf8 = unescape(encodeURIComponent(json));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function montarTrackingObrigado() {
  const tracking = coletarTracking();
  return {
    landing_url: tracking.landing_url || window.location.href.slice(0, 500),
    referrer: tracking.referrer || document.referrer.slice(0, 500),
    utm_source: tracking.utm_source || undefined,
    utm_medium: tracking.utm_medium || undefined,
    utm_campaign: tracking.utm_campaign || undefined,
    utm_content: tracking.utm_content || undefined,
    utm_term: tracking.utm_term || undefined
  };
}

function montarUrlObrigado(eventId, nome, telefone, veiculo) {
  const payload = {
    event_id: eventId,
    nome,
    telefone,
    lead_formulario: true,
    lead_simulador: false,
    veiculo,
    tracking: montarTrackingObrigado(),
    sessao_id: sessao.id,
    origem_simulacao: `Formulario_Direto_${veiculo}`
  };

  return `${OBRIGADO_URL}#d=${codificarBase64Url(JSON.stringify(payload))}`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

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
      }, dados))
    })
      .then((response) => response.ok)
      .catch(() => false);
  } catch (_) {
    return Promise.resolve(false);
  }
}

function rastrearPageView() {
  if (!window.__pageViewId) return;
  setTimeout(() => {
    enviarCapi({ event_name: 'PageView', event_id: window.__pageViewId });
  }, 1500);
}

function fonteDaVisita(tracking) {
  const source = (tracking.utm_source || '').toLowerCase();
  if (tracking.gclid || tracking.gbraid || tracking.wbraid || source === 'google') return 'google';
  if (tracking.fbclid || source === 'facebook' || source === 'instagram') return 'anuncio';
  return 'site';
}

function iniciarMedicaoSessao() {
  try {
    if (typeof PerformanceObserver === 'function') {
      const observer = new PerformanceObserver((lista) => {
        const entradas = lista.getEntries();
        const ultima = entradas[entradas.length - 1];
        if (ultima) sessao.lcp = Math.round(ultima.startTime);
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    }
  } catch (_) {}

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

  ['click', 'keydown'].forEach((evento) => {
    window.addEventListener(evento, () => {
      sessao.interagiu = true;
    }, { passive: true, once: true });
  });

  try {
    const observer = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting && entrada.target.id) {
          sessao.ultimaSecao = entrada.target.id;
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('section[id]').forEach((elemento) => observer.observe(elemento));
  } catch (_) {}

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') enviarSessao();
  });
  window.addEventListener('pagehide', enviarSessao);
}

function enviarSessao() {
  const tracking = coletarTracking();
  let ttfb = null;
  let dom = null;

  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      ttfb = Math.round(nav.responseStart);
      dom = Math.round(nav.domContentLoadedEventEnd);
    }
  } catch (_) {}

  const payload = {
    sessao_id: sessao.id,
    pagina: window.location.pathname,
    ttfb_ms: ttfb,
    dom_ms: dom,
    lcp_ms: sessao.lcp,
    duracao_ms: Date.now() - sessao.inicio,
    scroll_max: sessao.scrollMax,
    ultima_secao: sessao.ultimaSecao,
    interagiu: sessao.interagiu,
    virou_lead: sessao.virouLead,
    carregou: document.readyState === 'complete',
    fonte: fonteDaVisita(tracking),
    utm_campaign: tracking.utm_campaign || null,
    referrer: tracking.referrer || null
  };

  try {
    const corpo = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(SESSAO_ENDPOINT, corpo);
    } else {
      fetch(SESSAO_ENDPOINT, { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
    }
  } catch (_) {}
}

function trackLead(nome, telefone, veiculo) {
  const eventId = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  sessao.virouLead = true;

  if (typeof fbq === 'function') {
    fbq('track', 'Lead', {}, { eventID: eventId });
  }

  if (typeof gtag === 'function') {
    gtag('event', 'conversion', { send_to: 'AW-10777457819/kzoICKrK0b8cEJvpi5Mo' });
  }

  return {
    eventId,
    capiPromise: enviarCapi({
      event_name: 'Lead',
      event_id: eventId,
      lead_formulario: true,
      nome,
      telefone,
      veiculo
    })
  };
}

function aplicarMascaraTelefone(input) {
  if (!input) return;

  const formatar = (valor) => {
    const digitos = valor.replace(/\D/g, '').slice(0, 11);
    if (!digitos) return '';
    if (digitos.length <= 2) return `(${digitos}`;
    if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
    if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  };

  input.addEventListener('input', (event) => {
    event.target.value = formatar(event.target.value);
  });

  input.addEventListener('keypress', (event) => {
    if (!/[0-9]/.test(event.key) && event.key !== 'Enter') {
      event.preventDefault();
    }
  });
}

function inicializarSeletorVeiculo() {
  const botoes = document.querySelectorAll('.vehicle-option');
  let tipoSelecionado = 'Carro';

  botoes.forEach((botao) => {
    botao.addEventListener('click', () => {
      tipoSelecionado = botao.dataset.type || 'Carro';
      botoes.forEach((item) => {
        const ativo = item === botao;
        item.classList.toggle('is-active', ativo);
        item.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      });
    });
  });

  return () => tipoSelecionado;
}

function travarBotao(botao, travado) {
  if (!botao) return;
  botao.disabled = travado;
  botao.dataset.loading = travado ? '1' : '0';
}

function inicializarFormulario() {
  const form = document.getElementById('leadForm');
  const nomeInput = document.getElementById('leadNome');
  const telefoneInput = document.getElementById('leadTelefone');
  const submitBtn = document.getElementById('leadSubmitBtn');
  const obterVeiculo = inicializarSeletorVeiculo();

  aplicarMascaraTelefone(telefoneInput);

  form?.addEventListener('submit', (event) => {
    event.preventDefault();

    const nome = nomeInput?.value.trim() || '';
    const telefone = telefoneInput?.value.trim() || '';
    const veiculo = obterVeiculo();
    const digitos = telefone.replace(/\D/g, '');

    if (nome.length < 2) {
      alert('Por favor, digite o seu nome para continuar.');
      nomeInput?.focus();
      return;
    }

    if (digitos.length < 10) {
      alert('Por favor, digite um número de WhatsApp válido com DDD.');
      telefoneInput?.focus();
      return;
    }

    if (submitBtn?.dataset.loading === '1') return;
    travarBotao(submitBtn, true);

    const { eventId, capiPromise } = trackLead(nome, telefone, veiculo);

    capiPromise.then((ok) => {
      if (!ok) {
        alert('Não conseguimos concluir o envio agora. Tente novamente em alguns instantes.');
        travarBotao(submitBtn, false);
        return;
      }

      window.location.assign(montarUrlObrigado(eventId, nome, telefone, veiculo));
    });
  });
}

function inicializarReveal() {
  const elementos = document.querySelectorAll('.reveal');
  if (!elementos.length) return;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    elementos.forEach((elemento) => elemento.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      const delay = Number(entrada.target.dataset.delay || 0);
      setTimeout(() => {
        entrada.target.classList.add('is-visible');
      }, delay);
      observer.unobserve(entrada.target);
    });
  }, { threshold: 0.12 });

  elementos.forEach((elemento) => observer.observe(elemento));
}

function inicializarVideoSobDemanda() {
  const acionador = document.querySelector('.video-on-demand');
  if (!acionador) return;

  acionador.addEventListener('click', () => {
    const src = acionador.dataset.videoSrc;
    if (!src) return;

    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', 'Depoimento em vídeo: indenização paga em 2 dias úteis');
    video.src = src;

    acionador.replaceWith(video);
    video.play().catch(() => {});
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  coletarTracking();
  rastrearPageView();
  iniciarMedicaoSessao();
  inicializarFormulario();
  inicializarReveal();
  inicializarVideoSobDemanda();
});
