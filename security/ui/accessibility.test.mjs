import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../ui.js', import.meta.url), 'utf8');
function setup() {
  function element() {
    const classes = new Set();
    return {
      attrs: {}, listeners: {}, style: {}, inert: false,
      classList: {
        contains: name => classes.has(name),
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      focus() { this.focused = true; },
    };
  }
  const button = element(), menu = element(), link = element(), body = element();
  const main = element(), footer = element();
  const answers = [element(), element()];
  const items = answers.map(answer => ({...element(), querySelector: () => answer}));
  const questions = items.map(item => ({...element(), closest: () => item}));
  const events = {};
  const mobile = {matches: true, addEventListener: (_, fn) => events.media = fn};
  menu.querySelector = () => link;
  const document = {
    body, fonts: {ready: Promise.resolve()},
    getElementById: id => id === 'mobileMenuBtn' ? button : menu,
    querySelectorAll: selector => selector === 'main, footer' ? [main, footer] : questions,
    addEventListener: (name, fn) => events[name] = fn,
  };
  const window = {
    matchMedia: () => mobile,
    closeMobileMenu: () => menu.classList.toggle('open', false),
    addEventListener: (name, fn) => events[name] = fn,
  };
  vm.runInNewContext(source, {document, window, MutationObserver: class {
    constructor(fn) { events.mutation = fn; }
    observe() {}
  }});
  const open = () => { menu.classList.toggle('open', true); button.listeners.click(); };
  return {button, menu, link, main, footer, questions, items, answers, mobile, events, open};
}

test('opening the existing menu announces its state, focuses navigation and excludes covered content', () => {
  const s = setup(); s.open();
  assert.equal(s.button.attrs['aria-expanded'], 'true');
  assert.equal(s.link.focused, true);
  assert.equal(s.main.inert, true); assert.equal(s.footer.inert, true);
});
test('Escape closes an open menu, restores content and returns keyboard focus', () => {
  const s = setup(); s.open(); s.events.keydown({key: 'Escape'});
  assert.equal(s.menu.classList.contains('open'), false);
  assert.equal(s.button.attrs['aria-expanded'], 'false');
  assert.equal(s.main.inert, false); assert.equal(s.button.focused, true);
});
test('desktop resize does not leave the page inaccessible after mobile navigation', () => {
  const s = setup(); s.open(); s.mobile.matches = false; s.events.media();
  assert.equal(s.menu.classList.contains('open'), false);
  assert.equal(s.main.inert, false); assert.equal(s.footer.inert, false);
});
test('existing link closure restores access to page content', () => {
  const s = setup(); s.open(); s.menu.classList.toggle('open', false); s.events.mutation();
  assert.equal(s.button.attrs['aria-expanded'], 'false'); assert.equal(s.main.inert, false);
});
test('FAQ announces the selected answer and recalculates its height on resize', () => {
  const s = setup(); s.items[0].classList.toggle('open', true); s.answers[0].scrollHeight = 180;
  s.questions[0].listeners.click();
  assert.equal(s.questions[0].attrs['aria-expanded'], 'true');
  assert.equal(s.questions[1].attrs['aria-expanded'], 'false');
  s.answers[0].scrollHeight = 320; s.events.resize();
  assert.equal(s.answers[0].style.maxHeight, '320px');
  s.items[0].classList.toggle('open', false); s.items[1].classList.toggle('open', true);
  s.answers[1].scrollHeight = 120; s.questions[1].listeners.click();
  assert.equal(s.questions[0].attrs['aria-expanded'], 'false');
  assert.equal(s.questions[1].attrs['aria-expanded'], 'true');
});
