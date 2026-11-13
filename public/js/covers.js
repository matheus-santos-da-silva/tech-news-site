// Esconde a capa quando a imagem externa não carrega (hotlink bloqueado, 404 etc.).
// Arquivo externo porque a CSP não permite handlers inline como onerror="".
(function () {
  function hide(img) {
    var fig = img.closest("figure");
    if (fig) fig.remove();
  }
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && t.hasAttribute("data-cover")) hide(t);
  }, true);
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("img[data-cover]").forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) hide(img);
    });
  });
})();
