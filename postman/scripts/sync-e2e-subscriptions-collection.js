#!/usr/bin/env node
/**
 * Colección Postman importable — E2E Suscripciones MP.
 * Uso: node postman/scripts/sync-e2e-subscriptions-collection.js
 */
const fs = require('fs');
const path = require('path');

const postmanDir = path.join(__dirname, '..');
const mainPath = path.join(postmanDir, 'nexos-api.postman_collection.json');
const folderPath = path.join(
  postmanDir,
  'e2e-mercadopago-subscriptions-folder.json',
);
const outPath = path.join(
  postmanDir,
  'nexos-e2e-mercadopago-subscriptions.postman_collection.json',
);

const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
const folder = JSON.parse(fs.readFileSync(folderPath, 'utf8'));

const collection = {
  info: {
    name: 'Nexos E2E — Mercado Pago Suscripciones',
    _postman_id: 'nexos-e2e-mp-subscriptions-v1',
    description:
      'Flujo E2E Suscripciones SaaS (sandbox). Environment: nexos-local.postman_environment.json. Guía: docs/how-to/mercadopago-subscriptions-sandbox.md',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: main.auth,
  event: main.event,
  variable: main.variable,
  item: [folder],
};

fs.writeFileSync(outPath, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${outPath} (${folder.item.length} requests)`);

// Insertar carpeta en nexos-api si no existe
const api = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
const exists = api.item.some((i) => i.name === folder.name);
if (!exists) {
  const checkoutIdx = api.item.findIndex((i) =>
    i.name.includes('Checkout Pro'),
  );
  const insertAt = checkoutIdx >= 0 ? checkoutIdx + 1 : api.item.length;
  api.item.splice(insertAt, 0, folder);
  api.info.description = `${api.info.description}\n\n**E2E Suscripciones MP:** carpeta «${folder.name}». Guía: docs/how-to/mercadopago-subscriptions-sandbox.md`;
  fs.writeFileSync(mainPath, `${JSON.stringify(api, null, 2)}\n`);
  console.log(`Inserted folder into ${mainPath} at index ${insertAt}`);
}
