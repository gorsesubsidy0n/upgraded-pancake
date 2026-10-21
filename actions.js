// ============================================================
//  INSPIRE HABITS — actions.js
//  CSP-safe replacement for inline onclick / onchange handlers.
//
//  Markup carries data-onclick="fn(1,'x')" (and data-onchange,
//  data-oninput, data-onkeydown) instead of onclick="…". One delegated
//  listener per event type finds the nearest attribute, parses the tiny
//  expression language below and calls the named global function.
//
//  This lets index.html ship a Content-Security-Policy with no
//  'unsafe-inline' for scripts, so injected markup cannot run code.
//
//  Supported expressions (and nothing else — there is no eval):
//    statements separated by ;
//    if (cond) stmt   |   if (cond) { stmts }
//    callee(args)     where callee is one of the app's own global
//                     functions, or a small set of harmless element /
//                     event methods (this.focus(), event.preventDefault(),
//                     document.getElementById('x') …)
//    args             'str' "str" 12 true false null this event
//                     a.b.c member chains, nested calls, !x, x===y, x!==y
//  An attribute is markup, and markup can end up carrying user data, so
//  nothing here can reach the window, storage, navigation or the browser's
//  own functions (open, eval, fetch …) even if an attacker writes the text.
//  Load order: this file must come before any markup is rendered.
// ============================================================
(function () {
  'use strict';

  // Property names that lead to the window, the page's storage, navigation
  // or markup injection. Refused wherever they appear in a member chain.
  const BLOCKED = new Set([
    'constructor', '__proto__', 'prototype', '__defineGetter__', '__defineSetter__',
    '__lookupGetter__', '__lookupSetter__',
    'defaultView', 'ownerDocument', 'parentWindow', 'window', 'self', 'globalThis',
    'top', 'parent', 'opener', 'frames', 'contentWindow', 'contentDocument',
    'location', 'localStorage', 'sessionStorage', 'indexedDB', 'cookie', 'domain',
    'open', 'write', 'writeln', 'execCommand', 'insertAdjacentHTML', 'setAttribute',
    'setAttributeNS', 'innerHTML', 'outerHTML', 'srcdoc', 'navigator', 'caches',
    'serviceWorker', 'eval', 'Function', 'call', 'apply', 'bind',
  ]);
  // Bare names that must never be called even if something defines them.
  const BLOCKED_GLOBALS = new Set([
    'eval', 'Function', 'setTimeout', 'setInterval', 'requestAnimationFrame',
    'queueMicrotask', 'open', 'close', 'fetch', 'importScripts', 'postMessage',
    'alert', 'confirm', 'prompt', 'print', 'stop', 'focus', 'blur',
    'window', 'globalThis', 'self', 'top', 'parent', 'frames', 'document',
    'location', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator',
    'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker', 'EventSource',
    'Object', 'Reflect', 'Proxy', 'Promise', 'Symbol', 'Array', 'String',
  ]);
  // Methods that may be called on this / event / an element. They only
  // move focus, toggle classes or look things up.
  const SAFE_METHODS = new Set([
    'preventDefault', 'stopPropagation', 'focus', 'blur', 'select', 'click',
    'scrollIntoView', 'closest', 'matches', 'contains', 'getAttribute',
    'hasAttribute', 'add', 'remove', 'toggle', 'getElementById', 'querySelector',
  ]);
  const DOC_METHODS = new Set(['getElementById', 'querySelector']);
  const fnToString = Function.prototype.toString;
  const isNative = f => {
    try { return /\[native code\]\s*\}\s*$/.test(fnToString.call(f)); } catch (e) { return true; }
  };
  const cache = new Map();

  // A method call is allowed only on the event, on document (lookups only),
  // on a class list, or on an element — never on a window or a plain value.
  function checkMethodCall(self, name, ctx) {
    if (self == null) throw new Error('blocked');
    if (self === ctx.ev) {
      if (name === 'preventDefault' || name === 'stopPropagation') return;
    } else if (typeof document !== 'undefined' && self === document) {
      if (DOC_METHODS.has(name)) return;
    } else if (name === 'add' || name === 'remove' || name === 'toggle' || name === 'contains') {
      if (typeof DOMTokenList !== 'undefined' && self instanceof DOMTokenList) return;
      if (name === 'contains' && self.nodeType === 1) return;
    } else if (self.nodeType === 1 && self.window !== self &&
               name !== 'preventDefault' && name !== 'stopPropagation' && name !== 'getElementById') {
      return;
    }
    throw new Error('method ' + name + ' is not allowed here');
  }

  // ── tokenizer ───────────────────────────────────────────────
  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"' || c === "'") {
        let s = '';
        i++;
        while (i < src.length && src[i] !== c) {
          if (src[i] === '\\' && i + 1 < src.length) { s += src[i + 1]; i += 2; }
          else s += src[i++];
        }
        if (src[i] !== c) throw new Error('unterminated string');
        i++;
        out.push({ t: 'str', v: s });
        continue;
      }
      let m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
      if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      m = /^(===|!==)/.exec(src.slice(i));
      if (m) { out.push({ t: 'op', v: m[0] }); i += 3; continue; }
      if ('(){}.,;!'.indexOf(c) >= 0) { out.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('unexpected ' + c);
    }
    return out;
  }

  // ── parser → closures ───────────────────────────────────────
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const isOp = v => toks[p] && toks[p].t === 'op' && toks[p].v === v;
    const eat = v => { if (!isOp(v)) throw new Error('expected ' + v); p++; };

    function program(stopAtBrace) {
      const stmts = [];
      while (p < toks.length && !(stopAtBrace && isOp('}'))) {
        if (isOp(';')) { p++; continue; }
        stmts.push(statement());
      }
      return ctx => { for (const s of stmts) s(ctx); };
    }

    function statement() {
      if (peek() && peek().t === 'id' && peek().v === 'if') {
        p++; eat('(');
        const cond = expr();
        eat(')');
        let body;
        if (isOp('{')) { p++; body = program(true); eat('}'); }
        else body = statement();
        return ctx => { if (cond(ctx)) body(ctx); };
      }
      const e = expr();
      return ctx => { e(ctx); };
    }

    function expr() {
      const left = unary();
      if (isOp('===') || isOp('!==')) {
        const op = toks[p++].v;
        const right = unary();
        return ctx => (op === '===' ? left(ctx) === right(ctx) : left(ctx) !== right(ctx));
      }
      return left;
    }

    function unary() {
      if (isOp('!')) { p++; const u = unary(); return ctx => !u(ctx); }
      return postfix();
    }

    function postfix() {
      let node = primary();
      for (;;) {
        if (isOp('.')) {
          p++;
          const name = peek();
          if (!name || name.t !== 'id') throw new Error('expected name');
          p++;
          if (BLOCKED.has(name.v)) throw new Error('blocked');
          const obj = node;
          node = ctx => { const o = obj(ctx); return o == null ? undefined : o[name.v]; };
          node.base = obj; node.prop = name.v;
        } else if (isOp('(')) {
          p++;
          const args = [];
          while (!isOp(')')) {
            args.push(expr());
            if (isOp(',')) p++;
            else break;
          }
          eat(')');
          const callee = node;
          if (callee.base && !SAFE_METHODS.has(callee.prop)) throw new Error('method ' + callee.prop + ' is not allowed');
          if (!callee.base && !callee.global) throw new Error('only functions can be called');
          node = ctx => {
            let fn, self;
            if (callee.base) {
              self = callee.base(ctx);
              checkMethodCall(self, callee.prop, ctx);
              fn = self[callee.prop];
            } else fn = callee(ctx);
            if (typeof fn !== 'function') throw new Error('not a function');
            return fn.apply(self, args.map(a => a(ctx)));
          };
        } else break;
      }
      return node;
    }

    function primary() {
      const t = peek();
      if (!t) throw new Error('unexpected end');
      p++;
      if (t.t === 'str' || t.t === 'num') return () => t.v;
      if (t.t === 'op' && t.v === '(') { const e = expr(); eat(')'); return e; }
      if (t.t === 'id') {
        switch (t.v) {
          case 'true': return () => true;
          case 'false': return () => false;
          case 'null': return () => null;
          case 'this': return ctx => ctx.el;
          case 'event': return ctx => ctx.ev;
          case 'document': return () => document;
          default: {
            if (BLOCKED.has(t.v) || BLOCKED_GLOBALS.has(t.v)) throw new Error('blocked');
            const g = () => {
              const f = window[t.v];
              if (typeof f !== 'function') throw new Error(t.v + ' is not a global function');
              // The app's own functions only: never a browser built-in
              // (open, fetch, a bound native …) reached under another name.
              if (isNative(f)) throw new Error(t.v + ' is a built-in');
              return f;
            };
            g.global = true;
            return g;
          }
        }
      }
      throw new Error('unexpected token');
    }

    const prog = program(false);
    if (p < toks.length) throw new Error('trailing input');
    return prog;
  }

  function compiled(src) {
    let f = cache.get(src);
    if (!f) {
      try { f = parse(src); } catch (e) {
        f = () => { console.error('[actions] cannot run "' + src + '": ' + e.message); };
      }
      cache.set(src, f);
    }
    return f;
  }

  // The event handed to handlers. stopPropagation must stop *our* walk up
  // the tree, because the native event has already reached the document.
  function eventFor(native) {
    const proxy = {
      target: native.target,
      key: native.key,
      stopped: false,
      preventDefault() { native.preventDefault(); },
      stopPropagation() { proxy.stopped = true; },
    };
    return proxy;
  }

  function dispatch(type, native) {
    const attr = 'data-on' + type;
    const ev = eventFor(native);
    for (let el = native.target; el && el.nodeType === 1; el = el.parentNode) {
      if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
      if (el.disabled) continue;
      try { compiled(el.getAttribute(attr))({ el, ev }); }
      catch (e) { console.error('[actions] ' + attr + ' failed:', e); }
      if (ev.stopped) break;
    }
  }

  ['click', 'change', 'input', 'keydown'].forEach(type => {
    document.addEventListener(type, native => dispatch(type, native));
  });

  window.IHActions = { _compile: compiled };
})();
