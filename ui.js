/* Accesibilidad de navegación. No interviene en formularios ni medición. */
(() => {
  const button = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  const mobile = window.matchMedia('(max-width: 768px)');
  const background = [...document.querySelectorAll('main, footer')];
  const previousInert = background.map(element => element.inert);

  function syncMenu() {
    const open = mobile.matches && menu.classList.contains('open');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    document.body.classList.toggle('mobile-menu-open', open);
    background.forEach((element, index) => {
      element.inert = open || previousInert[index];
    });
  }

  button.addEventListener('click', () => {
    syncMenu();
    if (menu.classList.contains('open')) menu.querySelector('a')?.focus();
  });
  new MutationObserver(syncMenu).observe(menu, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      window.closeMobileMenu();
      syncMenu();
      button.focus();
    }
  });
  mobile.addEventListener('change', () => {
    if (!mobile.matches) window.closeMobileMenu();
    syncMenu();
  });
  syncMenu();

  const questions = [...document.querySelectorAll('.faq-question')];
  function syncQuestions() {
    questions.forEach(question => {
      const item = question.closest('.faq-item');
      const open = item.classList.contains('open');
      question.setAttribute('aria-expanded', String(open));
      if (open) {
        const answer = item.querySelector('.faq-answer');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  }
  questions.forEach(question => question.addEventListener('click', syncQuestions));
  window.addEventListener('resize', syncQuestions);
  document.fonts?.ready.then(syncQuestions);
})();
