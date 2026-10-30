// Fiches participants au format PDF (pdfkit) : fiche individuelle, fiche de groupe, dossier complet d'une sortie.
const PDFDocument = require('pdfkit');

const VERT = '#1E7A3B', LAGON = '#1FA5B8', NUIT = '#0D120E', GRIS = '#5E685F', TRAIT = '#DCE5DE', ROUGE = '#C9362B', FOND = '#F4F7F4';
const MARGE = 48;

// Les polices standard des PDF couvrent le français ; on retire ce qu'elles ne savent pas dessiner (émojis…)
const net = (v) => String(v ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—…€Œœ]/g, '').trim();
const dateFr = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : net(iso);
};

// Champs de la fiche, regroupés comme sur le formulaire du site (libellés identiques)
const SECTIONS = [
  ['Identité', [['nom', 'Nom et prénom'], ['sexe', 'Sexe'], ['tranche_age', 'Âge'], ['nationalite', 'Nationalité'], ['profil', 'Vous êtes'],
    ['pays', 'Pays de résidence'], ['ville', 'Ville ou île de résidence'], ['telephone', 'Téléphone (WhatsApp)']]],
  ['Sortie', [['date_sortie', 'Date de la sortie'], ['id_sortie', 'Code de la sortie'], ['encadrement', 'Monte avec'], ['formule', 'Formule'],
    ['guide_agence', 'Guide ou agence'], ['itineraire', 'Itinéraire'], ['duree_prevue', 'Durée prévue'], ['venu_avec', 'Venu avec'], ['premiere_fois', 'Première fois au Karthala']]],
  ['Sécurité', [['urgence_nom', 'Contact d\'urgence'], ['urgence_tel', 'Son téléphone'], ['responsable_mineur', 'Adulte responsable (mineur)'],
    ['niveau', 'Niveau de marche'], ['sante', 'Information de santé'], ['sante_detail', 'Précisions santé']]],
  ['Consentements', [['accord_photo', 'Accord pour les photos publiées'], ['consentement', 'Accepte le traitement des données']]],
  ['Pour mieux vous connaître', [['motivation', 'Ce qui l\'attire le plus'], ['connu_par', 'Nous a connus par']]],
];
const SECTIONS_GROUPE = [
  ['Groupe', [['etablissement', 'École ou groupe'], ['niveau_scolaire', 'Niveau'], ['ville', 'Ville ou île'], ['eleves', 'Nombre d\'élèves'],
    ['dont_filles', 'Dont filles'], ['accompagnateurs', 'Adultes accompagnateurs'], ['tranche_age', 'Âge de la plupart des élèves']]],
  ['Sortie', [['date_sortie', 'Date de la sortie'], ['id_sortie', 'Code de la sortie'], ['encadrement', 'Monte avec'], ['guide_agence', 'Guide ou agence']]],
  ['Responsable et sécurité', [['responsable_nom', 'Enseignant ou responsable'], ['responsable_tel', 'Son téléphone (WhatsApp)'],
    ['second_tel', 'École ou second adulte'], ['sante', 'Information de santé à signaler']]],
  ['Consentements', [['accord_photo', 'Photos du groupe publiables'], ['consentement', 'Accepte le traitement des données']]],
];
const mineur = (d) => /Moins de 12|12 à 17/.test(d.tranche_age || '');

function nouveau(titre) {
  return new PDFDocument({ size: 'A4', margin: MARGE, bufferPages: true, info: { Title: net(titre), Author: 'Discovermores — Karthala360', Subject: 'Fiche participant' } });
}

// Bandeau d'en-tête aux couleurs du site
function bandeau(doc, titre, sousTitre) {
  const l = doc.page.width;
  doc.save().rect(0, 0, l, 86).fill(NUIT);
  doc.rect(0, 86, l, 4).fill(VERT).rect(l / 2, 86, l / 2, 4).fill(LAGON).restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('KARTHALA', MARGE, 26, { continued: true }).fillColor('#67DC8B').text('360');
  doc.fillColor('#B8C2BA').font('Helvetica').fontSize(9).text('Discovermores · Moroni, Grande Comore', MARGE, 50);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text(net(titre), MARGE, 26, { width: l - 2 * MARGE, align: 'right' });
  if (sousTitre) doc.fillColor('#B8C2BA').font('Helvetica').fontSize(9).text(net(sousTitre), MARGE, 46, { width: l - 2 * MARGE, align: 'right' });
  doc.y = 110; doc.x = MARGE;
}

