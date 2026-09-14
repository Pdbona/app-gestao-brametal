// ============================================================
// FIREBASE — ainda NÃO conectado (decisão do Pablo em 10/09/2026)
// ============================================================
//
// Enquanto o projeto Firebase da Brametal não existe, o app grava tudo
// localmente (ver src/lib/db.js). Este arquivo já fica aqui com o lugar
// exato da configuração pra o dia da migração ser um passo só.
//
// PASSO A PASSO DA MIGRAÇÃO (quando o projeto existir):
//   1. `npm install firebase`
//   2. Criar o projeto no console do Firebase, com Firestore em
//      southamerica-east1 (São Paulo) — mesmo padrão do app-gestao-ml.
//   3. Colar a config real abaixo e descomentar o bloco.
//   4. Trocar o corpo de src/lib/db.js por reexportações do SDK:
//        export { db } from '../firebase';
//        export {
//          collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
//          getDoc, getDocs, onSnapshot, query, where, orderBy,
//          serverTimestamp
//        } from 'firebase/firestore';
//        export const MODO_LOCAL = false;
//      Nenhuma tela precisa ser tocada — todas importam de lib/db.
//   5. Publicar as regras de segurança no Console (não ficam versionadas
//      aqui, mesmo padrão do app-gestao-ml).

// import { initializeApp } from 'firebase/app';
// import { getFirestore } from 'firebase/firestore';
//
// const firebaseConfig = {
//   apiKey: '',
//   authDomain: '',
//   projectId: '',
//   storageBucket: '',
//   messagingSenderId: '',
//   appId: ''
// };
//
// const app = initializeApp(firebaseConfig);
// export const db = getFirestore(app);

export const FIREBASE_CONFIGURADO = false;
