const WA_NUMERO = '554888533236';
const CAPI_ENDPOINT = '/api/capi';

function gerarId(prefixo) {
  return `${prefixo}:${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function lerCookie(nome) {
  const inicio = document.cookie.split('; ').find((item) => item.startsWith(`${nome}=`));
  return inicio ? inicio.split('=').slice(1).join('=') : undefined;
}

function lerPayload() {
  const bruto = new URLSearchParams(location.hash.slice(1)).get('d');
  if (!bruto) return null;
  try {
    const base64 = bruto.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(Array.from(atob(base64), (letra) => `%${letra.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function enviarEvento(eventName, eventId, payload) {
  if (typeof fbq === 'function') fbq('track', eventName, {}, { eventID: eventId });
  return fetch(CAPI_ENDPOINT, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: eventName,
      event_id: eventId,
      event_source_url: `${location.origin}${location.pathname}`,
      fbp: lerCookie('_fbp'),
      fbc: lerCookie('_fbc'),
      // O telefone une esta etapa ao Lead original no painel. Sem ele, o evento era gravado
      // isoladamente e o funil sempre parecia parar no formulário.
      nome: payload?.nome,
      telefone: payload?.telefone,
      lead_simulador: payload?.origem_simulacao,
      veiculo: payload?.veiculo,
      opcionais: payload?.opcionais,
      tracking: payload?.tracking,
      custom_data: { lead_event_id: payload?.event_id }
    })
  }).catch(() => undefined);
}

const payload = lerPayload();
enviarEvento('CompleteRegistration', gerarId('complete-registration'), payload);

const whatsappButton = document.getElementById('whatsapp-button');
const mensagem = payload?.veiculo
  ? `Olá! Acabei de solicitar uma simulação para ${payload.veiculo} e gostaria de continuar meu atendimento.`
  : 'Olá! Acabei de solicitar uma simulação e gostaria de continuar meu atendimento.';

whatsappButton.href = `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(mensagem)}`;
whatsappButton.addEventListener('click', () => {
  enviarEvento('Contact', gerarId('contact'), payload);
});