// Encadré d'alerte (santé, mineur)
function alerte(doc, texte) {
  const w = doc.page.width - 2 * MARGE;
  const h = doc.font('Helvetica-Bold').fontSize(10).heightOfString(net(texte), { width: w - 24 }) + 14;
  const y = doc.y;
  doc.save().roundedRect(MARGE, y, w, h, 6).fill('#FBE9E7').restore();
  doc.save().rect(MARGE, y, 4, h).fill(ROUGE).restore();
  doc.fillColor(ROUGE).text(net(texte), MARGE + 14, y + 7, { width: w - 24 });
  doc.y = y + h + 10; doc.x = MARGE;
}

function section(doc, titre, champs, d) {
  const lignes = champs.filter(([k]) => net(d[k]));
  if (!lignes.length) return;
  const w = doc.page.width - 2 * MARGE, col = 170;
  if (doc.y > doc.page.height - 105) doc.addPage(); // titre de rubrique jamais seul en bas de page
  doc.moveDown(0.4);
  doc.fillColor(VERT).font('Helvetica-Bold').fontSize(10).text(net(titre).toUpperCase(), MARGE, doc.y, { characterSpacing: 1 });
  doc.moveTo(MARGE, doc.y + 3).lineTo(MARGE + w, doc.y + 3).lineWidth(0.8).strokeColor(TRAIT).stroke();
  doc.y += 9;
  for (const [k, libelle] of lignes) {
    let valeur = net(d[k]);
    if (/date/.test(k)) valeur = dateFr(valeur);
    const important = (k === 'sante' && valeur === 'Oui') || k === 'sante_detail' || k === 'responsable_mineur';
    const hauteur = Math.max(doc.font('Helvetica').fontSize(10).heightOfString(valeur, { width: w - col }), 12);
    if (doc.y + hauteur > doc.page.height - 70) doc.addPage();
    const y = doc.y;
    doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(net(libelle), MARGE, y + 1, { width: col - 12 });
    doc.fillColor(important ? ROUGE : NUIT).font(important ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(valeur, MARGE + col, y, { width: w - col });
    doc.y = Math.max(doc.y, y + hauteur) + 3.5;
  }
}

// Une fiche (participant ou groupe) sur la page en cours
function fiche(doc, d, recuLe) {
  const groupe = !!d.etablissement;
  const nom = groupe ? d.etablissement : d.nom;
  bandeau(doc, groupe ? 'Fiche de groupe' : 'Fiche participant', `Sortie ${net(d.id_sortie) || '—'} · ${dateFr(d.date_sortie) || '—'}`);
  doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(20).text(net(nom) || 'Sans nom', MARGE, doc.y);
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(`Enregistré le ${dateFr(recuLe)}${String(recuLe || '').slice(10, 16)} · via le QR code de la sortie`);
  doc.moveDown(0.8);
  if (d.sante === 'Oui') alerte(doc, `Information de santé signalée${d.sante_detail ? ' : ' + d.sante_detail : ''}. À connaître du guide avant le départ.`);
  if (!groupe && mineur(d)) alerte(doc, `Participant mineur (${d.tranche_age})${d.responsable_mineur ? ' — adulte responsable : ' + d.responsable_mineur : ''}.`);
  for (const [titre, champs] of groupe ? SECTIONS_GROUPE : SECTIONS) section(doc, titre, champs, d);
}

// Pied de page sur toutes les pages : confidentialité + numéro de page
const PIED_FICHES = 'Document confidentiel — données personnelles de sécurité. À ne pas diffuser ; détruire après la sortie.';
function pieds(doc, texte = PIED_FICHES) {
  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i);
    // Écrire dans la marge du bas sans que pdfkit crée une nouvelle page
    const margeBas = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 38;
    doc.moveTo(MARGE, y - 6).lineTo(doc.page.width - MARGE, y - 6).lineWidth(0.5).strokeColor(TRAIT).stroke();
    doc.fillColor(GRIS).font('Helvetica').fontSize(7.5)
      .text(net(texte), MARGE, y, { width: doc.page.width - 2 * MARGE - 60, lineBreak: false })
      .text(`${i + 1} / ${n}`, doc.page.width - MARGE - 60, y, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margeBas;
  }
}

