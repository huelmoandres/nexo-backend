#!/usr/bin/env node
/**
 * Envuelve e2e-mercadopago-folder.json en una colección Postman v2.1 importable.
 * Uso: node postman/scripts/sync-e2e-collection.js
 */
const fs = require('fs');
const path = require('path');

const postmanDir = path.join(__dirname, '..');
const mainPath = path.join(postmanDir, 'nexos-api.postman_collection.json');
const folderPath = path.join(postmanDir, 'e2e-mercadopago-folder.json');
const outPath = path.join(postmanDir, 'nexos-e2e-mercadopago.postman_collection.json');

const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
const folder = JSON.parse(fs.readFileSync(folderPath, 'utf8'));

const collection = {
  info: {
    name: 'Nexos E2E — Mercado Pago',
    _postman_id: 'nexos-e2e-mercadopago-v1',
    description:
      'Flujo E2E Checkout Pro (sandbox). Importá el environment Nexos Local (nexos-local.postman_environment.json). Colección completa: nexos-api.postman_collection.json.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: main.auth,
  event: main.event,
  variable: main.variable,
  item: [folder],
};

fs.writeFileSync(outPath, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${outPath} (${folder.item.length} requests)`);
