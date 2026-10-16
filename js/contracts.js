(function () {
  var btn = document.getElementById("gearBtn"), sheet = document.getElementById("addrSheet");
  var list = document.getElementById("addrList"), toast = document.getElementById("toast");
  var loaded = false, tt;
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function copy(text, b) {
    function done() {
      b.textContent = "Copied"; b.classList.add("ok");
      setTimeout(function () { b.textContent = "Copy"; b.classList.remove("ok"); }, 1400);
      toast.hidden = false; clearTimeout(tt); tt = setTimeout(function () { toast.hidden = true; }, 1200);
    }
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); done();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function render(data) {
    list.innerHTML = "";
    (data.groups || []).forEach(function (g) {
      var sec = el("section", "addr-group"); sec.appendChild(el("h3", null, g.title));
      (g.items || []).forEach(function (it) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(it.address || "")) return;
        var net = it.network || "Base";
        var card = el("div", "addr-card"), top = el("div", "addr-top");
        top.appendChild(el("strong", null, it.name));
        top.appendChild(el("span", "addr-net", net));
        card.appendChild(top);
        card.appendChild(el("p", "addr-desc", it.desc || ""));
        var row = el("div", "addr-row");
        var code = el("code", null, short(it.address)); code.title = it.address;
        row.appendChild(code);
        var scan = el("a", "addr-link", "BaseScan");
        scan.href = "https://basescan.org/address/" + it.address; scan.target = "_blank"; scan.rel = "noopener noreferrer";
        row.appendChild(scan);
        var cb = el("button", "addr-copy", "Copy"); cb.type = "button";
        cb.addEventListener("click", function () { copy(it.address, cb); });
        row.appendChild(cb);
        card.appendChild(row); sec.appendChild(card);
      });
      list.appendChild(sec);
    });
  }
  function open() {
    sheet.hidden = false; document.body.style.overflow = "hidden";
    if (!history.state || !history.state.addr) history.pushState({ addr: 1 }, "");
    if (loaded) return;
    list.textContent = "Loading…";
    fetch("./contracts.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { loaded = true; render(d); })
      .catch(function () { list.textContent = "Could not load addresses."; });
  }
  function close(fromPop) {
    if (sheet.hidden) return;
    sheet.hidden = true; document.body.style.overflow = "";
    if (!fromPop && history.state && history.state.addr) history.back();
  }
  btn.addEventListener("click", open);
  document.getElementById("addrClose").addEventListener("click", function () { close(false); });
  sheet.addEventListener("click", function (e) { if (e.target === sheet) close(false); });
  window.addEventListener("popstate", function () { close(true); }); // Android back button closes the sheet
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(false); });
})();
