document.body.classList.add('js-loaded');

/* ── TRACKING: terra_eid + fbc cookies ── */
(function() {
  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m[2] : null;
  }

  function setCookie(name, value, maxAge, sameSite) {
    document.cookie = name + '=' + value + ';path=/;max-age=' + maxAge + ';SameSite=' + (sameSite || 'Lax');
  }

  // Bloque A: terra_eid (deduplicación CAPI)
  var eid = getCookie('terra_eid');
  if (!eid) {
    eid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'terra_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setCookie('terra_eid', eid, 1800); // 30 min
  }
  window.terra_eid = eid;

  // Bloque B: fbc (Facebook Click ID)
  try {
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get('fbclid');
    if (fbclid && !getCookie('_fbc')) {
      var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbc, 7776000); // 90 días
    }
  } catch(e) { /* URLSearchParams not supported — skip */ }

  // Función helper: getCAPIUserData
  window.getCAPIUserData = function() {
    return {
      fbc: getCookie('_fbc') || null,
      fbp: getCookie('_fbp') || null,
      event_id: getCookie('terra_eid') || null
    };
  };
})();

/* ── NAV SCROLL ── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
});

/* ── MOBILE MENU ── */
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
mobileMenuBtn.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});
function closeMobileMenu() {
  mobileMenu.classList.remove('open');
}

/* ── FADE UP ON SCROLL ── */
const fadeEls = document.querySelectorAll('.fade-up');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const delay = Array.from(entry.target.parentElement.children).indexOf(entry.target) * 80;
      setTimeout(() => entry.target.classList.add('visible'), delay);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
fadeEls.forEach(el => observer.observe(el));

/* ── COUNT UP ANIMATION ── */
function animateCount(el) {
  const target = parseInt(el.getAttribute('data-count'));
  const duration = 1600;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
const countEls = document.querySelectorAll('[data-count]');
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCount(entry.target);
      countObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });
countEls.forEach(el => countObserver.observe(el));

/* ── FAQ ACCORDION ── */
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const answer = item.querySelector('.faq-answer');
  const isOpen = item.classList.contains('open');

  // Cerrar todos los abiertos
  document.querySelectorAll('.faq-item.open').forEach(openItem => {
    openItem.classList.remove('open');
    openItem.querySelector('.faq-answer').style.maxHeight = '0';
  });

  // Abrir el clickeado si estaba cerrado
  if (!isOpen) {
    item.classList.add('open');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
}

/* ── EQUIP CAROUSEL ── */
let currentSlide = 0;
const totalSlides = 4;

function updateCarousel() {
  const carousel = document.getElementById('equipCarousel');
  const dots = document.querySelectorAll('.equip-dot');
  carousel.style.transform = `translateX(-${currentSlide * 100}%)`;
  dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
}

function goToSlide(index) {
  currentSlide = index;
  updateCarousel();
}

document.getElementById('equipNext').addEventListener('click', () => {
  currentSlide = (currentSlide + 1) % totalSlides;
  updateCarousel();
});

document.getElementById('equipPrev').addEventListener('click', () => {
  currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
  updateCarousel();
});

let autoplay = setInterval(() => {
  currentSlide = (currentSlide + 1) % totalSlides;
  updateCarousel();
}, 4000);

document.getElementById('equipCarousel').addEventListener('mouseenter', () => clearInterval(autoplay));
document.getElementById('equipCarousel').addEventListener('mouseleave', () => {
  autoplay = setInterval(() => {
    currentSlide = (currentSlide + 1) % totalSlides;
    updateCarousel();
  }, 4000);
});

// Swipe táctil mobile
(function() {
  const carousel = document.getElementById('equipCarousel');
  let startX = 0;
  carousel.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      currentSlide = diff > 0
        ? (currentSlide + 1) % totalSlides
        : (currentSlide - 1 + totalSlides) % totalSlides;
      updateCarousel();
    }
  });
})();

/* ── FORM SUBMIT ── */
async function handleSubmit(e) {
  e.preventDefault();

  // Generar nuevo terra_eid para este submit (deduplicación CAPI)
  const eventId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'terra_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  document.cookie = 'terra_eid=' + eventId + ';path=/;max-age=1800;SameSite=Lax';
  window.terra_eid = eventId;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'terra_form_submit-02',
    terra_event_id: eventId
  });

  const btn = e.target.querySelector('.form-submit');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Enviando...`;

  const PORTAL_ID = "50951167";
  const FORM_ID   = "098cb86d-732c-44b7-869c-4df7ab498aee";
  const HUBSPOT_URL = `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_ID}`;

  const data = Object.fromEntries(new FormData(e.target).entries());

  // Captura señales para Meta CAPI (EMQ boost)
  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m[2] : null;
  }
  let clientIp = '';
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
    if (ipRes.ok) clientIp = (await ipRes.json()).ip || '';
  } catch (_) { /* ipify timeout/fail — seguir sin client_ip */ }

  const requestBody = {
    fields: [
      { name: "firstname", value: data.nombre },
      { name: "lastname",  value: data.apellido },
      { name: "email",     value: data.email },
      { name: "phone",     value: `${data.codarea} ${data.telefono}` },
      { name: "terra_event_id", value: eventId },
      { name: "fbc", value: getCookie('_fbc') || '' },
      { name: "fbp", value: getCookie('_fbp') || '' },
      { name: "client_ip", value: clientIp },
      { name: "client_user_agent", value: navigator.userAgent || '' }
    ],
    context: {
      pageUri:  window.location.href,
      pageName: document.title
    }
  };

  try {
    const response = await fetch(HUBSPOT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(requestBody)
    });

    if (response.ok) {
      fbq('init', '689271596885956', {
        em: data.email,
        ph: data.codarea + data.telefono,
        fn: data.nombre,
        ln: data.apellido
      });
      // FIX 2026-05-28: navigate race fix + value alineado con WF1 server (default Terra promedio kits 394738 ARS)
      // eventCallback espera el beacon Pixel antes de navegar; eventTimeout 2s evita quedar colgado si Meta no responde.
      fbq('track', 'Lead', {
        value: 394738,
        currency: 'ARS',
        event_id: eventId
      }, {
        eventCallback: function() {
          window.location.href = 'gracias.html';
        },
        eventTimeout: 2000
      });
    } else {
      console.error("Error HubSpot:", response.status);
      showFormError(btn, originalText, "❌ Hubo un error al enviar tus datos. Intentá nuevamente.");
    }
  } catch (error) {
    console.error("Error de conexión:", error);
    showFormError(btn, originalText, "❌ No se pudo conectar con el servidor.");
  }
}

function showFormError(btn, originalText, msg) {
  btn.disabled = false;
  btn.innerHTML = originalText;
  const existing = document.getElementById('formError');
  if (existing) existing.remove();
  const p = document.createElement('p');
  p.id = 'formError';
  p.style.cssText = 'color:#ef4444;font-size:.85rem;text-align:center;margin-top:10px;';
  p.textContent = msg;
  btn.parentNode.insertBefore(p, btn.nextSibling);
}

/* ── COPY EMAIL ── */
function copyEmail(e) {
  e.preventDefault();
  const el = e.target;
  const email = 'terra@serviciosmx.com';

  navigator.clipboard.writeText(email).then(() => {
    el.textContent = '¡Copiado!';
    el.style.color = '#4ade80';
    setTimeout(() => {
      el.textContent = email;
      el.style.color = '';
    }, 2000);
  });
}