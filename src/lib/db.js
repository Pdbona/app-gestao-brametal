// ============================================================
// CAMADA DE DADOS — reexporta o Firestore de verdade
// ============================================================
//
// Até 14/09/2026 este arquivo gravava tudo no localStorage (o projeto
// Firebase da Brametal ainda não existia). Agora que existe
// (src/firebase.js), o arquivo virou só uma reexportação — nenhuma tela
// precisou mudar, porque todas já importavam sempre daqui, nunca
// diretamente de 'firebase/firestore'.

export { db } from '../firebase';
export {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

export const MODO_LOCAL = false;