// Tableau de sécurité d'une sortie (une ligne par randonneur)
function listeSecurite(doc, sortie, participants) {
  bandeau(doc, `Dossier de sortie ${sortie.code}`, `${sortie.formule || ''} · ${dateFr(sortie.date)}`);
  const w = doc.page.width - 2 * MARGE;
  const mineurs = participants.filter(mineur).length, sante = participants.filter((p) => p.sante === 'Oui').length;
  // Un groupe scolaire compte pour ses élèves et ses adultes, pas pour une seule ligne
  const personnes = participants.reduce((n, p) => n + (p.etablissement ? (parseInt(p.eleves, 10) || 0) + (parseInt(p.accompagnateurs, 10) || 0) : 1), 0);
  const infos = [['Guide', sortie.guide || '—'], ['Personnes', String(personnes)], ['Mineurs', String(mineurs)], ['Santé signalée', String(sante)]];
  const lc = w / infos.length, y0 = doc.y;
  infos.forEach(([l, v], i) => {
    const x = MARGE + i * lc;
    doc.save().roundedRect(x + 2, y0, lc - 4, 46, 6).fill(FOND).restore();
    doc.fillColor(GRIS).font('Helvetica').fontSize(8).text(l.toUpperCase(), x + 12, y0 + 8, { width: lc - 24, lineBreak: false });
    doc.fillColor((l === 'Santé signalée' && sante) || (l === 'Mineurs' && mineurs) ? ROUGE : NUIT).font('Helvetica-Bold').fontSize(14)
      .text(net(v), x + 12, y0 + 22, { width: lc - 24, lineBreak: false });
  });
  doc.x = MARGE; doc.y = y0 + 60;
  if (sortie.decision) {
    doc.fillColor(NUIT).font('Helvetica').fontSize(9.5).text(`Décision : ${net(sortie.decision)}${sortie.meteo ? ' · Météo : ' + net(sortie.meteo) : ''}${sortie.terrain ? ' · Terrain : ' + net(sortie.terrain) : ''}`, MARGE);
    doc.moveDown(0.6);
  }
  const cols = [['N°', 24], ['Nom et prénom', 128], ['Âge', 62], ['Téléphone', 84], ['Contact d\'urgence', 120], ['Santé', w - 24 - 128 - 62 - 84 - 120]];
  const entete = () => {
    const y = doc.y;
    doc.save().rect(MARGE, y, w, 20).fill(NUIT).restore();
    let x = MARGE;
    for (const [t, cw] of cols) { doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(t, x + 5, y + 6, { width: cw - 8, lineBreak: false }); x += cw; }
    doc.y = y + 20;
  };
  entete();
  participants.forEach((p, i) => {
    const groupe = !!p.etablissement;
    const nom = groupe ? `${net(p.etablissement)} (groupe : ${net(p.eleves) || '?'} élèves, ${net(p.accompagnateurs) || '?'} adultes)` : net(p.nom);
    const urgence = groupe ? [net(p.responsable_nom), net(p.responsable_tel)] : [net(p.urgence_nom), net(p.urgence_tel)];
    const valeurs = [String(i + 1), nom, net(p.tranche_age), net(groupe ? p.responsable_tel : p.telephone), urgence.filter(Boolean).join(' · '),
      p.sante === 'Oui' ? net(p.sante_detail || 'Oui') : '—'];
    const h = Math.max(...valeurs.map((v, j) => doc.font('Helvetica').fontSize(8.5).heightOfString(v || ' ', { width: cols[j][1] - 8 }))) + 10;
    if (doc.y + h > doc.page.height - 60) { doc.addPage(); doc.y = MARGE; entete(); }
    const y = doc.y;
    if (i % 2) doc.save().rect(MARGE, y, w, h).fill(FOND).restore();
    if (p.sante === 'Oui' || mineur(p)) doc.save().rect(MARGE, y, 3, h).fill(ROUGE).restore();
    let x = MARGE;
    valeurs.forEach((v, j) => {
      const alerteCase = (j === 5 && p.sante === 'Oui') || (j === 2 && mineur(p));
      doc.fillColor(alerteCase ? ROUGE : NUIT).font(alerteCase ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).text(v || ' ', x + 5, y + 5, { width: cols[j][1] - 8 });
      x += cols[j][1];
    });
    doc.y = y + h;
    doc.moveTo(MARGE, doc.y).lineTo(MARGE + w, doc.y).lineWidth(0.4).strokeColor(TRAIT).stroke();
  });
  if (!participants.length) doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Personne ne s\'est encore enregistré pour cette sortie.', MARGE, doc.y + 10);
  doc.moveDown(1.5);
  doc.fillColor(GRIS).font('Helvetica').fontSize(8.5).text('Signature du guide au départ : ______________________        Heure de départ : ________        Heure de retour : ________', MARGE);
}

