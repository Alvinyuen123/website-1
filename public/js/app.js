async function refreshServiceStatuses() {
  const cards = Array.from(document.querySelectorAll('.service-card'));
  if (!cards.length) return;

  try {
    const response = await fetch('/api/services');
    const data = await response.json();
    if (!data.services) return;

    data.services.forEach((service, index) => {
      const card = cards[index];
      if (!card) return;
      const badge = card.querySelector('.status-badge');
      const meta = card.querySelector('.service-meta');
      if (badge) {
        badge.className = `status-badge status-${service.status}`;
        badge.textContent = service.status;
      }
      if (meta) {
        meta.innerHTML = `<span>${service.checkStatus ? 'Live checks enabled' : 'Live checks disabled'}</span><span>${service.lastResponseTime || 'n/a'}</span>`;
      }
    });
  } catch (error) {
    console.warn('Unable to refresh service statuses', error);
  }
}

function enablePreviewHints() {
  const cards = document.querySelectorAll('.service-card');
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  enablePreviewHints();
  refreshServiceStatuses();
  setInterval(refreshServiceStatuses, 60000);
});
