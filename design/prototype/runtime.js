/* serend prototype runtime: renders the .dc page templates standalone.
   Supports {{holes}}, <sc-for>, <sc-if>, on* handlers and a React-like
   class Component extends DCLogic { renderVals() } with setState.
   URL params become props (?theme=dark|light|system&language=de|en).
   ?_state={"view":"list"} merges initial state, ?export=1 disables intro
   animations for screenshots. */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) {
      const n = typeof p === 'function' ? p(this.state, this.props) : p;
      this.state = Object.assign({}, this.state, n);
      if (window.__rerender) window.__rerender();
    }
    forceUpdate() { if (window.__rerender) window.__rerender(); }
  }
  window.DCLogic = DCLogic;

  const RE = /\{\{([^}]+)\}\}/g;
  const WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    const parts = path.split('.');
    for (const s of scopes) {
      if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
        let v = s[parts[0]];
        for (let i = 1; i < parts.length; i++) v = v == null ? undefined : v[parts[i]];
        return v;
      }
    }
    return undefined;
  }
  const interp = (str, scopes) => str.replace(RE, (m, p) => { const v = lookup(p, scopes); return v == null ? '' : String(v); });

  function render(node, scopes, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.nodeValue, scopes))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      const list = lookup(WHOLE.exec(node.getAttribute('list'))[1], scopes) || [];
      const as = node.getAttribute('as') || 'item';
      list.forEach((it, i) => { const sc = { $index: i }; sc[as] = it; for (const c of node.childNodes) render(c, [sc, ...scopes], out); });
      return;
    }
    if (tag === 'sc-if') {
      if (lookup(WHOLE.exec(node.getAttribute('value'))[1], scopes)) for (const c of node.childNodes) render(c, scopes, out);
      return;
    }
    const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
    const el = svg ? document.createElementNS(node.namespaceURI, node.tagName) : document.createElement(tag);
    for (const a of node.attributes) {
      const name = a.name, val = a.value, m = WHOLE.exec(val);
      if (name === 'key' || name.startsWith('hint-')) continue;
      if (/^on[a-z]+$/i.test(name)) {
        if (m) { const fn = lookup(m[1], scopes); if (typeof fn === 'function') el.addEventListener(name.slice(2).toLowerCase(), fn); }
        continue;
      }
      if (m) {
        const v = lookup(m[1], scopes);
        if (v === false || v == null) continue;
        if (v === true) { el.setAttribute(name, ''); continue; }
        if (name === 'value' && tag === 'input') el.value = String(v);
        el.setAttribute(name, String(v));
        continue;
      }
      el.setAttribute(name, val.includes('{{') ? interp(val, scopes) : val);
    }
    for (const c of node.childNodes) render(c, scopes, el);
    out.appendChild(el);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const xdc = document.querySelector('x-dc');
    const helmet = xdc.querySelector('helmet');
    if (helmet) { for (const c of [...helmet.children]) document.head.appendChild(c); helmet.remove(); }
    const base = document.createElement('style');
    base.textContent = 'x-dc{display:block}';
    document.head.appendChild(base);
    const q = new URLSearchParams(location.search);
    if (q.get('export')) {
      const s = document.createElement('style');
      s.textContent = '.curtain,.progress{display:none!important}' +
        '.fade,.reveal,.g,.lr,.card,.case{opacity:1!important;transform:none!important;animation:none!important}' +
        '.mask>span,.w>span{transform:none!important;animation:none!important}' +
        '.portrait img,.zoom img{animation:none!important;transform:none!important}';
      document.head.appendChild(s);
    }
    const tpl = document.createElement('div');
    while (xdc.firstChild) tpl.appendChild(xdc.firstChild);
    const props = {};
    q.forEach((v, k) => { if (k !== '_state' && k !== 'export') props[k] = v; });
    const src = document.querySelector('script[data-dc-script]').textContent;
    const Comp = new Function('DCLogic', src + ';return Component;')(DCLogic);
    const inst = new Comp(props);
    if (q.get('_state')) { try { Object.assign(inst.state, JSON.parse(q.get('_state'))); } catch (e) {} }
    window.__rerender = () => {
      const frag = document.createDocumentFragment();
      const vals = inst.renderVals();
      for (const c of tpl.childNodes) render(c, [vals], frag);
      xdc.replaceChildren(frag);
    };
    window.__rerender();
    Promise.resolve(document.fonts && document.fonts.ready).then(() => setTimeout(() => {
      document.documentElement.setAttribute('data-h', String(document.documentElement.scrollHeight));
      document.title = 'H=' + document.documentElement.scrollHeight;
    }, 400));
  });
})();