function envoyer(res, doc, nomFichier, pied) {
  pieds(doc, pied);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nomFichier.replace(/[^a-zA-Z0-9._-]+/g, '-')}"`);
  res.setHeader('Cache-Control', 'no-store'); // données personnelles : jamais gardées en cache
  doc.pipe(res);
  doc.end();
}

// --- API ---
function ficheUnique(res, d, recuLe) {
  const doc = nouveau(`Fiche ${d.nom || d.etablissement || ''}`);
  fiche(doc, d, recuLe);
  envoyer(res, doc, `fiche-${(d.nom || d.etablissement || 'participant')}-${d.date_sortie || ''}.pdf`);
}
function plusieursFiches(res, liste, titre, nomFichier) {
  const doc = nouveau(titre);
  if (!liste.length) { bandeau(doc, titre, ''); doc.fillColor(GRIS).font('Helvetica').fontSize(11).text('Aucune fiche.', MARGE); }
  liste.forEach((f, i) => { if (i) doc.addPage(); fiche(doc, f.data, f.recu_le); });
  envoyer(res, doc, nomFichier);
}
function dossierSortie(res, sortie, liste) {
  const doc = nouveau(`Dossier de sortie ${sortie.code}`);
  listeSecurite(doc, sortie, liste.map((f) => f.data));
  liste.forEach((f) => { doc.addPage(); fiche(doc, f.data, f.recu_le); });
  envoyer(res, doc, `sortie-${sortie.code}.pdf`);
}

