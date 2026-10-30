// Karthala360 — site public + endpoint des formulaires + back office
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { init } = require('./db');
const { creer: creerRendu } = require('./render');
const securite = require('./securite');
const pdf = require('./pdf');

const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;
const PUBLIC = path.join(__dirname, 'public');
const SITE = path.join(PUBLIC, 'site'); // site Karthala360, servi à la racine du domaine ; la page d'aperçu est sur /apercu
const ENDPOINT = '/api/k360';

// Colonnes modifiables par ressource du back office
const RESOURCES = {
  reservations: ['nom', 'telephone', 'email', 'pays', 'formule', 'contribution', 'prise_en_charge', 'message', 'langue', 'status', 'admin_note', 'date_souhaitee', 'adultes', 'enfants', 'montant_total', 'acompte', 'acompte_date', 'solde_paye', 'solde_date', 'mode_paiement', 'id_sortie'],
  soumissions: ['traite'],
  questions: [],
  savoirs: ['langue', 'titre', 'texte', 'lien', 'publie'],
  avis: ['auteur', 'pays', 'formule', 'note', 'texte', 'mois', 'publie'],
  evenements: ['titre_fr', 'titre_en', 'lieu_fr', 'lieu_en', 'description_fr', 'description_en', 'heure_fr', 'heure_en', 'debut', 'fin', 'type', 'organisateur', 'lien', 'image', 'a_la_une', 'publie'],
  sorties: ['code', 'formule', 'date', 'guide', 'statut', 'decision', 'meteo', 'terrain', 'heure_depart', 'heure_retour', 'dechets_kg', 'observations'],
  formules: ['code', 'sigle', 'nom', 'nom_en', 'description', 'description_en', 'prix', 'type', 'supp', 'contrib', 'age_min', 'min_pers', 'actif', 'ordre'],
  produits: ['code', 'nom', 'nom_en', 'description', 'description_en', 'image', 'tailles', 'badge', 'badge_en', 'prix', 'disponible', 'stock', 'ordre'],
  commandes: ['client', 'telephone', 'email', 'produit', 'detail', 'mode_remise', 'quantite', 'montant', 'statut', 'note'],
  partenaires: ['nom', 'niveau', 'description', 'description_en', 'logo', 'lien', 'ordre', 'publie'],
  photos: ['fichier', 'legende', 'legende_en', 'ordre', 'publie'],
  journal: [],
};
const LECTURE_SEULE = new Set(['journal']); // pas de suppression
const SANS_CREATION = new Set(['reservations', 'soumissions']); // créées par le site ou au démarrage
const RES_STATUS = ['nouvelle', 'confirmée', 'acompte payé', 'payée', 'terminée', 'annulée'];
const STATUTS_PAYES = "('acompte payé','payée','terminée')";
const SETTINGS_AUTORISES = new Set(['whatsapp', 'email', 'delai_reponse', 'paiement_virement', 'paiement_paypal', 'paiement_mvola', 'paiement_wakati',
  'acompte_pct', 'seuil_action', 'fonds_ajustement', 'tarif_agenda_evenement', 'tarif_agenda_semaine', 'tarif_datapro_rapport', 'tarif_datapro_abonnement',
  'assurance_contrat', 'alerte_niveau', 'alerte_message', 'notif_email', 'site_url', 'lien_instagram', 'lien_facebook', 'envoi_auto_bon', 'style_site']);
// Pages dont le texte contient des prix calculés à partir des tarifs (à relire après un changement de tarif)
const PAGES_PRIX = ['index.html', 'formules.html', 'reservation.html', 'cgv.html', 'impact.html', 'en/index.html', 'en/tours.html', 'en/book.html', 'en/terms.html', 'en/preserve.html', 'assets/data/connaissance-fr.json', 'assets/data/connaissance-en.json'];

// Base de connaissances du site (pour l'IA de K269)
const savoirsSite = {};
for (const l of ['fr', 'en']) {
  try { savoirsSite[l] = JSON.parse(fs.readFileSync(path.join(SITE, 'assets', 'data', `connaissance-${l}.json`), 'utf8')); } catch { savoirsSite[l] = []; }
}

