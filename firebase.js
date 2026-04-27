import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDW-QxMIrLD5o5uAR8EySZj0plLxL2QCBE",
  authDomain: "onli-platform.firebaseapp.com",
  projectId: "onli-platform",
  storageBucket: "onli-platform.firebasestorage.app",
  messagingSenderId: "304342580490",
  appId: "1:304342580490:web:25d6e84d0f25883f4c4ef3",
  measurementId: "G-BS7WWS9DZ0"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
