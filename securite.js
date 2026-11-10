// Protections du serveur : en-têtes HTTP, scripts autorisés (CSP), limites d'envoi, règles de mot de passe.
const crypto = require('crypto');

// ---------- En-têtes de sécurité ----------
// Politique par défaut : seulement nos fichiers, polices Google, images https (logos, événements).
const BASE_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
];

function enTetes(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // pas d'affichage du site dans le cadre d'un autre site
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [...BASE_CSP, "script-src 'self'"].join('; '));
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// Page HTML : seuls nos fichiers .js et les scripts intégrés de CETTE page (empreinte exacte) peuvent s'exécuter.
// Les blocs de données (JSON, JSON-LD) ne s'exécutent pas et ne sont pas concernés.
function cspPage(html, https) {
  const empreintes = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\ssrc=/i.test(attrs) || /type=["']application\/(ld\+)?json["']/i.test(attrs)) continue;
    // Le navigateur normalise les fins de ligne (\r\n → \n) avant de calculer l'empreinte : on fait pareil
    const code = m[2].replace(/\r\n?/g, '\n');
    empreintes.push(`'sha256-${crypto.createHash('sha256').update(code, 'utf8').digest('base64')}'`);
  }
  // Outil de mesure d'audience choisi dans Paramètres (Plausible ou Umami) : son script et ses envois sont autorisés
  const mesure = [...new Set([...html.matchAll(/<script[^>]*\ssrc="(https:\/\/(?:plausible\.io|cloud\.umami\.is))\//gi)].map((m) => m[1]))];
  const base = BASE_CSP.map((r) => (r === "connect-src 'self'" && mesure.length ? `${r} ${mesure.join(' ')}` : r));
  return [...base, `script-src 'self' ${[...mesure, ...new Set(empreintes)].join(' ')}`.trim(), ...(https ? ['upgrade-insecure-requests'] : [])].join('; ');
}

// Fichiers envoyés depuis le back office : jamais exécutés, même ouverts seuls (un SVG peut contenir du code)
function enTetesFichierEnvoye(res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// ---------- Limites d'envoi par adresse IP ----------
// limiteur('formulaires', 30, 10 min) : au-delà, réponse 429 ; le site propose alors WhatsApp.
const compteurs = new Map();
function depasse(cle, max, fenetreMs) {
  const maintenant = Date.now();
  const liste = (compteurs.get(cle) || []).filter((t) => maintenant - t < fenetreMs);
  if (liste.length >= max) { compteurs.set(cle, liste); return true; }
  liste.push(maintenant);
  compteurs.set(cle, liste);
  return false;
}
// Ménage régulier de la mémoire des compteurs
setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, liste] of compteurs) if (!liste.some((t) => maintenant - t < 3600e3)) compteurs.delete(cle);
}, 600e3).unref();

// ---------- Mots de passe ----------
// 10 caractères minimum, au moins une lettre et un chiffre, pas un mot de passe par défaut du projet
function erreurMotDePasse(mdp, parDefaut = [], email = '') {
  const m = String(mdp || '');
  if (m.length < 10) return 'Mot de passe : 10 caractères minimum';
  if (!/[a-zA-Z]/.test(m) || !/\d/.test(m)) return 'Mot de passe : au moins une lettre et un chiffre';
  if (parDefaut.includes(m)) return 'Ce mot de passe est celui par défaut du projet : choisissez-en un autre';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && m.toLowerCase().includes(local)) return 'Le mot de passe ne doit pas contenir votre identifiant';
  return null;
}

module.exports = { enTetes, cspPage, enTetesFichierEnvoye, depasse, erreurMotDePasse };
