// ---------- Contact panel ----------
// One panel shared by every page: the markup is injected here instead of being
// pasted into index/works/klever, so the form only ever lives in one place.
// Triggers are any element carrying [data-contact-open] (the "WORK WITH US"
// links and the menu's CONTACT link); their href stays a working mailto so the
// page still does something useful if this script never runs.

// Web3Forms relays the submission to the inbox registered against this key, so
// the destination address never appears in the source. The key is meant to live
// in front-end code — it only allows posting to this one form, nothing else.
const ACCESS_KEY = '69fa2a7a-674a-4e6c-9475-441fb753facf';
const SUBMIT_ENDPOINT = 'https://api.web3forms.com/submit';

// mirrors the services list on the home page
const HELP_OPTIONS = ['PRODUCT DESIGN', 'BRAND DESIGN', 'WEBSITES', 'GAME DESIGN', 'MOTION VIDEO'];
const SOURCE_OPTIONS = ['REFERRAL', 'BEHANCE', 'TWITTER', 'OTHER'];
const BUDGET_OPTIONS = ['UNDER $5K', '$5K — $15K', '$15K — $30K', '$30K — $50K', '$50K+', 'NOT SURE YET'];

const chips = (name, options) => options.map((opt, i) => `
  <label class="cpanel__chip">
    <input type="radio" name="${name}" value="${opt}"${name === 'help' ? ' required' : ''}>
    <span>${opt}</span>
  </label>
`).join('');

const panel = document.createElement('div');
panel.className = 'cpanel';
panel.id = 'contactPanel';
panel.setAttribute('aria-hidden', 'true');
panel.innerHTML = `
  <div class="cpanel__scrim" data-contact-close></div>
  <aside class="cpanel__sheet" role="dialog" aria-modal="true" aria-labelledby="cpanelTitle">
    <form class="cpanel__form" id="contactForm">
      <!-- only this part scrolls, so the submit bar below stays put.
           data-lenis-prevent hands the wheel back to the browser — without it
           Lenis swallows it and the sheet can only be dragged by its scrollbar. -->
      <div class="cpanel__body" data-lenis-prevent>
      <header class="cpanel__head">
        <h2 class="cpanel__title" id="cpanelTitle">Contact Us</h2>
        <button type="button" class="cpanel__close" data-contact-close aria-label="Close contact form">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 L21 21 M21 3 L3 21"/></svg>
        </button>
      </header>

      <p class="cpanel__lede">We're always looking for a challenge.<br>Got a project in mind?</p>
      <hr class="cpanel__rule">

      <div class="cpanel__grid">
        <input class="cpanel__input" type="text" name="name" placeholder="NAME" required autocomplete="name">
        <input class="cpanel__input" type="text" name="company" placeholder="COMPANY" autocomplete="organization">
      </div>
      <input class="cpanel__input" type="email" name="email" placeholder="EMAIL" required autocomplete="email">

      <fieldset class="cpanel__set">
        <legend class="cpanel__label">How can we help you?</legend>
        <div class="cpanel__chips">${chips('help', HELP_OPTIONS)}</div>
      </fieldset>

      <textarea class="cpanel__input cpanel__textarea" name="brief" placeholder="TELL US ABOUT YOUR PROJECT" rows="5"></textarea>

      <div class="cpanel__select-wrap">
        <select class="cpanel__input cpanel__select" name="budget">
          <option value="" disabled selected>WHAT BUDGET DO YOU HAVE?</option>
          ${BUDGET_OPTIONS.map((b) => `<option value="${b}">${b}</option>`).join('')}
        </select>
        <span class="cpanel__caret" aria-hidden="true">▾</span>
      </div>

      <fieldset class="cpanel__set">
        <legend class="cpanel__label">Where did you find us?</legend>
        <div class="cpanel__chips">${chips('source', SOURCE_OPTIONS)}</div>
      </fieldset>
      </div>

      <!-- bots fill every field they find; a real visitor never sees this one -->
      <input type="checkbox" name="botcheck" class="cpanel__botcheck" tabindex="-1" autocomplete="off">

      <button type="submit" class="cpanel__submit">
        <span class="cpanel__submit-label">SUBMIT A FORM</span>
        <span class="cpanel__submit-arrow" aria-hidden="true">→</span>
      </button>
    </form>
  </aside>
`;
document.body.appendChild(panel);

const form = panel.querySelector('#contactForm');
const sheet = panel.querySelector('.cpanel__sheet');
let lastFocused = null;

const focusables = () =>
  [...sheet.querySelectorAll('input,select,textarea,button,a[href]')].filter(
    (el) => !el.disabled && el.offsetParent !== null
  );

function openPanel() {
  lastFocused = document.activeElement;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  // Lenis keeps scrolling the page behind a fixed overlay unless it's paused
  if (typeof lenis !== 'undefined' && lenis) lenis.stop();
  setTimeout(() => focusables()[0]?.focus(), 500);
}

function closePanel() {
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (typeof lenis !== 'undefined' && lenis) lenis.start();
  lastFocused?.focus();
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-contact-open]');
  if (trigger) {
    e.preventDefault();
    // the menu overlay sits underneath; step out of it on the way in
    document.getElementById('menuOverlay')?.classList.remove('is-open');
    openPanel();
    return;
  }
  if (e.target.closest('[data-contact-close]')) closePanel();
});

document.addEventListener('keydown', (e) => {
  if (!panel.classList.contains('is-open')) return;
  if (e.key === 'Escape') { closePanel(); return; }
  if (e.key !== 'Tab') return;
  // keep tabbing inside the sheet while it's the modal layer
  const items = focusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

const submitBtn = panel.querySelector('.cpanel__submit');
const submitLabel = panel.querySelector('.cpanel__submit-label');

// the whole sheet is the form, so the button itself carries the status —
// nothing else has to appear or shift around
function setSubmitState(state, label) {
  submitBtn.classList.remove('is-sending', 'is-sent', 'is-error');
  if (state) submitBtn.classList.add(state);
  submitBtn.disabled = state === 'is-sending';
  submitLabel.textContent = label;
}

let sending = false;

// Native validation runs first, so this only fires once the required fields
// (name, email, one service) are filled — same behaviour as the reference form.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  sending = true;
  setSubmitState('is-sending', 'SENDING…');

  const data = new FormData(form);
  const payload = {
    access_key: ACCESS_KEY,
    subject: `New project enquiry — ${data.get('name')}`,
    from_name: '957 — website',
    name: data.get('name'),
    email: data.get('email'),
    company: data.get('company') || '—',
    service: data.get('help'),
    budget: data.get('budget') || '—',
    found_us_via: data.get('source') || '—',
    message: data.get('brief') || '—',
    botcheck: data.get('botcheck') ? 'true' : '',
  };

  try {
    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Web3Forms rejected the submission');

    setSubmitState('is-sent', 'SENT — THANK YOU');
    form.reset();
    // let the confirmation land before the sheet slides away
    setTimeout(() => {
      closePanel();
      setTimeout(() => setSubmitState('', 'SUBMIT A FORM'), 700);
    }, 1600);
  } catch (err) {
    // keep everything they typed on screen so the retry costs nothing
    console.error('Contact form failed:', err);
    setSubmitState('is-error', "DIDN'T SEND — TAP TO RETRY");
  } finally {
    sending = false;
  }
});