// ---------- Réservations ----------
const euros = (n) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`);
const COULEUR_STATUT = { nouvelle: '#A3360F', 'confirmée': '#1F4F86', 'acompte payé': '#8A5A00', 'payée': '#226B40', 'terminée': '#555555', 'annulée': '#AA1122' };
const PIED_RESA = 'Discovermores SARL · Moroni, Grande Comore · Bon de réservation non contractuel tant que l\'acompte n\'est pas reçu (voir conditions générales de vente).';

// Ligne libellé / valeur alignée, optionnellement en gras
function ligneMontant(doc, libelle, valeur, opts = {}) {
  const w = doc.page.width - 2 * MARGE, y = doc.y;
  if (opts.fond) doc.save().rect(MARGE, y - 4, w, 24).fill(opts.fond).restore();
  doc.fillColor(opts.couleur || NUIT).font(opts.gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.taille || 10)
    .text(net(libelle), MARGE + 10, y, { width: w - 150 }).text(net(valeur), MARGE + w - 140, y, { width: 130, align: 'right' });
  doc.y = Math.max(doc.y, y + 14) + 6; doc.x = MARGE;
}

// Construit le bon (sans l'envoyer) : servi au navigateur ou joint à un e-mail
function construireBon(r, f, paiement) {
  const doc = nouveau(`Bon de réservation ${r.ref}`);
  bandeau(doc, 'Bon de réservation', `Réf. ${r.ref} · reçue le ${dateFr(r.created_at)}`);
  const w = doc.page.width - 2 * MARGE;
  // Titre + statut
  doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(20).text(net(r.formule), MARGE, doc.y, { width: w - 130 });
  const statut = net(r.status), cs = COULEUR_STATUT[r.status] || GRIS;
  const ls = doc.font('Helvetica-Bold').fontSize(9).widthOfString(statut.toUpperCase()) + 20;
  doc.save().roundedRect(MARGE + w - ls, 110, ls, 20, 10).fill(cs).restore();
  doc.fillColor('#FFFFFF').text(statut.toUpperCase(), MARGE + w - ls, 116, { width: ls, align: 'center' });
  doc.moveDown(0.25);
  doc.fillColor(GRIS).font('Helvetica').fontSize(10).text(`Sortie du ${dateFr(r.date_souhaitee)} · ${r.adultes} adulte${r.adultes > 1 ? 's' : ''}${r.enfants ? ` + ${r.enfants} enfant${r.enfants > 1 ? 's' : ''}` : ''}`, MARGE);
  doc.moveDown(0.6);
  section(doc, 'Client', [['nom', 'Nom'], ['telephone', 'Téléphone / WhatsApp'], ['email', 'E-mail'], ['pays', 'Pays']], r);
  section(doc, 'Sortie', [['formule', 'Formule'], ['date_souhaitee', 'Date souhaitée'], ['id_sortie', 'Code de la sortie'], ['prise_en_charge', 'Prise en charge'], ['message', 'Message du client']], r);

  // Montant détaillé
  const personnes = (r.adultes || 0) + (r.enfants || 0);
  const contribution = r.contribution_eur || 0;
  const du = r.montant_total ?? r.estimation ?? 0;
  const formuleSeule = du - contribution;
  if (doc.y > doc.page.height - 260) doc.addPage();
  doc.moveDown(0.4);
  doc.fillColor(VERT).font('Helvetica-Bold').fontSize(10).text('MONTANT', MARGE, doc.y, { characterSpacing: 1 });
  doc.moveTo(MARGE, doc.y + 3).lineTo(MARGE + w, doc.y + 3).lineWidth(0.8).strokeColor(TRAIT).stroke();
  doc.y += 10;
  let detail = '';
  if (f) {
    if (f.type === 'forfait') detail = `forfait ${euros(f.prix)} pour 1 à 4 pers.${personnes > 4 ? ` + ${personnes - 4} × ${euros(f.supp || 0)}` : ''}`;
    else detail = `${personnes} × ${euros(f.prix)}${f.type === 'a-partir' ? ' (à partir de)' : ''}`;
  }
  ligneMontant(doc, `${r.formule}${detail ? ' — ' + detail : ''}`, euros(formuleSeule));
  if (contribution) ligneMontant(doc, `Contribution environnementale (${personnes} pers.)`, euros(contribution));
  ligneMontant(doc, 'Total', euros(du), { gras: true, taille: 12, fond: FOND });
  const recu = (r.acompte || 0) + (r.solde_paye || 0);
  if (r.acompte) ligneMontant(doc, `Acompte reçu${r.acompte_date ? ' le ' + dateFr(r.acompte_date) : ''}${r.mode_paiement ? ' · ' + r.mode_paiement : ''}`, `- ${euros(r.acompte)}`, { couleur: VERT });
  if (r.solde_paye) ligneMontant(doc, `Solde reçu${r.solde_date ? ' le ' + dateFr(r.solde_date) : ''}`, `- ${euros(r.solde_paye)}`, { couleur: VERT });
  const reste = Math.max(0, du - recu);
  if (r.status !== 'annulée') {
    ligneMontant(doc, reste ? 'Reste à payer' : 'Réservation entièrement payée', reste ? euros(reste) : '✓'.replace('✓', 'Payé'), { gras: true, couleur: reste ? ROUGE : VERT });
    if (!r.acompte && reste) ligneMontant(doc, `Acompte demandé (${paiement.acompte_pct} %) pour confirmer la date`, euros(Math.round(du * paiement.acompte_pct) / 100), { couleur: GRIS });
  }

  // Moyens de paiement
  const moyens = [['Virement bancaire', paiement.virement], ['PayPal (carte bancaire acceptée)', paiement.paypal], ['MVola', paiement.mvola], ['Wakati', paiement.wakati]].filter(([, v]) => v);
  if (reste && r.status !== 'annulée') {
    if (doc.y > doc.page.height - 170) doc.addPage();
    doc.moveDown(0.6);
    doc.fillColor(VERT).font('Helvetica-Bold').fontSize(10).text('COMMENT PAYER', MARGE, doc.y, { characterSpacing: 1 });
    doc.moveTo(MARGE, doc.y + 3).lineTo(MARGE + w, doc.y + 3).lineWidth(0.8).strokeColor(TRAIT).stroke();
    doc.y += 10;
    if (moyens.length) for (const [m, v] of moyens) {
      const y = doc.y;
      doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(net(m), MARGE, y + 1, { width: 158 });
      doc.fillColor(NUIT).font('Helvetica').fontSize(10).text(net(v), MARGE + 170, y, { width: w - 170 });
      doc.y = Math.max(doc.y, y + 12) + 4;
    } else doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Les coordonnées de paiement vous sont communiquées par l\'équipe Discovermores.', MARGE);
    doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(`Indiquez la référence ${r.ref} avec votre paiement.`, MARGE, doc.y + 4);
  }
  doc.moveDown(1.2);
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(`Contact : ${[paiement.whatsapp && `WhatsApp +${String(paiement.whatsapp).replace(/\D/g, '')}`, paiement.email].filter(Boolean).join(' · ')}`, MARGE);
  return doc;
}
function bonReservation(res, r, f, paiement) {
  envoyer(res, construireBon(r, f, paiement), `reservation-${r.ref}.pdf`, PIED_RESA);
}
// Le même bon en mémoire (pièce jointe d'e-mail)
function bonReservationBuffer(r, f, paiement) {
  return new Promise((ok, ko) => {
    const doc = construireBon(r, f, paiement);
    pieds(doc, PIED_RESA);
    const morceaux = [];
    doc.on('data', (m) => morceaux.push(m)).on('end', () => ok(Buffer.concat(morceaux))).on('error', ko);
    doc.end();
  });
}

// Liste des réservations (une ligne par réservation, totaux en bas)
function listeReservations(res, liste, filtres) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGE, bufferPages: true, info: { Title: 'Réservations Karthala360', Author: 'Discovermores — Karthala360' } });
  const periode = [filtres.du && `du ${dateFr(filtres.du)}`, filtres.au && `au ${dateFr(filtres.au)}`].filter(Boolean).join(' ');
  bandeau(doc, 'Réservations', `${liste.length} réservation${liste.length > 1 ? 's' : ''}${filtres.status ? ' · ' + filtres.status : ''}${periode ? ' · ' + periode : ''} · édité le ${dateFr(new Date().toISOString())}`);
  const w = doc.page.width - 2 * MARGE;
  const cols = [['Date', 62], ['Réf.', 82], ['Client', 132], ['Téléphone', 100], ['Formule', 116], ['Pers.', 34], ['Montant', 66], ['Payé', 66], ['Statut', w - 658]];
  const entete = () => {
    const y = doc.y; doc.save().rect(MARGE, y, w, 20).fill(NUIT).restore();
    let x = MARGE; for (const [t, cw] of cols) { doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(t, x + 5, y + 6, { width: cw - 8, lineBreak: false }); x += cw; }
    doc.y = y + 20;
  };
  entete();
  let totalDu = 0, totalRecu = 0, totalPers = 0;
  liste.forEach((r, i) => {
    const du = r.montant_total ?? r.estimation ?? 0, recu = (r.acompte || 0) + (r.solde_paye || 0), pers = (r.adultes || 0) + (r.enfants || 0);
    if (r.status !== 'annulée') { totalDu += du; totalRecu += recu; totalPers += pers; }
    const v = [dateFr(r.date_souhaitee), r.ref, r.nom, r.telephone, r.formule, String(pers), euros(du), recu ? euros(recu) : '—', r.status];
    const h = Math.max(...v.map((t, j) => doc.font('Helvetica').fontSize(8.5).heightOfString(net(t) || ' ', { width: cols[j][1] - 8 }))) + 9;
    if (doc.y + h > doc.page.height - 70) { doc.addPage(); doc.y = MARGE; entete(); }
    const y = doc.y;
    if (i % 2) doc.save().rect(MARGE, y, w, h).fill(FOND).restore();
    let x = MARGE;
    v.forEach((t, j) => {
      const couleur = j === 8 ? (COULEUR_STATUT[r.status] || NUIT) : r.status === 'annulée' ? GRIS : NUIT;
      doc.fillColor(couleur).font(j === 8 || j === 6 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).text(net(t) || ' ', x + 5, y + 4.5, { width: cols[j][1] - 8 });
      x += cols[j][1];
    });
    doc.y = y + h;
    doc.moveTo(MARGE, doc.y).lineTo(MARGE + w, doc.y).lineWidth(0.4).strokeColor(TRAIT).stroke();
  });
  if (!liste.length) doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Aucune réservation pour ces critères.', MARGE, doc.y + 10);
  doc.moveDown(1);
  doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(10)
    .text(`Hors annulations : ${totalPers} personnes · ${euros(totalDu)} réservés · ${euros(totalRecu)} encaissés · ${euros(Math.max(0, totalDu - totalRecu))} restant à encaisser`, MARGE);
  envoyer(res, doc, `reservations${filtres.status ? '-' + filtres.status : ''}.pdf`, 'Discovermores — Karthala360 · Document interne : données des clients, à ne pas diffuser.');
}

module.exports = { ficheUnique, plusieursFiches, dossierSortie, bonReservation, bonReservationBuffer, listeReservations };
