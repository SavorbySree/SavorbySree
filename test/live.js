/* ------------------------------------------------------------------
   Savor by Sree website: live content from the order app.

   The menu, prices, bundles and hampers, offers, markets and notices are
   edited in the order app and read from here when the page opens.
   If they can't be loaded (no internet, database down), the page uses the
   built-in copy in data.js instead, so it never shows empty.

   The website can only READ what is switched on, and ADD new orders.
   It can never read, change or delete orders.
------------------------------------------------------------------- */
(function () {
  var DB_URL = 'https://eglchnfbjnqppsnxjpyh.supabase.co';
  var DB_KEY = 'sb_publishable_GlUDMJsA-5Nsxu4CJDSPmw_i1jc25zc';   /* publishable key: meant to be public */

  /* App category  ->  website section id and heading */
  var CAT = [['Cookies', 'cookies', 'Chunky NYC Cookies'], ['Brownies', 'brownies', 'Brownies'], ['Cheesecakes', 'cheesecakes', 'Cheesecakes'],
    ['Basque', 'basque', 'Burnt Basque Cheesecakes'], ['Tiramisu', 'tiramisu', 'Tiramisu'], ['Tres Leches', 'tresleches', 'Tres Leches'],
    ['Savoury', 'savoury', 'Savoury Bakes'], ['Cakes', 'cakes', 'Celebration Cakes']];

  function get(path) {
    return fetch(DB_URL + '/rest/v1/' + path, { headers: { apikey: DB_KEY } })
      .then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function liveOn(o, t) { return (!o.starts_on || o.starts_on <= t) && (!o.ends_on || o.ends_on >= t); }
  function cut(o, p) { if (!p) return p; var n = o.percent_off ? p * (1 - o.percent_off / 100) : o.amount_off ? p - o.amount_off : p; return Math.max(0, Math.round(n * 100) / 100); }
  function dealLabel(o) { return o.percent_off ? +o.percent_off + '% off' : o.amount_off ? '€' + (+o.amount_off) + ' off' : ''; }

  /* Everything the page needs, in one request batch. */
  window.SBS_load = function () {
    return Promise.all([
      get('menu_items?select=*&active=eq.true&order=sort.asc'),
      get('offers?select=*&order=created_at.desc'),
      get('markets?select=*&order=sort.asc'),
      get('site_content?select=key,value')
    ]).then(function (r) {
      var n = {}, sec = null; r[3].forEach(function (x) { if (x.key === 'notices') n = x.value || {}; if (x.key === 'sections' && Array.isArray(x.value)) sec = x.value; });
      return { menu: r[0], offers: r[1], markets: r[2], notices: n, sections: sec };
    });
  };

  /* Turns live rows into the same shape as data.js (F). L is null when loading failed. */
  window.SBS_merge = function (F, L) {
    var D = JSON.parse(JSON.stringify(F));
    D.DEALS = []; D.MARKETS = null; D.NOTICES = {}; D.LIVE = !!L;
    if (!L) return D;
    var t = today();
    D.DEALS = (L.offers || []).filter(function (o) { return liveOn(o, t); });
    function deal(id) {
      var best = null, bp = -1;
      D.DEALS.forEach(function (o) { if ((o.item_ids || []).indexOf(id) < 0) return; var v = o.percent_off ? +o.percent_off : (+o.amount_off || 0); if (v > bp) { best = o; bp = v; } });
      return best;
    }
    if (L.menu && L.menu.length) {
      var by = {}; L.menu.forEach(function (r) { (by[r.cat] = by[r.cat] || []).push(r); });
      var menu = [];
      /* menu sections from the app (Menu › Sections), in the app's order; switched-off sections are left out */
      var cats = L.sections && L.sections.length ? L.sections.filter(function (x) { return x.active !== false; }).map(function (x) { return [x.key, x.id || x.key.toLowerCase().replace(/[^a-z0-9]+/g, '-'), x.title || x.key, x.line || '']; }) : CAT;
      cats.forEach(function (c) {
        var rows = by[c[0]]; if (!rows || !rows.length) return;
        var old = F.MENU.filter(function (x) { return x.id === c[1]; })[0] || {};
        var cake = c[1] === 'cakes';
        var conv = function (r) { return (r.options || []).map(function (o) { return { l: o.label, p: +o.price, d: o.note || '' }; }); };
        var base = conv(rows[0]);
        var items = rows.map(function (r) {
          var opts = conv(r), same = JSON.stringify(opts) === JSON.stringify(base), dl = deal(r.id);
          if (dl) opts = opts.map(function (o) { return { l: o.l, p: cut(dl, o.p), d: o.d, was: o.p }; });
          var tags = (r.tags || []).filter(function (x) { return x !== 'Hamper'; });
          return { id: r.id, name: r.name, a: (r.allergens || []).join(', '), b: dl ? dealLabel(dl) || r.badge || '' : r.badge || '', tag: tags[0] || '', opts: same && !dl ? null : opts, desc: r.description || '' };
        });
        menu.push({ id: c[1], name: L.sections ? c[2] : old.name || c[2], short: c[0], line: c[3] || '', optNote: old.optNote || '', opts: cake ? null : base, sizes: cake, items: items });
        if (cake) {
          var sizes = conv(rows[0]).filter(function (o) { return o.p > 0; });
          var k = 0; D.CAKE_SIZES.forEach(function (z) { if (!z.custom && sizes[k]) { z.price = sizes[k].p; k++; } });
        }
      });
      if (menu.length) D.MENU = menu;
      var add = {}; (by['Add-ons'] || []).forEach(function (r) { add[r.id] = r; });
      D.CAKE_ADDONS.forEach(function (a) { var r = add['addon-' + a.id]; if (r && r.options && r.options[0]) { a.price = +r.options[0].price; a.name = r.name; } });
      D.CAKE_ADDONS = D.CAKE_ADDONS.filter(function (a) { return !L.menu.length || add['addon-' + a.id]; });
      D.TWO_FLAVOUR = add['addon-twoflav'] ? +add['addon-twoflav'].options[0].price : 5;
      D.FONDANT = add['addon-fondant'] ? +add['addon-fondant'].options[0].price : 5;
      D.OFFERS = (by['Bundles'] || []).map(function (r) {
        var p = +((r.options || [])[0] || {}).price || 0, dl = deal(r.id);
        return { id: r.id, type: (r.tags || []).indexOf('Hamper') >= 0 ? 'Hamper' : (r.tags || []).indexOf('Pack') >= 0 ? 'Pack' : 'Bundle', title: r.name, desc: r.description || '', items: r.includes || [], price: dl ? cut(dl, p) : p, was: dl ? p : null, badge: dl ? dealLabel(dl) : r.badge || '' };
      });
    }
    if (L.markets) {
      D.MARKETS = L.markets;
      /* "Our story": every market switched on in the app, past ones included */
      var story = L.markets.filter(function (m) { return m.description || m.status === 'past' || m.kind; }).map(function (m) {
        return { name: m.name, place: m.place || '', type: m.kind === 'Community' ? 'Community' : m.kind === 'Festival' ? 'Festival' : 'Market', desc: m.description || '' };
      });
      if (story.length) D.EVENTS = story;
    }
    D.NOTICES = L.notices || {};
    return D;
  };

  /* Sends a website order into the order app ("To confirm"). Never blocks WhatsApp. */
  window.SBS_sendOrder = function (row) {
    try {
      row.source = 'website';
      fetch(DB_URL + '/rest/v1/orders', {
        method: 'POST', keepalive: true,
        headers: { apikey: DB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      }).catch(function () {});
    } catch (e) {}
  };
})();
