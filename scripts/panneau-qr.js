// Panneau grand format pour la route du Karthala : QR code vers la fiche d'enregistrement, en PDF vectoriel
// (net à toutes les tailles d'impression). Correction d'erreur maximale (H) : le code reste lisible même un peu abîmé.
//   node scripts/panneau-qr.js [adresse] [fichier.pdf]
// Par défaut : https://karthala360.fr/enregistrement, format A1 portrait (59,4 × 84,1 cm).
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const adresse = process.argv[2] || 'https://karthala360.fr/enregistrement';
const sortie = process.argv[3] || path.join(__dirname, '..', 'exemples', 'panneau-qr-karthala360-A1.pdf');
const mm = (v) => (v * 72) / 25.4;
const L = mm(594), H = mm(841); // A1 portrait
const VERT = '#1E6B3A', NUIT = '#0D120E', GRIS = '#4A544C';

const qr = QRCode.create(adresse, { errorCorrectionLevel: 'H' });
const n = qr.modules.size;
const doc = new PDFDocument({ size: [L, H], margin: 0, info: { Title: 'Panneau QR code Karthala360', Author: 'Discovermores' } });
fs.mkdirSync(path.dirname(sortie), { recursive: true });
doc.pipe(fs.createWriteStream(sortie));

// Fond et bandeau du haut
doc.rect(0, 0, L, H).fill('#FFFFFF');
doc.rect(0, 0, L, mm(150)).fill(NUIT);
doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(mm(30)).text('KARTHALA', mm(40), mm(42), { continued: true }).fillColor('#67DC8B').text('360');
doc.fillColor('#C9D1CB').font('Helvetica').fontSize(mm(12)).text('par Discovermores · Grande Comore', mm(40), mm(84));
doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(mm(19)).text('Randonneurs du Karthala', mm(40), mm(108));

// Titre
doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(mm(26)).text('Enregistrez votre ascension', 0, mm(180), { width: L, align: 'center' });
doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(mm(16)).text('Register your ascent', 0, mm(216), { width: L, align: 'center' });

// QR code vectoriel, avec sa marge blanche obligatoire (4 modules)
const cote = mm(380), x0 = (L - cote) / 2, y0 = mm(250), m = cote / (n + 8);
doc.rect(x0, y0, cote, cote).fill('#FFFFFF');
doc.fillColor(NUIT);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) doc.rect(x0 + (c + 4) * m, y0 + (r + 4) * m, m + 0.2, m + 0.2);
doc.fill();
doc.lineWidth(mm(2)).strokeColor(VERT).roundedRect(x0 - mm(8), y0 - mm(8), cote + mm(16), cote + mm(16), mm(10)).stroke();

// Consignes
const yc = y0 + cote + mm(40);
doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(mm(15)).text('Scannez avec l’appareil photo de votre téléphone', 0, yc, { width: L, align: 'center' });
doc.fillColor(GRIS).font('Helvetica').fontSize(mm(12)).text('Avec ou sans guide · Moins d’une minute · Gratuit', 0, yc + mm(26), { width: L, align: 'center' });
doc.font('Helvetica-Oblique').text('With or without a guide · Under a minute · Free', 0, yc + mm(46), { width: L, align: 'center' });

// Pied : pourquoi, et l'adresse en clair si le scan ne marche pas
doc.rect(0, H - mm(110), L, mm(110)).fill('#F1F4EF');
doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(mm(12)).text('Pour votre sécurité et la préservation du Karthala', 0, H - mm(88), { width: L, align: 'center' });
doc.fillColor(GRIS).font('Helvetica').fontSize(mm(10)).text('For your safety and to help protect Mount Karthala', 0, H - mm(66), { width: L, align: 'center' });
doc.fillColor(VERT).font('Helvetica-Bold').fontSize(mm(13)).text(adresse.replace(/^https?:\/\//, ''), 0, H - mm(40), { width: L, align: 'center' });

doc.end();
console.log(`Panneau créé : ${sortie} (QR ${n}×${n} modules, vers ${adresse})`);
