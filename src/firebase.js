import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDscmI9ROx8pPK5J-8Ng-vB_7DmF8ayUek",
  authDomain: "student-management-f4faa.firebaseapp.com",
  projectId: "student-management-f4faa",
  storageBucket: "student-management-f4faa.firebasestorage.app",
  messagingSenderId: "123646384473",
  appId: "1:123646384473:web:1c51d9b3a82fc3a1ed1448",
  measurementId: "G-L6RRKCS8RL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;