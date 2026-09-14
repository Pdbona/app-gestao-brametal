// ============================================================
// FIREBASE — projeto real conectado em 14/09/2026
// ============================================================
//
// Projeto: app-gestao-brametal (novo, separado do app-gestao-ml).
// Firestore Native em southamerica-east1 (São Paulo), mesmo padrão do
// app-gestao-ml. Console: https://console.firebase.google.com/project/app-gestao-brametal/overview
//
// A apiKey abaixo NÃO é secreta — ela só identifica o projeto no
// navegador; quem protege os dados de verdade são as regras de
// segurança do Firestore (configuradas no Console, não versionadas
// aqui — mesmo padrão do app-gestao-ml).

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCDdarkZMEm5QCoQCxJ9cYxn5HU1F3FqFg',
  authDomain: 'app-gestao-brametal.firebaseapp.com',
  projectId: 'app-gestao-brametal',
  storageBucket: 'app-gestao-brametal.firebasestorage.app',
  messagingSenderId: '557676745402',
  appId: '1:557676745402:web:2e87cb0c96f0fab74de883'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const FIREBASE_CONFIGURADO = true;
