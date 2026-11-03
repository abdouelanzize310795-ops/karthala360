// Karthala360 — back office
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  const eur = (n) => (n == null || n === '' ? '—' : fmt(n) + ' €');
  const STATUS = ['nouvelle', 'confirmée', 'acompte payé', 'payée', 'terminée', 'annulée'];
  const stCls = (s) => 'st st-' + String(s).split(' ')[0];
  const wa = (tel) => `https://wa.me/${String(tel || '').replace(/\D/g, '')}`;
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  let me = null;

  async function api(url, opts = {}) {
    const r = await fetch('/api' + url, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/auth/login' && url !== '/auth/me') { me = null; renderLogin(); throw new Error('Session expirée'); }
    if (r.status === 403 && j.code === 'mot_de_passe_a_changer' && me) { me.doit_changer = 1; ecranMotDePasse(); throw new Error(j.error); }
    if (!r.ok) throw new Error(j.error || 'Erreur');
    return j;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
  const lireFichier = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
  async function envoyerImage(fichier) {
    if (fichier.size > 8 * 1024 * 1024) throw new Error('Image trop lourde (8 Mo maximum)');
    return api('/admin/upload', { method: 'POST', body: { nom: fichier.name, data: await lireFichier(fichier) } });
  }

  // ---------- Contenus gérés : [champ, libellé, type] ----------
  const FORMULES_NOMS = ['Zéro Effort', 'Soft Trek', 'Bivouac au volcan', 'Karthala Sportif', 'Quad & Buggy'];
  const CRUD = {
    evenements: { title: 'Agenda / activités', cols: ['debut', 'titre_fr', 'a_la_une', 'publie'], fields: [
      ['titre_fr', 'Titre FR'], ['titre_en', 'Titre EN'], ['debut', 'Début', 'date'], ['fin', 'Fin', 'date'], ['heure_fr', 'Heure FR (ex. 7 h 00)'], ['heure_en', 'Heure EN (ex. 7:00 am)'],
      ['lieu_fr', 'Lieu FR'], ['lieu_en', 'Lieu EN'], ['description_fr', 'Description FR', 'textarea'], ['description_en', 'Description EN', 'textarea'],
      ['type', 'Type', ['discovermores', 'partenaire']], ['organisateur', 'Organisateur'], ['lien', 'Lien d\'inscription (sinon WhatsApp)'], ['image', 'Image (facultatif)', 'image'],
      ['a_la_une', 'À la une (carte flottante de l\'accueil)', 'bool'], ['publie', 'Publié', 'bool']] },
    avis: { title: 'Avis clients', cols: ['auteur', 'formule', 'note', 'texte', 'publie'], fields: [
      ['auteur', 'Auteur'], ['pays', 'Pays'], ['formule', 'Formule', ['zero-effort', 'soft-trek', 'bivouac', 'sportif', 'quad-buggy']], ['note', 'Note (1–5)', 'number'],
      ['texte', 'Texte', 'textarea'], ['mois', 'Mois (AAAA-MM)'], ['publie', 'Publié sur le site', 'bool']] },
    savoirs: { title: 'K269 — réponses de l\'équipe', cols: ['langue', 'titre', 'publie'], fields: [
      ['langue', 'Langue', ['fr', 'en']], ['titre', 'Question / titre'], ['texte', 'Réponse (mettez aussi les mots que les visiteurs utilisent)', 'textarea'],
      ['lien', 'Page liée (ex. formules#bivouac)'], ['publie', 'Utilisée par K269', 'bool']] },
    sorties: { title: 'Sorties', cols: ['date', 'code', 'formule', 'guide', 'statut', 'decision'], fields: [
      ['date', 'Date', 'date'], ['formule', 'Formule', FORMULES_NOMS], ['code', 'Code (laisser vide : calculé, ex. SOFT-2026-10-12)'], ['guide', 'Guide'],
      ['statut', 'Statut', ['planifiée', 'réalisée', 'annulée']]] },
    produits: { title: 'Boutique — produits', cols: ['image', 'nom', 'prix', 'disponible', 'stock'], fields: [
      ['nom', 'Nom FR'], ['nom_en', 'Nom EN'], ['description', 'Description FR', 'textarea'], ['description_en', 'Description EN', 'textarea'],
      ['image', 'Photo', 'image'], ['prix', 'Prix (€)', 'number'], ['tailles', 'Tailles proposées, séparées par des virgules (facultatif, ex. S, M, L, XL)'],
      ['badge', 'Badge sur la photo FR (facultatif, ex. Nouveau, Précommande)'], ['badge_en', 'Badge EN (ex. New, Pre-order)'], ['stock', 'Stock (facultatif)', 'number'],
      ['ordre', 'Ordre d\'affichage', 'number'], ['disponible', 'Disponible à la commande', 'bool']] },
    commandes: { title: 'Boutique — commandes', cols: ['created_at', 'ref', 'client', 'produit', 'montant', 'statut', 'confirmation_info'], fields: [
      ['client', 'Client'], ['telephone', 'Téléphone'], ['email', 'E-mail'], ['produit', 'Articles'], ['mode_remise', "Remise (retrait, jour de l'ascension, envoi)"], ['detail', 'Message du client / détail'], ['quantite', "Nombre d'articles", 'number'],
      ['montant', 'Montant (€)', 'number'], ['statut', 'Statut', ['à confirmer', 'confirmée', 'payée', 'remise', 'annulée']], ['note', 'Note', 'textarea']] },
    partenaires: { title: 'Partenaires', cols: ['nom', 'niveau', 'ordre', 'publie'], fields: [
      ['nom', 'Nom'], ['niveau', 'Rubrique', [['soutien', 'Avec le soutien de (pied de page, toutes les pages)'], ['financeur', 'Page Partenaires : Ils ont rendu la plateforme possible'], ['confiance', 'Page Partenaires : Ils nous font confiance']]], ['logo', 'Logo', 'image'],
      ['lien', 'Site web (https://…)'], ['description', 'Description FR'], ['description_en', 'Description EN'], ['ordre', 'Ordre', 'number'], ['publie', 'Affiché sur le site', 'bool']] },
    photos: { title: 'Galerie — photos ajoutées', cols: ['fichier', 'legende', 'ordre', 'publie'], fields: [
      ['fichier', 'Photo', 'image'], ['legende', 'Légende FR'], ['legende_en', 'Légende EN'], ['ordre', 'Ordre', 'number'], ['publie', 'Affichée sur le site', 'bool']] },
  };
  const FORMS = { retour: 'Retours d\'expérience', contact: 'Messages de contact', enregistrement: 'Fiches participants', groupe: 'Groupes / classes' };

  const NAV = [
    ['—', 'Pilotage'], ['dashboard', 'Tableau de bord'], ['rapports', 'Rapports'],
    ['—', 'Activité'], ['reservations', 'Réservations'], ['sorties', 'Sorties & fiches guide'], ['commandes', 'Commandes boutique'],
    ['—', 'Reçu du site'], ...Object.entries(FORMS).map(([k, l]) => ['f-' + k, l]), ['questions', 'Questions à K269'],
    ['—', 'Contenus du site'], ['tarifs', 'Tarifs des formules'], ['produits', 'Boutique — produits'], ['evenements'], ['avis'], ['savoirs'], ['partenaires'], ['photos', 'Galerie'],
    ['—', 'Réglages'], ['liens', 'Liens du site'], ['settings', 'Paramètres & paiements'], ['users', 'Utilisateurs'], ['journal', 'Journal d\'activité'],
  ];

  function renderLogin() {
    $('#root').innerHTML = `<div class="login"><form id="lf"><h2>KARTHALA<b style="color:var(--ok)">360</b><br><small class="mu">Back office Discovermores</small></h2>
      <input name="email" type="email" placeholder="E-mail" required autocomplete="username">
      <input name="password" type="password" placeholder="Mot de passe" required autocomplete="current-password">
      <p class="err" id="le"></p><button class="b-p">Se connecter</button><a class="mu" href="/">← Retour au site</a></form></div>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      try { me = await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); location.hash = '#dashboard'; shell(); }
      catch (err) { $('#le').textContent = err.message; }
    };
  }

  // Mot de passe initial ou par défaut : il faut le changer avant d'accéder au back office
  function ecranMotDePasse() {
    $('#root').innerHTML = `<div class="login"><form id="mf"><h2>Choisissez votre mot de passe</h2>
      <p class="mu" style="margin:0">Pour la sécurité du site, le mot de passe de départ doit être remplacé. 10 caractères minimum, avec au moins une lettre et un chiffre.</p>
      <input name="current" type="password" placeholder="Mot de passe actuel" required autocomplete="current-password">
      <input name="next" type="password" placeholder="Nouveau mot de passe" required minlength="10" autocomplete="new-password">
      <input name="confirmation" type="password" placeholder="Nouveau mot de passe (encore)" required minlength="10" autocomplete="new-password">
      <p class="err" id="me2"></p><button class="b-p">Enregistrer et continuer</button><a class="mu" href="#" id="mlo">Se déconnecter</a></form></div>`;
    $('#mf').onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (d.next !== d.confirmation) { $('#me2').textContent = 'Les deux nouveaux mots de passe sont différents'; return; }
      try {
        await api('/admin/me/password', { method: 'PUT', body: { current: d.current, next: d.next } });
        me = await api('/auth/me'); toast('Mot de passe enregistré'); location.hash = '#dashboard'; shell();
      } catch (err) { $('#me2').textContent = err.message; }
    };
    $('#mlo').onclick = async (e) => { e.preventDefault(); await api('/auth/logout', { method: 'POST' }); me = null; renderLogin(); };
  }

  // ---------- Menu : largeur réglable à la souris, réduction ; le choix est mémorisé sur cet appareil ----------
  const MENU_MIN = 170, MENU_MAX = 420, MENU_DEFAUT = 230;
  const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  function menuReglable() {
    const layout = $('.layout'), poignee = $('#poignee');
    const largeur = (px) => { const l = Math.min(MENU_MAX, Math.max(MENU_MIN, Math.round(px))); layout.style.setProperty('--menu', l + 'px'); return l; };
    largeur(Number(lire('k360-menu-largeur')) || MENU_DEFAUT);
    layout.classList.toggle('menu-ferme', lire('k360-menu-ferme') === '1');
    $('#red').onclick = () => { layout.classList.add('menu-ferme'); ecrire('k360-menu-ferme', '1'); };
    $('#rouv').onclick = () => { layout.classList.remove('menu-ferme'); ecrire('k360-menu-ferme', '0'); };
    poignee.ondblclick = () => ecrire('k360-menu-largeur', largeur(MENU_DEFAUT));
    poignee.onpointerdown = (e) => {
      e.preventDefault();
      poignee.setPointerCapture(e.pointerId);
      poignee.classList.add('active'); document.body.classList.add('redim');
      const gauche = layout.getBoundingClientRect().left;
      poignee.onpointermove = (ev) => largeur(ev.clientX - gauche);
      poignee.onpointerup = (ev) => {
        poignee.onpointermove = poignee.onpointerup = null;
        poignee.classList.remove('active'); document.body.classList.remove('redim');
        ecrire('k360-menu-largeur', largeur(ev.clientX - gauche));
      };
    };
  }

  function cartesMobiles(racine) {
    for (const t of racine.querySelectorAll('table')) {
      const lignes = [...t.rows];
      if (lignes.length < 2 || [...lignes[0].cells].some((c) => c.tagName !== 'TH')) continue; // tableaux « titre : valeur » laissés tels quels
      const titres = [...lignes[0].cells].map((c) => c.textContent.trim());
      t.classList.add('cartes');
      for (const tr of lignes.slice(1)) [...tr.cells].forEach((c, i) => { if (!c.dataset.label && titres[i]) c.dataset.label = titres[i]; });
    }
  }

  async function shell() {
    if (me?.doit_changer) return ecranMotDePasse();
    const page = location.hash.slice(1).split('/')[0] || 'dashboard';
    const arg = decodeURIComponent(location.hash.slice(1).split('/')[1] || '');
    let s;
    try { s = await api('/admin/stats'); } catch { return; }
    const badge = { reservations: s.reservations_new, avis: s.avis_a_valider, questions: s.questions_sans_reponse, sorties: s.sorties_sans_fiche, commandes: s.commandes_new };
    $('#root').innerHTML = `<div class="layout"><aside id="side"><div class="poignee" id="poignee" title="Glisser pour élargir ou rétrécir le menu (double-clic : taille normale)"></div>
      <div class="menu-tete"><h1>KARTHALA<b>360</b></h1><button class="reduire" id="red" title="Réduire le menu" aria-label="Réduire le menu">«</button></div>
      ${NAV.filter(([k]) => (k !== 'users' && k !== 'journal') || me.role === 'admin').map(([k, l]) => k === '—' ? `<div class="nav-titre">${l}</div>` : `<a href="#${k}" class="${k === page ? 'on' : ''}">${l || CRUD[k].title}${badge[k] ? `<span class="pill">${badge[k]}</span>` : ''}</a>`).join('')}
      <div class="who">${esc(me.name)} (${me.role})<br><a href="#" id="pw" style="padding:4px 0">Changer mot de passe</a><a href="#" id="lo" style="padding:4px 0">Déconnexion</a><a href="/" target="_blank" style="padding:4px 0">Voir le site ↗</a></div></aside>
      <main>${s.alerte && !['vert', ''].includes(s.alerte) ? `<div class="bandeau-alerte">⚠️ Alerte volcanique <b>${esc(s.alerte)}</b> affichée sur tout le site — <a href="#settings">modifier</a></div>` : ''}<button class="menu-btn" id="mb">☰ Menu</button><button class="rouvrir" id="rouv" title="Afficher le menu">☰ Menu</button><div id="view"></div></main></div>`;
    $('#mb').onclick = () => $('#side').classList.toggle('open');
    menuReglable();
    $('#lo').onclick = async (e) => { e.preventDefault(); await api('/auth/logout', { method: 'POST' }); me = null; renderLogin(); };
    $('#pw').onclick = (e) => { e.preventDefault(); passwordDialog(); };
    const v = $('#view');
    // Sur téléphone, chaque ligne de tableau devient une carte : chaque cellule reçoit le titre de sa colonne
    new MutationObserver(() => cartesMobiles(v)).observe(v, { childList: true, subtree: true });
    try {
      if (page === 'dashboard') dashboard(v, s);
      else if (page === 'rapports') await rapports(v);
      else if (page === 'reservations') await reservations(v);
      else if (page === 'sorties' && arg) await ficheSortie(v, arg);
      else if (page.startsWith('f-')) await soumissions(v, page.slice(2));
      else if (page === 'questions') await questions(v);
      else if (page === 'tarifs') await tarifs(v);
      else if (page === 'liens') await liens(v);
      else if (page === 'settings') await settings(v);
      else if (page === 'users') await users(v);
      else if (page === 'journal') await journal(v);
      else if (CRUD[page]) await crud(v, page);
    } catch (e) { v.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  // ---------- Tableau de bord ----------
  function dashboard(v, s) {
    const max = Math.max(1, ...s.par_formule.map((b) => b.n));
    const pct = Math.min(100, Math.round((s.fonds_action / (s.seuil_action || 500)) * 100));
    v.innerHTML = `<h2>Tableau de bord</h2>
      ${s.sorties_sans_fiche ? `<div class="panel avert">📝 ${s.sorties_sans_fiche} sortie(s) passée(s) sans fiche du guide : le compteur public et « Aujourd'hui au Karthala » attendent ces informations. <a href="#sorties">Compléter</a></div>` : ''}
      <div class="kpis">
      <div class="kpi"><b>${s.reservations_new}</b><small>demandes à traiter</small></div>
      <div class="kpi"><b>${s.a_venir}</b><small>randonneurs à venir (confirmés)</small></div>
      <div class="kpi"><b>${eur(s.encaisse)}</b><small>encaissé (acomptes + soldes)</small></div>
      <div class="kpi"><b>${eur(s.a_encaisser)}</b><small>reste à encaisser</small></div>
      <div class="kpi"><b>${s.public.randonneurs}</b><small>randonneurs enregistrés</small></div>
      <div class="kpi"><b>${s.public.dechets_kg} kg</b><small>déchets redescendus</small></div>
      <div class="kpi"><b>${s.soumissions_new}</b><small>formulaires non traités</small></div>
      <div class="kpi"><b>${s.commandes_new}</b><small>commandes boutique à confirmer</small></div></div>
      <div class="panel"><h3 style="margin-top:0">Fonds d'action environnementale</h3><p class="mu" style="margin:0 0 8px">${eur(s.fonds_action)} sur ${eur(s.seuil_action)} : une action (nettoyage, plantation) est organisée à chaque palier atteint.</p>
        <div class="jauge"><i style="width:${pct}%"></i></div></div>
      <div class="panel"><h3 style="margin-top:0">Prochaines sorties</h3><table><tr><th>Date</th><th>Code</th><th>Formule</th><th>Guide</th><th>Inscrits</th><th></th></tr>
      ${s.prochaines_sorties.map((x) => `<tr><td>${esc(x.date)}</td><td><b>${esc(x.code)}</b></td><td>${esc(x.formule)}</td><td>${esc(x.guide || '—')}</td><td>${x.participants}</td><td><a class="b b-sm" href="#sorties/${x.id}">Ouvrir</a></td></tr>`).join('') || '<tr><td colspan="6" class="mu">Aucune sortie prévue</td></tr>'}</table></div>
      <div class="panel"><h3 style="margin-top:0">Réservations par formule</h3><div class="bars">${s.par_formule.map((b) => `<div><span>${esc(b.label)}</span><i style="width:${(b.n / max) * 100}%"></i><b>${b.n}</b></div>`).join('') || '<p class="mu">Aucune réservation pour l\'instant.</p>'}</div></div>
      <div class="panel"><h3 style="margin-top:0">Dernières demandes</h3><table><tr><th>Réf</th><th>Client</th><th>Formule</th><th>Date</th><th>Pers.</th><th>Statut</th></tr>
      ${s.recentes.map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.nom)}</td><td>${esc(r.formule)}</td><td>${esc(r.date_souhaitee)}</td><td>${r.adultes + r.enfants}</td><td><span class="${stCls(r.status)}">${esc(r.status)}</span></td></tr>`).join('') || '<tr><td colspan="6" class="mu">Aucune réservation</td></tr>'}</table></div>`;
  }

  // ---------- Rapports ----------
  async function rapports(v, annee) {
    const r = await api('/admin/rapports' + (annee ? '?annee=' + annee : ''));
    const an = +r.annee;
    const tot = (l, k) => l.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    v.innerHTML = `<h2>Rapports ${r.annee}</h2><div class="bar"><button id="ap">← ${an - 1}</button><button id="as">${an + 1} →</button><span class="sp"></span>
      <a class="b" href="/api/admin/export/reservations.csv">Réservations CSV</a> <a class="b" href="/api/admin/export/sorties.csv">Sorties CSV</a> <a class="b" href="/api/admin/export/enregistrement.csv">Participants CSV</a></div>
      <div class="kpis"><div class="kpi"><b>${tot(r.par_mois, 'reservations')}</b><small>réservations</small></div><div class="kpi"><b>${tot(r.par_mois, 'personnes')}</b><small>personnes réservées</small></div>
      <div class="kpi"><b>${eur(tot(r.par_mois, 'montant'))}</b><small>montant réservé</small></div><div class="kpi"><b>${eur(tot(r.par_mois, 'encaisse'))}</b><small>encaissé</small></div>
      <div class="kpi"><b>${tot(r.sorties, 'sorties')}</b><small>sorties</small></div><div class="kpi"><b>${tot(r.sorties, 'no_go')}</b><small>sorties en No Go</small></div></div>
      <div class="panel"><h3 style="margin-top:0">Par mois (date de sortie)</h3><table><tr><th>Mois</th><th>Réservations</th><th>Personnes</th><th>Montant</th><th>Encaissé</th></tr>
        ${r.par_mois.map((m) => `<tr><td>${m.mois}</td><td>${m.reservations}</td><td>${m.personnes}</td><td>${eur(m.montant)}</td><td>${eur(m.encaisse)}</td></tr>`).join('') || '<tr><td colspan="5" class="mu">Aucune donnée</td></tr>'}</table></div>
      <div class="panel"><h3 style="margin-top:0">Par formule</h3><table><tr><th>Formule</th><th>Réservations</th><th>Personnes</th><th>Montant</th></tr>
        ${r.par_formule.map((m) => `<tr><td>${esc(m.formule)}</td><td>${m.reservations}</td><td>${m.personnes}</td><td>${eur(m.montant)}</td></tr>`).join('') || '<tr><td colspan="4" class="mu">Aucune donnée</td></tr>'}</table></div>
      <div class="panel"><h3 style="margin-top:0">Sorties et terrain</h3><table><tr><th>Mois</th><th>Sorties</th><th>No Go</th><th>Déchets (kg)</th></tr>
        ${r.sorties.map((m) => `<tr><td>${m.mois}</td><td>${m.sorties}</td><td>${m.no_go}</td><td>${fmt(m.dechets_kg)}</td></tr>`).join('') || '<tr><td colspan="4" class="mu">Aucune donnée</td></tr>'}</table></div>
      <div class="panel"><h3 style="margin-top:0">Randonneurs enregistrés par pays</h3><table><tr><th>Pays</th><th>Randonneurs</th></tr>
        ${r.participants_par_pays.map((m) => `<tr><td>${esc(m.pays || 'Non renseigné')}</td><td>${m.n}</td></tr>`).join('') || '<tr><td colspan="2" class="mu">Aucune donnée</td></tr>'}</table></div>`;
    $('#ap').onclick = () => rapports(v, an - 1);
    $('#as').onclick = () => rapports(v, an + 1);
  }

  // ---------- Réservations et paiements ----------
  async function reservations(v, q = {}) {
    const qs = new URLSearchParams(Object.entries(q).filter(([, x]) => x)).toString();
    const rows = await api('/admin/reservations' + (qs ? '?' + qs : ''));
    v.innerHTML = `<h2>Réservations</h2><div class="bar">
      <input id="rq" placeholder="Nom, téléphone, réf…" style="max-width:220px" value="${esc(q.q || '')}">
      <select id="rs" style="max-width:160px"><option value="">Tous statuts</option>${STATUS.map((s) => `<option ${q.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label style="display:flex;gap:6px;align-items:center;font-size:.9rem"><input type="checkbox" id="ri" style="width:auto" ${q.paiement ? 'checked' : ''}> Paiement incomplet</label>
      <span class="sp"></span><button class="b-p" id="ajresa">+ Ajouter une réservation</button> <a class="b" href="/api/admin/pdf/reservations${q.status ? '?status=' + encodeURIComponent(q.status) : ''}" target="_blank" rel="noopener">📄 Liste PDF</a> <a class="b" href="/api/admin/export/reservations.csv">Export CSV</a></div>
      <div class="panel"><table><tr><th>Réf</th><th>Client</th><th>Formule · sortie</th><th>Date</th><th>Pers.</th><th>Montant</th><th>Payé</th><th>Statut</th><th></th></tr>
      ${rows.map((r) => {
        const du = r.montant_total ?? r.estimation, recu = (r.acompte || 0) + (r.solde_paye || 0);
        return `<tr><td><b>${esc(r.ref)}</b>${r.groupe ? `<div><button class="b b-sm" data-groupe="${esc(r.groupe)}" title="Réservations envoyées ensemble depuis le panier du site">🧺 Panier ${esc(r.groupe)}</button></div>` : ''}<div class="mu">${esc(r.created_at)} · ${esc(r.langue)}</div>${r.bon_envoye_le ? `<div class="mu" style="color:var(--ok)" title="${esc(r.bon_envoi_info)}">📧 bon envoyé le ${esc(r.bon_envoye_le)}</div>` : r.bon_envoi_info ? `<div class="mu" style="color:#a3360f">📧 ${esc(r.bon_envoi_info)}</div>` : ''}</td>
        <td>${esc(r.nom)}<div class="mu">${esc(r.telephone)} ${esc(r.email)} ${esc(r.pays)}</div>${r.message ? `<div class="mu">« ${esc(r.message)} »</div>` : ''}${r.prise_en_charge ? `<div class="mu">🚐 ${esc(r.prise_en_charge)}</div>` : ''}</td>
        <td>${esc(r.formule)}${r.id_sortie ? `<div class="mu">${esc(r.id_sortie)}</div>` : ''}</td><td>${esc(r.date_souhaitee)}</td><td>${r.adultes}${r.enfants ? ` + ${r.enfants} enf.` : ''}</td>
        <td>${eur(du)}${r.contribution_eur ? `<div class="mu">🌱 ${eur(r.contribution_eur)}</div>` : ''}</td>
        <td>${recu ? eur(recu) : '—'}${du && recu < du && recu > 0 ? `<div class="mu">reste ${eur(du - recu)}</div>` : ''}${r.mode_paiement ? `<div class="mu">${esc(r.mode_paiement)}</div>` : ''}</td>
        <td><select data-id="${r.id}" class="chs" style="min-width:130px">${STATUS.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>${r.admin_note ? `<div class="mu">📝 ${esc(r.admin_note)}</div>` : ''}</td>
        <td style="white-space:nowrap"><button class="b-sm" data-modresa="${r.id}">✏️ Modifier</button> <button class="b-sm" data-envbon="${r.id}" ${r.email ? '' : 'disabled title="Pas d’e-mail client"'}>📧 ${r.bon_envoye_le ? 'Renvoyer' : 'Envoyer'} le bon</button> <button class="b-sm" data-pay="${r.id}">💶 Paiement</button> <a class="b b-sm" href="/api/admin/pdf/reservation/${r.id}" target="_blank" rel="noopener">📄 PDF</a> <a class="b b-sm" target="_blank" rel="noopener" href="${wa(r.telephone)}">WhatsApp</a> <button class="b-sm" data-note="${r.id}">Note</button> <button class="b-sm b-d" data-del="${r.id}">✕</button></td></tr>`;
      }).join('') || '<tr><td colspan="9" class="mu">Aucun résultat</td></tr>'}</table></div>`;
    const reload = () => reservations(v, { q: $('#rq').value, status: $('#rs').value, paiement: $('#ri').checked ? 'impaye' : '' });
    $('#rq').onchange = reload; $('#rs').onchange = reload; $('#ri').onchange = reload;
    // Un clic sur le dossier « Panier » affiche toutes les réservations envoyées ensemble
    v.querySelectorAll('[data-groupe]').forEach((b) => { b.onclick = () => { $('#rq').value = b.dataset.groupe; reload(); }; });
    v.querySelectorAll('.chs').forEach((s) => s.onchange = async () => { await api(`/admin/reservations/${s.dataset.id}`, { method: 'PUT', body: { status: s.value } }); toast('Statut mis à jour'); });
    v.querySelectorAll('[data-note]').forEach((b) => b.onclick = async () => {
      const r = rows.find((x) => x.id == b.dataset.note);
      const n = prompt('Note interne', r.admin_note || ''); if (n === null) return;
      await api(`/admin/reservations/${r.id}`, { method: 'PUT', body: { admin_note: n } }); reload();
    });
    v.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => paiementDialog(rows.find((x) => x.id == b.dataset.pay), reload));
    v.querySelectorAll('[data-envbon]').forEach((b) => b.onclick = async () => {
      const r = rows.find((x) => x.id == b.dataset.envbon);
      if (r.bon_envoye_le && !confirm(`Le bon a déjà été envoyé le ${r.bon_envoye_le}. Le renvoyer à ${r.email} ?`)) return;
      b.disabled = true; b.textContent = 'Envoi…';
      try { const x = await api(`/admin/reservations/${r.id}/envoyer-bon`, { method: 'POST' }); toast(x.info); } catch (e) { toast(e.message); }
      reload();
    });
    v.querySelectorAll('[data-modresa]').forEach((b) => b.onclick = () => reservationDialog(rows.find((x) => x.id == b.dataset.modresa), reload));
    $('#ajresa').onclick = () => reservationDialog(null, reload);
    v.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Supprimer cette réservation ?')) { await api(`/admin/reservations/${b.dataset.del}`, { method: 'DELETE' }); reload(); } });
  }

  // Ajouter ou modifier une réservation (reçue par téléphone, WhatsApp, sur place) ; le montant est recalculé par le serveur
  async function reservationDialog(r, apres) {
    const formules = (await api('/admin/formules')).filter((f) => f.actif || (r && f.nom === r.formule));
    const d = r || { status: 'confirmée', adultes: 2, enfants: 0, contribution: '', langue: 'fr', date_souhaitee: aujourdhui() };
    const CONTRIB = [['', 'Recommandée (selon la formule)'], ['0', 'Aucune'], ['2', '2 € / pers.'], ['5', '5 € / pers.'], ['10', '10 € / pers.'], ['20', '20 € / pers.']];
    const opt = (liste, v) => liste.map(([val, lib]) => `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(lib)}</option>`).join('');
    dialog(`<h3 style="margin:0">${r ? `Modifier la réservation ${esc(r.ref)}` : 'Nouvelle réservation'}</h3>
      <h4 style="margin:6px 0 0;color:var(--ok);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase">Client</h4>
      <div class="row2"><label>Nom et prénom *<input name="nom" required value="${esc(d.nom)}"></label><label>Téléphone / WhatsApp *<input name="telephone" type="tel" required value="${esc(d.telephone)}"></label></div>
      <div class="row2"><label>E-mail<input name="email" type="email" value="${esc(d.email)}"></label><label>Pays<input name="pays" value="${esc(d.pays)}"></label></div>
      <h4 style="margin:6px 0 0;color:var(--ok);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase">Sortie</h4>
      <div class="row2"><label>Formule *<select name="formule" required>${opt(formules.map((f) => [f.nom, `${f.nom} — ${f.prix} €${f.type === 'forfait' ? ' (1 à 4 pers.)' : ' / pers.'}`]), d.formule)}</select></label>
        <label>Date souhaitée *<input name="date_souhaitee" type="date" required value="${esc(d.date_souhaitee)}"></label></div>
      <div class="row2"><label>Adultes<input name="adultes" type="number" min="0" max="60" value="${esc(d.adultes)}"></label><label>Enfants<input name="enfants" type="number" min="0" max="60" value="${esc(d.enfants)}"></label></div>
      <div class="row2"><label>Contribution environnementale<select name="contribution">${opt(CONTRIB, d.contribution)}</select></label><label>Prise en charge<input name="prise_en_charge" value="${esc(d.prise_en_charge)}" placeholder="Hôtel à Moroni, aéroport…"></label></div>
      <label>Message du client<textarea name="message" rows="2">${esc(d.message)}</textarea></label>
      <h4 style="margin:6px 0 0;color:var(--ok);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase">Suivi</h4>
      <div class="row2"><label>Statut<select name="status">${opt(STATUS.map((x) => [x, x]), d.status)}</select></label><label>Langue du client<select name="langue">${opt([['fr', 'Français'], ['en', 'Anglais']], d.langue)}</select></label></div>
      <label>Montant total (€) — vide : calculé selon la formule<input name="montant_total" type="number" min="0" step="0.01" value="" placeholder="${r && r.montant_total != null ? 'actuel : ' + r.montant_total + ' € (recalculé si formule ou personnes changent)' : 'calculé automatiquement'}"></label>
      <label>Note interne<textarea name="admin_note" rows="2">${esc(d.admin_note)}</textarea></label>
      ${r ? '' : '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="envoyer_bon" checked style="width:auto"> Envoyer le bon de réservation au client par e-mail (si un e-mail est saisi)</label>'}
      <p class="mu" style="margin:0">Les paiements reçus se saisissent avec le bouton 💶 Paiement.</p>`, async (f) => {
      const body = {};
      for (const k of ['nom', 'telephone', 'email', 'pays', 'formule', 'date_souhaitee', 'contribution', 'prise_en_charge', 'message', 'status', 'langue', 'admin_note']) body[k] = f[k].value;
      body.adultes = Number(f.adultes.value) || 0; body.enfants = Number(f.enfants.value) || 0;
      if (body.adultes + body.enfants < 1) throw new Error('Au moins une personne');
      if (f.montant_total.value !== '') body.montant_total = Number(f.montant_total.value);
      if (r) {
        // N'envoyer que ce qui a changé : le serveur recalcule le montant seulement si la formule, les personnes ou la contribution changent
        for (const k of Object.keys(body)) if (k !== 'montant_total' && String(body[k] ?? '') === String(r[k] ?? '')) delete body[k];
        if (!Object.keys(body).length) return;
        await api(`/admin/reservations/${r.id}`, { method: 'PUT', body });
      } else { body.envoyer_bon = f.envoyer_bon.checked; const n = await api('/admin/reservations', { method: 'POST', body }); if (n.bon_envoi_info) toast(n.bon_envoi_info); }
      toast(r ? 'Réservation modifiée' : 'Réservation ajoutée'); apres();
    });
  }

  function paiementDialog(r, apres) {
    const du = r.montant_total ?? r.estimation ?? '';
    const modes = ['', 'Virement', 'PayPal', 'MVola', 'Wakati', 'Espèces'];
    dialog(`<h3 style="margin:0">Paiement — ${esc(r.ref)} · ${esc(r.nom)}</h3>
      <p class="mu" style="margin:0">${esc(r.formule)} · ${r.adultes + r.enfants} pers. · estimation affichée au client : ${eur(r.estimation)}</p>
      <label>Montant total dû (€)<input name="montant_total" type="number" step="0.01" value="${esc(du)}"></label>
      <div class="row2"><label>Acompte reçu (€)<input name="acompte" type="number" step="0.01" value="${esc(r.acompte ?? '')}"></label><label>Date de l'acompte<input name="acompte_date" type="date" value="${esc(r.acompte_date || '')}"></label></div>
      <div class="row2"><label>Solde reçu (€)<input name="solde_paye" type="number" step="0.01" value="${esc(r.solde_paye ?? '')}"></label><label>Date du solde<input name="solde_date" type="date" value="${esc(r.solde_date || '')}"></label></div>
      <label>Mode de paiement<select name="mode_paiement">${modes.map((m) => `<option ${m === (r.mode_paiement || '') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Sortie rattachée (code)<input name="id_sortie" value="${esc(r.id_sortie || '')}"></label>
      <p class="mu" style="margin:0">Le statut passe seul à « acompte payé » puis « payée » selon les montants reçus.</p>`, async (f) => {
      const body = {};
      for (const k of ['montant_total', 'acompte', 'solde_paye']) body[k] = f[k].value === '' ? null : Number(f[k].value);
      for (const k of ['acompte_date', 'solde_date', 'mode_paiement', 'id_sortie']) body[k] = f[k].value;
      if (body.acompte && !body.acompte_date) body.acompte_date = aujourdhui();
      if (body.solde_paye && !body.solde_date) body.solde_date = aujourdhui();
      await api(`/admin/reservations/${r.id}`, { method: 'PUT', body });
      toast('Paiement enregistré'); apres();
    });
  }

  // ---------- Sorties : fiche du guide et participants ----------
  async function ficheSortie(v, id) {
    const { sortie: s, participants, reservations: resas } = await api(`/admin/sorties/${id}/participants`);
    const mineurs = participants.filter((p) => /Moins de 12|12 à 17/.test(p.tranche_age || ''));
    const sante = participants.filter((p) => p.sante === 'Oui');
    v.innerHTML = `<div class="bar"><a class="b" href="#sorties">← Sorties</a><span class="sp"></span><a class="b b-p" href="/api/admin/pdf/sortie/${s.id}" target="_blank" rel="noopener">📄 Dossier PDF</a> <button id="impr">🖨 Imprimer la liste</button> <a class="b" href="/api/admin/export/sortie-${encodeURIComponent(s.code)}.csv">Liste CSV</a></div>
      <h2>${esc(s.code)} <small class="mu">${esc(s.formule || '')} · ${esc(s.date)}</small></h2>
      <form class="panel" id="fg" style="display:grid;gap:12px">
        <h3 style="margin:0">Fiche du guide</h3>
        <p class="mu" style="margin:0">La dernière fiche avec une décision alimente « Aujourd'hui au Karthala » sur l'accueil ; les déchets s'ajoutent au compteur public.</p>
        <div class="row2"><label>Guide<input name="guide" value="${esc(s.guide || '')}"></label><label>Statut<select name="statut">${['planifiée', 'réalisée', 'annulée'].map((x) => `<option ${x === s.statut ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
        <label>Décision de sécurité<select name="decision">${['', 'Go', 'Adapter', 'No Go'].map((x) => `<option ${x === (s.decision || '') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <div class="row2"><label>Météo<input name="meteo" value="${esc(s.meteo || '')}" placeholder="Ensoleillé, vent faible"></label><label>Terrain<input name="terrain" value="${esc(s.terrain || '')}" placeholder="Sec, boue en forêt"></label></div>
        <div class="row2"><label>Heure de départ<input name="heure_depart" type="time" value="${esc(s.heure_depart || '')}"></label><label>Heure de retour<input name="heure_retour" type="time" value="${esc(s.heure_retour || '')}"></label></div>
        <label>Déchets redescendus (kg)<input name="dechets_kg" type="number" step="0.1" min="0" value="${esc(s.dechets_kg ?? '')}"></label>
        <label>Observations (faune, incidents, état du sentier)<textarea name="observations" rows="3">${esc(s.observations || '')}</textarea></label>
        <div><button class="b-p">Enregistrer la fiche</button></div></form>
      <div class="panel" id="liste"><div class="bar" style="margin-bottom:8px"><h3 style="margin:0">Randonneurs enregistrés (${participants.length})</h3><span class="sp"></span><button class="b-sm b-p" id="ajp">+ Ajouter un participant</button></div>
        ${mineurs.length || sante.length ? `<p class="avert" style="padding:8px;border-radius:8px">${mineurs.length ? `👶 ${mineurs.length} mineur(s). ` : ''}${sante.length ? `⚕️ ${sante.length} personne(s) ont signalé une information de santé.` : ''}</p>` : ''}
        <table><tr><th>Nom</th><th>Âge</th><th>Nationalité</th><th>Téléphone</th><th>Urgence</th><th>Santé</th><th>Photo</th></tr>
        ${participants.map((p) => `<tr><td>${esc(p.nom)}${p.responsable_mineur ? `<div class="mu">resp. ${esc(p.responsable_mineur)}</div>` : ''}</td><td>${esc(p.tranche_age)}</td><td>${esc(p.nationalite || p.pays)}</td><td>${esc(p.telephone)}</td>
          <td>${esc(p.urgence_nom)} ${esc(p.urgence_tel)}</td><td>${p.sante === 'Oui' ? '⚕️ ' + esc(p.sante_detail) : '—'}</td><td>${esc(p.accord_photo)}</td></tr>`).join('') || '<tr><td colspan="7" class="mu">Personne ne s\'est encore enregistré avec le QR code pour cette sortie.</td></tr>'}</table></div>
      <div class="panel"><h3 style="margin-top:0">Réservations rattachées (${resas.length})</h3><table><tr><th>Réf</th><th>Client</th><th>Téléphone</th><th>Pers.</th><th>Statut</th></tr>
        ${resas.map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.nom)}</td><td>${esc(r.telephone)}</td><td>${r.adultes + r.enfants}</td><td><span class="${stCls(r.status)}">${esc(r.status)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="mu">Aucune</td></tr>'}</table></div>`;
    $('#fg').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.dechets_kg = body.dechets_kg === '' ? null : Number(body.dechets_kg);
      if (body.decision && body.statut === 'planifiée') body.statut = 'réalisée';
      await api(`/admin/sorties/${s.id}`, { method: 'PUT', body }); toast('Fiche enregistrée'); shell();
    };
    $('#ajp').onclick = () => ficheDialog('enregistrement', null, () => ficheSortie(v, id), { date_sortie: s.date, formule: s.formule, id_sortie: s.code });
    $('#impr').onclick = () => {
      const w = window.open('', '_blank');
      w.document.write(`<title>${esc(s.code)}</title><style>body{font:13px Arial;margin:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5px;text-align:left}</style><h2>Sortie ${esc(s.code)} — ${esc(s.date)} — guide : ${esc(s.guide || '')}</h2>${$('#liste').innerHTML}`);
      w.document.close(); w.print();
    };
  }

  // ---------- Fiches participants et groupes : ajout / modification ----------
  // Mêmes champs et mêmes choix que le formulaire d'enregistrement du site
  const ON = ['Oui', 'Non'], ENC = ['Discovermores', 'Autre guide ou agence', 'Sans guide'];
  const AGES = ['Moins de 12 ans', '12 à 17 ans', '18 à 25 ans', '26 à 35 ans', '36 à 45 ans', '46 à 60 ans', 'Plus de 60 ans'];
  const FICHE_FORM = {
    enregistrement: [
      ['Identité', [['nom', 'Nom et prénom *'], ['sexe', 'Sexe', ['Femme', 'Homme', 'Ne souhaite pas répondre']], ['tranche_age', 'Âge', AGES],
        ['nationalite', 'Nationalité'], ['profil', 'Vous êtes', ['Visiteur venu de l’étranger', 'Membre de la diaspora comorienne', 'Résident des Comores']],
        ['pays', 'Pays de résidence'], ['ville', 'Ville ou île de résidence'], ['telephone', 'Téléphone (WhatsApp)', 'tel']]],
      ['Sortie', [['date_sortie', 'Date de la sortie *', 'date'], ['encadrement', 'Monte avec', ENC], ['formule', 'Formule', FORMULES_NOMS.slice(0, 4)],
        ['id_sortie', 'Code de la sortie (vide : calculé)'], ['guide_agence', 'Guide ou agence'], ['itineraire', 'Itinéraire', ['À pied depuis Mvouni', 'En 4×4 puis à pied', 'Autre voie d’accès']],
        ['duree_prevue', 'Durée prévue', ['Dans la journée', 'Avec une nuit sur place']], ['venu_avec', 'Venu avec', ['Seul(e)', 'En couple', 'En famille', 'Entre amis', 'Groupe / entreprise / école / association']],
        ['premiere_fois', 'Première fois au Karthala', ON]]],
      ['Sécurité', [['urgence_nom', 'Contact d’urgence'], ['urgence_tel', 'Son téléphone', 'tel'], ['responsable_mineur', 'Adulte responsable (si mineur)'],
        ['niveau', 'Niveau de marche', ['Je marche rarement', 'Je marche de temps en temps', 'Je randonne régulièrement', 'Je suis un randonneur entraîné']],
        ['sante', 'Information de santé à signaler', ['Non', 'Oui']], ['sante_detail', 'Précisions santé', 'textarea']]],
      ['Consentements et profil', [['accord_photo', 'Accord pour les photos publiées', ON], ['consentement', 'Accepte le traitement des données', ON],
        ['motivation', 'Ce qui attire le plus', ['Le volcan et les paysages', 'Le défi sportif', 'La nature et les oiseaux', 'La culture et l’histoire', 'Un moment en famille ou entre amis']],
        ['connu_par', 'Nous a connus par', ['Bouche-à-oreille', 'Réseaux sociaux', 'Recherche Google', 'Hôtel ou agence de voyage', 'TripAdvisor ou site d’avis', 'Déjà venu avec Discovermores', 'Autre']]]],
    ],
    groupe: [
      ['Groupe', [['etablissement', 'École ou groupe *'], ['niveau_scolaire', 'Niveau', ['Primaire', 'Collège', 'Lycée', 'Université', 'Autre groupe de jeunes']],
        ['ville', 'Ville ou île'], ['eleves', 'Nombre d’élèves', 'number'], ['dont_filles', 'Dont filles', 'number'], ['accompagnateurs', 'Adultes accompagnateurs', 'number'],
        ['tranche_age', 'Âge de la plupart des élèves', ['Moins de 12 ans', '12 à 17 ans', '18 à 25 ans']]]],
      ['Sortie', [['date_sortie', 'Date de la sortie *', 'date'], ['encadrement', 'Monte avec', ENC], ['id_sortie', 'Code de la sortie (vide : sortie du jour)'], ['guide_agence', 'Guide ou agence']]],
      ['Responsable et sécurité', [['responsable_nom', 'Enseignant ou responsable'], ['responsable_tel', 'Son téléphone (WhatsApp)', 'tel'],
        ['second_tel', 'École ou second adulte', 'tel'], ['sante', 'Information de santé à signaler', ['Non', 'Oui']]]],
      ['Consentements', [['accord_photo', 'Photos du groupe publiables', ON], ['consentement', 'Accepte le traitement des données', ON]]],
    ],
  };
  function ficheDialog(type, row, apres, prerempli = {}) {
    const d = row ? row.data : { encadrement: 'Discovermores', sante: 'Non', accord_photo: 'Oui', consentement: 'Oui', date_sortie: aujourdhui(), ...prerempli };
    const champ = ([k, label, t]) => {
      const v = d[k] ?? '';
      if (Array.isArray(t)) {
        const options = t.includes(v) || !v ? t : [v, ...t]; // une valeur ancienne hors liste n'est jamais perdue
        return `<label>${label}<select name="${k}"><option value=""></option>${options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
      }
      if (t === 'textarea') return `<label>${label}<textarea name="${k}" rows="2">${esc(v)}</textarea></label>`;
      return `<label>${label}<input name="${k}" type="${t || 'text'}" ${t === 'number' ? 'min="0"' : ''} value="${esc(v)}" ${label.endsWith('*') ? 'required' : ''}></label>`;
    };
    const titre = row ? `Modifier la fiche — ${esc(d.nom || d.etablissement || '')}` : (type === 'groupe' ? 'Ajouter un groupe' : 'Ajouter un participant');
    dialog(`<h3 style="margin:0">${titre}</h3>${row && d.id_sortie ? `<p class="mu" style="margin:0">Sortie actuelle : <b>${esc(d.id_sortie)}</b>. Changer la date ou la formule la rattache à la bonne sortie.</p>` : ''}
      ${FICHE_FORM[type].map(([t, champs]) => `<h4 style="margin:10px 0 0;color:var(--ok);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase">${t}</h4><div class="row2">${champs.map(champ).join('')}</div>`).join('')}`,
    async (f) => {
      const data = {};
      for (const [, champs] of FICHE_FORM[type]) for (const [k] of champs) data[k] = f[k].value;
      if (row) await api(`/admin/soumissions/${row.id}`, { method: 'PUT', body: { data } });
      else await api('/admin/soumissions', { method: 'POST', body: { type, data } });
      toast(row ? 'Fiche modifiée' : 'Fiche ajoutée'); apres();
    });
  }

  // ---------- Formulaires reçus ----------
  async function soumissions(v, type, sujet) {
    let rows = await api('/admin/soumissions?type=' + type);
    const sujets = [...new Set(rows.map((r) => r.data.sujet).filter(Boolean))];
    if (sujet) rows = rows.filter((r) => r.data.sujet === sujet);
    const hide = new Set(['page', 'formulaire']);
    v.innerHTML = `<h2>${FORMS[type]} (${rows.length})</h2><div class="bar">${sujets.length ? `<select id="sj" style="max-width:240px"><option value="">Tous les sujets</option>${sujets.map((x) => `<option ${x === sujet ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}<span class="sp"></span>${['enregistrement', 'groupe'].includes(type) ? `<button class="b-p" id="ajf">+ Ajouter ${type === 'groupe' ? 'un groupe' : 'un participant'}</button> <a class="b" href="/api/admin/pdf/fiches/${type}" target="_blank" rel="noopener">📄 Toutes en PDF</a> ` : ''}<a class="b" href="/api/admin/export/${type}.csv">Export CSV</a></div>
      ${rows.map((r) => `<div class="panel" style="${r.traite ? 'opacity:.6' : ''}"><div class="bar" style="margin-bottom:8px"><b>#${r.id}</b><span class="mu">${esc(r.created_at)}</span>${r.data.sujet ? `<span class="st">${esc(r.data.sujet)}</span>` : ''}${r.data.id_sortie ? `<span class="st">${esc(r.data.id_sortie)}</span>` : ''}<span class="sp"></span>
        ${r.data.telephone ? `<a class="b b-sm" target="_blank" rel="noopener" href="${wa(r.data.telephone)}">WhatsApp</a>` : ''}${r.data.email ? ` <a class="b b-sm" href="mailto:${esc(r.data.email)}">E-mail</a>` : ''}
        ${['enregistrement', 'groupe'].includes(type) ? `<button class="b-sm" data-mod="${r.id}">✏️ Modifier</button> <a class="b b-sm" href="/api/admin/pdf/fiche/${r.id}" target="_blank" rel="noopener">📄 PDF</a> ` : ''}<button class="b-sm" data-tr="${r.id}" data-v="${r.traite ? 0 : 1}">${r.traite ? 'Marquer non traité' : '✓ Traité'}</button> <button class="b-sm b-d" data-del="${r.id}">✕</button></div>
        <table>${Object.entries(r.data).filter(([k, val]) => val && !hide.has(k)).map(([k, val]) => `<tr><th style="width:200px">${esc(k.replace(/_/g, ' '))}</th><td>${esc(val)}</td></tr>`).join('')}</table></div>`).join('') || '<div class="panel mu">Rien pour l\'instant.</div>'}`;
    if ($('#sj')) $('#sj').onchange = () => soumissions(v, type, $('#sj').value);
    v.querySelectorAll('[data-tr]').forEach((b) => b.onclick = async () => { await api(`/admin/soumissions/${b.dataset.tr}`, { method: 'PUT', body: { traite: +b.dataset.v } }); soumissions(v, type, sujet); });
    v.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      const r = rows.find((x) => x.id == b.dataset.del);
      const qui = r && (r.data.nom || r.data.etablissement) ? ` de « ${r.data.nom || r.data.etablissement} »` : '';
      if (confirm(`Supprimer définitivement la fiche${qui} ?`)) { await api(`/admin/soumissions/${b.dataset.del}`, { method: 'DELETE' }); toast('Fiche supprimée'); soumissions(v, type, sujet); }
    });
    const recharger = () => soumissions(v, type, sujet);
    if ($('#ajf')) $('#ajf').onclick = () => ficheDialog(type, null, recharger);
    v.querySelectorAll('[data-mod]').forEach((b) => b.onclick = () => ficheDialog(type, rows.find((x) => x.id == b.dataset.mod), recharger));
  }

  // ---------- Tarifs ----------
  async function tarifs(v) {
    const [rows, pages] = await Promise.all([api('/admin/formules'), api('/admin/tarifs/pages')]);
    // Intitulés courts : lisibles dans la colonne sans être coupés
    const TYPES = { forfait: 'Forfait (1 à 4 pers.)', personne: 'Par personne', 'a-partir': 'À partir de' };
    const AIDE_TYPES = 'Forfait : un prix pour 1 à 4 personnes, puis le supplément par personne. Par personne : prix × nombre de personnes. À partir de : prix indicatif par personne, précisé par l\'équipe.';
    v.innerHTML = `<h2>Tarifs des formules</h2>
      <div class="panel avert"><b>Ce que ces tarifs mettent à jour automatiquement :</b> la liste et les prix du formulaire de réservation (français et anglais), l'estimation, le montant enregistré pour chaque réservation, les formulaires d'enregistrement et de retour d'expérience, et les réponses de K269.<br>
      <b>À relire à la main après un changement de prix :</b> les textes descriptifs (tableaux « prix à 2, à 4 », exemples) écrits dans ${pages.length} fichiers du site : <span class="mu">${pages.map(esc).join(', ')}</span>.<br>
      <b>Une formule ajoutée</b> apparaît dans les formulaires ; sa présentation détaillée sur la page Formules reste à rédiger.</div>
      <div class="bar"><span class="mu">${AIDE_TYPES}</span><span class="sp"></span><button class="b-p" id="ajform">+ Ajouter une formule</button></div>
      <div class="panel"><table><tr><th style="min-width:190px">Formule</th><th>Prix (€)</th><th>Type</th><th>Supp. / pers. au-delà de 4</th><th>Contribution / pers.</th><th>Âge min.</th><th>Pers. min.</th><th>Active</th><th></th></tr>
      ${rows.map((f) => `<tr data-id="${f.id}"><td><b>${esc(f.nom)}</b>${f.origine ? ' <span class="mu" title="Formule d\'origine du site : désactivable, pas supprimable">★</span>' : ''}<div class="mu">${esc(f.nom_en || '')}${f.nom_en ? ' · ' : ''}sorties ${esc(f.sigle || f.code.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase())}-…</div></td>
        <td><input name="prix" type="number" step="1" min="1" value="${f.prix}" style="width:90px"></td>
        <td><select name="type" style="min-width:160px">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input name="supp" type="number" step="1" min="0" value="${f.supp ?? ''}" style="width:80px"></td><td><input name="contrib" type="number" step="1" min="0" value="${f.contrib ?? 0}" style="width:80px"></td>
        <td><input name="age_min" type="number" min="0" value="${f.age_min ?? ''}" style="width:70px"></td><td><input name="min_pers" type="number" min="1" value="${f.min_pers ?? 1}" style="width:70px"></td>
        <td><input name="actif" type="checkbox" style="width:auto" ${f.actif ? 'checked' : ''} title="Décochée : la formule disparaît des formulaires du site"></td>
        <td style="white-space:nowrap"><button class="b-p b-sm" data-save>Enregistrer</button>${f.origine ? '' : ` <button class="b-sm b-d" data-delf="${f.id}" title="Supprimer cette formule">✕</button>`}</td></tr>`).join('')}</table></div>`;
    v.querySelectorAll('[data-save]').forEach((b) => b.onclick = async () => {
      const tr = b.closest('tr'), val = (n) => tr.querySelector(`[name=${n}]`);
      const body = { type: val('type').value, actif: val('actif').checked ? 1 : 0 };
      for (const n of ['prix', 'supp', 'contrib', 'age_min', 'min_pers']) body[n] = val(n).value === '' ? null : Number(val(n).value);
      try { await api(`/admin/formules/${tr.dataset.id}`, { method: 'PUT', body }); toast('Tarif enregistré'); } catch (e) { toast(e.message); }
    });
    v.querySelectorAll('[data-delf]').forEach((b) => b.onclick = async () => {
      const f = rows.find((x) => x.id == b.dataset.delf);
      if (!confirm(`Supprimer la formule « ${f.nom} » ? Elle disparaîtra des formulaires du site. Les réservations déjà reçues la gardent.`)) return;
      try { await api(`/admin/formules/${f.id}`, { method: 'DELETE' }); toast('Formule supprimée'); tarifs(v); } catch (e) { toast(e.message); }
    });
    $('#ajform').onclick = () => dialog(`<h3 style="margin:0">Nouvelle formule</h3>
      <div class="row2"><label>Nom en français *<input name="nom" required maxlength="60" placeholder="ex. Lever de soleil au cratère"></label><label>Nom en anglais<input name="nom_en" maxlength="60" placeholder="ex. Sunrise at the crater"></label></div>
      <div class="row2"><label>Prix (€) *<input name="prix" type="number" min="1" step="1" required></label><label>Type<select name="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${k === 'personne' ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <p class="mu" style="margin:0">${AIDE_TYPES}</p>
      <div class="row2"><label>Supplément / pers. au-delà de 4 (forfait)<input name="supp" type="number" min="0" step="1"></label><label>Contribution recommandée / pers. (€)<input name="contrib" type="number" min="0" step="1" value="0"></label></div>
      <div class="row2"><label>Âge minimum<input name="age_min" type="number" min="0"></label><label>Nombre minimum de personnes<input name="min_pers" type="number" min="1" value="1"></label></div>
      <label>Description courte (pour K269 et l'équipe)<textarea name="description" rows="2" maxlength="500"></textarea></label>
      <label>Ordre d'affichage<input name="ordre" type="number" value="${rows.length + 1}"></label>`, async (f) => {
      const body = { nom: f.nom.value, nom_en: f.nom_en.value, type: f.type.value, description: f.description.value, actif: 1 };
      for (const n of ['prix', 'supp', 'contrib', 'age_min', 'min_pers', 'ordre']) body[n] = f[n].value === '' ? null : Number(f[n].value);
      await api('/admin/formules', { method: 'POST', body });
      toast('Formule ajoutée'); tarifs(v);
    });
  }

  // ---------- Listes génériques ----------
  async function crud(v, name) {
    const def = CRUD[name];
    const rows = await api('/admin/' + name);
    const cell = (r, c) => {
      const f = def.fields.find((x) => x[0] === c); const val = r[c];
      if (f?.[2] === 'bool') return val ? '✅' : '—';
      if (f?.[2] === 'image' && val) return `<img src="${esc(/^https?:|^\//.test(val) ? val : '/uploads/' + val)}" style="height:44px;border-radius:6px" alt="">`;
      if (c === 'decision' && val) return `<span class="st st-${val === 'Go' ? 'payée' : val === 'No Go' ? 'annulée' : 'nouvelle'}">${esc(val)}</span>`;
      if (c === 'prix' || c === 'montant') return eur(val);
      if (Array.isArray(f?.[2]) && Array.isArray(f[2][0])) return esc((f[2].find((o) => o[0] === val) || [, val])[1]);
      return esc(String(val ?? '').slice(0, 90));
    };
    const aide = {
      sorties: 'Une sortie est créée automatiquement dès qu\'un randonneur s\'enregistre avec le QR code (code formule + date). Ouvrez-la pour remplir la fiche du guide.',
      avis: 'Les retours d\'expérience avec accord de publication arrivent ici, non publiés : relisez puis cochez « Publié ».',
      produits: 'Les produits ajoutés apparaissent sur la page Boutique (français et anglais) avec photo, tailles et bouton de commande WhatsApp. Pour les 7 produits d\'origine (★), seuls le prix, le stock et la disponibilité se modifient.',
      commandes: 'Les commandes passées avec le panier du site arrivent ici avec leur référence (B…). Celles reçues sur WhatsApp peuvent être ajoutées à la main. Une commande annulée remet ses articles en stock.',
      partenaires: 'Rubrique « Avec le soutien de » : logos du pied de page, sur toutes les pages. Les deux autres rubriques remplacent les emplacements vides de la page Partenaires et de la section « Ils nous font confiance » de l'accueil. Logo conseillé : PNG ou SVG sur fond transparent ou blanc.',
      photos: 'Les photos publiées apparaissent en tête de la galerie, dans une rubrique « Dernières photos ».',
    }[name];
    const titre = (c) => (c === 'created_at' ? 'Date' : c === 'confirmation_info' ? 'E-mail au client' : c === 'nom' && name === 'produits' ? 'Nom' : def.fields.find((f) => f[0] === c)?.[1] || c);
    v.innerHTML = `<h2>${def.title}</h2><div class="bar">${aide ? `<span class="mu">${aide}</span>` : ''}<span class="sp"></span><button class="b-p" id="add">+ Ajouter</button></div>
      <div class="panel"><table><tr>${def.cols.map((c) => `<th>${esc(titre(c))}</th>`).join('')}<th></th></tr>
      ${rows.map((r) => `<tr>${def.cols.map((c) => `<td>${c === 'nom' && r.origine ? '★ ' : ''}${cell(r, c)}</td>`).join('')}<td style="white-space:nowrap">${name === 'sorties' ? `<a class="b b-sm" href="#sorties/${r.id}">Fiche & liste</a> <a class="b b-sm" href="/api/admin/pdf/sortie/${r.id}" target="_blank" rel="noopener">📄 PDF</a> ` : ''}${name === 'produits' && !r.origine ? `<a class="b b-sm" href="/boutique#${esc(r.code)}" target="_blank">Voir</a> ` : ''}<button class="b-sm" data-ed="${r.id}">Modifier</button>${r.origine ? '' : ` <button class="b-sm b-d" data-del="${r.id}">✕</button>`}</td></tr>`).join('') || `<tr><td colspan="9" class="mu">Rien pour l'instant</td></tr>`}</table></div>`;
    if ($('#add')) $('#add').onclick = () => editDialog(name, {});
    v.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => editDialog(name, rows.find((r) => r.id == b.dataset.ed)));
    v.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Supprimer ?')) { await api(`/admin/${name}/${b.dataset.del}`, { method: 'DELETE' }); shell(); } });
  }

  function dialog(html, onSubmit) {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">${html}<p class="err"></p><div class="bar" style="margin:0"><span class="sp"></span><button value="cancel" formnovalidate>Annuler</button><button class="b-p" value="ok">Enregistrer</button></div></form>`;
    document.body.appendChild(d); d.showModal();
    const f = d.querySelector('form');
    f.onsubmit = async (e) => {
      if (e.submitter?.value !== 'ok') return;
      e.preventDefault();
      const bouton = e.submitter; bouton.disabled = true;
      try { await onSubmit(f); d.close(); } catch (err) { f.querySelector('.err').textContent = err.message; bouton.disabled = false; }
    };
    d.addEventListener('close', () => d.remove());
    return d;
  }

  function editDialog(name, row) {
    let def = CRUD[name];
    // Produit d'origine : sa fiche est écrite dans la page, seuls prix, stock et disponibilité se règlent
    if (name === 'produits' && row.origine) def = { ...def, fields: def.fields.filter(([k]) => ['prix', 'stock', 'disponible'].includes(k)) };
    const defautVrai = new Set(['publie', 'disponible']);
    const input = ([k, label, type]) => {
      const v = row[k] ?? (type === 'bool' && defautVrai.has(k) && name !== 'avis' ? 1 : '');
      if (type === 'textarea') return `<label>${label}<textarea name="${k}" rows="4">${esc(v)}</textarea></label>`;
      if (type === 'bool') return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${k}" ${v ? 'checked' : ''} style="width:auto"> ${label}</label>`;
      if (type === 'image') {
        const src = v ? (/^https?:|^\//.test(v) ? v : '/uploads/' + v) : '';
        return `<label>${label}<input type="hidden" name="${k}" value="${esc(v)}"><span class="img-champ"><img data-apercu="${k}" src="${esc(src)}" alt="" ${src ? '' : 'hidden'}><input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" data-fichier="${k}"></span></label>`;
      }
      if (Array.isArray(type)) return `<label>${label}<select name="${k}">${type.map((o) => { const [val, lib] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(lib)}</option>`; }).join('')}</select></label>`;
      return `<label>${label}<input name="${k}" type="${type || 'text'}" ${type === 'number' ? 'step="any"' : ''} value="${esc(v)}"></label>`;
    };
    const d = dialog(`<h3 style="margin:0">${row.id ? 'Modifier' : 'Ajouter'} — ${def.title}</h3>${def.fields.map(input).join('')}`, async (f) => {
      const body = {};
      for (const [k, , type] of def.fields) {
        if (type === 'bool') body[k] = f[k].checked ? 1 : 0;
        else if (type === 'number') body[k] = f[k].value === '' ? null : Number(f[k].value);
        else body[k] = f[k].value;
      }
      if (name === 'photos' && !body.fichier) throw new Error('Choisissez une photo');
      if (name === 'sorties' && !body.date) throw new Error('La date est obligatoire');
      await api(`/admin/${name}${row.id ? '/' + row.id : ''}`, { method: row.id ? 'PUT' : 'POST', body });
      toast('Enregistré'); shell();
    });
    // Envoi immédiat de l'image choisie ; le champ caché reçoit le fichier enregistré
    d.querySelectorAll('[data-fichier]').forEach((inp) => inp.onchange = async () => {
      const k = inp.dataset.fichier, err = d.querySelector('.err');
      if (!inp.files[0]) return;
      try {
        err.textContent = 'Envoi de l\'image…';
        const r = await envoyerImage(inp.files[0]);
        d.querySelector(`[name="${k}"]`).value = name === 'photos' ? r.fichier : r.url;
        const ap = d.querySelector(`[data-apercu="${k}"]`); ap.src = r.url; ap.hidden = false;
        err.textContent = '';
      } catch (e) { err.textContent = e.message; }
    });
  }

  // ---------- K269 ----------
  async function questions(v) {
    const rows = await api('/admin/questions');
    v.innerHTML = `<h2>Questions posées à K269</h2><div class="bar"><span class="mu">⚠️ = K269 n'a rien trouvé. Créez une réponse : il l'utilisera aussitôt.</span><span class="sp"></span><a class="b" href="/api/admin/export/questions.csv">Export CSV</a></div>
      <div class="panel"><table><tr><th>Date</th><th>Question</th><th>Langue</th><th>Réponse</th><th></th></tr>
      ${rows.map((r) => { const vide = !r.resultats && r.ia !== 'Oui'; return `<tr><td class="mu">${esc(r.created_at)}</td><td>${vide ? '⚠️ ' : ''}${esc(r.question)}</td><td>${esc(r.langue)}</td><td class="mu">${esc(r.type_reponse)}${r.ia === 'Oui' ? ' · IA' : ''}</td>
        <td style="white-space:nowrap"><button class="b-sm" data-sav="${r.id}">→ Créer réponse</button> <button class="b-sm b-d" data-del="${r.id}">✕</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="mu">Aucune question</td></tr>'}</table></div>`;
    v.querySelectorAll('[data-sav]').forEach((b) => b.onclick = () => { const r = rows.find((x) => x.id == b.dataset.sav); editDialog('savoirs', { titre: r.question, langue: r.langue || 'fr', publie: 1 }); });
    v.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api(`/admin/questions/${b.dataset.del}`, { method: 'DELETE' }); shell(); });
  }

  // ---------- Liens du site ----------
  async function liens(v) {
    const s = await api('/admin/settings');
    const ro = me.role !== 'admin' ? 'disabled' : '';
    const base = (s.site_url || location.origin).replace(/\/+$/, '');
    const ADRESSES = [
      ['Page d\'aperçu (accueil du lien)', '/', 'La première page : présentation, « Ouvrir le site », avis des testeurs.'],
      ['Site en français', '/', ''], ['Site en anglais', '/en/', ''],
      ['Réservation', '/reservation', 'À mettre dans vos messages et sur les réseaux.'],
      ['Enregistrement des randonneurs (QR code)', '/enregistrement', 'Adresse contenue dans le QR code des sorties.'],
      ['Retour d\'expérience', '/retour-experience', 'À envoyer par WhatsApp après chaque sortie.'],
      ['QR code à imprimer', '/qr-codes', 'Page interne : à imprimer et plastifier.'],
      ['Plan du site (Google)', '/sitemap.xml', 'À déclarer dans Google Search Console.'],
      ['Back office', '/admin/', ''],
    ];
    v.innerHTML = `<h2>Liens du site</h2>
      <form class="panel" id="lf2" style="display:grid;gap:10px;max-width:760px">
        <h3 style="margin:0">Adresse du site</h3>
        <p class="mu" style="margin:0">Le domaine où le site est publié. Il sert aux liens pour Google (canoniques, français ↔ anglais), aux aperçus de partage sur les réseaux, au plan du site et au QR code des sorties.
          ${s.site_url ? '' : `<br><b>Non réglée :</b> l'adresse utilisée est celle de la visite en cours (<code>${esc(location.origin)}</code>). Réglez-la avant la mise en ligne, sinon le QR code imprimé pourrait contenir une adresse locale.`}</p>
        <label style="display:grid;gap:4px">Adresse (domaine seul)<input name="site_url" placeholder="https://karthala360.discovermores.com" value="${esc(s.site_url)}" ${ro}></label>
        <h3 style="margin:8px 0 0">Réseaux sociaux</h3>
        <p class="mu" style="margin:0">Remplacent les liens Instagram et Facebook de l'en-tête et du pied de toutes les pages (100 de chaque). Vides : les comptes Discovermores actuels restent.</p>
        <label style="display:grid;gap:4px">Instagram<input name="lien_instagram" placeholder="https://www.instagram.com/discovermores/" value="${esc(s.lien_instagram)}" ${ro}></label>
        <label style="display:grid;gap:4px">Facebook<input name="lien_facebook" placeholder="https://www.facebook.com/discovermores/" value="${esc(s.lien_facebook)}" ${ro}></label>
        <p class="err" id="le2" style="margin:0"></p>
        ${ro ? '<p class="mu">Seul un administrateur peut modifier ces liens.</p>' : '<div><button class="b-p">Enregistrer</button></div>'}</form>
      <div class="panel" style="max-width:760px"><h3 style="margin-top:0">Adresses à partager</h3><table>
        ${ADRESSES.map(([nom, chemin, aide]) => `<tr><td><b>${nom}</b>${aide ? `<div class="mu">${aide}</div>` : ''}</td><td><a href="${esc(base + chemin)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(base + chemin)}</a></td><td><button class="b-sm" data-copie="${esc(base + chemin)}">Copier</button></td></tr>`).join('')}
      </table></div>
      <div class="panel" style="max-width:760px"><h3 style="margin-top:0">Anciennes adresses</h3><p class="mu" style="margin:0">Les liens de l'ancienne version (dossier WeTransfer, ex. <code>formules-ascension.html</code>), les adresses en <code>.html</code> et les anciennes adresses en <code>/site/…</code> mènent automatiquement à la bonne page : rien à faire.</p></div>`;
    v.querySelectorAll('[data-copie]').forEach((b) => b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copie); toast('Adresse copiée'); } catch { prompt('Copiez l\'adresse :', b.dataset.copie); }
    });
    $('#lf2').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Liens enregistrés'); liens(v); }
      catch (err) { $('#le2').textContent = err.message; }
    };
  }

  // ---------- Paramètres ----------
  async function settings(v) {
    const s = await api('/admin/settings');
    const ro = me.role !== 'admin' ? 'disabled' : '';
    const champ = ([k, l, t]) => `<label style="display:grid;gap:4px">${l}${t === 'textarea' ? `<textarea name="${k}" rows="2" ${ro}>${esc(s[k])}</textarea>` : Array.isArray(t) ? `<select name="${k}" ${ro}>${t.map(([val, lib]) => `<option value="${val}" ${val === s[k] ? 'selected' : ''}>${lib}</option>`).join('')}</select>` : `<input name="${k}" value="${esc(s[k])}" ${ro}>`}</label>`;
    const bloc = (titre, aide, champs) => `<h3 style="margin:12px 0 0">${titre}</h3>${aide ? `<p class="mu" style="margin:0">${aide}</p>` : ''}${champs.map(champ).join('')}`;
    v.innerHTML = `<h2>Paramètres & paiements</h2><form class="panel" id="sf" style="display:grid;gap:10px;max-width:700px">
      ${bloc('Apparence du site', 'Pour comparer sans rien changer : ouvrez le site avec ?style=clarte ou ?style=original à la fin de l\'adresse.', [
        ['style_site', 'Style', [['clarte', 'Clarté : clair et très lisible (par défaut)'], ['original', 'Original : sombre, néon, boutons arrondis']]]])}
      ${bloc('Contact', 'Remplace le numéro WhatsApp et l\'e-mail sur toutes les pages du site (103 liens WhatsApp, 171 e-mails), dans les formulaires et dans K269.', [
        ['whatsapp', 'Numéro WhatsApp (format international, ex. 269 356 58 03)'], ['email', 'E-mail de contact'], ['delai_reponse', 'Délai de réponse annoncé (ex. 24 heures)']])}
      ${bloc('Coordonnées de paiement', 'Affichées sur la page Paiement (français et anglais) à la place de « À COMPLÉTER ».', [
        ['paiement_virement', 'Virement : titulaire, banque, IBAN, BIC', 'textarea'], ['paiement_paypal', 'PayPal : adresse ou lien PayPal.me'],
        ['paiement_mvola', 'MVola : numéro et nom du compte'], ['paiement_wakati', 'Wakati : numéro et nom du compte'], ['acompte_pct', 'Acompte demandé (%)']])}
      ${bloc('Fonds d\'action environnementale', 'Calculé à partir des contributions des réservations payées. Ajustement : dons ou dépenses saisis à la main (négatif pour une dépense).', [
        ['seuil_action', 'Palier déclenchant une action (€)'], ['fonds_ajustement', 'Ajustement manuel (€)']])}
      ${bloc('Textes à compléter du site', '', [
        ['tarif_agenda_evenement', 'Agenda : tarif d\'une annonce'], ['tarif_agenda_semaine', 'Agenda : tarif par semaine'],
        ['tarif_datapro_rapport', 'Data Pro : tarif du rapport'], ['tarif_datapro_abonnement', 'Data Pro : tarif annuel'], ['assurance_contrat', 'CGV : numéro de contrat Amana Assurances']])}
      ${bloc('Alerte volcanique', 'Le niveau s\'affiche dans « Aujourd\'hui au Karthala » sur l\'accueil. Au-delà du vert, un bandeau apparaît aussi en haut de toutes les pages. Le message remplace la note sous le niveau.', [
        ['alerte_niveau', 'Niveau', [['', 'À confirmer (affiché tel quel sur l\'accueil)'], ['vert', 'Vert (aucun bandeau)'], ['jaune', 'Jaune · vigilance'], ['orange', 'Orange · ascensions suspendues'], ['rouge', 'Rouge · ascensions interdites']]],
        ['alerte_message', 'Message personnalisé (facultatif)']])}
      ${bloc('Notifications', s.smtp_actif ? 'Envoi d\'e-mails actif.' : '⏸ Envoi d\'e-mails inactif : renseignez SMTP_HOST, SMTP_USER, SMTP_PASS dans le fichier .env du serveur puis redémarrez.', [
        ['notif_email', 'E-mail qui reçoit les nouvelles réservations et messages'],
        ['envoi_auto_bon', 'Envoi automatique du bon de réservation au client', [['1', "Oui : dès qu'une réservation est enregistrée (si le client a donné son e-mail)"], ['0', 'Non : envoi à la main avec le bouton 📧']]]])}
      ${ro ? '<p class="mu">Seul un administrateur peut modifier ces paramètres.</p>' : '<div style="position:sticky;bottom:0;background:#fff;padding:8px 0"><button class="b-p">Enregistrer</button></div>'}</form>
      <div class="panel" style="max-width:700px"><b>K269 avec IA : ${s.ia_active ? '✅ active' : '⏸ inactive'}</b><p class="mu">Variable <code>ANTHROPIC_API_KEY</code> du fichier <code>.env</code>, puis redémarrage du conteneur.</p></div>
      ${me.role === 'admin' ? `<div class="panel" style="max-width:700px"><b>Sauvegarde</b><p class="mu">Télécharge toute la base (fichier SQLite). À faire régulièrement et à garder hors du serveur. Les photos envoyées sont dans le dossier <code>uploads</code> du volume de données.</p><a class="b b-p" href="/api/admin/sauvegarde">⬇ Télécharger la sauvegarde</a></div>` : ''}`;
    $('#sf').onsubmit = async (e) => { e.preventDefault(); await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Paramètres enregistrés'); shell(); };
  }

  async function users(v) {
    const rows = await api('/admin/users');
    v.innerHTML = `<h2>Utilisateurs</h2><div class="bar"><span class="mu">Éditeur : gère l'activité et les contenus. Administrateur : en plus, paramètres, utilisateurs, journal et sauvegarde.</span><span class="sp"></span><button class="b-p" id="add">+ Ajouter</button></div>
      <div class="panel"><table><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Créé</th><th></th></tr>
      ${rows.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td class="mu">${esc(u.created_at)}</td><td>${u.id === me.id ? '' : `<button class="b-sm b-d" data-del="${u.id}">✕</button>`}</td></tr>`).join('')}</table></div>`;
    $('#add').onclick = () => dialog(`<h3 style="margin:0">Nouvel utilisateur</h3><label>Nom<input name="name" required></label><label>E-mail<input name="email" type="email" required></label>
      <label>Mot de passe (10 caractères minimum, une lettre et un chiffre)<input name="password" type="password" minlength="10" required autocomplete="new-password"></label><label>Rôle<select name="role"><option value="editor">Éditeur</option><option value="admin">Administrateur</option></select></label>`,
      async (f) => { await api('/admin/users', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); shell(); });
    v.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Supprimer cet utilisateur ?')) { await api(`/admin/users/${b.dataset.del}`, { method: 'DELETE' }); shell(); } });
  }

  async function journal(v) {
    const rows = await api('/admin/journal');
    v.innerHTML = `<h2>Journal d'activité</h2><div class="bar"><span class="mu">Les 500 dernières actions du back office (connexions, créations, modifications, suppressions, sauvegardes).</span><span class="sp"></span><a class="b" href="/api/admin/export/journal.csv">Export CSV</a></div>
      <div class="panel"><table><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Élément</th><th>Détail</th></tr>
      ${rows.map((r) => `<tr><td class="mu" style="white-space:nowrap">${esc(r.created_at)}</td><td>${esc(r.utilisateur)}</td><td>${esc(r.action)}</td><td>${esc(r.cible)}</td><td class="mu" style="font-size:.8rem;max-width:380px;word-break:break-word">${esc(r.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="mu">Vide</td></tr>'}</table></div>`;
  }

  function passwordDialog() {
    dialog(`<h3 style="margin:0">Changer le mot de passe</h3><label>Actuel<input name="current" type="password" required></label><label>Nouveau (10 caractères minimum, une lettre et un chiffre)<input name="next" type="password" minlength="10" required autocomplete="new-password"></label>`,
      async (f) => { await api('/admin/me/password', { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('Mot de passe modifié'); });
  }

  window.addEventListener('hashchange', () => me && shell());
  api('/auth/me').then((u) => { me = u; shell(); }).catch(() => renderLogin());
})();
