(function () {
  'use strict';

  /* JS が生きている印。これが付いたときだけ .reveal を隠す */
  document.documentElement.classList.add('js');

  /* ---- header: 背景をスクロールで出す ---- */
  var header = document.getElementById('siteHeader');
  var onScroll = function () {
    if (window.scrollY > 40) {
      header.classList.add('is-stuck');
    } else {
      header.classList.remove('is-stuck');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- モバイルナビ ---- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('siteNav');

  var closeNav = function () {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'メニューを開く');
    document.body.classList.remove('nav-open');
  };

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    document.body.classList.toggle('nav-open', open);
  });

  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeNav();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav();
  });

  /* ---- スクロールで要素をフェードイン ---- */
  var targets = document.querySelectorAll('.reveal');

  var revealAll = function () {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-in'); });
  };

  if (!('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  /* 保険: 何らかの理由で監視が走らなくても4秒後に必ず出す */
  var safety = setTimeout(revealAll, 4000);
  window.addEventListener('pagehide', function () { clearTimeout(safety); });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  Array.prototype.forEach.call(targets, function (el, i) {
    // 同じ行に並ぶカードは少しずつ遅らせる
    var delay = (el.parentElement && el.parentElement.children.length > 1) ? (i % 3) * 90 : 0;
    el.style.transitionDelay = delay + 'ms';
    io.observe(el);
  });
})();