init().then((db) => {
  const app = express();
  app.disable('x-powered-by');
  // Proxy HTTPS (Caddy) dans le réseau Docker : l'adresse IP du visiteur et le https viennent de lui.
  // On ne croit ces informations QUE si la requête arrive vraiment du conteneur Caddy (service « https ») ;
  // sinon une fausse adresse IP envoyée par un visiteur contournerait les limites d'envoi et de connexion.
  const PROXY_HOTE = process.env.PROXY_HOTE || 'https';
  let ipsProxy = new Set();
  const majProxy = () => require('dns').lookup(PROXY_HOTE, { all: true }, (err, l) => { ipsProxy = new Set(err ? [] : l.map((x) => x.address)); });
  majProxy(); setInterval(majProxy, 60e3).unref();
  app.set('trust proxy', (adresse) => ipsProxy.has(String(adresse).replace(/^::ffff:/, '')));
  app.use(securite.enTetes);
  // Compression gzip des pages, styles, scripts et données (4 à 5 fois plus légers) ; les images WebP/JPEG sont déjà compressées
  app.use(require('compression')({ threshold: 1024 }));
  // Envoi de photos (base64) : gros envois réservés aux personnes connectées, vérifiées AVANT de lire le corps
  app.use('/api/admin/upload', (req, res, next) => requireAuth(req, res, next), express.json({ limit: '12mb' }));
  // Partout ailleurs, y compris les formulaires publics : 100 ko suffisent largement
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  const rendu = creerRendu(SITE, db);
  const UPLOADS = path.join(db.dossier, 'uploads');
  fs.mkdirSync(UPLOADS, { recursive: true });

  const settings = () => Object.fromEntries(db.all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
  const clean = (v, max = 2000) => (v == null ? '' : String(v).trim().slice(0, max));
  const num = (v) => (v === '' || v == null || isNaN(v) ? null : Number(v));

  // ---------- Tarifs ----------
  const formules = () => db.all('SELECT * FROM formules ORDER BY ordre, id');
  const formuleDe = (nom) => formules().find((f) => f.nom === nom || f.code === nom || f.nom_en === nom);
  // Même règle que l'estimation du site : forfait = prix pour 1 à 4 personnes, puis supplément par personne
  function calculer(f, personnes, contribution) {
    if (!f || personnes < 1) return { total: null, contribution_eur: null };
    const base = f.type === 'forfait' ? f.prix + (f.supp || 0) * Math.max(0, personnes - 4) : f.prix * personnes;
    const parPers = contribution === '' || contribution == null ? (f.contrib || 0) : Number(contribution) || 0;
    // Montant dû = formule + contribution, comme l'estimation montrée au client
    return { total: base + parPers * personnes, contribution_eur: parPers * personnes };
  }

  // ---------- Notifications e-mail (facultatif : variables SMTP_*) ----------
  let transport = null;
  if (process.env.SMTP_HOST) {
    transport = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else if (process.env.EMAIL_FICHIERS) {
    // Mode essai : les e-mails sont écrits dans un dossier (.eml) au lieu d'être envoyés
    const nodemailer = require('nodemailer');
    const fichiers = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    fs.mkdirSync(process.env.EMAIL_FICHIERS, { recursive: true });
    transport = { sendMail: (m) => fichiers.sendMail(m).then((info) => {
      fs.writeFileSync(path.join(process.env.EMAIL_FICHIERS, `${Date.now()}-${String(m.to).replace(/[^a-z0-9@.]+/gi, '_')}.eml`), info.message);
      return info;
    }) };
  }
  const expediteur = () => process.env.SMTP_FROM || process.env.SMTP_USER || `Discovermores <${settings().email || 'contact@discovermores.com'}>`;

  // ---------- Bon de réservation envoyé au client par e-mail ----------
  const emailValide = (e) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(String(e || '').trim());
  // Un seul e-mail par client, avec un bon PDF par activité (une réservation simple = un seul bon)
  const envoyerBon = (id, par) => envoyerBons([id], par);
  async function envoyerBons(ids, par) {
    const resas = ids.map((id) => db.get('SELECT * FROM reservations WHERE id=?', [id])).filter(Boolean);
    if (!resas.length) return { ok: false, info: 'Réservation introuvable' };
    const noter = (info, envoye) => {
      for (const r of resas) db.run('UPDATE reservations SET bon_envoi_info=?' + (envoye ? ', bon_envoye_le=?' : '') + ' WHERE id=?',
        envoye ? [info, new Date().toISOString().slice(0, 16).replace('T', ' '), r.id] : [info, r.id]);
      return { ok: !!envoye, info };
    };
    const r = resas[0];
    if (!emailValide(r.email)) return noter('Non envoyé : pas d\'e-mail client');
    if (!transport) return noter('Non envoyé : envoi d\'e-mails non configuré (SMTP)');
    // Anti-abus : depuis le site, au plus 3 envois par adresse et 100 au total sur 24 h
    // (sinon n'importe qui pourrait faire envoyer des e-mails à des inconnus avec votre compte d'envoi)
    if (par === 'site') {
      const dest = r.email.trim().toLowerCase();
      if (securite.depasse(`bon-total`, 100, 24 * 3600e3)) return noter('Non envoyé : limite de 100 envois automatiques par jour atteinte (renvoyez-le depuis le back office)');
      if (securite.depasse(`bon:${dest}`, 3, 24 * 3600e3)) return noter('Non envoyé : déjà 3 envois vers cette adresse aujourd\'hui (renvoyez-le depuis le back office si besoin)');
    }
    const s = settings();
    const en = r.langue === 'en';
    const plusieurs = resas.length > 1;
    const dateFr = (d) => String(d || '').split('-').reverse().join('/');
    try {
      const pieces = [];
      for (const x of resas) pieces.push({ filename: `${en ? 'booking' : 'reservation'}-${x.ref}.pdf`, content: await pdf.bonReservationBuffer(x, formuleDe(x.formule), coordonneesPaiement()), contentType: 'application/pdf' });
      const prenom = String(r.nom).split(' ')[0];
      const du = (x) => x.montant_total ?? x.estimation ?? 0;
      const total = Math.round(resas.reduce((t, x) => t + du(x), 0) * 100) / 100;
      const detail = resas.map((x) => en
        ? `${plusieurs ? '• ' : ''}${x.formule} — ${x.date_souhaitee} — ${(x.adultes || 0) + (x.enfants || 0)} people — €${du(x)} (ref. ${x.ref})`
        : `${plusieurs ? '• ' : ''}${x.formule} — ${dateFr(x.date_souhaitee)} — ${(x.adultes || 0) + (x.enfants || 0)} pers. — ${du(x)} € (réf. ${x.ref})`);
      const lignes = en ? [
        `Hello ${prenom},`, '',
        plusieurs ? `Thank you for your booking request with Discovermores (${resas.length} activities${r.groupe ? `, group ${r.groupe}` : ''}). Your booking forms are attached, one per activity.`
          : `Thank you for your booking request with Discovermores. Please find your booking form attached (ref. ${r.ref}).`, '',
        ...detail, ...(plusieurs ? [`Total: €${total}`] : []), '',
        `Our team will confirm the dates and the weather within ${String(s.delai_reponse || '24 hours').replace(/heures?/, 'hours')}. Your booking is final once the deposit is received; payment details are in the attached form${plusieurs ? 's' : ''}.`, '',
        `Questions? Reply to this e-mail or write to us on WhatsApp: https://wa.me/${String(s.whatsapp || '').replace(/\D/g, '')}`, '',
        'See you soon on Karthala,', 'The Discovermores team · Moroni, Grande Comore',
      ] : [
        `Bonjour ${prenom},`, '',
        plusieurs ? `Merci pour votre demande de réservation auprès de Discovermores (${resas.length} activités${r.groupe ? `, dossier ${r.groupe}` : ''}). Vous trouverez vos bons de réservation en pièces jointes, un par activité.`
          : `Merci pour votre demande de réservation auprès de Discovermores. Vous trouverez votre bon de réservation en pièce jointe (réf. ${r.ref}).`, '',
        ...detail, ...(plusieurs ? [`Total : ${total} €`] : []), '',
        `Notre équipe vous confirme ${plusieurs ? 'les dates' : 'la date'} et la météo sous ${s.delai_reponse || '24 heures'}. La réservation est définitive à réception de l'acompte ; les moyens de paiement figurent sur ${plusieurs ? 'les bons' : 'le bon'}.`, '',
        `Une question ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp : https://wa.me/${String(s.whatsapp || '').replace(/\D/g, '')}`, '',
        'À bientôt sur le Karthala,', 'L\'équipe Discovermores · Moroni, Grande Comore',
      ];
      const texte = lignes.join('\n');
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#101510;max-width:560px">
        <div style="background:#0D120E;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-weight:bold;font-size:18px">KARTHALA<span style="color:#67DC8B">360</span></div>
        <div style="border:1px solid #DCE5DE;border-top:4px solid #1E7A3B;border-radius:0 0 12px 12px;padding:20px 22px">${lignes.map((l) => (l ? `<p style="margin:0 0 6px">${l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/(https:\/\/wa\.me\/\d+)/, '<a href="$1" style="color:#1E7A3B">WhatsApp</a>')}</p>` : '<div style="height:8px"></div>')).join('')}</div></div>`;
      const sujet = plusieurs
        ? (en ? `Your Karthala360 booking ${r.groupe || r.ref} — ${resas.length} activities` : `Votre réservation Karthala360 ${r.groupe || r.ref} — ${resas.length} activités`)
        : (en ? `Your Karthala360 booking ${r.ref} — ${r.formule}` : `Votre réservation Karthala360 ${r.ref} — ${r.formule}`);
      await transport.sendMail({ from: expediteur(), to: r.email.trim(), replyTo: s.email || undefined, subject: sujet, text: texte, html, attachments: pieces });
      for (const x of resas) db.run('INSERT INTO journal (utilisateur,action,cible,detail) VALUES (?,?,?,?)', [par || 'site', 'bon envoyé', `/reservations/${x.id}`, r.email]);
      return noter(`Envoyé à ${r.email.trim()}`, true);
    } catch (e) {
      console.error('Bon de réservation non envoyé :', e.message);
      return noter(`Échec de l'envoi : ${String(e.message).slice(0, 120)}`);
    }
  }
  // ---------- Confirmation de commande boutique envoyée au client (même présentation que le bon de réservation) ----------
  // Photo d'un produit pour l'e-mail : celle envoyée dans le back office, sinon celle de la page Boutique.
  // Les SVG ne sont pas affichés par la plupart des messageries : pas d'image dans ce cas.
  function imageProduitFichier(code, image) {
    const candidats = [];
    if (image && image.startsWith('/uploads/')) candidats.push(path.join(UPLOADS, path.basename(image)));
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) candidats.push(path.join(SITE, 'assets', 'boutique', path.basename(String(code)) + ext));
    const f = candidats.find((c) => fs.existsSync(c));
    if (!f) return null;
    const ext = path.extname(f).toLowerCase();
    return { path: f, contentType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg' };
  }
  async function envoyerConfirmationCommande(ref, par) {
    const c = db.get('SELECT * FROM commandes WHERE ref=?', [ref]);
    if (!c) return { ok: false, info: 'Commande introuvable' };
    const noter = (info, envoye) => {
      db.run('UPDATE commandes SET confirmation_info=?' + (envoye ? ', confirmation_envoyee_le=?' : '') + ' WHERE id=?',
        envoye ? [info, new Date().toISOString().slice(0, 16).replace('T', ' '), c.id] : [info, c.id]);
      return { ok: !!envoye, info };
    };
    if (!emailValide(c.email)) return noter('Non envoyé : pas d\'e-mail client');
    if (!transport) return noter('Non envoyé : envoi d\'e-mails non configuré (SMTP)');
    if (par === 'site') {
      const dest = c.email.trim().toLowerCase();
      if (securite.depasse('commande-total', 100, 24 * 3600e3)) return noter('Non envoyé : limite de 100 envois automatiques par jour atteinte');
      if (securite.depasse(`commande:${dest}`, 3, 24 * 3600e3)) return noter('Non envoyé : déjà 3 envois vers cette adresse aujourd\'hui');
    }
    const s = settings();
    const en = c.langue === 'en';
    let lignes = [];
    try { lignes = JSON.parse(c.lignes || '[]'); } catch {}
    const produits = Object.fromEntries(db.all('SELECT code,nom,nom_en,image FROM produits').map((p) => [p.code, p]));
    const echap = (t) => String(t ?? '').replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
    const prix = (n) => (en ? `€${Math.round(n * 100) / 100}` : `${String(Math.round(n * 100) / 100).replace('.', ',')} €`);
    const pieces = [];
    const rangees = lignes.map((l, i) => {
      const p = produits[l.code] || {};
      const nom = (en && p.nom_en) || l.nom;
      const img = imageProduitFichier(l.code, p.image);
      let vignette = '<div style="width:72px;height:72px;border-radius:10px;background:#E8EEEA"></div>';
      if (img) {
        const cid = `produit-${i}@karthala360`;
        pieces.push({ filename: path.basename(img.path), path: img.path, contentType: img.contentType, cid });
        vignette = `<img src="cid:${cid}" width="72" height="72" alt="${echap(nom)}" style="display:block;width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #DCE5DE">`;
      }
      return `<tr>
        <td style="padding:10px 12px 10px 0;border-bottom:1px solid #DCE5DE;width:72px;vertical-align:top">${vignette}</td>
        <td style="padding:10px 0;border-bottom:1px solid #DCE5DE;vertical-align:top"><b>${echap(nom)}</b>${l.option ? `<br><span style="color:#5E685F;font-size:13px">${en ? 'Size / option' : 'Taille / choix'} : ${echap(l.option)}</span>` : ''}<br><span style="color:#5E685F;font-size:13px">${l.quantite} × ${prix(l.prix)}</span></td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #DCE5DE;text-align:right;vertical-align:top;white-space:nowrap"><b>${prix(l.total)}</b></td></tr>`;
    }).join('');
    const prenom = String(c.client || '').split(' ')[0];
    const wa = String(s.whatsapp || '').replace(/\D/g, '');
    const p = (t) => `<p style="margin:0 0 6px">${t}</p>`;
    const corps = en ? [
      p(`Hello ${echap(prenom)},`), '<div style="height:8px"></div>',
      p(`Thank you for your order from the Karthala360 shop (ref. <b>${echap(c.ref)}</b>). Here is what you ordered:`),
    ] : [
      p(`Bonjour ${echap(prenom)},`), '<div style="height:8px"></div>',
      p(`Merci pour votre commande à la boutique Karthala360 (réf. <b>${echap(c.ref)}</b>). Voici le récapitulatif :`),
    ];
    const suite = en ? [
      p(`Delivery: ${echap(c.mode_remise || '—')}`),
      p(`Our team will confirm availability and timing within ${echap(String(s.delai_reponse || '24 hours').replace(/heures?/, 'hours'))}. No payment now: you pay once we confirm (bank transfer, PayPal, MVola or Wakati).`),
      '<div style="height:8px"></div>',
      p(`Questions? Reply to this e-mail or write to us on <a href="https://wa.me/${wa}" style="color:#1E7A3B">WhatsApp</a>.`),
      '<div style="height:8px"></div>', p('See you soon,'), p('The Discovermores team · Moroni, Grande Comore'),
    ] : [
      p(`Remise : ${echap(c.mode_remise || '—')}`),
      p(`Notre équipe vous confirme la disponibilité et le délai sous ${echap(s.delai_reponse || '24 heures')}. Aucun paiement maintenant : vous réglez après notre confirmation (virement, PayPal, MVola ou Wakati).`),
      '<div style="height:8px"></div>',
      p(`Une question ? Répondez à cet e-mail ou écrivez-nous sur <a href="https://wa.me/${wa}" style="color:#1E7A3B">WhatsApp</a>.`),
      '<div style="height:8px"></div>', p('À bientôt,'), p('L\'équipe Discovermores · Moroni, Grande Comore'),
    ];
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#101510;max-width:560px">
      <div style="background:#0D120E;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-weight:bold;font-size:18px">KARTHALA<span style="color:#67DC8B">360</span></div>
      <div style="border:1px solid #DCE5DE;border-top:4px solid #1E7A3B;border-radius:0 0 12px 12px;padding:20px 22px">${corps.join('')}
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:10px 0 6px">${rangees}
          <tr><td></td><td style="padding:12px 0 4px;font-weight:bold;font-size:16px">Total</td><td style="padding:12px 0 4px 12px;text-align:right;font-weight:bold;font-size:16px;white-space:nowrap">${prix(c.montant || 0)}</td></tr></table>
        <div style="height:8px"></div>${suite.join('')}</div></div>`;
    const texte = [
      en ? `Hello ${prenom},` : `Bonjour ${prenom},`, '',
      en ? `Thank you for your order from the Karthala360 shop (ref. ${c.ref}).` : `Merci pour votre commande à la boutique Karthala360 (réf. ${c.ref}).`, '',
      ...lignes.map((l) => `- ${l.quantite} × ${(en && (produits[l.code] || {}).nom_en) || l.nom}${l.option ? ` (${l.option})` : ''} : ${prix(l.total)}`),
      `Total : ${prix(c.montant || 0)}`, '', `${en ? 'Delivery' : 'Remise'} : ${c.mode_remise || '—'}`, '',
      en ? 'No payment now: you pay once we confirm.' : 'Aucun paiement maintenant : vous réglez après notre confirmation.',
      `WhatsApp : https://wa.me/${wa}`,
    ].join('\n');
    try {
      await transport.sendMail({
        from: expediteur(), to: c.email.trim(), replyTo: s.email || undefined,
        subject: en ? `Your Karthala360 order ${c.ref}` : `Votre commande Karthala360 ${c.ref}`,
        text: texte, html, attachments: pieces,
      });
      db.run('INSERT INTO journal (utilisateur,action,cible,detail) VALUES (?,?,?,?)', [par || 'site', 'confirmation commande envoyée', `/commandes/${c.id}`, c.email]);
      return noter(`Envoyé à ${c.email.trim()}`, true);
    } catch (e) {
      console.error('Confirmation de commande non envoyée :', e.message);
      return noter(`Échec de l'envoi : ${String(e.message).slice(0, 120)}`);
    }
  }
  const envoiAuto = () => settings().envoi_auto_bon !== '0';
  function notifier(sujet, texte) {
    const s = settings();
    const dest = s.notif_email || s.email; // à défaut d'adresse dédiée : l'e-mail de contact du site
    if (!transport || !dest) return;
    transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: dest, subject: sujet, text: texte })
      .catch((e) => console.error('Notification e-mail non envoyée :', e.message));
  }

  // ---------- Auth ----------
  // La base ne garde que l'empreinte du jeton de connexion : quelqu'un qui lit la base ne peut pas se connecter avec
  const empreinte = (jeton) => crypto.createHash('sha256').update(String(jeton || '')).digest('hex');
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => c.trim().split('=').map(decodeURIComponent)));
  function currentUser(req) {
    const token = cookies(req).k360;
    if (!token) return null;
    const s = db.get('SELECT * FROM sessions WHERE token=?', [empreinte(token)]);
    if (!s || s.expires_at < Date.now()) return null;
    return db.get('SELECT id,email,name,role,doit_changer FROM users WHERE id=?', [s.user_id]);
  }
  function requireAuth(req, res, next) {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Non authentifié' });
    // Mot de passe initial ou par défaut : rien d'autre n'est possible tant qu'il n'est pas changé
    if (u.doit_changer && !/^\/(api\/admin\/)?me\/password$/.test(req.path) && req.originalUrl !== '/api/admin/me/password') {
      return res.status(403).json({ error: 'Changez votre mot de passe pour continuer', code: 'mot_de_passe_a_changer' });
    }
    req.user = u; next();
  }
  const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Réservé aux administrateurs' }));

  const tentatives = new Map(); // anti force brute simple : 10 essais / 15 min par IP
  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip, now = Date.now();
    const t = (tentatives.get(ip) || []).filter((x) => now - x < 15 * 60e3);
    if (t.length >= 10) return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard.' });
    const { email, password } = req.body || {};
    const u = db.get('SELECT * FROM users WHERE email=?', [clean(email).toLowerCase()]);
    if (!u || !db.verifyPassword(String(password || ''), u.password_hash)) {
      tentatives.set(ip, [...t, now]);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', [empreinte(token), u.id, now + SESSION_DAYS * 864e5]);
    db.run('INSERT INTO journal (utilisateur,action,cible) VALUES (?,?,?)', [u.email, 'connexion', '']);
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `k360=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
    res.json({ id: u.id, email: u.email, name: u.name, role: u.role, doit_changer: u.doit_changer });
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = cookies(req).k360;
    if (token) db.run('DELETE FROM sessions WHERE token=?', [empreinte(token)]);
    res.setHeader('Set-Cookie', 'k360=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  // Qui est connecté (y compris un compte qui doit encore changer son mot de passe)
  app.get('/api/auth/me', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Non authentifié' });
    res.json(u);
  });

  // ---------- Endpoint du site (contrat de assets/js/main.js) ----------
  // GET ?action=stats|avis|savoirs|evenements — POST formulaire=… ou action=demander
  function fondsAction() {
    const s = settings();
    return Math.round(db.get(`SELECT COALESCE(SUM(contribution_eur),0) n FROM reservations WHERE status IN ${STATUTS_PAYES}`).n + (Number(s.fonds_ajustement) || 0));
  }
  function stats() {
    const fiches = db.all("SELECT data, created_at FROM soumissions WHERE type='enregistrement'").map((r) => ({ ...JSON.parse(r.data), _c: r.created_at }));
    const annee = new Date().getFullYear();
    const derniere = db.get("SELECT * FROM sorties WHERE decision IS NOT NULL AND decision!='' ORDER BY date DESC, id DESC LIMIT 1");
    const out = {
      randonneurs: fiches.length,
      participants: fiches.length,
      randonneurs_annee: fiches.filter((f) => String(f.date_sortie || f._c).startsWith(String(annee))).length,
      sorties: new Set(fiches.map((f) => f.id_sortie || f.date_sortie)).size,
      pays: new Set(fiches.map((f) => f.pays).filter(Boolean)).size,
      derniere_date: (derniere && derniere.date) || fiches.map((f) => f.date_sortie).filter(Boolean).sort().pop() || '',
      annee, maj: new Date().toISOString().slice(0, 10),
      dechets_kg: Math.round(db.get('SELECT COALESCE(SUM(dechets_kg),0) n FROM sorties').n * 10) / 10,
      fonds_action: fondsAction(),
    };
    if (derniere) Object.assign(out, { derniere_decision: derniere.decision, derniere_meteo: derniere.meteo || '', derniere_terrain: derniere.terrain || '' });
    return out;
  }

  app.get(ENDPOINT, (req, res) => {
    const a = req.query.action;
    if (a === 'stats') return res.json({ ok: true, stats: stats() });
    if (a === 'avis') return res.json({ ok: true, avis: db.all('SELECT auteur,pays,formule,note,texte,mois FROM avis WHERE publie=1 ORDER BY id DESC LIMIT 30') });
    if (a === 'savoirs') {
      const l = req.query.langue === 'en' ? 'en' : 'fr';
      return res.json({ ok: true, savoirs: db.all('SELECT titre,texte,lien FROM savoirs WHERE publie=1 AND langue=?', [l]).map((s) => ({ t: 'Réponse de l’équipe', h: s.titre, u: (s.lien || (l === 'en' ? 'ask' : 'question')).replace(/\.html(?=$|[?#])/, ''), x: s.texte })) });
    }
    // Panier : prix et disponibilité à jour (le serveur recalcule tout à la commande)
    if (a === 'produits') {
      return res.json({ ok: true, produits: db.all('SELECT code,nom,nom_en,prix,disponible,stock,image FROM produits ORDER BY ordre, id') });
    }
    if (a === 'evenements') {
      const rows = db.all("SELECT * FROM evenements WHERE publie=1 AND COALESCE(fin,debut)>=date('now') ORDER BY debut");
      return res.json({ ok: true, evenements: rows.map((e) => ({
        id: String(e.id), debut: e.debut, fin: e.fin || e.debut, type: e.type, organisateur: e.organisateur, lien: e.lien, image: e.image, a_la_une: !!e.a_la_une,
        titre: { fr: e.titre_fr, en: e.titre_en || e.titre_fr }, lieu: { fr: e.lieu_fr || '', en: e.lieu_en || e.lieu_fr || '' },
        description: { fr: e.description_fr || '', en: e.description_en || e.description_fr || '' }, heure: { fr: e.heure_fr || '', en: e.heure_en || e.heure_fr || '' },
      })) });
    }
    res.status(400).json({ ok: false, erreur: 'action inconnue' });
  });

  async function demanderIA(b) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, raison: 'ia_inactive' };
    const langue = b.langue === 'en' ? 'en' : 'fr';
    let refs = [];
    try { refs = JSON.parse(b.refs || '[]').slice(0, 6); } catch {}
    const base = savoirsSite[langue];
    const contexte = refs.map((r) => base.find((p) => p.u === r.u && p.h === r.h)).filter(Boolean).map((p) => `## ${p.h} (${p.u})\n${p.x}`).join('\n\n');
    // Les tarifs du back office priment sur les prix écrits dans les pages
    const tarifs = formules().filter((f) => f.actif).map((f) => `- ${f.nom} : ${f.prix} € ${f.type === 'forfait' ? `pour 1 à 4 personnes, puis ${f.supp || 0} € par personne supplémentaire` : f.type === 'a-partir' ? 'par personne (à partir de)' : 'par personne'}${f.age_min ? `, dès ${f.age_min} ans` : ''}`).join('\n');
    const general = b.mode === 'general';
    const system = `Tu es K269, le guide randonneur virtuel de Karthala360 (Discovermores, Moroni, Grande Comore). Réponds en ${langue === 'en' ? 'anglais' : 'français'}, brièvement (3 à 6 phrases), chaleureusement, en texte simple sans titres.
${general ? "Aucune page du site ne traite la question : réponds avec tes connaissances générales seulement si elle concerne le Karthala, les Comores, la randonnée ou le voyage aux Comores. Sinon réponds exactement HORS_SUJET." : "Appuie-toi uniquement sur les passages du site ci-dessous ; n'invente ni prix ni date. Si les passages ne suffisent pas, dis-le et propose de contacter l'équipe sur WhatsApp."}
Tarifs en vigueur (ils priment sur tout autre prix) :
${tarifs}
${contexte ? '\nPassages du site :\n' + contexte : ''}`;
    const messages = [];
    if (b.precedente) messages.push({ role: 'user', content: clean(b.precedente, 300) }, { role: 'assistant', content: '(réponse précédente)' });
    messages.push({ role: 'user', content: clean(b.question, 300) });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.K269_MODEL || 'claude-haiku-5-5', max_tokens: 600, system, messages }),
        signal: AbortSignal.timeout(18000),
      });
      if (!r.ok) return { ok: false, raison: 'erreur_ia' };
      const j = await r.json();
      const texte = (j.content || []).map((c) => c.text || '').join('').trim();
      if (!texte || texte.includes('HORS_SUJET')) return { ok: false, raison: 'hors_sujet' };
      return { ok: true, reponse: texte };
    } catch { return { ok: false, raison: 'erreur_ia' }; }
  }

  // Code de sortie, calculé comme sur le site : 4 lettres de la formule + date (SOFT-2026-10-12), EXT- sans Discovermores
  function codeSortie(data) {
    if (data.id_sortie) return data.id_sortie.toUpperCase().slice(0, 40);
    if (!data.date_sortie) return '';
    if (data.encadrement && data.encadrement !== 'Discovermores') return 'EXT-' + data.date_sortie;
    const f = formuleDe(data.formule);
    const lettres = (f && f.sigle) || ((f && f.code) || '').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
    if (lettres) return `${lettres}-${data.date_sortie}`;
    // Sans formule (fiche de groupe scolaire) : rattachée à la sortie Discovermores du jour, s'il n'y en a qu'une
    const duJour = db.all("SELECT code FROM sorties WHERE date=? AND code NOT LIKE 'EXT-%' AND statut!='annulée'", [data.date_sortie]);
    return duJour.length === 1 ? duJour[0].code : `GROUPE-${data.date_sortie}`;
  }

  app.post(ENDPOINT, async (req, res) => {
    const b = req.body || {};
    if (b.site_web) return res.json({ ok: true }); // pot de miel anti-robots
    // Limites par adresse IP, sur 10 minutes. Au-delà, le site propose d'envoyer par WhatsApp.
    const type = clean(b.formulaire, 40);
    const [categorie, max] = b.action === 'demander' ? ['ia', 30] : type === 'question' ? ['question', 60] : type === 'enregistrement' ? ['fiche', 60] : ['formulaire', 15];
    if (securite.depasse(`${categorie}:${req.ip}`, max, 10 * 60e3)) {
      return res.status(429).json({ ok: false, erreur: 'Trop d\'envois depuis cette connexion. Réessayez dans quelques minutes ou écrivez-nous sur WhatsApp.' });
    }
    if (b.action === 'demander') return res.json(await demanderIA(b));
    const data = {};
    for (const [k, v] of Object.entries(b)) if (k !== 'formulaire' && k !== 'site_web') data[k] = clean(v);

    if (type === 'reservation') {
      if (!data.nom || !data.telephone || !data.formule) return res.status(400).json({ ok: false, erreur: 'Champs obligatoires manquants' });
      // Formule réelle et active, date valide : pas de fausses réservations ni de prix inventés sur le bon
      const fResa = formuleDe(data.formule);
      if (!fResa || !fResa.actif) return res.status(400).json({ ok: false, erreur: 'Formule inconnue ou indisponible' });
      data.formule = fResa.nom;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date_souhaitee || '')) return res.status(400).json({ ok: false, erreur: 'Date souhaitée invalide' });
      if ((parseInt(data.adultes, 10) || 0) + (parseInt(data.enfants, 10) || 0) > 60) return res.status(400).json({ ok: false, erreur: 'Nombre de personnes : 60 au maximum' });
      const ref = 'K' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      const adultes = parseInt(data.adultes, 10) || 0, enfants = parseInt(data.enfants, 10) || 0;
      const { total, contribution_eur } = calculer(formuleDe(data.formule), adultes + enfants, data.contribution);
      db.run(`INSERT INTO reservations (ref,formule,nom,telephone,email,pays,date_souhaitee,adultes,enfants,estimation,contribution,prise_en_charge,message,langue,montant_total,contribution_eur)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [ref, data.formule, data.nom, data.telephone, data.email, data.pays, data.date_souhaitee,
        adultes, enfants, parseFloat(data.estimation) || null, data.contribution, data.prise_en_charge, data.message,
        String(data.page || '').includes('/en/') ? 'en' : 'fr', total, contribution_eur]);
      const code = codeSortie({ formule: data.formule, date_sortie: data.date_souhaitee, encadrement: 'Discovermores' });
      if (code) db.run('UPDATE reservations SET id_sortie=? WHERE ref=?', [code, ref]);
      // Bon de réservation envoyé au client par e-mail, sans faire attendre le visiteur
      if (envoiAuto()) { const n = db.get('SELECT id FROM reservations WHERE ref=?', [ref]); if (n) envoyerBon(n.id, 'site'); }
      notifier(`Nouvelle réservation ${ref} — ${data.formule}`,
        `${data.nom} (${data.telephone}${data.email ? ', ' + data.email : ''})\n${data.formule} · ${data.date_souhaitee} · ${adultes} adulte(s), ${enfants} enfant(s)\nMontant : ${total ?? '?'} €\n${data.message || ''}`);
      return res.json({ ok: true, id: ref });
    }
    // Commande du panier : lignes [{code, option, quantite}] ; prix, disponibilité et stock viennent de la base
    // Panier : plusieurs activités à réserver et/ou articles de la boutique, envoyés en une fois.
    // Tout est vérifié avant d'enregistrer quoi que ce soit (prix recalculés ici, jamais ceux du navigateur).
    if (type === 'commande' || type === 'panier') {
      if (!data.nom || !data.telephone) return res.status(400).json({ ok: false, erreur: 'Nom et téléphone obligatoires' });
      const lireListe = (v) => { if (v == null || v === '') return []; try { const l = JSON.parse(v); return Array.isArray(l) ? l : null; } catch { return null; } };
      const demandees = lireListe(b.panier), activitesDemandees = type === 'panier' ? lireListe(b.activites) : [];
      if (!demandees || !activitesDemandees || demandees.length > 30 || activitesDemandees.length > 10) return res.status(400).json({ ok: false, erreur: 'Panier invalide' });
      if (!demandees.length && !activitesDemandees.length) return res.status(400).json({ ok: false, erreur: 'Panier vide' });
      if (activitesDemandees.length && data.accepte_cgv !== 'Oui') return res.status(400).json({ ok: false, erreur: 'Merci d\'accepter les conditions de vente' });
      const en = String(data.page || '').includes('/en/');

      // Activités
      const activites = [];
      for (const a of activitesDemandees) {
        const f = formuleDe(clean(a && a.formule, 80));
        if (!f || !f.actif) return res.status(409).json({ ok: false, erreur: `Formule « ${clean(a && a.formule, 80)} » indisponible`, code: 'formule' });
        const date = clean(a.date_souhaitee, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, erreur: `Date manquante pour « ${f.nom} »` });
        const adultes = Math.max(0, parseInt(a.adultes, 10) || 0), enfants = Math.max(0, parseInt(a.enfants, 10) || 0);
        if (adultes + enfants < 1 || adultes + enfants > 60) return res.status(400).json({ ok: false, erreur: `Nombre de personnes invalide pour « ${f.nom} »` });
        const contribution = ['', '0', '2', '5', '10', '20'].includes(String(a.contribution ?? '')) ? String(a.contribution ?? '') : '';
        activites.push({ f, date, adultes, enfants, contribution, prise_en_charge: clean(a.prise_en_charge, 200), ...calculer(f, adultes + enfants, contribution) });
      }

      // Articles de la boutique
      const parCode = Object.fromEntries(db.all('SELECT * FROM produits').map((p) => [p.code, p]));
      const lignes = [], parProduit = {};
      for (const l of demandees) {
        const p = parCode[clean(l && l.code, 60)];
        const q = parseInt(l && l.quantite, 10);
        if (!p) return res.status(400).json({ ok: false, erreur: 'Un produit du panier n\'existe plus', code: 'produit_inconnu' });
        if (!p.disponible) return res.status(409).json({ ok: false, erreur: `« ${p.nom} » n'est plus disponible`, code: 'indisponible', produit: p.code });
        if (!(q >= 1 && q <= 20)) return res.status(400).json({ ok: false, erreur: 'Quantité invalide (1 à 20)' });
        parProduit[p.code] = (parProduit[p.code] || 0) + q;
        if (p.stock != null && parProduit[p.code] > p.stock) return res.status(409).json({ ok: false, erreur: `Stock insuffisant pour « ${p.nom} » (${p.stock} disponible${p.stock > 1 ? 's' : ''})`, code: 'stock', produit: p.code, stock: p.stock });
        lignes.push({ code: p.code, nom: p.nom, option: clean(l.option, 60), quantite: q, prix: p.prix, total: Math.round(p.prix * q * 100) / 100 });
      }

      const jour = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const nouvelleRef = (lettre) => lettre + jour + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      // Un dossier commun relie tout ce qui a été envoyé ensemble (seulement s'il y a plus d'un élément)
      const groupe = activites.length + (lignes.length ? 1 : 0) > 1 ? nouvelleRef('P') : null;

      const reservations = [];
      for (const a of activites) {
        const ref = nouvelleRef('K');
        const r = db.run(`INSERT INTO reservations (ref,formule,nom,telephone,email,pays,date_souhaitee,adultes,enfants,estimation,contribution,prise_en_charge,message,langue,montant_total,contribution_eur,groupe,id_sortie)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [ref, a.f.nom, data.nom, data.telephone, data.email, data.pays, a.date, a.adultes, a.enfants, a.total, a.contribution, a.prise_en_charge,
          data.message, en ? 'en' : 'fr', a.total, a.contribution_eur, groupe, codeSortie({ formule: a.f.nom, date_sortie: a.date, encadrement: 'Discovermores' }) || null]);
        reservations.push({ id: r.id, ref, formule: a.f.nom, date_souhaitee: a.date, personnes: a.adultes + a.enfants, total: a.total });
      }

      let commande = null;
      if (lignes.length) {
        const total = Math.round(lignes.reduce((s, l) => s + l.total, 0) * 100) / 100;
        const resume = lignes.map((l) => `${l.quantite} × ${l.nom}${l.option ? ` (${l.option})` : ''}`).join(', ');
        const ref = nouvelleRef('B');
        db.run(`INSERT INTO commandes (ref,client,telephone,email,produit,detail,mode_remise,quantite,montant,statut,lignes,langue,groupe)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [ref, data.nom, data.telephone, data.email, resume.slice(0, 2000), data.message, clean(data.mode_remise, 80),
          lignes.reduce((s, l) => s + l.quantite, 0), total, 'à confirmer', JSON.stringify(lignes), en ? 'en' : 'fr', groupe]);
        for (const [code, q] of Object.entries(parProduit)) db.run('UPDATE produits SET stock=stock-? WHERE code=? AND stock IS NOT NULL', [q, code]);
        commande = { ref, total, resume };
        if (envoiAuto()) envoyerConfirmationCommande(ref, 'site');
      }

      const total = Math.round((reservations.reduce((s, r) => s + (r.total || 0), 0) + (commande ? commande.total : 0)) * 100) / 100;
      const id = groupe || (reservations[0] && reservations[0].ref) || commande.ref;
      notifier(`Nouveau panier ${id} — ${total} €`, `${data.nom} (${data.telephone}${data.email ? ', ' + data.email : ''})\n`
        + reservations.map((r) => `Réservation ${r.ref} : ${r.formule}, ${r.date_souhaitee}, ${r.personnes} pers., ${r.total} €`).join('\n')
        + (commande ? `\nCommande ${commande.ref} : ${commande.resume} (${commande.total} €), remise : ${data.mode_remise || '—'}` : '') + `\n${data.message || ''}`);
      // Bons de réservation : un seul e-mail au client, sans faire attendre le visiteur
      if (reservations.length && envoiAuto()) envoyerBons(reservations.map((r) => r.id), 'site');
      return res.json({ ok: true, id, total, groupe, reservations: reservations.map(({ id: _, ...r }) => r), commande: commande && { ref: commande.ref, total: commande.total }, lignes });
    }
    if (type === 'question') {
      db.run('INSERT INTO questions (question,langue,resultats,ia,type_reponse,page) VALUES (?,?,?,?,?,?)',
        [clean(data.question, 200), data.langue, parseInt(data.resultats, 10) || 0, data.ia, data.type_reponse, data.page]);
      return res.json({ ok: true });
    }
    if (['retour', 'contact', 'enregistrement', 'groupe'].includes(type)) {
      // Fiche participant : rattachée à sa sortie (créée si besoin)
      if (type === 'enregistrement' || type === 'groupe') {
        data.id_sortie = codeSortie(data);
        if (data.id_sortie && data.date_sortie) {
          db.run('INSERT OR IGNORE INTO sorties (code,formule,date) VALUES (?,?,?)', [data.id_sortie, data.formule || (data.id_sortie.startsWith('EXT-') ? 'Hors Discovermores' : ''), data.date_sortie]);
        }
      }
      const r = db.run('INSERT INTO soumissions (type,data) VALUES (?,?)', [type, JSON.stringify(data)]);
      // Retour d'expérience avec accord de publication : proposé comme avis (à valider dans le back office)
      if (type === 'retour' && data.publication === 'Oui' && data.commentaire) {
        const f = formuleDe(data.formule);
        db.run('INSERT INTO avis (auteur,pays,formule,note,texte,mois,publie) VALUES (?,?,?,?,?,?,0)',
          [data.signature || 'Anonyme', data.pays || '', (f && f.code) || data.formule, parseInt(data.note, 10) || 5, data.commentaire, new Date().toISOString().slice(0, 7)]);
      }
      // Fiche participant : l'équipe est prévenue tout de suite d'une information de santé ou d'un mineur, pour le guide
      if (type === 'enregistrement' || type === 'groupe') {
        const points = [];
        const mineur = (t) => /^(moins de 12 ans|12 à 17 ans)$/i.test(String(t || ''));
        if (data.sante === 'Oui') points.push(`Santé : ${data.sante_detail || 'information à demander au participant'}`);
        if (data.acc_sante === 'Oui') points.push(`Santé (accompagnant ${data.acc_nom || ''}) : ${data.acc_sante_detail || 'à demander'}`);
        if (data.g_sante === 'Oui') points.push('Groupe : au moins un élève a une information de santé (voir avec le responsable)');
        if (mineur(data.tranche_age)) points.push(`Participant mineur (${data.tranche_age}) — adulte responsable : ${data.responsable_mineur || 'NON INDIQUÉ'}`);
        if (mineur(data.acc_tranche_age)) points.push(`Accompagnant mineur (${data.acc_tranche_age})`);
        if (points.length) {
          const qui = type === 'groupe' ? `${data.g_etablissement || 'Groupe'} (${data.g_responsable_nom || ''} ${data.g_responsable_tel || ''})` : `${data.nom || ''} (${data.telephone || ''})`;
          notifier(`⚠️ Participant à signaler au guide — ${data.id_sortie || 'sortie non précisée'}`,
            `${qui}\nSortie : ${data.id_sortie || '—'} · ${data.date_sortie || data.g_date_sortie || ''}\n\n${points.map((p) => '• ' + p).join('\n')}\n\nUrgence : ${data.urgence_nom || '—'} ${data.urgence_tel || ''}\nFiche complète dans le back office.`);
        }
      }
      if (type === 'contact') notifier(`Nouveau message : ${data.sujet || 'contact'}`, `${data.nom} (${data.email || ''} ${data.telephone || ''})\n${data.organisation || ''}\n\n${data.message || ''}`);
      return res.json({ ok: true, id: String(r.id) });
    }
    res.status(400).json({ ok: false, erreur: 'formulaire inconnu' });
  });

  // config.js du site : endpoint, contacts, IA et tarifs viennent du serveur
  const configSource = fs.readFileSync(path.join(SITE, 'assets', 'js', 'config.js'), 'utf8');
  app.get('/assets/js/config.js', (req, res) => {
    const s = settings();
    const liste = formules().filter((f) => f.actif).map((f) => ({ code: f.code, nom: f.nom, prix: f.prix, type: f.type, supp: f.supp, contrib: f.contrib, age_min: f.age_min, min_pers: f.min_pers }));
    const js = configSource
      .replace(/endpoint:\s*"[^"]*"/, `endpoint: ${JSON.stringify(ENDPOINT)}`)
      .replace(/whatsapp:\s*"[^"]*"/, `whatsapp: ${JSON.stringify(String(s.whatsapp || '').replace(/\D/g, ''))}`)
      .replace(/email:\s*"[^"]*"/, `email: ${JSON.stringify(s.email || '')}`)
      .replace(/delaiReponse:\s*"[^"]*"/, `delaiReponse: ${JSON.stringify(s.delai_reponse || '24 heures')}`)
      .replace(/ia:\s*(true|false)/, `ia: ${!!process.env.ANTHROPIC_API_KEY}`)
      .replace(/seuilAction:\s*[\d.]+/, `seuilAction: ${Number(s.seuil_action) || 500}`)
      .replace(/acomptePct:\s*[\d.]+/, `acomptePct: ${Number(s.acompte_pct) || 30}`)
      .replace(/formules:\s*\[[\s\S]*\]\s*\n\};?\s*$/, `formules: ${JSON.stringify(liste, null, 2)}\n};\n`);
    res.type('application/javascript').setHeader('Cache-Control', 'no-cache');
    res.send(js);
  });

  // ---------- Back office ----------
  const admin = express.Router();
  admin.use(requireAuth);
  // Journal : chaque modification réussie est tracée (qui, quoi, quand)
  admin.use((req, res, next) => {
    if (req.method === 'GET') return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const b = { ...(req.body || {}) };
      for (const k of ['password', 'current', 'next', 'data']) if (k in b) b[k] = '•••';
      const action = { POST: 'création', PUT: 'modification', DELETE: 'suppression' }[req.method] || req.method;
      try { db.run('INSERT INTO journal (utilisateur,action,cible,detail) VALUES (?,?,?,?)', [req.user.email, action, req.path, JSON.stringify(b).slice(0, 500)]); } catch {}
    });
    next();
  });

  admin.get('/stats', (req, res) => {
    const c = (sql) => db.get(sql).n;
    res.json({
      reservations_new: c("SELECT COUNT(*) n FROM reservations WHERE status='nouvelle'"),
      reservations_total: c('SELECT COUNT(*) n FROM reservations'),
      a_venir: c("SELECT COALESCE(SUM(adultes+enfants),0) n FROM reservations WHERE status IN ('confirmée','acompte payé','payée') AND date_souhaitee>=date('now')"),
      encaisse: c('SELECT COALESCE(SUM(COALESCE(acompte,0)+COALESCE(solde_paye,0)),0) n FROM reservations'),
      a_encaisser: c(`SELECT COALESCE(SUM(MAX(COALESCE(montant_total,estimation,0)-COALESCE(acompte,0)-COALESCE(solde_paye,0),0)),0) n FROM reservations WHERE status IN ('confirmée','acompte payé','payée')`),
      soumissions_new: c('SELECT COUNT(*) n FROM soumissions WHERE traite=0'),
      avis_a_valider: c('SELECT COUNT(*) n FROM avis WHERE publie=0'),
      questions_sans_reponse: c("SELECT COUNT(*) n FROM questions WHERE resultats=0 AND ia!='Oui'"),
      sorties_sans_fiche: c("SELECT COUNT(*) n FROM sorties WHERE date<=date('now') AND (decision IS NULL OR decision='') AND statut!='annulée'"),
      commandes_new: c("SELECT COUNT(*) n FROM commandes WHERE statut='à confirmer'"),
      fonds_action: fondsAction(),
      seuil_action: Number(settings().seuil_action) || 500,
      alerte: settings().alerte_niveau,
      public: stats(),
      par_formule: db.all("SELECT formule AS label, COUNT(*) AS n FROM reservations WHERE status!='annulée' GROUP BY formule ORDER BY n DESC"),
      recentes: db.all('SELECT ref,nom,formule,date_souhaitee,adultes,enfants,status FROM reservations ORDER BY id DESC LIMIT 6'),
      prochaines_sorties: db.all("SELECT s.*, (SELECT COUNT(*) FROM soumissions WHERE type='enregistrement' AND json_extract(data,'$.id_sortie')=s.code) participants FROM sorties s WHERE date>=date('now') AND statut!='annulée' ORDER BY date LIMIT 5"),
    });
  });

  // Rapports : sorties, randonneurs et chiffre d'affaires par mois et par formule
  admin.get('/rapports', (req, res) => {
    const annee = String(req.query.annee || new Date().getFullYear());
    res.json({
      annee,
      par_mois: db.all(`SELECT substr(date_souhaitee,1,7) mois, COUNT(*) reservations, SUM(adultes+enfants) personnes,
          SUM(CASE WHEN status!='annulée' THEN COALESCE(montant_total,estimation,0) ELSE 0 END) montant,
          SUM(COALESCE(acompte,0)+COALESCE(solde_paye,0)) encaisse
        FROM reservations WHERE substr(date_souhaitee,1,4)=? GROUP BY mois ORDER BY mois`, [annee]),
      par_formule: db.all(`SELECT formule, COUNT(*) reservations, SUM(adultes+enfants) personnes, SUM(COALESCE(montant_total,estimation,0)) montant
        FROM reservations WHERE status!='annulée' AND substr(date_souhaitee,1,4)=? GROUP BY formule ORDER BY reservations DESC`, [annee]),
      sorties: db.all(`SELECT substr(date,1,7) mois, COUNT(*) sorties, SUM(CASE WHEN decision='No Go' THEN 1 ELSE 0 END) no_go,
          SUM(COALESCE(dechets_kg,0)) dechets_kg FROM sorties WHERE substr(date,1,4)=? GROUP BY mois ORDER BY mois`, [annee]),
      participants_par_pays: db.all(`SELECT json_extract(data,'$.pays') pays, COUNT(*) n FROM soumissions WHERE type='enregistrement'
        AND substr(json_extract(data,'$.date_sortie'),1,4)=? GROUP BY pays ORDER BY n DESC`, [annee]),
    });
  });

  admin.get('/reservations', (req, res) => {
    const p = []; let w = '1=1';
    if (req.query.status) { w += ' AND status=?'; p.push(req.query.status); }
    if (req.query.paiement === 'impaye') w += " AND status IN ('confirmée','acompte payé') AND COALESCE(montant_total,estimation,0) > COALESCE(acompte,0)+COALESCE(solde_paye,0)";
    if (req.query.q) { w += ' AND (nom LIKE ? OR telephone LIKE ? OR ref LIKE ? OR email LIKE ? OR groupe LIKE ?)'; const q = `%${req.query.q}%`; p.push(q, q, q, q, q); }
    res.json(db.all(`SELECT * FROM reservations WHERE ${w} ORDER BY id DESC`, p));
  });
  admin.get('/soumissions', (req, res) => {
    const rows = req.query.type ? db.all('SELECT * FROM soumissions WHERE type=? ORDER BY id DESC', [req.query.type]) : db.all('SELECT * FROM soumissions ORDER BY id DESC');
    res.json(rows.map((r) => ({ ...r, data: JSON.parse(r.data) })));
  });
  admin.get('/sorties/:id/participants', (req, res) => {
    const s = db.get('SELECT * FROM sorties WHERE id=?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Sortie introuvable' });
    res.json({
      sortie: s,
      participants: db.all("SELECT id, created_at, data FROM soumissions WHERE type IN ('enregistrement','groupe') AND json_extract(data,'$.id_sortie')=? ORDER BY id", [s.code]).map((r) => ({ id: r.id, recu_le: r.created_at, ...JSON.parse(r.data) })),
      reservations: db.all('SELECT ref,nom,telephone,adultes,enfants,status FROM reservations WHERE id_sortie=?', [s.code]),
    });
  });
  admin.get('/tarifs/pages', (req, res) => res.json(PAGES_PRIX));

  // ---------- Fiches participants en PDF ----------
  const fichePdf = (r) => ({ id: r.id, recu_le: r.created_at, data: JSON.parse(r.data) });
  // Une fiche
  admin.get('/pdf/fiche/:id', (req, res) => {
    const r = db.get("SELECT * FROM soumissions WHERE id=? AND type IN ('enregistrement','groupe')", [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Fiche introuvable' });
    const f = fichePdf(r);
    pdf.ficheUnique(res, f.data, f.recu_le);
  });
  // Toutes les fiches d'un type (enregistrement ou groupe), éventuellement d'une date ou d'une sortie
  admin.get('/pdf/fiches/:type', (req, res) => {
    const type = req.params.type === 'groupe' ? 'groupe' : 'enregistrement';
    let liste = db.all('SELECT * FROM soumissions WHERE type=? ORDER BY id', [type]).map(fichePdf);
    if (req.query.date) liste = liste.filter((f) => f.data.date_sortie === req.query.date);
    if (req.query.sortie) liste = liste.filter((f) => f.data.id_sortie === req.query.sortie);
    const titre = type === 'groupe' ? 'Fiches des groupes' : 'Fiches participants';
    pdf.plusieursFiches(res, liste, titre, `${type === 'groupe' ? 'groupes' : 'fiches-participants'}${req.query.date ? '-' + req.query.date : ''}.pdf`);
  });
  // Dossier d'une sortie : liste de sécurité + fiche de chaque randonneur
  admin.get('/pdf/sortie/:id', (req, res) => {
    const s = db.get('SELECT * FROM sorties WHERE id=?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Sortie introuvable' });
    const liste = db.all("SELECT * FROM soumissions WHERE type IN ('enregistrement','groupe') AND json_extract(data,'$.id_sortie')=? ORDER BY id", [s.code]).map(fichePdf);
    pdf.dossierSortie(res, s, liste);
  });

  function csv(res, name, rows) {
    const head = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.send('﻿' + [head.join(';'), ...rows.map((r) => head.map((h) => esc(r[h])).join(';'))].join('\n'));
  }
  admin.get('/export/:what.csv', (req, res) => {
    const w = req.params.what;
    if (w === 'reservations') return csv(res, w, db.all('SELECT * FROM reservations ORDER BY id'));
    if (['retour', 'contact', 'enregistrement', 'groupe'].includes(w)) {
      return csv(res, w, db.all('SELECT id,created_at,data FROM soumissions WHERE type=? ORDER BY id', [w]).map((r) => ({ id: r.id, recu_le: r.created_at, ...JSON.parse(r.data) })));
    }
    if (w.startsWith('sortie-')) {
      const code = w.slice(7);
      return csv(res, w, db.all("SELECT id,created_at,data FROM soumissions WHERE type IN ('enregistrement','groupe') AND json_extract(data,'$.id_sortie')=? ORDER BY id", [code])
        .map((r) => { const d = JSON.parse(r.data); return { nom: d.nom, telephone: d.telephone, tranche_age: d.tranche_age, nationalite: d.nationalite, sante: d.sante, sante_detail: d.sante_detail, urgence_nom: d.urgence_nom, urgence_tel: d.urgence_tel, responsable_mineur: d.responsable_mineur, accord_photo: d.accord_photo }; }));
    }
    if (['questions', 'sorties', 'commandes', 'journal'].includes(w)) return csv(res, w, db.all(`SELECT * FROM ${w} ORDER BY id`));
    res.status(404).end();
  });

  // Sauvegarde complète de la base (fichier SQLite)
  admin.get('/sauvegarde', requireAdmin, (req, res) => {
    const nom = `karthala360-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db`;
    db.run('INSERT INTO journal (utilisateur,action,cible) VALUES (?,?,?)', [req.user.email, 'sauvegarde', nom]);
    res.setHeader('Content-Type', 'application/vnd.sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(db.exporter());
  });

  // Envoi d'image (galerie, logos partenaires) : JSON { nom, data: base64 }
  const TYPES_IMAGE = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/svg+xml': '.svg' };
  admin.post('/upload', (req, res) => {
    const m = String(req.body?.data || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m || !TYPES_IMAGE[m[1]]) return res.status(400).json({ error: 'Image JPEG, PNG, WebP ou SVG attendue' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (8 Mo maximum)' });
    const base = String(req.body.nom || 'image').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'image';
    const fichier = `${Date.now().toString(36)}-${base}${TYPES_IMAGE[m[1]]}`;
    fs.writeFileSync(path.join(UPLOADS, fichier), buf);
    res.status(201).json({ fichier, url: `/uploads/${fichier}` });
  });

  admin.get('/settings', (req, res) => res.json({ ...settings(), ia_active: !!process.env.ANTHROPIC_API_KEY, smtp_actif: !!transport }));
  admin.put('/settings', requireAdmin, (req, res) => {
    const b = req.body || {};
    // Adresses : une erreur ici casserait tous les liens du site
    if (b.site_url && !/^https?:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(clean(b.site_url))) {
      return res.status(400).json({ error: 'Adresse du site : uniquement le domaine, ex. https://karthala360.discovermores.com (sans /site ni page)' });
    }
    for (const k of ['lien_instagram', 'lien_facebook']) {
      if (b[k] && !/^https:\/\/[^\s"'<>]+$/.test(clean(b[k]))) return res.status(400).json({ error: `Lien ${k.slice(5)} : adresse complète attendue, commençant par https://` });
    }
    for (const [k, v] of Object.entries(b)) {
      if (!SETTINGS_AUTORISES.has(k)) continue;
      db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, clean(v)]);
    }
    res.json(settings());
  });

  admin.get('/users', requireAdmin, (req, res) => res.json(db.all('SELECT id,email,name,role,created_at FROM users')));
  admin.post('/users', requireAdmin, (req, res) => {
    const { email, name, password, role } = req.body || {};
    if (!email || !name || !password) return res.status(400).json({ error: 'E-mail, nom et mot de passe requis.' });
    const erreur = securite.erreurMotDePasse(password, db.MDP_PAR_DEFAUT, email);
    if (erreur) return res.status(400).json({ error: erreur });
    try {
      const r = db.run('INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,?)', [email.toLowerCase().trim(), name, db.hashPassword(password), role === 'admin' ? 'admin' : 'editor']);
      res.status(201).json({ id: r.id });
    } catch { res.status(409).json({ error: 'E-mail déjà utilisé' }); }
  });
  admin.delete('/users/:id', requireAdmin, (req, res) => {
    if (+req.params.id === req.user.id) return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    db.run('DELETE FROM sessions WHERE user_id=?', [req.params.id]);
    db.run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });
  admin.put('/me/password', (req, res) => {
    const { current, next } = req.body || {};
    const u = db.get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!db.verifyPassword(String(current || ''), u.password_hash)) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    const erreur = securite.erreurMotDePasse(next, db.MDP_PAR_DEFAUT, u.email);
    if (erreur) return res.status(400).json({ error: erreur });
    if (current === next) return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l\'actuel' });
    db.run('UPDATE users SET password_hash=?, doit_changer=0 WHERE id=?', [db.hashPassword(next), u.id]);
    db.run('DELETE FROM sessions WHERE user_id=? AND token!=?', [u.id, empreinte(cookies(req).k360)]);
    res.json({ ok: true });
  });

  // Paiements : le statut suit les montants reçus (acompte → « acompte payé », tout reçu → « payée »)
  function statutPaiement(r) {
    if (!['nouvelle', 'confirmée', 'acompte payé', 'payée'].includes(r.status)) return r.status;
    const recu = (r.acompte || 0) + (r.solde_paye || 0);
    const du = r.montant_total ?? r.estimation ?? 0;
    if (du > 0 && recu >= du) return 'payée';
    if (recu > 0) return 'acompte payé';
    return r.status;
  }
  const NUMERIQUES = new Set(['adultes', 'enfants', 'montant_total', 'acompte', 'solde_paye', 'prix', 'supp', 'contrib', 'age_min', 'min_pers', 'actif', 'ordre',
    'disponible', 'stock', 'quantite', 'montant', 'dechets_kg', 'note', 'publie', 'a_la_une', 'traite']);
  const valeur = (k, v) => (NUMERIQUES.has(k) ? num(v) : v);

  // ---------- Réservations : ajout depuis le back office (reçue par téléphone, WhatsApp, sur place) ----------
  admin.post('/reservations', async (req, res) => {
    const b = req.body || {};
    const d = {};
    for (const k of ['nom', 'telephone', 'email', 'pays', 'formule', 'date_souhaitee', 'contribution', 'prise_en_charge', 'message', 'admin_note', 'langue']) d[k] = clean(b[k], k === 'message' ? 2000 : 200);
    if (!d.nom || !d.telephone || !d.formule) return res.status(400).json({ error: 'Nom, téléphone et formule obligatoires' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date_souhaitee)) return res.status(400).json({ error: 'La date souhaitée est obligatoire' });
    const f = formuleDe(d.formule);
    if (!f) return res.status(400).json({ error: 'Formule inconnue' });
    const adultes = Math.max(0, parseInt(b.adultes, 10) || 0), enfants = Math.max(0, parseInt(b.enfants, 10) || 0);
    if (adultes + enfants < 1 || adultes + enfants > 60) return res.status(400).json({ error: 'Nombre de personnes : de 1 à 60' });
    const { total, contribution_eur } = calculer(f, adultes + enfants, d.contribution);
    const ref = 'K' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const statut = RES_STATUS.includes(b.status) ? b.status : 'confirmée';
    const r = db.run(`INSERT INTO reservations (ref,formule,nom,telephone,email,pays,date_souhaitee,adultes,enfants,contribution,prise_en_charge,message,langue,montant_total,contribution_eur,status,admin_note,id_sortie)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [ref, f.nom, d.nom, d.telephone, d.email, d.pays, d.date_souhaitee, adultes, enfants, d.contribution, d.prise_en_charge, d.message,
      d.langue === 'en' ? 'en' : 'fr', num(b.montant_total) ?? total, contribution_eur, statut, d.admin_note ? `${d.admin_note} (ajoutée par ${req.user.email})` : `Ajoutée par ${req.user.email}`,
      codeSortie({ formule: f.nom, date_sortie: d.date_souhaitee, encadrement: 'Discovermores' }) || null]);
    // Bon envoyé au client si demandé (case cochée par défaut quand un e-mail est saisi)
    if (b.envoyer_bon !== false && b.envoyer_bon !== 0 && envoiAuto()) await envoyerBon(r.id, req.user.email);
    res.status(201).json(db.get('SELECT * FROM reservations WHERE id=?', [r.id]));
  });

  // ---------- Bons de réservation en PDF ----------
  const coordonneesPaiement = () => { const s = settings(); return { virement: s.paiement_virement, paypal: s.paiement_paypal, mvola: s.paiement_mvola, wakati: s.paiement_wakati, acompte_pct: Number(s.acompte_pct) || 30, whatsapp: s.whatsapp, email: s.email }; };
  // Envoyer (ou renvoyer) le bon au client depuis le back office
  admin.post('/reservations/:id/envoyer-bon', async (req, res) => {
    const resultat = await envoyerBon(req.params.id, req.user.email);
    res.status(resultat.ok ? 200 : 400).json(resultat.ok ? resultat : { ...resultat, error: resultat.info });
  });
  admin.get('/pdf/reservation/:id', (req, res) => {
    const r = db.get('SELECT * FROM reservations WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Réservation introuvable' });
    pdf.bonReservation(res, r, formuleDe(r.formule), coordonneesPaiement());
  });
  admin.get('/pdf/reservations', (req, res) => {
    const p = []; let w = '1=1';
    if (req.query.status) { w += ' AND status=?'; p.push(req.query.status); }
    if (req.query.du) { w += ' AND date_souhaitee>=?'; p.push(req.query.du); }
    if (req.query.au) { w += ' AND date_souhaitee<=?'; p.push(req.query.au); }
    const liste = db.all(`SELECT * FROM reservations WHERE ${w} ORDER BY date_souhaitee, id`, p);
    pdf.listeReservations(res, liste, { status: req.query.status, du: req.query.du, au: req.query.au });
  });

  // ---------- Fiches participants et groupes : ajout et modification depuis le back office ----------
  // Champs autorisés (mêmes noms que les formulaires du site)
  const CHAMPS_FICHE = {
    enregistrement: ['nom', 'sexe', 'tranche_age', 'nationalite', 'profil', 'pays', 'ville', 'telephone', 'date_sortie', 'id_sortie', 'encadrement', 'formule',
      'guide_agence', 'itineraire', 'duree_prevue', 'venu_avec', 'premiere_fois', 'urgence_nom', 'urgence_tel', 'responsable_mineur', 'niveau', 'sante',
      'sante_detail', 'accord_photo', 'consentement', 'motivation', 'connu_par'],
    groupe: ['etablissement', 'niveau_scolaire', 'ville', 'eleves', 'dont_filles', 'accompagnateurs', 'tranche_age', 'date_sortie', 'id_sortie', 'encadrement',
      'guide_agence', 'responsable_nom', 'responsable_tel', 'second_tel', 'sante', 'accord_photo', 'consentement'],
  };
  function ficheDepuis(type, source, base = {}) {
    const d = { ...base };
    for (const k of CHAMPS_FICHE[type]) if (source[k] !== undefined) d[k] = clean(source[k], k === 'sante_detail' ? 1000 : 200);
    return d;
  }
  function rattacher(d, codeDonne) {
    // Code donné à la main : respecté ; sinon recalculé (formule + date, ou sortie du jour pour un groupe)
    d.id_sortie = codeDonne ? clean(codeDonne, 40).toUpperCase() : codeSortie({ ...d, id_sortie: '' });
    if (d.id_sortie && d.date_sortie) {
      db.run('INSERT OR IGNORE INTO sorties (code,formule,date) VALUES (?,?,?)', [d.id_sortie, d.formule || (d.id_sortie.startsWith('EXT-') ? 'Hors Discovermores' : ''), d.date_sortie]);
    }
    return d;
  }
  admin.post('/soumissions', (req, res) => {
    const type = req.body?.type;
    if (!CHAMPS_FICHE[type]) return res.status(400).json({ error: 'Seules les fiches participants et de groupe peuvent être ajoutées ici' });
    const d = ficheDepuis(type, req.body.data || {});
    if (type === 'enregistrement' && !d.nom) return res.status(400).json({ error: 'Le nom est obligatoire' });
    if (type === 'groupe' && !d.etablissement) return res.status(400).json({ error: 'Le nom de l\'école ou du groupe est obligatoire' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date_sortie || '')) return res.status(400).json({ error: 'La date de la sortie est obligatoire' });
    d.page = 'back office'; d.ajoute_par = req.user.email;
    rattacher(d, d.id_sortie);
    const r = db.run('INSERT INTO soumissions (type,data) VALUES (?,?)', [type, JSON.stringify(d)]);
    res.status(201).json({ id: r.id, data: d });
  });
  admin.put('/soumissions/:id', (req, res, next) => {
    const ligne = db.get('SELECT * FROM soumissions WHERE id=?', [req.params.id]);
    if (!ligne) return res.status(404).json({ error: 'Fiche introuvable' });
    if (!req.body?.data) return next(); // simple « traité / non traité » : CRUD générique
    if (!CHAMPS_FICHE[ligne.type]) return res.status(400).json({ error: 'Ce formulaire ne se modifie pas' });
    const avant = JSON.parse(ligne.data);
    const d = ficheDepuis(ligne.type, req.body.data, avant);
    if (ligne.type === 'enregistrement' && !d.nom) return res.status(400).json({ error: 'Le nom est obligatoire' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date_sortie || '')) return res.status(400).json({ error: 'La date de la sortie est obligatoire' });
    // Date ou formule changée sans nouveau code : la fiche suit la bonne sortie
    const codeChange = req.body.data.id_sortie !== undefined && clean(req.body.data.id_sortie) !== (avant.id_sortie || '');
    const sortieChange = d.date_sortie !== avant.date_sortie || d.formule !== avant.formule || d.encadrement !== avant.encadrement;
    if (codeChange) rattacher(d, req.body.data.id_sortie);
    else if (sortieChange) rattacher(d, '');
    d.modifie_par = req.user.email; d.modifie_le = new Date().toISOString().slice(0, 16).replace('T', ' ');
    db.run('UPDATE soumissions SET data=? WHERE id=?', [JSON.stringify(d), ligne.id]);
    res.json({ id: ligne.id, data: d });
  });

  // CRUD générique
  for (const [name, cols] of Object.entries(RESOURCES)) {
    if (!['reservations', 'soumissions'].includes(name)) {
      admin.get(`/${name}`, (req, res) => res.json(db.all(`SELECT * FROM ${name} ORDER BY ${name === 'sorties' ? 'date DESC,' : name === 'formules' || name === 'partenaires' || name === 'photos' ? 'ordre,' : ''} id DESC${name === 'journal' ? ' LIMIT 500' : ''}`)));
    }
    if (cols.length && !SANS_CREATION.has(name)) {
      admin.post(`/${name}`, (req, res) => {
        const b = req.body || {};
        if (name === 'formules') {
          if (!clean(b.nom) || !(num(b.prix) > 0)) return res.status(400).json({ error: 'Nom et prix (supérieur à 0) obligatoires' });
          if (!['forfait', 'personne', 'a-partir'].includes(b.type)) b.type = 'personne';
          const existantes = formules();
          if (existantes.some((f) => f.nom.toLowerCase() === clean(b.nom).toLowerCase())) return res.status(409).json({ error: 'Une formule porte déjà ce nom' });
          const base = clean(b.nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'formule';
          let code = base, i = 2;
          while (existantes.some((f) => f.code === code)) code = `${base}-${i++}`;
          b.code = code;
          // Sigle unique de 4 caractères pour le code des sorties (BIVO-2026-11-08) : jamais celui d'une autre formule
          const pris = new Set(existantes.map((f) => f.sigle || f.code.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()));
          const lettres = code.replace(/[^a-z]/g, '').toUpperCase().padEnd(4, 'X');
          let sigle = lettres.slice(0, 4);
          for (let n = 2; pris.has(sigle) && n < 100; n++) sigle = lettres.slice(0, 4 - String(n).length) + n;
          b.sigle = sigle;
          if (b.actif === undefined) b.actif = 1;
        }
        if (name === 'produits') {
          if (!clean(b.nom) || !(num(b.prix) > 0)) return res.status(400).json({ error: 'Nom et prix (supérieur à 0) obligatoires' });
          const base = clean(b.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'produit';
          let code = base, i = 2;
          while (db.get('SELECT 1 x FROM produits WHERE code=?', [code])) code = `${base}-${i++}`;
          b.code = code;
        }
        if (name === 'sorties' && !b.code && b.date) b.code = codeSortie({ formule: b.formule, date_sortie: b.date, encadrement: 'Discovermores' }) || `SORTIE-${b.date}`;
        const keys = cols.filter((c) => b[c] !== undefined);
        if (!keys.length) return res.status(400).json({ error: 'Aucune donnée' });
        try {
          const r = db.run(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => valeur(k, b[k])));
          res.status(201).json(db.get(`SELECT * FROM ${name} WHERE id=?`, [r.id]));
        } catch (e) { res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'Ce code existe déjà' : e.message }); }
      });
    }
    if (cols.length) {
      admin.put(`/${name}/:id`, (req, res) => {
        const b = req.body || {};
        if (name === 'reservations' && b.status && !RES_STATUS.includes(b.status)) return res.status(400).json({ error: 'Statut invalide' });
        if ((name === 'formules' || name === 'produits') && b.prix !== undefined && !(num(b.prix) > 0)) return res.status(400).json({ error: 'Le prix doit être supérieur à 0' });
        if (name === 'produits' || name === 'formules') { delete b.code; delete b.sigle; } // identifiants (page, codes de sortie) : ne changent jamais
        const keys = cols.filter((c) => b[c] !== undefined);
        if (!keys.length) return res.status(400).json({ error: 'Aucune donnée' });
        try {
          db.run(`UPDATE ${name} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...keys.map((k) => valeur(k, b[k])), req.params.id]);
          let ligne = db.get(`SELECT * FROM ${name} WHERE id=?`, [req.params.id]);
          // Commande du panier annulée : ses articles reviennent en stock (une seule fois) ; réactivée : ils en ressortent
          if (name === 'commandes' && ligne.lignes && b.statut !== undefined) {
            const annulee = ligne.statut === 'annulée';
            if (annulee !== !!ligne.stock_rendu) {
              const signe = annulee ? 1 : -1;
              for (const l of JSON.parse(ligne.lignes)) db.run('UPDATE produits SET stock=stock+? WHERE code=? AND stock IS NOT NULL', [signe * l.quantite, l.code]);
              db.run('UPDATE commandes SET stock_rendu=? WHERE id=?', [annulee ? 1 : 0, ligne.id]);
            }
          }
          if (name === 'reservations' && ['formule', 'adultes', 'enfants', 'contribution', 'date_souhaitee'].some((k) => b[k] !== undefined)) {
            // Formule, personnes ou contribution changées : montant recalculé (sauf montant saisi à la main) ; date ou formule : sortie suivie
            const { total, contribution_eur } = calculer(formuleDe(ligne.formule), (ligne.adultes || 0) + (ligne.enfants || 0), ligne.contribution);
            const maj = { contribution_eur };
            if (b.montant_total === undefined || b.montant_total === null || b.montant_total === '') maj.montant_total = total;
            if (b.id_sortie === undefined && (b.formule !== undefined || b.date_souhaitee !== undefined)) maj.id_sortie = codeSortie({ formule: ligne.formule, date_sortie: ligne.date_souhaitee, encadrement: 'Discovermores' }) || null;
            const cles = Object.keys(maj);
            db.run(`UPDATE reservations SET ${cles.map((k) => k + '=?').join(',')} WHERE id=?`, [...cles.map((k) => maj[k]), ligne.id]);
            ligne = { ...ligne, ...maj };
            const st = statutPaiement(ligne);
            if (st !== ligne.status && b.status === undefined) { db.run('UPDATE reservations SET status=? WHERE id=?', [st, ligne.id]); ligne = { ...ligne, status: st }; }
          }
          if (name === 'reservations' && (b.acompte !== undefined || b.solde_paye !== undefined || b.montant_total !== undefined) && b.status === undefined) {
            const st = statutPaiement(ligne);
            if (st !== ligne.status) { db.run('UPDATE reservations SET status=? WHERE id=?', [st, ligne.id]); ligne = { ...ligne, status: st }; }
          }
          res.json(ligne);
        } catch (e) { res.status(400).json({ error: e.message }); }
      });
    }
    if (!LECTURE_SEULE.has(name)) {
      admin.delete(`/${name}/:id`, (req, res) => {
        if (name === 'formules' && db.get('SELECT origine FROM formules WHERE id=?', [req.params.id])?.origine) {
          return res.status(400).json({ error: "Formule d'origine du site : elle ne peut pas être supprimée, mais vous pouvez la désactiver (case « Active »)." });
        }
        if (name === 'produits' && db.get('SELECT origine FROM produits WHERE id=?', [req.params.id])?.origine) {
          return res.status(400).json({ error: "Produit d'origine du site : il ne peut pas être supprimé, mais vous pouvez le marquer indisponible." });
        }
        if (name === 'photos') {
          const p = db.get('SELECT fichier FROM photos WHERE id=?', [req.params.id]);
          if (p) fs.rmSync(path.join(UPLOADS, path.basename(p.fichier)), { force: true });
        }
        db.run(`DELETE FROM ${name} WHERE id=?`, [req.params.id]);
        res.json({ ok: true });
      });
    }
  }

  app.use('/api/admin', admin);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable' }));

  // ---------- Anciennes adresses (version WeTransfer, app React) → pages actuelles (301) ----------
  // Les liens partagés et QR codes imprimés de l'ancienne version restent valides.
  const ANCIENNES = {
    'stats': '/observatoire.html', 'checklist-mise-en-ligne': '/',
    'avant-pendant-apres': '/preparer.html', 'preparer-ascension-karthala': '/preparer.html', 'preparer-son-ascension': '/preparer.html',
    'sante-condition-physique': '/preparer.html', 'securite-meteo-go-no-go': '/preparer.html', 'meteo-conditions-terrain': '/preparer.html', 'guides-metiers-karthala': '/preparer.html',
    'bilan-karthala-zero-dechets': '/impact.html', 'impact-engagement-karthala': '/impact.html', 'charte-visiteur-responsable': '/impact.html',
    'contribution-carbone': '/impact.html', 'contribution-environnementale': '/impact.html', 'methode-carbone': '/impact.html', 'rapport-contribution-carbone': '/impact.html',
    'biodiversite-karthala': '/faune-flore.html', 'carte-karthala': '/ascension.html',
    'centre-information-karthala360': '/question.html', 'faq-karthala360': '/question.html',
    'comprendre-volcan-karthala': '/volcan-eruptions.html', 'decouvrir-karthala': '/decouvrir.html', 'education-karthala': '/decouvrir.html', 'ressources-documentation': '/decouvrir.html',
    'histoire-culture-legendes-karthala': '/recits-legendes.html',
    'certificat-ascension': '/boutique.html', 'strategie-photo-karthala360': '/galerie.html',
    'conditions-reservation': '/cgv.html', 'cookies': '/confidentialite.html', 'droit-image': '/confidentialite.html',
    'data-pro': '/observatoire.html', 'espace-data': '/observatoire.html', 'modele-rapport-data-pro': '/observatoire.html',
    'observations-terrain': '/observatoire.html', 'rapport-frequentation-karthala360': '/observatoire.html',
    'formulaire-enregistrement-karthala360': '/enregistrement.html', 'formulaire-retour-experience': '/retour-experience.html',
    'formules-ascension': '/formules.html', 'reservation-guidee': '/reservation.html', 'groupes-entreprises': '/contact.html',
    'partenaires-boutique-contact': '/partenaires.html', 'partenaires-sponsors': '/partenaires.html', 'rapport-sponsor-impact': '/partenaires.html',
    'pourquoi-discovermores': '/',
  };
  // ---------- Adresses sans « .html » ----------
  // /formules.html → /formules ; /index.html → / ; la requête (?…) est conservée
  const propre = (chemin) => chemin.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  const requete = (req) => { const q = req.originalUrl.indexOf('?'); return q >= 0 ? req.originalUrl.slice(q) : ''; };

  app.get(/^\/[a-z0-9-]+(\.html)?\/?$/i, (req, res, next) => {
    const nom = req.path.replace(/^\/|\/$/g, '').replace(/\.html$/i, '').toLowerCase();
    if (!ANCIENNES[nom] || fs.existsSync(path.join(PUBLIC, nom + '.html')) || fs.existsSync(path.join(SITE, nom + '.html')) || req.path.endsWith('/')) return next();
    res.redirect(301, propre(ANCIENNES[nom]) + requete(req));
  });

  // ---------- Adresse publique du site ----------
  // Réglée dans le back office (Liens du site) ; à défaut, l'adresse par laquelle le visiteur arrive
  const baseDe = (req) => (settings().site_url || '').trim().replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;

  app.get('/index.html', (req, res) => res.redirect(301, '/' + requete(req)));
  // Page HTML envoyée avec sa liste exacte de scripts autorisés (CSP)
  function envoyerPage(req, res, html, statut = 200) {
    res.status(statut).type('html').setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', securite.cspPage(html, req.secure));
    res.send(html);
  }

  // Page d'aperçu « en avant-première » (ancienne page d'accueil) : gardée sur /apercu
  app.get('/apercu', (req, res) => envoyerPage(req, res, rendu.apercu(baseDe(req))));

  // Moteurs de recherche : robots.txt et plan du site à la racine
  app.get('/robots.txt', (req, res) => res.type('text/plain').setHeader('Cache-Control', 'no-cache').send(rendu.robots(baseDe(req))));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').setHeader('Cache-Control', 'no-cache').send(rendu.planDuSite(baseDe(req))));

  // ---------- Pages du site : réglages du back office appliqués à l'envoi ----------
  // Script principal : son contenu ne dépend pas des réglages → gardé 1 h puis revalidé (ETag)
  // Anciennes adresses en /site/… (liens partagés, QR codes imprimés) → même page à la racine
  app.get(/^\/site(\/.*)?$/, (req, res) => res.redirect(301, (req.params[0] || '/') + requete(req)));
  app.get('/assets/js/main.js', (req, res) => res.type('application/javascript').setHeader('Cache-Control', 'public, max-age=3600').send(rendu.script('assets/js/main.js')));
  app.get(/^\/(.*)$/, async (req, res, next) => {
    let rel = decodeURIComponent(req.params[0] || '');
    // Ancienne forme avec .html → adresse propre (liens partagés, favoris, moteurs de recherche)
    if (/\.html$/i.test(rel) && fs.existsSync(path.join(SITE, rel))) return res.redirect(301, '/' + propre(rel) + requete(req));
    // « /formules/ » → « /formules »
    if (/[^/]\/$/.test(rel) && !fs.existsSync(path.join(SITE, rel)) && fs.existsSync(path.join(SITE, rel.slice(0, -1) + '.html'))) {
      return res.redirect(301, '/' + rel.slice(0, -1) + requete(req));
    }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    if (!/\.(html|json)$/.test(rel) && fs.existsSync(path.join(SITE, rel + '.html'))) rel += '.html';
    const fichier = path.normalize(path.join(SITE, rel));
    if (!fichier.startsWith(SITE + path.sep) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) return next();
    rel = path.relative(SITE, fichier).split(path.sep).join('/');
    const base = baseDe(req);
    if (rel === 'qr-codes.html') await rendu.preparerQR(base);
    if (rel.endsWith('.html')) return envoyerPage(req, res, rendu.page(rel, base));
    if (/^assets\/data\/connaissance-(fr|en)\.json$/.test(rel)) return res.type('json').setHeader('Cache-Control', 'no-cache').send(rendu.connaissance(rel, base));
    next();
  });

  // ---------- Fichiers statiques ----------
  // Fichiers envoyés : affichables comme images, jamais exécutables (un SVG ouvert seul reste inerte)
  app.use('/uploads', express.static(UPLOADS, { maxAge: '7d', setHeaders: (res) => securite.enTetesFichierEnvoye(res) }));
  // Back office sur une adresse secrète (ADMIN_CHEMIN dans .env) : /admin n'existe pas, il répond « page introuvable ».
  // Sans réglage, une adresse aléatoire est créée une fois, gardée dans la base et affichée dans le journal du serveur.
  let cheminAdmin = String(process.env.ADMIN_CHEMIN || settings().admin_chemin || '').trim().replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9-]{16,}$/i.test(cheminAdmin)) {
    cheminAdmin = 'gestion-' + crypto.randomBytes(12).toString('hex');
    db.run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['admin_chemin', cheminAdmin]);
  }
  const ADMIN = '/' + cheminAdmin;
  app.get(ADMIN, (req, res, next) => (req.path.endsWith('/') ? next() : res.redirect(301, ADMIN + '/')));
  app.use(ADMIN, (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); }, express.static(path.join(PUBLIC, 'admin')));
  // Mise en cache : pages toujours à jour ; styles/scripts versionnés (?v=…) gardés 1 an (l'adresse change à chaque mise à jour) ;
  // images et polices 30 jours ; le reste 1 heure. Les navigateurs revalident ensuite à moindre coût (ETag → 304).
  app.use((req, res, next) => { if (/[?&]v=/.test(req.originalUrl)) res.locals.versionne = true; next(); });
  const cacheStatique = {
    extensions: ['html'],
    setHeaders: (res, p) => {
      if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (res.locals.versionne && /\.(css|js)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (/\.(webp|jpe?g|png|svg|gif|ico|woff2?)$/i.test(p)) res.setHeader('Cache-Control', 'public, max-age=2592000');
      else res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  };
  app.use(express.static(SITE, cacheStatique));
  // 404 : liens relatifs de la page rendus valides quel que soit le dossier demandé (ex. /en/xyz)
  app.use((req, res) => envoyerPage(req, res, rendu.page('404.html', baseDe(req)).replace(/<head>/i, '<head><base href="/">'), 404));

  // Sessions expirées : effacées au démarrage puis chaque heure
  const menageSessions = () => db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  menageSessions();
  setInterval(menageSessions, 3600e3).unref();

  // Sauvegarde automatique de la base : une copie par jour dans data/sauvegardes, les 14 dernières sont gardées
  const SAUVEGARDES = path.join(db.dossier, 'sauvegardes');
  function sauvegarder() {
    try {
      fs.mkdirSync(SAUVEGARDES, { recursive: true });
      const fichier = path.join(SAUVEGARDES, `karthala360-${new Date().toISOString().slice(0, 10)}.db`);
      fs.writeFileSync(fichier, db.exporter());
      const anciennes = fs.readdirSync(SAUVEGARDES).filter((f) => /^karthala360-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -14);
      for (const f of anciennes) fs.rmSync(path.join(SAUVEGARDES, f), { force: true });
    } catch (e) { console.error('Sauvegarde automatique impossible :', e.message); }
  }
  setTimeout(sauvegarder, 60e3).unref();
  setInterval(sauvegarder, 24 * 3600e3).unref();

  app.listen(PORT, () => console.log(`Karthala360 sur http://localhost:${PORT}  (back office : http://localhost:${PORT}${ADMIN}/)`));
});
