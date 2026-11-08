// =====================================================================
//  Boodschappen – configuratie
//  Vul hieronder de gegevens van JOUW Firebase-project in.
//  Je vindt ze in de Firebase-console › Projectinstellingen › Algemeen ›
//  "Je apps" › Web-app › "SDK-instelling en -configuratie" (optie "Config").
//
//  Deze waarden zijn GEEN geheim: ze staan in elke Firebase-webapp.
//  De beveiliging zit in de Firestore-regels (bestand firestore.rules).
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBFz-UYzsLXeeUCYq6hD59gDvPOc1ksr2Y",
  authDomain: "boodschappen-app-18fff.firebaseapp.com",
  projectId: "boodschappen-app-18fff",
  storageBucket: "boodschappen-app-18fff.appspot.com",
  messagingSenderId: "307505973423",
  appId: "1:307505973423:web:0de8f4f483d38cc11eac5a"
};

// Functies die je kunt aan- of uitzetten
export const FEATURES = {
  // Eén persoon kan in meerdere gezinnen zitten en wisselen via het menu bovenaan.
  // Zet op false om het menu te verbergen (gegevens blijven bewaard).
  multiHousehold: true,

  // Hoe lang (in dagen) een uitnodiging geldig blijft
  inviteDays: 14,

  // Hoe lang een afgevinkt artikel nog zichtbaar blijft (milliseconden)
  cartLingerMs: 2500
};

// Naam van de app zoals die in de kop en in uitnodigingen verschijnt
export const APP_NAME = "Boodschappen";
