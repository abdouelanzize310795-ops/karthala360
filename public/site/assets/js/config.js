/* Karthala360 — configuration du site.
   C’est le seul fichier à modifier pour brancher les formulaires.

   1. Déployez le script Google (dossier backend/, voir guides/LISEZMOI.md).
   2. Collez l’adresse de l’application Web entre les guillemets de "endpoint".
   Tant que "endpoint" est vide, les formulaires proposent l’envoi par WhatsApp.
   3. "ia" : true pour que K269 rédige ses réponses avec l’IA
      (seulement après avoir ajouté la clé ANTHROPIC_API_KEY dans le script Google).
   (La régénération par src/gen_config.py conserve "endpoint", "delaiReponse" et "ia".) */

window.K360 = {
  endpoint: "",
  whatsapp: "2693565803",
  email: "contact@discovermores.com",
  delaiReponse: "24 heures",
  ia: false,
  seuilAction: 500,
  acomptePct: 30,
  tauxKmf: 491.96775,
  formules: [
  {
    "code": "zero-effort",
    "nom": "Zéro Effort",
    "prix": 350,
    "type": "forfait",
    "supp": 50,
    "contrib": 10,
    "age_min": 5,
    "min_pers": 1
  },
  {
    "code": "soft-trek",
    "nom": "Soft Trek",
    "prix": 250,
    "type": "forfait",
    "supp": 50,
    "contrib": 7,
    "age_min": 8,
    "min_pers": 1
  },
  {
    "code": "bivouac",
    "nom": "Bivouac au volcan",
    "prix": 150,
    "type": "personne",
    "supp": null,
    "contrib": 5,
    "age_min": 12,
    "min_pers": 2
  },
  {
    "code": "sportif",
    "nom": "Karthala Sportif",
    "prix": 90,
    "type": "personne",
    "supp": null,
    "contrib": 2,
    "age_min": 15,
    "min_pers": 2
  },
  {
    "code": "quad-buggy",
    "nom": "Quad & Buggy",
    "prix": 150,
    "type": "a-partir",
    "supp": 0,
    "contrib": 0,
    "age_min": null,
    "min_pers": 1
  }
]
};
