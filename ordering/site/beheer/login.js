// /beheer login: ask for a link, or — on /beheer/in/<token> — spend it with a button.
(function () {
  var T = {
    nl: { 'l.title': 'Beheer', 'l.intro': 'Vul uw e-mailadres in. U krijgt een link waarmee u inlogt; een wachtwoord is niet nodig.', 'l.email': 'E-mailadres', 'l.send': 'Stuur mij een inloglink',
      'l.sent': 'Als dit adres bij het café hoort, is er nu een link onderweg. Kijk in uw mail; de link werkt 15 minuten.', 'l.again': 'Ander adres proberen',
      'l.enter': 'U heeft de inloglink geopend. Klik hieronder om in te loggen op dit apparaat.', 'l.go': 'Inloggen',
      'e.link': 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.', 'e.net': 'Dat lukte niet. Controleer de verbinding en probeer het opnieuw.' },
    en: { 'l.title': 'Back office', 'l.intro': 'Enter your email address. You will get a link that logs you in; there is no password.', 'l.email': 'Email address', 'l.send': 'Send me a login link',
      'l.sent': 'If this address belongs to the café, a link is on its way. Check your mail; the link works for 15 minutes.', 'l.again': 'Try another address',
      'l.enter': 'You opened the login link. Press the button to log in on this device.', 'l.go': 'Log in',
      'e.link': 'This link has expired or was already used. Ask for a new one.', 'e.net': 'That did not work. Check the connection and try again.' }
  };
  var lang = 'nl'; try { lang = localStorage.getItem('beheer.lang') || 'nl'; } catch (e) {}
  if (!T[lang]) lang = 'nl';
  var $ = function (id) { return document.getElementById(id); };
  function paint() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = T[lang][el.getAttribute('data-t')]; });
  }
  document.querySelectorAll('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { lang = b.getAttribute('data-lang'); try { localStorage.setItem('beheer.lang', lang); } catch (e) {} paint(); }); });
  function fail(k) { var e = $('err'); e.textContent = T[lang][k]; e.hidden = false; }
  function post(path, body) { return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }); }
  var m = /^\/beheer\/in\/([0-9a-f]{64})$/.exec(location.pathname);
  if (m) {
    $('enter').hidden = false;
    $('enter').addEventListener('submit', function (ev) {
      ev.preventDefault(); $('err').hidden = true; var btn = ev.target.querySelector('button'); btn.disabled = true;
      post('/beheer/in', { token: m[1] }).then(function (r) {
        if (r.ok) { location.replace('/beheer'); return; }
        btn.disabled = false; $('enter').hidden = true; $('ask').hidden = false; fail('e.link'); history.replaceState(null, '', '/beheer');
      }).catch(function () { btn.disabled = false; fail('e.net'); });
    });
  } else {
    $('ask').hidden = false;
    $('ask').addEventListener('submit', function (ev) {
      ev.preventDefault(); $('err').hidden = true; var btn = ev.target.querySelector('button'); btn.disabled = true;
      post('/beheer/login', { email: $('email').value }).then(function (r) {
        btn.disabled = false; if (!r.ok) { fail('e.net'); return; }
        $('ask').hidden = true; $('sent').hidden = false;
      }).catch(function () { btn.disabled = false; fail('e.net'); });
    });
    $('again').addEventListener('click', function () { $('sent').hidden = true; $('ask').hidden = false; $('email').focus(); });
  }
  paint();
})();
