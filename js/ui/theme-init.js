// Runs before the page paints so the chosen theme never flashes the other one.
try {
  var t = localStorage.getItem('stillbilled.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {
  /* storage can be blocked; the system theme applies */
}
