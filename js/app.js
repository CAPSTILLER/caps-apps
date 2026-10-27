(function () {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");

  function initial(label) {
    const parts = String(label || "").trim().split(/\s+/);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function makeTile(app) {
    const a = document.createElement("a");
    a.className = "app-tile";
    a.href = app.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", "Open " + app.label);

    const wrap = document.createElement("div");
    wrap.className = "icon-wrap";

    if (app.icon) {
      const img = document.createElement("img");
      img.src = "./icons/" + app.icon + "?v=20261027";
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        wrap.innerHTML = "";
        const letter = document.createElement("div");
        letter.className = "letter-tile";
        letter.textContent = initial(app.label);
        wrap.appendChild(letter);
      });
      wrap.appendChild(img);
    } else {
      const letter = document.createElement("div");
      letter.className = "letter-tile";
      letter.textContent = initial(app.label);
      wrap.appendChild(letter);
    }

    const label = document.createElement("span");
    label.className = "app-label";
    label.textContent = app.label;

    a.appendChild(wrap);
    a.appendChild(label);
    return a;
  }

  function showEmpty(message) {
    grid.hidden = true;
    empty.hidden = false;
    empty.innerHTML = "<strong>No apps yet</strong>" + (message || "Add entries in apps.json and redeploy.");
  }

  fetch("./apps.json", { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("Could not load apps.json");
      return res.json();
    })
    .then(function (data) {
      const apps = (data.apps || []).filter(function (app) {
        return app && app.enabled !== false && /^https:\/\//i.test(app.url || "");
      });
      if (!apps.length) {
        showEmpty();
        return;
      }
      empty.hidden = true;
      grid.hidden = false;
      grid.innerHTML = "";
      apps.forEach(function (app) {
        grid.appendChild(makeTile({
          label: app.label || app.url,
          url: app.url,
          icon: app.icon || null
        }));
      });
    })
    .catch(function () {
      showEmpty("Something went wrong loading the list.");
    });
})();
