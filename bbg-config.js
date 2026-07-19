// Embedded Firebase config (optional)
//
// 1) Firebase Console → Project settings → Your apps (Web) → Firebase SDK snippet
// 2) Copy the `firebaseConfig` object
// 3) Set ENABLE_EMBEDDED_FIREBASE_CONFIG = true and paste the object below
//
// Note: apiKey is not treated as a secret for Firebase client apps.

(function () {
  'use strict';

  // Keep false if you want to use the in-app setup screen (?screen=setup).
  var ENABLE_EMBEDDED_FIREBASE_CONFIG = true;

  if (!ENABLE_EMBEDDED_FIREBASE_CONFIG) return;

  // Paste your firebaseConfig here.
  // Example:
  // var firebaseConfig = {
  //   apiKey: "...",
  //   authDomain: "...",
  //   databaseURL: "https://<project>-default-rtdb.<region>.firebasedatabase.app",
  //   projectId: "...",
  //   storageBucket: "...",
  //   messagingSenderId: "...",
  //   appId: "..."
  // };
  var firebaseConfig = {
    apiKey: 'AIzaSyC3FAMp6_omagcoAzopF94rr6-ZFa6DWK8',
    authDomain: 'bboardgames-a5488.firebaseapp.com',
    databaseURL: 'https://bboardgames-a5488-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'bboardgames-a5488',
    storageBucket: 'bboardgames-a5488.firebasestorage.app',
    messagingSenderId: '56436701144',
    appId: '1:56436701144:web:7667f7bd66fa5f55b5a4ad'
  };

  if (firebaseConfig && firebaseConfig.apiKey) {
    window.firebaseConfig = firebaseConfig;
  }

  // Optional: Gemini API key for おえかきバトル (AI judging, host device only).
  // Get a free key at https://aistudio.google.com/app/apikey
  // 公開サイトに埋め込む場合は Google Cloud Console でキーに
  // 「HTTPリファラー制限（公開URLのみ）」と「Generative Language API 限定」を掛けること。
  // 通常は空のままにして、アプリ内の ?screen=setup で端末ごとに設定するのを推奨。
  var GEMINI_API_KEY = '';
  if (GEMINI_API_KEY) {
    window.geminiApiKey = GEMINI_API_KEY;
  }
})();
