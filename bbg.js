/* Single-file build (no ES modules) for maximum mobile compatibility. */

(function () {
  'use strict';

  // Extremely old browsers can't run Firebase compat (Promise required).
  if (typeof Promise === 'undefined') {
    var v = document.getElementById('view');
    if (v) {
      v.innerHTML =
        '<div class="stack"><div class="badge">エラー</div><div class="big">このブラウザは古すぎます</div><div class="muted">別のブラウザ（Chrome/Safari最新版）で開いてください。</div></div>';
    }
    return;
  }

  // -------------------- tiny helpers --------------------
  var hasOwn = Object.prototype.hasOwnProperty;

  function assign(target) {
    if (!target) target = {};
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (!hasOwn.call(src, k)) continue;
        target[k] = src[k];
      }
    }
    return target;
  }

  function qs(selector, root) {
    var r = root || document;
    var el = r.querySelector(selector);
    if (!el) throw new Error('Not found: ' + selector);
    return el;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function copyTextToClipboard(text) {
    var t = String(text == null ? '' : text);
    if (!t) return Promise.resolve(false);

    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard
          .writeText(t)
          .then(function () {
            return true;
          })
          .catch(function () {
            return false;
          });
      }
    } catch (e) {
      // ignore
    }

    try {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '-1000px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand && document.execCommand('copy');
      } catch (e2) {
        ok = false;
      }
      document.body.removeChild(ta);
      return Promise.resolve(!!ok);
    } catch (e3) {
      return Promise.resolve(false);
    }
  }

  function nowMs() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function randomInt(maxExclusive) {
    var max = Math.floor(Math.abs(maxExclusive || 0));
    if (!max) return 0;
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues && typeof Uint32Array !== 'undefined') {
        // Rejection sampling to avoid modulo bias
        var limit = Math.floor(4294967296 / max) * max;
        var buf = new Uint32Array(1);
        while (true) {
          crypto.getRandomValues(buf);
          var x = buf[0] >>> 0;
          if (x < limit) return x % max;
        }
      }
    } catch (e) {
      // ignore
    }
    return Math.floor(Math.random() * max);
  }

  function randomId(len) {
    var l = Math.max(1, Math.floor(Math.abs(len || 8)));
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var bytes = null;
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues && typeof Uint8Array !== 'undefined') {
        bytes = crypto.getRandomValues(new Uint8Array(l));
      }
    } catch (e) {
      bytes = null;
    }
    for (var i = 0; i < l; i++) {
      var v = bytes ? bytes[i] : Math.floor(Math.random() * 256);
      out += alphabet[v % alphabet.length];
    }
    return out;
  }

  // TEMP (testing): force discussion time to 10 seconds.
  // Revert later by setting to 0 (or removing override).
  var FORCE_TALK_SECONDS = 0;

  // Codenames: long-press duration (ms) to confirm a card pick.
  // Short tap = pending toggle.
  var CN_LONG_PRESS_MS = 700;

  // Firebase server time correction (helps devices with clock drift / iOS timer lag)
  var _serverTimeOffsetMs = 0;
  function serverNowMs() {
    return nowMs() + (_serverTimeOffsetMs || 0);
  }

  function pad2(n) {
    var s = String(Math.floor(Math.abs(n)));
    return s.length >= 2 ? s : '0' + s;
  }

  function clamp(n, min, max) {
    var x = Number(n);
    if (isNaN(x)) x = 0;
    var a = Number(min);
    var b = Number(max);
    if (isNaN(a)) a = x;
    if (isNaN(b)) b = x;
    return Math.max(a, Math.min(b, x));
  }

  function parseIntSafe(v, fallback) {
    var n = 0;
    try {
      n = parseInt(String(v), 10);
    } catch (e) {
      n = NaN;
    }
    if (isNaN(n)) {
      var fb = fallback;
      if (fb == null) fb = 0;
      try {
        fb = parseInt(String(fb), 10);
      } catch (e2) {
        // ignore
      }
      if (isNaN(fb)) fb = 0;
      return fb;
    }
    return n;
  }

  function formatMMSS(totalSeconds) {
    var s = Math.max(0, Math.floor(Math.abs(totalSeconds || 0)));
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return pad2(mm) + ':' + pad2(ss);
  }

  // -------------------- query helpers (no URL/URLSearchParams) --------------------
  function decodeQS(s) {
    try {
      return decodeURIComponent(String(s || '').replace(/\+/g, ' '));
    } catch (e) {
      return String(s || '');
    }
  }

  function encodeQS(s) {
    try {
      return encodeURIComponent(String(s));
    } catch (e) {
      return String(s);
    }
  }

  function parseQuery() {
    var q = String(location.search || '').replace(/^\?/, '');
    var out = {};
    if (!q) return out;
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      var idx = part.indexOf('=');
      var k = idx >= 0 ? part.slice(0, idx) : part;
      var v = idx >= 0 ? part.slice(idx + 1) : '';
      out[decodeQS(k)] = decodeQS(v);
    }
    return out;
  }

  function buildQuery(obj) {
    var parts = [];
    for (var k in obj) {
      if (!hasOwn.call(obj, k)) continue;
      if (obj[k] == null || obj[k] === '') continue;
      parts.push(encodeQS(k) + '=' + encodeQS(obj[k]));
    }
    return parts.join('&');
  }

  function baseUrl() {
    var origin = '';
    if (location.protocol && location.host) origin = location.protocol + '//' + location.host;
    return origin + (location.pathname || '/');
  }

  function setQuery(obj) {
    var q = buildQuery(obj);
    var url = baseUrl() + (q ? '?' + q : '');
    if (location.hash) url += location.hash;
    history.pushState(null, '', url);
  }

  function hardNavigate(obj) {
    var q = buildQuery(obj);
    var url = baseUrl() + (q ? '?' + q : '');
    if (location.hash) url += location.hash;
    try {
      location.href = url;
    } catch (e) {
      // Fallback
      location.assign(url);
    }
  }

  function getScriptQueryParam(src, key) {
    var s = String(src || '');
    var qi = s.indexOf('?');
    if (qi < 0) return '';
    var q = s.slice(qi + 1);
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      var idx = part.indexOf('=');
      var k = idx >= 0 ? part.slice(0, idx) : part;
      var v = idx >= 0 ? part.slice(idx + 1) : '';
      if (decodeQS(k) === key) return decodeQS(v);
    }
    return '';
  }

  var _bundledAssetV = null;

  function getBundledAssetVersion() {
    if (_bundledAssetV != null) return _bundledAssetV;

    var src = '';
    try {
      if (document.currentScript && document.currentScript.src) src = String(document.currentScript.src);
    } catch (e) {
      src = '';
    }

    if (!src) {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var s = scripts[i];
        if (s && s.src) {
          var ss = String(s.src);
          if (ss.indexOf('app.js') !== -1 || ss.indexOf('bbg.js') !== -1) {
          src = String(s.src);
          break;
          }
        }
      }
    }

    _bundledAssetV = getScriptQueryParam(src, 'v') || '';
    return _bundledAssetV;
  }

  function getCacheBusterParam() {
    // Prefer the version baked into the currently-loaded script tag.
    // This prevents old bookmarked URLs like ?v=20251228u from pinning the app to an old asset version.
    var bundled = getBundledAssetVersion();
    if (bundled) return String(bundled);
    var q = parseQuery();
    if (q.v) return String(q.v);
    return '';
  }

  function ensureUrlHasCacheBuster() {
    var q = parseQuery();
    var bundled = getBundledAssetVersion();
    if (!bundled) return;
    // If missing or different, overwrite to the bundled asset version.
    if (q.v && String(q.v) === String(bundled)) return;
    q.v = String(bundled);
    setQuery(q);
  }

  // -------------------- topics --------------------
  var TOPIC_CATEGORIES = [
    {
      id: 'general',
      name: '一般',
      pairs: [
        ['Google', 'Yahoo'],
        ['マクドナルド', 'モスバーガー'],
        ['ロッテリア', 'モスバーガー'],
        ['ガスト', 'サイゼリア'],
        ['吉野家', 'すきや'],
        ['docomo', 'softbank'],
        ['スタバ', 'ドトール'],
        ['セブンイレブン', 'ファミマ'],
        ['ローソン', 'ファミマ'],
        ['楽天市場', 'amazon'],
        ['任天堂', 'ソニー'],
        ['キリン', 'アサヒ'],
        ['TOYOTA', 'NISSAN'],
        ['目玉焼き', 'スクランブルエッグ'],
        ['鍋料理', 'おでん'],
        ['チョコレート', 'キャラメル'],
        ['コーヒー', '紅茶'],
        ['日本酒', 'ウィスキー'],
        ['にんにく', 'しょうが'],
        ['白菜', 'キャベツ'],
        ['ゆで卵', '生卵'],
        ['かき氷', 'アイスクリーム'],
        ['スイカ', 'メロン'],
        ['お茶漬け', 'ふりかけ'],
        ['塩', '砂糖'],
        ['りんご', 'なし'],
        ['うどん', 'そうめん']
      ]
    },
    {
      id: 'general_hard',
      name: '一般（難しい）',
      pairs: [
        ['ポッキー', 'トッポ'],
        ['アンパン', 'あんまん'],
        ['幼稚園', '保育園'],
        ['ボールペン', 'シャープペン'],
        ['ファミチキ', 'からあげくん'],
        ['青', '水色'],
        ['ポイントカード', 'クレジットカード'],
        ['色鉛筆', 'クレヨン'],
        ['不倫', '浮気'],
        ['トマトパスタ', 'クリームパスタ'],
        ['餃子', 'シューマイ'],
        ['友達', '親友'],
        ['パチンコ', 'スロット'],
        ['石鹸', 'ハンドソープ'],
        ['レモン', 'グレープフルーツ'],
        ['スキー', 'スノボー'],
        ['コカコーラ', 'ペプシ'],
        ['野球', 'ソフトボール'],
        ['肉まん', 'ピザまん'],
        ['ポカリスエット', 'アクエリアス'],
        ['サッカー', 'ラグビー'],
        ['パンツ', '財布'],
        ['１億円', '１０００万円'],
        ['炎', '赤'],
        ['桃太郎', '鬼滅の刃'],
        ['時間', 'お金'],
        ['痴漢', '鬼ごっこ'],
        ['赤ちゃん', 'ハムスター'],
        ['ウォータースライダー', '流しそうめん'],
        ['母乳', '青汁（もしくは、豆乳か牛乳）'],
        ['恋人', 'おおきなぬいぐるみ'],
        ['荷物検査', '職務質問'],
        ['お好み焼き', 'ピザ'],
        ['リコーダー', 'ペロペロキャンディ'],
        ['アクリルスタンド', '将棋の駒'],
        ['残業', '転売'],
        ['ロボット', '幽霊'],
        ['ピアノ', 'パソコン'],
        ['サンタクロース', '忍者'],
        ['自転車', '冷蔵庫'],
        ['トランプ', 'スマホ'],
        ['コンビニ', '自動販売機'],
        ['プリン', '温泉卵']


      ]
    },
    {
      id: 'anime_game',
      name: 'アニメ・ゲーム',
      pairs: [
          ['ドラえもん', 'アンパンマン'],
          ['ポケットモンスター', 'デジモン'],
          ['ピカチュウ', 'ミッキーマウス'],
          ['マリオ', 'ルイージ'],
          ['ドラゴンボール', 'ワンピース'],
          ['サザエさん', 'ちびまる子ちゃん'],
          ['トトロ', 'くまのプーさん'],
          ['名探偵コナン', '金田一少年の事件簿'],
          ['セーラームーン', 'プリキュア'],
          ['クレヨンしんちゃん', '天才バカボン'],
          ['ガンダム', 'エヴァンゲリオン'],
          ['ニンテンドースイッチ', 'プレイステーション'],
          ['ゲームボーイ', 'たまごっち'],
          ['ストリートファイター', 'スマッシュブラザーズ'],
          ['マインクラフト', 'レゴブロック'],
          ['どうぶつの森', 'たまごっち'],
          ['ハローキティ', 'マイメロディ'],
          ['ジブリ', 'ディズニー'],
          ['ルパン三世', '怪盗キッド'],
          ['太鼓の達人', 'ダンスダンスレボリューション'],
          ['ピカチュウ', 'くまのプーさん']
      ]
    },
    {
      id: 'love',
      name: '男女',
      pairs: [
        ['片思い', '失恋'],
        ['ファーストキス', '初デート'],
        ['LINEで告白', '手紙で告白'],
        ['束縛系', 'ストーカー'],
        ['筋肉フェチ', '手フェチ'],
        ['声フェチ', '匂いフェチ'],
        ['高収入の異性', '高身長の異性'],
        ['誠実な恋人', '優しい恋人'],
        ['好みの顔の異性', '好みの体系の異性'],
        ['金銭感覚が合う', '趣味が合う'],
        ['笑顔が素敵な異性', 'ユーモアがある異性'],
        ['肉食男子', '草食男子'],
        ['水族館デート', '動物園デート'],
        ['カラオケデート', '映画館デート'],
        ['花畑デート', '牧場デート'],
        ['浮気', '性格の不一致'],
        ['結婚', '同棲'],
        ['約束を破る恋人', '悪口を言う恋人'],
        ['煙草をたくさん吸う異性', 'お酒をたくさん飲む異性'],
        ['浪費癖がある恋人', 'スマホ中毒の恋人'],
        ['社内恋愛', '校内恋愛'],
        ['話しが合う異性', 'ユーモアがある異性'],
        ['制服デート', '浴衣デート'],
        ['誕生日プレゼント', 'サプライズプレゼント'],
        ['かわいい系', 'キレイ系'],
        ['ツンデレ', 'ヤンデレ'],
        ['母乳', '牛乳'],
        ['パンツ', '財布'],
        ['初めてのおつかい', '初めてのキス'],
        ['盆踊り', 'ラジオ体操'],
        ['かくれんぼ', '痴漢'],
        ['トランクス', 'ブリーフ'],
        ['おなら', 'しゃっくり'],
        ['1億円貰ったら', '10万円貰ったら'],
        ['絵本', 'エロ本']
      ]
    },
    {
      id: 'shimoneta',
      name: 'ド下ネタ',
      pairs: [
        ['スパンキング', 'ピアッシング'],
        ['口内射精', '顔射'],
        ['乱交', '公開プレイ'],
        ['裸ネクタイ', '裸靴下'],
        ['早漏', '絶倫'],
        ['催眠', '睡眠姦'],
        ['嘔吐', '放尿'],
        ['乗馬マシン', '三角木馬'],
        ['青姦', '痴漢'],
        ['鼻水', '涎'],
        ['セルフフェラ', 'アナニー'],
        ['足コキ', '手コキ'],
        ['スライム姦', '触手姦'],
        ['パンツ', '靴下'],
        ['セックス', 'スポーツ'],
        ['竿', '金玉'],
        ['BL', 'AV'],
        ['早漏', '頻尿'],
        ['ローション', '我慢汁'],
      ]
    }
  ];

  function getCategoryById(id) {
    for (var i = 0; i < TOPIC_CATEGORIES.length; i++) {
      if (TOPIC_CATEGORIES[i].id === id) return TOPIC_CATEGORIES[i];
    }
    return TOPIC_CATEGORIES[0];
  }

  function pickRandomPair(categoryId) {
    var cat = getCategoryById(categoryId);
    var pairs = (cat && cat.pairs) || [];
    if (!pairs.length) throw new Error('候補がありません');
    var idx = Math.floor(Math.random() * pairs.length);
    var pair = pairs[idx];
    if (Math.random() < 0.5) return { category: cat, majority: pair[0], minority: pair[1] };
    return { category: cat, majority: pair[1], minority: pair[0] };
  }

  function pickRandomPairAny() {
    if (!TOPIC_CATEGORIES.length) throw new Error('候補がありません');
    var idx = Math.floor(Math.random() * TOPIC_CATEGORIES.length);
    return pickRandomPair(TOPIC_CATEGORIES[idx].id);
  }

  // -------------------- firebase (compat scripts) --------------------
  var LS_KEY = 'ww_firebase_config_v1';

  function trimString(v) {
    return String(v == null ? '' : v).replace(/^\s+|\s+$/g, '');
  }

  function normalizeDatabaseURL(input) {
    var url = trimString(input);
    if (!url) return '';
    // Remove trailing slashes
    while (url.length > 1 && url.charAt(url.length - 1) === '/') url = url.slice(0, -1);
    return url;
  }

  function isValidDatabaseURL(url) {
    var u = normalizeDatabaseURL(url);
    if (!u) return false;
    // Must be https://<host>(/...)
    if (u.indexOf('https://') !== 0) return false;
    var rest = u.slice('https://'.length);
    var slash = rest.indexOf('/');
    var host = slash >= 0 ? rest.slice(0, slash) : rest;
    if (!host) return false;

    // Realtime Database URLs (old + new)
    // - https://<project>.firebaseio.com
    // - https://<project>-default-rtdb.firebaseio.com
    // - https://<project>-default-rtdb.<region>.firebasedatabase.app
    var h = host.toLowerCase();
    if (h.indexOf('firebaseio.com') >= 0 && h !== 'firebaseio.com') return true;
    if (h.indexOf('firebasedatabase.app') >= 0 && h !== 'firebasedatabase.app') return true;
    return false;
  }

  function ensureValidDatabaseURLOrThrow(url) {
    var normalized = normalizeDatabaseURL(url);
    if (!isValidDatabaseURL(normalized)) {
      throw new Error(
        'databaseURL の形式が正しくありません。Realtime Database のURLを https:// から貼り付けてください。\n例: https://<プロジェクト>.firebaseio.com\n例: https://<プロジェクト>-default-rtdb.<リージョン>.firebasedatabase.app'
      );
    }
    return normalized;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Failed to load: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function saveFirebaseConfigToLocalStorage(config) {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  }

  function loadFirebaseConfigFromLocalStorage() {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  var _dbReady = null;

  function firebaseReady() {
    if (_dbReady) return _dbReady;

    _dbReady = Promise.resolve()
      .then(function () {
        var firebaseConfig = window.firebaseConfig || loadFirebaseConfigFromLocalStorage();
        if (!firebaseConfig || !firebaseConfig.apiKey) {
          throw new Error('Firebase設定がありません。?screen=setup で設定してください。');
        }
        if (!firebaseConfig.databaseURL) {
          throw new Error('Firebase設定に databaseURL がありません。');
        }

        // Normalize & validate early to avoid confusing SDK errors.
        firebaseConfig.databaseURL = ensureValidDatabaseURLOrThrow(firebaseConfig.databaseURL);
        return firebaseConfig;
      })
      .then(function (firebaseConfig) {
        return loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js')
          .then(function () {
            return loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js');
          })
          .then(function () {
            firebase.initializeApp(firebaseConfig);
            var db = firebase.database();

            // Keep an approximate server clock for consistent timers across devices.
            try {
              db.ref('.info/serverTimeOffset').on('value', function (snap) {
                var v = snap && snap.val ? snap.val() : 0;
                _serverTimeOffsetMs = parseIntSafe(v, 0) || 0;
              });
            } catch (e) {
              // ignore
            }

            return db;
          });
      });

    return _dbReady;
  }

  function dbRef(path) {
    return firebaseReady().then(function (db) {
      return db.ref(path);
    });
  }

  function onValue(path, cb) {
    return dbRef(path).then(function (ref) {
      var handler = function (snap) {
        cb(snap.val());
      };
      ref.on('value', handler);
      return function () {
        ref.off('value', handler);
      };
    });
  }

  function getValueOnce(path) {
    return dbRef(path).then(function (ref) {
      return ref.once('value').then(function (snap) {
        return snap.val();
      });
    });
  }

  function setValue(path, value) {
    return dbRef(path).then(function (ref) {
      return ref.set(value);
    });
  }

  function runTxn(path, updateFn) {
    return dbRef(path)
      .then(function (ref) {
        return ref.transaction(function (current) {
          return updateFn(current);
        });
      })
      .then(function (res) {
        return res.snapshot.val();
      });
  }

  // -------------------- auto-cleanup old rooms --------------------
  // 古いルーム（デフォルト7日以上前）を自動削除
  var CLEANUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7日
  var CLEANUP_LS_KEY = 'bbg_last_cleanup_v1';
  var CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1日に1回まで実行

  function shouldRunCleanup() {
    try {
      var last = parseInt(localStorage.getItem(CLEANUP_LS_KEY) || '0', 10) || 0;
      return nowMs() - last > CLEANUP_INTERVAL_MS;
    } catch (e) {
      return false;
    }
  }

  function markCleanupDone() {
    try {
      localStorage.setItem(CLEANUP_LS_KEY, String(nowMs()));
    } catch (e) {
      // ignore
    }
  }

  function cleanupOldRooms() {
    if (!shouldRunCleanup()) return Promise.resolve();

    var paths = ['rooms', 'codenamesRooms', 'loveletterRooms', 'hanninRooms', 'oekakiRooms', 'oekakiRelayRooms', 'lobbies'];
    var cutoff = nowMs() - CLEANUP_MAX_AGE_MS;

    return firebaseReady()
      .then(function (db) {
        var promises = paths.map(function (basePath) {
          return db
            .ref(basePath)
            .orderByChild('createdAt')
            .endAt(cutoff)
            .once('value')
            .then(function (snap) {
              var val = snap.val();
              if (!val) return Promise.resolve();
              var deletePromises = [];
              Object.keys(val).forEach(function (key) {
                // '_'で始まるキーは設定用ノード（例: lobbies/_config）なので削除しない
                if (String(key).charAt(0) === '_') return;
                deletePromises.push(db.ref(basePath + '/' + key).remove());
              });
              return Promise.all(deletePromises);
            })
            .catch(function (e) {
              // クエリ失敗時は無視（indexがない場合など）
              try {
                if (typeof console !== 'undefined' && console.warn) {
                  console.warn('cleanup failed for ' + basePath, e);
                }
              } catch (e2) {
                // ignore
              }
              return Promise.resolve();
            });
        });
        return Promise.all(promises);
      })
      .then(function () {
        markCleanupDone();
      })
      .catch(function (e) {
        // Firebase接続失敗時は無視
        try {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('cleanup skipped', e);
          }
        } catch (e2) {
          // ignore
        }
      });
  }

  // -------------------- state --------------------
  function getUrlState() {
    var q = parseQuery();
    var roomId = q.room ? String(q.room) : '';
    var isHost = q.host === '1';
    return { roomId: roomId, isHost: isHost };
  }

  function makeRoomId() {
    return randomId(8);
  }

  function getOrCreatePlayerId(roomId) {
    var key = 'ww_player_' + roomId;
    var id = localStorage.getItem(key);
    if (!id) {
      id = randomId(12);
      localStorage.setItem(key, id);
    }
    return id;
  }

  function setPlayerId(roomId, playerId) {
    var key = 'ww_player_' + roomId;
    localStorage.setItem(key, String(playerId || ''));
  }

  function touchPlayer(roomId, playerId) {
    var path = playerPath(roomId, playerId);
    return runTxn(path, function (p) {
      if (!p) return p;
      return assign({}, p, { lastSeenAt: serverNowMs() });
    });
  }

  function roomPath(roomId) {
    return 'rooms/' + roomId;
  }

  function playerPath(roomId, playerId) {
    return 'rooms/' + roomId + '/players/' + playerId;
  }

  // -------------------- codenames (state) --------------------
  function getOrCreateCodenamesPlayerId(roomId) {
    var key = 'cn_player_' + roomId;
    var id = localStorage.getItem(key);
    if (!id) {
      id = randomId(12);
      localStorage.setItem(key, id);
    }
    return id;
  }

  function setCodenamesPlayerId(roomId, playerId) {
    var key = 'cn_player_' + roomId;
    localStorage.setItem(key, String(playerId || ''));
  }

  function codenamesRoomPath(roomId) {
    return 'codenamesRooms/' + roomId;
  }

  function codenamesPlayerPath(roomId, playerId) {
    return codenamesRoomPath(roomId) + '/players/' + playerId;
  }

  function subscribeCodenamesRoom(roomId, cb) {
    return onValue(codenamesRoomPath(roomId), cb);
  }

  // -------------------- loveletter (state) --------------------
  function getOrCreateLoveLetterPlayerId(roomId) {
    var key = 'll_player_' + roomId;
    var id = localStorage.getItem(key);
    if (!id) {
      id = randomId(12);
      localStorage.setItem(key, id);
    }
    return id;
  }

  function setLoveLetterPlayerId(roomId, playerId) {
    var key = 'll_player_' + roomId;
    localStorage.setItem(key, String(playerId || ''));
  }

  function touchLoveLetterPlayer(roomId, playerId) {
    var path = loveletterRoomPath(roomId) + '/players/' + playerId;
    return runTxn(path, function (p) {
      if (!p) return p;
      return assign({}, p, { lastSeenAt: serverNowMs() });
    });
  }

  function loveletterRoomPath(roomId) {
    return 'loveletterRooms/' + roomId;
  }

  function loveletterPlayerPath(roomId, playerId) {
    return loveletterRoomPath(roomId) + '/players/' + playerId;
  }

  function subscribeLoveLetterRoom(roomId, cb) {
    return onValue(loveletterRoomPath(roomId), cb);
  }
  
  // -------------------- hannin (state) --------------------
  function hanninRoomPath(roomId) {
    return 'hanninRooms/' + roomId;
  }

  function isDevDebugSite() {
    try {
      var h = String((location && location.hostname) || '');
      var p = String((location && location.pathname) || '');
      if (h === 'localhost' || h === '127.0.0.1') return true;
      if (p.indexOf('B_BoardGames-dev') >= 0) return true;
    } catch (e) {
      // ignore
    }
    return false;
  }
  
  function subscribeHanninRoom(roomId, cb) {
    return onValue(hanninRoomPath(roomId), cb);
  }

  // -------------------- oekaki battle (state) --------------------
  function oekakiRoomPath(roomId) {
    return 'oekakiRooms/' + roomId;
  }

  function subscribeOekakiRoom(roomId, cb) {
    return onValue(oekakiRoomPath(roomId), cb);
  }

  // -------------------- oekaki battle relay (state) --------------------
  // リレーモードは2人専用・非同期。ロビーを使わず、URLを手渡しして交互に進める。
  // スロットは 'a'（ホスト=先攻）と 'b'（挑戦者=後攻）の2つ固定。
  function oekakiRelayRoomPath(roomId) {
    return 'oekakiRelayRooms/' + roomId;
  }

  function subscribeOekakiRelayRoom(roomId, cb) {
    return onValue(oekakiRelayRoomPath(roomId), cb);
  }

  // -------------------- shared (persisted name) --------------------
  var BBG_NAME_KEY = 'bbg_name_v1';
  var BBG_ACTIVE_LOBBY_KEY = 'bbg_active_lobby_v1';
  var BBG_RESTRICTED_KEY = 'bbg_restricted_v1';

  function loadPersistedName() {
    try {
      return String(localStorage.getItem(BBG_NAME_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function savePersistedName(name) {
    var nm = String(name || '').trim();
    try {
      if (!nm) localStorage.removeItem(BBG_NAME_KEY);
      else localStorage.setItem(BBG_NAME_KEY, nm);
    } catch (e) {
      // ignore
    }
  }

  function setActiveLobby(lobbyId, restricted) {
    var id = String(lobbyId || '').trim();
    try {
      if (!id) {
        localStorage.removeItem(BBG_ACTIVE_LOBBY_KEY);
        localStorage.removeItem(BBG_RESTRICTED_KEY);
        return;
      }
      localStorage.setItem(BBG_ACTIVE_LOBBY_KEY, id);
      localStorage.setItem(BBG_RESTRICTED_KEY, restricted ? '1' : '0');
    } catch (e) {
      // ignore
    }
  }

  function loadActiveLobbyId() {
    try {
      return String(localStorage.getItem(BBG_ACTIVE_LOBBY_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function isRestrictedDevice() {
    try {
      return String(localStorage.getItem(BBG_RESTRICTED_KEY) || '') === '1';
    } catch (e) {
      return false;
    }
  }

  function shouldShowBackNav() {
    try {
      return !(loadActiveLobbyId() && isRestrictedDevice());
    } catch (e) {
      return true;
    }
  }

  function stripBackNavLinks(rootEl) {
    if (!rootEl) return;
    if (shouldShowBackNav()) return;
    try {
      var links = rootEl.querySelectorAll ? rootEl.querySelectorAll('a.btn.ghost') : [];
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (!a) continue;
        var href = '';
        try {
          href = String(a.getAttribute('href') || '');
        } catch (e1) {
          href = '';
        }
        if (href !== './') continue;
        var txt = '';
        try {
          txt = String(a.textContent || '').trim();
        } catch (e2) {
          txt = '';
        }
        if (txt !== '戻る' && txt !== 'ホーム') continue;
        try {
          if (a.parentNode) a.parentNode.removeChild(a);
        } catch (e3) {
          try {
            a.style.display = 'none';
          } catch (e4) {
            // ignore
          }
        }
      }
    } catch (e0) {
      // ignore
    }
  }

  // -------------------- lobby (state) --------------------
  function lobbyPath(lobbyId) {
    return 'lobbies/' + lobbyId;
  }

  function subscribeLobby(lobbyId, cb) {
    return onValue(lobbyPath(lobbyId), cb);
  }

  function getOrCreateLobbyMemberId(lobbyId) {
    var key = 'bbg_lobby_member_' + lobbyId;
    var id = '';
    try {
      id = localStorage.getItem(key);
    } catch (e) {
      id = '';
    }
    if (!id) {
      id = randomId(12);
      try {
        localStorage.setItem(key, id);
      } catch (e2) {
        // ignore
      }
    }
    return id;
  }

  // -------------------- lobby index (home画面の「ひらいているロビー」一覧用) --------------------
  // DBルールがパス列挙型（lobbies/$id 単位の許可）でも読めるように、
  // 一覧用の軽量インデックスを lobbies/_index/<id> に保持する（_始まりはcleanup対象外）。
  var LOBBY_INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // これより古いインデックスは掃除する

  function lobbyIndexPath(lobbyId) {
    return 'lobbies/_index/' + lobbyId;
  }

  function updateLobbyIndex(lobbyId, lobby) {
    try {
      if (!lobbyId || !lobby) return Promise.resolve();
      var members = lobby.members || {};
      var entry = {
        createdAt: parseIntSafe(lobby.createdAt, 0) || serverNowMs(),
        updatedAt: serverNowMs(),
        kind: lobby.currentGame && lobby.currentGame.kind ? String(lobby.currentGame.kind) : '',
        names: lobbyMemberNamesText(lobby, 8),
        count: Object.keys(members).length,
        hostMid: String(lobby.hostMid || ''),
        mids: Object.keys(members).join(',')
      };
      return setValue(lobbyIndexPath(lobbyId), entry).catch(function () {
        // インデックス更新失敗は本体の動作に影響させない
      });
    } catch (e) {
      return Promise.resolve();
    }
  }

  function pruneLobbyIndex(all) {
    // ついで掃除: 古いインデックスを削除（失敗は無視）。
    try {
      if (!all || typeof all !== 'object') return;
      var now = serverNowMs();
      for (var id in all) {
        if (!hasOwn.call(all, id)) continue;
        var e = all[id] || {};
        var t = Math.max(parseIntSafe(e.updatedAt, 0), parseIntSafe(e.createdAt, 0));
        if (t && now - t > LOBBY_INDEX_MAX_AGE_MS) {
          setValue(lobbyIndexPath(String(id)), null).catch(function () {
            // ignore
          });
        }
      }
    } catch (e0) {
      // ignore
    }
  }

  function createLobby(lobbyId, hostName, isGmDevice, nonce, joinAsMember) {
    var shouldJoin = joinAsMember == null ? true : !!joinAsMember;
    var nm = String(hostName || '').trim();
    if (shouldJoin && !nm) return Promise.reject(new Error('名前を入力してください。'));

    var mid = getOrCreateLobbyMemberId(lobbyId);
    var now = serverNowMs ? serverNowMs() : Date.now();

    return runTxn(lobbyPath(lobbyId), function (current) {
      if (current) return current;
      var lobby = {
        createdAt: now,
        nonce: String(nonce || ''),
        hostMid: mid,
        members: {},
        order: [],
        currentGame: null
      };
      if (shouldJoin) {
        lobby.order = [mid];
        lobby.members[mid] = { name: nm, joinedAt: now, isGmDevice: !!isGmDevice, lastSeenAt: now };
      }
      return lobby;
    }).then(function (lobby) {
      try {
        // 自分が作成したロビーのときだけインデックスを書く（衝突時の上書きを避ける）。
        if (lobby && String(lobby.nonce || '') === String(nonce || '')) updateLobbyIndex(lobbyId, lobby);
      } catch (eIdx) {
        // ignore
      }
      return lobby;
    });
  }

  function joinLobbyMember(lobbyId, memberId, name, isGmDevice) {
    var nm = String(name || '').trim();
    if (!nm) return Promise.reject(new Error('名前を入力してください。'));
    var mid = String(memberId || '').trim();
    if (!mid) return Promise.reject(new Error('参加に失敗しました（ID不正）'));
    var now = serverNowMs ? serverNowMs() : Date.now();

    return runTxn(lobbyPath(lobbyId), function (current) {
      if (!current) return current;
      if (!current.members) current.members = {};
      if (!current.order || !Array.isArray(current.order)) current.order = [];

      if (!current.members[mid]) {
        current.members[mid] = { name: nm, joinedAt: now, lastSeenAt: now };
      } else {
        current.members[mid].name = nm;
        current.members[mid].lastSeenAt = now;
      }

      if (!!isGmDevice) current.members[mid].isGmDevice = true;
      else {
        try {
          if (current.members[mid] && current.members[mid].isGmDevice) delete current.members[mid].isGmDevice;
        } catch (eDel) {
          // ignore
        }
      }

      var exists = false;
      for (var i = 0; i < current.order.length; i++) {
        if (String(current.order[i]) === mid) {
          exists = true;
          break;
        }
      }
      if (!exists) current.order.push(mid);
      return current;
    }).then(function (lobby) {
      if (!lobby) throw new Error('ロビーが見つかりません');
      try {
        updateLobbyIndex(lobbyId, lobby);
      } catch (eIdx) {
        // ignore
      }
      return lobby;
    });
  }

  function setLobbyOrder(lobbyId, nextOrder) {
    if (!Array.isArray(nextOrder)) return Promise.reject(new Error('順番が不正です'));
    return setValue(lobbyPath(lobbyId) + '/order', nextOrder);
  }

  function setLobbyCurrentGame(lobbyId, currentGame) {
    var cg = currentGame || null;
    return runTxn(lobbyPath(lobbyId), function (lobby) {
      if (!lobby) return lobby;
      var next = assign({}, lobby, { currentGame: cg });
      try {
        if (cg && cg.kind) {
          next.lastKind = String(cg.kind || '');
          next.lastGameAt = serverNowMs();
        }
      } catch (e) {
        // ignore
      }
      return next;
    }).then(function (lobby) {
      try {
        if (lobby) updateLobbyIndex(lobbyId, lobby);
      } catch (eIdx) {
        // ignore
      }
      return lobby;
    });
  }

  function setLobbyLoveLetterExtraCards(lobbyId, extraCards) {
    var nextExtras = [];
    try {
      nextExtras = llNormalizeExtraCards(extraCards);
    } catch (e0) {
      nextExtras = [];
    }
    return setValue(lobbyPath(lobbyId) + '/loveletterExtraCards', nextExtras);
  }

  function setLobbyWordwolfSettings(lobbyId, settings) {
    var s = settings && typeof settings === 'object' ? settings : {};
    var out = {
      minorityCount: clamp(parseIntSafe(s.minorityCount, 1), 1, 5),
      talkSeconds: clamp(parseIntSafe(s.talkSeconds, 180), 60, 10 * 60),
      topicCategoryId: String(s.topicCategoryId || 'random'),
      updatedAt: serverNowMs()
    };
    return setValue(lobbyPath(lobbyId) + '/wordwolfSettings', out);
  }

  function setLobbyCodenamesAssign(lobbyId, memberId, team, role) {
    var mid = String(memberId || '').trim();
    if (!mid) return Promise.reject(new Error('ID不正'));
    var t = team === 'red' || team === 'blue' ? team : '';
    var r = role === 'spymaster' || role === 'operative' ? role : '';
    var path = lobbyPath(lobbyId) + '/codenamesAssign/' + mid;
    return runTxn(path, function (cur) {
      var base = cur && typeof cur === 'object' ? cur : {};
      return assign({}, base, { team: t, role: r, updatedAt: serverNowMs() });
    });
  }

  function setLobbyCodenamesAssignBulk(lobbyId, assignMap) {
    var m = assignMap && typeof assignMap === 'object' ? assignMap : {};
    return setValue(lobbyPath(lobbyId) + '/codenamesAssign', m);
  }

  function normalizeOekakiLobbySettings(s) {
    var o = s && typeof s === 'object' ? s : {};
    var mode = o.topicMode === 'custom' ? 'custom' : 'random';
    var age = o.topicAge === 'kids' || o.topicAge === 'adult' ? String(o.topicAge) : 'school';
    return {
      drawSeconds: clamp(parseIntSafe(o.drawSeconds, 90), 30, 600),
      topicMode: mode,
      topicAge: age,
      customTopic: String(o.customTopic || '')
    };
  }

  function setLobbyOekakiSettings(lobbyId, settings) {
    var out = normalizeOekakiLobbySettings(settings);
    out.updatedAt = serverNowMs();
    return setValue(lobbyPath(lobbyId) + '/oekakiSettings', out);
  }

  function parseWordListText(text) {
    var s = String(text || '');
    s = s.replace(/\r\n/g, '\n');
    s = s.replace(/\r/g, '\n');
    // accept newline / comma / Japanese comma / tab
    var parts = s.split(/[\n,、\t]+/);
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var w = String(parts[i] || '').trim();
      if (!w) continue;
      if (seen[w]) continue;
      seen[w] = true;
      out.push(w);
    }
    return out;
  }

  // Built-in word pool for Codenames (no in-app word registration).
  var CODENAMES_WORDS = [
    '会議',
    '麻痺',
    '消しゴム',
    '筆',
    'たいあたり',
    'なめくじ',
    '熱帯夜',
    'えんぴつ',
    '鉛',
    '賢者',
    '霊',
    '気球',
    'エルフ',
    'たんぽぽ',
    '乗客',
    'ごはん',
    '焼き肉',
    'トランクス',
    '虫歯',
    '入れ歯',
    '写真',
    'ウエハース',
    'モーニング',
    'ミッション',
    'リュック',
    'マジック',
    'サプリメント',
    '箸',
    '電気',
    '北朝鮮',
    'アウェイ',
    '老眼',
    '視力',
    '反省会',
    '魔法使い',
    '僧侶',
    '戦士',
    '武闘家',
    '舞台',
    'マッスル',
    '筋肉',
    '咳',
    'サウナ',
    '麻薬',
    '税金',
    '女優',
    '歌手',
    'タレント',
    'お洒落',
    '砂漠',
    '原始人',
    'バンザイ',
    'エコ',
    '発表会',
    'ＡＩ',
    '運動会',
    '遠足',
    'スマホ',
    'テレビ',
    '電話',
    'リモコン',
    'リモート',
    'キックボード',
    '原付',
    'カッター',
    'ハサミ',
    '羊',
    '扇風機',
    '肩凝り',
    '約束',
    '頭痛',
    'オンライン',
    'カーテン',
    'カードゲーム',
    '消毒',
    'アルコール',
    'ゴキブリ',
    'カブトムシ',
    'カタツムリ',
    'クワガタ',
    'セミ',
    'おじいちゃん',
    'カマキリ',
    '幼虫',
    '封筒',
    '納豆',
    'ネギ',
    '缶詰',
    '抽選',
    '宝くじ',
    'コンプレックス',
    '負債',
    '悩み',
    '肩車',
    'コンテスト',
    '魔法陣',
    '召喚',
    '悪魔',
    'ブラシ',
    '下水',
    '北海道',
    'ハッタリ',
    'はまぐり',
    'イチゴ',
    '宿題',
    'アウトドア',
    '七五三',
    '袴',
    'ボージョレ・ヌーボー',
    '辞典',
    '掲示板',
    'やまんば',
    '魔法少女',
    '無制限',
    'ウクレレ',
    'フラダンス',
    'ステーキ',
    'パニック',
    '習い事',
    'レンタカー',
    '電光石火',
    'ショック',
    '運転手',
    'パイオニア',
    '迷路',
    'メデューサ',
    '防水',
    '回覧板',
    'お地蔵様',
    'コンパクト',
    '努力',
    '渡り鳥',
    '権利',
    '肥料',
    '神社',
    '神殿',
    'プリンター',
    'ものまね',
    '占い',
    '漫画家',
    'アスリート',
    'エンジニア',
    'アシスタント',
    'UFO',
    '博士',
    'ギャグ',
    '画家',
    '無双',
    '気圧',
    '映え',
    '暇つぶし',
    'おうち時間',
    'ドライブレコーダー',
    'オーディション',
    'クラウドファンディング',
    '不倫',
    '防災グッズ',
    'ちゃぶ台',
    '矯正',
    '経営',
    '絶縁',
    '小判',
    '懸賞',
    '個人情報',
    'おみくじ',
    'タピオカ',
    'テレポート',
    'DNA',
    '暗黒',
    '血液',
    'モニター',
    '蛍光',
    'ホタル',
    'スキル',
    '派閥',
    'デラックス',
    '投資',
    'フリー',
    '出張',
    'お年玉',
    'おせち',
    '年賀状',
    'だるま落とし',
    '習字',
    'コマ',
    'けん玉',
    'ダーツ',
    'ボーリング',
    'ビリヤード',
    'ハンガー',
    '仮面',
    '注射',
    'エレベーター',
    '給食',
    'レポート',
    'どんぐり',
    '紅葉',
    '栗',
    '新生活',
    '入学',
    '双子',
    '親戚',
    'ホッカイロ',
    '赤ちゃん',
    '父',
    '飢餓',
    '湿度',
    'カビ',
    '温度',
    '熱',
    '型',
    'トリガー',
    'インプット',
    '抹茶',
    'モンブラン',
    'コーラ',
    '電子決済',
    'クレジットカード',
    'シフト',
    'ダイナマイト',
    'バカンス',
    '沖縄',
    'もずく',
    'ダイビング',
    'スノボー',
    'リフト',
    'ハイキング',
    '変装',
    '試験',
    '拳銃',
    '妨害',
    'タイマー',
    '黒幕',
    '術',
    '異世界',
    'ラブコメ',
    '恋人',
    '告白',
    'ラブレター',
    'デリバリー',
    '地上',
    '空',
    '敏感',
    '鈍感',
    '反射',
    'センサー',
    '怪物',
    'タヌキ',
    '心',
    '精神',
    '欠陥',
    'カウントダウン',
    'シャンパン',
    'シェアハウス',
    'カウンター',
    '出会い',
    'ヒロイン',
    '心理戦',
    'デザイン',
    'タクシー',
    'オバケ',
    '輪ゴム',
    '輪投げ',
    '鉄棒',
    'ヨーヨー',
    'ヒヨコ',
    '明太子',
    '支配人',
    '尻',
    '腰',
    'かかと',
    '肘',
    '膝',
    '天狗',
    '団子',
    'ワンピース',
    'アプリ',
    'アイテム',
    '脳トレ',
    'サーフィン',
    'ビーチ',
    'ショッピング',
    '不動産',
    'お絵描き',
    '蛾',
    'フリスビー',
    'チアリーダー',
    '応援歌',
    '詩',
    '偽善者',
    '発射',
    'ビンタ',
    'メリケンサック',
    'リーゼント',
    'エスカレーター',
    '耳鼻科',
    'ソーラーパネル',
    '神出鬼没',
    'ミミズ',
    '市民',
    '摩擦',
    'マインド',
    'イラスト',
    'パントマイム',
    'コピー',
    'コント',
    '小説',
    'デザイナー',
    '農業',
    '声優',
    '埋蔵金',
    '通訳',
    'ダイエット',
    '影武者',
    'トイレ',
    'ディナー',
    'モテ期',
    'ヨガ',
    '商店街',
    'ドッキリ',
    'カリスマ',
    'マンガ喫茶',
    'じゃんけん',
    'グルメ',
    'スキャンダル',
    'ゴール',
    'ダミー',
    '姿勢',
    'フランチャイズ',
    'クリエイター',
    'ご褒美',
    '民泊',
    'キャッシュバック',
    'ゾロ目',
    'カロリー',
    'タイムマシン',
    'ネッシー',
    '武将',
    'カヌー',
    'かさぶた',
    '波',
    'クッション',
    'CM',
    '王子',
    'ドーパミン',
    'ハーバリウム',
    'カステラ',
    'ほうき',
    'ちりとり',
    'スコップ',
    '帽子',
    '竹',
    '自販機',
    'お茶漬け',
    'かき',
    'カタログ',
    'ギフト',
    'ゼリー',
    '塩辛',
    '花札',
    '雛人形',
    'ブーメラン',
    '高速道路',
    'パーマ',
    'リゾット',
    'おかゆ',
    'タバコ',
    '矢印',
    '目玉',
    '織姫',
    'きのこ',
    'セミナー',
    '餅',
    'モップ',
    'こたつ',
    'マッサージ',
    '流れ星',
    '通り魔',
    '事件',
    '花壇',
    '木彫り',
    '介護士',
    'パパラッチ',
    'パパイヤ',
    'パンケーキ',
    'パイナップル',
    '薬局',
    'アンテナ',
    'カーナビ',
    'スパム',
    'ロコモコ',
    'ボランティア',
    '団体',
    '湿布',
    'スチュワーデス',
    '社長',
    '監督',
    'スピーカー',
    'スピーチ',
    'ファラオ',
    'ドラキュラ',
    '執事',
    'メイド',
    '喫茶店',
    'オムライス',
    'ポスター',
    'ラジオ体操',
    '網',
    'プラモデル',
    'キツネ',
    '絨毯',
    'バレリーナ',
    '跳び箱',
    'リズム',
    '葉巻',
    'ドラマ',
    'ペットボトル',
    '駐車場',
    'テーブル',
    'ねじ',
    'プロレス',
    'プロフェッショナル',
    'プリン',
    'フラミンゴ',
    'メロディー',
    '珊瑚礁',
    'マグロ',
    '数珠',
    'キャラメル',
    'アーモンド',
    'ポテトサラダ',
    'おにぎり',
    'ツナ',
    'ガスバーナー',
    'バッシング',
    'ふりかけ',
    '指紋',
    '入れ墨',
    '銭湯',
    'コロシアム',
    'バジル',
    '脂肪',
    'おなか',
    '背中',
    '内蔵',
    'ウコン',
    'エキス',
    'ライセンス',
    'コンクリート',
    '倉庫',
    '補聴器',
    '墓地',
    'ぼったくり',
    '水泳',
    'シロップ',
    'モアイ',
    'グッズ',
    'ペンダント',
    '懐中電灯',
    '競馬',
    '定規',
    'コンパス',
    'スキップ',
    '水筒',
    '上司',
    '部下',
    '新入社員',
    '地平線',
    'フランケンシュタイン',
    '噂話',
    'スキンシップ',
    '東京タワー',
    '心臓',
    '防弾チョッキ',
    'ご当地キャラ',
    'シークヮーサー',
    'ハイビスカス',
    'K-POP',
    'コスメ',
    '万里の長城',
    'チャイナドレス',
    '小籠包',
    'エアーズロック',
    'ハンター',
    '旅行',
    '職業',
    '怪談',
    '湯気',
    'サンドイッチ',
    'ハプニング',
    '俳句',
    'テーマパーク',
    '天体観測',
    '事故',
    '大暴落',
    '賞金',
    '寄生虫',
    '自作',
    '炎上',
    'スイーツ',
    '深夜',
    'オーロラ',
    'あやとり',
    'オマケ',
    'ベストセラー',
    '日焼け止め',
    '叫び声',
    '傷',
    'めだか',
    'ダンベル',
    'トレーニング',
    'ウェア',
    'ブランド',
    '口紅',
    '指輪',
    'ネックレス',
    '研究',
    'テーマ',
    '実験',
    '法律',
    '平原',
    'ダニ',
    'ストーブ',
    'コウモリ',
    '将棋',
    '囲碁',
    '未来予知',
    'オセロ',
    'トランプ',
    'かるた',
    '通帳',
    'タイピング',
    'ソフト',
    '罰',
    '唐辛子',
    'ハンバーグ',
    '弁当',
    '箱',
    '屋台',
    '飴',
    'グミ',
    'エリア',
    'トラウマ',
    'ハッスル',
    'サビ',
    'たんこぶ',
    '甘酒',
    '饅頭',
    '鼻水',
    'にきび',
    'リサイクル',
    'パートナー',
    'フレンド',
    'マスター',
    'パズル',
    '煮干し',
    '出汁',
    'こんぶ',
    '水鉄砲',
    'ピーマン',
    'フライパン',
    'ブラック企業',
    '転職',
    'ヘッドハンティング',
    '体温計',
    'マイナスイオン',
    '積み木',
    'やかん',
    'ハイボール',
    '麻酔',
    'ココナッツ',
    'コインランドリー',
    'テレパシー',
    '保険',
    '朝市',
    'ハト',
    'バザー',
    'セール',
    '接待',
    '朝帰り',
    '四国',
    'ムエタイ',
    '空手',
    '柔道',
    '道着',
    '深呼吸',
    'チェリー',
    'うに',
    '礼儀',
    'エクササイズ',
    '終電',
    '梅干し',
    '酢',
    '三輪車',
    'シャボン玉',
    'ビジネス',
    'チャット',
    '花火',
    'ろうそく',
    'ラクダ',
    'ワニ',
    'にんじん',
    '信号',
    'アザラシ',
    'カレンダー',
    'ボンベ',
    'ヒマワリ',
    'チューリップ',
    'レンズ',
    '水着',
    '露天風呂',
    '泡',
    '兜',
    'レントゲン',
    'スマイル',
    'プレイヤー',
    '誕生日',
    'サプライズ',
    '年金',
    '粘土',
    '腱鞘炎',
    'インターネット',
    'インタビュー',
    '常連',
    'いたずら',
    '貯金',
    'アレルギー',
    '空き家',
    '職人',
    '火事',
    'ショートカット',
    '卒業',
    'お盆',
    'フェス',
    'コアラ',
    '変身',
    'ステッキ',
    'ミリオンヒット',
    'ちんすこう',
    '泡盛',
    'シーサー',
    'サーターアンダギー',
    '韓流',
    'サムギョプサル',
    'ビビンバ',
    'チヂミ',
    '冷麺',
    '三国志',
    'ハンドメイド',
    '料理家',
    '棋士',
    '給料日',
    '恩返し',
    '婚活',
    '交番',
    'VR',
    'ニート',
    'チャック',
    'メッセージ',
    '予言',
    '沈没船',
    'カメラ',
    'ラジカセ',
    'ターゲット',
    '思い出',
    'キャッシュレス',
    'くじ引き',
    '家庭菜園',
    '残像',
    'レシート',
    '大人買い',
    '別荘',
    '保湿',
    '冷房',
    '暖房',
    '空気清浄機',
    '蔵',
    '串',
    '枯れ葉',
    '傘',
    '誘拐',
    'コンビニ',
    '新幹線',
    '換気扇',
    'クイズ',
    'ヒール',
    '睡眠薬',
    'オーダー',
    'レンタル',
    'ファミレス',
    'チェーン',
    '神様',
    '大仏',
    '細胞',
    'パフェ',
    'かき氷',
    'サングラス',
    '磁石',
    'マント',
    'パソコン',
    'カラオケ',
    'マイク',
    'はてな',
    'ノスタルジー',
    '代表',
    '覗き',
    '目隠し',
    '魔王',
    '親衛隊',
    'ポケベル',
    '経験値',
    'ガムテープ',
    '段ボール',
    '切手',
    'たこ焼き',
    'お好み焼き',
    'キムチ',
    'うなぎ',
    'マンション',
    '暗号',
    'タオル',
    'サンダル',
    '新作',
    '税理士',
    'コントロール',
    'ひつまぶし',
    '割り勘',
    'おごり',
    'ジェル',
    '焚き火',
    '薪',
    'カスタマイズ',
    'ゴーヤ',
    'すき焼き',
    'スイートルーム',
    '天むす',
    'きしめん',
    'ういろう',
    '手羽先',
    'おでん',
    'みかん',
    'ドーム',
    '寝癖',
    'コンタクト',
    'シールド',
    'ヨット',
    '雲',
    'わた菓子',
    'フランクフルト',
    '焼きそば',
    '味噌',
    'ヨーグルト',
    '乙女',
    'セメント',
    '金髪',
    '白髪',
    '忠誠',
    '中古',
    '闇鍋',
    'ミキサー',
    '餃子',
    'しゃぶしゃぶ',
    '乳酸菌',
    'ループ',
    '力士',
    '木材',
    '接着剤',
    '溶接',
    '工事',
    'コイン',
    'クレヨン',
    'リコーダー',
    'ランドセル',
    '甲子園',
    '祭り',
    '人魚',
    'イカ',
    '大気圏',
    '隕石',
    '賄賂',
    '家紋',
    '花粉',
    '通路',
    'スライディング',
    'ハンドル',
    '原子力',
    '奴隷',
    '競り',
    'オークション',
    '無人',
    '卓球',
    'ダウンロード',
    'コンテンツ',
    'アウトプット',
    '仙人',
    '哺乳瓶',
    'おむつ',
    'ポーチ',
    'マフラー',
    'タンバリン',
    '手品',
    'ハンカチ',
    'ティッシュ',
    'ボックス',
    'ガチャ',
    'ブログ',
    'リメイク',
    '雑踏',
    'ザリガニ',
    'エビ',
    '暖炉',
    'ゲリラ',
    '発泡スチロール',
    '金属',
    '肝試し',
    '放火',
    '歯車',
    '副業',
    'フリーター',
    '布団',
    'ふるさと納税',
    'お祝い',
    '化石',
    'アカウント',
    '人気者',
    '家事',
    '和尚',
    '妖怪',
    'ノーベル賞',
    'CD',
    'アタック',
    'ストッパー',
    'トレーナー',
    'リフレッシュ',
    '模様替え',
    '移住',
    '形見',
    'フォロワー',
    '世界一周',
    'ワンオペ',
    '唐揚げ',
    'いかだ',
    'トランシーバー',
    '毛布',
    'ジャングルジム',
    'ブランコ',
    '滑り台',
    '絆創膏',
    'ストッキング',
    'リップ',
    'マシュマロ',
    '電子書籍',
    'マッチング',
    '基地',
    'アルバイト',
    'マヨネーズ',
    '怪盗',
    '殺人鬼',
    '脅迫',
    '念力',
    '移籍',
    '電池',
    'ノイズ',
    '畑',
    'ニュース',
    'ワクチン',
    'ウイルス',
    '配信',
    'キャンセル',
    'ポリシー',
    '都市',
    'ラーメン',
    'しょうが',
    'ニンニク',
    'うどん',
    'パスタ',
    '腐敗',
    '研修',
    '被害',
    '交渉',
    '更新',
    '感染',
    'パーフェクト',
    'トップ',
    '帰省',
    '健康診断',
    '充電',
    'エネルギー',
    '濃厚',
    '入院',
    'サーキット',
    'サーキュレーター',
    'ドーピング',
    'ドッペルゲンガー',
    '怪力',
    '呼吸',
    '酸素',
    '独裁者',
    '総理大臣',
    '大統領',
    '選挙',
    '出勤',
    'パジャマ',
    '空港',
    'ゴミ',
    'アイス',
    '包丁',
    '攻撃',
    '防御',
    '議論',
    '休暇',
    '映画',
    'ランニング',
    '散歩',
    '筋トレ',
    'プロテイン',
    '水分',
    '雨音',
    '眩暈',
    '海',
    '浮き輪',
    'ゴーグル',
    '地下',
    '人混み',
    'ブーム',
    '天然',
    'ストレス',
    '骨',
    '自宅',
    '異端',
    'サブカル',
    'ヤンデレ',
    'クソリプ',
    '焼き鳥',
    '八ツ橋',
    '金閣寺',
    '舞妓',
    '科学',
    'サブスク',
    'アパレル',
    '素材',
    '課金',
    'シャツ',
    'シャッフル',
    '落書き',
    '生命',
    '大阪',
    'メロン',
    'ジンギスカン',
    '通販',
    'アナウンス',
    '施設',
    '動物園',
    '水族館',
    '災害',
    '派遣',
    '台風',
    '自衛隊',
    'サラリーマン',
    '戦略',
    '安全',
    '避難',
    'カフェイン',
    'くぎ',
    'オリジナル',
    '透明',
    'エアコン',
    '冷蔵庫',
    '転生',
    '体質',
    '滝',
    '修行',
    'クーポン',
    '営業',
    '芸人',
    'スロット',
    '群れ',
    'バトル',
    '融合',
    '滑舌',
    'ひな祭り',
    'エイプリルフール',
    'ホワイト',
    '競合',
    '迷子',
    '爆笑',
    '倍返し',
    'ボーナス',
    '寝坊',
    'ファッション',
    'インドア',
    'ログイン',
    'おひとり様',
    'ビーム',
    '坊主',
    'アンバサダー',
    'アドレス',
    'DVD',
    '無料',
    'どんでん返し',
    '破局',
    '登山',
    '縁起物',
    '発明品',
    '悪夢',
    'ビンゴ',
    'クーリングオフ',
    'やんちゃ',
    '幻覚',
    'ATM',
    'なると',
    '七光り',
    '刺身',
    '継承',
    '品種改良',
    'シングル',
    'ライフ',
    'サポーター',
    'ファイナル',
    '馬車',
    'ステッカー',
    'ワッペン',
    'スクランブル',
    'スランプ',
    '後遺症',
    '更衣室',
    '好感度',
    '高所恐怖症',
    '突然変異',
    '景品',
    '電卓',
    '資格',
    'マニア',
    '免許証',
    'わびさび',
    'おもてなし',
    'スクープ',
    'ストイック',
    'フライング',
    '修羅場',
    'タブー',
    '観覧車',
    'ジェットコースター',
    'メリーゴーランド',
    'バンジージャンプ',
    'タスク',
    'オパール',
    'グアム',
    'ツアー',
    'ツーリング',
    '欲望',
    '嘘',
    'よいしょ',
    '幼稚園',
    '進化',
    '折り紙',
    '中学校',
    '小学校',
    '高校',
    '抜け殻',
    '冬眠',
    'おやじ',
    'プライド',
    '説教',
    'セーブ',
    'レア',
    '専門家',
    'カラコン',
    'ホームセンター',
    'カンニング',
    '転売',
    'ごぼう',
    '接続',
    'ハッキング',
    'たらこ',
    'たいやき',
    '出産',
    '育児',
    '教育',
    '再生',
    'たばこ',
    '疲労',
    'ハイブリッド',
    '復讐',
    'ハイスペック',
    '鬼ごっこ',
    'かくれんぼ',
    '縄跳び',
    'ドッジボール',
    'サッカー',
    'リフティング',
    'ドリブル',
    'ハンドボール',
    'アイスホッケー',
    'フェンシング',
    '勉強',
    '一夜漬け',
    '暗記',
    'ヒトデ',
    '手裏剣',
    '煙幕',
    'ピンチ',
    'パンチ',
    '放課後',
    '星座',
    '家庭教師',
    'ハンモック',
    '新鮮',
    'マウント',
    '首輪',
    '知育',
    '絵本',
    '解約',
    '基本',
    '装填',
    '寝言',
    'うまい棒',
    'ファミチキ',
    'ハーゲンダッツ',
    'ガリガリ君',
    'ポッキー',
    'UNO',
    '柿の種',
    'ヤクルト',
    '雪見だいふく',
    'ハッピーターン',
    'じゃがりこ',
    'コアラのマーチ',
    'かっぱえびせん',
    'どん兵衛',
    'ファブリーズ',
    'ファンタ',
    'フリスク',
    'ブラックサンダー',
    'ベビースターラーメン',
    'ジョージア',
    'カルピス',
    'ポカリスエット',
    'ハイチュウ',
    'シーチキン',
    'G-SHOCK',
    '氷結',
    '午後の紅茶',
    '綾鷹',
    'ラ王',
    'ウォークマン',
    'iPhone',
    'バブ',
    'カラムーチョ',
    'リポビタンD',
    'レッドブル',
    'ダイソン',
    'ルンバ',
    'プッチンプリン',
    'チロルチョコ',
    'きのこの山',
    'たけのこの里',
    'からあげクン',
    'フルグラ',
    'カロリーメイト',
    'レゴ',
    'サンデー',
    'マガジン',
    '野菜生活',
    'キットカット',
    'カップヌードル',
    'スターバックス',
    '任天堂',
    '楽天',
    'Google',
    'NIKE',
    'Yahoo',
    'マクドナルド',
    '吉野家',
    'ユニクロ',
    'トイザらス',
    'エルメス',
    'ゴディバ',
    'ケンタッキーフライドチキン',
    'ソフトバンク',
    'ドコモ',
    'au',
    '花王',
    'ドトール',
    'アサヒ',
    'サントリー',
    'ヤマハ',
    '無印良品',
    'モスバーガー',
    'コストコ',
    'ニトリ',
    'ダイソー',
    'ドン・キホーテ',
    'ヨドバシカメラ',
    'ヤマダ電機',
    'イオン',
    'セブンイレブン',
    'ファミマ',
    'ローソン',
    'ミニストップ',
    'CoCo壱番屋',
    'ガスト',
    'サイゼリヤ',
    '高島屋',
    '生協',
    'ヤマト運輸',
    '東急ハンズ',
    'ディズニーランド',
    'ユニバーサルスタジオ',
    'ANA',
    'JAL',
    'カルビー',
    'ソニー',
    'キャノン',
    'Netflix',
    '松屋',
    '丸亀製麺',
    'パナソニック',
    'ブックオフ',
    'すき家',
    'ミスタードーナツ',
    'IKEA',
    'ロッテリア',
    'Wikipedia',
    'Skype',
    'Twitter',
    'ニコニコ動画',
    'YouTube',
    'Facebook',
    'Instagram',
    'LINE',
    '食べログ',
    'ウーバーイーツ',
    'Zoom',
    'PayPay',
    'ホットペッパー',
    'メルカリ',
    'ドラクエ',
    'ポケモン',
    'カービィ',
    'マリオ',
    'ルイージ',
    'クッパ',
    'キノピオ',
    'ピカチュウ',
    'ヨッシー',
    'パックマン',
    'テトリス',
    'ぷよぷよ',
    'Switch',
    'プレイステーション',
    'マインクラフト',
    '一寸法師',
    'シンデレラ',
    '浦島太郎',
    'かぐや姫',
    '白雪姫',
    'ピーターパン',
    '赤ずきん',
    '三匹の子豚',
    'マッチ売りの少女',
    '3びきの子ぶた',
    'パトラッシュ',
    '一休さん',
    'ウルトラマン',
    '孫悟空',
    'ドラえもん',
    'アンパンマン',
    'サザエさん',
    'バイキンマン',
    'ミッキーマウス',
    'キティーちゃん',
    '仮面ライダー',
    'トトロ',
    'ちびまる子ちゃん',
    'コナン',
    '機関車トーマス',
    'のび太',
    'ルパン三世',
    'ゴジラ',
    'ゲゲゲの鬼太郎',
    'スヌーピー',
    'くまのプーさん',
    'ガンダム',
    'エヴァンゲリオン',
    'フック船長',
    'ジャイアン',
    'スネ夫',
    'ドラゴンボール',
    '鬼滅の刃',
    '天空の城ラピュタ',
    'ムスカ',
    '魔女の宅急便',
    'もののけ姫',
    'モンスターボール',
    'アトム',
    'くまモン',
    'スター・ウォーズ',
    'ハリー・ポッター',
    'スパイダーマン',
    'ターミネーター',
    'リラックマ',
    'ムーミン',
    'ミッフィ―',
    '風の谷のナウシカ',
    '貞子'
  ];

  function getCodenamesWordPool() {
    // dedupe while keeping insertion order
    var seen = {};
    var out = [];
    for (var i = 0; i < CODENAMES_WORDS.length; i++) {
      var w = String(CODENAMES_WORDS[i] || '').trim();
      if (!w) continue;
      if (seen[w]) continue;
      seen[w] = true;
      out.push(w);
    }
    return out;
  }

  function buildCodenamesKey(total, firstTeam) {
    var assassin = 1;
    var base = Math.floor((total - assassin) / 3);
    var first = base + 1;
    var second = base;
    var neutral = total - assassin - first - second;

    var arr = [];
    var i;
    if (firstTeam === 'blue') {
      for (i = 0; i < first; i++) arr.push('B');
      for (i = 0; i < second; i++) arr.push('R');
    } else {
      for (i = 0; i < first; i++) arr.push('R');
      for (i = 0; i < second; i++) arr.push('B');
    }
    for (i = 0; i < neutral; i++) arr.push('N');
    for (i = 0; i < assassin; i++) arr.push('A');

    for (var k = arr.length - 1; k > 0; k--) {
      var j = randomInt(k + 1);
      var tmp = arr[k];
      arr[k] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function pickCodenamesWords(pool, total) {
    var p = Array.isArray(pool) ? pool.slice() : [];
    for (var i = p.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    return p.slice(0, total);
  }

  function createCodenamesRoom(roomId, settings) {
    var base = codenamesRoomPath(roomId);
    var size = clamp(parseIntSafe(settings && settings.size, 5), 3, 8);
    var total = size * size;

    var timerNormalSec = clamp(parseIntSafe(settings && settings.timerNormalSec, 60), 60, 600);
    var timerFirstBonusSec = clamp(parseIntSafe(settings && settings.timerFirstBonusSec, 30), 0, 600);

    var firstTeam = randomInt(2) === 0 ? 'red' : 'blue';

    var pool = getCodenamesWordPool();
    if (!pool || pool.length < total) {
      throw new Error('ワードが足りません（最低 ' + total + ' 個必要）。');
    }

    var words = pickCodenamesWords(pool, total);
    if (!words || words.length < total) {
      throw new Error('ワードが足りません（最低 ' + total + ' 個必要）。');
    }

    var key = buildCodenamesKey(total, firstTeam);
    var revealed = [];
    for (var i = 0; i < total; i++) revealed.push(false);

    var remainRed = 0;
    var remainBlue = 0;
    for (var k = 0; k < key.length; k++) {
      if (key[k] === 'R') remainRed++;
      if (key[k] === 'B') remainBlue++;
    }

    var room = {
      createdAt: serverNowMs(),
      phase: 'lobby',
      settings: { size: size, timerNormalSec: timerNormalSec, timerFirstBonusSec: timerFirstBonusSec },
      board: {
        size: size,
        words: words,
        key: key,
        revealed: revealed
      },
      firstTeam: firstTeam,
      clueLog: [],
      turn: {
        team: firstTeam,
        status: 'awaiting_clue',
        guessesLeft: 0,
        clue: { word: '', number: 0, by: '', at: 0 },
        pending: {},
        turnNo: 0,
        startedAt: 0,
        endsAt: 0
      },
      progress: {
        redRemaining: remainRed,
        blueRemaining: remainBlue
      },
      result: { winner: '', finishedAt: 0, reason: '' },
      players: {}
    };
    return setValue(base, room);
  }

  function getCodenamesTimerNormalSec(room) {
    var s = room && room.settings ? room.settings : null;
    var n = clamp(parseIntSafe(s && s.timerNormalSec, 60), 60, 600);
    return n || 60;
  }

  function getCodenamesTimerFirstBonusSec(room) {
    var s = room && room.settings ? room.settings : null;
    var b = clamp(parseIntSafe(s && s.timerFirstBonusSec, 30), 0, 600);
    if (b == null || isNaN(b)) b = 30;
    return b;
  }

  function setCodenamesTimerSettings(roomId, normalSec, firstBonusSec) {
    var base = codenamesRoomPath(roomId);
    var n = clamp(parseIntSafe(normalSec, 60), 60, 600);
    var b = clamp(parseIntSafe(firstBonusSec, 30), 0, 600);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;
      var settings = assign({}, room.settings || {}, { timerNormalSec: n, timerFirstBonusSec: b });
      return assign({}, room, { settings: settings });
    });
  }

  function lockCodenamesLobbyForTimer(roomId) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var players = assign({}, room.players || {});
      var keys = Object.keys(players);
      for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        var p = players[id];
        if (!p) continue;
        // Lock only players who already completed selection.
        var hasPrefs = !!(p.team && p.role);
        players[id] = assign({}, p, { prefsLocked: hasPrefs ? true : !!p.prefsLocked });
      }

      return assign({}, room, { lobbyStage: 'timer', lobbyLockedAt: room.lobbyLockedAt || serverNowMs(), players: players });
    });
  }

  function applyLobbyCodenamesAssignToRoom(roomId, lobbyId) {
    var lid = String(lobbyId || '').trim();
    if (!lid) return Promise.resolve(null);
    return getValueOnce(lobbyPath(lid) + '/codenamesAssign')
      .catch(function () {
        return null;
      })
      .then(function (assignMap) {
        var map = assignMap && typeof assignMap === 'object' ? assignMap : {};
        return runTxn(codenamesRoomPath(roomId), function (room) {
          if (!room) return room;
          if (room.phase !== 'lobby') return room;

          var players = assign({}, room.players || {});
          var keys = Object.keys(players);
          for (var i = 0; i < keys.length; i++) {
            var pid = String(keys[i] || '');
            if (!pid) continue;
            var p = players[pid] || {};
            var a = map && map[pid] ? map[pid] : null;
            if (!a) continue;
            var t = a.team === 'red' || a.team === 'blue' ? String(a.team) : '';
            var r = a.role === 'spymaster' || a.role === 'operative' ? String(a.role) : '';
            players[pid] = assign({}, p, {
              team: t || String(p.team || ''),
              role: r || String(p.role || '')
            });
          }

          // Normalize: exactly one spymaster per team; others operative.
          function pickSpymaster(team) {
            var best = '';
            var bestJoined = 1e18;
            // Prefer lobby assign spymaster.
            for (var k = 0; k < keys.length; k++) {
              var pid2 = String(keys[k] || '');
              if (!pid2) continue;
              var p2 = players[pid2] || {};
              if (String(p2.team || '') !== String(team || '')) continue;
              var a2 = map && map[pid2] ? map[pid2] : null;
              if (!a2 || String(a2.role || '') !== 'spymaster') continue;
              var j2 = p2.joinedAt || 0;
              if (!best || j2 < bestJoined) {
                best = pid2;
                bestJoined = j2;
              }
            }
            if (best) return best;
            // Fallback: earliest-joined in team.
            for (var k2 = 0; k2 < keys.length; k2++) {
              var pid3 = String(keys[k2] || '');
              if (!pid3) continue;
              var p3 = players[pid3] || {};
              if (String(p3.team || '') !== String(team || '')) continue;
              var j3 = p3.joinedAt || 0;
              if (!best || j3 < bestJoined) {
                best = pid3;
                bestJoined = j3;
              }
            }
            return best;
          }

          var redSm = pickSpymaster('red');
          var blueSm = pickSpymaster('blue');

          for (var kk = 0; kk < keys.length; kk++) {
            var pid4 = String(keys[kk] || '');
            if (!pid4) continue;
            var p4 = players[pid4] || {};
            var tm = String(p4.team || '');
            if (tm !== 'red' && tm !== 'blue') continue;
            players[pid4] = assign({}, p4, { role: 'operative' });
          }
          if (redSm && players[redSm]) players[redSm] = assign({}, players[redSm], { role: 'spymaster' });
          if (blueSm && players[blueSm]) players[blueSm] = assign({}, players[blueSm], { role: 'spymaster' });

          return assign({}, room, { players: players, assignFromLobbyAt: room.assignFromLobbyAt || serverNowMs() });
        });
      });
  }

  function joinPlayerInCodenamesRoom(roomId, playerId, name, isHostPlayer) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var players = assign({}, room.players || {});
      var prev = players[playerId] || {};
      var next = assign({}, prev, {
        name: name,
        joinedAt: prev.joinedAt || serverNowMs(),
        lastSeenAt: serverNowMs(),
        team: prev.team || '',
        role: prev.role || '',
        prefsLocked: !!prev.prefsLocked
      });
      if (isHostPlayer) next.isHost = true;
      players[playerId] = next;
      return assign({}, room, { players: players });
    });
  }

  function setCodenamesPlayerPrefs(roomId, playerId, team, role) {
    var path = codenamesPlayerPath(roomId, playerId);
    return runTxn(path, function (p) {
      if (!p) return p;
      if (p.prefsLocked) return assign({}, p, { lastSeenAt: serverNowMs() });
      var t = team === 'red' || team === 'blue' ? team : '';
      var r = role === 'spymaster' || role === 'operative' ? role : '';
      return assign({}, p, { team: t, role: r, lastSeenAt: serverNowMs() });
    });
  }

  function setCodenamesPlayerProfile(roomId, playerId, name, team, role) {
    var path = codenamesPlayerPath(roomId, playerId);
    return runTxn(path, function (p) {
      if (!p) return p;
      var nm = String(name == null ? '' : name).trim();
      var t = team === 'red' || team === 'blue' ? team : '';
      var r = role === 'spymaster' || role === 'operative' ? role : '';
      return assign({}, p, { name: nm || p.name || '', team: t, role: r, lastSeenAt: serverNowMs() });
    });
  }

  function touchCodenamesPlayer(roomId, playerId) {
    var path = codenamesPlayerPath(roomId, playerId);
    return runTxn(path, function (p) {
      if (!p) return p;
      return assign({}, p, { lastSeenAt: serverNowMs() });
    });
  }

  function resetCodenamesToLobby(roomId) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;

      var players = assign({}, room.players || {});
      var keys = Object.keys(players);
      for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        var p = players[id];
        if (!p) continue;
        players[id] = assign({}, p, { team: '', role: '', prefsLocked: false });
      }

      var size = room && room.board && room.board.size ? room.board.size : (room.settings && room.settings.size ? room.settings.size : 5);
      var total = size * size;
      var revealed = [];
      for (var ri = 0; ri < total; ri++) revealed.push(false);

      var key = (room && room.board && room.board.key) || [];
      var remainRed = 0;
      var remainBlue = 0;
      for (var k = 0; k < key.length; k++) {
        if (key[k] === 'R') remainRed++;
        if (key[k] === 'B') remainBlue++;
      }

      return assign({}, room, {
        phase: 'lobby',
        lobbyStage: 'roles',
        lobbyLockedAt: 0,
        players: players,
        clueLog: [],
        turn: assign({}, room.turn || {}, {
          status: 'awaiting_clue',
          guessesLeft: 0,
          clue: { word: '', number: 0, by: '', at: 0 },
          pending: {},
          turnNo: 0,
          startedAt: 0,
          endsAt: 0
        }),
        progress: { redRemaining: remainRed, blueRemaining: remainBlue },
        result: { winner: '', finishedAt: 0, reason: '' },
        board: assign({}, room.board || {}, { revealed: revealed })
      });
    });
  }

  function resetCodenamesForNewPlayers(roomId, hostPlayerId) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;

      var players = assign({}, room.players || {});
      var host = hostPlayerId ? players[hostPlayerId] : null;
      var nextPlayers = {};
      if (host) {
        nextPlayers[hostPlayerId] = assign({}, host, { team: '', role: '', prefsLocked: false });
      }

      var size = room && room.board && room.board.size ? room.board.size : (room.settings && room.settings.size ? room.settings.size : 5);
      var total = size * size;
      var revealed = [];
      for (var ri = 0; ri < total; ri++) revealed.push(false);

      var key = (room && room.board && room.board.key) || [];
      var remainRed = 0;
      var remainBlue = 0;
      for (var k = 0; k < key.length; k++) {
        if (key[k] === 'R') remainRed++;
        if (key[k] === 'B') remainBlue++;
      }

      return assign({}, room, {
        phase: 'lobby',
        lobbyStage: 'roles',
        lobbyLockedAt: 0,
        players: nextPlayers,
        clueLog: [],
        turn: assign({}, room.turn || {}, {
          status: 'awaiting_clue',
          guessesLeft: 0,
          clue: { word: '', number: 0, by: '', at: 0 },
          pending: {},
          turnNo: 0,
          startedAt: 0,
          endsAt: 0
        }),
        progress: { redRemaining: remainRed, blueRemaining: remainBlue },
        result: { winner: '', finishedAt: 0, reason: '' },
        board: assign({}, room.board || {}, { revealed: revealed })
      });
    });
  }

  function countCodenamesRoles(room) {
    var players = (room && room.players) || {};
    var keys = Object.keys(players);
    var out = {
      redSpymaster: 0,
      blueSpymaster: 0,
      redOperative: 0,
      blueOperative: 0,
      total: 0
    };
    for (var i = 0; i < keys.length; i++) {
      var p = players[keys[i]];
      if (!p) continue;
      out.total++;
      if (p.team === 'red' && p.role === 'spymaster') out.redSpymaster++;
      if (p.team === 'blue' && p.role === 'spymaster') out.blueSpymaster++;
      if (p.team === 'red' && p.role === 'operative') out.redOperative++;
      if (p.team === 'blue' && p.role === 'operative') out.blueOperative++;
    }
    return out;
  }

  function startCodenamesGame(roomId) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var counts = countCodenamesRoles(room);
      if (counts.redSpymaster !== 1 || counts.blueSpymaster !== 1) return room;
      if (counts.redOperative < 1 || counts.blueOperative < 1) return room;

      var now = serverNowMs();
      var normalSec = getCodenamesTimerNormalSec(room);
      var bonusSec = getCodenamesTimerFirstBonusSec(room);
      var firstEndsAt = now + (normalSec + bonusSec) * 1000;

      return assign({}, room, {
        phase: 'playing',
        turn: assign({}, room.turn || {}, {
          team: room.firstTeam || (room.turn && room.turn.team) || 'red',
          status: 'awaiting_clue',
          guessesLeft: 0,
          clue: { word: '', number: 0, by: '', at: 0 },
          pending: {},
          turnNo: 1,
          startedAt: now,
          endsAt: firstEndsAt
        }),
        result: { winner: '', finishedAt: 0, reason: '' }
      });
    });
  }

  function submitCodenamesClue(roomId, playerId, clueWord, clueNumber) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;
      if (!room.turn || room.turn.status !== 'awaiting_clue') return room;

      var player = room.players && room.players[playerId] ? room.players[playerId] : null;
      if (!player || player.role !== 'spymaster') return room;
      if (player.team !== room.turn.team) return room;

      var w = String(clueWord || '').trim();
      var n = clamp(parseIntSafe(clueNumber, 0), 0, 20);
      if (!w) return room;

      var log = [];
      try {
        log = Array.isArray(room.clueLog) ? room.clueLog.slice() : [];
      } catch (e0) {
        log = [];
      }
      if (log.length > 20) log = log.slice(log.length - 20);
      log.push({ team: room.turn.team, word: w, number: n, by: playerId, at: serverNowMs() });
      if (log.length > 20) log = log.slice(log.length - 20);

      // Reset timer when switching roles: spymaster -> operative
      var now2 = serverNowMs();
      var normalSec2 = getCodenamesTimerNormalSec(room);

      return assign({}, room, {
        clueLog: log,
        turn: assign({}, room.turn || {}, {
          status: 'guessing',
          guessesLeft: n + 1,
          clue: { word: w, number: n, by: playerId, at: now2 },
          pending: {},
          startedAt: now2,
          endsAt: now2 + normalSec2 * 1000
        })
      });
    });
  }

  function toggleCodenamesPending(roomId, playerId, index) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;
      if (!room.board || !room.board.words || !room.board.revealed) return room;
      if (!room.turn || room.turn.status !== 'guessing') return room;

      var idx = parseIntSafe(index, -1);
      if (idx < 0 || idx >= room.board.words.length) return room;
      if (room.board.revealed[idx]) return room;

      var player = room.players && room.players[playerId] ? room.players[playerId] : null;
      if (!player || player.role !== 'operative') return room;
      if (player.team !== room.turn.team) return room;

      var pending = assign({}, (room.turn && room.turn.pending) || {});
      var k = String(idx);
      if (pending[k]) {
        try {
          delete pending[k];
        } catch (e) {
          pending[k] = null;
        }
      } else {
        pending[k] = { by: playerId, at: serverNowMs() };
      }

      return assign({}, room, { turn: assign({}, room.turn, { pending: pending }) });
    });
  }

  function endCodenamesTurn(roomId) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;
      var team = room.turn && room.turn.team ? room.turn.team : 'red';
      var nextTeam = team === 'red' ? 'blue' : 'red';

      var now = serverNowMs();
      var normalSec = getCodenamesTimerNormalSec(room);
      var nextTurnNo = clamp(parseIntSafe(room.turn && room.turn.turnNo, 1) + 1, 1, 9999);
      return assign({}, room, {
        turn: {
          team: nextTeam,
          status: 'awaiting_clue',
          guessesLeft: 0,
          clue: { word: '', number: 0, by: '', at: 0 },
          pending: {},
          turnNo: nextTurnNo,
          startedAt: now,
          endsAt: now + normalSec * 1000
        }
      });
    });
  }

  function revealCodenamesCard(roomId, playerId, index) {
    var base = codenamesRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;
      if (!room.board || !room.board.words || !room.board.key || !room.board.revealed) return room;
      if (!room.turn || room.turn.status !== 'guessing') return room;
      var idx = parseIntSafe(index, -1);
      if (idx < 0 || idx >= room.board.words.length) return room;
      if (room.board.revealed[idx]) return room;

      var player = room.players && room.players[playerId] ? room.players[playerId] : null;
      if (!player || player.role !== 'operative') return room;
      if (player.team !== room.turn.team) return room;

      var key = room.board.key[idx];
      var nextRevealed = room.board.revealed.slice();
      nextRevealed[idx] = true;

      var nextProgress = assign({}, room.progress || {});
      if (key === 'R') nextProgress.redRemaining = Math.max(0, (nextProgress.redRemaining || 0) - 1);
      if (key === 'B') nextProgress.blueRemaining = Math.max(0, (nextProgress.blueRemaining || 0) - 1);

      var winner = '';
      var reason = '';
      if (key === 'A') {
        winner = room.turn.team === 'red' ? 'blue' : 'red';
        reason = 'assassin';
      } else {
        if ((nextProgress.redRemaining || 0) === 0) {
          winner = 'red';
          reason = 'all-red';
        }
        if ((nextProgress.blueRemaining || 0) === 0) {
          winner = 'blue';
          reason = 'all-blue';
        }
      }

      var nextRoom = assign({}, room, {
        board: assign({}, room.board, { revealed: nextRevealed }),
        progress: nextProgress
      });

      if (winner) {
        nextRoom.phase = 'finished';
        nextRoom.result = { winner: winner, finishedAt: serverNowMs(), reason: reason };
        nextRoom.turn = assign({}, room.turn || {}, { pending: {} });
        return nextRoom;
      }

      var shouldSwitch = false;
      if (key !== (room.turn.team === 'red' ? 'R' : 'B')) {
        shouldSwitch = true;
      }

      if (shouldSwitch) {
        var nextTeam = room.turn.team === 'red' ? 'blue' : 'red';
        var now = serverNowMs();
        var normalSec = getCodenamesTimerNormalSec(room);
        var nextTurnNo = clamp(parseIntSafe(room.turn && room.turn.turnNo, 1) + 1, 1, 9999);
        nextRoom.turn = {
          team: nextTeam,
          status: 'awaiting_clue',
          guessesLeft: 0,
          clue: { word: '', number: 0, by: '', at: 0 },
          pending: {},
          turnNo: nextTurnNo,
          startedAt: now,
          endsAt: now + normalSec * 1000
        };
        return nextRoom;
      }

      var left = Math.max(0, (room.turn.guessesLeft || 0) - 1);
      if (left === 0) {
        var nt = room.turn.team === 'red' ? 'blue' : 'red';
        var now2 = serverNowMs();
        var normalSec2 = getCodenamesTimerNormalSec(room);
        var nextTurnNo2 = clamp(parseIntSafe(room.turn && room.turn.turnNo, 1) + 1, 1, 9999);
        nextRoom.turn = {
          team: nt,
          status: 'awaiting_clue',
          guessesLeft: 0,
          clue: { word: '', number: 0, by: '', at: 0 },
          pending: {},
          turnNo: nextTurnNo2,
          startedAt: now2,
          endsAt: now2 + normalSec2 * 1000
        };
        return nextRoom;
      }

      nextRoom.turn = assign({}, room.turn, { guessesLeft: left, pending: {} });
      return nextRoom;
    });
  }

  function createRoom(roomId, settings) {
    var base = roomPath(roomId);

    var picked;
    try {
      if (settings.topicCategoryId === 'random') picked = pickRandomPairAny();
      else picked = pickRandomPair(settings.topicCategoryId);
    } catch (e) {
      picked = pickRandomPairAny();
    }

    var room = {
      createdAt: serverNowMs(),
      phase: 'lobby',
      settings: {
        minorityCount: settings.minorityCount,
        talkSeconds: settings.talkSeconds,
        reversal: settings.reversal
      },
      topic: {
        categoryId: picked.category && picked.category.id ? picked.category.id : '',
        categoryName: picked.category && picked.category.name ? picked.category.name : ''
      },
      words: {
        majority: picked.majority,
        minority: picked.minority
      },
      discussion: {
        startedAt: 0,
        endsAt: 0
      },
      reveal: {
        revealedAt: 0,
        votedOutId: ''
      },
      guess: {
        enabled: !!settings.reversal,
        submittedAt: 0,
        guesses: {}
      },
      result: {
        winner: '',
        decidedAt: 0,
        decidedBy: ''
      },
      voting: {
        startedAt: 0,
        revealedAt: 0
      },
      votes: {},
      players: {}
    };
    return setValue(base, room);
  }

  function joinPlayerInRoom(roomId, playerId, name, isHostPlayer) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var players = assign({}, room.players || {});
      var prev = players[playerId] || {};
      var next = assign({}, prev, {
        name: name,
        joinedAt: prev.joinedAt || serverNowMs(),
        lastSeenAt: serverNowMs()
      });

      if (isHostPlayer) next.isHost = true;

      players[playerId] = next;

      return assign({}, room, { players: players });
    });
  }

  function formatPlayerDisplayName(player) {
    return player && player.name ? String(player.name) : '';
  }

  function formatPlayerMenuName(player) {
    var name = formatPlayerDisplayName(player);
    if (player && player.isHost) name += ' (ゲームマスター)';
    return name;
  }

  function listActivePlayerIds(room) {
    var playersObj = (room && room.players) || {};
    var keys = Object.keys(playersObj);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var p = playersObj[id];
      if (!p) continue;
      if (p.role === 'spectator') continue;
      out.push(id);
    }
    return out;
  }

  function isVotingComplete(room) {
    var ids = listActivePlayerIds(room);
    if (!ids.length) return false;
    var votes = (room && room.votes) || {};
    for (var i = 0; i < ids.length; i++) {
      var voterId = ids[i];
      var v = votes[voterId];
      if (!v || !v.to) return false;
    }
    return true;
  }

  function computeVotedOutId(room) {
    var ids = listActivePlayerIds(room);
    if (!ids.length) return '';

    var votesObj = (room && room.votes) || {};
    var counts = {};
    for (var i = 0; i < ids.length; i++) counts[ids[i]] = 0;

    var voterIds = Object.keys(votesObj);
    for (var j = 0; j < voterIds.length; j++) {
      var voterId = voterIds[j];
      var v = votesObj[voterId];
      if (!v || !v.to) continue;
      if (counts[v.to] == null) continue;
      counts[v.to] = (counts[v.to] || 0) + 1;
    }

    var bestId = '';
    var bestCount = -1;
    // deterministic tie-break: lexicographically smaller id wins
    for (var k = 0; k < ids.length; k++) {
      var pid = ids[k];
      var c = counts[pid] || 0;
      if (c > bestCount) {
        bestCount = c;
        bestId = pid;
      } else if (c === bestCount && bestId && pid < bestId) {
        bestId = pid;
      }
    }
    return bestId;
  }

  function listMinorityPlayerIds(room) {
    var playersObj = (room && room.players) || {};
    var keys = Object.keys(playersObj);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var p = playersObj[id];
      if (!p) continue;
      if (p.role !== 'minority') continue;
      out.push(id);
    }
    return out;
  }

  function areAllMinorityGuessesSubmitted(room) {
    var ids = listMinorityPlayerIds(room);
    if (!ids.length) return true;
    var guessObj = (room && room.guess) || {};
    var guesses = guessObj.guesses || {};
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      if (!guesses[pid] || !guesses[pid].text) return false;
    }
    return true;
  }

  function startGame(roomId) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var ids = listActivePlayerIds(room);
      if (ids.length < 3) return room;

      var talkSeconds = room.settings && room.settings.talkSeconds != null ? room.settings.talkSeconds : 180;
      if (FORCE_TALK_SECONDS > 0) talkSeconds = FORCE_TALK_SECONDS;
      var minorityCount = room.settings && room.settings.minorityCount != null ? room.settings.minorityCount : 1;
      minorityCount = clamp(minorityCount, 1, Math.max(1, ids.length - 1));

      var shuffled = ids.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = randomInt(i + 1);
        var tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }

      var minoritySet = {};
      for (var k = 0; k < minorityCount; k++) minoritySet[shuffled[k]] = true;

      var nextPlayers = assign({}, room.players || {});
      for (var m = 0; m < ids.length; m++) {
        var pid = ids[m];
        var p = nextPlayers[pid] || {};
        nextPlayers[pid] = assign({}, p, { role: minoritySet[pid] ? 'minority' : 'majority' });
      }

      var startedAt = serverNowMs();
      return assign({}, room, {
        phase: 'discussion',
        players: nextPlayers,
        discussion: { startedAt: startedAt, endsAt: startedAt + talkSeconds * 1000 },
        voting: { startedAt: 0, revealedAt: 0 },
        votes: {},
        reveal: { revealedAt: 0, votedOutId: '' },
        guess: {
          enabled: !!(room.settings && room.settings.reversal),
          submittedAt: 0,
          guesses: {}
        },
        result: { winner: '', decidedAt: 0, decidedBy: '' }
      });
    });
  }

  function autoStartVotingIfEnded(roomId) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'discussion') return room;
      var endAt = room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
      if (!endAt) return room;
      if (serverNowMs() < endAt) return room;
      return assign({}, room, {
        phase: 'voting',
        voting: { startedAt: serverNowMs(), revealedAt: 0 },
        votes: {}
      });
    });
  }

  function revealAfterVoting(roomId) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'voting') return room;
      if (!isVotingComplete(room)) return room;

      // Determine leaders; if tie => runoff revote among tied players.
      var votesObj = (room && room.votes) || {};
      var activeIds = listActivePlayerIds(room);
      if (!activeIds.length) return room;

      var candidateIds = null;
      if (room.voting && room.voting.runoff && Array.isArray(room.voting.runoff.candidates) && room.voting.runoff.candidates.length) {
        candidateIds = room.voting.runoff.candidates.slice();
      }

      var counts = {};
      var baseIds = candidateIds || activeIds;
      for (var bi = 0; bi < baseIds.length; bi++) counts[baseIds[bi]] = 0;

      var voterIds = Object.keys(votesObj);
      for (var vi = 0; vi < voterIds.length; vi++) {
        var voterId = voterIds[vi];
        var v = votesObj[voterId];
        if (!v || !v.to) continue;
        if (counts[v.to] == null) continue;
        counts[v.to] = (counts[v.to] || 0) + 1;
      }

      var bestCount = -1;
      for (var ci = 0; ci < baseIds.length; ci++) {
        var pid = baseIds[ci];
        var c = counts[pid] || 0;
        if (c > bestCount) bestCount = c;
      }

      var leaders = [];
      for (var li = 0; li < baseIds.length; li++) {
        var pid2 = baseIds[li];
        if ((counts[pid2] || 0) === bestCount) leaders.push(pid2);
      }

      // Show vote leaders in a modal first (phase=reveal). GM advances next.
      if (leaders.length > 1) {
        // Cap runoff revotes to at most 2 times.
        // round: 0 (no runoff yet) -> 1 (1st revote) -> 2 (2nd revote)
        // If still tied at round>=2, we stop revoting and resolve in advanceAfterVoteReveal.
        var prevRound0 = room.voting && room.voting.runoff && room.voting.runoff.round ? parseIntSafe(room.voting.runoff.round, 0) : 0;
        return assign({}, room, {
          phase: 'reveal',
          reveal: { revealedAt: serverNowMs(), votedOutId: '', tieCandidates: leaders, tieFinal: prevRound0 >= 2 }
        });
      }

      var votedOutId = leaders[0] || computeVotedOutId(room);
      return assign({}, room, {
        phase: 'reveal',
        reveal: { revealedAt: serverNowMs(), votedOutId: votedOutId }
      });
    });
  }

  function advanceAfterVoteReveal(roomId, tieAction) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'reveal') return room;

      var rv = (room && room.reveal) || {};
      var tieCandidates = rv && Array.isArray(rv.tieCandidates) ? rv.tieCandidates.slice() : null;
      if (tieCandidates && tieCandidates.length > 1) {
        var prevRound = room.voting && room.voting.runoff && room.voting.runoff.round ? parseIntSafe(room.voting.runoff.round, 0) : 0;

        // GM tie choice:
        // - tieAction === 'minority' => end immediately with minority win
        // - tieAction === 'revote' => continue revote (no cap)
        // - otherwise (default) keep legacy behavior: cap at 2 revotes then minority wins
        if (String(tieAction || '') === 'minority') {
          return assign({}, room, {
            phase: 'finished',
            reveal: { revealedAt: rv.revealedAt || serverNowMs(), votedOutId: '' },
            result: { winner: 'minority', decidedAt: serverNowMs(), decidedBy: 'gm_tie_choice' }
          });
        }

        if (String(tieAction || '') === 'revote') {
          return assign({}, room, {
            phase: 'voting',
            votes: {},
            voting: {
              startedAt: serverNowMs(),
              revealedAt: 0,
              runoff: { round: prevRound + 1, candidates: tieCandidates }
            },
            reveal: { revealedAt: 0, votedOutId: '' }
          });
        }

        // Re-vote is allowed up to 2 times. If tie persists beyond that, resolve.
        if (prevRound >= 2) {
          return assign({}, room, {
            phase: 'finished',
            // keep reveal info (tie candidates) so UI can still show the last modal before finishing
            reveal: { revealedAt: rv.revealedAt || serverNowMs(), votedOutId: '' },
            result: { winner: 'minority', decidedAt: serverNowMs(), decidedBy: 'runoff_tie_limit' }
          });
        }

        return assign({}, room, {
          phase: 'voting',
          votes: {},
          voting: {
            startedAt: serverNowMs(),
            revealedAt: 0,
            runoff: { round: prevRound + 1, candidates: tieCandidates }
          },
          reveal: { revealedAt: 0, votedOutId: '' }
        });
      }

      var votedOutId = rv && rv.votedOutId ? String(rv.votedOutId) : '';
      if (!votedOutId) {
        // Safety: if we somehow reached reveal without a target, restart voting.
        return assign({}, room, {
          phase: 'voting',
          votes: {},
          voting: { startedAt: serverNowMs(), revealedAt: 0 },
          reveal: { revealedAt: 0, votedOutId: '' }
        });
      }

      var votedOutRole = votedOutId && room.players && room.players[votedOutId] ? String(room.players[votedOutId].role || '') : '';
      var reversal = !!(room.settings && room.settings.reversal);
      var keepReveal = { revealedAt: rv.revealedAt || serverNowMs(), votedOutId: votedOutId };

      // If majority was voted out => minority wins immediately.
      if (votedOutRole === 'majority') {
        return assign({}, room, {
          phase: 'finished',
          reveal: keepReveal,
          result: { winner: 'minority', decidedAt: serverNowMs(), decidedBy: 'vote' }
        });
      }

      // If minority was voted out => if reversal enabled, minority can guess; otherwise majority wins.
      if (votedOutRole === 'minority' && reversal) {
        var nextGuess = assign(
          {
            enabled: true,
            submittedAt: 0,
            guesses: {}
          },
          room.guess || {}
        );
        if (!nextGuess.guesses) nextGuess.guesses = {};
        return assign({}, room, {
          phase: 'guess',
          reveal: keepReveal,
          guess: nextGuess,
          result: { winner: '', decidedAt: 0, decidedBy: '' }
        });
      }

      return assign({}, room, {
        phase: 'finished',
        reveal: keepReveal,
        result: { winner: 'majority', decidedAt: serverNowMs(), decidedBy: 'vote' }
      });
    });
  }

  function submitVote(roomId, voterId, toPlayerId) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'voting') return room;
      var playersObj = room.players || {};
      var voter = playersObj[voterId];
      var to = playersObj[toPlayerId];
      if (!voter || voter.role === 'spectator') return room;
      if (!to || to.role === 'spectator') return room;
      if (String(voterId) === String(toPlayerId)) return room;

      if (room.voting && room.voting.runoff && Array.isArray(room.voting.runoff.candidates) && room.voting.runoff.candidates.length) {
        var allowed = false;
        for (var i = 0; i < room.voting.runoff.candidates.length; i++) {
          if (String(room.voting.runoff.candidates[i]) === String(toPlayerId)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) return room;
      }
      var nextVotes = assign({}, room.votes || {});
      nextVotes[voterId] = { to: toPlayerId, at: serverNowMs() };
      return assign({}, room, { votes: nextVotes });
    });
  }

  function submitGuess(roomId, playerId, guessText) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'guess') return room;
      var playersObj = room.players || {};
      var me = playersObj[playerId];
      if (!me || me.role !== 'minority') return room;
      var gt = String(guessText || '').trim();

      var nextGuess = assign(
        {
          enabled: true,
          submittedAt: 0,
          guesses: {}
        },
        room.guess || {}
      );
      var guesses = assign({}, nextGuess.guesses || {});
      if (gt) guesses[playerId] = { text: gt, at: serverNowMs() };
      nextGuess.guesses = guesses;
      nextGuess.submittedAt = serverNowMs();

      var nextRoom = assign({}, room, { guess: nextGuess });

      if (areAllMinorityGuessesSubmitted(nextRoom)) {
        return assign({}, nextRoom, { phase: 'judge' });
      }
      return nextRoom;
    });
  }

  function decideWinner(roomId, winner) {
    var base = roomPath(roomId);
    var w = winner === 'minority' ? 'minority' : 'majority';
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'judge') return room;
      return assign({}, room, {
        phase: 'finished',
        result: { winner: w, decidedAt: serverNowMs(), decidedBy: 'gm' }
      });
    });
  }

  function restartGameWithSettings(roomId, settings) {
    var base = roomPath(roomId);

    var picked;
    try {
      if (settings.topicCategoryId === 'random') picked = pickRandomPairAny();
      else picked = pickRandomPair(settings.topicCategoryId);
    } catch (e) {
      picked = pickRandomPairAny();
    }

    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'finished') return room;

      var ids = listActivePlayerIds(room);
      if (ids.length < 3) return room;

      var talkSeconds = settings && settings.talkSeconds != null ? settings.talkSeconds : 180;
      var minorityCount = settings && settings.minorityCount != null ? settings.minorityCount : 1;
      talkSeconds = clamp(parseIntSafe(talkSeconds, 180), 60, 10 * 60);
      if (FORCE_TALK_SECONDS > 0) talkSeconds = FORCE_TALK_SECONDS;
      minorityCount = clamp(parseIntSafe(minorityCount, 1), 1, Math.max(1, ids.length - 1));
      var reversal = !!(settings && settings.reversal);

      var shuffled = ids.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = randomInt(i + 1);
        var tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }

      var minoritySet = {};
      for (var k = 0; k < minorityCount; k++) minoritySet[shuffled[k]] = true;

      var nextPlayers = assign({}, room.players || {});
      for (var m = 0; m < ids.length; m++) {
        var pid = ids[m];
        var p = nextPlayers[pid] || {};
        nextPlayers[pid] = assign({}, p, { role: minoritySet[pid] ? 'minority' : 'majority' });
      }

      var startedAt = serverNowMs();
      return assign({}, room, {
        phase: 'discussion',
        settings: {
          minorityCount: minorityCount,
          talkSeconds: talkSeconds,
          reversal: reversal
        },
        topic: {
          categoryId: picked.category && picked.category.id ? picked.category.id : '',
          categoryName: picked.category && picked.category.name ? picked.category.name : ''
        },
        words: {
          majority: picked.majority,
          minority: picked.minority
        },
        players: nextPlayers,
        discussion: { startedAt: startedAt, endsAt: startedAt + talkSeconds * 1000 },
        voting: { startedAt: 0, revealedAt: 0 },
        votes: {},
        reveal: { revealedAt: 0, votedOutId: '' },
        guess: {
          enabled: reversal,
          submittedAt: 0,
          guesses: {}
        },
        result: { winner: '', decidedAt: 0, decidedBy: '' }
      });
    });
  }

  function resetRoomForPlayerChange(roomId, hostPlayerId) {
    var base = roomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'finished') return room;

      var players = room.players || {};
      var hostId = hostPlayerId;
      if (!players[hostId] || !players[hostId].isHost) {
        hostId = '';
        var keys = Object.keys(players);
        for (var i = 0; i < keys.length; i++) {
          var pid = keys[i];
          if (players[pid] && players[pid].isHost) {
            hostId = pid;
            break;
          }
        }
      }

      var host = hostId && players[hostId] ? players[hostId] : null;
      if (!hostId || !host) return room;

      var nextPlayers = {};
      nextPlayers[hostId] = {
        name: host.name || 'ゲームマスター',
        isHost: true,
        joinedAt: host.joinedAt || serverNowMs(),
        lastSeenAt: serverNowMs()
      };

      return assign({}, room, {
        phase: 'lobby',
        players: nextPlayers,
        discussion: { startedAt: 0, endsAt: 0 },
        voting: { startedAt: 0, revealedAt: 0 },
        votes: {},
        reveal: { revealedAt: 0, votedOutId: '' },
        guess: { enabled: !!(room.settings && room.settings.reversal), submittedAt: 0, guesses: {} },
        result: { winner: '', decidedAt: 0, decidedBy: '' }
      });
    });
  }

  function subscribeRoom(roomId, cb) {
    return onValue(roomPath(roomId), cb);
  }

  // -------------------- loveletter (logic) --------------------
  // Note: Text-based UI for now. Card defs include fields to allow future icon assets.
  var LOVELETTER_CARD_DEFS = {
    '1': { rank: 1, name: '兵士', desc: '相手1人を選び、カード名を推測する（兵士は不可）。当たれば脱落。', icon: './assets/loveletter/Heishi.png' },
    '2': { rank: 2, name: '道化', desc: '相手1人の手札を見る。', icon: './assets/loveletter/Douke.png' },
    '3': { rank: 3, name: '騎士', desc: '相手1人と手札の強さを比べ、弱い方が脱落。', icon: './assets/loveletter/Kishi.png' },
    '4': { rank: 4, name: '僧侶', desc: '次の自分の番まで、他プレイヤーの効果を受けない。', icon: './assets/loveletter/Souryo.png' },
    '5': { rank: 5, name: '魔術師', desc: '誰か1人（自分も可）に手札を捨てさせ、1枚引かせる。姫なら脱落。', icon: './assets/loveletter/Mazyutushi.png' },
    '6': { rank: 6, name: '将軍', desc: '相手1人と手札を交換する。', icon: './assets/loveletter/Shougun.png' },
    '7': { rank: 7, name: '大臣', desc: '将軍(6)か魔術師(5)と同時に持つなら必ず捨てる。', icon: './assets/loveletter/Daizin.png' },
    '8': { rank: 8, name: '姫', desc: '捨てたら脱落。', icon: './assets/loveletter/Hime.png' },
    // Optional extra cards (variants). These behave as rank 7/8 but have different artwork.
    '7:countess': { rank: 7, name: '女侯爵', desc: '将軍(6)か魔術師(5)と同時に持つなら必ず捨てる。', icon: './assets/loveletter/Onnakoushaku.png' },
    '8:megane': { rank: 8, name: '姫（眼鏡）', desc: '捨てたら脱落。', icon: './assets/loveletter/Himemegane.png' }
  };

  // -------------------- oekaki battle (おえかきバトル) --------------------
  // 全員が同じお題を制限時間内に描き、Gemini APIが採点してランキング発表する。
  // 判定はホスト端末のみが実行する（APIキーもホスト端末のみ必要）。

  // お題は3段階（ようじ/しょうがくせい/おとな）。すべてひらがな・カタカナ表記。
  // 同じお題が続かないよう oekakiPickTopic で直前のお題は除外している。
  var OEKAKI_TOPICS = {
    kids: [
      // たべもの
      'りんご', 'ばなな', 'いちご', 'みかん', 'ぶどう', 'もも', 'すいか', 'さくらんぼ', 'メロン', 'パイナップル',
      'にんじん', 'トマト', 'きゅうり', 'なす', 'かぼちゃ', 'ピーマン', 'とうもろこし', 'たまねぎ', 'じゃがいも', 'きのこ',
      'たまご', 'しょくパン', 'メロンパン', 'ドーナツ', 'プリン', 'クッキー', 'キャンディ', 'チョコレート', 'アイスクリーム', 'ケーキ',
      'おにぎり', 'カレーライス', 'ジュース', 'ぎゅうにゅう',
      // どうぶつ・むし
      'ねこ', 'いぬ', 'うさぎ', 'ぞう', 'きりん', 'さかな', 'ちょうちょ', 'ぶた', 'うし', 'ひつじ',
      'やぎ', 'にわとり', 'ひよこ', 'あひる', 'かえる', 'かたつむり', 'てんとうむし', 'とんぼ', 'はち', 'くま',
      'さる', 'ねずみ', 'とら', 'しまうま', 'かば', 'いるか', 'くじら', 'かに', 'えび', 'いか',
      'ひとで', 'ことり',
      // のりもの
      'くるま', 'でんしゃ', 'ひこうき', 'バス', 'じてんしゃ', 'トラック', 'タクシー', 'ふね', 'きしゃ',
      // みのまわり
      'ふうせん', 'かさ', 'ぼうし', 'いえ', 'とけい', 'めがね', 'ロボット', 'くつ', 'てぶくろ', 'マフラー',
      'かばん', 'えんぴつ', 'クレヨン', 'はさみ', 'ほん', 'ボール', 'つみき', 'にんぎょう', 'たいこ', 'ピアノ',
      'ラッパ', 'いす', 'つくえ', 'ベッド', 'まくら', 'コップ', 'おさら', 'スプーン', 'フォーク', 'はブラシ',
      'タオル', 'かぎ', 'てがみ', 'ポスト', 'しんごう', 'まど', 'ドア', 'はしご', 'バケツ', 'じょうろ',
      // しぜん
      'おはな', 'たいよう', 'つき', 'ほし', 'き', 'やま', 'にじ', 'ゆきだるま', 'くも', 'あめ',
      'かみなり', 'うみ', 'かわ', 'いし', 'はっぱ', 'どんぐり', 'たんぽぽ', 'ひまわり', 'チューリップ', 'さくら'
    ],
    school: [
      // のりもの・はたらくくるま
      'しょうぼうしゃ', 'パトカー', 'きゅうきゅうしゃ', 'ショベルカー', 'クレーンしゃ', 'ゴミしゅうしゅうしゃ', 'ミキサーしゃ', 'タンクローリー', 'ヘリコプター', 'しんかんせん',
      'モノレール', 'せんすいかん', 'ヨット', 'ききゅう', 'ロケット', 'スクールバス',
      // どうぶつ・むし・うみのいきもの
      'カブトムシ', 'クワガタ', 'セミ', 'アリ', 'カマキリ', 'バッタ', 'ダンゴムシ', 'ペンギン', 'パンダ', 'コアラ',
      'ライオン', 'ワニ', 'サメ', 'タコ', 'カメ', 'カンガルー', 'コウモリ', 'フクロウ', 'ハリネズミ', 'カメレオン',
      'イグアナ', 'クラゲ', 'マンボウ', 'エイ', 'シャチ', 'カワウソ', 'アルパカ', 'ラクダ', 'キツネ', 'タヌキ',
      'リス', 'ハムスター', 'インコ', 'ダチョウ', 'フラミンゴ', 'クジャク', 'ナマケモノ', 'チーター', 'サイ', 'きょうりゅう',
      // たべもの
      'ラーメン', 'おすし', 'ハンバーガー', 'やきそば', 'オムライス', 'グラタン', 'ピザ', 'ホットドッグ', 'パフェ', 'かきごおり',
      'だんご', 'たいやき', 'わたあめ', 'ポップコーン', 'おべんとう', 'サンドイッチ', 'スパゲッティ', 'ぎょうざ', 'からあげ', 'てんぷら',
      'ホットケーキ', 'たまごやき',
      // がっこう・ばしょ
      'がっこう', 'きょうしつ', 'たいいくかん', 'としょかん', 'すいぞくかん', 'どうぶつえん', 'ゆうえんち', 'えいがかん', 'こうえん', 'プール',
      'おしろ', 'とうだい', 'かざん', 'ランドセル', 'リコーダー', 'すべりだい', 'ブランコ', 'ジャングルジム', 'てつぼう', 'なわとび',
      // スポーツ・あそび
      'サッカーボール', 'バスケットボール', 'やきゅう', 'たっきゅう', 'テニス', 'バドミントン', 'けんどう', 'じゅうどう', 'スケートボード', 'スキー',
      'つなひき', 'リレー', 'キャンプ', 'テント', 'たきび', 'たからばこ', 'かいぞくせん',
      // ぎょうじ・ものがたり
      'はなび', 'うんどうかい', 'えんそく', 'たなばた', 'ひなまつり', 'こいのぼり', 'せつぶんのおに', 'サンタクロース', 'トナカイ', 'クリスマスツリー',
      'ハロウィン', 'にんじゃ', 'おばけ', 'ドラゴン', 'まほうつかい', 'まじょ', 'がいこつ', 'ミイラ', 'きゅうけつき', 'ゆうしゃ',
      'おうさま', 'おひめさま', 'きし', 'かいじゅう', 'ユニコーン', 'にんぎょ', 'てんし', 'うちゅうじん'
    ],
    adult: [
      // ゆうめいなもの・けんちく
      'じゆうのめがみ', 'モナリザ', 'スフィンクス', 'とうきょうタワー', 'ふじさん', 'とうきょうスカイツリー', 'きんかくじ', 'ひめじじょう', 'ごじゅうのとう', 'とりい',
      'ピラミッド', 'ばんりのちょうじょう', 'エッフェルとう', 'ピサのしゃとう', 'コロッセオ', 'タージマハル', 'ならのしか',
      // しごと・ひと
      'サラリーマン', 'しょうぼうし', 'けいさつかん', 'かんごし', 'パティシエ', 'びようし', 'パイロット', 'うんてんしゅ', 'カメラマン', 'プログラマー',
      'せいゆう', 'げいにん', 'アイドル', 'プロレスラー', 'うちゅうひこうし', 'たくはいびん',
      // あるある・にちじょう
      'ふつかよい', 'まんいんでんしゃ', 'リモートかいぎ', 'ラジオたいそう', 'ざんぎょう', 'きゅうりょうび', 'おおそうじ', 'ひっこし', 'けんこうしんだん', 'かふんしょう',
      'ねぼう', 'ちこく', 'しめきり', 'めんせつ', 'ぎっくりごし', 'かたこり', 'ダイエット', 'たからくじ', 'ゴミだし', 'さらあらい',
      'せんたくもの', 'ぎょうれつ', 'いねむり', 'ジャンケン', 'テレワーク', 'セルフレジ',
      // おでかけ・たのしみ
      'おはなみ', 'けっこんしき', 'おんせん', 'かいてんずし', 'バーベキュー', 'つり', 'ゴルフ', 'ボウリング', 'カラオケ', 'すもう',
      'ゆきがっせん', 'かんらんしゃ', 'ジェットコースター', 'ねこカフェ', 'じどり', 'マラソンたいかい', 'ばんしゃく', 'いざかや', 'サウナ', 'ヨガ',
      'ジム', 'とざん', 'さんぽ', 'どくしょ', 'ガーデニング', 'スケート', 'ダーツ', 'ビリヤード', 'はいしゃ', 'びよういん',
      // たべもの・のみもの
      'たこやき', 'おこのみやき', 'ビール', 'ワイン', 'コーヒー', 'おせちりょうり', 'えきべん',
      // でんかせいひん・みのまわり
      'スマートフォン', 'ノートパソコン', 'せんぷうき', 'エアコン', 'せんたくき', 'そうじき', 'でんしレンジ', 'れいぞうこ', 'じはんき', 'エスカレーター',
      'エレベーター', 'ドライヤー', 'めざましどけい', 'こたつ', 'ふとん',
      // きせつ・ぎょうじ
      'はつもうで', 'おおみそか', 'ねんがじょう', 'まめまき', 'ぼんおどり', 'なつまつり', 'やたい', 'きんぎょすくい', 'はなびたいかい', 'もみじがり',
      'おつきみ', 'ゆきかき', 'つゆ', 'たいふう'
    ]
  };

  function oekakiPickTopic(age, excludeTopic) {
    var pool = OEKAKI_TOPICS[age] || OEKAKI_TOPICS.school;
    var ex = String(excludeTopic || '');
    var cand = [];
    for (var i = 0; i < pool.length; i++) {
      if (String(pool[i]) !== ex) cand.push(pool[i]);
    }
    if (!cand.length) cand = pool.slice();
    return String(cand[randomInt(cand.length)] || 'ねこ');
  }

  function oekakiFormatSeconds(sec) {
    var s = clamp(parseIntSafe(sec, 0), 0, 3600);
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m > 0 && r > 0) return String(m) + 'ぷん' + String(r) + 'びょう';
    if (m > 0) return String(m) + 'ぷん';
    return String(r) + 'びょう';
  }

  // 開始前カウントダウンの各ステップの長さ（3→2→1 を1つずつ表示する間隔）。
  var OEKAKI_COUNT_STEP_MS = 1000;
  // 開始前のリード時間。ルーム作成/画面読み込みの遅れを吸収し、
  // 3カウントダウンの前に「よーい…」の間を置いて「3」を確実に見せるため長めにとる。
  var OEKAKI_LEAD_MS = 5000;
  // 時間切れ後、各端末の自動提出がDBに届くのを待つ猶予。
  var OEKAKI_JUDGE_GRACE_MS = 4000;
  // ドキドキ感の演出: 判定は最低この時間見せてから結果発表する（API応答が速くてもあえて待つ）。
  var OEKAKI_JUDGE_MIN_MS = 12000;

  function createOekakiRoom(roomId, settings, topic) {
    var s = settings && typeof settings === 'object' ? settings : {};
    var drawSeconds = clamp(parseIntSafe(s.drawSeconds, 90), 30, 600);
    var order = Array.isArray(s.order) ? s.order.slice() : [];
    var room = {
      createdAt: serverNowMs(),
      phase: 'drawing',
      settings: {
        order: order,
        drawSeconds: drawSeconds,
        topicMode: s.topicMode === 'custom' ? 'custom' : 'random',
        topicAge: s.topicAge === 'kids' || s.topicAge === 'adult' ? String(s.topicAge) : 'school'
      },
      round: {
        index: 1,
        topic: String(topic || ''),
        endsAt: serverNowMs() + drawSeconds * 1000 + OEKAKI_LEAD_MS
      },
      players: {}
    };
    return setValue(oekakiRoomPath(roomId), room);
  }

  function joinPlayerInOekakiRoom(roomId, playerId, name, isHostPlayer) {
    var pid = String(playerId || '');
    if (!pid) return Promise.reject(new Error('参加に失敗しました（ID不正）'));
    return runTxn(oekakiRoomPath(roomId), function (room) {
      if (!room) return room;

      var players = assign({}, room.players || {});
      var prev = players[pid] || {};
      var next = assign({}, prev, {
        name: name,
        joinedAt: prev.joinedAt || serverNowMs(),
        lastSeenAt: serverNowMs()
      });
      if (isHostPlayer) next.isHost = true;
      players[pid] = next;

      var st = assign({}, room.settings || {});
      if (!Array.isArray(st.order)) st.order = [];
      if (st.order.indexOf(pid) === -1) st.order = st.order.concat([pid]);

      return assign({}, room, { players: players, settings: st });
    });
  }

  // 提出はプレイヤーノード単位のトランザクション（画像を含む全room送信を避ける）。
  // round番号を一緒に書き、判定側は現ラウンドの提出だけを採用する。
  function oekakiSubmitImage(roomId, playerId, roundIndex, dataUrl) {
    var pid = String(playerId || '');
    if (!pid) return Promise.reject(new Error('提出に失敗しました（ID不正）'));
    var rIdx = parseIntSafe(roundIndex, 0);
    return runTxn(oekakiRoomPath(roomId) + '/players/' + pid, function (p) {
      if (!p) return p;
      if (p.image && parseIntSafe(p.round, 0) === rIdx) return p;
      return assign({}, p, {
        image: String(dataUrl || ''),
        submittedAt: serverNowMs(),
        round: rIdx
      });
    });
  }

  function oekakiCountSubmitted(room) {
    var players = (room && room.players) || {};
    var roundIndex = parseIntSafe(room && room.round && room.round.index, 1);
    var ids = Object.keys(players);
    var submitted = 0;
    for (var i = 0; i < ids.length; i++) {
      var p = players[ids[i]];
      if (p && p.image && parseIntSafe(p.round, 0) === roundIndex) submitted++;
    }
    return { submitted: submitted, total: ids.length };
  }

  // phaseをCASで奪ってから判定を実行する（二重判定防止）。
  // 勝者だけが true を受け取り、API呼び出しを行う。
  function oekakiClaimJudging(roomId, token, fromPhase) {
    var tk = String(token || '');
    return runTxn(oekakiRoomPath(roomId), function (room) {
      if (!room) return room;
      if (room.phase !== String(fromPhase || 'drawing')) return room;
      return assign({}, room, { phase: 'judging', judgeToken: tk, judgingAt: serverNowMs(), result: null });
    }).then(function (room) {
      return !!(room && room.phase === 'judging' && String(room.judgeToken || '') === tk);
    });
  }

  function oekakiWriteResult(roomId, result) {
    return runTxn(oekakiRoomPath(roomId), function (room) {
      if (!room) return room;
      if (room.phase !== 'judging') return room;
      return assign({}, room, { phase: 'result', result: result || null });
    });
  }

  // 同一メンバー・同一ルームのまま次ラウンドへ（画像と結果をクリア）。
  function oekakiReplay(roomId, topic) {
    return runTxn(oekakiRoomPath(roomId), function (room) {
      if (!room) return room;
      if (room.phase !== 'result') return room;

      var s = room.settings || {};
      var drawSeconds = clamp(parseIntSafe(s.drawSeconds, 90), 30, 600);

      var players = {};
      var src = room.players || {};
      for (var k in src) {
        if (!hasOwn.call(src, k)) continue;
        var p = src[k] || {};
        players[k] = {
          name: p.name || '',
          joinedAt: p.joinedAt || serverNowMs(),
          lastSeenAt: p.lastSeenAt || 0
        };
        if (p.isHost) players[k].isHost = true;
      }

      var idx = parseIntSafe(room.round && room.round.index, 1) + 1;
      return assign({}, room, {
        phase: 'drawing',
        round: {
          index: idx,
          topic: String(topic || ''),
          endsAt: serverNowMs() + drawSeconds * 1000 + OEKAKI_LEAD_MS
        },
        players: players,
        result: null,
        judgeToken: null,
        judgingAt: null
      });
    });
  }

  // -------------------- oekaki battle (Gemini AI judging) --------------------
  var OEKAKI_GEMINI_KEY_LS = 'bbg_gemini_key_v1';
  var OEKAKI_GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

  function loadGeminiApiKey() {
    var k = '';
    try {
      k = String(localStorage.getItem(OEKAKI_GEMINI_KEY_LS) || '').trim();
    } catch (e) {
      k = '';
    }
    if (k) return k;
    try {
      if (window.geminiApiKey) return String(window.geminiApiKey || '').trim();
    } catch (e2) {
      // ignore
    }
    return '';
  }

  function saveGeminiApiKey(key) {
    var k = String(key == null ? '' : key).trim();
    try {
      if (!k) localStorage.removeItem(OEKAKI_GEMINI_KEY_LS);
      else localStorage.setItem(OEKAKI_GEMINI_KEY_LS, k);
    } catch (e) {
      // ignore
    }
  }

  // キーのDBバックアップ（PWA/ホーム画面追加でlocalStorageが分離されても消えないように）。
  // lobbies/_config は既存ルールの $lobbyId ワイルドカードで読み書き可能。
  // cleanupOldRooms は '_' 始まりキーを削除対象から除外している。
  var OEKAKI_KEY_DB_PATH = 'lobbies/_config/geminiKey';

  function syncGeminiKeyToDb(key) {
    var k = String(key == null ? '' : key).trim();
    return setValue(OEKAKI_KEY_DB_PATH, k ? { key: k, updatedAt: serverNowMs() } : null).catch(function () {
      // ignore (offline / permission)
    });
  }

  // localStorage → 埋め込み → DBバックアップ の順でキーを解決する。
  function ensureGeminiKeyLoaded() {
    var k = loadGeminiApiKey();
    if (k) return Promise.resolve(k);
    return getValueOnce(OEKAKI_KEY_DB_PATH)
      .then(function (v) {
        var kk = v && v.key ? String(v.key).trim() : '';
        if (kk) saveGeminiApiKey(kk);
        return kk;
      })
      .catch(function () {
        return '';
      });
  }

  // --- Gemini key easy-transfer (QR / link / copy) ---
  // キーは公開ファイルに置かず、端末間で「URLフラグメント(#gkey=)」で受け渡す。
  // フラグメントはサーバーに送られずRefererにも乗らないため、クエリ文字列より安全。
  var _oekakiKeyJustImported = false;

  function importGeminiKeyFromHash() {
    var h = '';
    try {
      h = String(location.hash || '');
    } catch (e) {
      h = '';
    }
    if (!h) return false;
    var m = h.match(/[#&]gkey=([^&]+)/);
    if (!m) return false;
    var key = '';
    try {
      key = decodeURIComponent(m[1]);
    } catch (e2) {
      key = m[1];
    }
    key = String(key || '').trim();
    if (!key) return false;
    saveGeminiApiKey(key);
    try {
      syncGeminiKeyToDb(key);
    } catch (eSync) {
      // ignore
    }
    _oekakiKeyJustImported = true;
    // フラグメントをURLから消す（アドレスバー・履歴にキーを残さない）。
    try {
      history.replaceState(null, '', (location.pathname || '') + (location.search || ''));
    } catch (e3) {
      try {
        location.hash = '';
      } catch (e4) {
        // ignore
      }
    }
    return true;
  }

  function maskGeminiKey(key) {
    var k = String(key || '');
    if (!k) return '';
    if (k.length <= 10) return k.charAt(0) + '••••';
    return k.slice(0, 6) + '••••' + k.slice(-3);
  }

  // 共有用URL（現在のキーをフラグメントに載せて setup 画面を開く）
  function buildGeminiKeyShareUrl() {
    var key = loadGeminiApiKey();
    if (!key) return '';
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.screen = 'setup';
    var qs = buildQuery(q);
    return baseUrl() + (qs ? '?' + qs : '') + '#gkey=' + encodeQS(key);
  }

  // キー入りQRは必ずローカル生成のみ（外部QRサービスに送るとキーが漏れるため使わない）。
  function drawGeminiKeyQr(url) {
    var canvas = document.getElementById('geminiKeyQr');
    var note = document.getElementById('geminiKeyQrNote');
    if (!canvas) return;
    var qr = window.QRCode || window.qrcode || window.QR;
    if (qr && qr.toCanvas) {
      try {
        qr.toCanvas(canvas, String(url || ''), { margin: 1, width: 200 }, function (err) {
          if (err && note) note.textContent = 'QRを生成できませんでした。下のリンク/キーをコピーして使ってください。';
        });
        return;
      } catch (e) {
        // fall through
      }
    }
    try {
      canvas.style.display = 'none';
    } catch (e2) {
      // ignore
    }
    if (note) note.textContent = 'この端末ではQRを生成できません。下のリンク/キーをコピーして使ってください。';
  }

  function renderGeminiShareArea() {
    var area = document.getElementById('geminiShareArea');
    if (!area) return;
    var key = loadGeminiApiKey();
    if (!key) {
      area.innerHTML = '';
      return;
    }
    var shareUrl = buildGeminiKeyShareUrl();
    area.innerHTML =
      '<hr />' +
      '<div class="stack">' +
      '<div class="muted">このキーを別の端末に渡す（QR / リンク / コピー）</div>' +
      '<div class="center"><canvas id="geminiKeyQr" width="200" height="200" style="background:#fff;border-radius:12px;padding:8px"></canvas></div>' +
      '<div class="muted center" id="geminiKeyQrNote"></div>' +
      '<div class="field" style="margin:0"><label>共有リンク（別端末で開くとキーが入ります）</label><div class="code" id="geminiShareUrlText">' +
      escapeHtml(shareUrl) +
      '</div></div>' +
      '<div class="row">' +
      '<button id="copyGeminiKey" class="ghost">キーをコピー</button>' +
      '<button id="copyGeminiLink" class="ghost">共有リンクをコピー</button>' +
      '</div>' +
      '<div class="muted" id="geminiShareStatus"></div>' +
      '<div class="form-error">⚠ このQR・リンクにはキーが含まれます。SNS等に公開しないでください（仲間内での共有だけに使ってください）。</div>' +
      '<div class="muted">現在のキー: ' +
      escapeHtml(maskGeminiKey(key)) +
      '</div>' +
      '</div>';

    drawGeminiKeyQr(shareUrl);

    function setStatus(ok, okMsg) {
      var st = document.getElementById('geminiShareStatus');
      if (st) st.textContent = ok ? okMsg : 'コピーに失敗しました（手動で選択してください）';
    }
    var ck = document.getElementById('copyGeminiKey');
    if (ck) {
      ck.addEventListener('click', function () {
        copyTextToClipboard(key).then(function (ok) {
          setStatus(ok, 'キーをコピーしました');
        });
      });
    }
    var cl = document.getElementById('copyGeminiLink');
    if (cl) {
      cl.addEventListener('click', function () {
        copyTextToClipboard(shareUrl).then(function (ok) {
          setStatus(ok, '共有リンクをコピーしました');
        });
      });
    }
  }

  function oekakiJudgePrompt(topic, count) {
    return (
      'あなたはお絵かきゲームの審査員です。お題は「' + String(topic || '') + '」です。\n' +
      'これから' + String(count) + '枚の絵を順番に見せます。それぞれについて、お題らしさ・伝わりやすさ・工夫を基準に0〜100点で採点し、' +
      '日本語20文字以内のポジティブな一言コメントを付けてください。\n' +
      'コメントは子供も読めるように、ひらがなとカタカナだけで書いてください（漢字は使わないこと）。\n' +
      '点数には差をつけ、同点は避けてください。\n' +
      'indexは提示順の1始まりの番号です。指定されたJSONスキーマの配列のみを返してください。'
    );
  }

  // 採点結果のJSONスキーマ（同室モード: 配列のみ）
  var OEKAKI_JUDGE_SCHEMA = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        index: { type: 'INTEGER' },
        score: { type: 'INTEGER' },
        comment: { type: 'STRING' }
      },
      required: ['index', 'score', 'comment']
    }
  };

  // prompt / schema を差し替えられるようにしてある（リレーモードは別プロンプト・別スキーマ）。
  function oekakiCallGeminiOnce(model, apiKey, prompt, schema, entries) {
    var parts = [{ text: String(prompt || '') }];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      parts.push({ text: '絵' + String(i + 1) + '（プレイヤー: ' + String(e.name || '?') + '）' });
      parts.push({ inline_data: { mime_type: e.mime || 'image/jpeg', data: e.b64 } });
    }
    var body = {
      contents: [{ parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema || OEKAKI_JUDGE_SCHEMA
      }
    };
    var url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var msg = 'Gemini APIエラー (' + String(res.status) + ')';
            try {
              var j = JSON.parse(t);
              if (j && j.error && j.error.message) msg += ': ' + String(j.error.message).slice(0, 200);
            } catch (e2) {
              // ignore
            }
            var err = new Error(msg);
            err.status = res.status;
            throw err;
          });
        }
        return res.json();
      })
      .then(function (json) {
        var text = '';
        try {
          var ps = json.candidates[0].content.parts || [];
          for (var i2 = 0; i2 < ps.length; i2++) {
            if (ps[i2] && typeof ps[i2].text === 'string') text += ps[i2].text;
          }
        } catch (e3) {
          text = '';
        }
        var parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (e4) {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object') throw new Error('AI判定結果の解析に失敗しました');
        return parsed;
      });
  }

  function oekakiCallGemini(apiKey, prompt, schema, entries) {
    var idx = 0;
    function tryNext(lastErr) {
      if (idx >= OEKAKI_GEMINI_MODELS.length) {
        return Promise.reject(lastErr || new Error('Gemini APIに接続できません'));
      }
      var model = OEKAKI_GEMINI_MODELS[idx++];
      return oekakiCallGeminiOnce(model, apiKey, prompt, schema, entries).catch(function (e) {
        // モデル名が無効(404)の場合のみ次の候補を試す。
        if (e && e.status === 404 && idx < OEKAKI_GEMINI_MODELS.length) return tryNext(e);
        throw e;
      });
    }
    return tryNext(null);
  }

  function oekakiParseDataUrl(dataUrl) {
    var img = String(dataUrl || '');
    if (img.indexOf('data:') !== 0) return null;
    var comma = img.indexOf(';base64,');
    if (comma <= 5) return null;
    var b64 = img.slice(comma + 8);
    if (!b64) return null;
    return { mime: img.slice(5, comma) || 'image/jpeg', b64: b64 };
  }

  // 結果発表をあえて遅らせる（judgingAt から最低 OEKAKI_JUDGE_MIN_MS 経過するまで待つ）。
  function oekakiSuspenseDelay(room) {
    var startedAt = parseIntSafe(room && room.judgingAt, 0) || serverNowMs();
    var waitMs = Math.max(0, OEKAKI_JUDGE_MIN_MS - (serverNowMs() - startedAt));
    return new Promise(function (resolve) {
      setTimeout(resolve, waitMs);
    });
  }

  // 判定の実行（claim勝者のみ呼ぶこと）。API失敗時もresultを書いてresultフェーズへ進める。
  function oekakiRunJudge(roomId, room) {
    var topic = String((room && room.round && room.round.topic) || '');
    var roundIndex = parseIntSafe(room && room.round && room.round.index, 1);
    var players = (room && room.players) || {};
    var order = room && room.settings && Array.isArray(room.settings.order) ? room.settings.order : Object.keys(players);

    var entries = [];
    for (var i = 0; i < order.length; i++) {
      var pid = String(order[i] || '');
      if (!pid) continue;
      var p = players[pid];
      if (!p) continue;
      if (parseIntSafe(p.round, 0) !== roundIndex) continue;
      var parsed = oekakiParseDataUrl(p.image);
      if (!parsed) continue;
      entries.push({ pid: pid, name: String(p.name || ''), b64: parsed.b64, mime: parsed.mime });
    }

    function noScoreEntries() {
      return entries.map(function (e) {
        return { pid: e.pid, name: e.name, comment: '' };
      });
    }

    if (!entries.length) {
      return oekakiWriteResult(roomId, {
        judgedAt: serverNowMs(),
        entries: [],
        error: 'ていしゅつされた えが ありませんでした'
      });
    }

    return ensureGeminiKeyLoaded().then(function (apiKey) {
      if (!apiKey) {
        return oekakiWriteResult(roomId, {
          judgedAt: serverNowMs(),
          entries: noScoreEntries(),
          error: 'AIのキーが みせってい なので、さいてんなしで はっぴょうします（セットアップがめんで せっていできます）'
        });
      }

      return oekakiCallGemini(apiKey, oekakiJudgePrompt(topic, entries.length), OEKAKI_JUDGE_SCHEMA, entries)
      .then(function (res) {
        var arr = Array.isArray(res) ? res : [];
        var scored = entries.map(function (e, i2) {
          var hit = null;
          for (var j = 0; j < arr.length; j++) {
            var a = arr[j];
            if (a && parseIntSafe(a.index, -1) === i2 + 1) {
              hit = a;
              break;
            }
          }
          return {
            pid: e.pid,
            name: e.name,
            score: hit ? clamp(parseIntSafe(hit.score, 0), 0, 100) : 0,
            comment: hit ? String(hit.comment || '').slice(0, 60) : ''
          };
        });
        scored.sort(function (a, b) {
          return (b.score || 0) - (a.score || 0);
        });
        var rank = 0;
        var prevScore = null;
        for (var k2 = 0; k2 < scored.length; k2++) {
          if (prevScore === null || scored[k2].score !== prevScore) {
            rank = k2 + 1;
            prevScore = scored[k2].score;
          }
          scored[k2].rank = rank;
        }
        // ドキドキ演出: 最低時間が経つまで結果を出さない
        return oekakiSuspenseDelay(room).then(function () {
          return oekakiWriteResult(roomId, { judgedAt: serverNowMs(), entries: scored, error: null });
        });
      })
      .catch(function (e) {
        return oekakiWriteResult(roomId, {
          judgedAt: serverNowMs(),
          entries: noScoreEntries(),
          error: 'AIはんてい に しっぱいしました: ' + String((e && e.message) || e)
        });
      });
    });
  }

  // ==================== oekaki battle relay (logic) ====================
  // 2人専用の投稿型おえかきバトル。ロビーもQRも使わず、URLをLINE等で手渡しして進める。
  //
  //   ホスト(a) が設定 → a が先に描いて提出 → URLを相手に渡す
  //     → 挑戦者(b) が同じお題を描いて提出 → b の端末でAI採点 → b が結果を見る
  //     → b が結果共有URLをホストに返す（「再戦を申し込む」を選ぶと b が次戦の設定も決める）
  //     → a が結果を見て、再戦が申し込まれていれば次戦を開始する（以降ループ）
  //
  // 部屋のURLは最初から最後まで同じなので、共有は「同じリンクを送り返すだけ」で済む。

  var OKR_SLOT_LS_PREFIX = 'bbg_okrelay_slot_v1_';
  // 「はじめる」を押してから実際に描き始めるまでのリード時間（3・2・1 カウントダウン用）。
  var OKR_LEAD_MS = 4000;
  // 結果発表までのタメ（AI応答が速くてもこの時間は判定中の演出を見せる）。
  var OKR_JUDGE_MIN_MS = 8000;
  // 判定担当（b）の端末が落ちた場合に、もう一方が判定を引き取れるようになるまでの待ち時間。
  var OKR_JUDGE_TAKEOVER_MS = 60000;

  function okrSlotStorageKey(roomId) {
    return OKR_SLOT_LS_PREFIX + String(roomId || '');
  }

  function okrLoadSlot(roomId) {
    try {
      var v = String(localStorage.getItem(okrSlotStorageKey(roomId)) || '');
      return v === 'a' || v === 'b' ? v : '';
    } catch (e) {
      return '';
    }
  }

  function okrSaveSlot(roomId, slot) {
    var s = slot === 'a' || slot === 'b' ? slot : '';
    try {
      if (!s) localStorage.removeItem(okrSlotStorageKey(roomId));
      else localStorage.setItem(okrSlotStorageKey(roomId), s);
    } catch (e) {
      // ignore
    }
  }

  function okrOtherSlot(slot) {
    return slot === 'a' ? 'b' : 'a';
  }

  function okrRoundIndex(room) {
    return parseIntSafe(room && room.round && room.round.index, 1);
  }

  function okrPlayer(room, slot) {
    var players = (room && room.players) || {};
    return players[slot] || null;
  }

  function okrName(room, slot) {
    var p = okrPlayer(room, slot);
    var nm = String((p && p.name) || '').trim();
    return nm || (slot === 'a' ? 'ホスト' : 'チャレンジャー');
  }

  // まだリンクを渡していない＝相手が席についていない段階では名前を出せないので「相手」と呼ぶ。
  function okrNameOrGeneric(room, slot) {
    return okrPlayer(room, slot) ? okrName(room, slot) : '相手';
  }

  // 現ラウンドで提出済みか（前ラウンドの絵が残っていても誤判定しないよう round も見る）。
  function okrHasSubmitted(room, slot) {
    var p = okrPlayer(room, slot);
    return !!(p && p.image && parseIntSafe(p.round, 0) === okrRoundIndex(room));
  }

  // 現ラウンドの持ち時間を開始済みか（＝「はじめる」を押して endsAt が入っているか）。
  function okrHasStarted(room, slot) {
    var p = okrPlayer(room, slot);
    return !!(p && parseIntSafe(p.endsAt, 0) > 0 && parseIntSafe(p.startedRound, 0) === okrRoundIndex(room));
  }

  function okrEndsAt(room, slot) {
    var p = okrPlayer(room, slot);
    if (!okrHasStarted(room, slot)) return 0;
    return parseIntSafe(p.endsAt, 0);
  }

  // いま誰の番か。'a' → 'b' → 'judging' → 'result' の順に進む。
  function okrStage(room) {
    var phase = String((room && room.phase) || '');
    if (phase === 'result') return 'result';
    if (phase === 'judging') return 'judging';
    if (!okrHasSubmitted(room, 'a')) return 'a';
    if (!okrHasSubmitted(room, 'b')) return 'b';
    return 'judging';
  }

  function createOekakiRelayRoom(roomId, settings, topic, hostName) {
    var s = normalizeOekakiLobbySettings(settings);
    var room = {
      createdAt: serverNowMs(),
      relay: true,
      phase: 'drawing',
      settings: {
        drawSeconds: s.drawSeconds,
        topicMode: s.topicMode,
        topicAge: s.topicAge,
        setBy: 'a'
      },
      round: {
        index: 1,
        topic: String(topic || '')
      },
      players: {
        a: { name: String(hostName || '').trim() || 'ホスト', joinedAt: serverNowMs(), isHost: true }
      }
    };
    return setValue(oekakiRelayRoomPath(roomId), room);
  }

  // 挑戦者スロット(b)の確保。同時に開かれても1人だけが取れるよう claim トークンで判定する。
  // 取れたら true、すでに埋まっていたら false（呼び出し側は観戦者として扱う）。
  function okrJoinChallenger(roomId, name, token) {
    var nm = String(name || '').trim() || 'チャレンジャー';
    var tk = String(token || '');
    return runTxn(oekakiRelayRoomPath(roomId) + '/players/b', function (p) {
      if (p) return p; // 先着がいる場合は上書きしない
      return { name: nm, joinedAt: serverNowMs(), claim: tk };
    }).then(function (p) {
      return !!(p && String(p.claim || '') === tk);
    });
  }

  // 自分の持ち時間を開始する（相手とは非同期なので endsAt はプレイヤーごとに持つ）。
  function okrStartTurn(roomId, slot, roundIndex, drawSeconds) {
    var sec = clamp(parseIntSafe(drawSeconds, 90), 30, 600);
    var rIdx = parseIntSafe(roundIndex, 1);
    return runTxn(oekakiRelayRoomPath(roomId) + '/players/' + slot, function (p) {
      if (!p) return p;
      // 同じラウンドで開始済みなら上書きしない（再読み込みで時間が延びるのを防ぐ）。
      if (parseIntSafe(p.startedRound, 0) === rIdx && parseIntSafe(p.endsAt, 0) > 0) return p;
      return assign({}, p, {
        startedRound: rIdx,
        startedAt: serverNowMs(),
        endsAt: serverNowMs() + sec * 1000 + OKR_LEAD_MS
      });
    });
  }

  // 時間切れで描けないまま画面を閉じてしまった場合の救済（同じラウンドをもう一度開始）。
  function okrRestartTurn(roomId, slot, roundIndex, drawSeconds) {
    var sec = clamp(parseIntSafe(drawSeconds, 90), 30, 600);
    var rIdx = parseIntSafe(roundIndex, 1);
    return runTxn(oekakiRelayRoomPath(roomId) + '/players/' + slot, function (p) {
      if (!p) return p;
      if (p.image && parseIntSafe(p.round, 0) === rIdx) return p; // 提出済みならやり直させない
      return assign({}, p, {
        startedRound: rIdx,
        startedAt: serverNowMs(),
        endsAt: serverNowMs() + sec * 1000 + OKR_LEAD_MS
      });
    });
  }

  // 画像はプレイヤーノード単位のトランザクションで書く（相手の画像を含む部屋全体の送信を避ける）。
  function okrSubmit(roomId, slot, roundIndex, dataUrl) {
    var rIdx = parseIntSafe(roundIndex, 1);
    return runTxn(oekakiRelayRoomPath(roomId) + '/players/' + slot, function (p) {
      if (!p) return p;
      if (p.image && parseIntSafe(p.round, 0) === rIdx) return p;
      return assign({}, p, {
        image: String(dataUrl || ''),
        submittedAt: serverNowMs(),
        round: rIdx
      });
    });
  }

  // 判定権をCASで奪う（二重判定の防止）。勝った端末だけが true を受け取る。
  // fromPhase: 'drawing'（通常）/ 'judging'（固まった部屋の引き取り）/ 'result'（再判定）
  function okrClaimJudging(roomId, token, fromPhase) {
    var tk = String(token || '');
    var from = String(fromPhase || 'drawing');
    return runTxn(oekakiRelayRoomPath(roomId), function (room) {
      if (!room) return room;
      if (room.phase !== from) return room;
      if (!okrHasSubmitted(room, 'a') || !okrHasSubmitted(room, 'b')) return room;
      return assign({}, room, { phase: 'judging', judgeToken: tk, judgingAt: serverNowMs(), result: null });
    }).then(function (room) {
      return !!(room && room.phase === 'judging' && String(room.judgeToken || '') === tk);
    });
  }

  function okrWriteResult(roomId, result) {
    return runTxn(oekakiRelayRoomPath(roomId), function (room) {
      if (!room) return room;
      if (room.phase !== 'judging') return room;
      return assign({}, room, { phase: 'result', result: result || null });
    });
  }

  // 再戦。直前の結果は prevResult に退避して、相手が結果を見られる状態を保ったまま次戦を用意する。
  // 設定を決めるのは申し込んだ側（bySlot）だが、先に描くのは常にホスト(a)。
  function okrRematch(roomId, settings, topic, bySlot) {
    var s = normalizeOekakiLobbySettings(settings);
    var by = bySlot === 'b' ? 'b' : 'a';
    return runTxn(oekakiRelayRoomPath(roomId), function (room) {
      if (!room) return room;
      if (room.phase !== 'result') return room;

      var players = {};
      var src = room.players || {};
      for (var k in src) {
        if (!hasOwn.call(src, k)) continue;
        var p = src[k] || {};
        players[k] = { name: p.name || '', joinedAt: p.joinedAt || serverNowMs() };
        if (p.isHost) players[k].isHost = true;
      }

      // 次戦の準備で players の画像を消すので、前回の結果カードが「画像なし」に
      // ならないよう、結果のほうに絵を持たせてから退避する。
      var prev = room.result || null;
      if (prev && Array.isArray(prev.entries)) {
        prev = assign({}, prev, {
          entries: prev.entries.map(function (en) {
            var sp = src[String((en && en.slot) || '')] || {};
            return en && !en.image && sp.image ? assign({}, en, { image: String(sp.image) }) : en;
          })
        });
      }

      return assign({}, room, {
        phase: 'drawing',
        settings: {
          drawSeconds: s.drawSeconds,
          topicMode: s.topicMode,
          topicAge: s.topicAge,
          setBy: by
        },
        round: {
          index: okrRoundIndex(room) + 1,
          topic: String(topic || '')
        },
        players: players,
        prevResult: prev,
        rematchBy: by,
        rematchAt: serverNowMs(),
        result: null,
        judgeToken: null,
        judgingAt: null
      });
    });
  }

  // -------------------- oekaki battle relay (AI judging) --------------------

  // リレーモードは「仲の良い大人同士でけなし合って笑う」前提の煽り採点。
  // 勝った側は全力で持ち上げ、負けた側はボロクソに言う。
  // ただし攻撃対象は必ず「絵の出来」だけに限定する（人格・容姿・属性への攻撃はプロンプトで明確に禁止）。
  // これは倫理面だけでなく、Geminiの安全フィルタで採点ごと落ちるのを防ぐ意味もある。
  function okrJudgePrompt(topic) {
    return (
      'あなたは2人対戦「おえかきバトル」の実況審査員です。お題は「' + String(topic || '') + '」。\n' +
      'これから2枚の絵を順番に見せます。お題らしさ・伝わりやすさ・工夫を基準に0〜100点で採点してください。\n' +
      '必ず点差をつけ、同点にはしないこと。\n' +
      'そのうえで、それぞれにコメントを付けます。\n' +
      '・点数が高いほうのコメント: これでもかというくらい大げさに、全力で褒めちぎる（天才・レジェンド級の絶賛）。\n' +
      '・点数が低いほうのコメント: 一切ためらわず、ボロクソにけなす（毒舌・煽り全開でよい）。\n' +
      'コメントは日本語で40〜80文字程度、テンション高めのタメ口。\n' +
      'また verdict に、勝敗を告げる煽り実況を60文字以内で書いてください。\n' +
      '【厳守】けなす対象は「その絵の出来ばえ」だけに限定すること。' +
      '容姿・人格・知性・性別・年齢・出身・職業など、人そのものへの攻撃や差別的表現、' +
      '暴力的・性的な表現は絶対に使わないこと。友達同士で笑える範囲のイジりに収めること。\n' +
      'indexは提示順の1始まりの番号です。指定されたJSONスキーマのオブジェクトのみを返してください。'
    );
  }

  var OKR_JUDGE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      entries: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            index: { type: 'INTEGER' },
            score: { type: 'INTEGER' },
            comment: { type: 'STRING' }
          },
          required: ['index', 'score', 'comment']
        }
      },
      verdict: { type: 'STRING' }
    },
    required: ['entries', 'verdict']
  };

  function okrSuspenseDelay(room) {
    var startedAt = parseIntSafe(room && room.judgingAt, 0) || serverNowMs();
    var waitMs = Math.max(0, OKR_JUDGE_MIN_MS - (serverNowMs() - startedAt));
    return new Promise(function (resolve) {
      setTimeout(resolve, waitMs);
    });
  }

  // 判定の実行（claim勝者のみ呼ぶこと）。API失敗時も result を書いて result フェーズへ進める。
  function okrRunJudge(roomId, room) {
    var topic = String((room && room.round && room.round.topic) || '');
    var roundIndex = okrRoundIndex(room);
    var slots = ['a', 'b'];

    var entries = [];
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var p = okrPlayer(room, slot);
      if (!p || parseIntSafe(p.round, 0) !== roundIndex) continue;
      var parsed = oekakiParseDataUrl(p.image);
      if (!parsed) continue;
      entries.push({ slot: slot, name: okrName(room, slot), b64: parsed.b64, mime: parsed.mime });
    }

    function noScoreEntries() {
      return entries.map(function (e) {
        return { slot: e.slot, name: e.name, comment: '' };
      });
    }

    if (entries.length < 2) {
      return okrWriteResult(roomId, {
        judgedAt: serverNowMs(),
        round: roundIndex,
        entries: noScoreEntries(),
        verdict: '',
        error: '2人ぶんの絵がそろわなかったので採点できませんでした'
      });
    }

    return ensureGeminiKeyLoaded().then(function (apiKey) {
      if (!apiKey) {
        return okrWriteResult(roomId, {
          judgedAt: serverNowMs(),
          round: roundIndex,
          entries: noScoreEntries(),
          verdict: '',
          error: 'Gemini APIキーが未設定のため、採点なしで発表します（⚙️せってい で設定できます）'
        });
      }

      return oekakiCallGemini(apiKey, okrJudgePrompt(topic), OKR_JUDGE_SCHEMA, entries)
        .then(function (res) {
          var arr = res && Array.isArray(res.entries) ? res.entries : [];
          var scored = entries.map(function (e, i2) {
            var hit = null;
            for (var j = 0; j < arr.length; j++) {
              var a = arr[j];
              if (a && parseIntSafe(a.index, -1) === i2 + 1) {
                hit = a;
                break;
              }
            }
            return {
              slot: e.slot,
              name: e.name,
              score: hit ? clamp(parseIntSafe(hit.score, 0), 0, 100) : 0,
              comment: hit ? String(hit.comment || '').slice(0, 200) : ''
            };
          });
          scored.sort(function (x, y) {
            return (y.score || 0) - (x.score || 0);
          });
          var rank = 0;
          var prevScore = null;
          for (var k2 = 0; k2 < scored.length; k2++) {
            if (prevScore === null || scored[k2].score !== prevScore) {
              rank = k2 + 1;
              prevScore = scored[k2].score;
            }
            scored[k2].rank = rank;
          }
          return okrSuspenseDelay(room).then(function () {
            return okrWriteResult(roomId, {
              judgedAt: serverNowMs(),
              round: roundIndex,
              entries: scored,
              verdict: String((res && res.verdict) || '').slice(0, 200),
              error: null
            });
          });
        })
        .catch(function (e) {
          return okrWriteResult(roomId, {
            judgedAt: serverNowMs(),
            round: roundIndex,
            entries: noScoreEntries(),
            verdict: '',
            error: 'AI採点に失敗しました: ' + String((e && e.message) || e)
          });
        });
    });
  }

  // -------------------- hannin (犯人は踊る) --------------------
  // NOTE: This is UI metadata (labels/icons). Game rules/effects are implemented separately.
  var HANNIN_CARD_DEFS = {
    culprit: { name: '犯人', desc: '', icon: './assets/hannin/犯人.png' },
    detective: { name: '探偵', desc: '', icon: './assets/hannin/探偵.png' },
    dog: { name: 'いぬ', desc: '', icon: './assets/hannin/いぬ.png' },
    boy: { name: '少年', desc: '', icon: './assets/hannin/少年.png' },
    witness: { name: '目撃者', desc: '', icon: './assets/hannin/目撃者.png' },
    alibi: { name: 'アリバイ', desc: '', icon: './assets/hannin/アリバイ.png' },
    info: { name: '情報操作', desc: '', icon: './assets/hannin/情報操作.png' },
    deal: { name: '取引', desc: '', icon: './assets/hannin/取引.png' },
    first: { name: '第一発見者', desc: '', icon: './assets/hannin/第一発見者.png' },
    rumor: { name: 'うわさ', desc: '', icon: './assets/hannin/うわさ.png' },
    plot: { name: 'たくらみ', desc: '', icon: './assets/hannin/たくらみ.png' },
    citizen: { name: '一般人', desc: '', icon: './assets/hannin/一般人.png' }
  };

  function hnCardImgHtml(cardId) {
    var id = String(cardId || '');
    var def = HANNIN_CARD_DEFS[id] || { name: id || '-', icon: '' };
    var icon = def && def.icon ? String(def.icon) : '';
    if (!icon) return '';
    return '<img class="ll-card-img" alt="' + escapeHtml(def.name || id) + '" src="' + escapeHtml(icon) + '" />';
  }

  function hnCardBackImgHtml() {
    var backIcon = './assets/hannin/犯人は踊る裏面.png';
    try {
      var v = getCacheBusterParam();
      if (v) backIcon += '?v=' + encodeURIComponent(String(v));
    } catch (e0) {
      // ignore
    }
    return '<img class="ll-card-img" alt="裏面" src="' + escapeHtml(backIcon) + '" />';
  }

  function hnTestPlayerLabel(pid) {
    return '';
  }

  function hnIsTestPlayerId(pid) {
    return false;
  }

  function hnGraveIconHtml(cardId) {
    var id = String(cardId || '');
    var def = HANNIN_CARD_DEFS[id] || { name: id || '-', icon: '' };
    var icon = def && def.icon ? String(def.icon) : '';
    if (!icon) return '';
    return '<img class="ll-grave-icon" draggable="false" alt="' + escapeHtml(def.name || id) + '" src="' + escapeHtml(icon) + '" />';
  }

  function llCardRankStr(cardId) {
    var s = String(cardId || '');
    // Card IDs may include variants like "7:countess". Base rank is the leading number.
    var m = /^([0-9]+)/.exec(s);
    return m ? String(m[1] || '') : s;
  }

  function llCardRank(cardId) {
    return parseIntSafe(llCardRankStr(cardId), 0) || 0;
  }

  function llCardDef(rank) {
    var k = String(rank || '');
    var direct = LOVELETTER_CARD_DEFS[k];
    if (direct) return direct;
    var base = llCardRankStr(k);
    return LOVELETTER_CARD_DEFS[base] || { rank: parseIntSafe(base, 0) || 0, name: k || '-', desc: '', icon: '' };
  }

  function llNormalizeExtraCards(extraCards) {
    if (!Array.isArray(extraCards) || !extraCards.length) return [];
    var allowed = { '7:countess': 1, '8:megane': 1 };
    var out = [];
    var seen = {};
    for (var i = 0; i < extraCards.length; i++) {
      var id = String(extraCards[i] || '').trim();
      if (!id) continue;
      if (!allowed[id]) continue;
      if (seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function llTokenGoalForPlayerCount(n) {
    var c = parseIntSafe(n, 0) || 0;
    if (c <= 2) return 7;
    if (c === 3) return 5;
    return 4;
  }

  function llBuildDeck(settings) {
    var out = [];
    function pushMany(rank, count) {
      for (var i = 0; i < count; i++) out.push(String(rank));
    }
    // Standard 16-card deck.
    pushMany(1, 5);
    pushMany(2, 2);
    pushMany(3, 2);
    pushMany(4, 2);
    pushMany(5, 2);
    pushMany(6, 1);
    pushMany(7, 1);
    pushMany(8, 1);

    // Optional extra cards (each max 1)
    try {
      var extras = llNormalizeExtraCards(settings && settings.extraCards);
      for (var e = 0; e < extras.length; e++) out.push(String(extras[e]));
    } catch (e0) {
      // ignore
    }
    return out;
  }

  function llShuffle(arr) {
    var a = Array.isArray(arr) ? arr : [];
    for (var i = a.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function llListPlayerIdsByJoin(room) {
    var ps = (room && room.players) || {};
    var keys = Object.keys(ps);
    keys.sort(function (a, b) {
      var pa = ps[a] || {};
      var pb = ps[b] || {};
      return (pa.joinedAt || 0) - (pb.joinedAt || 0);
    });

    // If an explicit order is provided (e.g., from lobby), respect it.
    try {
      var preferred = room && room.settings && Array.isArray(room.settings.order) ? room.settings.order : null;
      if (preferred && preferred.length) {
        var seen = {};
        var out = [];
        for (var i = 0; i < preferred.length; i++) {
          var id = String(preferred[i] || '');
          if (!id) continue;
          if (seen[id]) continue;
          if (!ps[id]) continue;
          seen[id] = true;
          out.push(id);
        }
        for (var j = 0; j < keys.length; j++) {
          var k = String(keys[j] || '');
          if (!k || seen[k]) continue;
          seen[k] = true;
          out.push(k);
        }
        return out;
      }
    } catch (e) {
      // ignore and fallback to join order
    }

    return keys;
  }

  function llFindHostId(room) {
    try {
      var ps = (room && room.players) || {};
      var keys = Object.keys(ps);
      for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        if (ps[id] && ps[id].isHost) return id;
      }
    } catch (e) {
      // ignore
    }
    return '';
  }

  function llAppendLog(room, text) {
    var log = [];
    try {
      log = Array.isArray(room && room.log) ? room.log.slice() : [];
    } catch (e) {
      log = [];
    }
    if (log.length > 40) log = log.slice(log.length - 40);
    log.push({ at: serverNowMs(), text: String(text || '') });
    if (log.length > 40) log = log.slice(log.length - 40);
    return log;
  }

  function llMustPlayCountess(hand) {
    // Extra card rule (7:countess):
    // If you have the Countess and your hand total is 12 or more, you must play the Countess.
    if (!Array.isArray(hand) || hand.length < 2) return false;
    var hasCountess = false;
    var total = 0;
    for (var i = 0; i < hand.length; i++) {
      var cid = String(hand[i] || '');
      if (!cid) continue;
      if (cid === '7:countess') hasCountess = true;
      total += llCardRank(cid) || 0;
    }
    return hasCountess && total >= 12;
  }

  function llDrawFromRound(round) {
    if (!round) return '';
    var deck = Array.isArray(round.deck) ? round.deck : [];
    if (deck.length) {
      return String(deck.pop());
    }
    return '';
  }

  function llEliminate(round, playerId, reason) {
    if (!round) return;
    if (!round.eliminated) round.eliminated = {};
    if (round.eliminated[playerId]) return;
    round.eliminated[playerId] = true;
    if (!round.discards) round.discards = {};
    if (!round.hands) round.hands = {};
    if (!round.protected) round.protected = {};
    var hand = Array.isArray(round.hands[playerId]) ? round.hands[playerId] : [];
    var disc = Array.isArray(round.discards[playerId]) ? round.discards[playerId] : [];
    for (var i = 0; i < hand.length; i++) {
      disc.push(String(hand[i]));
    }
    round.discards[playerId] = disc;
    round.hands[playerId] = [];
    round.protected[playerId] = false;
    if (reason) {
      // optional hook for future: round.elimReason[playerId] = String(reason)
    }
  }

  function llAliveIds(room, round) {
    var ids = llListPlayerIdsByJoin(room);
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!round || !round.eliminated || !round.eliminated[id]) out.push(id);
    }
    return out;
  }

  function llFindNextAlive(round, order, startIndexExclusive) {
    if (!round || !Array.isArray(order) || !order.length) return { id: '', index: -1 };
    var n = order.length;
    for (var step = 1; step <= n; step++) {
      var idx = (startIndexExclusive + step) % n;
      var pid = order[idx];
      if (!pid) continue;
      if (round.eliminated && round.eliminated[pid]) continue;
      return { id: pid, index: idx };
    }
    return { id: '', index: -1 };
  }

  function llRoundWinners(room, round) {
    var ids = llAliveIds(room, round);
    if (ids.length <= 1) return ids;

    var bestHand = -1;
    var best = [];
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      var hand = round && round.hands && Array.isArray(round.hands[pid]) ? round.hands[pid] : [];
      var v = hand.length ? llCardRank(hand[0]) : 0;
      if (v > bestHand) {
        bestHand = v;
        best = [pid];
      } else if (v === bestHand) {
        best.push(pid);
      }
    }

    if (best.length <= 1) return best;

    // Tie-break: sum of discarded ranks.
    var bestSum = -1;
    var best2 = [];
    for (var j = 0; j < best.length; j++) {
      var pid2 = best[j];
      var disc = round && round.discards && Array.isArray(round.discards[pid2]) ? round.discards[pid2] : [];
      var s = 0;
      for (var k = 0; k < disc.length; k++) s += llCardRank(disc[k]) || 0;
      if (s > bestSum) {
        bestSum = s;
        best2 = [pid2];
      } else if (s === bestSum) {
        best2.push(pid2);
      }
    }
    return best2;
  }

  function createLoveLetterRoom(roomId, settings) {
    var base = loveletterRoomPath(roomId);
    var st = {};
    try {
      if (settings && Array.isArray(settings.order)) st.order = settings.order.slice();
    } catch (e0) {
      st = {};
    }
    var room = {
      createdAt: serverNowMs(),
      phase: 'lobby',
      settings: st,
      log: [],
      round: {
        no: 0,
        state: 'none'
      },
      players: {}
    };
    return setValue(base, room);
  }

  function createHanninRoom(roomId, settings) {
    var base = hanninRoomPath(roomId);
    var st = {};
    try {
      if (settings && Array.isArray(settings.order)) st.order = settings.order.slice();
    } catch (e0) {
      st = {};
    }

    var room = {
      createdAt: serverNowMs(),
      phase: 'lobby',
      settings: st,
      players: {},
      state: {
        order: Array.isArray(st.order) ? st.order.slice() : [],
        hands: {},
        graveyard: [],
        used: {},
        turn: { index: 0, playerId: '' },
        log: [],
        result: { winner: '', decidedAt: 0, reason: '' }
      }
    };
    return setValue(base, room);
  }

  function joinPlayerInHanninRoom(roomId, playerId, name, isHostPlayer) {
    var base = hanninRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var players = assign({}, room.players || {});
      var prev = players[playerId] || {};
      var next = assign({}, prev, {
        name: name,
        joinedAt: prev.joinedAt || serverNowMs(),
        lastSeenAt: serverNowMs()
      });
      if (isHostPlayer) next.isHost = true;
      players[playerId] = next;

      var st = assign({}, room.state || {});
      if (!Array.isArray(st.order)) st.order = [];
      if (st.order.indexOf(playerId) === -1) st.order = st.order.concat([playerId]);

      return assign({}, room, { players: players, state: st });
    });
  }

  function hnShuffle(list) {
    var a = Array.isArray(list) ? list.slice() : [];
    for (var i = a.length - 1; i > 0; i--) {
      var r = randomInt(i + 1);
      var t = a[i];
      a[i] = a[r];
      a[r] = t;
    }
    return a;
  }

  function hnBuildDeck(playerCount) {
    var n = parseIntSafe(playerCount, 0) || 0;
    var need = n > 0 ? 4 * n : 0;
    if (need <= 0) return [];

    var pool = [];
    function addMany(id, count) {
      var c = parseIntSafe(count, 0) || 0;
      for (var i = 0; i < c; i++) pool.push(String(id));
    }

    // Card totals (32):
    // culprit/dog/first/boy x1
    // citizen/plot x2
    // witness/info x3
    // detective/rumor x4
    // alibi/deal x5
    addMany('culprit', 1);
    addMany('dog', 1);
    addMany('first', 1);
    addMany('boy', 1);
    addMany('citizen', 2);
    addMany('plot', 2);
    addMany('witness', 3);
    addMany('info', 3);
    addMany('detective', 4);
    addMany('rumor', 4);
    addMany('alibi', 5);
    addMany('deal', 5);

    if (n >= 8) return hnShuffle(pool);

    var mandatory = [];
    function takeMandatory(id, count) {
      var c = parseIntSafe(count, 0) || 0;
      for (var i = 0; i < c; i++) mandatory.push(String(id));
    }

    if (n === 3) {
      takeMandatory('first', 1);
      takeMandatory('culprit', 1);
      takeMandatory('detective', 1);
      takeMandatory('alibi', 1);
    } else if (n === 4) {
      takeMandatory('first', 1);
      takeMandatory('culprit', 1);
      takeMandatory('detective', 1);
      takeMandatory('alibi', 1);
      takeMandatory('plot', 1);
    } else if (n === 5) {
      takeMandatory('first', 1);
      takeMandatory('culprit', 1);
      takeMandatory('detective', 1);
      takeMandatory('alibi', 2);
      takeMandatory('plot', 1);
    } else if (n === 6) {
      takeMandatory('first', 1);
      takeMandatory('culprit', 1);
      takeMandatory('detective', 2);
      takeMandatory('alibi', 2);
      takeMandatory('plot', 2);
    } else if (n === 7) {
      takeMandatory('first', 1);
      takeMandatory('culprit', 1);
      takeMandatory('detective', 2);
      takeMandatory('alibi', 3);
      takeMandatory('plot', 2);
    } else {
      // Fallback: use all cards, then slice.
      return hnShuffle(pool).slice(0, need);
    }

    // Remove mandatory cards from pool.
    var remaining = pool.slice();
    for (var m = 0; m < mandatory.length; m++) {
      var id = mandatory[m];
      var idx = remaining.indexOf(id);
      if (idx < 0) return [];
      remaining.splice(idx, 1);
    }

    var out = mandatory.slice();
    remaining = hnShuffle(remaining);
    while (out.length < need && remaining.length) out.push(remaining.shift());
    if (out.length !== need) return [];
    return hnShuffle(out);
  }

  function hnFindFirstHolder(order, hands) {
    if (!Array.isArray(order)) return '';
    for (var i = 0; i < order.length; i++) {
      var pid = String(order[i] || '');
      if (!pid) continue;
      var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
      for (var k = 0; k < h.length; k++) {
        if (String(h[k] || '') === 'first') return pid;
      }
    }
    return order.length ? String(order[0] || '') : '';
  }

  function dealHanninGame(roomId) {
    var base = hanninRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var st = assign({}, room.state || {});
      var order = Array.isArray(st.order) ? st.order.slice() : [];
      if (!order.length) {
        // Fall back to player join order.
        var keys = Object.keys(room.players || {});
        keys.sort();
        order = keys;
      }

      var n = order.length;
      if (n < 3) return room;

      var deck = hnBuildDeck(n);
      if (deck.length < 4 * n) return room;

      var hands = {};
      var used = {};
      var idx = 0;
      for (var i = 0; i < order.length; i++) {
        var pid = String(order[i] || '');
        if (!pid) continue;
        hands[pid] = [String(deck[idx++]), String(deck[idx++]), String(deck[idx++]), String(deck[idx++])];
        used[pid] = [];
      }

      var firstPid = hnFindFirstHolder(order, hands);
      st.order = order;
      st.hands = hands;
      st.graveyard = [];
      st.used = used;
      // Start rule: the player who holds "first" starts, and only "first" can be played until it is used.
      var firstIdx = order.indexOf(String(firstPid || ''));
      if (firstIdx < 0) firstIdx = 0;
      st.turn = { index: firstIdx, playerId: String(order[firstIdx] || '') };
      st.started = false;
      st.turnCount = 0;
      st.pending = null;
      st.waitFor = null;
      st.allies = {};
      st.lastPlay = { at: 0, playerId: '', cardId: '' };
      st.result = { side: '', winners: [], culpritId: '', decidedAt: 0, reason: '' };
      st.deckInfo = { playerCount: n, usedCount: deck.length };
      st.log = ['配布しました。第一発見者の番です（第一発見者を使用して開始）'];

      return assign({}, room, { phase: 'playing', state: st });
    });
  }

  function hnNextTurn(order, currentPid) {
    if (!Array.isArray(order) || !order.length) return { index: 0, playerId: '' };
    var cur = String(currentPid || '');
    var idx = order.indexOf(cur);
    if (idx < 0) idx = 0;
    var nextIdx = (idx + 1) % order.length;
    return { index: nextIdx, playerId: String(order[nextIdx] || '') };
  }

  function hnNextTurnSkipEmpty(order, currentPid, hands) {
    if (!Array.isArray(order) || !order.length) return { index: 0, playerId: '' };
    var cur = String(currentPid || '');
    var startIdx = order.indexOf(cur);
    if (startIdx < 0) startIdx = 0;

    for (var step = 1; step <= order.length; step++) {
      var idx = (startIdx + step) % order.length;
      var pid = String(order[idx] || '');
      if (!pid) continue;
      var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
      if (h && h.length) return { index: idx, playerId: pid };
    }

    // Fallback: no one has cards.
    return hnNextTurn(order, currentPid);
  }

  function hnPlayerName(room, pid) {
    try {
      return String((room && room.players && room.players[pid] && room.players[pid].name) || pid || '');
    } catch (e) {
      return String(pid || '');
    }
  }

  function renderHanninPlayer(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;
    var playerId = opts.playerId ? String(opts.playerId) : '';
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';
    var ui = opts.ui || {};
    var isTableGmDevice = !!opts.isTableGmDevice;
    var isHost = !!opts.isHost;

    var players = (room && room.players) || {};
    var st = (room && room.state) || {};
    var hands = (st && st.hands) || {};
    var phase = String((room && room.phase) || '');
    var turnPid = st && st.turn && st.turn.playerId ? String(st.turn.playerId) : '';
    var isMyTurn = !!(turnPid && playerId && String(turnPid) === String(playerId));
    var pending = (st && st.pending) || null;
    var myHand = playerId && hands && Array.isArray(hands[playerId]) ? hands[playerId] : [];

    // Table device should not operate player screens.
    var canOperate = !isTableGmDevice;

    var alreadyChosenInfo = false;
    try {
      alreadyChosenInfo = !!(pending && pending.type === 'info' && pending.choices && pending.choices[String(playerId)] !== undefined);
    } catch (e1) {
      alreadyChosenInfo = false;
    }

    var alreadyChosenRumor = false;
    try {
      alreadyChosenRumor = !!(pending && pending.type === 'rumor' && pending.choices && pending.choices[String(playerId)] !== undefined);
    } catch (e2) {
      alreadyChosenRumor = false;
    }

    var order = Array.isArray(st && st.order) ? st.order.slice() : Object.keys(players || {});
    var rightPid = '';
    var rightCount = 0;
    try {
      function rightWithCards(snapshotHands, fromPid) {
        var from = String(fromPid || '');
        var startIdx = order.indexOf(from);
        if (startIdx < 0) return '';
        for (var step = 1; step < order.length; step++) {
          var cand = String(order[(startIdx + step) % order.length] || '');
          if (!cand) continue;
          var h0 = snapshotHands && Array.isArray(snapshotHands[cand]) ? snapshotHands[cand] : [];
          if (h0.length) return cand;
        }
        return '';
      }

      rightPid = rightWithCards(hands, playerId);
      var rh = rightPid && hands && Array.isArray(hands[rightPid]) ? hands[rightPid] : [];
      rightCount = rh && Array.isArray(rh) ? rh.length : 0;
    } catch (eR0) {
      rightPid = '';
      rightCount = 0;
    }

    var contentHtml = '';

    // "墓地" - show the latest globally discarded card icon (one icon only).
    var pilesHtml = '';
    try {
      var grave = st && Array.isArray(st.graveyard) ? st.graveyard : [];
      var latest = grave && grave.length ? String(grave[grave.length - 1] || '') : '';
      var icons = latest ? hnGraveIconHtml(latest) : '';
      pilesHtml =
        '<div class="ll-piles-box">' +
        '<div class="ll-piles-text">墓地</div>' +
        '<div class="hn-grave-icons">' + icons + '</div>' +
        '</div>';
    } catch (ePile) {
      pilesHtml = '';
    }

    var gmTopHtml = '';

    // Action modal (target/index selection like LoveLetter)
    var modalHtml = '';

    // Confirm modal (for simple plays and pending selections)
    var confirmHtml = '';
    try {
      if (canOperate && ui && ui.hnConfirm && ui.hnConfirm.type) {
        var c = ui.hnConfirm;
        var cType = String(c.type || '');
        var cTitle = '';
        var cBody = '';
        var cErr = '';
        var showOk = true;
        var cancelLabel = 'キャンセル';
        var okLabel = '決定';

        if (cType === 'play') {
          var cCardId = String(c.cardId || '');
          var cDef = HANNIN_CARD_DEFS[cCardId] || { name: cCardId || '-', desc: '' };
          cTitle = String(cDef.name || cCardId) + ' を使用';
          cBody = '<div class="ll-action-card">' + hnCardImgHtml(cCardId) + '</div>';
          if (cDef.desc) cBody += '<div class="muted">' + escapeHtml(String(cDef.desc || '')) + '</div>';
        } else if (cType === 'info') {
          cTitle = '情報操作：このカードを渡す';
          cBody = '<div class="ll-action-card">' + hnCardImgHtml(String(c.cardId || '')) + '</div>';
        } else if (cType === 'rumor') {
          cTitle = 'うわさ：このカードを引く';
          cBody = '<div class="ll-action-card">' + hnCardBackImgHtml() + '</div>';
        } else if (cType === 'deal') {
          cTitle = '取引：このカードを出す';
          cBody = '<div class="ll-action-card">' + hnCardImgHtml(String(c.cardId || '')) + '</div>';
        } else if (cType === 'notice') {
          cTitle = String(c.title || '注意');
          cBody = '<div class="muted center">' + escapeHtml(String(c.message || '')) + '</div>';
          showOk = false;
          cancelLabel = String(c.cancelLabel || 'OK');
        }

        confirmHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop" id="hnConfirmBg"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">' + escapeHtml(cTitle || '確認') + '</div>' +
          (cBody || '') +
          '<div id="hnConfirmError" class="form-error" role="alert">' + cErr + '</div>' +
          '<div class="row ll-modal-actions" style="justify-content:space-between">' +
          '<button class="ghost" id="hnConfirmCancel">' + escapeHtml(cancelLabel) + '</button>' +
          (showOk ? '<button class="primary" id="hnConfirmOk">' + escapeHtml(okLabel) + '</button>' : '') +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }
    } catch (eCfm) {
      confirmHtml = '';
    }

    // Reveal modal (e.g., witness)
    var revealHtml = '';
    try {
      if (canOperate && ui && ui.hnReveal && ui.hnReveal.type === 'witness') {
        var rp = String(ui.hnReveal.targetPid || '');
        var rname = rp ? hnPlayerName(room, rp) : '';
        var rcards = Array.isArray(ui.hnReveal.cards) ? ui.hnReveal.cards.slice() : [];
        var cardsRow = '';
        for (var rci = 0; rci < rcards.length; rci++) {
          cardsRow += '<div class="hn-rumor-card">' + hnCardImgHtml(String(rcards[rci] || '')) + '</div>';
        }
        revealHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop" id="hnRevealBg"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">目撃者</div>' +
          '<div class="muted center">' + escapeHtml(rname ? rname + ' の手札' : '手札') + '</div>' +
          '<div class="hn-rumor-row">' + cardsRow + '</div>' +
          '<div class="row ll-modal-actions" style="justify-content:center">' +
          '<button class="primary" id="hnRevealOk">OK</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }
    } catch (eRev) {
      revealHtml = '';
    }

    // Private modal (e.g., boy reveals culprit holder only to the actor)
    var privateHtml = '';
    try {
      var pmsg = st && st.private && playerId && st.private[String(playerId)] ? st.private[String(playerId)] : null;
      if (pmsg && String(pmsg.type || '') === 'boy') {
        var cpid = String(pmsg.culpritPid || '');
        var cname = cpid ? hnPlayerName(room, cpid) : '';
        privateHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">少年</div>' +
          '<div class="muted center">' +
          escapeHtml(cname ? ('犯人を持っているのは「' + cname + '」です') : '犯人カードの所持者が見つかりません') +
          '</div>' +
          '<div class="row ll-modal-actions" style="justify-content:center">' +
          '<button class="primary" id="hnPrivateOk">OK</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (pmsg && String(pmsg.type || '') === 'detective_alibi') {
        // Back-compat: legacy message (now handled as notice).
        privateHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">探偵</div>' +
          '<div class="muted center">アリバイにより探偵の効果は無効です。</div>' +
          '<div class="row ll-modal-actions" style="justify-content:center">' +
          '<button class="primary" id="hnPrivateOk">OK</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (pmsg && String(pmsg.type || '') === 'witness') {
        var wpid = String(pmsg.targetPid || '');
        var wname = wpid ? hnPlayerName(room, wpid) : '';
        var wcards = Array.isArray(pmsg.cards) ? pmsg.cards.slice() : [];
        var wrow = '';
        for (var wi = 0; wi < wcards.length; wi++) {
          wrow += '<div class="hn-rumor-card">' + hnCardImgHtml(String(wcards[wi] || '')) + '</div>';
        }
        privateHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">目撃者</div>' +
          '<div class="muted center">' + escapeHtml(wname ? (wname + ' の手札') : '手札') + '</div>' +
          '<div class="hn-rumor-row">' + wrow + '</div>' +
          '<div class="row ll-modal-actions" style="justify-content:center">' +
          '<button class="primary" id="hnPrivateOk">OK</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (pmsg && String(pmsg.type || '') === 'notice') {
        var title2 = String(pmsg.title || '注意');
        var msg2 = String(pmsg.message || '');
        var actorPid2 = String(pmsg.actorPid || '');
        var isActorNotice = !!(playerId && actorPid2 && String(playerId) === String(actorPid2));
        privateHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">' + escapeHtml(title2) + '</div>' +
          '<div class="muted center">' + escapeHtml(msg2) + '</div>' +
          (isActorNotice
            ? '<div class="row ll-modal-actions" style="justify-content:center">' +
              '<button class="primary" id="hnPrivateOk">OK</button>' +
              '</div>'
            : '') +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (pmsg && String(pmsg.type || '') === 'dog_not_culprit') {
        // Back-compat for older rooms.
        privateHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">いぬ</div>' +
          '<div class="muted center">犯人ではありません</div>' +
          '<div class="row ll-modal-actions" style="justify-content:center">' +
          '<button class="primary" id="hnPrivateOk">OK</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }
    } catch (ePriv) {
      privateHtml = '';
    }
    try {
      if (canOperate && ui && ui.hnAction && ui.hnAction.type === 'play') {
        var act = ui.hnAction;
        var cardIndex = parseIntSafe(act.cardIndex, -1);
        var cardId = String(act.cardId || '');
        var def = HANNIN_CARD_DEFS[String(cardId || '')] || { name: String(cardId || '-'), desc: '' };
        var step = String(act.step || '');

        // Eligible targets
        var playersMap = (room && room.players) || {};
        var order0 = Array.isArray(st && st.order) ? st.order.slice() : Object.keys(playersMap || {});
        var eligible = [];
        for (var ti = 0; ti < order0.length; ti++) {
          var pid2 = String(order0[ti] || '');
          if (!pid2) continue;
          if (pid2 === playerId) continue;
          if (cardId === 'deal') {
            var thx = hands && Array.isArray(hands[pid2]) ? hands[pid2] : [];
            if (!thx.length) continue;
          }
          eligible.push(pid2);
        }

        function targetButtons(selectedPid) {
          if (!eligible.length) return '<div class="muted">対象にできる相手がいません。</div>';
          var out = '';
          for (var i = 0; i < eligible.length; i++) {
            var tid = eligible[i];
            var nm = hnPlayerName(room, tid);
            var sel = String(selectedPid || '') === String(tid);
            out +=
              '<button class="ghost hnPickTarget" data-target="' +
              escapeHtml(String(tid)) +
              '" style="width:100%">' +
              (sel ? '✓ ' : '') +
              escapeHtml(nm) +
              '</button>';
          }
          return out;
        }

        function facedownPickGrid(count, selectedIdx, cls, attr) {
          var out2 = '<div class="hn-rumor-row">';
          for (var k = 0; k < count; k++) {
            out2 +=
              '<div class="hn-rumor-card ' +
              escapeHtml(cls) +
              (parseIntSafe(selectedIdx, -1) === k ? ' hn-card--selected' : '') +
              '" ' +
              escapeHtml(attr) +
              '="' +
              escapeHtml(String(k)) +
              '">' +
              hnCardBackImgHtml() +
              '</div>';
          }
          out2 += '</div>';
          return out2;
        }

        function giveButtons(excludeIndex, selectedGiveIdx) {
          var out3 = '';
          for (var gi = 0; gi < myHand.length; gi++) {
            if (gi === excludeIndex) continue;
            var cid = String(myHand[gi] || '');
            var gsel = parseIntSafe(selectedGiveIdx, -1) === gi;
            out3 +=
              '<div class="hn-rumor-card hnPickGive' +
              (gsel ? ' hn-card--selected' : '') +
              '" data-give="' +
              escapeHtml(String(gi)) +
              '">' +
              hnCardImgHtml(cid) +
              '</div>';
          }
          if (!out3) return '<div class="muted">渡せるカードがありません。</div>';
          return '<div class="hn-rumor-row">' + out3 + '</div>';
        }

        var body = '';
        var canConfirm = false;
        var title = String(def.name || '') + ' を使用';

        if (cardId === 'detective' || cardId === 'witness') {
          if (step !== 'target') step = 'target';
          body = '<div class="muted">対象</div><div class="stack">' + targetButtons(act.targetPid) + '</div>';
          canConfirm = !!(act.targetPid);
        } else if (cardId === 'dog') {
          if (step !== 'target' && step !== 'pick') step = 'target';
          if (step === 'target') {
            body = '<div class="muted">対象</div><div class="stack">' + targetButtons(act.targetPid) + '</div>';
            canConfirm = false;
          } else {
            var tp = String(act.targetPid || '');
            var th = tp && hands && Array.isArray(hands[tp]) ? hands[tp] : [];
            body =
              '<div class="muted">相手の手札から1枚選択</div>' +
              facedownPickGrid(th.length || 0, act.targetIndex, 'hnPickHidden', 'data-hidden');
            canConfirm = parseIntSafe(act.targetIndex, -1) >= 0;
          }
        } else if (cardId === 'deal') {
          if (step !== 'target') step = 'target';
          body = '<div class="muted">交換する相手</div><div class="stack">' + targetButtons(act.targetPid) + '</div>';
          canConfirm = !!(act.targetPid);
        }

        modalHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop" id="hnModalBg"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="stack">' +
          '<div class="big ll-modal-title">' +
          escapeHtml(title) +
          '</div>' +
          '<div class="muted center">' +
          escapeHtml('使用したカード：' + String(def.name || cardId || '')) +
          '</div>' +
          (body || '') +
          '<div id="hnPlayError" class="form-error" role="alert"></div>' +
          '<div class="row ll-modal-actions" style="justify-content:space-between">' +
          '<button class="ghost" id="hnModalCancel">キャンセル</button>' +
          '<button class="primary" id="hnModalOk" ' +
          (canConfirm ? '' : 'disabled') +
          '>使用</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }
    } catch (eMod) {
      modalHtml = '';
    }

    // Pending group actions: override main hand UI.
    if (pending && pending.type === 'info') {
      var already = false;
      try {
        already = !!(pending && pending.choices && pending.choices[String(playerId)] !== undefined);
      } catch (eCI) {
        already = false;
      }

      if (already) {
        contentHtml = '<div class="muted center">情報操作：決定済み（他の人を待っています）</div>';
      } else if (!myHand.length) {
        contentHtml = '<div class="muted center">情報操作：手札がありません</div>';
      } else {
        var selInfo = parseIntSafe(ui.hnInfoSelectedIndex, -1);
        var outInfo = '';
        for (var iiInfo = 0; iiInfo < myHand.length; iiInfo++) {
          outInfo +=
            '<div class="hn-rumor-card hnInfoPick' +
            (selInfo === iiInfo ? ' hn-card--selected' : '') +
            '" data-hn-info-idx="' +
            escapeHtml(String(iiInfo)) +
            '">' +
            hnCardImgHtml(String(myHand[iiInfo] || '')) +
            '</div>';
        }

        contentHtml =
          '<div class="stack" style="gap:12px">' +
          '<div class="muted center">情報操作：左隣に渡すカードを選ぶ</div>' +
          '<div class="hn-rumor-row">' +
          outInfo +
          '</div>' +
          '<div class="muted center hn-hint">タップで選択（決定/キャンセル）</div>' +
          '</div>';
      }
    } else if (pending && pending.type === 'rumor') {
      var selRumor = parseIntSafe(ui.hnRumorSelectedIndex, -1);
      if (alreadyChosenRumor) {
        contentHtml = '<div class="muted center">うわさ：引くカードを選択済みです（他の人を待っています）</div>';
      } else if (!myHand.length) {
        contentHtml = '<div class="muted center">うわさ：手札がありません</div>';
      } else if (!rightCount) {
        contentHtml = '<div class="muted center">うわさ：右隣の手札がありません</div>';
      } else {
        var confirmedRumorIdx = -1;
        try {
          if (pending && pending.choices && pending.choices[String(playerId)] !== undefined) {
            confirmedRumorIdx = parseIntSafe(pending.choices[String(playerId)], -1);
          }
        } catch (eCR) {
          confirmedRumorIdx = -1;
        }

        var facedownHtml = '';
        for (var ri = 0; ri < rightCount; ri++) {
          facedownHtml +=
            '<div class="hn-rumor-card hnRumorPick' +
            (confirmedRumorIdx === ri ? ' hn-card--selected' : '') +
            '" data-hn-rumor-idx="' +
            escapeHtml(String(ri)) +
            '">' +
            hnCardBackImgHtml() +
            '</div>';
        }
        contentHtml =
          '<div class="stack" style="gap:12px">' +
          '<div class="muted center">うわさ：右隣の手札 ' +
          escapeHtml(String(rightCount)) +
          ' 枚から1枚選ぶ</div>' +
          '<div class="hn-rumor-row">' +
          facedownHtml +
          '</div>' +
          '<div class="muted center hn-hint">タップで選択（決定/キャンセル）</div>' +
          '</div>';
      }
    } else if (pending && pending.type === 'deal') {
      var dealTarget = '';
      var dealActor = '';
      try {
        dealTarget = String(pending.targetPid || '');
        dealActor = String(pending.actorId || '');
      } catch (eD0) {
        dealTarget = '';
        dealActor = '';
      }

      var isDealActor = !!(playerId && String(playerId) === String(dealActor));
      var isDealTarget = !!(playerId && String(playerId) === String(dealTarget));
      var alreadyChosenDeal = false;
      try {
        alreadyChosenDeal = !!(pending && pending.choices && pending.choices[String(playerId)] !== undefined);
      } catch (eDC) {
        alreadyChosenDeal = false;
      }

      if (isDealActor || isDealTarget) {
        if (alreadyChosenDeal) {
          contentHtml = '<div class="muted center">取引：決定済み（相手を待っています）</div>';
        } else if (!myHand.length) {
          contentHtml = '<div class="muted center">取引：手札がありません</div>';
        } else {
          var outDeal2 = '';
          for (var di2 = 0; di2 < myHand.length; di2++) {
            outDeal2 +=
              '<div class="hn-rumor-card hnDealPick" data-hn-deal-idx="' +
              escapeHtml(String(di2)) +
              '">' +
              hnCardImgHtml(String(myHand[di2] || '')) +
              '</div>';
          }
          contentHtml =
            '<div class="stack" style="gap:12px">' +
            '<div class="muted center">取引：' +
            escapeHtml(hnPlayerName(room, dealActor)) +
            ' ⇄ ' +
            escapeHtml(hnPlayerName(room, dealTarget)) +
            '</div>' +
            '<div class="muted center">' +
            escapeHtml(isDealActor ? '渡すカード（自分の手札）を選ぶ' : '交換に出すカード（自分の手札）を選ぶ') +
            '</div>' +
            '<div class="hn-rumor-row">' +
            outDeal2 +
            '</div>' +
            '<div class="muted center hn-hint">タップで選択（決定/キャンセル）</div>' +
            '</div>';
        }
      } else {
        contentHtml =
          '<div class="muted center">取引：' +
          escapeHtml(hnPlayerName(room, dealActor)) +
          ' と ' +
          escapeHtml(hnPlayerName(room, dealTarget)) +
          ' が選択中です</div>';
      }
    } else {
      // Normal play: show stacked hand; tap swaps/front, long-press plays.
      if (!myHand.length) {
        contentHtml = '<div class="muted">（手札なし）</div>';
      } else {
        var frontIdx = parseIntSafe(ui.hnHandFrontIndex, 0);
        if (frontIdx < 0 || frontIdx >= myHand.length) frontIdx = 0;

        // Compute an approximate pixel step as cardHeight/6.
        // Reduce overlap by 20% (decrease offset).
        var stepPx = 72;
        try {
          var vw = (typeof window !== 'undefined' && window && window.innerWidth) ? window.innerWidth : 420;
          var cardW = Math.min(340, Math.floor(vw * 0.9));
          var cardH = cardW * (4 / 3);
          stepPx = Math.max(10, Math.round((cardH / 6) * 0.8));
        } catch (eStep) {
          stepPx = 72;
        }

        var dispOrder = [];
        dispOrder.push(frontIdx);
        for (var ii = 0; ii < myHand.length; ii++) {
          if (ii === frontIdx) continue;
          dispOrder.push(ii);
        }

        var cardsHtml = '';
        for (var pos = 0; pos < dispOrder.length; pos++) {
          var idx = dispOrder[pos];
          var cid = String(myHand[idx] || '');
          // Back cards shift upward by ~cardHeight/6 each.
          var y = -(pos * stepPx);
          cardsHtml +=
            '<div class="hn-card hnPCard" data-hn-idx="' +
            escapeHtml(String(idx)) +
            '" style="z-index:' +
            escapeHtml(String(100 - pos)) +
            ';transform:translate(0,' +
            escapeHtml(String(y)) +
            'px) scale(.90)">' +
            hnCardImgHtml(cid) +
            '</div>';
        }

        contentHtml =
          '<div class="hn-hand-wrap" style="margin-top:12px;padding-top:' +
          escapeHtml(String(Math.max(0, (dispOrder.length - 1) * stepPx))) +
          'px">' +
          '<div class="hn-hand" id="hnHand">' +
          cardsHtml +
          '</div>' +
          (isMyTurn
            ? '<div class="muted center hn-hint">タップで入れ替え / 長押しで使用</div>'
            : '<div class="muted center hn-hint">あなたの手札</div>') +
          '</div>';
      }
    }

    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.add('ll-player-screen');
        document.body.classList.remove('ll-table-screen');
      }
    } catch (eCls) {
      // ignore
    }

    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.toggle('ll-turn-actor', !!isMyTurn);
        viewEl.classList.toggle('ll-turn-waiting', !isMyTurn);

        // Attention frame when you must respond (e.g., you are the deal target).
        var needAttention = false;
        try {
          if (pending && pending.type === 'deal') {
            var at = String(pending.targetPid || '');
            var aa = String(pending.actorId || '');
            var notDone = !(pending.choices && pending.choices[String(playerId)] !== undefined);
            needAttention = !!(playerId && String(playerId) === at && String(aa) !== String(playerId) && notDone);
          }
        } catch (eAtt) {
          needAttention = false;
        }
        viewEl.classList.toggle('hn-attention', !!needAttention);

        // Result background (win=red, lose=blue)
        var res = (st && st.result) || {};
        var win = false;
        try {
          var winners = Array.isArray(res && res.winners) ? res.winners : [];
          win = !!(res && res.decidedAt && playerId && winners.indexOf(String(playerId)) >= 0);
        } catch (eRw) {
          win = false;
        }
        viewEl.classList.toggle('result-win', !!(res && res.decidedAt && win));
        viewEl.classList.toggle('result-lose', !!(res && res.decidedAt && !win));
      }
    } catch (eC2) {
      // ignore
    }

    // Result info for all players
    var resultHtml = '';
    try {
      var r = (st && st.result) || {};
      if (r && r.decidedAt) {
        var sideLabel = r.side === 'culprit' ? '犯人側の勝利' : r.side === 'citizen' ? '一般人側の勝利' : '結果';
        var culpritName = r.culpritId ? hnPlayerName(room, String(r.culpritId || '')) : '';
        var winners2 = Array.isArray(r.winners) ? r.winners : [];
        var winnerNames = [];
        for (var wi = 0; wi < winners2.length; wi++) winnerNames.push(hnPlayerName(room, String(winners2[wi] || '')));

        var allies = st && st.allies && typeof st.allies === 'object' ? st.allies : {};
        var order2 = Array.isArray(st && st.order) ? st.order : [];
        var plotNames = [];
        for (var pi = 0; pi < order2.length; pi++) {
          var ppid = String(order2[pi] || '');
          if (!ppid) continue;
          if (allies && allies[ppid]) plotNames.push(hnPlayerName(room, ppid));
        }

        resultHtml =
          '<div class="card" style="padding:12px">' +
          '<div><b>' +
          escapeHtml(sideLabel) +
          '</b></div>' +
          '<div class="muted" style="margin-top:6px">' +
          escapeHtml('犯人：' + (culpritName || '-')) +
          '</div>' +
          '<div class="muted">' +
          escapeHtml('たくらみ：' + (plotNames.length ? plotNames.join(' / ') : 'なし')) +
          '</div>' +
          '<div class="muted">' +
          escapeHtml('勝者：' + (winnerNames.length ? winnerNames.join(' / ') : '-')) +
          '</div>' +
          (r.reason ? '<div class="muted">' + escapeHtml(String(r.reason || '')) + '</div>' : '') +
          '</div>';
      }
    } catch (eResHtml) {
      resultHtml = '';
    }

    // "Next" after game end: show for GM device and GM participant.
    var nextHtml = '';
    try {
      var r2 = (st && st.result) || {};
      if (lobbyId && r2 && r2.decidedAt) {
        var isGmParticipant = !!opts.isHost;
        try {
          if (!isGmParticipant && playerId && players && players[playerId] && players[playerId].isHost) isGmParticipant = true;
        } catch (eGm) {
          // ignore
        }
        nextHtml = isGmParticipant
          ? '<div class="row" style="justify-content:center"><button id="hnNextToLobby" class="primary">次へ</button></div>'
          : '<div class="muted center">※ 次へ進むのはゲームマスターです。</div>';
      }
    } catch (eNext) {
      nextHtml = '';
    }

    render(
      viewEl,
      '<div class="stack ll-player">' +
        '<div class="ll-topline">' +
        '<div class="ll-status">犯人は踊る ' +
        escapeHtml(playerId ? ('/ ' + hnPlayerName(room, playerId)) : '') +
        '<span class="muted" style="margin-left:10px">' +
        escapeHtml((turnPid ? hnPlayerName(room, turnPid) : '-') + 'のターン') +
        '</span>' +
        '</div>' +
        '</div>' +
        (pilesHtml || '') +
        (resultHtml || '') +
        (nextHtml || '') +
        (privateHtml || '') +
        (revealHtml || '') +
        (confirmHtml || '') +
        (modalHtml || '') +
        (contentHtml || '') +
      '</div>'
    );
  }

  function routeHanninPlayer(roomId, isHost) {
    var unsub = null;
    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    var playerId = '';
        var isTableGmDevice = false;
        try {
          var qGm0 = parseQuery();
          isTableGmDevice = !!(qGm0 && String(qGm0.gmdev || '') === '1');
        } catch (eGm0) {
          isTableGmDevice = false;
        }
    try {
      var q1 = parseQuery();
      playerId = q1 && q1.player ? String(q1.player) : '';
    } catch (eP) {
      playerId = '';
    }

    if (!playerId && lobbyId) {
      try {
        playerId = String(getOrCreateLobbyMemberId(lobbyId) || '');
      } catch (eMid) {
        playerId = '';
      }
    }

    var lastRoom = null;

    var ui = {
      hnHandFrontIndex: 0,
      hnInfoSelectedIndex: -1,
      hnRumorSelectedIndex: -1,
      hnPrevHand: [],
      inFlight: false,
      autoKeyDone: {},
      hnAction: null,
      hnReveal: null,
      hnConfirm: null,
      hnDealNoticeKey: '',
      lobbyReturnWatching: false,
      lobbyUnsub: null
    };

    function redirectToLobby() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = isHost ? 'lobby_host' : 'lobby_player';
      try {
        var qx = parseQuery();
        if (qx && String(qx.gmdev || '') === '1') q.gmdev = '1';
      } catch (e) {
        // ignore
      }
      setQuery(q);
      route();
    }

    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (ui.lobbyReturnWatching) return;
      ui.lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'hannin' || rid !== String(roomId || '')) {
              try {
                if (ui.lobbyUnsub) ui.lobbyUnsub();
              } catch (e) {
                // ignore
              }
              ui.lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          ui.lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    function hnFindNewCardIndex(prevHand, curHand) {
      var prev = Array.isArray(prevHand) ? prevHand : [];
      var cur = Array.isArray(curHand) ? curHand : [];
      if (!cur.length) return -1;
      if (!prev.length) return cur.length - 1;

      var prevCount = {};
      for (var i = 0; i < prev.length; i++) {
        var id = String(prev[i] || '');
        if (!id) continue;
        prevCount[id] = (prevCount[id] || 0) + 1;
      }

      var curCount = {};
      for (var j = 0; j < cur.length; j++) {
        var id2 = String(cur[j] || '');
        if (!id2) continue;
        curCount[id2] = (curCount[id2] || 0) + 1;
      }

      var newId = '';
      var keys = Object.keys(curCount);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if ((curCount[key] || 0) > (prevCount[key] || 0)) {
          newId = key;
          break;
        }
      }
      if (!newId) return -1;

      for (var z = cur.length - 1; z >= 0; z--) {
        if (String(cur[z] || '') === newId) return z;
      }
      return -1;
    }

    function canOperateThisDevice() {
      // Table GM device should not operate player screens.
      return !isTableGmDevice;
    }

    function clearActionModal() {
      try {
        ui.hnAction = null;
      } catch (e) {
        // ignore
      }
    }

    function clearRevealModal() {
      try {
        ui.hnReveal = null;
      } catch (e) {
        // ignore
      }
    }

    function clearConfirmModal() {
      try {
        ui.hnConfirm = null;
      } catch (e) {
        // ignore
      }
    }

    function chooseTargetPid(room, actorPid, allowSelf) {
      var players = (room && room.players) || {};
      var order = room && room.state && Array.isArray(room.state.order) ? room.state.order : Object.keys(players || {});
      var opts = [];
      for (var i = 0; i < order.length; i++) {
        var pid = String(order[i] || '');
        if (!pid) continue;
        if (!allowSelf && String(pid) === String(actorPid)) continue;
        opts.push(pid);
      }
      if (!opts.length) return '';
      var msg =
        '対象を選んでください:\n' +
        opts
          .map(function (p, idx) {
            return String(idx + 1) + '. ' + hnPlayerName(room, p);
          })
          .join('\n');
      var s = prompt(msg, '1');
      var n = parseIntSafe(s, 0);
      if (n < 1 || n > opts.length) return '';
      return String(opts[n - 1] || '');
    }

    function chooseHiddenCardIndex(room, pid) {
      var h = room && room.state && room.state.hands && Array.isArray(room.state.hands[pid]) ? room.state.hands[pid] : [];
      if (!h.length) return -1;
      var msg = '相手の手札から選んでください（番号）: 1〜' + String(h.length);
      var s = prompt(msg, '1');
      var n = parseIntSafe(s, 0);
      if (n < 1 || n > h.length) return -1;
      return n - 1;
    }

    function renderNow(room) {
      lastRoom = room;

      // If we came from a lobby, keep a watcher so returning to lobby pulls players back too.
      try {
        if (lobbyId) ensureLobbyReturnWatcher();
      } catch (eLW) {
        // ignore
      }

      // Bring newly received cards (rumor/info/deal results) to the front.
      try {
        var st0 = room && room.state ? room.state : null;
        var h0 = st0 && st0.hands && playerId && Array.isArray(st0.hands[playerId]) ? st0.hands[playerId] : [];
        var newIdx = hnFindNewCardIndex(ui.hnPrevHand, h0);
        if (newIdx >= 0 && newIdx < h0.length) {
          ui.hnHandFrontIndex = newIdx;
        }
        ui.hnPrevHand = Array.isArray(h0) ? h0.slice() : [];
      } catch (eFront) {
        // ignore
      }

      // Target notice: when you are forced to act (deal), show a one-time modal.
      try {
        var stN = room && room.state ? room.state : null;
        var pN = stN && stN.pending ? stN.pending : null;
        if (pN && pN.type === 'deal') {
          var at = String(pN.targetPid || '');
          var aa = String(pN.actorId || '');
          var notDone = !(pN.choices && pN.choices[String(playerId)] !== undefined);
          var key = 'deal|' + String(pN.createdAt || 0) + '|' + String(at || '');
          if (playerId && String(playerId) === at && String(aa) !== String(playerId) && notDone && ui.hnDealNoticeKey !== key) {
            ui.hnDealNoticeKey = key;
            // Only set if no other modal is open.
            if (!ui.hnAction && !ui.hnConfirm && !(stN && stN.private && stN.private[String(playerId)])) {
              ui.hnConfirm = {
                type: 'notice',
                title: '取引',
                message: hnPlayerName(room, aa) + ' が取引を使用しました。交換に出すカードを選んでください。',
                cancelLabel: 'OK'
              };
            }
          }
        }
      } catch (eTN) {
        // ignore
      }

      renderHanninPlayer(viewEl, { roomId: roomId, room: room, playerId: playerId, lobbyId: lobbyId, isHost: isHost, ui: ui, isTableGmDevice: isTableGmDevice });

      // Bind handlers on the freshly rendered DOM (important: renderNow can be called from events).
      var cards = document.querySelectorAll('.hnPCard');
      for (var iC = 0; iC < cards.length; iC++) {
        var el = cards[iC];
        if (!el) continue;

        if (!el.__hn_click_bound) {
          el.__hn_click_bound = true;
          el.addEventListener('click', function (ev) {
            var t = ev && ev.currentTarget ? ev.currentTarget : null;
            if (!t) return;
            var idx = parseIntSafe(t.getAttribute('data-hn-idx'), -1);
            if (idx < 0) return;

            try {
              var st = lastRoom && lastRoom.state ? lastRoom.state : null;
              var pending = st && st.pending ? st.pending : null;

              if (ui.hnAction) {
                return;
              }

              if (pending && pending.type === 'rumor') {
                // rumor tap is handled on hnRumorPick elements
                return;
              } else if (pending && pending.type === 'deal') {
                // deal tap is handled on hnDealPick elements
                return;
              } else {
                // Normal: tap cycles the front card.
                var h = st && st.hands && Array.isArray(st.hands[playerId]) ? st.hands[playerId] : [];
                if (!h || !h.length) return;
                var cur = parseIntSafe(ui.hnHandFrontIndex, 0);
                if (cur < 0) cur = 0;
                ui.hnHandFrontIndex = (cur + 1) % h.length;
              }
            } catch (e) {
              // ignore
            }
            renderNow(lastRoom);
          });
        }

        if (!el.__hn_hold_bound) {
          el.__hn_hold_bound = true;
          (function (btn) {
            var holdMs = CN_LONG_PRESS_MS;
            var timer = null;
            var longFired = false;

            function clearTimer() {
              if (timer) {
                clearTimeout(timer);
                timer = null;
              }
            }

            function startHold(ev) {
              if (ui.inFlight) return;
              if (ev && ev.button != null && ev.button !== 0) return;
              if (ev && ev.preventDefault) ev.preventDefault();

              clearTimer();
              longFired = false;

              var idx = parseIntSafe(btn.getAttribute('data-hn-idx'), -1);
              if (idx < 0) return;

              timer = setTimeout(function () {
                longFired = true;
                clearTimer();

                try {
                  var st = lastRoom && lastRoom.state ? lastRoom.state : null;
                  var pending = st && st.pending ? st.pending : null;
                  if (pending && pending.type === 'rumor') {
                    // Long-press confirms currently selected facedown card.
                    tryConfirmRumorByLongPress();
                    return;
                  }
                } catch (e) {
                  // ignore
                }

                // Normal play.
                tryPlayCardByLongPress(idx);
              }, holdMs);
            }

            btn.addEventListener('click', function (ev) {
              // Ignore tap after long-press.
              if (longFired) {
                longFired = false;
                if (ev && ev.preventDefault) ev.preventDefault();
                if (ev && ev.stopPropagation) ev.stopPropagation();
              }
            });

            if (typeof PointerEvent !== 'undefined') {
              btn.addEventListener('pointerdown', startHold);
              btn.addEventListener('pointerup', clearTimer);
              btn.addEventListener('pointercancel', clearTimer);
              btn.addEventListener('pointerleave', clearTimer);
            } else {
              btn.addEventListener('touchstart', startHold);
              btn.addEventListener('touchend', clearTimer);
              btn.addEventListener('touchcancel', clearTimer);

              btn.addEventListener('mousedown', startHold);
              btn.addEventListener('mouseup', clearTimer);
              btn.addEventListener('mouseleave', clearTimer);
            }

            btn.addEventListener('contextmenu', function (ev) {
              if (ev && ev.preventDefault) ev.preventDefault();
            });
          })(el);
        }
      }

      // Modal bindings
      var bg = document.getElementById('hnModalBg');
      if (bg && !bg.__hn_bound) {
        bg.__hn_bound = true;
        bg.addEventListener('click', function () {
          clearActionModal();
          renderNow(lastRoom);
        });
      }

      var cbg = document.getElementById('hnConfirmBg');
      if (cbg && !cbg.__hn_bound) {
        cbg.__hn_bound = true;
        cbg.addEventListener('click', function () {
          clearConfirmModal();
          renderNow(lastRoom);
        });
      }

      var cCancel = document.getElementById('hnConfirmCancel');
      if (cCancel && !cCancel.__hn_bound) {
        cCancel.__hn_bound = true;
        cCancel.addEventListener('click', function () {
          clearConfirmModal();
          renderNow(lastRoom);
        });
      }

      var cOk = document.getElementById('hnConfirmOk');
      if (cOk && !cOk.__hn_bound) {
        cOk.__hn_bound = true;
        cOk.addEventListener('click', function () {
          if (!ui.hnConfirm || ui.inFlight) return;
          if (!canOperateThisDevice()) return;
          if (!lastRoom || !lastRoom.state) return;

          var st = lastRoom.state;
          if (String((lastRoom && lastRoom.phase) || '') !== 'playing') return;

          var c = ui.hnConfirm;
          var t = String(c.type || '');
          ui.inFlight = true;

          // Close immediately.
          clearConfirmModal();
          renderNow(lastRoom);

          if (t === 'play') {
            // Simple play (no extra choices)
            if ((st.pending && st.pending.type) || (st.waitFor && st.waitFor.type)) {
              ui.inFlight = false;
              return;
            }
            var turnPid = st.turn && st.turn.playerId ? String(st.turn.playerId) : '';
            if (!turnPid || String(turnPid) !== String(playerId)) {
              ui.inFlight = false;
              return;
            }
            var idx = parseIntSafe(c.cardIndex, -1);
            var myHand = playerId && st.hands && Array.isArray(st.hands[playerId]) ? st.hands[playerId] : [];
            if (idx < 0 || idx >= myHand.length) {
              ui.inFlight = false;
              return;
            }
            playHanninCard(roomId, playerId, idx, {})
              .catch(function (e) {
                alert((e && e.message) || '失敗');
              })
              .finally(function () {
                ui.inFlight = false;
              });
            return;
          }

          if (t === 'info') {
            var idx2 = parseIntSafe(c.index, -1);
            submitHanninInfoChoice(roomId, playerId, idx2)
              .catch(function (e) {
                alert((e && e.message) || '失敗');
              })
              .finally(function () {
                ui.inFlight = false;
              });
            return;
          }

          if (t === 'rumor') {
            var idx3 = parseIntSafe(c.index, -1);
            submitHanninRumorChoice(roomId, playerId, idx3)
              .catch(function (e) {
                alert((e && e.message) || '失敗');
              })
              .finally(function () {
                ui.inFlight = false;
              });
            return;
          }

          if (t === 'deal') {
            var idx4 = parseIntSafe(c.index, -1);
            submitHanninDealChoice(roomId, playerId, idx4)
              .catch(function (e) {
                alert((e && e.message) || '失敗');
              })
              .finally(function () {
                ui.inFlight = false;
              });
            return;
          }

          ui.inFlight = false;
        });
      }

      // Private modal bindings
      var pok = document.getElementById('hnPrivateOk');
      if (pok && !pok.__hn_bound) {
        pok.__hn_bound = true;
        pok.addEventListener('click', function () {
          ackHanninPrivate(roomId, playerId).catch(function () {
            // ignore
          });
        });
      }

      var rbg = document.getElementById('hnRevealBg');
      if (rbg && !rbg.__hn_bound) {
        rbg.__hn_bound = true;
        rbg.addEventListener('click', function () {
          clearRevealModal();
          renderNow(lastRoom);
        });
      }

      var rok = document.getElementById('hnRevealOk');
      if (rok && !rok.__hn_bound) {
        rok.__hn_bound = true;
        rok.addEventListener('click', function () {
          clearRevealModal();
          renderNow(lastRoom);
        });
      }

      var cancelBtn = document.getElementById('hnModalCancel');
      if (cancelBtn && !cancelBtn.__hn_bound) {
        cancelBtn.__hn_bound = true;
        cancelBtn.addEventListener('click', function () {
          clearActionModal();
          renderNow(lastRoom);
        });
      }

      var pickTargets = document.querySelectorAll('.hnPickTarget');
      for (var pt = 0; pt < pickTargets.length; pt++) {
        var b = pickTargets[pt];
        if (!b || b.__hn_bound) continue;
        b.__hn_bound = true;
        b.addEventListener('click', function (ev) {
          var el = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!el) return;
          var tid = String(el.getAttribute('data-target') || '');
          if (!ui.hnAction) return;
          ui.hnAction.targetPid = tid;
          // Advance step for multi-step actions.
          if (ui.hnAction.cardId === 'dog') ui.hnAction.step = 'pick';
          renderNow(lastRoom);
        });
      }

      var pickHidden = document.querySelectorAll('.hnPickHidden');
      for (var ph = 0; ph < pickHidden.length; ph++) {
        var h = pickHidden[ph];
        if (!h || h.__hn_bound) continue;
        h.__hn_bound = true;
        h.addEventListener('click', function (ev) {
          var el = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!el) return;
          var idx = parseIntSafe(el.getAttribute('data-hidden'), -1);
          if (!ui.hnAction) return;
          if (ui.hnAction.cardId === 'dog') ui.hnAction.targetIndex = idx;
          renderNow(lastRoom);
        });
      }

      var pickGive = document.querySelectorAll('.hnPickGive');
      for (var pg = 0; pg < pickGive.length; pg++) {
        var g = pickGive[pg];
        if (!g || g.__hn_bound) continue;
        g.__hn_bound = true;
        g.addEventListener('click', function (ev) {
          var el = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!el) return;
          var idx = parseIntSafe(el.getAttribute('data-give'), -1);
          if (!ui.hnAction) return;
          ui.hnAction.giveIndex = idx;
          renderNow(lastRoom);
        });
      }

      var okBtn = document.getElementById('hnModalOk');
      if (okBtn && !okBtn.__hn_bound) {
        okBtn.__hn_bound = true;
        okBtn.addEventListener('click', function () {
          if (!ui.hnAction || ui.inFlight) return;
          if (!canOperateThisDevice()) return;
          if (!lastRoom || !lastRoom.state) return;

          var st = lastRoom.state;
          if (String((lastRoom && lastRoom.phase) || '') !== 'playing') return;
          if ((st.pending && st.pending.type) || (st.waitFor && st.waitFor.type)) return;

          var turnPid = st.turn && st.turn.playerId ? String(st.turn.playerId) : '';
          if (!turnPid || String(turnPid) !== String(playerId)) return;

          var idx = parseIntSafe(ui.hnAction.cardIndex, -1);
          var myHand = playerId && st.hands && Array.isArray(st.hands[playerId]) ? st.hands[playerId] : [];
          if (idx < 0 || idx >= myHand.length) return;

          var cardId = String(myHand[idx] || '');
          var action = {};

          if (cardId === 'detective') {
            var t = String(ui.hnAction.targetPid || '');
            if (!t) return;
            action = { targetPid: t };
          } else if (cardId === 'witness') {
            var t4 = String(ui.hnAction.targetPid || '');
            if (!t4) return;
            action = { targetPid: t4 };
          } else if (cardId === 'dog') {
            var t2 = String(ui.hnAction.targetPid || '');
            var pick = parseIntSafe(ui.hnAction.targetIndex, -1);
            if (!t2 || pick < 0) return;
            action = { targetPid: t2, targetIndex: pick };
          } else if (cardId === 'deal') {
            var t3 = String(ui.hnAction.targetPid || '');
            if (!t3) return;
            try {
              var th3 = st && st.hands && Array.isArray(st.hands[t3]) ? st.hands[t3] : [];
              if (!th3.length) {
                setInlineError('hnPlayError', '相手に手札がありません');
                return;
              }
            } catch (eDealT) {
              // ignore
            }
            action = { targetPid: t3 };
          }

          ui.inFlight = true;

          // Close modal immediately on press.
          clearActionModal();
          renderNow(lastRoom);

          playHanninCard(roomId, playerId, idx, action)
            .catch(function (e) {
              setInlineError('hnPlayError', (e && e.message) || '失敗');
            })
            .finally(function () {
              ui.inFlight = false;
            });
        });
      }

      var rumorPicks = document.querySelectorAll('.hnRumorPick');
      for (var rP = 0; rP < rumorPicks.length; rP++) {
        var rpEl = rumorPicks[rP];
        if (!rpEl) continue;

        if (!rpEl.__hn_click_bound) {
          rpEl.__hn_click_bound = true;
          rpEl.addEventListener('click', function (ev) {
            var t = ev && ev.currentTarget ? ev.currentTarget : null;
            if (!t) return;
            var idx = parseIntSafe(t.getAttribute('data-hn-rumor-idx'), -1);
            if (idx < 0) return;
            // Tap-select then confirm/cancel modal.
            if (ui.inFlight) return;
            try {
              var st = lastRoom && lastRoom.state ? lastRoom.state : null;
              if (!st || !st.pending || st.pending.type !== 'rumor') return;
              if (st.pending.choices && st.pending.choices[String(playerId)] !== undefined) return;
            } catch (eTap) {
              return;
            }

            ui.hnRumorSelectedIndex = idx;
            ui.hnConfirm = { type: 'rumor', index: idx };
            renderNow(lastRoom);
          });
        }

        if (!rpEl.__hn_hold_bound) {
          rpEl.__hn_hold_bound = true;
          (function (btn) {
            var holdMs = CN_LONG_PRESS_MS;
            var timer = null;
            var longFired = false;

            function clearTimer() {
              if (timer) {
                clearTimeout(timer);
                timer = null;
              }
            }

            function startHold(ev) {
              if (ui.inFlight) return;
              if (ev && ev.button != null && ev.button !== 0) return;
              if (ev && ev.preventDefault) ev.preventDefault();
              clearTimer();
              longFired = false;

              timer = setTimeout(function () {
                longFired = true;
                clearTimer();
                // Enforce tap-select then long-press confirm.
                if (parseIntSafe(ui.hnRumorSelectedIndex, -1) < 0) {
                  var idx = parseIntSafe(btn.getAttribute('data-hn-rumor-idx'), -1);
                  if (idx >= 0) {
                    ui.hnRumorSelectedIndex = idx;
                    renderNow(lastRoom);
                  }
                  return;
                }
                tryConfirmRumorByLongPress();
              }, holdMs);
            }

            btn.addEventListener('click', function (ev) {
              if (longFired) {
                longFired = false;
                if (ev && ev.preventDefault) ev.preventDefault();
                if (ev && ev.stopPropagation) ev.stopPropagation();
              }
            });

            if (typeof PointerEvent !== 'undefined') {
              btn.addEventListener('pointerdown', startHold);
              btn.addEventListener('pointerup', clearTimer);
              btn.addEventListener('pointercancel', clearTimer);
              btn.addEventListener('pointerleave', clearTimer);
            } else {
              btn.addEventListener('touchstart', startHold);
              btn.addEventListener('touchend', clearTimer);
              btn.addEventListener('touchcancel', clearTimer);

              btn.addEventListener('mousedown', startHold);
              btn.addEventListener('mouseup', clearTimer);
              btn.addEventListener('mouseleave', clearTimer);
            }

            btn.addEventListener('contextmenu', function (ev) {
              if (ev && ev.preventDefault) ev.preventDefault();
            });
          })(rpEl);
        }
      }

      var infoPicks = document.querySelectorAll('.hnInfoPick');
      for (var iP = 0; iP < infoPicks.length; iP++) {
        var ipEl = infoPicks[iP];
        if (!ipEl) continue;
        if (ipEl.__hn_click_bound) continue;
        ipEl.__hn_click_bound = true;
        ipEl.addEventListener('click', function (ev) {
          var t = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!t) return;
          if (ui.inFlight) return;
          var idx = parseIntSafe(t.getAttribute('data-hn-info-idx'), -1);
          if (idx < 0) return;
          try {
            var st = lastRoom && lastRoom.state ? lastRoom.state : null;
            if (!st || !st.pending || st.pending.type !== 'info') return;
            if (st.pending.choices && st.pending.choices[String(playerId)] !== undefined) return;
          } catch (eTap2) {
            return;
          }
          ui.hnInfoSelectedIndex = idx;
          try {
            var h = lastRoom && lastRoom.state && lastRoom.state.hands && Array.isArray(lastRoom.state.hands[playerId]) ? lastRoom.state.hands[playerId] : [];
            var cid = idx >= 0 && idx < h.length ? String(h[idx] || '') : '';
            ui.hnConfirm = { type: 'info', index: idx, cardId: cid };
          } catch (eTap3) {
            ui.hnConfirm = { type: 'info', index: idx, cardId: '' };
          }
          renderNow(lastRoom);
        });
      }

      var dealPicks = document.querySelectorAll('.hnDealPick');
      for (var dP = 0; dP < dealPicks.length; dP++) {
        var dpEl = dealPicks[dP];
        if (!dpEl) continue;
        if (dpEl.__hn_click_bound) continue;
        dpEl.__hn_click_bound = true;
        dpEl.addEventListener('click', function (ev) {
          var t = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!t) return;
          if (ui.inFlight) return;
          var idx = parseIntSafe(t.getAttribute('data-hn-deal-idx'), -1);
          if (idx < 0) return;
          try {
            var st = lastRoom && lastRoom.state ? lastRoom.state : null;
            if (!st || !st.pending || st.pending.type !== 'deal') return;
            var canChoose =
              String(st.pending.targetPid || '') === String(playerId || '') ||
              String(st.pending.actorId || '') === String(playerId || '');
            if (!canChoose) return;
            if (st.pending.choices && st.pending.choices[String(playerId)] !== undefined) return;
          } catch (eD) {
            return;
          }

          try {
            var h = lastRoom && lastRoom.state && lastRoom.state.hands && Array.isArray(lastRoom.state.hands[playerId]) ? lastRoom.state.hands[playerId] : [];
            var cid = idx >= 0 && idx < h.length ? String(h[idx] || '') : '';
            ui.hnConfirm = { type: 'deal', index: idx, cardId: cid };
          } catch (eD2) {
            ui.hnConfirm = { type: 'deal', index: idx, cardId: '' };
          }
          renderNow(lastRoom);
        });
      }
    }

    function tryPlayCardByLongPress(cardIndex) {
      if (ui.inFlight) return;
      if (!lastRoom || !lastRoom.state) return;
      if (!canOperateThisDevice()) return;

      var st = lastRoom.state;
      var phase = String((lastRoom && lastRoom.phase) || '');
      if (phase !== 'playing') return;

      // Block play during group pending actions.
      if ((st.pending && st.pending.type) || (st.waitFor && st.waitFor.type)) return;

      var turnPid = st.turn && st.turn.playerId ? String(st.turn.playerId) : '';
      if (!turnPid || String(turnPid) !== String(playerId)) return;

      var myHand = playerId && st.hands && Array.isArray(st.hands[playerId]) ? st.hands[playerId] : [];
      var idx = parseIntSafe(cardIndex, -1);
      if (idx < 0 || idx >= myHand.length) return;

      var cardId = String(myHand[idx] || '');

      // Before start, only the first discoverer card can be used (no reaction otherwise).
      if (!st.started && cardId !== 'first') return;

      // Detective can only be used from the 2nd round and later.
      if (cardId === 'detective' && st.started) {
        var tc = parseIntSafe(st.turnCount, -1);
        var order = Array.isArray(st.order) ? st.order : [];
        if (tc >= 0 && order && order.length && tc < order.length) {
          ui.hnConfirm = { type: 'notice', title: '探偵', message: '探偵は二週目以降でしか使えません' };
          renderNow(lastRoom);
          return;
        }
      }

      // Cards with choices: open modal instead of prompt.
      if (cardId === 'detective' || cardId === 'dog' || cardId === 'deal' || cardId === 'witness') {
        ui.hnAction = { type: 'play', cardIndex: idx, cardId: cardId, step: 'target', targetPid: '', targetIndex: -1, giveIndex: -1, takeIndex: -1 };
        renderNow(lastRoom);
        return;
      }

      // Other cards: require confirm/cancel.
      ui.hnConfirm = { type: 'play', cardIndex: idx, cardId: cardId };
      renderNow(lastRoom);
    }

    function tryConfirmInfoByLongPress() {
      if (ui.inFlight) return;
      if (!lastRoom || !lastRoom.state) return;
      if (!canOperateThisDevice()) return;
      var st = lastRoom.state;
      if (!st.pending || st.pending.type !== 'info') return;
      if (st.pending.choices && st.pending.choices[String(playerId)] !== undefined) return;

      var idx = parseIntSafe(ui.hnInfoSelectedIndex, -1);
      if (idx < 0) return;
      ui.inFlight = true;
      submitHanninInfoChoice(roomId, playerId, idx)
        .catch(function (e) {
          alert((e && e.message) || '失敗');
        })
        .finally(function () {
          ui.inFlight = false;
        });
    }

    function ackHanninPrivate(roomId, playerId) {
      var base = hanninRoomPath(roomId);
      return runTxn(base, function (room) {
        if (!room || room.phase !== 'playing') return room;
        var st = assign({}, room.state || {});
        var pid = String(playerId || '');
        if (!pid) return room;
        if (!st.private || typeof st.private !== 'object') return room;
        if (!st.private[pid]) return room;
        var wf = st.waitFor && st.waitFor.type ? st.waitFor : null;
        if (wf && String(wf.by || '') === String(pid)) {
          var nextPrivateAll = {};
          var keys = Object.keys(st.private || {});
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var m = st.private[k];
            if (!m) continue;
            if (wf.createdAt && m.createdAt && String(m.createdAt) === String(wf.createdAt)) continue;
            nextPrivateAll[k] = m;
          }
          st.private = nextPrivateAll;
          st.waitFor = null;

          try {
            var turnPid = String(st.turn && st.turn.playerId ? st.turn.playerId : '');
            if (turnPid && String(turnPid) === String(pid)) {
              var order = Array.isArray(st.order) ? st.order.slice() : [];
              var hands = st.hands || {};
              st.turn = hnNextTurnSkipEmpty(order, pid, hands);
            }
          } catch (eAdv) {
            // ignore
          }

          return assign({}, room, { state: st });
        }

        var nextPrivate = assign({}, st.private);
        delete nextPrivate[pid];
        st.private = nextPrivate;
        return assign({}, room, { state: st });
      });
    }

    function tryConfirmRumorByLongPress() {
      if (ui.inFlight) return;
      if (!lastRoom || !lastRoom.state) return;
      if (!canOperateThisDevice()) return;
      var st = lastRoom.state;
      if (!st.pending || st.pending.type !== 'rumor') return;
      if (st.pending.choices && st.pending.choices[String(playerId)] !== undefined) return;

      var idx = parseIntSafe(ui.hnRumorSelectedIndex, -1);
      if (idx < 0) return;
      ui.inFlight = true;
      submitHanninRumorChoice(roomId, playerId, idx)
        .catch(function (e) {
          alert((e && e.message) || '失敗');
        })
        .finally(function () {
          ui.inFlight = false;
        });
    }

    function maybeAutoAdvancePendingForTests(room) {
      // Disabled: test players are progressed from the table screen by clicking.
      return;

      var order = Array.isArray(st.order) ? st.order.slice() : [];
      if (!order.length) return;
      var hands = st.hands || {};
      var choices = (pending.choices && typeof pending.choices === 'object') ? pending.choices : {};

      var keyBase = type + '|' + String(pending.createdAt || 0);

      for (var i = 0; i < order.length; i++) {
        var pid = String(order[i] || '');
        if (!pid) continue;
        if (!hnIsTestPlayerId(pid)) continue;
        if (choices && choices[pid] !== undefined) continue;

        var k = keyBase + '|' + pid;
        if (ui.autoKeyDone && ui.autoKeyDone[k]) continue;
        if (!ui.autoKeyDone) ui.autoKeyDone = {};
        ui.autoKeyDone[k] = true;

        (function (targetPid) {
          var delay = 120 + randomInt(420);
          setTimeout(function () {
            // Re-check latest room state to avoid double submit.
            try {
              var st2 = lastRoom && lastRoom.state ? lastRoom.state : null;
              var p2 = st2 && st2.pending ? st2.pending : null;
              if (!st2 || !p2 || String(p2.type || '') !== type) return;
              if (p2.choices && p2.choices[targetPid] !== undefined) return;
            } catch (e1) {
              return;
            }

            if (type === 'info') {
              var h = lastRoom && lastRoom.state && lastRoom.state.hands && Array.isArray(lastRoom.state.hands[targetPid]) ? lastRoom.state.hands[targetPid] : [];
              if (!h || !h.length) return;
              var pick = randomInt(h.length);
              submitHanninInfoChoice(roomId, targetPid, pick).catch(function () {
                // ignore
              });
              return;
            }

            if (type === 'rumor') {
              var st3 = lastRoom && lastRoom.state ? lastRoom.state : null;
              var order3 = st3 && Array.isArray(st3.order) ? st3.order.slice() : order;
              var hands3 = st3 && st3.hands ? st3.hands : hands;
              var right = hnRightPid(order3, targetPid);
              var rh = right && hands3 && Array.isArray(hands3[right]) ? hands3[right] : [];
              var count = rh && Array.isArray(rh) ? rh.length : 0;
              var pick2 = count > 0 ? randomInt(count) : -1;
              submitHanninRumorChoice(roomId, targetPid, pick2).catch(function () {
                // ignore
              });
            }
          }, delay);
        })(pid);
      }
    }

    function maybeAutoPlayTurnForTestPlayer(room) {
      // Disabled: test players are progressed from the table screen by clicking.
      return;
    }

    firebaseReady()
      .then(function () {
        return subscribeHanninRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          // Host-side fallback: auto-deal if the table device isn't open yet.
          try {
            var stAD = room && room.state ? room.state : null;
            var orderAD = stAD && Array.isArray(stAD.order) ? stAD.order : [];
            var expectedAD = orderAD && orderAD.length ? orderAD.length : 0;
            var actualAD = room && room.players ? Object.keys(room.players || {}).length : 0;
            var enoughAD = expectedAD >= 3 ? actualAD >= expectedAD : actualAD >= 3;
            if (isHost && room && room.phase === 'lobby' && room.players && enoughAD) {
              if (!routeHanninPlayer.__autoDealt) routeHanninPlayer.__autoDealt = {};
              var keyAD = String(roomId || '') + '|' + String(actualAD);
              if (!routeHanninPlayer.__autoDealt[keyAD]) {
                routeHanninPlayer.__autoDealt[keyAD] = true;
                dealHanninGame(roomId).catch(function () {
                  // ignore
                });
              }
            }
          } catch (eAutoDealP) {
            // ignore
          }

          renderNow(room);

          // Bind "Next" button when shown.
          try {
            var nextBtn = document.getElementById('hnNextToLobby');
            if (nextBtn && !nextBtn.__hn_bound) {
              nextBtn.__hn_bound = true;
              nextBtn.addEventListener('click', function () {
                if (!lobbyId) return;
                nextBtn.disabled = true;
                firebaseReady()
                  .then(function () {
                    return setLobbyCurrentGame(lobbyId, null);
                  })
                  .then(function () {
                    redirectToLobby();
                  })
                  .catch(function (e) {
                    alert((e && e.message) || '失敗');
                  })
                  .finally(function () {
                    nextBtn.disabled = false;
                  });
              });
            }
          } catch (eBindNext) {
            // ignore
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      try {
        if (ui && ui.lobbyUnsub) ui.lobbyUnsub();
      } catch (e) {
        // ignore
      }
    });
  }

  function hnOrderIdx(order, pid) {
    if (!Array.isArray(order)) return -1;
    return order.indexOf(String(pid || ''));
  }

  function hnLeftPid(order, pid) {
    if (!Array.isArray(order) || !order.length) return '';
    var idx = hnOrderIdx(order, pid);
    if (idx < 0) idx = 0;
    var left = (idx - 1 + order.length) % order.length;
    return String(order[left] || '');
  }

  function hnRightPid(order, pid) {
    if (!Array.isArray(order) || !order.length) return '';
    var idx = hnOrderIdx(order, pid);
    if (idx < 0) idx = 0;
    var right = (idx + 1) % order.length;
    return String(order[right] || '');
  }

  function hnFindCulpritHolder(order, hands) {
    if (!Array.isArray(order)) return '';
    for (var i = 0; i < order.length; i++) {
      var pid = String(order[i] || '');
      var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
      for (var k = 0; k < h.length; k++) if (String(h[k] || '') === 'culprit') return pid;
    }
    return '';
  }

  function hnSetResult(st, side, room, culpritId, reason) {
    var order = Array.isArray(st.order) ? st.order.slice() : [];
    var allies = st.allies && typeof st.allies === 'object' ? st.allies : {};
    var winners = [];
    var cid = String(culpritId || '');
    if (!cid) cid = hnFindCulpritHolder(order, st.hands);

    if (side === 'culprit') {
      if (cid) winners.push(cid);
      for (var i = 0; i < order.length; i++) {
        var pid = String(order[i] || '');
        if (!pid) continue;
        if (pid === cid) continue;
        if (allies && allies[pid]) winners.push(pid);
      }
    } else if (side === 'citizen') {
      for (var j = 0; j < order.length; j++) {
        var pid2 = String(order[j] || '');
        if (!pid2) continue;
        if (pid2 === cid) continue;
        if (allies && allies[pid2]) continue;
        winners.push(pid2);
      }
    }

    st.result = {
      side: String(side || ''),
      winners: winners,
      culpritId: cid,
      decidedAt: serverNowMs(),
      reason: String(reason || '')
    };
    return st;
  }

  function playHanninCard(roomId, actorId, cardIndex, action) {
    var base = hanninRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;

      var st = assign({}, room.state || {});
      if (st.result && st.result.decidedAt) return room;

      // Block plays while waiting for an acknowledgement (e.g., notice/boy).
      if (st.waitFor && st.waitFor.type) return room;

      var order = Array.isArray(st.order) ? st.order.slice() : [];
      var hands = assign({}, st.hands || {});
      var grave = Array.isArray(st.graveyard) ? st.graveyard.slice() : [];
      var used = assign({}, st.used || {});

      var turnPid = String(st.turn && st.turn.playerId ? st.turn.playerId : '');
      var pid = String(actorId || '');
      if (!pid || pid !== turnPid) return room;

      if (st.pending && st.pending.type) {
        // Cannot play while a pending group effect is active.
        return room;
      }

      var h = hands && Array.isArray(hands[pid]) ? hands[pid].slice() : [];
      var idx = parseIntSafe(cardIndex, -1);
      if (idx < 0 || idx >= h.length) return room;

      var cardId = String(h[idx] || '');

      // Start rule: first discoverer must play "first" to begin.
      if (!st.started) {
        if (cardId !== 'first') return room;
      }

      // Detective can only be played from the 2nd round and later.
      if (cardId === 'detective' && st.started) {
        if (typeof st.turnCount !== 'number') st.turnCount = order.length;
        var tc0 = parseIntSafe(st.turnCount, 0);
        if (order && order.length && tc0 < order.length) return room;
      }

      // Culprit can only be played when it's the only card in hand.
      if (cardId === 'culprit') {
        if (h.length !== 1) return room;
      }

      var a = action && typeof action === 'object' ? action : {};

      // Discard the played card.
      h.splice(idx, 1);
      hands[pid] = h;
      grave.push(cardId);
      try {
        var u0 = used && Array.isArray(used[pid]) ? used[pid].slice() : [];
        u0.push(cardId);
        used[pid] = u0;
      } catch (eUsed0) {
        // ignore
      }

      // Count turns (used for round-based restrictions).
      if (typeof st.turnCount !== 'number') st.turnCount = 0;
      st.turnCount = (parseIntSafe(st.turnCount, 0) || 0) + 1;

      st.hands = hands;
      st.graveyard = grave;
      st.used = used;
      if (!Array.isArray(st.log)) st.log = [];

      var nm = hnPlayerName(room, pid);
      var cardNm = (HANNIN_CARD_DEFS[cardId] ? HANNIN_CARD_DEFS[cardId].name : cardId);
      var lastPlayTo = '';
      var line = '';
      try {
        var tPid0 = a && a.targetPid ? String(a.targetPid || '') : '';
        lastPlayTo = String(tPid0 || '');
        var tNm0 = tPid0 ? hnPlayerName(room, tPid0) : '';
        if (cardId === 'detective' || cardId === 'dog' || cardId === 'witness' || cardId === 'deal') {
          line = tNm0 ? nm + ' が ' + tNm0 + ' へ ' + cardNm + ' を使用' : nm + ' が ' + cardNm + ' を使用';
        } else {
          line = nm + ' が ' + cardNm + ' を使用';
        }
      } catch (eLP0) {
        line = nm + ' が ' + cardNm + ' を使用';
      }
      st.log = st.log.concat([line]);
      try {
        var text0 = String(line || '');
        if (text0 && text0[text0.length - 1] !== '。') text0 += '。';
        st.lastPlay = { at: serverNowMs(), playerId: pid, cardId: cardId, to: String(lastPlayTo || ''), text: text0 };
      } catch (eLP1) {
        st.lastPlay = { at: serverNowMs(), playerId: pid, cardId: cardId };
      }

      function advanceTurn() {
        st.turn = hnNextTurnSkipEmpty(order, pid, hands);
      }

      // Resolve effects
      if (cardId === 'first') {
        st.started = true;
        st.log = st.log.concat(['ゲーム開始']);
        advanceTurn();
        return assign({}, room, { state: st });
      }

      if (cardId === 'citizen' || cardId === 'alibi') {
        advanceTurn();
        return assign({}, room, { state: st });
      }

      if (cardId === 'plot') {
        if (!st.allies || typeof st.allies !== 'object') st.allies = {};
        st.allies[pid] = true;
        // No immediate effect (behaves like citizen for now).
        advanceTurn();
        return assign({}, room, { state: st });
      }

      if (cardId === 'culprit') {
        // Culprit wins (with allies)
        hnSetResult(st, 'culprit', room, pid, '犯人が最後の手札「犯人」を出した');
        st.log = st.log.concat(['犯人側の勝利']);
        return assign({}, room, { state: st });
      }

      if (cardId === 'detective') {
        var tPid = String(a.targetPid || '');
        if (!tPid || tPid === pid) {
          advanceTurn();
          return assign({}, room, { state: st });
        }
        var th = hands && Array.isArray(hands[tPid]) ? hands[tPid] : [];
        var hasC = false;
        var hasA = false;
        for (var iC = 0; iC < th.length; iC++) {
          if (String(th[iC] || '') === 'culprit') hasC = true;
          if (String(th[iC] || '') === 'alibi') hasA = true;
        }

        // If the target has any alibi, detective is nullified regardless of culprit.
        if (hasA) {
          try {
            if (!st.private || typeof st.private !== 'object') st.private = {};
            var at0 = serverNowMs();
            var tnm0 = hnPlayerName(room, tPid);
            var msg0 = '探偵が選んだ' + (tnm0 || '対象') + 'は犯人ではありません';
            for (var da0 = 0; da0 < order.length; da0++) {
              var pda0 = String(order[da0] || '');
              if (!pda0) continue;
              st.private[pda0] = { type: 'notice', title: '探偵', message: msg0, actorPid: pid, createdAt: at0, targetPid: String(tPid || '') };
            }
            st.waitFor = { type: 'notice_ack', by: pid, createdAt: at0, cardId: 'detective' };

            // Reflect the same result text in last play.
            try {
              if (!st.lastPlay || typeof st.lastPlay !== 'object') st.lastPlay = {};
              st.lastPlay.to = String(tPid || '');
              st.lastPlay.text = String(msg0 || '');
            } catch (eLPD0) {
              // ignore
            }
          } catch (eDA) {
            // ignore
          }
          st.log = st.log.concat(['アリバイにより探偵の効果は無効']);
          // Wait for the actor to acknowledge.
          return assign({}, room, { state: st });
        }

        if (hasC && !hasA) {
          try {
            if (!st.lastPlay || typeof st.lastPlay !== 'object') st.lastPlay = {};
            st.lastPlay.to = String(tPid || '');
            st.lastPlay.text = '探偵が犯人を指摘した';
          } catch (eLPDWin) {
            // ignore
          }
          hnSetResult(st, 'citizen', room, tPid, '探偵が犯人を指摘した');
          st.log = st.log.concat(['一般人側の勝利']);
          return assign({}, room, { state: st });
        }

        // Not culprit: broadcast to all players and wait for actor OK.
        try {
          if (!st.private || typeof st.private !== 'object') st.private = {};
          var at1 = serverNowMs();
          var tnm1 = hnPlayerName(room, tPid);
          var msg1 = '探偵が選んだ' + (tnm1 || '対象') + 'は犯人ではありません';
          for (var bi = 0; bi < order.length; bi++) {
            var pbi = String(order[bi] || '');
            if (!pbi) continue;
            st.private[pbi] = { type: 'notice', title: '探偵', message: msg1, actorPid: pid, createdAt: at1, targetPid: String(tPid || '') };
          }
          st.waitFor = { type: 'notice_ack', by: pid, createdAt: at1, cardId: 'detective' };

          // Reflect the same result text in last play.
          try {
            if (!st.lastPlay || typeof st.lastPlay !== 'object') st.lastPlay = {};
            st.lastPlay.to = String(tPid || '');
            st.lastPlay.text = String(msg1 || '');
          } catch (eLPD1) {
            // ignore
          }
        } catch (eNC0) {
          // ignore
        }
        return assign({}, room, { state: st });
      }

      if (cardId === 'dog') {
        var tPid2 = String(a.targetPid || '');
        var pick = parseIntSafe(a.targetIndex, -1);
        if (!tPid2 || tPid2 === pid) {
          advanceTurn();
          return assign({}, room, { state: st });
        }
        var th2 = hands && Array.isArray(hands[tPid2]) ? hands[tPid2] : [];
        if (pick < 0 || pick >= th2.length) {
          advanceTurn();
          return assign({}, room, { state: st });
        }
        if (String(th2[pick] || '') === 'culprit') {
          try {
            if (!st.lastPlay || typeof st.lastPlay !== 'object') st.lastPlay = {};
            st.lastPlay.to = String(tPid2 || '');
            st.lastPlay.text = 'いぬが犯人カードを当てた';
          } catch (eLPDogWin) {
            // ignore
          }
          hnSetResult(st, 'citizen', room, tPid2, 'いぬが犯人カードを当てた');
          st.log = st.log.concat(['一般人側の勝利']);
          return assign({}, room, { state: st });
        }

        // Not culprit: broadcast to all players and wait for actor OK.
        try {
          if (!st.private || typeof st.private !== 'object') st.private = {};
          var at2 = serverNowMs();
          var tnm2 = hnPlayerName(room, tPid2);
          var msg2 = '犬が選んだ' + (tnm2 || '対象') + 'のカードは犯人ではありませんでした';
          for (var bj = 0; bj < order.length; bj++) {
            var pbj = String(order[bj] || '');
            if (!pbj) continue;
            st.private[pbj] = { type: 'notice', title: 'いぬ', message: msg2, actorPid: pid, createdAt: at2, targetPid: String(tPid2 || '') };
          }
          st.waitFor = { type: 'notice_ack', by: pid, createdAt: at2, cardId: 'dog' };

          // Reflect the same result text in last play.
          try {
            if (!st.lastPlay || typeof st.lastPlay !== 'object') st.lastPlay = {};
            st.lastPlay.to = String(tPid2 || '');
            st.lastPlay.text = String(msg2 || '');
          } catch (eLPDog2) {
            // ignore
          }
        } catch (eDogN2) {
          // ignore
        }
        return assign({}, room, { state: st });
      }

      if (cardId === 'witness') {
        var tPid4 = String(a.targetPid || '');
        if (!tPid4 || tPid4 === pid) {
          advanceTurn();
          return assign({}, room, { state: st });
        }
        var th4 = hands && Array.isArray(hands[tPid4]) ? hands[tPid4] : [];
        try {
          if (!st.private || typeof st.private !== 'object') st.private = {};
          st.private[pid] = { type: 'witness', createdAt: serverNowMs(), targetPid: String(tPid4 || ''), cards: th4.slice() };
        } catch (eWit) {
          // ignore
        }
        advanceTurn();
        return assign({}, room, { state: st });
      }

      if (cardId === 'boy') {
        // Private reveal: show culprit holder only to the actor.
        try {
          var cpid = hnFindCulpritHolder(order, hands);
          if (!st.private || typeof st.private !== 'object') st.private = {};
          var at3 = serverNowMs();
          st.private[pid] = { type: 'boy', createdAt: at3, culpritPid: String(cpid || '') };
          st.waitFor = { type: 'private_ack', by: pid, createdAt: at3, cardId: 'boy' };
        } catch (eBoy) {
          // ignore
        }
        // Wait for actor OK before advancing the turn.
        return assign({}, room, { state: st });
      }

      if (cardId === 'deal') {
        var tPid3 = String(a.targetPid || '');
        if (!tPid3 || tPid3 === pid) {
          advanceTurn();
          return assign({}, room, { state: st });
        }

        // If the actor has no remaining hand after using Deal, the effect cannot resolve.
        // Skip the effect and proceed to next turn.
        try {
          var ah3 = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
          if (!ah3.length) {
            advanceTurn();
            return assign({}, room, { state: st });
          }
        } catch (eDealA0) {
          // ignore
        }

        // Target must have at least one card to exchange.
        try {
          var th3 = hands && Array.isArray(hands[tPid3]) ? hands[tPid3] : [];
          if (!th3.length) {
            advanceTurn();
            return assign({}, room, { state: st });
          }
        } catch (eDealT0) {
          // ignore
        }

        // Pending: actor and target choose simultaneously.
        st.pending = {
          type: 'deal',
          actorId: pid,
          targetPid: tPid3,
          createdAt: serverNowMs(),
          choices: {},
          resumeFrom: pid
        };
        st.log = st.log.concat([nm + ' は ' + hnPlayerName(room, tPid3) + ' と取引：双方が出すカードを選択中']);
        return assign({}, room, { state: st });
      }

      if (cardId === 'rumor') {
        // Pending group action: each player selects 1 facedown card to draw from the right neighbor.
        st.pending = {
          type: 'rumor',
          actorId: pid,
          createdAt: serverNowMs(),
          choices: {},
          resumeFrom: pid
        };
        st.log = st.log.concat(['うわさ：全員が右隣から引くカードを選択中']);
        return assign({}, room, { state: st });
      }

      if (cardId === 'info') {
        // Pending group action: each player selects 1 card to pass to left neighbor.
        st.pending = {
          type: 'info',
          actorId: pid,
          createdAt: serverNowMs(),
          choices: {},
          resumeFrom: pid
        };
        st.log = st.log.concat(['情報操作：全員が左隣へ渡すカードを選択中']);
        return assign({}, room, { state: st });
      }

      // Unknown card: just advance.
      advanceTurn();
      return assign({}, room, { state: st });
    });
  }

  function submitHanninInfoChoice(roomId, playerId, passIndex) {
    var base = hanninRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room || room.phase !== 'playing') return room;
      var st = assign({}, room.state || {});
      if (!st.pending || st.pending.type !== 'info') return room;
      if (st.result && st.result.decidedAt) return room;

      var pid = String(playerId || '');
      var idx = parseIntSafe(passIndex, -1);
      if (!pid || idx < 0) return room;

      var hands = assign({}, st.hands || {});
      var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
      if (idx >= h.length) return room;

      var order = Array.isArray(st.order) ? st.order.slice() : [];
      if (order.indexOf(pid) < 0) return room;

      if (!st.pending.choices || typeof st.pending.choices !== 'object') st.pending.choices = {};
      if (st.pending.choices[pid] !== undefined) return room;
      st.pending.choices[pid] = idx;

      // If all submitted, resolve simultaneously.
      var done = true;
      for (var i = 0; i < order.length; i++) {
        var p = String(order[i] || '');
        var hh = hands && Array.isArray(hands[p]) ? hands[p] : [];
        if (!hh.length) continue; // skip players with no hand
        if (st.pending.choices[p] === undefined) {
          done = false;
          break;
        }
      }
      if (!done) return assign({}, room, { state: st });

      var snapshot = {};
      for (var iS = 0; iS < order.length; iS++) {
        var pS = String(order[iS] || '');
        snapshot[pS] = hands && Array.isArray(hands[pS]) ? hands[pS].slice() : [];
      }

      var giveCard = {};
      for (var iG = 0; iG < order.length; iG++) {
        var pG = String(order[iG] || '');
        var hG = snapshot[pG] || [];
        if (!hG.length) continue; // skip players with no hand
        var choose = parseIntSafe(st.pending.choices[pG], -1);
        if (choose < 0 || choose >= hG.length) return room;
        giveCard[pG] = String(hG[choose] || '');
      }

      // Remove chosen cards
      for (var iR = 0; iR < order.length; iR++) {
        var pR = String(order[iR] || '');
        var real = hands && Array.isArray(hands[pR]) ? hands[pR].slice() : [];
        if (!giveCard[pR]) {
          hands[pR] = real;
          continue;
        }
        var choose2 = parseIntSafe(st.pending.choices[pR], -1);
        if (choose2 >= 0 && choose2 < real.length) real.splice(choose2, 1);
        else {
          var fx = real.indexOf(giveCard[pR]);
          if (fx >= 0) real.splice(fx, 1);
        }
        hands[pR] = real;
      }

      // Give to left
      for (var iL = 0; iL < order.length; iL++) {
        var pL = String(order[iL] || '');
        var left = hnLeftPid(order, pL);
        if (!left) continue;
        if (!giveCard[pL]) continue;
        var lh = hands && Array.isArray(hands[left]) ? hands[left].slice() : [];
        lh.push(giveCard[pL]);
        hands[left] = lh;
      }

      st.hands = hands;
      var resumeFrom = '';
      try {
        resumeFrom = String(st.pending && (st.pending.resumeFrom || st.pending.actorId) ? (st.pending.resumeFrom || st.pending.actorId) : '');
      } catch (eRF) {
        resumeFrom = '';
      }
      st.pending = null;
      if (resumeFrom) st.turn = hnNextTurnSkipEmpty(order, resumeFrom, hands);

      if (!Array.isArray(st.log)) st.log = [];
      st.log = st.log.concat(['情報操作：全員が左隣へ1枚渡した']);
      return assign({}, room, { state: st });
    });
  }

  function submitHanninRumorChoice(roomId, playerId, pickIndex) {
    var base = hanninRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room || room.phase !== 'playing') return room;
      var st = assign({}, room.state || {});
      if (!st.pending || st.pending.type !== 'rumor') return room;
      if (st.result && st.result.decidedAt) return room;

      var pid = String(playerId || '');
      if (!pid) return room;

      var order = Array.isArray(st.order) ? st.order.slice() : [];
      if (order.indexOf(pid) < 0) return room;

      var hands = assign({}, st.hands || {});

      function rightWithCards(snapshotHands, fromPid) {
        var from = String(fromPid || '');
        var startIdx = order.indexOf(from);
        if (startIdx < 0) return '';
        for (var step = 1; step < order.length; step++) {
          var cand = String(order[(startIdx + step) % order.length] || '');
          if (!cand) continue;
          var h0 = snapshotHands && Array.isArray(snapshotHands[cand]) ? snapshotHands[cand] : [];
          if (h0.length) return cand;
        }
        return '';
      }

      var right = rightWithCards(hands, pid);
      var rh = right && hands && Array.isArray(hands[right]) ? hands[right] : [];
      var idx = parseIntSafe(pickIndex, -1);
      if (rh.length) {
        if (idx < 0 || idx >= rh.length) return room;
      } else {
        // If right neighbor has no cards, allow a "no-op" choice.
        idx = -1;
      }

      if (!st.pending.choices || typeof st.pending.choices !== 'object') st.pending.choices = {};
      if (st.pending.choices[pid] !== undefined) return room;
      st.pending.choices[pid] = idx;

      // If all submitted, resolve simultaneously.
      var done = true;
      for (var i = 0; i < order.length; i++) {
        var p = String(order[i] || '');
        var myH = hands && Array.isArray(hands[p]) ? hands[p] : [];
        if (!myH.length) continue; // skip players with no hand
        var rPid0 = rightWithCards(hands, p);
        var rH0 = rPid0 && hands && Array.isArray(hands[rPid0]) ? hands[rPid0] : [];
        if (!rPid0 || !rH0.length) continue; // skip if there is no valid target with cards
        if (st.pending.choices[p] === undefined) {
          done = false;
          break;
        }
      }
      if (!done) return assign({}, room, { state: st });

      var snapshot = {};
      for (var iS = 0; iS < order.length; iS++) {
        var pS = String(order[iS] || '');
        snapshot[pS] = hands && Array.isArray(hands[pS]) ? hands[pS].slice() : [];
      }

      var requestsByTarget = {};
      for (var iT = 0; iT < order.length; iT++) {
        var pT = String(order[iT] || '');
        var myHT = hands && Array.isArray(hands[pT]) ? hands[pT] : [];
        if (!myHT.length) continue; // skip players with no hand
        var rPid = rightWithCards(snapshot, pT);
        var sh = rPid ? snapshot[rPid] || [] : [];
        var choose = parseIntSafe(st.pending.choices[pT], -1);
        if (!rPid || !sh.length || choose < 0 || choose >= sh.length) continue;
        if (!requestsByTarget[rPid]) requestsByTarget[rPid] = [];
        requestsByTarget[rPid].push({ actor: pT, idx: choose });
      }

      var nextHands = {};
      for (var iC = 0; iC < order.length; iC++) {
        var pC = String(order[iC] || '');
        nextHands[pC] = snapshot[pC] ? snapshot[pC].slice() : [];
      }

      var takenByActor = {};

      // Remove selected cards from targets. If multiple players target the same hand, resolve deterministically:
      // - duplicate index picks: first one wins
      // - remove in descending index order to keep indices stable
      for (var iK = 0; iK < order.length; iK++) {
        var targetPid = String(order[iK] || '');
        var reqs = requestsByTarget[targetPid] || [];
        if (!reqs.length) continue;

        var seenIdx = {};
        var uniq = [];
        for (var ui = 0; ui < reqs.length; ui++) {
          var ri = reqs[ui];
          var key = String(ri.idx);
          if (seenIdx[key]) continue;
          seenIdx[key] = true;
          uniq.push(ri);
        }

        uniq.sort(function (a, b) {
          return parseIntSafe(b.idx, 0) - parseIntSafe(a.idx, 0);
        });

        var real = nextHands[targetPid] ? nextHands[targetPid].slice() : [];
        for (var ui2 = 0; ui2 < uniq.length; ui2++) {
          var rr = uniq[ui2];
          var ix = parseIntSafe(rr.idx, -1);
          if (ix < 0 || ix >= real.length) continue;
          var card = String(real[ix] || '');
          real.splice(ix, 1);
          if (card) takenByActor[String(rr.actor || '')] = card;
        }
        nextHands[targetPid] = real;
      }

      // Give taken cards to the choosing player.
      for (var iG = 0; iG < order.length; iG++) {
        var pG = String(order[iG] || '');
        var tk = takenByActor[pG] ? String(takenByActor[pG] || '') : '';
        if (!tk) continue;
        var hh = nextHands[pG] ? nextHands[pG].slice() : [];
        hh.push(tk);
        nextHands[pG] = hh;
      }

      st.hands = nextHands;
      var resumeFrom = '';
      try {
        resumeFrom = String(st.pending && (st.pending.resumeFrom || st.pending.actorId) ? (st.pending.resumeFrom || st.pending.actorId) : '');
      } catch (eRF2) {
        resumeFrom = '';
      }
      st.pending = null;
      if (resumeFrom) st.turn = hnNextTurnSkipEmpty(order, resumeFrom, nextHands);

      if (!Array.isArray(st.log)) st.log = [];
      st.log = st.log.concat(['うわさ：全員が右隣から1枚引いた']);
      return assign({}, room, { state: st });
    });
  }

  function submitHanninDealChoice(roomId, playerId, takeIndex) {
    var base = hanninRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room || room.phase !== 'playing') return room;
      var st = assign({}, room.state || {});
      if (!st.pending || st.pending.type !== 'deal') return room;
      if (st.result && st.result.decidedAt) return room;

      var pid = String(playerId || '');
      var pending = st.pending || {};
      var actorPid = String(pending.actorId || '');
      var targetPid = String(pending.targetPid || '');
      if (!pid || (!actorPid && !targetPid)) return room;
      var isActor = String(pid) === String(actorPid);
      var isTarget = String(pid) === String(targetPid);
      if (!isActor && !isTarget) return room;
      if (!actorPid || !targetPid) return room;

      var hands = assign({}, st.hands || {});
      var aHand = hands && Array.isArray(hands[actorPid]) ? hands[actorPid].slice() : [];
      var tHand = hands && Array.isArray(hands[targetPid]) ? hands[targetPid].slice() : [];

      // If either side has no hand (unexpected), cancel with no exchange.
      if (!aHand.length || !tHand.length) {
        st.pending = null;
        var rf0 = '';
        try {
          rf0 = String(pending && (pending.resumeFrom || pending.actorId) ? (pending.resumeFrom || pending.actorId) : '');
        } catch (eR0) {
          rf0 = '';
        }
        if (rf0) st.turn = hnNextTurnSkipEmpty(Array.isArray(st.order) ? st.order.slice() : [], rf0, hands);
        if (!Array.isArray(st.log)) st.log = [];
        st.log = st.log.concat(['取引：手札がなく、交換なし']);
        return assign({}, room, { state: st });
      }

      var pickIdx = parseIntSafe(takeIndex, -1);
      var myHand = isActor ? aHand : tHand;
      if (pickIdx < 0 || pickIdx >= myHand.length) return room;

      if (!pending.choices || typeof pending.choices !== 'object') pending.choices = {};
      if (pending.choices[pid] !== undefined) return room;
      pending.choices[pid] = pickIdx;
      st.pending = pending;

      var aChosen = pending.choices[String(actorPid)] !== undefined;
      var tChosen = pending.choices[String(targetPid)] !== undefined;
      if (!aChosen || !tChosen) {
        return assign({}, room, { state: st });
      }

      // Resolve exchange.
      var aIdx = parseIntSafe(pending.choices[String(actorPid)], -1);
      var tIdx = parseIntSafe(pending.choices[String(targetPid)], -1);
      if (aIdx < 0 || aIdx >= aHand.length) return room;
      if (tIdx < 0 || tIdx >= tHand.length) return room;

      var giveCard = String(aHand[aIdx] || '');
      var takeCard = String(tHand[tIdx] || '');

      aHand.splice(aIdx, 1);
      tHand.splice(tIdx, 1);
      aHand.push(takeCard);
      tHand.push(giveCard);

      hands[actorPid] = aHand;
      hands[targetPid] = tHand;
      st.hands = hands;

      st.pending = null;
      var rf = '';
      try {
        rf = String(pending && (pending.resumeFrom || pending.actorId) ? (pending.resumeFrom || pending.actorId) : '');
      } catch (eR5) {
        rf = '';
      }
      if (rf) st.turn = hnNextTurnSkipEmpty(Array.isArray(st.order) ? st.order.slice() : [], rf, hands);

      if (!Array.isArray(st.log)) st.log = [];
      st.log = st.log.concat([hnPlayerName(room, actorPid) + ' は ' + hnPlayerName(room, targetPid) + ' と手札を1枚交換']);
      return assign({}, room, { state: st });
    });
  }

  function joinPlayerInLoveLetterRoom(roomId, playerId, name, isHostPlayer) {
    var base = loveletterRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;

      var players = assign({}, room.players || {});
      var prev = players[playerId] || {};
      var next = assign({}, prev, {
        name: name,
        joinedAt: prev.joinedAt || serverNowMs(),
        lastSeenAt: serverNowMs()
      });
      if (isHostPlayer) next.isHost = true;
      players[playerId] = next;
      return assign({}, room, { players: players });
    });
  }

  function llInitRound(room) {
    var ids = llListPlayerIdsByJoin(room);
    var playerCount = ids.length;
    if (playerCount < 2) return null;

    var deck = llShuffle(llBuildDeck(room && room.settings));
    var grave = [];
    // Place exactly 1 face-down burn card at the start of the round.
    if (deck.length) grave.push(String(deck.pop()));

    var hands = {};
    var discards = {};
    var eliminated = {};
    var protectedMap = {};
    for (var p = 0; p < ids.length; p++) {
      var pid = ids[p];
      eliminated[pid] = false;
      protectedMap[pid] = false;
      discards[pid] = [];
      hands[pid] = [];
      if (deck.length) hands[pid].push(String(deck.pop()));
    }

    var startIndex = randomInt(ids.length);
    var startId = ids[startIndex];
    // Clear protection at start of your turn.
    protectedMap[startId] = false;
    if (hands[startId] && deck.length) hands[startId].push(String(deck.pop()));

    // Minister(7) overload rule: if you have the base Minister card ('7') and your 2-card total >= 12, you immediately lose.
    // Hold the round until the player acknowledges.
    var startHand = Array.isArray(hands[startId]) ? hands[startId] : [];
    if (startHand.length >= 2) {
      var a0 = String(startHand[0] || '');
      var b0 = String(startHand[1] || '');
      var av0 = llCardRank(a0);
      var bv0 = llCardRank(b0);
      var total0 = (av0 || 0) + (bv0 || 0);
      if ((a0 === '7' || b0 === '7') && total0 >= 12) {
        var ps0 = room && room.players ? room.players : {};
        function _pname0(pid) {
          try {
            return pid && ps0[pid] ? formatPlayerDisplayName(ps0[pid]) : String(pid || '-');
          } catch (e) {
            return String(pid || '-');
          }
        }

        // Overload: resolve on acknowledgement so the player sees what happened.
        var other0 = a0 === '7' ? String(b0 || '') : String(a0 || '');
        hands[startId] = ['7', other0].filter(Boolean);

        var otherDef0 = llCardDef(String(other0 || ''));
        var otherLabel0 = String((otherDef0 && otherDef0.name) || '-') + '(' + String((otherDef0 && otherDef0.rank) || llCardRankStr(String(other0 || '')) || '-') + ')';
        var lpText0 = _pname0(startId) + ' が大臣(7)を持っていて ' + otherLabel0 + ' を引いたため脱落した。';

        return {
          no: parseIntSafe(room && room.round && room.round.no, 0) + 1,
          state: 'playing',
          startedAt: serverNowMs(),
          endedAt: 0,
          order: ids,
          currentIndex: startIndex,
          currentPlayerId: startId,
          deck: deck,
          grave: grave,
          burn: '',
          setAside: [],
          hands: hands,
          discards: discards,
          eliminated: eliminated,
          protected: protectedMap,
          peek: null,
          lastPlay: { by: startId, to: '', card: String(other0 || ''), at: serverNowMs(), text: lpText0 },
          reveal: { type: 'minister_overload', by: startId, had: '7', drew: String(other0 || '') },
          waitFor: { type: 'minister_overload_ack', by: startId, pending: { type: 'minister_overload', pid: startId, other: String(other0 || '') } },
          winners: []
        };
      }
    }

    return {
      no: parseIntSafe(room && room.round && room.round.no, 0) + 1,
      state: 'playing',
      startedAt: serverNowMs(),
      endedAt: 0,
      order: ids,
      currentIndex: startIndex,
      currentPlayerId: startId,
      deck: deck,
      grave: grave,
      burn: '',
      setAside: [],
      hands: hands,
      discards: discards,
      eliminated: eliminated,
      protected: protectedMap,
      peek: null,
      reveal: null,
      waitFor: null,
      winners: []
    };
  }

  function startLoveLetterGame(roomId, hostPlayerId) {
    var base = loveletterRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;
      var host = room.players && hostPlayerId && room.players[hostPlayerId] ? room.players[hostPlayerId] : null;
      if (!host || !host.isHost) return room;

      var ids = llListPlayerIdsByJoin(room);
      if (ids.length < 2) return room;

      var nextRound = llInitRound(room);
      if (!nextRound) return room;

      var nextRoom = assign({}, room, {
        phase: 'playing',
        round: nextRound
      });
      nextRoom.result = null;
      nextRoom.log = llAppendLog(nextRoom, 'ゲーム開始');
      nextRoom.log = llAppendLog(nextRoom, 'ラウンド ' + nextRound.no + ' 開始');
      return nextRoom;
    });
  }

  function startLoveLetterNextRound(roomId, hostPlayerId) {
    var base = loveletterRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'round_over') return room;
      var host = room.players && hostPlayerId && room.players[hostPlayerId] ? room.players[hostPlayerId] : null;
      if (!host || !host.isHost) return room;

      var nextRound = llInitRound(room);
      if (!nextRound) return room;
      var nextRoom = assign({}, room, { phase: 'playing', round: nextRound });
      nextRoom.log = llAppendLog(nextRoom, 'ラウンド ' + nextRound.no + ' 開始');
      return nextRoom;
    });
  }

  function playLoveLetterAction(roomId, actorId, action) {
    var base = loveletterRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;
      var round = room.round || null;
      if (!round || round.state !== 'playing') return room;
      // If the round is waiting for an acknowledgement (e.g., Knight/Minister), block actions.
      if (round.waitFor && round.waitFor.type) return room;
      if (String(round.currentPlayerId || '') !== String(actorId || '')) return room;
      if (round.eliminated && round.eliminated[actorId]) return room;

      var card = action && action.card ? String(action.card) : '';
      if (!card) return room;

      var hands = assign({}, round.hands || {});
      var myHand = Array.isArray(hands[actorId]) ? hands[actorId].slice() : [];
      if (myHand.length < 2) return room;
      var idx = myHand.indexOf(card);
      if (idx < 0) return room;

      // Countess rule (extra card): force playing 7:countess.
      if (llMustPlayCountess(myHand) && String(card) !== '7:countess') return room;

      // Remove played card from hand.
      myHand.splice(idx, 1);
      hands[actorId] = myHand;

      var discards = assign({}, round.discards || {});
      var myDisc = Array.isArray(discards[actorId]) ? discards[actorId].slice() : [];
      myDisc.push(card);
      discards[actorId] = myDisc;

      var grave = Array.isArray(round.grave) ? round.grave.slice() : [];
      // Played card goes to global grave.
      grave.push(card);

      var eliminated = assign({}, round.eliminated || {});
      var protectedMap = assign({}, round.protected || {});

      // Clear any previous peek.
      var peek = null;

      var ps = room.players || {};
      function pname(pid) {
        return pid && ps[pid] ? formatPlayerDisplayName(ps[pid]) : String(pid || '-');
      }

      function isProtected(pid) {
        return !!(protectedMap && protectedMap[pid]);
      }

      function isElim(pid) {
        return !!(eliminated && eliminated[pid]);
      }

      function eligibleTargetIds(allowSelf) {
        var ids = llListPlayerIdsByJoin(room);
        var out = [];
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          if (!id) continue;
          if (!allowSelf && String(id) === String(actorId)) continue;
          if (isElim(id)) continue;
          out.push(id);
        }
        return out;
      }

      function getSingleHand(pid) {
        var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
        return h.length ? String(h[0]) : '';
      }

      function setSingleHand(pid, cardRank) {
        hands[pid] = cardRank ? [String(cardRank)] : [];
      }

      function pushDiscard(pid, cardRank) {
        var d = Array.isArray(discards[pid]) ? discards[pid].slice() : [];
        if (cardRank) d.push(String(cardRank));
        discards[pid] = d;
        if (cardRank) grave.push(String(cardRank));
      }

      function eliminatePlayer(pid, reason, opts) {
        if (eliminated[pid]) return { eliminated: false, revived: false, drew: '' };

        var h = hands && Array.isArray(hands[pid]) ? hands[pid].slice() : [];
        var reviveByMegane = !!(opts && opts.megane);
        if (!reviveByMegane) {
          for (var mi = 0; mi < h.length; mi++) {
            if (String(h[mi] || '') === '8:megane') {
              reviveByMegane = true;
              break;
            }
          }
        }

        eliminated[pid] = true;
        protectedMap[pid] = false;

        // move remaining hand to discard (public)
        for (var i = 0; i < h.length; i++) pushDiscard(pid, h[i]);
        hands[pid] = [];

        if (reviveByMegane) {
          // Revive: draw 1 card from deck; if empty, take the face-down burn card (grave[0]).
          var drew = '';
          var d = llDrawFromRound(round);
          if (d) {
            drew = String(d);
            hands[pid] = [drew];
          } else {
            var burnCard = grave && Array.isArray(grave) && grave.length ? String(grave[0] || '') : '';
            if (burnCard) {
              grave.shift();
              drew = burnCard;
              hands[pid] = [drew];
            }
          }

          eliminated[pid] = false;
          protectedMap[pid] = false;
          return { eliminated: true, revived: true, drew: drew };
        }

        if (reason) {
          // reserved
        }
        return { eliminated: true, revived: false, drew: '' };
      }

      var actorName = pname(actorId);
      var cardDef = llCardDef(card);
      var cardRankStr = llCardRankStr(card);

      var logText = actorName + ' が ' + cardDef.name + '(' + cardDef.rank + ') を使用';

      var lastPlayTo = '';

      // Apply effects
      if (cardRankStr === '1') {
        // Guard: choose target + guess (2-8)
        var t = action && action.target ? String(action.target) : '';
        var guess = action && action.guess ? String(action.guess) : '';
        var eligible = eligibleTargetIds(false);
        if (eligible.length && (!t || eligible.indexOf(t) < 0)) return room;
        var g = parseIntSafe(guess, 0);
        if (!(g >= 2 && g <= 8)) return room;
        if (t) {
          lastPlayTo = String(t || '');
          var th = getSingleHand(t);
          logText += ' → 対象 ' + pname(t) + ' / 推測 ' + llCardDef(String(g)).name + '(' + g + ')';
          var protectedHit = false;
          var hit = false;
          if (isProtected(t)) {
            logText += '（僧侶により保護中：無効）';
            protectedHit = true;
          } else if (th && parseIntSafe(th, 0) === g) {
            var er1 = eliminatePlayer(t, 'guard');
            logText += er1 && er1.revived ? '（的中：脱落→復帰）' : '（的中：脱落）';
            hit = true;
          } else {
            logText += '（外れ）';
          }

          // Show guess + result to everyone, and wait for actor to proceed.
          round.reveal = { type: 'guard', by: actorId, target: t, guess: String(g), result: hit ? 'hit' : 'miss', protected: !!protectedHit };
          round.waitFor = { type: 'guard_ack', by: actorId };
        } else {
          logText += '（対象なし）';
        }
      } else if (cardRankStr === '2') {
        // Clown: peek
        var t2 = action && action.target ? String(action.target) : '';
        var eligible2 = eligibleTargetIds(false);
        if (eligible2.length && (!t2 || eligible2.indexOf(t2) < 0)) return room;
        if (t2) {
          lastPlayTo = String(t2 || '');
          if (isProtected(t2)) {
            logText += ' → ' + pname(t2) + '（僧侶により保護中：無効）';
          } else {
            var seen = getSingleHand(t2);
            peek = { to: actorId, target: t2, card: seen, until: serverNowMs() + 60000 };
            logText += ' → ' + pname(t2) + ' の手札を確認';
            // Show arrow on table while waiting for ack.
            round.reveal = { type: 'clown', by: actorId, target: t2 };
            // Block turn advancement until the peeker acknowledges.
            round.waitFor = { type: 'peek_ack', by: actorId };
          }
        } else {
          logText += '（対象なし）';
        }
      } else if (cardRankStr === '3') {
        // Knight
        var t3 = action && action.target ? String(action.target) : '';
        var eligible3 = eligibleTargetIds(false);
        if (eligible3.length && (!t3 || eligible3.indexOf(t3) < 0)) return room;
        if (t3) {
          lastPlayTo = String(t3 || '');
          if (isProtected(t3)) {
            logText += ' → ' + pname(t3) + '（僧侶により保護中：無効）';
          } else {
            // Compare actor's remaining hand vs target's hand.
            var aCard = getSingleHand(actorId);
            var bCard = getSingleHand(t3);
            var av = llCardRank(aCard);
            var bv = llCardRank(bCard);
            logText += ' → ' + pname(t3) + ' と比較';
            if (av && bv) {
              // Smaller number loses.
              if (av === bv) {
                logText += '（引き分け）';
              } else if (av < bv) {
                var erK1 = eliminatePlayer(actorId, 'knight');
                logText += '（' + pname(t3) + ' 勝ち：' + actorName + (erK1 && erK1.revived ? ' 脱落→復帰）' : ' 脱落）');
              } else {
                var erK2 = eliminatePlayer(t3, 'knight');
                logText += '（' + actorName + ' 勝ち：' + pname(t3) + (erK2 && erK2.revived ? ' 脱落→復帰）' : ' 脱落）');
              }
            }
            // Show both cards to everyone, and wait for actor to proceed.
            round.reveal = { type: 'knight', by: actorId, target: t3, byCard: aCard, targetCard: bCard };
            round.waitFor = { type: 'knight_ack', by: actorId };
          }
        } else {
          logText += '（対象なし）';
        }
      } else if (cardRankStr === '4') {
        // Handmaid
        protectedMap[actorId] = true;
        logText += '（保護）';
      } else if (cardRankStr === '5') {
        // Wizard
        var t5 = action && action.target ? String(action.target) : '';
        var allowSelf = true;
        var eligible5 = eligibleTargetIds(true);
        if (eligible5.length && (!t5 || eligible5.indexOf(t5) < 0)) return room;
        if (t5) {
          lastPlayTo = String(t5 || '');
          if (isProtected(t5)) {
            logText += ' → ' + pname(t5) + '（僧侶により保護中：無効）';
          } else {
            var old = getSingleHand(t5);
            if (old) pushDiscard(t5, old);
            setSingleHand(t5, '');
            logText += ' → ' + pname(t5) + ' に捨て札';
            var drawn = '';
            if (llCardRankStr(old) === '8') {
              var isMegane = String(old) === '8:megane';
              var erP = eliminatePlayer(t5, 'wizard_princess', isMegane ? { megane: true } : null);
              logText += isMegane ? '（姫(眼鏡)：脱落→復帰）' : '（姫：脱落）';
            } else {
              var d5 = llDrawFromRound(round);
              if (d5) {
                drawn = String(d5);
                setSingleHand(t5, drawn);
                logText += '（引き直し）';
              } else {
                // Special rule: if deck is empty, give the initial face-down grave card (burn) to the last discarded player.
                var burnCard = grave && Array.isArray(grave) && grave.length ? String(grave[0] || '') : '';
                if (burnCard) {
                  grave.shift();
                  drawn = burnCard;
                  setSingleHand(t5, drawn);
                  logText += '（山札なし→伏せ札を受け取り）';
                } else {
                  logText += '（山札なし）';
                }
              }
            }

            // Show discarded card (and drawn card if any), and wait for actor to proceed.
            round.reveal = { type: 'wizard_discard', by: actorId, target: t5, discarded: String(old || ''), drew: String(drawn || '') };
            round.waitFor = { type: 'wizard_ack', by: actorId };
          }
        } else {
          logText += '（対象なし）';
        }
      } else if (cardRankStr === '6') {
        // General (swap)
        var t6 = action && action.target ? String(action.target) : '';
        var eligible6 = eligibleTargetIds(false);
        if (eligible6.length && (!t6 || eligible6.indexOf(t6) < 0)) return room;
        if (t6) {
          lastPlayTo = String(t6 || '');
          if (isProtected(t6)) {
            logText += ' → ' + pname(t6) + '（僧侶により保護中：無効）';
          } else {
            var a6 = getSingleHand(actorId);
            var b6 = getSingleHand(t6);
            setSingleHand(actorId, b6);
            setSingleHand(t6, a6);
            logText += ' → ' + pname(t6) + ' と手札交換';

            // Show swapped cards and wait for actor to proceed.
            round.reveal = { type: 'general_swap', by: actorId, target: t6, byCard: a6, targetCard: b6 };
            round.waitFor = { type: 'general_ack', by: actorId };
          }
        } else {
          logText += '（対象なし）';
        }
      } else if (cardRankStr === '7') {
        // Countess
        logText += '（効果なし）';
      } else if (cardRankStr === '8') {
        // Princess: base '8' cannot be played by choice, but 8:megane can.
        if (String(card) === '8:megane') {
          // Intentional discard is allowed, but does NOT draw.
          logText += '（効果なし）';
        } else {
          return room;
        }
      }

      // Persist the latest play so the table can show it until the next play.
      try {
        var lastPlayText = String(logText || '');
        if (lastPlayText && lastPlayText[lastPlayText.length - 1] !== '。') lastPlayText += '。';
        round.lastPlay = {
          by: String(actorId || ''),
          to: String(lastPlayTo || ''),
          card: String(card || ''),
          at: serverNowMs(),
          text: lastPlayText
        };
      } catch (eLP0) {
        // ignore
      }

      // Write back updated round parts.
      round.hands = hands;
      round.discards = discards;
      round.eliminated = eliminated;
      round.protected = protectedMap;
      round.peek = peek;
      round.grave = grave;

      var nextRoom = assign({}, room);
      nextRoom.round = round;
      nextRoom.log = llAppendLog(nextRoom, logText);

      // If waiting for reveal acknowledgement (e.g., Knight), do not advance turn yet.
      if (round.waitFor && round.waitFor.type) {
        nextRoom.round = round;
        return nextRoom;
      }

      // Determine end of round.
      var alive = llAliveIds(nextRoom, round);
      var deckLeft = Array.isArray(round.deck) ? round.deck.length : 0;
      if (alive.length <= 1) {
        var winners = llRoundWinners(nextRoom, round);
        round.winners = winners;
        round.endedAt = serverNowMs();
        round.state = 'ended';

        nextRoom.phase = 'finished';
        nextRoom.result = { winners: winners, finishedAt: serverNowMs() };
        nextRoom.round = round;
        nextRoom.log = llAppendLog(nextRoom, 'ゲーム終了');
        return nextRoom;
      }

      if (deckLeft === 0) {
        // Showdown: reveal all hands, and wait for host to announce result.
        var hostId = llFindHostId(nextRoom) || String(round.currentPlayerId || '') || String(actorId || '');
        round.reveal = { type: 'showdown', hostId: hostId, hands: assign({}, round.hands || {}) };
        round.waitFor = { type: 'showdown_ack', by: hostId };
        nextRoom.round = round;
        nextRoom.log = llAppendLog(nextRoom, '山札切れ：全員公開');
        return nextRoom;
      }

      // Advance to next alive player
      var order = Array.isArray(round.order) ? round.order : llListPlayerIdsByJoin(nextRoom);
      var next = llFindNextAlive(round, order, parseIntSafe(round.currentIndex, 0));
      if (!next.id) return nextRoom;
      round.order = order;
      round.currentIndex = next.index;
      round.currentPlayerId = next.id;
      // Protection ends at start of your next turn.
      round.protected[next.id] = false;
      // Draw for next actor
      var nextHand = Array.isArray(round.hands[next.id]) ? round.hands[next.id].slice() : [];
      if (nextHand.length < 2) {
        var drawn2 = llDrawFromRound(round);
        if (drawn2) {
          var before = nextHand.length ? String(nextHand[0]) : '';
          nextHand.push(String(drawn2));

          // Minister overload: resolve on acknowledgement (megane revives, normal princess does not).
          var total = (llCardRank(before) || 0) + (llCardRank(drawn2) || 0);
          if ((before === '7' || String(drawn2) === '7') && total >= 12) {
            var overPid = String(next.id || '');
            var other = before === '7' ? String(drawn2 || '') : String(before || '');
            hands[overPid] = ['7', other].filter(Boolean);
            round.hands = hands;

            try {
              var otherDef = llCardDef(String(other || ''));
              var otherLabel = String((otherDef && otherDef.name) || '-') + '(' + String((otherDef && otherDef.rank) || llCardRankStr(String(other || '')) || '-') + ')';
              round.lastPlay = {
                by: overPid,
                to: '',
                card: String(other || ''),
                at: serverNowMs(),
                text: pname(overPid) + ' が大臣(7)を持っていて ' + otherLabel + ' を引いたため脱落した。'
              };
            } catch (eLPmo) {
              // ignore
            }

            round.reveal = { type: 'minister_overload', by: overPid, had: '7', drew: String(other || '') };
            round.waitFor = { type: 'minister_overload_ack', by: overPid, pending: { type: 'minister_overload', pid: overPid, other: String(other || '') } };
            nextRoom.round = round;
            return nextRoom;
          }
        }
      }
      round.hands[next.id] = nextHand;

      nextRoom.round = round;
      return nextRoom;
    });
  }

  function ackLoveLetter(roomId, playerId) {
    var base = loveletterRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'playing') return room;
      var round = room.round || null;
      if (!round || round.state !== 'playing') return room;
      var wf = round.waitFor || null;
      if (!wf || !wf.type) return room;
      if (String(wf.by || '') !== String(playerId || '')) return room;
      var wfType = String(wf.type || '');

      // Clear waiting state
      round.waitFor = null;
      round.reveal = null;
      round.peek = null;

      var nextRoom = assign({}, room);
      nextRoom.round = round;

      // Minister overload acknowledgement: apply elimination now.
      if (wfType === 'minister_overload_ack') {
        // Clear modal gating by default; we may set a new waitFor later.
        round.waitFor = null;
        round.reveal = null;

        var ps0 = room.players || {};
        function pname0(pid) {
          try {
            return pid && ps0[pid] ? formatPlayerDisplayName(ps0[pid]) : String(pid || '-');
          } catch (e) {
            return String(pid || '-');
          }
        }

        var overPid0 = String((wf.pending && wf.pending.pid) || wf.by || '');
        var other0 = String((wf.pending && wf.pending.other) || '');
        if (!other0) {
          try {
            var hh0 = round.hands && Array.isArray(round.hands[overPid0]) ? round.hands[overPid0] : [];
            for (var hi0 = 0; hi0 < hh0.length; hi0++) {
              var c0 = String(hh0[hi0] || '');
              if (c0 && c0 !== '7') {
                other0 = c0;
                break;
              }
            }
          } catch (eH0) {
            other0 = '';
          }
        }

        var order0 = Array.isArray(round.order) ? round.order : llListPlayerIdsByJoin(nextRoom);
        var idx0 = parseIntSafe(round.currentIndex, 0);
        if (overPid0) {
          var iFind = order0.indexOf(overPid0);
          if (iFind >= 0) idx0 = iFind;
        }

        var hands0 = assign({}, round.hands || {});
        var discards0 = assign({}, round.discards || {});
        var eliminated0 = assign({}, round.eliminated || {});
        var protected0 = assign({}, round.protected || {});
        var grave0 = Array.isArray(round.grave) ? round.grave.slice() : [];

        function pushDiscard0(pid, cardRank) {
          var d = Array.isArray(discards0[pid]) ? discards0[pid].slice() : [];
          if (cardRank) d.push(String(cardRank));
          discards0[pid] = d;
          if (cardRank) grave0.push(String(cardRank));
        }

        function drawOne0() {
          var d = llDrawFromRound(round);
          if (d) return String(d);
          var burnCard = grave0 && Array.isArray(grave0) && grave0.length ? String(grave0[0] || '') : '';
          if (burnCard) {
            grave0.shift();
            return burnCard;
          }
          return '';
        }

        // Apply elimination: discard order must be 7 -> other.
        eliminated0[overPid0] = true;
        protected0[overPid0] = false;
        pushDiscard0(overPid0, '7');
        if (other0) pushDiscard0(overPid0, other0);
        hands0[overPid0] = [];

        var revived = false;
        var revivedDraw = '';
        var revivedFrom = '';
        if (other0 === '8:megane') {
          revivedDraw = drawOne0();
          if (revivedDraw) {
            hands0[overPid0] = [revivedDraw];
          }
          eliminated0[overPid0] = false;
          protected0[overPid0] = false;
          revived = true;
          revivedFrom = Array.isArray(round.deck) && round.deck.length ? '山札' : '伏せ札';
        }

        try {
          var otherDef = llCardDef(String(other0 || ''));
          var otherLabel = String((otherDef && otherDef.name) || '-') + '(' + String((otherDef && otherDef.rank) || llCardRankStr(String(other0 || '')) || '-') + ')';
          var extra = '';
          if (revived) {
            var drewDef = llCardDef(String(revivedDraw || ''));
            var drewLabel = revivedDraw
              ? String((drewDef && drewDef.name) || '-') + '(' + String((drewDef && drewDef.rank) || llCardRankStr(String(revivedDraw || '')) || '-') + ')'
              : '（引けるカードがありません）';
            extra = '（姫(眼鏡)：' + revivedFrom + 'から' + drewLabel + 'を引いて復活）';
          }
          round.lastPlay = {
            by: String(overPid0 || ''),
            to: '',
            card: String(other0 || ''),
            at: serverNowMs(),
            text:
              pname0(overPid0) +
              ' が大臣(7)を持っていて ' +
              otherLabel +
              ' を引いたため脱落した。まず大臣(7)を捨て、そのあと ' +
              otherLabel +
              ' を捨てた。' +
              extra +
              '次ターンへ進む。'
          };
        } catch (eLPmo3) {
          // ignore
        }

        // Write back.
        round.hands = hands0;
        round.discards = discards0;
        round.eliminated = eliminated0;
        round.protected = protected0;
        round.grave = grave0;

        // End checks.
        nextRoom.round = round;
        var alive0 = llAliveIds(nextRoom, round);
        var deckLeft0 = Array.isArray(round.deck) ? round.deck.length : 0;
        if (alive0.length <= 1) {
          var winners0 = llRoundWinners(nextRoom, round);
          round.winners = winners0;
          round.endedAt = serverNowMs();
          round.state = 'ended';
          nextRoom.phase = 'finished';
          nextRoom.result = { winners: winners0, finishedAt: serverNowMs() };
          nextRoom.round = round;
          nextRoom.log = llAppendLog(nextRoom, 'ゲーム終了');
          return nextRoom;
        }
        if (deckLeft0 === 0) {
          var hostId0 = llFindHostId(nextRoom) || String(round.currentPlayerId || '') || String(playerId || '');
          round.reveal = { type: 'showdown', hostId: hostId0, hands: assign({}, round.hands || {}) };
          round.waitFor = { type: 'showdown_ack', by: hostId0 };
          nextRoom.round = round;
          nextRoom.log = llAppendLog(nextRoom, '山札切れ：全員公開');
          return nextRoom;
        }

        // Advance turn to next alive player.
        round.order = order0;
        round.currentIndex = idx0;
        round.currentPlayerId = String(order0[idx0] || '');
        var nxt0 = llFindNextAlive(round, order0, idx0);
        if (nxt0 && nxt0.id) {
          round.currentIndex = nxt0.index;
          round.currentPlayerId = nxt0.id;
          round.protected[nxt0.id] = false;

          // Draw for next actor
          var nh = Array.isArray(round.hands[nxt0.id]) ? round.hands[nxt0.id].slice() : [];
          if (nh.length < 2) {
            var d1 = llDrawFromRound(round);
            if (!d1) {
              var burn1 = round.grave && Array.isArray(round.grave) && round.grave.length ? String(round.grave[0] || '') : '';
              if (burn1) {
                round.grave.shift();
                d1 = burn1;
              }
            }
            if (d1) nh.push(String(d1));
          }

          // Minister overload can happen again on this draw.
          if (nh.length >= 2) {
            var x0 = String(nh[0] || '');
            var y0 = String(nh[1] || '');
            var tot0 = (llCardRank(x0) || 0) + (llCardRank(y0) || 0);
            if ((x0 === '7' || y0 === '7') && tot0 >= 12) {
              var otherN = x0 === '7' ? y0 : x0;
              round.hands[nxt0.id] = ['7', otherN].filter(Boolean);
              round.reveal = { type: 'minister_overload', by: nxt0.id, had: '7', drew: String(otherN || '') };
              round.waitFor = { type: 'minister_overload_ack', by: nxt0.id, pending: { type: 'minister_overload', pid: nxt0.id, other: String(otherN || '') } };
              nextRoom.round = round;
              return nextRoom;
            }
          }

          round.hands[nxt0.id] = nh;
        }

        nextRoom.round = round;
        return nextRoom;
      }

      // Determine end of round after any elimination that already happened.
      var alive = llAliveIds(nextRoom, round);
      var deckLeft = Array.isArray(round.deck) ? round.deck.length : 0;
      if (alive.length <= 1) {
        var winners = llRoundWinners(nextRoom, round);
        round.winners = winners;
        round.endedAt = serverNowMs();
        round.state = 'ended';

        nextRoom.phase = 'finished';
        nextRoom.result = { winners: winners, finishedAt: serverNowMs() };
        nextRoom.round = round;
        nextRoom.log = llAppendLog(nextRoom, 'ゲーム終了');
        return nextRoom;
      }

      if (deckLeft === 0) {
        if (wfType === 'showdown_ack') {
          var winners2 = llRoundWinners(nextRoom, round);
          round.winners = winners2;
          round.endedAt = serverNowMs();
          round.state = 'ended';

          nextRoom.phase = 'finished';
          nextRoom.result = { winners: winners2, finishedAt: serverNowMs() };
          nextRoom.round = round;
          nextRoom.log = llAppendLog(nextRoom, 'ゲーム終了');
          return nextRoom;
        }
        var hostId = llFindHostId(nextRoom) || String(round.currentPlayerId || '') || String(playerId || '');
        round.reveal = { type: 'showdown', hostId: hostId, hands: assign({}, round.hands || {}) };
        round.waitFor = { type: 'showdown_ack', by: hostId };
        nextRoom.round = round;
        nextRoom.log = llAppendLog(nextRoom, '山札切れ：全員公開');
        return nextRoom;
      }

      // Advance to next alive player
      var order = Array.isArray(round.order) ? round.order : llListPlayerIdsByJoin(nextRoom);
      var next = llFindNextAlive(round, order, parseIntSafe(round.currentIndex, 0));
      if (!next.id) return nextRoom;
      round.order = order;
      round.currentIndex = next.index;
      round.currentPlayerId = next.id;
      if (!round.protected) round.protected = {};
      round.protected[next.id] = false;

      // Draw for next actor
      var hands = assign({}, round.hands || {});
      var discards = assign({}, round.discards || {});
      var eliminated = assign({}, round.eliminated || {});
      var protectedMap = assign({}, round.protected || {});
      var grave = Array.isArray(round.grave) ? round.grave.slice() : [];

      function pushDiscard(pid, cardRank) {
        var d = Array.isArray(discards[pid]) ? discards[pid].slice() : [];
        if (cardRank) d.push(String(cardRank));
        discards[pid] = d;
        if (cardRank) grave.push(String(cardRank));
      }

      var nextHand = Array.isArray(hands[next.id]) ? hands[next.id].slice() : [];
      if (nextHand.length < 2) {
        var drawn2 = llDrawFromRound(round);
        if (drawn2) {
          var before = nextHand.length ? String(nextHand[0]) : '';
          nextHand.push(String(drawn2));

          var total = (llCardRank(before) || 0) + (llCardRank(drawn2) || 0);
          if ((before === '7' || String(drawn2) === '7') && total >= 12) {
            var overPid = String(next.id || '');
            var other = before === '7' ? String(drawn2 || '') : String(before || '');
            // Discard in order: 7 then other.
            pushDiscard(overPid, '7');
            if (other) pushDiscard(overPid, other);
            hands[overPid] = [];

            var repl = '';
            var replFrom = '';
            var dmo = llDrawFromRound(round);
            if (dmo) {
              repl = String(dmo);
              replFrom = '山札';
            } else {
              var burnCard = grave && Array.isArray(grave) && grave.length ? String(grave[0] || '') : '';
              if (burnCard) {
                grave.shift();
                repl = burnCard;
                replFrom = '伏せ札';
              }
            }
            if (repl) hands[overPid] = [repl];

            try {
              var otherDef = llCardDef(String(other || ''));
              var otherLabel = String((otherDef && otherDef.name) || '-') + '(' + String((otherDef && otherDef.rank) || llCardRankStr(String(other || '')) || '-') + ')';
              round.lastPlay = {
                by: overPid,
                to: '',
                card: String(other || ''),
                at: serverNowMs(),
                text:
                  (function () {
                    try {
                      var ps2 = room && room.players ? room.players : {};
                      var nm2 = overPid && ps2[overPid] ? formatPlayerDisplayName(ps2[overPid]) : String(overPid || '-');
                      return (
                        nm2 +
                        ' は大臣(7)を持っていて ' +
                        otherLabel +
                        ' を引いたため、まず大臣(7)を捨て、そのあと ' +
                        otherLabel +
                        ' を捨てた。' +
                        (replFrom ? replFrom + 'からカードを1枚引いて次ターンへ進む。' : '次ターンへ進む。')
                      );
                    } catch (e) {
                      return String(overPid || '-') + ' は大臣(7)を持っていて ' + otherLabel + ' を引いたため、2枚捨てて次ターンへ進む。';
                    }
                  })()
              };
            } catch (eLPmo2) {
              // ignore
            }

            round.hands = hands;
            round.discards = discards;
            round.eliminated = eliminated;
            round.protected = protectedMap;
            round.grave = grave;
            round.reveal = null;
            round.waitFor = null;

            // Pass turn to the next alive player.
            var order2 = Array.isArray(round.order) ? round.order : llListPlayerIdsByJoin(nextRoom);
            var next2 = llFindNextAlive(round, order2, parseIntSafe(round.currentIndex, 0));
            if (next2 && next2.id) {
              round.order = order2;
              round.currentIndex = next2.index;
              round.currentPlayerId = next2.id;
              round.protected[next2.id] = false;
              var nh2 = Array.isArray(round.hands[next2.id]) ? round.hands[next2.id].slice() : [];
              if (nh2.length < 2) {
                var d2 = llDrawFromRound(round);
                if (!d2) {
                  var burn2 = grave && Array.isArray(grave) && grave.length ? String(grave[0] || '') : '';
                  if (burn2) {
                    grave.shift();
                    d2 = burn2;
                  }
                }
                if (d2) nh2.push(String(d2));
              }
              round.hands[next2.id] = nh2;
            }

            nextRoom.round = round;
            nextRoom.log = llAppendLog(nextRoom, '大臣オーバーロード：2枚捨て→引き直し→次ターン');
            return nextRoom;
          }
        }
      }
      hands[next.id] = nextHand;
      round.hands = hands;
      round.discards = discards;
      round.eliminated = eliminated;
      round.protected = protectedMap;

      round.grave = grave;

      nextRoom.round = round;
      return nextRoom;
    });
  }

  function resetLoveLetterToLobby(roomId, playerId) {
    var base = loveletterRoomPath(roomId);
    return runTxn(base, function (room) {
      if (!room) return room;
      var ps = room.players || {};
      var me = ps && ps[playerId] ? ps[playerId] : null;
      if (!me || !me.isHost) return room;

      var nextRoom = assign({}, room);
      nextRoom.phase = 'lobby';
      nextRoom.result = null;
      nextRoom.round = null;
      nextRoom.log = llAppendLog(nextRoom, 'ロビーに戻しました');
      return nextRoom;
    });
  }

  // -------------------- UI --------------------
  var HEADER_LOBBY_ID = '';

  // -------------------- shared in-app confirm --------------------
  // ネイティブconfirm()はiOSのstandalone PWAで無反応になるため、アプリ内ダイアログで代替する。
  // （おえかきバトルの okShowConfirm と同じ見た目。CSSは .ok-confirm を共用）
  function bbgShowConfirm(message, yesLabel, onYes) {
    try {
      var old = document.getElementById('bbgConfirmOverlay');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (e0) {
      // ignore
    }
    var ov = document.createElement('div');
    ov.className = 'ok-confirm';
    ov.id = 'bbgConfirmOverlay';
    ov.innerHTML =
      '<div class="ok-confirm-box">' +
      '<div class="ok-confirm-msg">' +
      escapeHtml(String(message || '')).replace(/\n/g, '<br />') +
      '</div>' +
      '<div class="ok-confirm-btns">' +
      '<button type="button" class="ghost" id="bbgConfirmNo">やめる</button>' +
      '<button type="button" class="primary" id="bbgConfirmYes">' +
      escapeHtml(String(yesLabel || 'はい')) +
      '</button>' +
      '</div></div>';
    document.body.appendChild(ov);

    function close() {
      try {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
      } catch (e1) {
        // ignore
      }
    }
    var noBtn = ov.querySelector('#bbgConfirmNo');
    var yesBtn = ov.querySelector('#bbgConfirmYes');
    if (noBtn) noBtn.addEventListener('click', close);
    if (yesBtn)
      yesBtn.addEventListener('click', function () {
        close();
        try {
          if (onYes) onYes();
        } catch (e2) {
          // ignore
        }
      });
    ov.addEventListener('click', function (e) {
      if (e.target === ov) close();
    });
  }

  // click系ハンドラ先頭の `if (!confirm(...)) return;` を置き換えるためのゲート。
  // 未確認ならダイアログを出してfalseを返し、「はい」で同じ要素をもう一度clickして続行させる。
  function bbgConfirmClick(el, message, yesLabel) {
    if (el && el.__bbg_confirmed) {
      el.__bbg_confirmed = false;
      return true;
    }
    bbgShowConfirm(message, yesLabel, function () {
      if (!el) return;
      el.__bbg_confirmed = true;
      try {
        el.click();
      } catch (e) {
        el.__bbg_confirmed = false;
      }
    });
    return false;
  }

  function setHeaderLobbyId(lobbyId) {
    HEADER_LOBBY_ID = String(lobbyId || '').trim();
  }

  var __headerLobbyBackBound = false;
  var __gmHeaderBound = false;
  var __gmHeaderInFlight = false;
  function updateHeaderLobbyBackButton(screen, lobbyId) {
    var btn = null;
    try {
      btn = document.getElementById('headerLobbyBack');
    } catch (e0) {
      btn = null;
    }
    // This app now uses a clickable header title for GM participants.
    try {
      if (btn) {
        btn.style.display = 'none';
        btn.disabled = true;
      }
    } catch (eBtn) {
      // ignore
    }

    var q = null;
    try {
      q = parseQuery();
    } catch (eQ0) {
      q = null;
    }
    var isHost = !!(q && String(q.host || '') === '1');
    var isGmDev = !!(q && String(q.gmdev || '') === '1');
    var hasRoom = !!(q && q.room && String(q.room || '').trim());

    var scr = String(screen || '');
    var isLobbyScreen = scr === 'lobby_host' || scr === 'lobby_assign' || scr === 'lobby_login' || scr === 'lobby_create';

    var headerEl = null;
    var titleEl = null;
    try {
      headerEl = document.querySelector('header.header');
      titleEl = headerEl ? headerEl.querySelector('h1') : null;
    } catch (eH0) {
      headerEl = null;
      titleEl = null;
    }
    if (!headerEl || !titleEl) return;

    var isLobbyAny = scr === 'lobby_host' || scr === 'lobby_assign' || scr === 'lobby_login' || scr === 'lobby_create' || scr === 'lobby_player' || scr === 'lobby_join';
    // Treat any screen with `room` as an in-game screen (player/join/table/host sub-screens).
    var isGameScreen = !!(!isLobbyAny && hasRoom);

    // Show clickable header for:
    // - GM participant device (host=1)
    // - GM table device (gmdev=1)
    // (only when tied to a lobby + in an in-game screen)
    var canUseGmLobbyReturn = !!(lobbyId && isGameScreen && (isHost || isGmDev));

    // Toggle a class for CSS targeting.
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.toggle('gm-participant', canUseGmLobbyReturn);
      }
    } catch (eCls) {
      // ignore
    }

    // Header visibility policy:
    // - GM参加者のプレイヤー画面: show clickable header only
    // - その他の参加者プレイヤー画面: hide header
    // - ロビー画面: hide header
    if (canUseGmLobbyReturn) {
      try {
        headerEl.style.display = '';
      } catch (eS1) {
        // ignore
      }
      try {
        titleEl.textContent = 'B_BoardGames(ロビーへ)';
        titleEl.classList.add('gm-lobby-return');
      } catch (eT1) {
        // ignore
      }

      if (__gmHeaderBound) return;
      __gmHeaderBound = true;
      titleEl.addEventListener('click', function () {
        if (__gmHeaderInFlight) return;
        var q2 = null;
        try {
          q2 = parseQuery();
        } catch (eQ1) {
          q2 = null;
        }
        var lobby = q2 && q2.lobby ? String(q2.lobby) : '';
        if (!lobby) return;

        var isHost2 = !!(q2 && String(q2.host || '') === '1');
        var isGmDev2 = !!(q2 && String(q2.gmdev || '') === '1');
        var scr2 = q2 && q2.screen ? String(q2.screen) : '';
        var room2 = q2 && q2.room ? String(q2.room) : '';
        var hasRoom2 = !!(q2 && q2.room && String(q2.room || '').trim());
        var isLobbyAny2 =
          scr2 === 'lobby_host' ||
          scr2 === 'lobby_assign' ||
          scr2 === 'lobby_login' ||
          scr2 === 'lobby_create' ||
          scr2 === 'lobby_player' ||
          scr2 === 'lobby_join';
        var isGameScreen2 = !!(!isLobbyAny2 && hasRoom2);
        if (!(lobby && isGameScreen2 && (isHost2 || isGmDev2))) return;

        if (!bbgConfirmClick(titleEl, 'ロビーへ戻ります。\n進行中のゲームは中断され、全員に反映されます。', 'ロビーへ')) return;

        __gmHeaderInFlight = true;
        firebaseReady()
          .then(function () {
            // LoveLetter: preserve extra-cards setting back to lobby.
            if (scr2 === 'loveletter_player' && room2) {
              return getValueOnce(loveletterRoomPath(room2))
                .then(function (roomObj) {
                  var extras = [];
                  try {
                    extras = llNormalizeExtraCards(roomObj && roomObj.settings ? roomObj.settings.extraCards : []);
                  } catch (eE0) {
                    extras = [];
                  }
                  return setLobbyLoveLetterExtraCards(lobby, extras);
                })
                .catch(function () {
                  return null;
                });
            }
            return null;
          })
          .then(function () {
            return setLobbyCurrentGame(lobby, null);
          })
          .then(function () {
            var qx = {};
            var v = getCacheBusterParam();
            if (v) qx.v = v;
            qx.lobby = lobby;
            qx.screen = isHost2 || isGmDev2 ? 'lobby_host' : 'lobby_player';
            try {
              if (q2 && String(q2.gmdev || '') === '1') qx.gmdev = '1';
            } catch (eG) {
              // ignore
            }
            // Hard reload to ensure old subscriptions do not keep rendering.
            hardNavigate(qx);
          })
          .catch(function (e) {
            alert((e && e.message) || '失敗');
          })
          .finally(function () {
            __gmHeaderInFlight = false;
          });
      });
      return;
    }

    // Hide header on lobby and non-GM player screens.
    if (isLobbyAny || isGameScreen) {
      try {
        headerEl.style.display = 'none';
      } catch (eS2) {
        // ignore
      }
      try {
        titleEl.textContent = 'B_BoardGames';
        titleEl.classList.remove('gm-lobby-return');
      } catch (eT2) {
        // ignore
      }
      return;
    }

    // Default screens: show normal header.
    try {
      headerEl.style.display = '';
    } catch (eS3) {
      // ignore
    }
    try {
      titleEl.textContent = 'B_BoardGames';
      titleEl.classList.remove('gm-lobby-return');
    } catch (eT3) {
      // ignore
    }
  }

  function headerHtml() {
    // Save vertical space: no persistent header.
    return '';
  }

  function render(viewEl, html) {
    var h = headerHtml();
    if (h) {
      viewEl.innerHTML = '<div class="stack">' + h + html + '</div>';
      return;
    }
    viewEl.innerHTML = html;
  }

  function renderError(viewEl, message) {
    var msg = escapeHtml(message);
    var showSetupLink =
      String(message || '').indexOf('Firebase設定がありません') >= 0 ||
      String(message || '').indexOf('?screen=setup') >= 0 ||
      String(message || '').indexOf('databaseURL') >= 0;

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="badge">エラー</div>\n      <div class="big">' +
        msg +
        '</div>\n      <div class="muted">設定やURLを確認してください。</div>' +
        (showSetupLink
          ? '\n      <a class="btn primary" href="?screen=setup">Firebaseセットアップを開く</a>'
          : '') +
        '\n    </div>\n  '
    );
  }

  function setInlineError(id, message) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.textContent = String(message || '');
    return true;
  }

  function clearInlineError(id) {
    setInlineError(id, '');
  }

  function renderHome(viewEl) {
    var ver = '';
    try {
      var q0 = parseQuery();
      if (q0 && q0.v != null && String(q0.v)) ver = String(q0.v);
    } catch (e0) {
      ver = '';
    }
    if (!ver) {
      try {
        ver = String(getBundledAssetVersion() || '');
      } catch (e1) {
        ver = '';
      }
    }
    var verHtml = ver ? '<div class="bbg-hero-ver">Version: ' + escapeHtml(ver) + '</div>' : '';

    render(
      viewEl,
      '\n    <div class="stack">\n' +
        '      <div class="bbg-hero">\n' +
        '        <div class="bbg-hero-logo">🎲</div>\n' +
        '        <div class="bbg-hero-title">B_BoardGames</div>\n' +
        '        <div class="bbg-hero-sub">あつまって みんなで あそぶ ボードゲーム</div>\n' +
        '        ' + (verHtml || '') + '\n' +
        '      </div>\n' +
        '      <div id="homeLobbies" class="stack"></div>\n' +
        '      <div class="bbg-sec">あたらしく はじめる</div>\n' +
        '      <button id="homeCreateJoin" class="bbg-menu-btn">\n' +
        '        <span class="bbg-menu-icon">🎮</span>\n' +
        '        <span style="min-width:0"><span class="bbg-menu-label">ロビーを作る</span><span class="bbg-menu-desc">この端末もゲームに参加します</span></span>\n' +
        '      </button>\n' +
        '      <button id="homeCreateGm" class="bbg-menu-btn">\n' +
        '        <span class="bbg-menu-icon">📺</span>\n' +
        '        <span style="min-width:0"><span class="bbg-menu-label">ロビーを作る（テーブル端末）</span><span class="bbg-menu-desc">盤面表示専用。参加者としては入りません</span></span>\n' +
        '      </button>\n' +
        '      <div class="bbg-sec">はなれた ひとと あそぶ</div>\n' +
        '      <button id="homeOekakiRelay" class="bbg-menu-btn">\n' +
        '        <span class="bbg-menu-icon">🎨</span>\n' +
        '        <span style="min-width:0"><span class="bbg-menu-label">おえかきバトル（リレー）</span><span class="bbg-menu-desc">2人用。LINEなどでURLを渡し合って戦う投稿型</span></span>\n' +
        '      </button>\n' +
        '      <div class="center" style="margin-top:4px">\n' +
        '        <a class="btn ghost" href="?screen=setup" style="font-size:13px">⚙️ せってい</a>\n' +
        '      </div>\n' +
        '    </div>\n  '
    );
  }

  // -------------------- home: joinable lobby list --------------------
  // 同じURLを開いた人が、QRなしでも進行中のロビーに参加できるようにする。
  // データは lobbies/_index/<id>（updateLobbyIndexが保守する軽量インデックス）から読む。
  var LOBBY_JOINABLE_WINDOW_MS = 12 * 60 * 60 * 1000; // 直近12時間のロビーを表示

  function listJoinableLobbies(indexAll) {
    var out = [];
    if (!indexAll || typeof indexAll !== 'object') return out;
    var now = serverNowMs();
    for (var id in indexAll) {
      if (!hasOwn.call(indexAll, id)) continue;
      var e = indexAll[id];
      if (!e || typeof e !== 'object') continue;
      if (!parseIntSafe(e.count, 0)) continue;
      var last = Math.max(parseIntSafe(e.updatedAt, 0), parseIntSafe(e.createdAt, 0));
      if (!last || now - last > LOBBY_JOINABLE_WINDOW_MS) continue;
      out.push({ id: String(id), entry: e, lastActiveAt: last });
    }
    out.sort(function (a, b) {
      return b.lastActiveAt - a.lastActiveAt;
    });
    if (out.length > 8) out = out.slice(0, 8);
    return out;
  }

  function lobbyMemberNamesText(lobby, maxNames) {
    var members = (lobby && lobby.members) || {};
    var order = (lobby && lobby.order) || [];
    if (!Array.isArray(order)) order = [];
    var names = [];
    var seen = {};
    for (var i = 0; i < order.length; i++) {
      var mid = String(order[i] || '');
      if (!mid || seen[mid] || !members[mid]) continue;
      seen[mid] = true;
      var nm = String((members[mid] && members[mid].name) || '').trim();
      if (nm) names.push(nm);
    }
    var keys = Object.keys(members);
    keys.sort();
    for (var j = 0; j < keys.length; j++) {
      var k2 = String(keys[j] || '');
      if (!k2 || seen[k2]) continue;
      seen[k2] = true;
      var nm2 = String((members[k2] && members[k2].name) || '').trim();
      if (nm2) names.push(nm2);
    }
    var max = maxNames || 6;
    if (names.length > max) {
      var rest = names.length - max;
      names = names.slice(0, max);
      return names.join('、') + '　ほか' + rest + '人';
    }
    return names.join('、');
  }

  function renderHomeLobbiesList(all) {
    var box = document.getElementById('homeLobbies');
    if (!box) return;
    var items = listJoinableLobbies(all);
    if (!items.length) {
      box.innerHTML = '';
      return;
    }

    var html = '<div class="bbg-sec">いま ひらいているロビー</div>';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var entry = it.entry || {};
      var kind = entry.kind ? String(entry.kind) : '';

      var myMid = '';
      try {
        myMid = String(localStorage.getItem('bbg_lobby_member_' + it.id) || '');
      } catch (eL) {
        myMid = '';
      }
      var mids = String(entry.mids || '').split(',');
      var isMember = !!(myMid && mids.indexOf(myMid) >= 0);
      var isMyHost = !!(myMid && String(entry.hostMid || '') === myMid);

      var statusHtml = kind
        ? '<span class="bbg-status bbg-status--live"><span class="bbg-dot"></span>' +
          gameKindEmoji(kind) +
          ' ' +
          escapeHtml(gameKindLabel(kind)) +
          ' あそび中</span>'
        : '<span class="bbg-status bbg-status--wait"><span class="bbg-dot"></span>まちあい中</span>';

      var btnHtml = '';
      if (isMyHost) {
        btnHtml = '<button class="primary bbgLobbyEnter" data-lobby="' + escapeHtml(it.id) + '" data-mode="host">ホストでひらく</button>';
      } else if (isMember) {
        btnHtml = '<button class="primary bbgLobbyEnter" data-lobby="' + escapeHtml(it.id) + '" data-mode="rejoin">もどる</button>';
      } else {
        btnHtml = '<button class="primary bbgLobbyEnter" data-lobby="' + escapeHtml(it.id) + '" data-mode="join">さんかする</button>';
      }

      var namesText = String(entry.names || '');

      html +=
        '<div class="bbg-lobby-item" style="animation-delay:' +
        Math.min(i * 60, 300) +
        'ms">' +
        '<div class="bbg-lobby-top">' +
        '<span class="bbg-lobby-id">ロビー ' +
        escapeHtml(it.id) +
        '</span>' +
        statusHtml +
        '</div>' +
        (namesText ? '<div class="bbg-lobby-members">👥 ' + escapeHtml(namesText) + '</div>' : '') +
        '<div class="row">' +
        btnHtml +
        '</div>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  function pad4(n) {
    var s = String(Math.floor(Math.abs(n || 0)));
    while (s.length < 4) s = '0' + s;
    if (s.length > 4) s = s.slice(-4);
    return s;
  }

  function makeLobbyId4() {
    return pad4(randomInt(10000));
  }

  function createLobbyWithRetry(hostName, isGmDevice, joinAsMember) {
    var shouldJoin = joinAsMember == null ? true : !!joinAsMember;
    var nm = String(hostName || '').trim();
    if (!nm) nm = 'GM';

    function attempt(triesLeft) {
      if (triesLeft <= 0) return Promise.reject(new Error('ロビー作成に失敗しました（再試行回数超過）'));
      var lobbyId = makeLobbyId4();
      var nonce = randomId(8);
      var mid = getOrCreateLobbyMemberId(lobbyId);
      return createLobby(lobbyId, nm, !!isGmDevice, nonce, shouldJoin).then(function (lobby) {
        // Collision check: if an existing lobby was returned, nonce won't match.
        if (lobby && String(lobby.nonce || '') === String(nonce) && String(lobby.hostMid || '') === String(mid)) {
          return { lobbyId: lobbyId };
        }
        return attempt(triesLeft - 1);
      });
    }

    return attempt(30);
  }

  function makeLobbyJoinUrl(lobbyId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.lobby = lobbyId;
    q.screen = 'lobby_join';
    return baseUrl() + '?' + buildQuery(q);
  }

  function renderLobbyLogin(viewEl, opts) {
    var lobbyId = opts.lobbyId;
    var persistedName = loadPersistedName();
    var lobby = opts.lobby;
    var joinUrl = opts.joinUrl || '';

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">QR表示</div>\n      <div class="kv"><span class="muted">ロビーID</span><b>' +
        escapeHtml(lobbyId) +
        '</b></div>\n\n      <div class="muted">参加者はこのQRを読み取って名前登録します。</div>\n\n      <div class="center" id="qrWrap">\n        <canvas id="qr"></canvas>\n      </div>\n      <div class="muted center" id="qrError"></div>\n\n      <div class="field">\n        <label>GM参加者の名前（この端末）</label>\n        <input id="lobbyGmName" placeholder="例: GM" value="' +
        escapeHtml(persistedName || '') +
        '" />\n      </div>\n\n      <div class="row">\n        <button id="lobbyRegisterGm" class="ghost">この端末の名前を登録</button>\n      </div>\n      <div class="muted">※ 登録すると参加者一覧に反映されます。</div>\n\n      <div class="field">\n        <label>参加URL（スマホ以外はこちら）</label>\n        <div class="code" id="joinUrlText">' +
        escapeHtml(joinUrl || '') +
        '</div>\n        <div class="row">\n          <button id="copyJoinUrl" class="ghost">コピー</button>\n        </div>\n        <div class="muted" id="copyStatus"></div>\n      </div>\n\n      <hr />\n\n      <div class="stack">\n        <div class="muted">参加者</div>\n        ' +
        lobbyMembersSummaryHtml(lobby) +
        '\n      </div>\n\n      <hr />\n\n      <div class="row">\n        <button id="lobbyGoLobbyLogin" class="primary">ロビーログイン</button>\n      </div>\n      <div class="muted">※ 参加者がそろったら押してください（以降QRは不要）</div>\n\n      <div id="lobbyLoginError" class="form-error" role="alert"></div>\n    </div>\n  '
    );
  }

  function renderLobbyCreate(viewEl) {
    var persistedName = loadPersistedName();
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ロビーを作成</div>\n      <div id="lobbyCreateError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>あなたの名前（表示用）</label>\n        <input id="lobbyHostName" placeholder="例: たろう" value="' +
        escapeHtml(persistedName || '') +
        '" />\n      </div>\n\n      <div class="row">\n        <button id="lobbyCreateBtn" class="primary">作成</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function readLobbyCreateForm() {
    var el = document.getElementById('lobbyHostName');
    var name = String((el && el.value) || '').trim();
    if (!name) throw new Error('名前を入力してください。');
    return { name: name };
  }

  function renderLobbyJoin(viewEl, lobbyId) {
    var persistedName = loadPersistedName();
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="bbg-wait-hero" style="padding:6px 0 0">\n        <div class="bbg-wait-emoji">👋</div>\n        <div class="bbg-wait-title">ロビーに参加</div>\n        <div class="muted" style="font-size:13px">名前を入れて「参加する」を押してください</div>\n      </div>\n      <div id="lobbyJoinError" class="form-error" role="alert"></div>\n\n      <div class="card">\n        <div class="stack">\n          <div class="field">\n            <label>ロビーID</label>\n            <input id="lobbyId" placeholder="例: 1234" value="' +
        escapeHtml(lobbyId || '') +
        '" />\n          </div>\n\n          <div class="field">\n            <label>あなたの名前（表示用）</label>\n            <input id="lobbyJoinName" placeholder="例: たろう" value="' +
        escapeHtml(persistedName || '') +
        '" />\n          </div>\n\n          <button id="lobbyJoinBtn" class="primary bbg-start-btn">参加する</button>\n        </div>\n      </div>\n    </div>\n  '
    );
  }

  function readLobbyJoinForm() {
    var idEl = document.getElementById('lobbyId');
    var nameEl = document.getElementById('lobbyJoinName');
    var lobbyId = String((idEl && idEl.value) || '').trim();
    var name = String((nameEl && nameEl.value) || '').trim();
    if (!lobbyId) throw new Error('ロビーIDを入力してください。');
    if (!name) throw new Error('名前を入力してください。');
    return { lobbyId: lobbyId, name: name };
  }

  // ゲーム種別ごとの表示メタ情報（ラベル/絵文字/最少人数）。UI表示専用。
  var GAME_KIND_META = {
    wordwolf: { label: 'ワードウルフ', emoji: '🐺', min: 3 },
    loveletter: { label: 'ラブレター', emoji: '💌', min: 2 },
    codenames: { label: 'コードネーム', emoji: '🕵️', min: 4 },
    hannin: { label: '犯人は踊る', emoji: '🃏', min: 3 },
    oekaki: { label: 'おえかきバトル', emoji: '🎨', min: 1 }
  };

  function gameKindLabel(kind) {
    var m = GAME_KIND_META[String(kind || '')];
    return m ? m.label : String(kind || '');
  }

  function gameKindEmoji(kind) {
    var m = GAME_KIND_META[String(kind || '')];
    return m ? m.emoji : '🎲';
  }

  function lobbyMembersSummaryHtml(lobby) {
    try {
      var members = (lobby && lobby.members) || {};
      var order = (lobby && lobby.order) || [];
      if (!Array.isArray(order)) order = [];
      var out = '';
      for (var i = 0; i < order.length; i++) {
        var mid = String(order[i] || '');
        if (!mid) continue;
        var m = members[mid] || {};
        var nm = String(m.name || '').trim();
        if (!nm) nm = '（無名）';
        out +=
          '<div class="bbg-chip" style="animation-delay:' +
          Math.min(i * 40, 400) +
          'ms"><span class="bbg-chip-num">' +
          (i + 1) +
          '</span><span>' +
          escapeHtml(nm) +
          '</span></div>';
      }
      if (out) return '<div class="bbg-chips">' + out + '</div>';
      var keys = Object.keys(members);
      if (!keys.length) return '<div class="muted">まだ参加者がいません。</div>';
      return '<div class="muted">参加者を読み込み中...</div>';
    } catch (e) {
      return '<div class="muted">参加者を表示できません。</div>';
    }
  }

  function renderLobbyHost(viewEl, opts) {
    var lobbyId = opts.lobbyId;
    var lobby = opts.lobby;
    var joinUrl = opts.joinUrl || '';
    var myName = opts.myName || '';
    var isTableGmDevice = !!opts.isTableGmDevice;
    var currentGame = (lobby && lobby.currentGame) || null;
    var currentLabel = currentGame && currentGame.kind ? String(currentGame.kind) : '';

    var selectedKind = opts.selectedKind ? String(opts.selectedKind) : '';
    if (!selectedKind) selectedKind = 'wordwolf';

    var members = (lobby && lobby.members) || {};
    var order = (lobby && lobby.order) || [];
    if (!Array.isArray(order)) order = [];

    var loveletterSetupHtml = '';
    if (selectedKind === 'loveletter') {
      var listHtml = '';
      for (var i = 0; i < order.length; i++) {
        var mid = String(order[i] || '');
        if (!mid) continue;
        var m = members[mid] || {};
        var nm = String(m.name || '').trim();
        if (!nm) nm = '（無名）';

        listHtml +=
          '<div class="row" style="align-items:center; gap:8px">' +
          '<div class="muted" style="min-width:18px">' +
          (i + 1) +
          '</div>' +
          '<div style="flex:1"><b>' +
          escapeHtml(nm) +
          '</b></div>' +
          '<button class="ghost lobbyOrderUp" data-mid="' +
          escapeHtml(mid) +
          '" ' +
          (i === 0 ? 'disabled' : '') +
          '>↑</button>' +
          '<button class="ghost lobbyOrderDown" data-mid="' +
          escapeHtml(mid) +
          '" ' +
          (i === order.length - 1 ? 'disabled' : '') +
          '>↓</button>' +
          '</div>';
      }
      if (!listHtml) listHtml = '<div class="muted">参加者がいません。</div>';

      loveletterSetupHtml =
        '<hr />' +
        '<div class="stack">' +
        '<div class="bbg-sec">💌 順番決め（ラブレター）</div>' +
        listHtml +
        '<div class="row">' +
        '<button id="lobbyShuffle" class="ghost">シャッフル</button>' +
        '</div>' +
        '</div>';
    }

    var hanninSetupHtml = '';
    if (selectedKind === 'hannin') {
      var listHtmlH = '';
      for (var iH = 0; iH < order.length; iH++) {
        var midH = String(order[iH] || '');
        if (!midH) continue;
        var mH = members[midH] || {};
        var nmH = String(mH.name || '').trim();
        if (!nmH) nmH = '（無名）';

        listHtmlH +=
          '<div class="row" style="align-items:center; gap:8px">' +
          '<div class="muted" style="min-width:18px">' +
          (iH + 1) +
          '</div>' +
          '<div style="flex:1"><b>' +
          escapeHtml(nmH) +
          '</b></div>' +
          '<button class="ghost lobbyOrderUp" data-mid="' +
          escapeHtml(midH) +
          '" ' +
          (iH === 0 ? 'disabled' : '') +
          '>↑</button>' +
          '<button class="ghost lobbyOrderDown" data-mid="' +
          escapeHtml(midH) +
          '" ' +
          (iH === order.length - 1 ? 'disabled' : '') +
          '>↓</button>' +
          '</div>';
      }
      if (!listHtmlH) listHtmlH = '<div class="muted">参加者がいません。</div>';

      hanninSetupHtml =
        '<hr />' +
        '<div class="stack">' +
        '<div class="bbg-sec">🃏 順番決め（犯人は踊る）</div>' +
        listHtmlH +
        '<div class="row">' +
        '<button id="lobbyShuffle" class="ghost">シャッフル</button>' +
        '</div>' +
        '</div>';
    }

    var codenamesSetupHtml = '';
    if (selectedKind === 'codenames') {
      var assign = (lobby && lobby.codenamesAssign) || {};
      var keys = Object.keys(members);
      keys.sort();
      var rows = '';
      for (var k = 0; k < keys.length; k++) {
        var mid2 = String(keys[k] || '');
        if (!mid2) continue;
        var m2 = members[mid2] || {};
        var nm2 = String(m2.name || '').trim();
        if (!nm2) nm2 = '（無名）';
        var a2 = assign && assign[mid2] ? assign[mid2] : {};
        var team = String((a2 && a2.team) || '');
        var role = String((a2 && a2.role) || '');

        rows +=
          '<div class="stack" style="gap:6px">' +
          '<b>' +
          escapeHtml(nm2) +
          '</b>' +
          '<div class="row" style="gap:8px">' +
          '<select class="cnAssignTeam" data-mid="' +
          escapeHtml(mid2) +
          '">' +
          '<option value="" ' +
          (team === '' ? 'selected' : '') +
          '>チーム</option>' +
          '<option value="red" ' +
          (team === 'red' ? 'selected' : '') +
          '>赤</option>' +
          '<option value="blue" ' +
          (team === 'blue' ? 'selected' : '') +
          '>青</option>' +
          '</select>' +
          '<select class="cnAssignRole" data-mid="' +
          escapeHtml(mid2) +
          '">' +
          '<option value="" ' +
          (role === '' ? 'selected' : '') +
          '>役職</option>' +
          '<option value="spymaster" ' +
          (role === 'spymaster' ? 'selected' : '') +
          '>スパイマスター</option>' +
          '<option value="operative" ' +
          (role === 'operative' ? 'selected' : '') +
          '>諜報員</option>' +
          '</select>' +
          '</div>' +
          '</div>';
      }
      if (!rows) rows = '<div class="muted">参加者がいません。</div>';

      codenamesSetupHtml =
        '<hr />' +
        '<div class="stack">' +
        '<div class="bbg-sec">🕵️ 役職決め（コードネーム）</div>' +
        rows +
        '<div class="row">' +
        '<button id="cnAssignShuffle" class="ghost">シャッフル</button>' +
        '</div>' +
        '</div>';
    }

    var oekakiSetupHtml = '';
    if (selectedKind === 'oekaki') {
      var okSet = normalizeOekakiLobbySettings(lobby && lobby.oekakiSettings);
      var okKeyNote = loadGeminiApiKey()
        ? ''
        : '<div class="muted">※ Gemini APIキーが未設定です。AI判定を使うには<a href="?screen=setup">セットアップ</a>で設定してください（未設定でも開始はできます）。</div>';
      var okTimeVals = [30, 60, 90, 120, 180, 300, 420, 600];
      var okTimeOptions = '';
      for (var okTi = 0; okTi < okTimeVals.length; okTi++) {
        var okTv = okTimeVals[okTi];
        okTimeOptions +=
          '<option value="' +
          okTv +
          '"' +
          (okSet.drawSeconds === okTv ? ' selected' : '') +
          '>' +
          escapeHtml(oekakiFormatSeconds(okTv)) +
          '</option>';
      }
      oekakiSetupHtml =
        '<hr />' +
        '<div class="stack">' +
        '<div class="bbg-sec">🎨 せってい（おえかきバトル）</div>' +
        '<div class="field">' +
        '<label>せいげんじかん</label>' +
        '<select id="okDrawSecs">' +
        okTimeOptions +
        '</select>' +
        '</div>' +
        '<div class="field">' +
        '<label>おだい</label>' +
        '<select id="okTopicMode">' +
        '<option value="random" ' +
        (okSet.topicMode === 'random' ? 'selected' : '') +
        '>ランダム</option>' +
        '<option value="custom" ' +
        (okSet.topicMode === 'custom' ? 'selected' : '') +
        '>じゆうきにゅう</option>' +
        '</select>' +
        '</div>' +
        (okSet.topicMode === 'custom'
          ? '<div class="field"><label>おだい（じゆうきにゅう・ぜんいんに ひょうじされます）</label><input id="okCustomTopic" placeholder="れい: しょうぼうしゃ" value="' +
            escapeHtml(okSet.customTopic) +
            '" /></div>'
          : '<div class="field"><label>おだいの たいしょうねんれい</label><select id="okTopicAge">' +
            '<option value="kids" ' +
            (okSet.topicAge === 'kids' ? 'selected' : '') +
            '>こども（〜6さい）</option>' +
            '<option value="school" ' +
            (okSet.topicAge === 'school' ? 'selected' : '') +
            '>しょうがくせい</option>' +
            '<option value="adult" ' +
            (okSet.topicAge === 'adult' ? 'selected' : '') +
            '>おとな</option>' +
            '</select></div>') +
        okKeyNote +
        '</div>';
    }

    var tableGmNoteHtml = '';
    if (isTableGmDevice) {
      tableGmNoteHtml =
        '<div class="card" style="padding:12px">' +
        '<div class="muted">この端末はテーブル用GMデバイスです</div>' +
        '<div class="muted">※ 参加者一覧には入りません。</div>' +
        '</div>';
    }

    var gmNameCardHtml =
      '<div class="card" style="padding:12px">\n        <div class="muted">この端末（GM）の名前</div>\n        <div class="row" style="gap:8px;align-items:center">\n          <input id="lobbyMyName" placeholder="例: GM" value="' +
      escapeHtml(myName || loadPersistedName() || '') +
      '" style="flex:1" />\n          <button id="lobbyUpdateMyName" class="ghost">変更</button>\n        </div>\n        <div class="muted">※ 参加者一覧に反映されます。</div>\n      </div>';

    var memberCount = Object.keys(members).length;

    var currentStatusHtml = currentLabel
      ? '<div><span class="bbg-status bbg-status--live"><span class="bbg-dot"></span>いま ' +
        gameKindEmoji(currentLabel) +
        ' ' +
        escapeHtml(gameKindLabel(currentLabel)) +
        ' をあそび中</span></div>'
      : '';

    var gameKinds = ['wordwolf', 'codenames', 'loveletter', 'hannin', 'oekaki'];
    var gameGridHtml = '';
    for (var gi = 0; gi < gameKinds.length; gi++) {
      var gk = gameKinds[gi];
      var gm = GAME_KIND_META[gk] || {};
      var isSel = selectedKind === gk;
      gameGridHtml +=
        '<button type="button" class="bbg-game-card bbgGameKindBtn" data-kind="' +
        escapeHtml(gk) +
        '" aria-pressed="' +
        (isSel ? 'true' : 'false') +
        '"' +
        (gi === gameKinds.length - 1 ? ' style="grid-column:1/-1"' : '') +
        '>' +
        '<span class="bbg-game-emoji">' +
        (gm.emoji || '🎲') +
        '</span>' +
        '<span class="bbg-game-name">' +
        escapeHtml(gm.label || gk) +
        '</span>' +
        '<span class="bbg-game-min">' +
        String(gm.min || 1) +
        '人〜</span>' +
        '</button>';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="bbg-title-row">\n        <div class="big">ロビー</div>\n        <span class="bbg-code">' +
        escapeHtml(lobbyId) +
        '</span>\n      </div>\n      ' +
        currentStatusHtml +
        '\n\n      <div class="card bbg-qr-card">\n        <div class="muted" style="font-size:12px">QRを読み取るか、同じアプリ・URLをひらいて「さんかする」でも参加できます</div>\n        <div class="center" id="qrWrap" style="min-width:168px">\n          <canvas id="qr" width="160" height="160"></canvas>\n        </div>\n        <div class="muted center" id="qrError"></div>\n        <div class="field" style="margin:0;align-self:stretch;text-align:left">\n          <label>参加URL（スマホ以外はこちら）</label>\n          <div class="code" id="joinUrlText">' +
        escapeHtml(joinUrl || '') +
        '</div>\n          <div class="row">\n            <button id="copyJoinUrl" class="ghost">コピー</button>\n          </div>\n          <div class="muted" id="copyStatus"></div>\n        </div>\n      </div>\n\n      <div class="bbg-sec">参加者<span class="badge">' +
        memberCount +
        '人</span></div>\n      ' +
        lobbyMembersSummaryHtml(lobby) +
        '\n      ' +
        (tableGmNoteHtml || '') +
        (isTableGmDevice ? '' : '\n      ' + gmNameCardHtml) +
        '\n\n      <div class="bbg-sec">ゲームをえらぶ</div>\n      <input type="hidden" id="lobbyGameKind" value="' +
        escapeHtml(selectedKind) +
        '" />\n      <div class="bbg-game-grid">' +
        gameGridHtml +
        '</div>' +
        loveletterSetupHtml +
        hanninSetupHtml +
        codenamesSetupHtml +
        oekakiSetupHtml +
        '\n\n      <div class="row" style="margin-top:4px">\n        <button id="lobbyStartGame" class="primary bbg-start-btn">▶ ゲーム開始（' +
        escapeHtml(gameKindLabel(selectedKind)) +
        '）</button>\n      </div>\n\n      <div id="lobbyHostError" class="form-error" role="alert"></div>\n    </div>\n  '
    );
  }

  function renderLobbyPlayer(viewEl, opts) {
    var lobbyId = opts.lobbyId;
    var lobby = opts.lobby;
    var currentGame = (lobby && lobby.currentGame) || null;
    var label = currentGame && currentGame.kind ? String(currentGame.kind) : '';
    var roomId = currentGame && currentGame.roomId ? String(currentGame.roomId) : '';
    var canGo = !!(label && roomId);

    var waitHeroHtml = canGo
      ? '<div class="bbg-wait-hero">\n          <div class="bbg-wait-emoji">' +
        gameKindEmoji(label) +
        '</div>\n          <div class="bbg-wait-title">' +
        escapeHtml(gameKindLabel(label)) +
        ' がはじまっています！</div>\n          <span class="bbg-status bbg-status--live"><span class="bbg-dot"></span>あそび中</span>\n        </div>'
      : '<div class="bbg-wait-hero">\n          <div class="bbg-wait-emoji">🎲</div>\n          <div class="bbg-wait-title">ホストの スタートを まっています<span class="bbg-wait-dots"><span>.</span><span>.</span><span>.</span></span></div>\n          <div class="muted" style="font-size:13px">ゲームがはじまると じどうで がめんが かわります</div>\n        </div>';

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="bbg-title-row">\n        <div class="big">ロビー</div>\n        <span class="bbg-code">' +
        escapeHtml(lobbyId) +
        '</span>\n      </div>\n\n      ' +
        waitHeroHtml +
        '\n\n      <div class="bbg-sec">参加者</div>\n      ' +
        lobbyMembersSummaryHtml(lobby) +
        '\n\n      <div id="lobbyPlayerError" class="form-error" role="alert"></div>\n\n      <div class="row">' +
        (canGo ? '<button id="lobbyGoGame" class="primary" style="flex:1">▶ ゲームへ</button>' : '') +
        '<a class="btn ghost" href="./">ホーム</a>\n      </div>\n    </div>\n  '
    );
  }

  function renderLobbyAssign(viewEl, opts) {
    var lobbyId = opts.lobbyId;
    var lobby = opts.lobby;
    var canEdit = !!opts.canEdit;

    var members = (lobby && lobby.members) || {};
    var order = (lobby && lobby.order) || [];
    if (!Array.isArray(order)) order = [];

    var listHtml = '';
    for (var i = 0; i < order.length; i++) {
      var mid = String(order[i] || '');
      if (!mid) continue;
      var m = members[mid] || {};
      var nm = String(m.name || '').trim();
      if (!nm) nm = '（無名）';

      var upDisabled = !canEdit || i === 0;
      var downDisabled = !canEdit || i === order.length - 1;

      listHtml +=
        '<div class="row" style="align-items:center; gap:8px">' +
        '<div class="muted" style="min-width:18px">' +
        (i + 1) +
        '</div>' +
        '<div style="flex:1"><b>' +
        escapeHtml(nm) +
        '</b></div>' +
        '<button class="ghost lobbyOrderUp" data-mid="' +
        escapeHtml(mid) +
        '" ' +
        (upDisabled ? 'disabled' : '') +
        '>↑</button>' +
        '<button class="ghost lobbyOrderDown" data-mid="' +
        escapeHtml(mid) +
        '" ' +
        (downDisabled ? 'disabled' : '') +
        '>↓</button>' +
        '</div>';
    }
    if (!listHtml) listHtml = '<div class="muted">参加者がいません。</div>';

    var backQ = { lobby: lobbyId, screen: canEdit ? 'lobby_host' : 'lobby_player' };
    var v = getCacheBusterParam();
    if (v) backQ.v = v;
    var backHref = '?' + buildQuery(backQ);

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ロビー：順番割り振り</div>\n      <div class="kv"><span class="muted">ロビーID</span><b>' +
        escapeHtml(lobbyId) +
        '</b></div>\n\n      <div class="muted">' +
        escapeHtml(canEdit ? '↑↓で並べ替え、シャッフルでランダムにします。' : '閲覧のみ（ホストだけ編集できます）。') +
        '</div>\n\n      <div id="lobbyAssignError" class="form-error" role="alert"></div>\n\n      <div class="stack">' +
        listHtml +
        '</div>\n\n      <hr />\n\n      <div class="row">\n        <button id="lobbyShuffle" class="ghost" ' +
        (canEdit ? '' : 'disabled') +
        '>シャッフル</button>\n        <a class="btn ghost" href="' +
        escapeHtml(backHref) +
        '">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function renderCodenamesCreate(viewEl) {
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
      }
    } catch (e) {
      // ignore
    }
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">コードネーム：部屋を作成</div>\n      <div id="cnCreateError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>あなたの名前（表示用）</label>\n        <input id="cnHostName" placeholder="例: たろう" />\n      </div>\n\n      <div class="field">\n        <label>ボードサイズ（デフォルト 5x5）</label>\n        <input id="cnSize" type="number" min="3" max="8" value="5" />\n        <div class="muted">※ NxN（最大8）</div>\n      </div>\n\n      <div class="row">\n        <button id="cnCreateRoom" class="primary">QRを表示</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function readCodenamesCreateForm() {
    var n = document.getElementById('cnHostName');
    var s = document.getElementById('cnSize');
    var name = String((n && n.value) || '').trim();
    var size = clamp(parseIntSafe(s && s.value, 5), 3, 8);
    if (!name) throw new Error('名前を入力してください。');
    return { name: name, size: size };
  }

  function renderCodenamesJoin(viewEl, roomId) {
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
      }
    } catch (e) {
      // ignore
    }
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">コードネーム：参加</div>\n      <div class="kv"><span class="muted">ルームID</span><b>' +
        escapeHtml(roomId) +
        '</b></div>\n\n      <div id="cnJoinError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>名前（表示用）</label>\n        <input id="cnPlayerName" placeholder="例: たろう" />\n      </div>\n\n      <div class="row">\n        <button id="cnJoin" class="primary">参加する</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function readCodenamesJoinForm() {
    var el = document.getElementById('cnPlayerName');
    var name = String((el && el.value) || '').trim();
    if (!name) throw new Error('名前を入力してください。');
    return { name: name };
  }

  function makeCodenamesJoinUrl(roomId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.room = roomId;
    q.screen = 'codenames_join';
    return baseUrl() + '?' + buildQuery(q);
  }

  function makeCodenamesRejoinUrl(roomId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.room = roomId;
    q.screen = 'codenames_rejoin';
    return baseUrl() + '?' + buildQuery(q);
  }

  function renderCodenamesRejoin(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;

    var items = '';
    try {
      var ps = (room && room.players) || {};
      var keys = Object.keys(ps);
      if (keys.length) {
        keys.sort(function (a, b) {
          var pa = ps[a] || {};
          var pb = ps[b] || {};
          var aa = pa.joinedAt || 0;
          var bb = pb.joinedAt || 0;
          return aa - bb;
        });
        for (var i = 0; i < keys.length; i++) {
          var id = keys[i];
          var p = ps[id] || {};
          var nm = escapeHtml(formatPlayerDisplayName(p) || '-');
          var t = p.team === 'red' ? '赤' : p.team === 'blue' ? '青' : '未選択';
          var r = p.role === 'spymaster' ? 'スパイマスター' : p.role === 'operative' ? '諜報員' : '未選択';
          var hostMark = p.isHost ? ' <span class="badge">GM</span>' : '';
          items +=
            '<button class="ghost cnRejoinPick" data-pid="' +
            escapeHtml(id) +
            '">' +
            nm +
            hostMark +
            ' <span class="muted">(' +
            escapeHtml(t + ' / ' + r) +
            ')</span></button>';
        }
      }
    } catch (e) {
      items = '';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">コードネーム：再入場</div>\n      <div class="kv"><span class="muted">ルームID</span><b>' +
        escapeHtml(roomId) +
        '</b></div>\n\n      <div class="muted">すでに登録済みの名前を選ぶと、そのまま再入場します。</div>\n\n      <div id="cnRejoinError" class="form-error" role="alert"></div>\n\n      <div class="stack">' +
        (items || '<div class="muted">まだ参加者がいません。新規参加してください。</div>') +
        '</div>\n\n      <hr />\n      <div class="row">\n        <button id="cnGoNewJoin" class="primary">新規参加</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function renderCodenamesHost(viewEl, opts) {
    var roomId = opts.roomId;
    var joinUrl = opts.joinUrl;
    var room = opts.room;
    var hostPlayerId = opts.hostPlayerId;
    var qrOnly = !!opts.qrOnly;
    var hostPlayer = (room && room.players && hostPlayerId && room.players[hostPlayerId]) || null;

    if (!qrOnly) {
      var phase = (room && room.phase) || 'lobby';
      var counts = countCodenamesRoles(room);
      var canStart = phase === 'lobby' && counts.redSpymaster === 1 && counts.blueSpymaster === 1 && counts.redOperative >= 1 && counts.blueOperative >= 1;

      var startHint = '';
      if (!canStart) {
        startHint =
          '<div class="muted" style="margin-top:8px">' +
          '開始条件: 赤スパイマスター=1 / 青スパイマスター=1 / 赤諜報員>=1 / 青諜報員>=1<br />' +
          '現在: 赤スパイマスター=' +
          escapeHtml(String(counts.redSpymaster)) +
          ' / 青スパイマスター=' +
          escapeHtml(String(counts.blueSpymaster)) +
          ' / 赤諜報員=' +
          escapeHtml(String(counts.redOperative)) +
          ' / 青諜報員=' +
          escapeHtml(String(counts.blueOperative)) +
          '</div>';
      }

      var normalSec = getCodenamesTimerNormalSec(room);
      var bonusSec = getCodenamesTimerFirstBonusSec(room);
      var normalVals = [60, 90, 120, 150];
      var bonusVals = [30, 60, 90, 120];
      function idxOf(arr, v) {
        for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i;
        return 0;
      }
      var normalIdx = idxOf(normalVals, normalSec);
      var bonusIdx = idxOf(bonusVals, bonusSec);

      render(
        viewEl,
        '\n    <div class="stack">\n      <div class="big">コードネーム：タイマー設定</div>\n\n      <div class="stack">' +
          '<div class="field"><label>通常タイマー <b id="cnTimerNormalLabel">' +
          escapeHtml(formatMMSS(normalVals[normalIdx])) +
          '</b></label><input id="cnTimerNormal" type="range" min="0" max="3" step="1" value="' +
          escapeHtml(String(normalIdx)) +
          '" /></div>' +
          '<div class="field"><label>初ターン追加 <b id="cnTimerBonusLabel">' +
          escapeHtml(formatMMSS(bonusVals[bonusIdx])) +
          '</b></label><input id="cnTimerBonus" type="range" min="0" max="3" step="1" value="' +
          escapeHtml(String(bonusIdx)) +
          '" /></div>' +
          '<button id="cnStart" class="primary">スタート</button>' +
          '<div id="cnStartStatus" class="muted" style="min-height:1.2em"></div>' +
          (startHint || '') +
          '</div>\n    </div>\n  '
      );
      return;
    }

    // qrOnly: rejoin QR screen (keep as-is)
    var qrTitle = 'コードネーム：再入場QR';
    var qrDesc = 'ゲーム中に再入場する人はこのQRを読み取ってください。';

    var playerCount = room && room.players ? Object.keys(room.players).length : 0;
    var playersHtml = '';
    try {
      var ps = (room && room.players) || {};
      var pkeys = Object.keys(ps);
      if (pkeys.length) {
        pkeys.sort(function (a, b) {
          var pa = ps[a] || {};
          var pb = ps[b] || {};
          var aa = pa.joinedAt || 0;
          var bb = pb.joinedAt || 0;
          return aa - bb;
        });
        for (var pi = 0; pi < pkeys.length; pi++) {
          var id = pkeys[pi];
          var p = ps[id] || {};
          var nm = escapeHtml(formatPlayerDisplayName(p) || '-');
          var hostMark = p.isHost ? ' <span class="badge">GM</span>' : '';
          playersHtml += '<div class="kv"><span class="muted">' + nm + hostMark + '</span><b></b></div>';
        }
      } else {
        playersHtml = '<div class="muted">まだ参加者がいません。</div>';
      }
    } catch (e) {
      playersHtml = '<div class="muted">参加者一覧を表示できませんでした。</div>';
    }

    var backToGameHtml = '<hr /><div class="row"><button id="cnBackToGame" class="primary">GMがゲームに戻る</button></div>';

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">' +
        escapeHtml(qrTitle) +
        '</div>\n      <div class="muted">' +
        escapeHtml(qrDesc) +
        '</div>\n\n      <div class="center" id="qrWrap">\n        <canvas id="qr"></canvas>\n      </div>\n      <div class="muted center" id="qrError"></div>\n\n      <div class="field">\n        <label>参加URL（スマホ以外はこちら）</label>\n        <div class="code" id="joinUrlText">' +
        escapeHtml(joinUrl || '') +
        '</div>\n        <div class="row">\n          <button id="copyJoinUrl" class="ghost">コピー</button>\n        </div>\n        <div class="muted" id="copyStatus"></div>\n      </div>\n\n      <div class="kv"><span class="muted">参加状況</span><b>' +
        playerCount +
        '</b></div>\n\n      <hr />\n\n      <div class="stack">\n        <div class="big">参加者（保存状況）</div>\n        ' +
        playersHtml +
        '\n      </div>\n\n      ' +
        backToGameHtml +
        '\n    </div>\n  '
    );
  }

  function codenamesCellClass(key, revealed) {
    if (!revealed) return 'cn-card';
    if (key === 'R') return 'cn-card cn-revealed cn-red';
    if (key === 'B') return 'cn-card cn-revealed cn-blue';
    if (key === 'A') return 'cn-card cn-revealed cn-assassin';
    return 'cn-card cn-revealed cn-neutral';
  }

  function renderCodenamesPlayer(viewEl, opts) {
    var roomId = opts.roomId;
    var playerId = opts.playerId;
    var room = opts.room;
    var player = opts.player;
    var isHost = !!opts.isHost;
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';

    var phase = (room && room.phase) || 'lobby';
    var myTeam = player && player.team ? player.team : '';
    var myRole = player && player.role ? player.role : '';

    var pendingObj = (room && room.turn && room.turn.pending) || {};

    var board = room && room.board ? room.board : null;
    var size = board && board.size ? board.size : 5;
    var total = board && board.words ? board.words.length : 0;
    var key = board && board.key ? board.key : [];
    var revealed = board && board.revealed ? board.revealed : [];

    var nameText = escapeHtml(formatPlayerDisplayName(player));
    var teamLabel = myTeam === 'red' ? '赤' : myTeam === 'blue' ? '青' : '-';
    var roleLabel = myRole === 'spymaster' ? 'スパイマスター' : myRole === 'operative' ? '諜報員' : '-';
    var roleHtml =
      myTeam || myRole
        ? '<div>' + escapeHtml(teamLabel) + '</div><div>' + escapeHtml(roleLabel) + '</div>'
        : '-';
    var tt0 = phase === 'playing' && room && room.turn ? room.turn : {};
    var turnTeam = phase === 'playing' && room && room.turn ? room.turn.team : '';
    var turnLabel = turnTeam === 'red' ? '赤' : turnTeam === 'blue' ? '青' : '-';

    function findCodenamesPlayerName(team, role) {
      try {
        var ps = (room && room.players) || {};
        var keys = Object.keys(ps);
        for (var i = 0; i < keys.length; i++) {
          var p = ps[keys[i]];
          if (!p) continue;
          if (String(p.team || '') === String(team || '') && String(p.role || '') === String(role || '')) {
            return String(formatPlayerDisplayName(p) || '').trim();
          }
        }
      } catch (e) {
        // ignore
      }
      return '';
    }

    function countCodenamesRole(team, role) {
      var c = 0;
      try {
        var ps2 = (room && room.players) || {};
        var keys2 = Object.keys(ps2);
        for (var i2 = 0; i2 < keys2.length; i2++) {
          var p2 = ps2[keys2[i2]];
          if (!p2) continue;
          if (String(p2.team || '') === String(team || '') && String(p2.role || '') === String(role || '')) c++;
        }
      } catch (e) {
        // ignore
      }
      return c;
    }

    var turnStatus = String((tt0 && tt0.status) || '');
    var isMyTeamTurn = !!(phase === 'playing' && myTeam && turnTeam && myTeam === turnTeam);
    var isActor = false;
    if (isMyTeamTurn) {
      if (turnStatus === 'awaiting_clue') isActor = myRole === 'spymaster';
      if (turnStatus === 'guessing') isActor = myRole === 'operative';
    }

    var who = '';
    if (phase === 'playing' && turnTeam) {
      if (turnStatus === 'awaiting_clue') {
        var sm = findCodenamesPlayerName(turnTeam, 'spymaster');
        who = sm ? sm : 'スパイマスター';
      } else if (turnStatus === 'guessing') {
        var oc = countCodenamesRole(turnTeam, 'operative');
        if (oc === 1) {
          var op = findCodenamesPlayerName(turnTeam, 'operative');
          who = op ? op : '諜報員';
        } else {
          who = '諜報員';
        }
      }
    }

    var turnCls = 'cn-turn' + (turnTeam === 'red' ? ' cn-turn-red' : turnTeam === 'blue' ? ' cn-turn-blue' : '') + (isActor ? ' cn-turn-active' : '');

    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
        if (phase === 'playing' && isActor) viewEl.classList.add('cn-turn-actor');
      }
    } catch (e) {
      // ignore
    }
    var timerTopHtml = '';
    if (phase === 'playing') {
      timerTopHtml =
        '<div class="cn-timer">' +
        '<div class="muted">残り時間</div>' +
        '<div><b id="cnTimer">-:--</b></div>' +
        '</div>';
    }

    var turnHtml =
      '<div>' + escapeHtml(turnLabel + 'のターン') + '</div>' +
      (who ? '<div class="muted">（' + escapeHtml(who) + '）</div>' : '');

    var topLine =
      '<div class="cn-topline">' +
      '<div class="cn-me">' +
      nameText +
      '</div>' +
      '<div class="cn-role">' +
      roleHtml +
      '</div>' +
      '<div class="' +
      turnCls +
      '">' +
      turnHtml +
      '</div>' +
      timerTopHtml +
      '</div>';

    var gmToolsHtml = '';

    var lobbyHtml = '';
    if (phase === 'lobby') {
      var playersHtml = '';
      try {
        var ps = (room && room.players) || {};
        var pkeys = Object.keys(ps);
        if (pkeys.length) {
          pkeys.sort(function (a, b) {
            var pa = ps[a] || {};
            var pb = ps[b] || {};
            var aa = pa.joinedAt || 0;
            var bb = pb.joinedAt || 0;
            return aa - bb;
          });
          for (var pi = 0; pi < pkeys.length; pi++) {
            var id = pkeys[pi];
            var p = ps[id] || {};
            var nm = escapeHtml(formatPlayerDisplayName(p) || '-');
            var t = p.team === 'red' ? '赤' : p.team === 'blue' ? '青' : '未選択';
            var r = p.role === 'spymaster' ? 'スパイマスター' : p.role === 'operative' ? '諜報員' : '未選択';
            var hostMark = p.isHost ? ' <span class="badge">GM</span>' : '';
            playersHtml += '<div class="kv"><span class="muted">' + nm + hostMark + '</span><b>' + escapeHtml(t + ' / ' + r) + '</b></div>';
          }
        } else {
          playersHtml = '<div class="muted">まだ参加者がいません。</div>';
        }
      } catch (e) {
        playersHtml = '<div class="muted">参加者一覧を表示できませんでした。</div>';
      }

      var stage = room && room.lobbyStage ? String(room.lobbyStage) : 'roles';
      var locked = stage === 'timer' || !!(player && player.prefsLocked);
      var saved = !!(myTeam && myRole);

      if (locked || saved) {
        var note = locked
          ? '※ テーブルでタイマー設定中です（役職登録はできません）。'
          : '※ 役職は登録済みです（変更不要ならこのまま待機）。';
        lobbyHtml =
          '<div class="stack">' +
          '<div class="big">待機中</div>' +
          '<div class="muted">' +
          escapeHtml(note) +
          '</div>' +
          '<hr />' +
          '<div class="big">参加者（登録状況）</div>' +
          playersHtml +
          '</div>';
      } else {
        lobbyHtml =
          '<div class="stack">' +
          '<div class="big">待機中</div>' +
          '<div class="muted">チームと役職を選んでください。</div>' +
          '<div class="field"><label>チーム</label>' +
          '<select id="cnTeam"><option value="">未選択</option><option value="red">赤</option><option value="blue">青</option></select></div>' +
          '<div class="field"><label>役職</label>' +
          '<select id="cnRole"><option value="">未選択</option><option value="spymaster">スパイマスター</option><option value="operative">諜報員</option></select></div>' +
          '<div id="cnPrefsError" class="form-error" role="alert"></div>' +
          '<button id="cnSavePrefs" class="primary">保存</button>' +
          '<div class="muted">※ タイマー設定とスタートはテーブル端末で行います。</div>' +
          '<hr />' +
          '<div class="big">参加者（登録状況）</div>' +
          playersHtml +
          '</div>';
      }
    }

    var clueRowHtml = '';
    if (phase === 'playing') {
      var tt = room.turn || {};
      var clue = tt.clue || { word: '', number: 0 };
      var clueText = clue && clue.word ? String(clue.word) : '';
      var clueNum = clue && clue.number != null ? String(clue.number) : '';
      var guessesLeft = tt.guessesLeft != null ? String(tt.guessesLeft) : '0';
      var canClue = myRole === 'spymaster' && myTeam && tt.team === myTeam && tt.status === 'awaiting_clue';

      if (canClue) {
        clueRowHtml =
          '<div class="cn-clue-row">' +
          '<input id="cnClueWord" placeholder="ヒント" />' +
          '<input id="cnClueNum" class="cn-clue-num" type="number" min="0" max="20" value="1" />' +
          '<button id="cnSubmitClue" class="primary">送信</button>' +
          '</div>' +
          '<div id="cnClueError" class="form-error" role="alert"></div>';
      } else {
        var clueLine = clueText ? escapeHtml(clueText) + ' / ' + escapeHtml(clueNum || '0') : '（未提示）';
        clueRowHtml =
          '<div class="cn-clue-row">' +
          '<div class="cn-clue-view">ヒント: <b>' +
          clueLine +
          '</b></div>' +
          '<div class="cn-clue-left">残り: <b>' +
          escapeHtml(guessesLeft) +
          '</b></div>' +
          '</div>';
      }
    }

    var boardHtml = '';
    if (phase === 'playing' || phase === 'finished') {
      var cells = '';
      var showKey = myRole === 'spymaster';
      for (var i = 0; i < total; i++) {
        var word = board && board.words ? board.words[i] : '';
        var isRev = !!revealed[i];
        var k = key[i];
        var cls = codenamesCellClass(k, isRev || (showKey && phase === 'playing'));
        if (!isRev && showKey && phase === 'playing') cls += ' cn-keypreview';
        if (!isRev && pendingObj && pendingObj[String(i)]) cls += ' cn-pending';
        var disabled = phase !== 'playing' || isRev || myRole !== 'operative' || !myTeam || !room.turn || room.turn.team !== myTeam || room.turn.status !== 'guessing';
        var tagStart = disabled ? '<button class="' + cls + '" disabled>' : '<button class="' + cls + ' cnPick" data-idx="' + i + '">';
        cells += tagStart + '<span class="cn-word">' + escapeHtml(word) + '</span></button>';
      }

      boardHtml =
        '<hr /><div class="stack">' +
        '<div class="cn-board" style="grid-template-columns: repeat(' +
        escapeHtml(String(size)) +
        ', 1fr);">' +
        cells +
        '</div>' +
        '</div>';
    }

    var actionsHtml = '';
    if (phase === 'playing') {
      var ttt = room.turn || {};
      var myTurn = myTeam && ttt.team === myTeam;
      if (myTurn && ttt.status === 'guessing' && myRole === 'operative') {
        actionsHtml = '<hr /><div class="row"><button id="cnEndTurn" class="ghost">ターン終了</button></div>';
      }
    }

    var finishedHtml = '';
    if (phase === 'finished') {
      var winner = room && room.result ? room.result.winner : '';
      var wLabel = winner === 'red' ? '赤の勝ち' : winner === 'blue' ? '青の勝ち' : '-';
      finishedHtml =
        '<div class="stack">' +
        '<div class="big">結果</div>' +
        '<div class="kv"><span class="muted">勝者</span><b>' +
        escapeHtml(wLabel) +
        '</b></div>' +
        '<div class="muted">※ 次へ進むのはテーブル端末です。</div>' +
        '</div>';
    }

    var clueHistoryHtml = '';
    if (phase === 'playing' || phase === 'finished') {
      var rows = '';
      try {
        var log = room && Array.isArray(room.clueLog) ? room.clueLog : [];
        var start = Math.max(0, log.length - 10);
        for (var li = start; li < log.length; li++) {
          var it = log[li] || {};
          var t = it.team === 'red' ? '赤' : it.team === 'blue' ? '青' : '-';
          var w = it.word ? String(it.word) : '';
          var num = it.number != null ? String(it.number) : '0';
          if (!w) continue;
          rows += '<div class="kv"><span class="muted">' + escapeHtml(t) + '</span><b>' + escapeHtml(w) + ' / ' + escapeHtml(num) + '</b></div>';
        }
      } catch (e2) {
        rows = '';
      }

      clueHistoryHtml =
        '<hr /><div class="stack">' +
        '<div class="big">ヒント履歴</div>' +
        (rows || '<div class="muted">（まだありません）</div>') +
        '</div>';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      ' +
        '\n      ' +
        topLine +
        '\n      ' +
        gmToolsHtml +
        '\n\n      ' +
        (phase === 'lobby' ? lobbyHtml : '') +
        (phase === 'playing' ? clueRowHtml : '') +
        (phase === 'playing' ? actionsHtml : '') +
        (phase === 'finished' ? finishedHtml : '') +
        boardHtml +
        clueHistoryHtml +
        '\n    </div>\n  '
    );

    if (phase === 'lobby') {
      var teamSel = document.getElementById('cnTeam');
      if (teamSel) teamSel.value = myTeam || '';
      var roleSel = document.getElementById('cnRole');
      if (roleSel) roleSel.value = myRole || '';
    }
  }

  function renderCodenamesTable(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;
    var isHost = !!opts.isHost;
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';

    var phase = (room && room.phase) || 'lobby';

    var pendingObj = (room && room.turn && room.turn.pending) || {};
    var board = room && room.board ? room.board : null;
    var size = board && board.size ? board.size : 5;
    var total = board && board.words ? board.words.length : 0;
    var key = board && board.key ? board.key : [];
    var revealed = board && board.revealed ? board.revealed : [];

    var tt0 = phase === 'playing' && room && room.turn ? room.turn : {};
    var turnTeam = phase === 'playing' && room && room.turn ? room.turn.team : '';
    var turnLabel = turnTeam === 'red' ? '赤' : turnTeam === 'blue' ? '青' : '-';
    var turnStatus = String((tt0 && tt0.status) || '');
    var who = '';
    if (phase === 'playing' && turnTeam) {
      if (turnStatus === 'awaiting_clue') who = 'スパイマスター';
      else if (turnStatus === 'guessing') who = '諜報員';
    }

    var turnCls = 'cn-turn' + (turnTeam === 'red' ? ' cn-turn-red' : turnTeam === 'blue' ? ' cn-turn-blue' : '');

    // Table timer: show big between clue row and board.
    var timerMidHtml = '';
    if (phase === 'playing') {
      timerMidHtml =
        '<div class="card center" style="padding:12px">' +
        '<div class="muted" style="margin-bottom:6px">残り時間</div>' +
        '<div class="big"><b id="cnTimer">-:--</b></div>' +
        '</div>';
    }

    var topLine =
      '<div class="cn-topline">' +
      '<div class="cn-me">テーブル表示</div>' +
      '<div class="cn-role">諜報員表示</div>' +
      '<div class="' +
      turnCls +
      '">手番: ' +
      escapeHtml(turnLabel) +
      (who ? '（' + escapeHtml(who) + '）' : '') +
      '</div>' +
      '</div>';

    var lobbyHtml = '';
    if (phase === 'lobby') {
      lobbyHtml = '<div class="stack"><div class="big">待機中</div><div class="muted">ゲーム開始をお待ちください。</div></div>';
    }

    var clueRowHtml = '';
    if (phase === 'playing') {
      var tt = room.turn || {};
      var clue = tt.clue || { word: '', number: 0 };
      var clueText = clue && clue.word ? String(clue.word) : '';
      var clueNum = clue && clue.number != null ? String(clue.number) : '';
      var guessesLeft = tt.guessesLeft != null ? String(tt.guessesLeft) : '0';
      var clueLine = clueText ? escapeHtml(clueText) + ' / ' + escapeHtml(clueNum || '0') : '（未提示）';
      clueRowHtml =
        '<div class="cn-clue-row">' +
        '<div class="cn-clue-view">ヒント: <b>' +
        clueLine +
        '</b></div>' +
        '<div class="cn-clue-left">残り: <b>' +
        escapeHtml(guessesLeft) +
        '</b></div>' +
        '</div>';
    }

    var boardHtml = '';
    if (phase === 'playing' || phase === 'finished') {
      var cells = '';
      for (var i = 0; i < total; i++) {
        var word = board && board.words ? board.words[i] : '';
        var isRev = !!revealed[i];
        var k = key[i];
        var cls = codenamesCellClass(k, isRev);
        if (!isRev && pendingObj && pendingObj[String(i)]) cls += ' cn-pending';
        cells += '<button class="' + cls + '" disabled><span class="cn-word">' + escapeHtml(word) + '</span></button>';
      }

      boardHtml =
        '<hr /><div class="stack">' +
        '<div class="cn-board" style="grid-template-columns: repeat(' +
        escapeHtml(String(size)) +
        ', 1fr);">' +
        cells +
        '</div>' +
        '</div>';
    }

    var finishedHtml = '';
    if (phase === 'finished') {
      var winner = room && room.result ? room.result.winner : '';
      var wLabel = winner === 'red' ? '赤の勝ち' : winner === 'blue' ? '青の勝ち' : '-';
      finishedHtml =
        '<div class="stack">' +
        '<div class="big">結果</div>' +
        '<div class="kv"><span class="muted">勝者</span><b>' +
        escapeHtml(wLabel) +
        '</b></div>' +
        (lobbyId
          ? '<hr />' +
            (isHost
              ? '<div class="row"><button id="cnNextToLobby" class="primary">次へ</button></div>'
              : '<div class="muted">※ 次へ進むのはゲームマスターです。</div>')
          : '') +
        '</div>';
    }

    var clueHistoryHtml = '';
    if (phase === 'playing' || phase === 'finished') {
      var rows = '';
      try {
        var log = room && Array.isArray(room.clueLog) ? room.clueLog : [];
        var start = Math.max(0, log.length - 10);
        for (var li = start; li < log.length; li++) {
          var it = log[li] || {};
          var t = it.team === 'red' ? '赤' : it.team === 'blue' ? '青' : '-';
          var w = it.word ? String(it.word) : '';
          var num = it.number != null ? String(it.number) : '0';
          if (!w) continue;
          rows += '<div class="kv"><span class="muted">' + escapeHtml(t) + '</span><b>' + escapeHtml(w) + ' / ' + escapeHtml(num) + '</b></div>';
        }
      } catch (e2) {
        rows = '';
      }

      clueHistoryHtml =
        '<hr /><div class="stack">' +
        '<div class="big">ヒント履歴</div>' +
        (rows || '<div class="muted">（まだありません）</div>') +
        '</div>';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      ' +
        topLine +
        '\n\n      ' +
        (phase === 'lobby' ? lobbyHtml : '') +
        (phase === 'playing' ? clueRowHtml : '') +
        (phase === 'playing' ? timerMidHtml : '') +
        (phase === 'finished' ? finishedHtml : '') +
        boardHtml +
        clueHistoryHtml +
        '\n    </div>\n  '
    );
  }

  function renderHistory(viewEl, items) {
    var rows = '';
    if (!items || !items.length) {
      rows = '<div class="muted">履歴はまだありません。</div>';
    } else {
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        rows +=
          '<div class="card" style="padding:12px">' +
          '<div class="kv"><span class="muted">日時</span><b>' +
          escapeHtml(it.when || '-') +
          '</b></div>' +
          '<div class="kv"><span class="muted">勝利</span><b>' +
          escapeHtml(it.winner || '-') +
          '</b></div>' +
          (it.minorityNames ? '<div class="muted">少数側: ' + escapeHtml(it.minorityNames) + '</div>' : '') +
          (it.words ? '<div class="muted">お題: ' + escapeHtml(it.words) + '</div>' : '') +
          '</div>';
      }
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">勝敗履歴</div>\n      <div class="muted">この端末（主にゲームマスター）に保存される簡易履歴です。</div>\n\n      <div class="stack">' +
        rows +
        '</div>\n\n      <div class="row">\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function renderSetup(viewEl) {
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">セットアップ</div>\n      <div class="muted">Firebase（Realtime Database）のWeb設定を貼り付けて保存します（JSON でも firebaseConfig のサンプルコードでもOK）。</div>\n\n      <div class="field">\n        <label>Firebase config</label>\n        <textarea id="firebaseConfigJson" placeholder=\'{"apiKey":"...","authDomain":"...","databaseURL":"...","projectId":"...","appId":"..."}\n\nまたは\n\nconst firebaseConfig = { apiKey: "...", databaseURL: "..." }\'></textarea>\n        <div class="muted">※ databaseURL は https:// から始まるRealtime DatabaseのURLです（firebaseio.com / firebasedatabase.app）。</div>\n      </div>\n\n      <hr />\n\n      <div class="field">\n        <label>Gemini APIキー（おえかきバトルのAI判定用・任意）</label>\n        <input id="geminiApiKeyInput" type="password" placeholder="AIza..." autocomplete="off" />\n        <div class="muted">※ ゲーム開始するホスト端末のみ必要です。Google AI Studio（aistudio.google.com/app/apikey）で無料発行できます。空欄で保存すると削除されます。一度入れた端末では以降ずっと保持されます。</div>\n      </div>\n\n      <div id="geminiImportNotice" class="badge" style="display:none"></div>\n\n      <div class="row">\n        <button id="saveSetup" class="primary">保存</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n\n      <div id="geminiShareArea"></div>\n    </div>\n  '
    );

    var saved = loadFirebaseConfigFromLocalStorage();
    if (saved) {
      var el = document.getElementById('firebaseConfigJson');
      if (el) el.value = JSON.stringify(saved);
    }

    try {
      var gk = document.getElementById('geminiApiKeyInput');
      if (gk) gk.value = loadGeminiApiKey();
    } catch (eGk) {
      // ignore
    }
  }

  function extractObjectLiteralAfter(text, marker) {
    var idx = text.indexOf(marker);
    if (idx < 0) return null;
    var braceStart = text.indexOf('{', idx);
    if (braceStart < 0) return null;
    var depth = 0;
    for (var i = braceStart; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(braceStart, i + 1);
        }
      }
    }
    return null;
  }

  function jsObjectLiteralToJsonText(objText) {
    // Convert a simple JS object literal (no functions) into JSON text.
    // Handles common Firebase snippet format.
    var s = String(objText || '');
    // Remove line comments
    s = s.replace(/\/\/.*$/gm, '');
    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Quote unquoted keys: { apiKey: "..." } -> { "apiKey": "..." }
    s = s.replace(/([\{,]\s*)([A-Za-z0-9_$]+)\s*:/g, '$1"$2":');
    return s;
  }

  function parseLooseFirebaseConfig(objText) {
    // Last-resort tolerant parser: picks `key: value` pairs even if commas are missing.
    // Accepts string/number/boolean/null values.
    var text = String(objText || '');
    // Strip surrounding braces if present
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start + 1, end);

    // Remove line comments
    text = text.replace(/\/\/.*$/gm, '');

    var out = {};
    var re = /([A-Za-z0-9_$]+)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|true|false|null|-?\d+(?:\.\d+)?)\s*,?/g;
    var m;
    while ((m = re.exec(text))) {
      var k = m[1];
      var rawVal = m[2];
      var val;
      if (rawVal === 'true') val = true;
      else if (rawVal === 'false') val = false;
      else if (rawVal === 'null') val = null;
      else if (rawVal.charAt(0) === '"' || rawVal.charAt(0) === "'") {
        // Use JSON.parse for double-quoted strings; for single-quoted, convert safely.
        if (rawVal.charAt(0) === '"') {
          try {
            val = JSON.parse(rawVal);
          } catch (e) {
            val = rawVal.slice(1, -1);
          }
        } else {
          var dq = '"' + rawVal.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
          try {
            val = JSON.parse(dq);
          } catch (e2) {
            val = rawVal.slice(1, -1);
          }
        }
      } else {
        val = Number(rawVal);
      }
      out[k] = val;
    }
    return out;
  }

  function readSetupForm() {
    var el = document.getElementById('firebaseConfigJson');
    var raw = String((el && el.value) || '').trim();
    if (!raw) throw new Error('Firebase config JSON を貼り付けてください。');

    // Accept either strict JSON or the official Firebase snippet code.
    var candidate = raw;
    if (raw.indexOf('firebaseConfig') >= 0) {
      var extracted = extractObjectLiteralAfter(raw, 'firebaseConfig');
      if (extracted) candidate = extracted;
    }

    var parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch (e1) {
      try {
        parsed = JSON.parse(jsObjectLiteralToJsonText(candidate));
      } catch (e2) {
        try {
          parsed = parseLooseFirebaseConfig(candidate);
        } catch (e3) {
          parsed = null;
        }
        if (!parsed || !parsed.apiKey) {
          throw new Error('JSONとして解釈できません。firebaseConfig の { ... } 部分だけを貼るか、Firebaseコンソールの設定をそのまま貼ってください。');
        }
      }
    }
    if (!parsed || !parsed.apiKey) throw new Error('apiKey が見つかりません。');
    if (!parsed.databaseURL) throw new Error('databaseURL が見つかりません。');

    // Normalize & validate databaseURL (Realtime Database)
    parsed.databaseURL = ensureValidDatabaseURLOrThrow(parsed.databaseURL);
    return parsed;
  }

  function renderCreate(viewEl) {
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
      }
    } catch (e) {
      // ignore
    }
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">部屋を作成</div>\n      <div id="wwCreateError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>ゲームマスターの名前（表示用）</label>\n        <input id="gmName" placeholder="例: たろう" />\n        <div class="muted">※ 待機中など一部の画面では「(ゲームマスター)」を付けて表示します。</div>\n      </div>\n\n      <div class="field">\n        <label>少数側の人数（最大5）</label>\n        <input id="minorityCount" type="range" min="1" max="5" step="1" value="1" />\n        <div class="kv"><span class="muted">現在</span><b id="minorityCountLabel">1</b></div>\n      </div>\n\n      <div class="field">\n        <label>トーク時間（分・最大10分）</label>\n        <input id="talkMinutes" type="range" min="1" max="10" step="1" value="3" />\n        <div class="kv"><span class="muted">現在</span><b id="talkMinutesLabel">3分</b></div>\n      </div>\n\n      <div class="field">\n        <label>逆転あり（少数側が最後に多数側ワードを当てたら勝ち）</label>\n        <select id="reversal">\n          <option value="1" selected>あり</option>\n          <option value="0">なし</option>\n        </select>\n      </div>\n\n      <hr />\n\n      <div class="field">\n        <label>お題カテゴリ</label>\n        <select id="topicCategory"></select>\n        <div class="muted">※ 作成時点（QR表示時）にワードを確定してDBに保持します。画面には表示しません。</div>\n      </div>\n\n      <div class="row">\n        <button id="createRoom" class="primary">QRを表示</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );

    var sel = document.getElementById('topicCategory');
    if (sel) {
      var html = '<option value="random">ランダム</option>';
      for (var i = 0; i < TOPIC_CATEGORIES.length; i++) {
        var c = TOPIC_CATEGORIES[i];
        html += '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
      }
      sel.innerHTML = html;
      sel.value = 'random';
    }

    function updateLabels() {
      var mc = document.getElementById('minorityCount');
      var mcl = document.getElementById('minorityCountLabel');
      if (mc && mcl) mcl.textContent = String(mc.value || '1');
      var tm = document.getElementById('talkMinutes');
      var tml = document.getElementById('talkMinutesLabel');
      if (tm && tml) tml.textContent = String(tm.value || '1') + '分';
    }

    var mcEl = document.getElementById('minorityCount');
    if (mcEl) mcEl.addEventListener('input', updateLabels);
    var tmEl = document.getElementById('talkMinutes');
    if (tmEl) tmEl.addEventListener('input', updateLabels);
    updateLabels();
  }

  function readCreateForm() {
    var gn = document.getElementById('gmName');
    var mc = document.getElementById('minorityCount');
    var tm = document.getElementById('talkMinutes');
    var rv = document.getElementById('reversal');
    var tc = document.getElementById('topicCategory');

    var gmName = String((gn && gn.value) || '').trim();
    var minorityCount = clamp(parseIntSafe(mc && mc.value, 1), 1, 5);
    var talkMinutes = clamp(parseIntSafe(tm && tm.value, 3), 1, 10);
    var talkSeconds = talkMinutes * 60;
    var reversal = ((rv && rv.value) || '1') === '1';

    var topicCategoryId = String((tc && tc.value) || 'random');

    if (!gmName) throw new Error('ゲームマスターの名前を入力してください。');

    return {
      gmName: gmName,
      minorityCount: minorityCount,
      talkSeconds: talkSeconds,
      reversal: reversal,
      topicCategoryId: topicCategoryId
    };
  }

  function renderJoin(viewEl, roomId) {
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
      }
    } catch (e) {
      // ignore
    }
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">参加</div>\n      <div class="kv"><span class="muted">ルームID</span><b>' +
        escapeHtml(roomId) +
        '</b></div>\n\n      <div id="wwJoinError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>名前（表示用）</label>\n        <input id="playerName" placeholder="例: たろう" />\n      </div>\n\n      <div class="row">\n        <button id="join" class="primary">参加する</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function renderWordwolfRejoin(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;

    var items = '';
    try {
      var ps = (room && room.players) || {};
      var keys = Object.keys(ps);
      if (keys.length) {
        keys.sort(function (a, b) {
          var pa = ps[a] || {};
          var pb = ps[b] || {};
          var aa = pa.joinedAt || 0;
          var bb = pb.joinedAt || 0;
          return aa - bb;
        });
        for (var i = 0; i < keys.length; i++) {
          var id = keys[i];
          var p = ps[id] || {};
          var nm = escapeHtml(formatPlayerMenuName(p) || '-');
          items += '<button class="ghost wwRejoinPick" data-pid="' + escapeHtml(id) + '">' + nm + '</button>';
        }
      }
    } catch (e) {
      items = '';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">再入場</div>\n      <div class="kv"><span class="muted">ルームID</span><b>' +
        escapeHtml(roomId) +
        '</b></div>\n\n      <div class="muted">すでに登録済みの名前を選ぶと、そのまま再入場します。</div>\n\n      <div id="wwRejoinError" class="form-error" role="alert"></div>\n\n      <div class="stack">' +
        (items || '<div class="muted">まだ参加者がいません。新規参加してください。</div>') +
        '</div>\n\n      <hr />\n      <div class="row">\n        <button id="wwGoNewJoin" class="primary">新規参加</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function readJoinForm() {
    var el = document.getElementById('playerName');
    var name = String((el && el.value) || '').trim();
    if (!name) throw new Error('名前を入力してください。');
    return { name: name };
  }

  function renderHostQr(viewEl, opts) {
    var roomId = opts.roomId;
    var joinUrl = opts.joinUrl;
    var room = opts.room;

    var playerCount = room && room.players ? Object.keys(room.players).length : 0;
    var phase = (room && room.phase) || '-';

    var actionHtml = '';
    if (phase === 'lobby') actionHtml = '<button id="startGame" class="primary">スタート（トーク開始）</button>';

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">QR配布</div>\n      <div class="muted">参加者はこのQRを読み取って参加します。</div>\n\n      <div class="center" id="qrWrap">\n        <canvas id="qr"></canvas>\n      </div>\n      <div class="muted center" id="qrError"></div>\n\n      <div class="field">\n        <label>参加URL（スマホ以外はこちら）</label>\n        <div class="code" id="joinUrlText">' +
        escapeHtml(joinUrl || '') +
        '</div>\n        <div class="row">\n          <button id="copyJoinUrl" class="ghost">コピー</button>\n        </div>\n        <div class="muted" id="copyStatus"></div>\n      </div>\n\n      <div class="kv"><span class="muted">参加状況</span><b>' +
        playerCount +
        '</b></div>\n      <div class="kv"><span class="muted">フェーズ</span><b>' +
        escapeHtml(phase) +
        '</b></div>\n\n      <hr />\n\n      <div class="row">\n        ' +
        actionHtml +
        '\n      </div>\n\n      <div class="muted">※ スタート後、ゲームマスター端末もプレイヤー画面に移動します。</div>\n    </div>\n  '
    );
  }

  function renderPlayer(viewEl, opts) {
    var roomId = opts.roomId;
    var playerId = opts.playerId;
    var player = opts.player;
    var room = opts.room;
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';

    var isHost = !!opts.isHost;

    var role = (player && player.role) || 'unknown';
    var phase = (room && room.phase) || 'lobby';

    var ui = opts.ui || {};

    var players = (room && room.players) || {};
    var activePlayers = [];
    try {
      var pkeys = Object.keys(players);
      for (var pi = 0; pi < pkeys.length; pi++) {
        var id = pkeys[pi];
        var p = players[id] || {};
        if (p && p.role !== 'spectator') activePlayers.push({ id: id, name: formatPlayerDisplayName(p) });
      }
    } catch (eP0) {
      activePlayers = [];
    }
    var votedTo = room && room.votes && room.votes[playerId] && room.votes[playerId].to ? room.votes[playerId].to : '';

    var votesObj = (room && room.votes) || {};
    var counts = {};
    var voteKeys = Object.keys(votesObj);
    for (var vki = 0; vki < voteKeys.length; vki++) {
      var vid = voteKeys[vki];
      var v = votesObj[vid];
      if (v && v.to) counts[v.to] = (counts[v.to] || 0) + 1;
    }

    var tally = [];
    for (var ai = 0; ai < activePlayers.length; ai++) {
      var ap = activePlayers[ai];
      tally.push({ id: ap.id, name: ap.name, count: counts[ap.id] || 0 });
    }
    tally.sort(function (a, b) {
      return b.count - a.count;
    });

    var majorityWord = (room && room.words ? room.words.majority : '') || '';
    var minorityWord = (room && room.words ? room.words.minority : '') || '';

    var word = '';
    if (role === 'minority') word = minorityWord;
    if (role === 'majority') word = majorityWord;

    // Reveal both words when:
    // - majority wins (phase finished), or
    // - minority guesses are completed (phase judge)
    // (Finished always reveals.)
    var shouldRevealBothWords = phase === 'judge' || phase === 'finished';

    var singleWordHtml = '<div class="ww-word">' + escapeHtml(word || '（未配布）') + '</div>';
    var bothWordsHtml =
      '<div class="inline-row" style="gap:12px;align-items:flex-start">' +
      '<div style="flex:1;min-width:0"><div class="ww-word-label">多数側</div><div class="ww-word ww-word--small">' +
      escapeHtml(majorityWord || '（未配布）') +
      '</div></div>' +
      '<div style="flex:1;min-width:0"><div class="ww-word-label">少数側</div><div class="ww-word ww-word--small">' +
      escapeHtml(minorityWord || '（未配布）') +
      '</div></div>' +
      '</div>';

    var wordHtml = shouldRevealBothWords ? bothWordsHtml : singleWordHtml;

    var endAt = room && room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
    var remain = phase === 'discussion' ? Math.max(0, Math.floor((endAt - serverNowMs()) / 1000)) : 0;

    // For the top-right header: turn/time on separate lines.
    var roleLine = '';

    var gmDisplayName = '';
    try {
      if (room && room.settings && room.settings.gmName) gmDisplayName = String(room.settings.gmName || '').trim();
    } catch (eGm0) {
      gmDisplayName = '';
    }
    if (!gmDisplayName) {
      try {
        var pidsGm = Object.keys(players || {});
        for (var gi0 = 0; gi0 < pidsGm.length; gi0++) {
          var pidGm = pidsGm[gi0];
          var pgm = players && players[pidGm];
          if (pgm && pgm.isHost) {
            gmDisplayName = formatPlayerDisplayName(pgm) || '';
            break;
          }
        }
      } catch (eGm1) {
        gmDisplayName = '';
      }
    }
    if (!gmDisplayName) gmDisplayName = 'ゲームマスター';

    var turnLine = '';
    if (phase === 'reveal' || phase === 'judge' || phase === 'finished') {
      turnLine = gmDisplayName + 'のターン';
    }

    var headerRightLines = [];
    if (statusShort) headerRightLines.push(String(statusShort));
    if (turnLine) headerRightLines.push(String(turnLine));
    if (phase === 'discussion' && role !== 'majority') headerRightLines.push('残り ' + formatMMSS(remain));

    var headerRightHtml = '<div class="muted" style="text-align:right;line-height:1.25">';
    for (var hri = 0; hri < headerRightLines.length; hri++) {
      headerRightHtml += '<div>' + escapeHtml(headerRightLines[hri]) + '</div>';
    }
    headerRightHtml += '</div>';

    var statusText = '';
    if (phase === 'lobby') statusText = '待機中：ゲームマスターがスタートするまでお待ちください。';
    else if (phase === 'discussion') statusText = 'トーク中：少数側を探しましょう。';
    else if (phase === 'voting') statusText = votedTo ? '待機中：全員の投票を待っています。' : '投票してください。';
    else if (phase === 'guess') statusText = role === 'minority' ? '少数側は多数側ワードを入力してください。' : '待機中：少数側の入力を待っています。';
    else if (phase === 'reveal') statusText = isHost ? '投票結果を表示します。' : '待機中：投票結果を表示します。';
    else if (phase === 'judge') statusText = isHost ? '判定：勝敗を決定してください。' : '待機中：ゲームマスターの判定を待っています。';
    else if (phase === 'finished') statusText = '';

    // Short status for top line (prevents huge blocks after voting).
    var statusShort = '';
    if (phase === 'lobby') statusShort = '待機中';
    else if (phase === 'discussion') statusShort = 'トーク中';
    else if (phase === 'voting') statusShort = votedTo ? '待機中' : '投票してください';
    else if (phase === 'guess') statusShort = role === 'minority' ? '推理入力' : '待機中';
    else if (phase === 'reveal') statusShort = '結果発表';
    else if (phase === 'judge') statusShort = isHost ? '判定' : '待機中';
    else if (phase === 'finished') statusShort = '終了';

    var votedOutId = room && room.reveal && room.reveal.votedOutId ? room.reveal.votedOutId : '';
    var votedOutName = votedOutId && players && players[votedOutId] ? formatPlayerDisplayName(players[votedOutId]) : '';
    var votedOutLine = votedOutId ? votedOutName || votedOutId : '';

    var votingHtml = '';
    if (phase === 'voting') {
      var candidates = null;
      if (room && room.voting && room.voting.runoff && Array.isArray(room.voting.runoff.candidates) && room.voting.runoff.candidates.length) {
        candidates = room.voting.runoff.candidates;
      }

      var voteStatusRows = '';
      var votedCount = 0;
      for (var vsi = 0; vsi < activePlayers.length; vsi++) {
        var apv = activePlayers[vsi];
        var hasVoted = !!(votesObj && votesObj[apv.id] && votesObj[apv.id].to);
        if (hasVoted) votedCount++;
        voteStatusRows +=
          '<div class="kv"><span class="muted">' +
          escapeHtml(apv.name) +
          '</span><b>' +
          (hasVoted ? '投票済' : '未投票') +
          '</b></div>';
      }
      var voteStatusHtml =
        '<div class="stack">' +
        '<div class="muted">投票状況 ' +
        votedCount +
        '/' +
        activePlayers.length +
        '</div>' +
        '<div class="stack">' +
        voteStatusRows +
        '</div>' +
        '</div>';

      if (votedTo) {
        votingHtml =
          '<div class="stack">' +
          '<div class="big">投票</div>' +
          '<div class="muted">投票済み。待機中です。</div>' +
          voteStatusHtml +
          '</div>';
      } else {
        var buttons = '';
        for (var oi = 0; oi < activePlayers.length; oi++) {
          var ap2 = activePlayers[oi];
          if (ap2.id === playerId) continue;
          if (candidates) {
            var ok = false;
            for (var ci = 0; ci < candidates.length; ci++) {
              if (String(candidates[ci]) === String(ap2.id)) {
                ok = true;
                break;
              }
            }
            if (!ok) continue;
          }
          buttons +=
            '<button class="primary voteBtn" data-to="' +
            escapeHtml(ap2.id) +
            '" style="width:100%">' +
            escapeHtml(ap2.name) +
            '</button>';
        }

        votingHtml =
          '<div class="stack">' +
          '<div class="big">投票</div>' +
          (candidates
            ? '<div class="muted">同票のため再投票（対象者のみ）</div>'
            : '<div class="muted">少数側だと思う人をタップしてください。</div>') +
          '<div class="stack" id="voteButtons">' +
          buttons +
          '</div>' +
          voteStatusHtml +
          '</div>';
      }
    }

    var voteResultHtml = '';
    var canShowVoteResult = !!(room && room.reveal && room.reveal.revealedAt) || !!votedOutId;
    if (canShowVoteResult && (phase === 'guess' || phase === 'judge' || phase === 'finished')) {
      var rows = '';
      for (var ti = 0; ti < tally.length; ti++) {
        var r = tally[ti];
        rows += '<div class="kv"><span class="muted">' + escapeHtml(r.name) + '</span><b>' + r.count + '</b></div>';
      }

      // Keep post-vote screens minimal: put required actions inside the vote result frame.
      var extraHtml = '';
      if (phase === 'guess') {
        var myGuess0 = room && room.guess && room.guess.guesses && room.guess.guesses[playerId] ? room.guess.guesses[playerId].text : '';
        if (role === 'minority') {
          extraHtml +=
            '<hr />' +
            '<div class="muted">少数側：多数側ワードを入力</div>' +
            (myGuess0
              ? '<div class="kv"><span class="muted">送信済み</span><b>' + escapeHtml(myGuess0) + '</b></div>'
              : '<div class="stack"><input id="guessText" placeholder="多数側ワード" /><button id="submitGuess" class="primary">送信</button></div>');
        }
      }

      voteResultHtml = '<div class="card" style="padding:12px"><div class="big">投票結果</div><div class="stack">' + rows + '</div>' + extraHtml + '</div>';
    }

    var minorityNames = [];
    for (var mi = 0; mi < activePlayers.length; mi++) {
      var apm = activePlayers[mi];
      var pr = players[apm.id] && players[apm.id].role;
      if (pr === 'minority') minorityNames.push(apm.name);
    }
    var minorityLine = minorityNames.length ? minorityNames.join(' / ') : '（未確定）';

    var guessHtml = '';

    var judgeHtml = '';

    // Vote reveal modal: show voted-out player (or tie) to all. On tie, GM chooses.
    var voteRevealModalHtml = '';
    if (phase === 'reveal') {
      try {
        var rv0 = (room && room.reveal) || {};
        var tie0 = rv0 && Array.isArray(rv0.tieCandidates) ? rv0.tieCandidates : null;
        if (tie0 && tie0.length > 1) {
          var names0 = [];
          for (var ti0 = 0; ti0 < tie0.length; ti0++) {
            var pid0 = String(tie0[ti0] || '');
            if (!pid0) continue;
            names0.push(players && players[pid0] ? formatPlayerDisplayName(players[pid0]) : pid0);
          }
          voteRevealModalHtml =
            '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true" id="wwVoteRevealModal">' +
            '<div class="ll-overlay-backdrop"></div>' +
            '<div class="ll-overlay-panel">' +
            '<div class="big">投票結果：同票</div>' +
            '<div class="muted">ゲームマスターが選択します</div>' +
            '<div class="card center" style="padding:14px;margin-top:10px"><div class="big">' +
            escapeHtml(names0.join(' / ') || '-') +
            '</div></div>' +
            '<div class="row" style="justify-content:flex-end;margin-top:12px">' +
            (isHost
              ? '<button id="wwTieRevote" class="primary">再投票する</button><button id="wwTieMinorityWin" class="danger">少数側の勝ち</button>'
              : '<div class="muted">ゲームマスターが選択します</div>') +
            '</div>' +
            '</div>' +
            '</div>';
        } else {
          var outId0 = rv0 && rv0.votedOutId ? String(rv0.votedOutId) : '';
          var outName0 = outId0 && players && players[outId0] ? formatPlayerDisplayName(players[outId0]) : outId0;
          voteRevealModalHtml =
            '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true" id="wwVoteRevealModal">' +
            '<div class="ll-overlay-backdrop"></div>' +
            '<div class="ll-overlay-panel">' +
            '<div class="big">投票結果</div>' +
            '<div class="muted">最多票</div>' +
            '<div class="card center" style="padding:14px;margin-top:10px"><div class="big">' +
            escapeHtml(outName0 || '-') +
            '</div></div>' +
            '<div class="row" style="justify-content:flex-end;margin-top:12px">' +
            (isHost ? '<button id="wwVoteRevealNext" class="primary">次へ</button>' : '<div class="muted">ゲームマスターが進めます</div>') +
            '</div>' +
            '</div>' +
            '</div>';
        }
      } catch (eRv) {
        voteRevealModalHtml = '';
      }
    }

    // Guess modal: after minority submits the guess word(s), show to all; GM decides.
    var guessJudgeModalHtml = '';
    if (phase === 'judge') {
      try {
        var guessesObjJ = (room && room.guess && room.guess.guesses) || {};
        var gKeysJ = Object.keys(guessesObjJ);
        var uniqJ = {};
        var uniqListJ = [];
        for (var giJ = 0; giJ < gKeysJ.length; giJ++) {
          var entryJ = guessesObjJ[gKeysJ[giJ]];
          var txtJ = entryJ && entryJ.text ? String(entryJ.text).trim() : '';
          if (!txtJ) continue;
          var keyJ = txtJ.toLowerCase();
          if (uniqJ[keyJ]) continue;
          uniqJ[keyJ] = true;
          uniqListJ.push(txtJ);
        }
        if (uniqListJ.length) {
          guessJudgeModalHtml =
            '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true" id="wwGuessJudgeModal">' +
            '<div class="ll-overlay-backdrop"></div>' +
            '<div class="ll-overlay-panel">' +
            '<div class="big">少数側の推測</div>' +
            '<div class="muted">推測ワード</div>' +
            '<div class="card center" style="padding:14px;margin-top:10px"><div class="big">' +
            escapeHtml(uniqListJ.join(' / ')) +
            '</div></div>' +
            '<div class="row" style="justify-content:flex-end;margin-top:12px">' +
            (isHost
              ? '<button id="decideMinority" class="primary">少数側の勝ち</button><button id="decideMajority" class="danger">多数側の勝ち</button>'
              : '<div class="muted">ゲームマスターが判定します</div>') +
            '</div>' +
            '</div>' +
            '</div>';
        }
      } catch (eGj) {
        guessJudgeModalHtml = '';
      }
    }

    var finishedHtml = '';
    if (phase === 'finished') {
      var winner = (room && room.result && room.result.winner) || '';
      var winnerLabel = winner === 'minority' ? '少数側の勝ち' : winner === 'majority' ? '多数側の勝ち' : '未確定';

      finishedHtml =
        '<div class="stack">' +
        '<div class="big">結果</div>' +
        '<div class="card" style="padding:12px">' +
        '<div class="muted">勝者</div>' +
        '<div class="big">' +
        escapeHtml(winnerLabel) +
        '</div>' +
        '</div>' +
        '<div class="kv"><span class="muted">少数側</span><b>' +
        escapeHtml(minorityLine) +
        '</b></div>' +
        (votedOutLine
          ? '<div class="kv"><span class="muted">追放</span><b>' + escapeHtml(votedOutLine) + '</b></div>'
          : '') +
        (lobbyId
          ? '<hr />' + (isHost ? '' : '<div class="muted">※ ロビーへ戻るのはゲームマスターです。</div>')
          : isHost
            ? ui && ui.showContinueForm
              ? '<hr />' +
                '<div class="big">ゲーム継続</div>' +
                '<div class="muted">同じメンバーで設定を変えてすぐ始めます。</div>' +
                '<div class="field"><label>少数側の人数（最大5）</label>' +
                '<input id="cMinorityCount" type="range" min="1" max="5" step="1" value="' +
                escapeHtml(String((room && room.settings && room.settings.minorityCount) || 1)) +
                '" />' +
                '<div class="kv"><span class="muted">現在</span><b id="cMinorityCountLabel">' +
                escapeHtml(String((room && room.settings && room.settings.minorityCount) || 1)) +
                '</b></div></div>' +
                '<div class="field"><label>トーク時間（分・最大10分）</label>' +
                '<input id="cTalkMinutes" type="range" min="1" max="10" step="1" value="' +
                escapeHtml(String(Math.max(1, Math.min(10, Math.round(((room && room.settings && room.settings.talkSeconds) || 180) / 60))))) +
                '" />' +
                '<div class="kv"><span class="muted">現在</span><b id="cTalkMinutesLabel">' +
                escapeHtml(String(Math.max(1, Math.min(10, Math.round(((room && room.settings && room.settings.talkSeconds) || 180) / 60)))) + '分') +
                '</b></div></div>' +
                '<div class="field"><label>逆転あり（少数側が最後に多数側ワードを当てたら勝ち）</label>' +
                '<select id="cReversal">' +
                '<option value="1"' +
                ((room && room.settings && room.settings.reversal) ? ' selected' : '') +
                '>あり</option>' +
                '<option value="0"' +
                (!(room && room.settings && room.settings.reversal) ? ' selected' : '') +
                '>なし</option>' +
                '</select></div>' +
                '<div class="field"><label>お題カテゴリ</label>' +
                '<select id="cTopicCategory"></select>' +
                '<div class="muted">※ 開始時にワードを確定してDBに保持します。</div></div>' +
                '<div class="row">' +
                '<button id="startContinue" class="primary">この設定で開始</button>' +
                  '\n      </div>\n    </div>\n  '
              : '<hr />' +
                '<div class="row">' +
                '<button id="continueGame" class="primary">もう一度</button>' +
                '<button id="changePlayers" class="ghost">参加者変更</button>' +
                '<button id="wwBackToLobby" class="ghost">ロビーに戻る</button>' +
                '</div>'
            : '') +
        '</div>';
    }

    var selfName = formatPlayerDisplayName(player) || '';
    if (player && player.isHost && (phase === 'lobby' || phase === 'finished')) {
      selfName = formatPlayerMenuName(player);
    }

    var timerCardHtml = '';
    if (phase === 'discussion') {
      timerCardHtml =
        '<div class="card center" style="padding:12px">' +
        '<div class="timer" id="timer">' +
        escapeHtml(formatMMSS(remain)) +
        '</div>' +
        '</div>';
    }

    // Winner/loser background on finished (winner=red, loser=blue)
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('result-win');
        viewEl.classList.remove('result-lose');
        if (phase === 'finished') {
          var w = room && room.result && room.result.winner ? String(room.result.winner) : '';
          if ((role === 'minority' || role === 'majority') && (w === 'minority' || w === 'majority')) {
            viewEl.classList.add(role === w ? 'result-win' : 'result-lose');
          }
        }
      }
    } catch (e) {
      // ignore
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      ' +
        '\n      <div class="row" style="justify-content:space-between;align-items:center">' +
        '<div class="big">' +
        escapeHtml(selfName) +
        '</div>' +
        headerRightHtml +
        '</div>\n\n      <div class="ww-word-card">\n        <div class="ww-word-label">あなたのワード</div>\n        ' +
        wordHtml +
        '\n      </div>\n\n      ' +
        (timerCardHtml || '') +
        '\n\n      ' +
        votingHtml +
        guessHtml +
        judgeHtml +
        finishedHtml +
        voteResultHtml +
        voteRevealModalHtml +
        guessJudgeModalHtml +
        '\n\n      <div class="row">' +
        (isHost && phase === 'voting' && isVotingComplete(room) ? '<button id="revealNext" class="primary">結果発表</button>' : '') +
        '</div>\n    </div>\n  '
    );
  }

  function renderWordwolfTable(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';
    var isHost = !!opts.isHost;

    var phase = (room && room.phase) || 'lobby';

    var players = (room && room.players) || {};
    var activePlayers = [];
    try {
      var playerKeys = Object.keys(players);
      for (var i = 0; i < playerKeys.length; i++) {
        var id = playerKeys[i];
        var p = players[id];
        if (!p || p.role === 'spectator') continue;
        activePlayers.push({ id: id, name: formatPlayerDisplayName(p) });
      }
      activePlayers.sort(function (a, b) {
        var pa = players[a.id] || {};
        var pb = players[b.id] || {};
        return (pa.joinedAt || 0) - (pb.joinedAt || 0);
      });
    } catch (eP) {
      activePlayers = [];
    }

    var endAt = room && room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
    var remain = phase === 'discussion' ? Math.max(0, Math.floor((endAt - serverNowMs()) / 1000)) : 0;

    var statusShort = '';
    if (phase === 'lobby') statusShort = '待機中';
    else if (phase === 'discussion') statusShort = 'トーク中';
    else if (phase === 'voting') statusShort = '投票中';
    else if (phase === 'guess') statusShort = '推理入力';
    else if (phase === 'reveal') statusShort = '結果発表';
    else if (phase === 'judge') statusShort = '判定';
    else if (phase === 'finished') statusShort = '終了';

    var votesObj = (room && room.votes) || {};

    // Reveal panel (phase=reveal): show voted-out player or tie candidates.
    var revealPanelHtml = '';
    if (phase === 'reveal') {
      try {
        var rv = (room && room.reveal) || {};
        var tie = rv && Array.isArray(rv.tieCandidates) ? rv.tieCandidates : null;
        if (tie && tie.length > 1) {
          var names = [];
          for (var ti0 = 0; ti0 < tie.length; ti0++) {
            var pid0 = String(tie[ti0] || '');
            if (!pid0) continue;
            names.push(players && players[pid0] ? formatPlayerDisplayName(players[pid0]) : pid0);
          }
          revealPanelHtml =
            '<div class="card" style="padding:12px">' +
            '<div class="big">投票結果：同票</div>' +
            '<div class="muted">ゲームマスターが選択します</div>' +
            '<div class="card center" style="padding:14px;margin-top:10px"><div class="big">' +
            escapeHtml(names.join(' / ') || '-') +
            '</div></div>' +
            (isHost
              ? '<div class="row" style="margin-top:12px;gap:8px">' +
                '<button id="wwTableTieRevote" class="primary" style="flex:1">再投票する</button>' +
                '<button id="wwTableTieMinorityWin" class="danger" style="flex:1">少数側の勝ち</button>' +
                '</div>'
              : '') +
            '</div>';
        } else {
          var outId = rv && rv.votedOutId ? String(rv.votedOutId) : '';
          var outName = outId && players && players[outId] ? formatPlayerDisplayName(players[outId]) : outId;
          revealPanelHtml =
            '<div class="card" style="padding:12px">' +
            '<div class="big">投票結果</div>' +
            '<div class="muted">最多票</div>' +
            '<div class="card center" style="padding:14px;margin-top:10px"><div class="big">' +
            escapeHtml(outName || '-') +
            '</div></div>' +
            (isHost ? '<div class="row" style="margin-top:12px"><button id="wwTableVoteRevealNext" class="primary" style="width:100%">次へ</button></div>' : '') +
            '</div>';
        }
      } catch (eRv) {
        revealPanelHtml = '';
      }
    }

    // Judge panel (phase=judge): show minority guesses and let GM decide.
    var judgePanelHtml = '';
    if (phase === 'judge') {
      try {
        var guessesObjJ = (room && room.guess && room.guess.guesses) || {};
        var gKeysJ = Object.keys(guessesObjJ);
        var uniqJ = {};
        var uniqListJ = [];
        for (var giJ = 0; giJ < gKeysJ.length; giJ++) {
          var entryJ = guessesObjJ[gKeysJ[giJ]];
          var txtJ = entryJ && entryJ.text ? String(entryJ.text).trim() : '';
          if (!txtJ) continue;
          var keyJ = txtJ.toLowerCase();
          if (uniqJ[keyJ]) continue;
          uniqJ[keyJ] = true;
          uniqListJ.push(txtJ);
        }
        judgePanelHtml =
          '<div class="card" style="padding:12px">' +
          '<div class="big">少数側の推測</div>' +
          '<div class="card center" style="padding:14px;margin-top:10px"><div class="big">' +
          escapeHtml(uniqListJ.length ? uniqListJ.join(' / ') : '-') +
          '</div></div>' +
          (isHost
            ? '<div class="row" style="gap:8px;margin-top:12px">' +
              '<button id="wwTableDecideMinority" class="primary" style="flex:1">少数側の勝ち</button>' +
              '<button id="wwTableDecideMajority" class="danger" style="flex:1">多数側の勝ち</button>' +
              '</div>'
            : '') +
          '</div>';
      } catch (eGj) {
        judgePanelHtml = '';
      }
    }

    // Voting status (who has voted)
    var voteStatusHtml = '';
    if (phase === 'voting') {
      var voteStatusRows = '';
      var votedCount = 0;
      for (var vsi = 0; vsi < activePlayers.length; vsi++) {
        var apv = activePlayers[vsi];
        var hasVoted = !!(votesObj && votesObj[apv.id] && votesObj[apv.id].to);
        if (hasVoted) votedCount++;
        voteStatusRows +=
          '<div class="kv"><span class="muted">' +
          escapeHtml(apv.name) +
          '</span><b>' +
          (hasVoted ? '投票済' : '未投票') +
          '</b></div>';
      }
      voteStatusHtml =
        '<div class="card" style="padding:12px">' +
        '<div class="big">投票状況</div>' +
        '<div class="muted">' +
        votedCount +
        '/' +
        activePlayers.length +
        '</div>' +
        '<div class="stack" style="margin-top:8px">' +
        voteStatusRows +
        '</div>' +
        '</div>';
    }

    // Vote result (tally) after reveal and later
    var voteResultHtml = '';
    try {
      var canShowVoteResult = !!(room && room.reveal && room.reveal.revealedAt);
      if (canShowVoteResult && (phase === 'guess' || phase === 'judge' || phase === 'finished' || phase === 'reveal')) {
        var counts = {};
        var voteKeys = Object.keys(votesObj);
        for (var vki = 0; vki < voteKeys.length; vki++) {
          var vid = voteKeys[vki];
          var v = votesObj[vid];
          if (!v || !v.to) continue;
          counts[v.to] = (counts[v.to] || 0) + 1;
        }
        var tally = [];
        for (var ai = 0; ai < activePlayers.length; ai++) {
          var ap = activePlayers[ai];
          tally.push({ id: ap.id, name: ap.name, count: counts[ap.id] || 0 });
        }
        tally.sort(function (a, b) {
          return b.count - a.count;
        });
        var rows = '';
        for (var ti = 0; ti < tally.length; ti++) {
          var r = tally[ti];
          rows += '<div class="kv"><span class="muted">' + escapeHtml(r.name) + '</span><b>' + r.count + '</b></div>';
        }
        voteResultHtml =
          '<div class="card" style="padding:12px">' +
          '<div class="big">投票結果</div>' +
          '<div class="stack" style="margin-top:8px">' +
          rows +
          '</div>' +
          '</div>';
      }
    } catch (eT) {
      voteResultHtml = '';
    }

    // Result (winner only; do not show words/roles)
    var finishedHtml = '';
    if (phase === 'finished') {
      var winner = (room && room.result && room.result.winner) || '';
      var winnerLabel = winner === 'minority' ? '少数側の勝ち' : winner === 'majority' ? '多数側の勝ち' : '未確定';
      finishedHtml =
        '<div class="card" style="padding:12px">' +
        '<div class="big">結果</div>' +
        '<div class="muted">勝者</div>' +
        '<div class="big">' +
        escapeHtml(winnerLabel) +
        '</div>' +
        '</div>';
    }

    // Timer card
    var timerCardHtml = '';
    if (phase === 'discussion') {
      timerCardHtml =
        '<div class="card center" style="padding:12px">' +
        '<div class="muted" style="margin-bottom:6px">残り時間</div>' +
        '<div class="timer" id="wwTableTimer" style="font-size:96px;line-height:1">' +
        escapeHtml(formatMMSS(remain)) +
        '</div>' +
        '</div>';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="row" style="justify-content:space-between;align-items:center">' +
        '<div class="big">ワードウルフ修正済み（テーブル用）</div>' +
        '<div class="muted" style="text-align:right">' +
        escapeHtml(statusShort || '') +
        '</div>' +
        '</div>' +
        (timerCardHtml || '') +
        (revealPanelHtml || '') +
        (judgePanelHtml || '') +
        (voteStatusHtml || '') +
        (voteResultHtml || '') +
        (finishedHtml || '') +
        (phase === 'voting' && isHost && isVotingComplete(room)
          ? '<div class="row"><button id="wwTableRevealNext" class="primary" style="width:100%">結果発表</button></div>'
          : '') +
        (lobbyId && phase === 'finished' && isHost
          ? '<div class="row"><button id="wwTableNextToLobby" class="primary" style="width:100%">次へ</button></div>'
          : '') +
        '\n    </div>\n  '
    );
  }

  // -------------------- main (router) --------------------
  var viewEl = null;

  function makeJoinUrl(roomId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.room = roomId;
    return baseUrl() + '?' + buildQuery(q);
  }

  function makeHostUrl(roomId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.room = roomId;
    q.host = '1';
    return baseUrl() + '?' + buildQuery(q);
  }

  function routeHome() {
    setHeaderLobbyId('');

    // Allow forcing the home screen even on a previously restricted participant device.
    // Usage: add ?home=1 (or ?forceHome=1) to the URL.
    var forceHome = false;
    try {
      var qForce = parseQuery();
      if (qForce && (String(qForce.home || '') === '1' || String(qForce.forceHome || '') === '1')) {
        forceHome = true;
        try {
          setActiveLobby('', false);
        } catch (eForce2) {
          // ignore
        }
      }
    } catch (eForce1) {
      forceHome = false;
    }

    // QR参加者はホームに戻れない（待機画面へ戻す）
    try {
      var activeLobbyId = loadActiveLobbyId();
      if (!forceHome && activeLobbyId && isRestrictedDevice()) {
        var q0 = {};
        var v0 = getCacheBusterParam();
        if (v0) q0.v = v0;
        q0.lobby = activeLobbyId;
        q0.screen = 'lobby_player';
        setQuery(q0);
        route();
        return;
      }
    } catch (e0) {
      // ignore
    }

    renderHome(viewEl);

    var btnJoin = document.getElementById('homeCreateJoin');
    var btnGm = document.getElementById('homeCreateGm');

    var btnRelay = document.getElementById('homeOekakiRelay');
    if (btnRelay) {
      btnRelay.addEventListener('click', function () {
        var qR = {};
        var vR = getCacheBusterParam();
        if (vR) qR.v = vR;
        qR.screen = 'oekaki_relay_create';
        setQuery(qR);
        route();
      });
    }

    var unsubLobbies = null;

    function stopLobbiesWatch() {
      try {
        if (unsubLobbies) {
          unsubLobbies();
          unsubLobbies = null;
        }
      } catch (eU) {
        unsubLobbies = null;
      }
    }

    // 進行中ロビーの一覧をライブ表示（QRなしで後から参加できる入口）。
    var prunedOnce = false;
    firebaseReady()
      .then(function () {
        return onValue('lobbies/_index', function (all) {
          try {
            renderHomeLobbiesList(all);
          } catch (eR) {
            // ignore
          }
          if (!prunedOnce) {
            prunedOnce = true;
            try {
              pruneLobbyIndex(all);
            } catch (eP) {
              // ignore
            }
          }
        });
      })
      .then(function (u) {
        unsubLobbies = u;
      })
      .catch(function () {
        // Firebase未設定などは無視（一覧非表示のまま）
      });

    var lobbiesBox = document.getElementById('homeLobbies');
    if (lobbiesBox && !lobbiesBox.__home_bound) {
      lobbiesBox.__home_bound = true;
      lobbiesBox.addEventListener('click', function (ev) {
        var t = ev && ev.target ? ev.target : null;
        while (t && t !== lobbiesBox && !(t.getAttribute && t.getAttribute('data-lobby'))) {
          t = t.parentNode;
        }
        if (!t || t === lobbiesBox) return;
        var lobbyId2 = String(t.getAttribute('data-lobby') || '');
        var mode = String(t.getAttribute('data-mode') || 'join');
        if (!lobbyId2) return;

        stopLobbiesWatch();

        var q2 = {};
        var v2 = getCacheBusterParam();
        if (v2) q2.v = v2;
        q2.lobby = lobbyId2;

        if (mode === 'host') {
          // このロビーの作成者だった端末: ホスト画面で再開する。
          try {
            setActiveLobby('', false);
          } catch (eH0) {
            // ignore
          }
          q2.screen = 'lobby_host';
        } else if (mode === 'rejoin') {
          // すでにメンバー登録済みの端末: 名前入力なしで待機画面へ（進行中なら自動でゲームへ）。
          setActiveLobby(lobbyId2, true);
          q2.screen = 'lobby_player';
        } else {
          // 新規参加: QRを読み取ったときと同じ導線。
          q2.screen = 'lobby_join';
        }

        setQuery(q2);
        route();
      });
    }

    function disableHomeButtons(disabled) {
      try {
        if (btnJoin) btnJoin.disabled = !!disabled;
        if (btnGm) btnGm.disabled = !!disabled;
      } catch (e) {
        // ignore
      }
    }

    function startCreate(isGmDevice, joinAsMember, tableGmDevice) {
      disableHomeButtons(true);
      stopLobbiesWatch();

      // If this device was previously a restricted participant, clear it before creating a new lobby.
      // (Otherwise the host can be forced back to a waiting screen.)
      try {
        setActiveLobby('', false);
      } catch (e0) {
        // ignore
      }

      var nm = loadPersistedName();
      if (!nm) nm = 'GM';

      firebaseReady()
        .then(function () {
          return createLobbyWithRetry(nm, !!isGmDevice, joinAsMember == null ? true : !!joinAsMember);
        })
        .then(function (res) {
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.lobby = res.lobbyId;
          q.gmdev = tableGmDevice ? '1' : '0';
          q.screen = 'lobby_host';
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '作成に失敗しました');
        })
        .finally(function () {
          disableHomeButtons(false);
        });
    }

    if (btnJoin && !btnJoin.__home_bound) {
      btnJoin.__home_bound = true;
      btnJoin.addEventListener('click', function () {
        // Creator should always be treated as GM-capable device.
        startCreate(true, true, false);
      });
    }

    if (btnGm && !btnGm.__home_bound) {
      btnGm.__home_bound = true;
      btnGm.addEventListener('click', function () {
        // Table-GM device: do not join as a participant.
        startCreate(true, false, true);
      });
    }

    window.addEventListener('popstate', function () {
      stopLobbiesWatch();
    });
  }

  // Love Letter: debug table simulation (no Firebase)
  function routeLoveLetterSimTable() {
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.add('ll-table-screen');
      }
    } catch (e0) {
      // ignore
    }

    var sim = window.__ll_sim_state || null;

    function initSim() {
      var ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
      var players = {};
      for (var i = 0; i < ids.length; i++) {
        players[ids[i]] = { name: 'P' + String(i + 1), joinedAt: serverNowMs(), lastSeenAt: serverNowMs() };
      }
      var deck = llShuffle(llBuildDeck({ extraCards: [] }));
      var grave = [];
      // Match production: discard 1 face-down before dealing.
      if (deck.length) grave.push(String(deck.pop()));
      var eliminated = {};
      for (var k = 0; k < ids.length; k++) eliminated[ids[k]] = false;

      var hands = {};
      for (var h = 0; h < ids.length; h++) {
        hands[ids[h]] = [];
        if (deck.length) hands[ids[h]].push(String(deck.pop()));
      }

      // Start player draws 2nd card (like production).
      var startId = ids[0];
      if (startId && hands[startId] && deck.length) hands[startId].push(String(deck.pop()));
      sim = {
        room: {
          createdAt: serverNowMs(),
          phase: 'playing',
          settings: { extraCards: [] },
          players: players,
          round: {
            no: 1,
            state: 'playing',
            order: ids.slice(),
            currentIndex: 0,
            currentPlayerId: ids[0],
            deck: deck,
            grave: grave,
            hands: hands,
            eliminated: eliminated,
            reveal: null
          },
          result: null
        }
      };
      window.__ll_sim_state = sim;
    }

    function listAlive(order, eliminatedMap) {
      var out = [];
      for (var i = 0; i < order.length; i++) {
        var id = String(order[i] || '');
        if (!id) continue;
        if (eliminatedMap && eliminatedMap[id]) continue;
        out.push(id);
      }
      return out;
    }

    function advanceOne() {
      if (!sim) initSim();
      var room = sim.room;
      var r = room.round;
      var order = Array.isArray(r.order) ? r.order : [];
      var eliminated = r.eliminated || {};
      var hands = r.hands || {};

      var alive = listAlive(order, eliminated);
      if (alive.length <= 1 || !(r.deck && r.deck.length)) {
        room.phase = 'finished';
        room.result = { winners: alive.slice(0, 1) };
        r.reveal = null;
        return;
      }

      var actor = r.currentPlayerId;
      if (!actor || eliminated[actor]) actor = alive[0];

      var candidates = [];
      for (var i2 = 0; i2 < alive.length; i2++) {
        if (alive[i2] !== actor) candidates.push(alive[i2]);
      }
      var target = candidates.length ? candidates[randomInt(candidates.length)] : actor;
      // Sometimes target self (to verify the solo highlight).
      if (randomInt(5) === 0) target = actor;

      function draw1() {
        if (r.deck && r.deck.length) return String(r.deck.pop());
        return String(1 + randomInt(8));
      }

      // Rough hand simulation: actor draws 1, discards 1 at random.
      try {
        var h0 = hands && Array.isArray(hands[actor]) ? hands[actor].slice() : [];
        h0.push(draw1());
        if (h0.length > 1) {
          var di = randomInt(h0.length);
          var disc = String(h0.splice(di, 1)[0] || '');
          if (disc) {
            if (!Array.isArray(r.grave)) r.grave = [];
            r.grave.push(disc);
          }
        }
        // Keep at most 2 cards for readability.
        while (h0.length > 2) h0.shift();
        hands[actor] = h0;
        r.hands = hands;
      } catch (eH0) {
        // ignore
      }

      // Occasionally eliminate to test the hatch styling.
      if (target && randomInt(4) === 0) {
        eliminated[target] = true;
        try {
          if (hands) hands[target] = [];
          r.hands = hands;
        } catch (eEl0) {
          // ignore
        }
      }
      r.eliminated = eliminated;

      r.reveal = target ? { type: 'sim', by: actor, target: target } : null;

      var idx = -1;
      for (var j2 = 0; j2 < order.length; j2++) {
        if (String(order[j2]) === String(actor)) {
          idx = j2;
          break;
        }
      }
      var nextIndex = idx;
      for (var step = 0; step < order.length; step++) {
        nextIndex = (nextIndex + 1) % order.length;
        var nid = String(order[nextIndex] || '');
        if (nid && !eliminated[nid]) {
          r.currentIndex = nextIndex;
          r.currentPlayerId = nid;
          break;
        }
      }
    }

    function renderSim() {
      if (!sim) initSim();
      render(
        viewEl,
        '\n    <div class="stack">\n      <div class="big">ラブレター（デバッグ）テーブルシミュレーション</div>\n      <div class="row" style="justify-content:center">\n        <button id="llSimStep" class="primary">1ターン進める</button>\n        <button id="llSimReset" class="ghost">リセット</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n      <section id="llSimView"></section>\n      <div class="big" style="margin-top:10px">各プレイヤー手札（確認用）</div>\n      <section id="llSimHands"></section>\n    </div>\n  '
      );

      var inner = document.getElementById('llSimView');
      if (inner) {
        renderLoveLetterTable(inner, { roomId: 'SIM', room: sim.room, isHost: true, lobbyId: '' });
        updateLoveLetterTableEffectArrow(inner, sim.room);
      }

      var handsEl = document.getElementById('llSimHands');
      if (handsEl) {
        var room = sim.room;
        var r = room && room.round ? room.round : {};
        var ps = (room && room.players) || {};
        var order = Array.isArray(r.order) ? r.order : [];
        var hands = r.hands || {};
        var eliminated = r.eliminated || {};
        var html = '<div class="row" style="flex-wrap:wrap;gap:10px;justify-content:center">';
        for (var i = 0; i < order.length; i++) {
          var pid = String(order[i] || '');
          if (!pid) continue;
          var nm = ps[pid] ? formatPlayerDisplayName(ps[pid]) : pid;
          var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
          var cards = '';
          for (var j = 0; j < h.length; j++) {
            var rank = String(h[j] || '');
            var d = llCardDef(rank);
            var icon = d && d.icon ? String(d.icon) : '';
            if (icon) {
              cards += '<img alt="' + escapeHtml(d.name || '') + '" src="' + escapeHtml(icon) + '" style="width:54px;height:72px;object-fit:contain;border-radius:10px;border:1px solid var(--line);background:#0f1520" />';
            } else {
              cards += '<div style="width:54px;height:72px;border-radius:10px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center">' + escapeHtml(rank || '-') + '</div>';
            }
          }
          if (!cards) cards = '<div class="muted">（なし）</div>';
          html +=
            '<div class="card" style="padding:10px;min-width:170px">' +
            '<div class="row" style="justify-content:space-between;align-items:center">' +
            '<b>' +
            escapeHtml(nm) +
            '</b>' +
            (eliminated && eliminated[pid] ? '<span class="badge">脱落</span>' : '') +
            '</div>' +
            '<div class="row" style="gap:8px;justify-content:center;margin-top:8px">' +
            cards +
            '</div>' +
            '</div>';
        }
        html += '</div>';
        handsEl.innerHTML = html;
      }

      var stepBtn = document.getElementById('llSimStep');
      if (stepBtn && !stepBtn.__ll_bound) {
        stepBtn.__ll_bound = true;
        stepBtn.addEventListener('click', function () {
          advanceOne();
          renderSim();
        });
      }

      var resetBtn = document.getElementById('llSimReset');
      if (resetBtn && !resetBtn.__ll_bound) {
        resetBtn.__ll_bound = true;
        resetBtn.addEventListener('click', function () {
          window.__ll_sim_state = null;
          sim = null;
          renderSim();
        });
      }
    }

    renderSim();
  }

  // Hannin: debug table simulation (no Firebase)
  function routeHanninSimTable() {
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.add('ll-table-screen');
      }
    } catch (e0) {
      // ignore
    }

    var sim = window.__hn_sim_state || null;

    function initSim() {
      var ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
      var players = {};
      for (var i = 0; i < ids.length; i++) {
        players[ids[i]] = { name: 'P' + String(i + 1), joinedAt: serverNowMs(), lastSeenAt: serverNowMs() };
      }

      var deck = hnBuildDeck(ids.length);
      deck = hnShuffle(deck);

      var hands = {};
      var idx = 0;
      for (var h = 0; h < ids.length; h++) {
        hands[ids[h]] = [String(deck[idx++]), String(deck[idx++]), String(deck[idx++]), String(deck[idx++])];
      }

      var used = {};
      for (var u = 0; u < ids.length; u++) used[ids[u]] = [];

      var firstPid = hnFindFirstHolder(ids, hands);
      var firstIdx = ids.indexOf(String(firstPid || ''));
      if (firstIdx < 0) firstIdx = 0;

      sim = {
        room: {
          createdAt: serverNowMs(),
          phase: 'playing',
          settings: {},
          players: players,
          state: {
            order: ids.slice(),
            hands: hands,
            graveyard: [],
            used: used,
            turn: { index: firstIdx, playerId: String(ids[firstIdx] || '') },
            started: false,
            turnCount: 0,
            pending: null,
            waitFor: null,
            lastPlay: { at: 0, playerId: '', cardId: '' },
            result: { side: '', winners: [], culpritId: '', decidedAt: 0, reason: '' },
            allies: {},
            log: ['配布しました。第一発見者の番です（第一発見者を使用して開始）']
          },
          result: null
        }
      };
      window.__hn_sim_state = sim;
    }

    function advanceOne() {
      if (!sim) initSim();
      var room = sim.room;
      var st = room && room.state ? room.state : {};
      if (String(room.phase || '') === 'finished') return;
      if (st && st.result && st.result.decidedAt) {
        room.phase = 'finished';
        return;
      }

      var order = Array.isArray(st.order) ? st.order : [];
      var hands = st.hands || {};
      if (!order.length) return;

      function handCount(pid) {
        var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
        return h.length || 0;
      }

      function pickOtherPid(actorPid) {
        var a = String(actorPid || '');
        if (!a) return '';
        for (var i = 0; i < order.length; i++) {
          var pid = String(order[i] || '');
          if (!pid) continue;
          if (pid === a) continue;
          if (handCount(pid) <= 0) continue;
          return pid;
        }
        // Fallback: any other pid
        for (var j = 0; j < order.length; j++) {
          var pid2 = String(order[j] || '');
          if (!pid2) continue;
          if (pid2 === a) continue;
          return pid2;
        }
        return '';
      }

      function ensureLog() {
        if (!Array.isArray(st.log)) st.log = [];
      }

      function ensurePrivate() {
        if (!st.private || typeof st.private !== 'object') st.private = {};
      }

      function advanceTurnFrom(pid0) {
        st.turn = hnNextTurnSkipEmpty(order, String(pid0 || ''), hands);
      }

      // If waiting for an acknowledgement, resolve it in this step.
      try {
        if (st.waitFor && st.waitFor.type) {
          var wf = st.waitFor;
          st.waitFor = null;
          // Clear old overlays after acknowledgement.
          try {
            st.private = {};
          } catch (eClrPriv) {
            // ignore
          }
          ensureLog();
          st.log = st.log.concat(['（デバッグ）確認完了']);
          var by = wf && wf.by ? String(wf.by || '') : '';
          if (by && st.turn && String(st.turn.playerId || '') === by) {
            advanceTurnFrom(by);
          }
          room.state = st;
          return;
        }
      } catch (eWf) {
        // ignore
      }

      // If a pending group effect exists, resolve it in this step.
      try {
        if (st.pending && st.pending.type) {
          var pending = st.pending;
          var type = String(pending.type || '');
          var resumeFrom = String((pending && (pending.resumeFrom || pending.actorId)) || '');

          ensureLog();

          if (type === 'deal') {
            var aPid = String(pending.actorId || '');
            var tPid = String(pending.targetPid || '');
            var aHand = aPid && hands && Array.isArray(hands[aPid]) ? hands[aPid].slice() : [];
            var tHand = tPid && hands && Array.isArray(hands[tPid]) ? hands[tPid].slice() : [];
            if (aPid && tPid && aHand.length && tHand.length) {
              var ai = randomInt(aHand.length);
              var ti = randomInt(tHand.length);
              var give = String(aHand.splice(ai, 1)[0] || '');
              var take = String(tHand.splice(ti, 1)[0] || '');
              aHand.push(take);
              tHand.push(give);
              hands[aPid] = aHand;
              hands[tPid] = tHand;
              st.hands = hands;
              st.log = st.log.concat(['取引：交換しました']);
            } else {
              st.log = st.log.concat(['取引：交換できませんでした']);
            }
            st.pending = null;
            if (resumeFrom) advanceTurnFrom(resumeFrom);
            room.state = st;
            return;
          }

          if (type === 'info') {
            // Each player passes 1 random card to left neighbor.
            var snapshot = {};
            for (var s0 = 0; s0 < order.length; s0++) {
              var p0 = String(order[s0] || '');
              snapshot[p0] = hands && Array.isArray(hands[p0]) ? hands[p0].slice() : [];
            }

            var giveCard = {};
            for (var g0 = 0; g0 < order.length; g0++) {
              var pG = String(order[g0] || '');
              var hG = snapshot[pG] || [];
              if (!hG.length) continue;
              var pickIdx = randomInt(hG.length);
              giveCard[pG] = String(hG[pickIdx] || '');
              hG.splice(pickIdx, 1);
              snapshot[pG] = hG;
            }

            // Apply removals
            for (var r0 = 0; r0 < order.length; r0++) {
              var pR = String(order[r0] || '');
              hands[pR] = snapshot[pR] ? snapshot[pR].slice() : [];
            }

            // Give to left
            for (var l0 = 0; l0 < order.length; l0++) {
              var pL = String(order[l0] || '');
              var left = hnLeftPid(order, pL);
              var c = giveCard[pL] ? String(giveCard[pL] || '') : '';
              if (!left || !c) continue;
              var lh = hands[left] ? hands[left].slice() : [];
              lh.push(c);
              hands[left] = lh;
            }

            st.hands = hands;
            st.pending = null;
            st.log = st.log.concat(['情報操作：全員が左隣へ1枚渡した']);
            if (resumeFrom) advanceTurnFrom(resumeFrom);
            room.state = st;
            return;
          }

          if (type === 'rumor') {
            // Each player draws 1 random facedown card from right neighbor who has cards.
            function rightWithCards(snapshotHands, fromPid) {
              var from = String(fromPid || '');
              var startIdx = order.indexOf(from);
              if (startIdx < 0) return '';
              for (var step = 1; step < order.length; step++) {
                var cand = String(order[(startIdx + step) % order.length] || '');
                if (!cand) continue;
                var h0 = snapshotHands && Array.isArray(snapshotHands[cand]) ? snapshotHands[cand] : [];
                if (h0.length) return cand;
              }
              return '';
            }

            var snapshot2 = {};
            for (var s1 = 0; s1 < order.length; s1++) {
              var p1 = String(order[s1] || '');
              snapshot2[p1] = hands && Array.isArray(hands[p1]) ? hands[p1].slice() : [];
            }

            var requestsByTarget = {};
            for (var rq = 0; rq < order.length; rq++) {
              var actor = String(order[rq] || '');
              if (!actor) continue;
              var rpid = rightWithCards(snapshot2, actor);
              var sh = rpid ? (snapshot2[rpid] || []) : [];
              if (!rpid || !sh.length) continue;
              var pickIdx2 = randomInt(sh.length);
              if (!requestsByTarget[rpid]) requestsByTarget[rpid] = [];
              requestsByTarget[rpid].push({ actor: actor, idx: pickIdx2 });
            }

            var nextHands = {};
            for (var s2 = 0; s2 < order.length; s2++) {
              var p2 = String(order[s2] || '');
              nextHands[p2] = snapshot2[p2] ? snapshot2[p2].slice() : [];
            }

            var takenByActor = {};
            for (var t0 = 0; t0 < order.length; t0++) {
              var targetPid = String(order[t0] || '');
              var reqs = requestsByTarget[targetPid] || [];
              if (!reqs.length) continue;
              reqs.sort(function (a, b) {
                return parseIntSafe(b.idx, 0) - parseIntSafe(a.idx, 0);
              });
              var real = nextHands[targetPid] ? nextHands[targetPid].slice() : [];
              for (var q0 = 0; q0 < reqs.length; q0++) {
                var rr = reqs[q0];
                var ix = parseIntSafe(rr.idx, -1);
                if (ix < 0 || ix >= real.length) continue;
                var card = String(real.splice(ix, 1)[0] || '');
                if (card) takenByActor[String(rr.actor || '')] = card;
              }
              nextHands[targetPid] = real;
            }

            for (var g1 = 0; g1 < order.length; g1++) {
              var pG2 = String(order[g1] || '');
              var tk = takenByActor[pG2] ? String(takenByActor[pG2] || '') : '';
              if (!tk) continue;
              var hh = nextHands[pG2] ? nextHands[pG2].slice() : [];
              hh.push(tk);
              nextHands[pG2] = hh;
            }

            st.hands = nextHands;
            hands = nextHands;
            st.pending = null;
            st.log = st.log.concat(['うわさ：全員が右隣から1枚引いた']);
            if (resumeFrom) advanceTurnFrom(resumeFrom);
            room.state = st;
            return;
          }

          // Unknown pending: cancel.
          st.pending = null;
          if (resumeFrom) advanceTurnFrom(resumeFrom);
          room.state = st;
          return;
        }
      } catch (ePend) {
        // ignore
      }

      // Find current actor (or next with cards).
      var actor = st.turn && st.turn.playerId ? String(st.turn.playerId || '') : '';
      if (!actor) actor = String(order[0] || '');
      if (!actor || handCount(actor) <= 0) {
        for (var i = 0; i < order.length; i++) {
          var pid = String(order[i] || '');
          if (pid && handCount(pid) > 0) {
            actor = pid;
            st.turn = { index: i, playerId: pid };
            break;
          }
        }
      }

      if (!actor || handCount(actor) <= 0) {
        room.phase = 'finished';
        room.result = { winners: [] };
        return;
      }

      // Auto play: choose a legal card and apply simplified rules.
      var h0 = hands && Array.isArray(hands[actor]) ? hands[actor].slice() : [];
      if (!h0.length) {
        advanceTurnFrom(actor);
        room.state = st;
        return;
      }

      function isLegalCard(cardId) {
        var cid = String(cardId || '');
        if (!cid) return false;
        if (!st.started && cid !== 'first') return false;
        if (cid === 'detective' && st.started) {
          var tc = parseIntSafe(st.turnCount, 0);
          if (order && order.length && tc < order.length) return false;
        }
        if (cid === 'culprit') {
          if (h0.length !== 1) return false;
        }
        return true;
      }

      var legalIdx = [];
      for (var ci = 0; ci < h0.length; ci++) {
        if (isLegalCard(h0[ci])) legalIdx.push(ci);
      }

      // If current actor has no legal card, move to next player who does.
      if (!legalIdx.length) {
        for (var step2 = 1; step2 <= order.length; step2++) {
          var candPid = String(order[(order.indexOf(actor) + step2 + order.length) % order.length] || '');
          if (!candPid) continue;
          var hh0 = hands && Array.isArray(hands[candPid]) ? hands[candPid] : [];
          if (!hh0.length) continue;
          var hasLegal = false;
          for (var k0 = 0; k0 < hh0.length; k0++) {
            var cid0 = String(hh0[k0] || '');
            // evaluate in that player's context
            if (!st.started && cid0 !== 'first') continue;
            if (cid0 === 'detective' && st.started) {
              var tc2 = parseIntSafe(st.turnCount, 0);
              if (order && order.length && tc2 < order.length) continue;
            }
            if (cid0 === 'culprit' && hh0.length !== 1) continue;
            hasLegal = true;
            break;
          }
          if (hasLegal) {
            actor = candPid;
            st.turn = { index: order.indexOf(actor), playerId: actor };
            h0 = hh0.slice();
            legalIdx = [];
            for (var k1 = 0; k1 < h0.length; k1++) if (isLegalCard(h0[k1])) legalIdx.push(k1);
            break;
          }
        }
      }

      var pickIndex = legalIdx.length ? legalIdx[randomInt(legalIdx.length)] : 0;
      var cardId = String(h0[pickIndex] || '');
      if (!cardId) cardId = String(h0[0] || '');

      // Discard played card
      h0.splice(pickIndex, 1);
      hands[actor] = h0;
      st.hands = hands;
      if (!Array.isArray(st.graveyard)) st.graveyard = [];
      st.graveyard.push(cardId);
      if (!st.used || typeof st.used !== 'object') st.used = {};
      if (!Array.isArray(st.used[actor])) st.used[actor] = [];
      st.used[actor] = st.used[actor].concat([cardId]);

      if (typeof st.turnCount !== 'number') st.turnCount = 0;
      st.turnCount = (parseIntSafe(st.turnCount, 0) || 0) + 1;
      ensureLog();
      var nm = hnPlayerName(room, actor);
      var cardNm = (HANNIN_CARD_DEFS[cardId] ? HANNIN_CARD_DEFS[cardId].name : cardId);
      var lastPlayTo = '';
      try {
        if (cardId === 'detective' || cardId === 'dog' || cardId === 'witness' || cardId === 'deal') {
          lastPlayTo = String(pickOtherPid(actor) || '');
        }
      } catch (eLPTo) {
        lastPlayTo = '';
      }
      var line = '';
      try {
        var tnm0 = lastPlayTo ? hnPlayerName(room, lastPlayTo) : '';
        if (cardId === 'detective' || cardId === 'dog' || cardId === 'witness' || cardId === 'deal') {
          line = tnm0 ? nm + ' が ' + tnm0 + ' へ ' + cardNm + ' を使用' : nm + ' が ' + cardNm + ' を使用';
        } else {
          line = nm + ' が ' + cardNm + ' を使用';
        }
      } catch (eLPLine) {
        line = nm + ' が ' + cardNm + ' を使用';
      }
      st.log = st.log.concat([line]);
      try {
        var t0 = String(line || '');
        if (t0 && t0[t0.length - 1] !== '。') t0 += '。';
        st.lastPlay = { at: serverNowMs(), playerId: actor, cardId: cardId, to: String(lastPlayTo || ''), text: t0 };
      } catch (eLPSet) {
        st.lastPlay = { at: serverNowMs(), playerId: actor, cardId: cardId };
      }

      function finish(side, culpritId, reason) {
        st.result = { side: String(side || ''), winners: [], culpritId: String(culpritId || ''), decidedAt: serverNowMs(), reason: String(reason || '') };
        room.phase = 'finished';
      }

      // Apply simplified effects / state transitions
      if (cardId === 'first') {
        st.started = true;
        st.log = st.log.concat(['ゲーム開始']);
        advanceTurnFrom(actor);
        room.state = st;
        return;
      }

      if (cardId === 'plot') {
        if (!st.allies || typeof st.allies !== 'object') st.allies = {};
        st.allies[actor] = true;
        advanceTurnFrom(actor);
        room.state = st;
        return;
      }

      if (cardId === 'citizen' || cardId === 'alibi') {
        advanceTurnFrom(actor);
        room.state = st;
        return;
      }

      if (cardId === 'culprit') {
        finish('culprit', actor, '犯人が最後の手札「犯人」を出した');
        st.log = st.log.concat(['犯人側の勝利']);
        room.state = st;
        return;
      }

      if (cardId === 'boy') {
        st.waitFor = { type: 'private_ack', by: actor, createdAt: serverNowMs(), cardId: 'boy' };
        room.state = st;
        return;
      }

      if (cardId === 'witness') {
        // Private effect: record a witness message so the table overlay can show an arrow/icon.
        var tpW = pickOtherPid(actor);
        if (tpW && tpW !== actor) {
          ensurePrivate();
          try {
            var wCards = hands && Array.isArray(hands[tpW]) ? hands[tpW].slice() : [];
            st.private[actor] = { type: 'witness', createdAt: serverNowMs(), targetPid: tpW, cards: wCards };
          } catch (eWit) {
            st.private[actor] = { type: 'witness', createdAt: serverNowMs(), targetPid: tpW, cards: [] };
          }
          st.waitFor = { type: 'private_ack', by: actor, createdAt: serverNowMs(), cardId: 'witness' };
          room.state = st;
          return;
        }
        advanceTurnFrom(actor);
        room.state = st;
        return;
      }

      if (cardId === 'deal') {
        var tp = pickOtherPid(actor);
        if (!tp || tp === actor) {
          advanceTurnFrom(actor);
          room.state = st;
          return;
        }
        st.pending = { type: 'deal', actorId: actor, targetPid: tp, createdAt: serverNowMs(), choices: {}, resumeFrom: actor };
        st.log = st.log.concat([nm + ' は ' + hnPlayerName(room, tp) + ' と取引：双方が出すカードを選択中']);
        room.state = st;
        return;
      }

      if (cardId === 'rumor') {
        st.pending = { type: 'rumor', actorId: actor, createdAt: serverNowMs(), choices: {}, resumeFrom: actor };
        st.log = st.log.concat(['うわさ：全員が右隣から引くカードを選択中']);
        room.state = st;
        return;
      }

      if (cardId === 'info') {
        st.pending = { type: 'info', actorId: actor, createdAt: serverNowMs(), choices: {}, resumeFrom: actor };
        st.log = st.log.concat(['情報操作：全員が左隣へ渡すカードを選択中']);
        room.state = st;
        return;
      }

      if (cardId === 'detective' || cardId === 'dog') {
        var tPid = pickOtherPid(actor);
        if (!tPid || tPid === actor) {
          advanceTurnFrom(actor);
          room.state = st;
          return;
        }

        // Broadcast notice so table overlay can render actor -> target.
        ensurePrivate();
        var title0 = cardId === 'detective' ? '探偵' : 'いぬ';
        var nowN = serverNowMs();
        for (var n0 = 0; n0 < order.length; n0++) {
          var rpidN = String(order[n0] || '');
          if (!rpidN) continue;
          st.private[rpidN] = { type: 'notice', title: title0, actorPid: actor, targetPid: tPid, createdAt: nowN };
        }

        var th = hands && Array.isArray(hands[tPid]) ? hands[tPid] : [];
        var hasC = false;
        var hasA = false;
        for (var x0 = 0; x0 < th.length; x0++) {
          if (String(th[x0] || '') === 'culprit') hasC = true;
          if (String(th[x0] || '') === 'alibi') hasA = true;
        }

        if (cardId === 'detective') {
          if (hasA) {
            st.waitFor = { type: 'notice_ack', by: actor, createdAt: serverNowMs(), cardId: 'detective' };
            st.log = st.log.concat(['アリバイにより探偵の効果は無効']);
            room.state = st;
            return;
          }
          if (hasC && !hasA) {
            finish('citizen', tPid, '探偵が犯人を指摘した');
            st.log = st.log.concat(['一般人側の勝利']);
            room.state = st;
            return;
          }
          st.waitFor = { type: 'notice_ack', by: actor, createdAt: serverNowMs(), cardId: 'detective' };
          room.state = st;
          return;
        }

        if (cardId === 'dog') {
          if (hasC) {
            finish('citizen', tPid, 'いぬが犯人カードを当てた');
            st.log = st.log.concat(['一般人側の勝利']);
            room.state = st;
            return;
          }
          st.waitFor = { type: 'notice_ack', by: actor, createdAt: serverNowMs(), cardId: 'dog' };
          room.state = st;
          return;
        }
      }

      // Default: just advance.
      advanceTurnFrom(actor);
      room.state = st;
    }

    function renderHanninSimTableView(rootEl, room) {
      var players = (room && room.players) || {};
      var st = (room && room.state) || {};
      var order = Array.isArray(st.order) ? st.order : [];
      var hands = (st && st.hands) || {};
      var grave = Array.isArray(st.graveyard) ? st.graveyard : [];
      var turnPid = '';
      try {
        turnPid = st && st.turn && st.turn.playerId ? String(st.turn.playerId || '') : '';
      } catch (eT0) {
        turnPid = '';
      }

      function pname(pid) {
        var p = pid && players ? players[pid] : null;
        return p ? formatPlayerDisplayName(p) : String(pid || '-');
      }

      function handCount(pid) {
        var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
        return h.length || 0;
      }

      function handBacksHtml(pid) {
        var cnt = handCount(pid);
        var out = '';
        for (var i = 0; i < 4; i++) {
          var empty = i >= cnt;
          out += '<div class="hn-sim-handback' + (empty ? ' hn-sim-handback--empty' : '') + '">' + hnCardBackImgHtml() + '</div>';
        }
        return out;
      }

      var graveHtml = '';
      if (!grave.length) {
        graveHtml = '<div class="muted">（なし）</div>';
      } else {
        var graveCount = grave.length;
        var top = String(grave[graveCount - 1] || '');
        var layerCount = Math.min(4, graveCount);
        for (var gi = layerCount - 1; gi >= 1; gi--) {
          graveHtml +=
            '<div class="ll-table-grave-stack-card ll-table-grave-stack-card--under" style="left:' +
            String(gi * 7) +
            'px;top:' +
            String(gi * -3) +
            'px"></div>';
        }
        graveHtml += '<div class="ll-table-grave-stack-card" style="left:0px;top:0px">' + hnCardImgHtml(top) + '</div>';
      }

      var centerHtml =
        '<div class="ll-table-center">' +
        '<div class="ll-table-pile">' +
        '<div class="muted">墓地/<b>' +
        escapeHtml(String(grave.length || 0)) +
        '枚</b></div>' +
        '<div class="ll-table-grave-stack">' +
        graveHtml +
        '</div>' +
        (function () {
          var lp = '';
          try {
            var lp0 = st && st.lastPlay ? st.lastPlay : null;
            lp = lp0 && lp0.text ? String(lp0.text || '') : '';
            if (!lp) {
              var log = st && Array.isArray(st.log) ? st.log : [];
              for (var i = (log.length || 0) - 1; i >= 0; i--) {
                var s = String(log[i] || '');
                if (!s) continue;
                if (s.indexOf(' を使用') >= 0 || s.indexOf(' をプレイ') >= 0) {
                  lp = s;
                  break;
                }
              }
            }
          } catch (eLP) {
            lp = '';
          }
          if (lp && lp[lp.length - 1] !== '。') lp += '。';
          return lp ? '<div class="ll-table-lastplay ll-table-lastplay-banner" aria-live="polite">' + escapeHtml(lp) + '</div>' : '';
        })() +
        '</div>' +
        '</div>';

      var arrowHtml = '';
      var arrowIconHtml = '';
      var nSeats = order.length || 0;
      for (var ai = 0; ai < nSeats; ai++) {
        arrowHtml += '<svg class="ll-table-arrow" data-hn-arrow="' + escapeHtml(String(ai)) + '"></svg>';
        arrowIconHtml += '<div class="ll-table-arrow-icon" data-hn-arrow-icon="' + escapeHtml(String(ai)) + '"></div>';
      }

      var seatsHtml = '';
      var radius = 42;
      for (var si = 0; si < nSeats; si++) {
        var pid = String(order[si] || '');
        if (!pid) continue;
        var angle = -90 + (360 * si) / nSeats;
        var rad = (Math.PI / 180) * angle;
        var x = 50 + radius * Math.cos(rad);
        var y = 50 + radius * Math.sin(rad);
        var isTurnSeat = !!(turnPid && String(pid) === String(turnPid));
        var cnt = handCount(pid);
        var plotOn = false;
        try {
          var allies0 = st && st.allies && typeof st.allies === 'object' ? st.allies : {};
          plotOn = !!(allies0 && allies0[String(pid)]);
        } catch (ePlot0) {
          plotOn = false;
        }
        seatsHtml +=
          '<div class="ll-seat' +
          (isTurnSeat ? ' ll-seat--turn' : '') +
          '" data-hn-pid="' +
          escapeHtml(String(pid)) +
          '" data-ll-pid="' +
          escapeHtml(String(pid)) +
          '" style="left:' +
          escapeHtml(String(x.toFixed(3))) +
          '%;top:' +
          escapeHtml(String(y.toFixed(3))) +
          '%">' +
          '<div class="ll-seat-card hn-sim-seat-card">' +
          '<div class="ll-seat-name">' +
          escapeHtml(pname(pid)) +
          (plotOn ? ' <span class="badge">たくらみ中</span>' : '') +
          '</div>' +
          '<div class="hn-sim-handcount muted">手札: ' +
          escapeHtml(String(cnt)) +
          '</div>' +
          '<div class="hn-sim-handbacks">' +
          handBacksHtml(pid) +
          '</div>' +
          '</div>' +
          '</div>';
      }

      render(
        rootEl,
        '<div class="ll-table hn-table">' +
          arrowHtml +
          arrowIconHtml +
          seatsHtml +
          '<div class="ll-table-inner">' +
          centerHtml +
          '</div>' +
          '</div>'
      );
    }

    function renderSim() {
      if (!sim) initSim();
      render(
        viewEl,
        '\n    <div class="stack">\n      <div class="big">犯人は踊る（デバッグ）テーブルシミュレーション</div>\n      <div class="row" style="justify-content:center">\n        <button id="hnSimStep" class="primary">1ターン進める</button>\n        <button id="hnSimReset" class="ghost">リセット</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n      <section id="hnSimView"></section>\n    </div>\n  '
      );

      var inner = document.getElementById('hnSimView');
      if (inner) {
        renderHanninSimTableView(inner, sim.room);
        updateHanninTableEffectArrow(inner, sim.room);
      }

      var stepBtn = document.getElementById('hnSimStep');
      if (stepBtn && !stepBtn.__hn_bound) {
        stepBtn.__hn_bound = true;
        stepBtn.addEventListener('click', function () {
          advanceOne();
          renderSim();
        });
      }

      var resetBtn = document.getElementById('hnSimReset');
      if (resetBtn && !resetBtn.__hn_bound) {
        resetBtn.__hn_bound = true;
        resetBtn.addEventListener('click', function () {
          window.__hn_sim_state = null;
          sim = null;
          renderSim();
        });
      }
    }

    renderSim();
  }

  function routeLobbyLogin(lobbyId) {
    // `lobby_login` screen has been merged into `lobby_host`.
    // Keep this route for backward-compatible URLs.
    return routeLobbyHost(lobbyId);
  }

  function routeLobbyCreate() {
    renderLobbyCreate(viewEl);
    clearInlineError('lobbyCreateError');

    var btn = document.getElementById('lobbyCreateBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var form;
      try {
        clearInlineError('lobbyCreateError');
        form = readLobbyCreateForm();
      } catch (e) {
        setInlineError('lobbyCreateError', (e && e.message) || '入力を確認してください。');
        return;
      }

      savePersistedName(form.name);

      firebaseReady()
        .then(function () {
          return createLobbyWithRetry(form.name, false);
        })
        .then(function (res) {
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.lobby = res.lobbyId;
          q.gmdev = '0';
          q.screen = 'lobby_host';
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '作成に失敗しました');
        });
    });
  }

  function routeLobbyJoin(lobbyId) {
    renderLobbyJoin(viewEl, lobbyId);
    clearInlineError('lobbyJoinError');

    // Scanning a new QR should always switch this device to that lobby.
    try {
      if (lobbyId) setActiveLobby(lobbyId, true);
    } catch (eSet) {
      // ignore
    }

    // QRからの参加時はロビーIDは固定（編集させない）
    try {
      if (lobbyId) {
        var idEl0 = document.getElementById('lobbyId');
        if (idEl0) {
          idEl0.value = String(lobbyId);
          idEl0.disabled = true;
        }
      }
    } catch (e0) {
      // ignore
    }

    var btn = document.getElementById('lobbyJoinBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var form;
      try {
        clearInlineError('lobbyJoinError');
        form = readLobbyJoinForm();
      } catch (e) {
        setInlineError('lobbyJoinError', (e && e.message) || '入力を確認してください。');
        return;
      }

      savePersistedName(form.name);
      var mid = getOrCreateLobbyMemberId(form.lobbyId);

      firebaseReady()
        .then(function () {
          return joinLobbyMember(form.lobbyId, mid, form.name, false);
        })
        .then(function () {
          setActiveLobby(form.lobbyId, true);
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.lobby = form.lobbyId;
          q.screen = 'lobby_player';
          setQuery(q);
          route();
        })
        .catch(function (e) {
          setInlineError('lobbyJoinError', (e && e.message) || '参加に失敗しました');
        });
    });
  }

  function routeLobbyHost(lobbyId) {
    var unsub = null;
    var mid = getOrCreateLobbyMemberId(lobbyId);

    var isTableGmDevice = false;
    try {
      var q0 = parseQuery();
      isTableGmDevice = !!(q0 && String(q0.gmdev || '') === '1');
    } catch (e0) {
      isTableGmDevice = false;
    }
    var ui = { selectedKind: '', lastLobby: null };
    var joinUrl = makeLobbyJoinUrl(lobbyId);

    function drawQr(size) {
      var w = clamp(parseIntSafe(size, 160), 120, 240);
      return new Promise(function (resolve) {
        var canvas = document.getElementById('qr');
        var errEl = document.getElementById('qrError');
        var wrapEl = document.getElementById('qrWrap');
        if (errEl) errEl.textContent = '';

        var done = false;
        function finish() {
          if (done) return;
          done = true;
          resolve();
        }

        function setWrap(html) {
          if (!wrapEl) return;
          wrapEl.innerHTML = html;
        }

        function showFatal(msg) {
          try {
            if (errEl) errEl.textContent = String(msg || 'QRの生成に失敗しました。');
          } catch (e0) {
            // ignore
          }
          setWrap(
            '<div class="card" style="padding:10px">' +
              '<div class="form-error">' +
              escapeHtml(String(msg || 'QRの生成に失敗しました。')) +
              '</div>' +
              '<div class="muted" style="margin-top:6px">URLコピーで参加してください。</div>' +
            '</div>'
          );
          finish();
        }

        function showRemoteProviders() {
          if (!wrapEl) return finish();
          var data = String(joinUrl || '');
          var sizeStr = String(w) + 'x' + String(w);
          var srcs = [
            'https://quickchart.io/qr?size=' + encodeURIComponent(sizeStr) + '&text=' + encodeURIComponent(data),
            'https://api.qrserver.com/v1/create-qr-code/?size=' + encodeURIComponent(sizeStr) + '&data=' + encodeURIComponent(data)
          ];

          setWrap('<img id="qrImg" alt="QR" />');
          var img = wrapEl.querySelector('#qrImg');
          if (!img) return showFatal('QR表示領域が見つかりません。');
          img.referrerPolicy = 'no-referrer';

          var i = 0;
          function tryNext() {
            if (i >= srcs.length) {
              return showFatal('QR画像の読み込みに失敗しました（ネットワーク/フィルタの可能性）。');
            }
            var src = srcs[i++];
            img.onload = function () {
              try {
                if (errEl) errEl.textContent = '';
              } catch (e1) {
                // ignore
              }
              finish();
            };
            img.onerror = function () {
              tryNext();
            };
            img.src = src;
          }
          tryNext();
        }

        if (!canvas) {
          showFatal('QR表示領域が見つかりません。');
          return;
        }
        var qr = window.QRCode || window.qrcode || window.QR;
        if (!qr || !qr.toCanvas) {
          return showRemoteProviders();
        }

        function showAsImage() {
          if (!qr.toDataURL || !wrapEl) return showRemoteProviders();
          try {
            var timedOut = false;
            var t = setTimeout(function () {
              timedOut = true;
              if (done) return;
              showRemoteProviders();
            }, 1500);

            function onUrl(err, url) {
              if (done) return;
              try {
                clearTimeout(t);
              } catch (eT) {
                // ignore
              }
              if (timedOut) return;
              if (err || !url) {
                return showRemoteProviders();
              }
              setWrap('<img id="qrImg" alt="QR" src="' + escapeHtml(String(url)) + '" />');
              try {
                if (errEl) errEl.textContent = '';
              } catch (e2) {
                // ignore
              }
              finish();
            }

            var ret = null;
            try {
              ret = qr.toDataURL(joinUrl, { margin: 1, width: w, color: { dark: '#000000', light: '#ffffff' } }, onUrl);
            } catch (eCall) {
              ret = null;
            }

            // Support Promise-based toDataURL implementations.
            if (ret && typeof ret.then === 'function') {
              ret
                .then(function (url2) {
                  onUrl(null, url2);
                })
                .catch(function () {
                  if (done) return;
                  try {
                    clearTimeout(t);
                  } catch (eT2) {
                    // ignore
                  }
                  if (timedOut) return;
                  showRemoteProviders();
                });
            }
          } catch (e) {
            return showRemoteProviders();
          }
        }

        function looksBlank(c) {
          try {
            var ctx = c.getContext && c.getContext('2d');
            if (!ctx) return true;
            var cw = c.width || 0;
            var ch = c.height || 0;
            if (!cw || !ch) return true;
            var img = ctx.getImageData(0, 0, Math.min(16, cw), Math.min(16, ch)).data;
            var allZero = true;
            var allWhite = true;
            for (var i = 0; i < img.length; i += 4) {
              var r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
              if (a !== 0) allZero = false;
              if (!(a !== 0 && r > 240 && g > 240 && b > 240)) allWhite = false;
              if (!allZero && !allWhite) return false;
            }
            return allZero || allWhite;
          } catch (e) {
            return true;
          }
        }

        // Prefer <img> rendering first (some environments show blank canvas).
        return showAsImage();
      });
    }

    function redirectToLobbyPlayer() {
      try {
        if (unsub) {
          unsub();
          unsub = null;
        }
      } catch (e0) {
        // ignore
      }
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_player';
      setQuery(q);
      route();
    }

    function normalizeOrder(lobby) {
      var members = (lobby && lobby.members) || {};
      var order = (lobby && lobby.order) || [];
      if (!Array.isArray(order)) order = [];

      var seen = {};
      var out = [];

      for (var i = 0; i < order.length; i++) {
        var id = String(order[i] || '');
        if (!id) continue;
        if (seen[id]) continue;
        if (!members[id]) continue;
        seen[id] = true;
        out.push(id);
      }

      var keys = Object.keys(members);
      keys.sort();
      for (var j = 0; j < keys.length; j++) {
        var k = String(keys[j] || '');
        if (!k || seen[k]) continue;
        seen[k] = true;
        out.push(k);
      }

      return out;
    }

    function swap(order, i, j) {
      if (i === j) return order;
      if (i < 0 || j < 0) return order;
      if (i >= order.length || j >= order.length) return order;
      var a = order.slice();
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
      return a;
    }

    function shuffle(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var r = randomInt(i + 1);
        var t = a[i];
        a[i] = a[r];
        a[r] = t;
      }
      return a;
    }

    function shuffleDifferent(list) {
      var base = list.slice();
      if (base.length <= 1) return base;
      var baseKey = base.join('|');
      for (var i = 0; i < 10; i++) {
        var out = shuffle(base);
        if (out.join('|') !== baseKey) return out;
      }
      var a = base.slice();
      var t = a[0];
      a[0] = a[1];
      a[1] = t;
      return a;
    }

    function normalizeCnAssign(a) {
      var out = {};
      if (!a || typeof a !== 'object') return out;
      var keys = Object.keys(a);
      for (var i = 0; i < keys.length; i++) {
        var k = String(keys[i] || '');
        if (!k) continue;
        var v = a[k] || {};
        out[k] = { team: String(v.team || ''), role: String(v.role || '') };
      }
      return out;
    }

    function cnAssignEquals(a, b, ids) {
      var aa = normalizeCnAssign(a);
      var bb = normalizeCnAssign(b);
      var list = Array.isArray(ids) ? ids : Object.keys(assign({}, aa, bb));
      for (var i = 0; i < list.length; i++) {
        var id = String(list[i] || '');
        if (!id) continue;
        var xa = aa[id] || { team: '', role: '' };
        var xb = bb[id] || { team: '', role: '' };
        if (String(xa.team || '') !== String(xb.team || '')) return false;
        if (String(xa.role || '') !== String(xb.role || '')) return false;
      }
      return true;
    }

    function buildRandomCnAssign(ids) {
      var shuffled = shuffleDifferent(ids);
      var assignMap = {};

      // Balanced team assignment by shuffled order.
      for (var i = 0; i < shuffled.length; i++) {
        var id = String(shuffled[i] || '');
        if (!id) continue;
        assignMap[id] = { team: i % 2 === 0 ? 'red' : 'blue', role: 'operative' };
      }

      // Choose one spymaster per team.
      var redIds = [];
      var blueIds = [];
      for (var j = 0; j < shuffled.length; j++) {
        var id2 = String(shuffled[j] || '');
        if (!id2 || !assignMap[id2]) continue;
        if (assignMap[id2].team === 'red') redIds.push(id2);
        if (assignMap[id2].team === 'blue') blueIds.push(id2);
      }
      if (redIds.length) {
        var redSm = redIds[randomInt(redIds.length)];
        if (redSm && assignMap[redSm]) assignMap[redSm].role = 'spymaster';
      }
      if (blueIds.length) {
        var blueSm = blueIds[randomInt(blueIds.length)];
        if (blueSm && assignMap[blueSm]) assignMap[blueSm].role = 'spymaster';
      }

      return assignMap;
    }

    function forceDifferentCnAssign(prevAssign, ids) {
      // Guaranteed change fallback: flip one member's team (and rebuild roles validly).
      var next = normalizeCnAssign(prevAssign);

      var list = Array.isArray(ids) ? ids.slice() : Object.keys(next);
      if (list.length < 2) return buildRandomCnAssign(list);

      // Ensure all ids exist in map (so flip works even when missing)
      for (var i = 0; i < list.length; i++) {
        var id = String(list[i] || '');
        if (!id) continue;
        if (!next[id]) next[id] = { team: '', role: '' };
        if (!next[id].team) next[id].team = i % 2 === 0 ? 'red' : 'blue';
        if (!next[id].role) next[id].role = 'operative';
      }

      // Pick a member and flip their team.
      var pickId = '';
      for (var t = 0; t < list.length; t++) {
        var id2 = String(list[t] || '');
        if (!id2) continue;
        pickId = id2;
        break;
      }
      if (pickId) {
        next[pickId].team = next[pickId].team === 'red' ? 'blue' : 'red';
      }

      // Rebuild roles: all operative first
      for (var k = 0; k < list.length; k++) {
        var id3 = String(list[k] || '');
        if (!id3 || !next[id3]) continue;
        next[id3].role = 'operative';
      }

      // Assign spymasters again.
      var redIds = [];
      var blueIds = [];
      for (var m = 0; m < list.length; m++) {
        var id4 = String(list[m] || '');
        if (!id4 || !next[id4]) continue;
        if (next[id4].team === 'red') redIds.push(id4);
        if (next[id4].team === 'blue') blueIds.push(id4);
      }
      if (redIds.length) {
        var redSm = redIds[randomInt(redIds.length)];
        if (redSm && next[redSm]) next[redSm].role = 'spymaster';
      }
      if (blueIds.length) {
        var blueSm = blueIds[randomInt(blueIds.length)];
        if (blueSm && next[blueSm]) next[blueSm].role = 'spymaster';
      }
      return next;
    }

    function bindHostButtons(lobby) {
      function currentLobby() {
        return ui && ui.lastLobby ? ui.lastLobby : lobby;
      }

      var copyBtn = document.getElementById('copyJoinUrl');
      if (copyBtn && !copyBtn.__lobby_bound) {
        copyBtn.__lobby_bound = true;
        copyBtn.addEventListener('click', function () {
          var status = document.getElementById('copyStatus');
          if (status) status.textContent = '';
          copyTextToClipboard(joinUrl)
            .then(function (ok) {
              if (status) status.textContent = ok ? 'コピーしました' : 'コピーに失敗しました';
            })
            .catch(function () {
              if (status) status.textContent = 'コピーに失敗しました';
            });
        });
      }

      var updateNameBtn = document.getElementById('lobbyUpdateMyName');
      if (updateNameBtn && !updateNameBtn.__lobby_bound) {
        updateNameBtn.__lobby_bound = true;
        updateNameBtn.addEventListener('click', function () {
          var nameEl = document.getElementById('lobbyMyName');
          var name = String((nameEl && nameEl.value) || '').trim();
          if (!name) {
            setInlineError('lobbyHostError', '名前を入力してください。');
            return;
          }

          clearInlineError('lobbyHostError');
          savePersistedName(name);
          updateNameBtn.disabled = true;

          var lob = currentLobby();
          var hostMid = lob && lob.hostMid ? String(lob.hostMid) : '';
          var me = lob && lob.members && mid ? lob.members[mid] : null;
          var isGmDevice = true;
          try {
            // Preserve GM-device flag when present; treat host as GM-capable.
            isGmDevice = !!(String(hostMid) === String(mid) || (me && me.isGmDevice));
          } catch (e0) {
            isGmDevice = true;
          }

          firebaseReady()
            .then(function () {
              return joinLobbyMember(lobbyId, mid, name, isGmDevice);
            })
            .catch(function (e) {
              setInlineError('lobbyHostError', (e && e.message) || '更新に失敗しました');
            })
            .finally(function () {
              updateNameBtn.disabled = false;
            });
        });
      }

      var kindBtns = document.querySelectorAll('.bbgGameKindBtn');
      for (var kb = 0; kb < kindBtns.length; kb++) {
        var kindBtn = kindBtns[kb];
        if (!kindBtn || kindBtn.__lobby_bound) continue;
        kindBtn.__lobby_bound = true;
        kindBtn.addEventListener('click', function (evK) {
          var el = evK && evK.currentTarget ? evK.currentTarget : null;
          var k = el ? String(el.getAttribute('data-kind') || '') : '';
          if (!k) return;
          ui.selectedKind = k;
          var hid = document.getElementById('lobbyGameKind');
          if (hid) hid.value = k;
          renderWithLobby(ui.lastLobby);
        });
      }

      var shuffleOrderBtn = document.getElementById('lobbyShuffle');
      if (shuffleOrderBtn && !shuffleOrderBtn.__lobby_bound) {
        shuffleOrderBtn.__lobby_bound = true;
        shuffleOrderBtn.addEventListener('click', function () {
          var order = normalizeOrder(currentLobby());
          shuffleOrderBtn.disabled = true;
          setLobbyOrder(lobbyId, shuffleDifferent(order))
            .catch(function (e) {
              setInlineError('lobbyHostError', (e && e.message) || 'シャッフルに失敗しました');
            })
            .then(function () {
              shuffleOrderBtn.disabled = false;
            });
        });
      }

      var ups = document.querySelectorAll('.lobbyOrderUp');
      for (var i = 0; i < ups.length; i++) {
        var upBtn = ups[i];
        if (!upBtn || upBtn.__lobby_bound) continue;
        upBtn.__lobby_bound = true;
        upBtn.addEventListener('click', function (ev) {
          var mid2 = String((ev && ev.currentTarget && ev.currentTarget.getAttribute('data-mid')) || '');
          if (!mid2) return;
          var order = normalizeOrder(currentLobby());
          var idx = order.indexOf(mid2);
          if (idx <= 0) return;
          setLobbyOrder(lobbyId, swap(order, idx, idx - 1)).catch(function (e) {
            setInlineError('lobbyHostError', (e && e.message) || '更新に失敗しました');
          });
        });
      }

      var downs = document.querySelectorAll('.lobbyOrderDown');
      for (var j = 0; j < downs.length; j++) {
        var downBtn = downs[j];
        if (!downBtn || downBtn.__lobby_bound) continue;
        downBtn.__lobby_bound = true;
        downBtn.addEventListener('click', function (ev2) {
          var mid3 = String((ev2 && ev2.currentTarget && ev2.currentTarget.getAttribute('data-mid')) || '');
          if (!mid3) return;
          var order = normalizeOrder(currentLobby());
          var idx2 = order.indexOf(mid3);
          if (idx2 < 0 || idx2 >= order.length - 1) return;
          setLobbyOrder(lobbyId, swap(order, idx2, idx2 + 1)).catch(function (e) {
            setInlineError('lobbyHostError', (e && e.message) || '更新に失敗しました');
          });
        });
      }

      var cnShuffleBtn = document.getElementById('cnAssignShuffle');
      if (cnShuffleBtn && !cnShuffleBtn.__lobby_bound) {
        cnShuffleBtn.__lobby_bound = true;
        cnShuffleBtn.addEventListener('click', function () {
          var lob = currentLobby();
          var ids = normalizeOrder(lob);
          var prevAssign = (lob && lob.codenamesAssign) || {};

          // Try multiple times to ensure we actually change the assignment.
          var assign = null;
          for (var tries = 0; tries < 20; tries++) {
            var cand = buildRandomCnAssign(ids);
            if (!cnAssignEquals(prevAssign, cand, ids)) {
              assign = cand;
              break;
            }
          }
          if (!assign) {
            assign = forceDifferentCnAssign(prevAssign, ids);
          }

          cnShuffleBtn.disabled = true;
          setLobbyCodenamesAssignBulk(lobbyId, assign)
            .catch(function (e) {
              setInlineError('lobbyHostError', (e && e.message) || 'シャッフルに失敗しました');
            })
            .then(function () {
              cnShuffleBtn.disabled = false;
            });
        });
      }

      var teamEls = document.querySelectorAll('.cnAssignTeam');
      for (var t = 0; t < teamEls.length; t++) {
        var el = teamEls[t];
        if (!el || el.__lobby_bound) continue;
        el.__lobby_bound = true;
        el.addEventListener('change', function (ev3) {
          var e = ev3 && ev3.currentTarget ? ev3.currentTarget : null;
          var mid4 = e ? String(e.getAttribute('data-mid') || '') : '';
          if (!mid4) return;
          var team = String(e.value || '');
          var roleEl = document.querySelector('.cnAssignRole[data-mid="' + mid4 + '"]');
          var role = String((roleEl && roleEl.value) || '');
          setLobbyCodenamesAssign(lobbyId, mid4, team, role).catch(function (e2) {
            setInlineError('lobbyHostError', (e2 && e2.message) || '更新に失敗しました');
          });
        });
      }

      var roleEls = document.querySelectorAll('.cnAssignRole');
      for (var r2 = 0; r2 < roleEls.length; r2++) {
        var el2 = roleEls[r2];
        if (!el2 || el2.__lobby_bound) continue;
        el2.__lobby_bound = true;
        el2.addEventListener('change', function (ev4) {
          var e4 = ev4 && ev4.currentTarget ? ev4.currentTarget : null;
          var mid5 = e4 ? String(e4.getAttribute('data-mid') || '') : '';
          if (!mid5) return;
          var role = String(e4.value || '');
          var teamEl = document.querySelector('.cnAssignTeam[data-mid="' + mid5 + '"]');
          var team = String((teamEl && teamEl.value) || '');
          setLobbyCodenamesAssign(lobbyId, mid5, team, role).catch(function (e3) {
            setInlineError('lobbyHostError', (e3 && e3.message) || '更新に失敗しました');
          });
        });
      }

      // Oekaki settings: read current form state (fallback to saved lobby settings).
      function readOekakiFormSettings() {
        var lob = currentLobby();
        var cur = normalizeOekakiLobbySettings(lob && lob.oekakiSettings);
        var elS = document.getElementById('okDrawSecs');
        if (elS) cur.drawSeconds = clamp(parseIntSafe(elS.value, cur.drawSeconds), 30, 600);
        var elM = document.getElementById('okTopicMode');
        if (elM) cur.topicMode = String(elM.value || '') === 'custom' ? 'custom' : 'random';
        var elA = document.getElementById('okTopicAge');
        if (elA) {
          var av = String(elA.value || '');
          if (av === 'kids' || av === 'school' || av === 'adult') cur.topicAge = av;
        }
        var elT = document.getElementById('okCustomTopic');
        if (elT) cur.customTopic = String(elT.value || '');
        return cur;
      }

      function saveOekakiSettingsFromForm() {
        setLobbyOekakiSettings(lobbyId, readOekakiFormSettings()).catch(function (e) {
          setInlineError('lobbyHostError', (e && e.message) || '設定の保存に失敗しました');
        });
      }

      var okDrawSecsEl = document.getElementById('okDrawSecs');
      if (okDrawSecsEl && !okDrawSecsEl.__lobby_bound) {
        okDrawSecsEl.__lobby_bound = true;
        okDrawSecsEl.addEventListener('change', saveOekakiSettingsFromForm);
      }

      var okTopicModeEl = document.getElementById('okTopicMode');
      if (okTopicModeEl && !okTopicModeEl.__lobby_bound) {
        okTopicModeEl.__lobby_bound = true;
        okTopicModeEl.addEventListener('change', saveOekakiSettingsFromForm);
      }

      var okTopicAgeEl = document.getElementById('okTopicAge');
      if (okTopicAgeEl && !okTopicAgeEl.__lobby_bound) {
        okTopicAgeEl.__lobby_bound = true;
        okTopicAgeEl.addEventListener('change', saveOekakiSettingsFromForm);
      }

      var okCustomTopicEl = document.getElementById('okCustomTopic');
      if (okCustomTopicEl && !okCustomTopicEl.__lobby_bound) {
        okCustomTopicEl.__lobby_bound = true;
        okCustomTopicEl.addEventListener('change', saveOekakiSettingsFromForm);
      }

      var startBtn = document.getElementById('lobbyStartGame');
      if (startBtn && !startBtn.__lobby_bound) {
        startBtn.__lobby_bound = true;
        startBtn.addEventListener('click', function () {
          var kindEl2 = document.getElementById('lobbyGameKind');
          var kind = String((kindEl2 && kindEl2.value) || ui.selectedKind || 'wordwolf');

          // Minimum player gate (prevent proceeding from lobby when人数不足)
          try {
            var ids0 = normalizeOrder(lobby);
            var n0 = Array.isArray(ids0) ? ids0.length : 0;
            var min = 0;
            if (kind === 'loveletter') min = 2;
            else if (kind === 'codenames') min = 4;
            else if (kind === 'hannin') min = 3;
            else if (kind === 'oekaki') min = 1; // 一人でもOK（採点のみ）
            else min = 3; // wordwolf

            if (n0 < min) {
              clearInlineError('lobbyHostError');
              var gameLabel = gameKindLabel(kind) || 'ゲーム';
              setInlineError('lobbyHostError', '参加者が足りません（' + gameLabel + 'は' + String(min) + '人以上必要です）');
              return;
            }
          } catch (eMin) {
            // ignore (fallback to existing flow)
          }

          // Oekaki: custom topic must be filled before start.
          if (kind === 'oekaki') {
            var okSetV = readOekakiFormSettings();
            if (okSetV.topicMode === 'custom' && !String(okSetV.customTopic || '').trim()) {
              clearInlineError('lobbyHostError');
              setInlineError('lobbyHostError', 'おだい（じゆうきにゅう）を いれてください');
              return;
            }
          }

          // Wordwolf requires the legacy settings screen.
          if (kind !== 'codenames' && kind !== 'loveletter' && kind !== 'hannin' && kind !== 'oekaki') {
            var qWw = {};
            var vWw = getCacheBusterParam();
            if (vWw) qWw.v = vWw;
            qWw.screen = 'create';
            qWw.lobby = lobbyId;
            try {
              var qCur = parseQuery();
              if (qCur && String(qCur.gmdev || '') === '1') qWw.gmdev = '1';
            } catch (eG0) {
              // ignore
            }
            setQuery(qWw);
            route();
            return;
          }

          clearInlineError('lobbyHostError');
          startBtn.disabled = true;

          var isTableGm = false;
          try {
            var qCur0 = parseQuery();
            isTableGm = qCur0 && String(qCur0.gmdev || '') === '1';
          } catch (eGm) {
            isTableGm = false;
          }

          var hostMid = lobby && lobby.hostMid ? String(lobby.hostMid) : '';
          var hostName = lobby && lobby.members && hostMid && lobby.members[hostMid] ? String(lobby.members[hostMid].name || '').trim() : '';
          if (!hostName) hostName = loadPersistedName() || 'GM';

          var roomId = makeRoomId();
          // Used for hannin redirect after room creation (needs to survive promise chain).
          var hostPidH = '';
          var hostPidO = '';
          firebaseReady()
            .then(function () {
              if (kind === 'codenames') {
                // Pre-register all lobby members then start.
                var ids = normalizeOrder(lobby);
                var members = (lobby && lobby.members) || {};

                var hostPid = isTableGm ? (ids && ids.length ? String(ids[0] || '') : '') : String(mid || '');

                // Build assignment fallback when missing.
                var assignMap = (lobby && lobby.codenamesAssign) || {};
                if (!assignMap || typeof assignMap !== 'object') assignMap = {};
                var tmpAssign = {};
                for (var iA = 0; iA < ids.length; iA++) {
                  var idA = ids[iA];
                  var a0 = assignMap && assignMap[idA] ? assignMap[idA] : null;
                  tmpAssign[idA] = {
                    team: a0 && a0.team ? String(a0.team) : '',
                    role: a0 && a0.role ? String(a0.role) : ''
                  };
                }
                for (var iB = 0; iB < ids.length; iB++) {
                  var idB = ids[iB];
                  if (!tmpAssign[idB].team) tmpAssign[idB].team = iB % 2 === 0 ? 'red' : 'blue';
                  if (!tmpAssign[idB].role) tmpAssign[idB].role = 'operative';
                }
                var redSm = '';
                var blueSm = '';
                for (var iC = 0; iC < ids.length; iC++) {
                  var idC = ids[iC];
                  if (tmpAssign[idC].team === 'red' && !redSm) redSm = idC;
                  if (tmpAssign[idC].team === 'blue' && !blueSm) blueSm = idC;
                }
                if (redSm) tmpAssign[redSm].role = 'spymaster';
                if (blueSm) tmpAssign[blueSm].role = 'spymaster';

                if (!isTableGm) setCodenamesPlayerId(roomId, mid);
                return createCodenamesRoom(roomId, { name: hostName, size: 5 })
                  .then(function () {
                    var seq = Promise.resolve();
                    for (var jA = 0; jA < ids.length; jA++) {
                      (function (pid) {
                        seq = seq
                          .then(function () {
                            var nm = members && members[pid] && members[pid].name ? String(members[pid].name) : '';
                            return joinPlayerInCodenamesRoom(roomId, pid, nm || '-', hostPid && String(pid) === String(hostPid));
                          })
                          .then(function () {
                            var a1 = tmpAssign[pid] || { team: '', role: '' };
                            var nm2 = members && members[pid] && members[pid].name ? String(members[pid].name) : '';
                            return setCodenamesPlayerProfile(roomId, pid, nm2 || '-', String(a1.team || ''), String(a1.role || ''));
                          });
                      })(ids[jA]);
                    }
                    return seq;
                  })
                  .then(function () {
                    return;
                  });
              }
              if (kind === 'loveletter') {
                var order2 = normalizeOrder(lobby);
                var members2 = (lobby && lobby.members) || {};
                var extraCards2 = [];
                try {
                  extraCards2 = llNormalizeExtraCards(lobby && lobby.loveletterExtraCards);
                } catch (eLx) {
                  extraCards2 = [];
                }
                var hostPid2 = isTableGm ? (order2 && order2.length ? String(order2[0] || '') : '') : String(mid || '');
                setLoveLetterPlayerId(roomId, hostPid2 || String(mid || ''));
                return createLoveLetterRoom(roomId, { order: order2, extraCards: extraCards2 })
                  .then(function () {
                    var seq2 = Promise.resolve();
                    for (var kA = 0; kA < order2.length; kA++) {
                      (function (pid2) {
                        seq2 = seq2.then(function () {
                          var nm3 = members2 && members2[pid2] && members2[pid2].name ? String(members2[pid2].name) : '';
                          return joinPlayerInLoveLetterRoom(roomId, pid2, nm3 || '-', hostPid2 && String(pid2) === String(hostPid2));
                        });
                      })(order2[kA]);
                    }
                    return seq2;
                  })
                  .then(function () {
                    return;
                  });
              }
  
              if (kind === 'hannin') {
                var orderH = normalizeOrder(lobby);
                var membersH = (lobby && lobby.members) || {};

                hostPidH = isTableGm ? (orderH && orderH.length ? String(orderH[0] || '') : '') : String(mid || '');
                if (orderH.indexOf(hostPidH) === -1) hostPidH = orderH && orderH.length ? String(orderH[0] || '') : hostPidH;
                return createHanninRoom(roomId, { order: orderH })
                  .then(function () {
                    var seqH = Promise.resolve();
                    for (var hA = 0; hA < orderH.length; hA++) {
                      (function (pidH) {
                        seqH = seqH.then(function () {
                          var nmH = membersH && membersH[pidH] && membersH[pidH].name ? String(membersH[pidH].name) : '';
                          if (!nmH) nmH = '-';
                          return joinPlayerInHanninRoom(roomId, pidH, nmH || '-', hostPidH && String(pidH) === String(hostPidH));
                        });
                      })(orderH[hA]);
                    }
                    return seqH;
                  })
                  .then(function () {
                    return;
                  });
              }

              if (kind === 'oekaki') {
                var orderO = normalizeOrder(lobby);
                var membersO = (lobby && lobby.members) || {};
                var okSetStart = readOekakiFormSettings();
                var topicO = '';
                if (okSetStart.topicMode === 'custom') topicO = String(okSetStart.customTopic || '').trim();
                else topicO = oekakiPickTopic(okSetStart.topicAge, '');

                hostPidO = isTableGm ? '' : String(mid || '');
                return setLobbyOekakiSettings(lobbyId, okSetStart)
                  .catch(function () {
                    return null;
                  })
                  .then(function () {
                    return createOekakiRoom(
                      roomId,
                      {
                        order: orderO,
                        drawSeconds: okSetStart.drawSeconds,
                        topicMode: okSetStart.topicMode,
                        topicAge: okSetStart.topicAge
                      },
                      topicO
                    );
                  })
                  .then(function () {
                    var seqO = Promise.resolve();
                    for (var oA = 0; oA < orderO.length; oA++) {
                      (function (pidO) {
                        seqO = seqO.then(function () {
                          var nmO = membersO && membersO[pidO] && membersO[pidO].name ? String(membersO[pidO].name) : '';
                          if (!nmO) nmO = '-';
                          return joinPlayerInOekakiRoom(roomId, pidO, nmO, hostPidO && String(pidO) === String(hostPidO));
                        });
                      })(orderO[oA]);
                    }
                    return seqO;
                  })
                  .then(function () {
                    return;
                  });
              }
              return;
            })
            .then(function () {
              return setLobbyCurrentGame(lobbyId, { kind: kind, roomId: roomId, startedAt: serverNowMs() });
            })
            .then(function () {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.lobby = lobbyId;
              if (isTableGm) q.gmdev = '1';
              if (kind === 'codenames') {
                q.host = '1';
                if (!isTableGm) {
                  // GM参加者（テーブル端末ではない）はタイマー設定画面へ。
                  q.screen = 'codenames_host';
                } else {
                  // Insert timer settings screen before showing the table view.
                  q.screen = 'codenames_host';
                }
              } else if (kind === 'loveletter') {
                q.host = '1';
                q.player = '1';
                q.screen = 'loveletter_extras';
              } else if (kind === 'hannin') {
                q.host = '1';
                // GM端末(テーブル表示)は player を持たせない：player があると誤ってプレイヤー画面扱いになるため。
                // この端末もプレイヤーとして参加したい場合は、別途プレイヤー用URLで参加する。
                if (!isTableGm && hostPidH) q.player = String(hostPidH);
                q.screen = isTableGm ? 'hannin_table' : 'hannin_player';
              } else if (kind === 'oekaki') {
                q.host = '1';
                if (!isTableGm && hostPidO) q.player = String(hostPidO);
                q.screen = 'oekaki_player';
              }
              setQuery(q);
              route();
            })
            .catch(function (e5) {
              startBtn.disabled = false;
              setInlineError('lobbyHostError', (e5 && e5.message) || '開始に失敗しました');
            });
        });
      }
    }

    function renderWithLobby(lobby) {
      ui.lastLobby = lobby;
      var cg = (lobby && lobby.currentGame) || null;
      var kindFromCg = cg && cg.kind ? String(cg.kind) : '';
      if (!ui.selectedKind && kindFromCg) ui.selectedKind = kindFromCg;
      if (!ui.selectedKind && !kindFromCg && lobby && lobby.lastKind) ui.selectedKind = String(lobby.lastKind || '');
      if (!ui.selectedKind) ui.selectedKind = 'wordwolf';

      var myName = '';
      try {
        myName = lobby && lobby.members && mid && lobby.members[mid] ? String(lobby.members[mid].name || '').trim() : '';
      } catch (e0) {
        myName = '';
      }

      renderLobbyHost(viewEl, {
        lobbyId: lobbyId,
        lobby: lobby,
        selectedKind: ui.selectedKind,
        joinUrl: joinUrl,
        myName: myName,
        isTableGmDevice: isTableGmDevice
      });
      bindHostButtons(lobby);
      try {
        drawQr(160);
      } catch (eQ4) {
        // ignore
      }
    }

    function lobbyRenderKey(lobby) {
      try {
        var out = {
          hostMid: lobby && lobby.hostMid ? String(lobby.hostMid) : '',
          currentGame: lobby && lobby.currentGame ? lobby.currentGame : null,
          lastKind: lobby && lobby.lastKind ? String(lobby.lastKind) : '',
          selectedKind: ui.selectedKind || '',
          order: Array.isArray(lobby && lobby.order) ? lobby.order.slice() : [],
          members: {},
          loveletterExtraCards: Array.isArray(lobby && lobby.loveletterExtraCards) ? lobby.loveletterExtraCards.slice() : [],
          codenamesAssign: lobby && lobby.codenamesAssign ? lobby.codenamesAssign : null,
          oekakiSettings: lobby && lobby.oekakiSettings ? lobby.oekakiSettings : null
        };
        var members = (lobby && lobby.members) || {};
        var keys = Object.keys(members);
        keys.sort();
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var m = members[k] || {};
          // Ignore volatile fields like lastSeenAt/joinedAt.
          out.members[k] = { name: String(m.name || ''), isGmDevice: !!m.isGmDevice };
        }
        return JSON.stringify(out);
      } catch (e) {
        return String(Math.random());
      }
    }

    firebaseReady()
      .then(function () {
        return subscribeLobby(lobbyId, function (lobby) {
          if (!lobby) {
            renderError(viewEl, 'ロビーが見つかりません');
            return;
          }

          // 参加者は管理画面に入れない（ホスト or GM端末のみ）
          try {
            var hostMid = lobby && lobby.hostMid ? String(lobby.hostMid) : '';
            var me = lobby && lobby.members && mid ? lobby.members[mid] : null;
            var isAllowed = String(hostMid) === String(mid) || (me && me.isGmDevice);
            if (!isAllowed) {
              redirectToLobbyPlayer();
              return;
            }
          } catch (eAuth) {
            redirectToLobbyPlayer();
            return;
          }

          // Avoid re-rendering on high-frequency heartbeat updates (keeps QR from resetting).
          var key = lobbyRenderKey(lobby);
          if (ui._lastRenderKey === key) return;
          ui._lastRenderKey = key;
          renderWithLobby(lobby);
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeLobbyPlayer(lobbyId) {
    var unsub = null;
    var mid = getOrCreateLobbyMemberId(lobbyId);

    function goToCurrentGame(lobby) {
      var cg = (lobby && lobby.currentGame) || null;
      if (!cg || !cg.kind || !cg.roomId) return false;

      var kind = String(cg.kind || '');
      var roomId = String(cg.roomId || '');
      if (!kind || !roomId) return false;

      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.room = roomId;
      q.lobby = lobbyId;

      var isHostDevice = lobby && String(lobby.hostMid || '') === String(mid);
      var nm = loadPersistedName();
      if (nm) q.name = nm;
      q.autojoin = '1';

      if (kind === 'codenames') {
        q.screen = isHostDevice ? 'codenames_host' : 'codenames_join';
        if (isHostDevice) {
          q.host = '1';
        }
      } else if (kind === 'loveletter') {
        q.screen = isHostDevice ? 'loveletter_player' : 'loveletter_join';
        if (isHostDevice) {
          q.host = '1';
          q.player = '1';
        }
      } else if (kind === 'hannin') {
        q.screen = 'hannin_player';
        if (isHostDevice) q.host = '1';
        q.player = String(mid);
      } else if (kind === 'oekaki') {
        q.screen = 'oekaki_player';
        if (isHostDevice) q.host = '1';
        q.player = String(mid);
      } else {
        // Wordwolf: members are pre-registered from lobby; go directly.
        try {
          setPlayerId(roomId, mid);
          touchPlayer(roomId, mid).catch(function () {
            // ignore
          });
        } catch (eSet) {
          // ignore
        }
        if (isHostDevice) q.host = '1';
        q.player = '1';
      }

      try {
        if (unsub) {
          unsub();
          unsub = null;
        }
      } catch (e) {
        // ignore
      }

      setQuery(q);
      route();
      return true;
    }

    firebaseReady()
      .then(function () {
        return subscribeLobby(lobbyId, function (lobby) {
          if (!lobby) {
            // ロビーが消えている（自動削除など）: 参加状態を解除してホームへ戻す。
            // 制限端末のままだとホームに戻れず行き止まりになるため。
            try {
              if (unsub) {
                unsub();
                unsub = null;
              }
            } catch (eGone0) {
              // ignore
            }
            try {
              setActiveLobby('', false);
            } catch (eGone1) {
              // ignore
            }
            var qGone = {};
            var vGone = getCacheBusterParam();
            if (vGone) qGone.v = vGone;
            setQuery(qGone);
            route();
            return;
          }

          if (goToCurrentGame(lobby)) return;

          renderLobbyPlayer(viewEl, { lobbyId: lobbyId, lobby: lobby });
          clearInlineError('lobbyPlayerError');

          var goBtn = document.getElementById('lobbyGoGame');
          if (goBtn && !goBtn.__lobby_bound) {
            goBtn.__lobby_bound = true;
            goBtn.addEventListener('click', function () {
              if (!goToCurrentGame(lobby)) {
                setInlineError('lobbyPlayerError', 'まだ開始されていません');
              }
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeLobbyAssign(lobbyId) {
    var unsub = null;
    var mid = getOrCreateLobbyMemberId(lobbyId);

    function redirectToLobbyPlayer() {
      try {
        if (unsub) {
          unsub();
          unsub = null;
        }
      } catch (e0) {
        // ignore
      }
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_player';
      setQuery(q);
      route();
    }

    function normalizeOrder(lobby) {
      var members = (lobby && lobby.members) || {};
      var order = (lobby && lobby.order) || [];
      if (!Array.isArray(order)) order = [];

      var seen = {};
      var out = [];

      for (var i = 0; i < order.length; i++) {
        var id = String(order[i] || '');
        if (!id) continue;
        if (seen[id]) continue;
        if (!members[id]) continue;
        seen[id] = true;
        out.push(id);
      }

      // Append any missing members deterministically.
      var keys = Object.keys(members);
      keys.sort();
      for (var j = 0; j < keys.length; j++) {
        var k = String(keys[j] || '');
        if (!k || seen[k]) continue;
        seen[k] = true;
        out.push(k);
      }

      return out;
    }

    function swap(order, i, j) {
      if (i === j) return order;
      if (i < 0 || j < 0) return order;
      if (i >= order.length || j >= order.length) return order;
      var a = order.slice();
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
      return a;
    }

    function shuffle(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var r = randomInt(i + 1);
        var t = a[i];
        a[i] = a[r];
        a[r] = t;
      }
      return a;
    }

    function shuffleDifferent(list) {
      var base = list.slice();
      if (base.length <= 1) return base;
      var baseKey = base.join('|');
      for (var i = 0; i < 10; i++) {
        var out = shuffle(base);
        if (out.join('|') !== baseKey) return out;
      }
      var a = base.slice();
      var t = a[0];
      a[0] = a[1];
      a[1] = t;
      return a;
    }

    firebaseReady()
      .then(function () {
        return subscribeLobby(lobbyId, function (lobby) {
          if (!lobby) {
            renderError(viewEl, 'ロビーが見つかりません');
            return;
          }

          var canEdit = String(lobby.hostMid || '') === String(mid || '');

          // 参加者は順番割り振り画面に入れない
          if (!canEdit) {
            redirectToLobbyPlayer();
            return;
          }

          renderLobbyAssign(viewEl, { lobbyId: lobbyId, lobby: lobby, canEdit: canEdit });
          clearInlineError('lobbyAssignError');

          var shuffleBtn = document.getElementById('lobbyShuffle');
          if (shuffleBtn && !shuffleBtn.__lobby_bound) {
            shuffleBtn.__lobby_bound = true;
            shuffleBtn.addEventListener('click', function () {
              shuffleBtn.disabled = true;
              var order = normalizeOrder(lobby);
              setLobbyOrder(lobbyId, shuffleDifferent(order))
                .catch(function (e) {
                  setInlineError('lobbyAssignError', (e && e.message) || 'シャッフルに失敗しました');
                })
                .then(function () {
                  shuffleBtn.disabled = false;
                });
            });
          }

          var ups = document.querySelectorAll('.lobbyOrderUp');
          for (var i = 0; i < ups.length; i++) {
            var upBtn = ups[i];
            if (!upBtn || upBtn.__lobby_bound) continue;
            upBtn.__lobby_bound = true;
            upBtn.addEventListener('click', function (ev) {
              var mid2 = String((ev && ev.currentTarget && ev.currentTarget.getAttribute('data-mid')) || '');
              if (!mid2) return;
              var order = normalizeOrder(lobby);
              var idx = order.indexOf(mid2);
              if (idx <= 0) return;
              setLobbyOrder(lobbyId, swap(order, idx, idx - 1)).catch(function (e) {
                setInlineError('lobbyAssignError', (e && e.message) || '更新に失敗しました');
              });
            });
          }

          var downs = document.querySelectorAll('.lobbyOrderDown');
          for (var j = 0; j < downs.length; j++) {
            var downBtn = downs[j];
            if (!downBtn || downBtn.__lobby_bound) continue;
            downBtn.__lobby_bound = true;
            downBtn.addEventListener('click', function (ev2) {
              var mid3 = String((ev2 && ev2.currentTarget && ev2.currentTarget.getAttribute('data-mid')) || '');
              if (!mid3) return;
              var order = normalizeOrder(lobby);
              var idx2 = order.indexOf(mid3);
              if (idx2 < 0 || idx2 >= order.length - 1) return;
              setLobbyOrder(lobbyId, swap(order, idx2, idx2 + 1)).catch(function (e) {
                setInlineError('lobbyAssignError', (e && e.message) || '更新に失敗しました');
              });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  var HISTORY_KEY = 'ww_history_v1';
  var HISTORY_LAST_SAVED_KEY = 'ww_history_last_saved_v1';

  function formatDateTime(ms) {
    var d = new Date(ms);
    var y = d.getFullYear();
    var mo = pad2(d.getMonth() + 1);
    var da = pad2(d.getDate());
    var hh = pad2(d.getHours());
    var mm = pad2(d.getMinutes());
    return y + '-' + mo + '-' + da + ' ' + hh + ':' + mm;
  }

  function winnerLabelJa(winner) {
    if (winner === 'minority') return '少数側';
    if (winner === 'majority') return '多数側';
    return '-';
  }

  function loadHistory() {
    var raw = null;
    try {
      raw = localStorage.getItem(HISTORY_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e2) {
      return [];
    }
  }

  function saveHistory(items) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items || []));
    } catch (e) {
      // ignore
    }
  }

  function loadLastSavedMap() {
    try {
      var raw = localStorage.getItem(HISTORY_LAST_SAVED_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function saveLastSavedMap(map) {
    try {
      localStorage.setItem(HISTORY_LAST_SAVED_KEY, JSON.stringify(map || {}));
    } catch (e) {
      // ignore
    }
  }

  function maybeAppendHistory(roomId, room) {
    if (!room || room.phase !== 'finished') return;
    if (!room.result || !room.result.winner || !room.result.decidedAt) return;

    var decidedAt = room.result.decidedAt;
    var map = loadLastSavedMap();
    if (map[roomId] && map[roomId] === decidedAt) return;

    var items = loadHistory();

    var minorityIds = listMinorityPlayerIds(room);
    var names = [];
    for (var i = 0; i < minorityIds.length; i++) {
      var pid = minorityIds[i];
      var p = room.players && room.players[pid];
      if (!p) continue;
      names.push(formatPlayerDisplayName(p));
    }

    var item = {
      when: formatDateTime(decidedAt),
      winner: winnerLabelJa(room.result.winner),
      minorityNames: names.join(' / '),
      words: (room.words && room.words.majority ? room.words.majority : '-') + ' / ' + (room.words && room.words.minority ? room.words.minority : '-')
    };

    items.unshift(item);
    var MAX = 30;
    if (items.length > MAX) items = items.slice(0, MAX);
    saveHistory(items);

    map[roomId] = decidedAt;
    saveLastSavedMap(map);
  }

  function routeHistory() {
    renderHistory(viewEl, loadHistory());
  }

  function routeSetup() {
    renderSetup(viewEl);

    // Show the QR / link / copy area for propagating the key to other host devices.
    try {
      renderGeminiShareArea();
    } catch (eShare) {
      // ignore
    }

    // If we just imported a key via #gkey=..., tell the user.
    try {
      if (_oekakiKeyJustImported) {
        _oekakiKeyJustImported = false;
        var notice = document.getElementById('geminiImportNotice');
        if (notice) {
          notice.textContent = '✓ キーを取り込みました（この端末に保存済み）';
          notice.style.display = '';
        }
      }
    } catch (eNotice) {
      // ignore
    }

    var saveBtn = document.getElementById('saveSetup');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        try {
          var gk = document.getElementById('geminiApiKeyInput');
          if (gk) {
            saveGeminiApiKey(gk.value);
            syncGeminiKeyToDb(gk.value);
          }
        } catch (eGk) {
          // ignore
        }

        // Firebase config: only parse when the textarea has content.
        // On devices using embedded config (bbg-config.js), the box is empty and
        // the user may just want to save the Gemini key — don't treat that as an error.
        var cfgEl = document.getElementById('firebaseConfigJson');
        var cfgRaw = String((cfgEl && cfgEl.value) || '').trim();
        if (cfgRaw) {
          try {
            var cfg = readSetupForm();
            saveFirebaseConfigToLocalStorage(cfg);
          } catch (e) {
            renderError(viewEl, (e && e.message) || '保存に失敗しました');
            return;
          }
        } else if (!(window.firebaseConfig || loadFirebaseConfigFromLocalStorage())) {
          renderError(viewEl, 'Firebase config JSON を貼り付けてください。');
          return;
        } else {
          // Embedded/existing config present and only the Gemini key was updated.
          // Stay on setup and refresh the share area so the QR/link appear immediately.
          try {
            renderGeminiShareArea();
          } catch (eShare2) {
            // ignore
          }
          var notice2 = document.getElementById('geminiImportNotice');
          if (notice2) {
            notice2.textContent = loadGeminiApiKey() ? '✓ 保存しました。下のQR/リンクで他の端末に渡せます。' : '✓ キーを削除しました。';
            notice2.style.display = '';
          }
          return;
        }

        firebaseReady()
          .then(function () {
            alert('保存しました。');
            var q = {};
            var v = getCacheBusterParam();
            if (v) q.v = v;
            setQuery(q);
            route();
          })
          .catch(function (e) {
            renderError(viewEl, (e && e.message) || '保存に失敗しました');
          });
      });
    }
  }

  function routeCreate() {
    // Lobby-mode: show minimal setup and start from lobby members.
    var qCreate = null;
    var lobbyIdFromQuery = '';
    try {
      qCreate = parseQuery();
      lobbyIdFromQuery = qCreate && qCreate.lobby ? String(qCreate.lobby) : '';
    } catch (e0) {
      lobbyIdFromQuery = '';
    }

    if (lobbyIdFromQuery) {
      var isTableGmDevice = false;
      try {
        isTableGmDevice = !!(qCreate && String(qCreate.gmdev || '') === '1');
      } catch (eGm0) {
        isTableGmDevice = false;
      }

      var backQ = { lobby: lobbyIdFromQuery, screen: 'lobby_host' };
      var vBack = getCacheBusterParam();
      if (vBack) backQ.v = vBack;
      if (isTableGmDevice) backQ.gmdev = '1';
      var backHref = '?' + buildQuery(backQ);

      render(
        viewEl,
        '\n    <div class="stack">\n      <div class="big">ワードウルフ修正済み：設定</div>\n      <div id="wwCreateError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>少数側の人数（最大5）</label>\n        <input id="minorityCount" type="range" min="1" max="5" step="1" value="1" />\n        <div class="kv"><span class="muted">現在</span><b id="minorityCountLabel">1</b></div>\n      </div>\n\n      <div class="field">\n        <label>お題カテゴリ</label>\n        <select id="topicCategory"></select>\n      </div>\n\n      <hr />\n\n      <div class="row">\n        <button id="wwLobbyStart" class="primary">ゲーム開始</button>\n        <a class="btn ghost" href="' +
          escapeHtml(backHref) +
          '">戻る</a>\n      </div>\n    </div>\n  '
      );

      // Insert talk time UI (kept minimal but configurable).
      try {
        var mcWrap = document.getElementById('minorityCount');
        if (mcWrap && mcWrap.parentNode) {
          var html2 =
            '<div class="field">' +
            '<label>トーク時間（分・最大10分）</label>' +
            '<input id="talkMinutes" type="range" min="1" max="10" step="1" value="3" />' +
            '<div class="kv"><span class="muted">現在</span><b id="talkMinutesLabel">3分</b></div>' +
            '</div>';
          // insert after minorityCount field block
          var container = mcWrap.parentNode;
          // container is the field div; insert after it
          var after = container.nextSibling;
          var tmp = document.createElement('div');
          tmp.innerHTML = html2;
          var node = tmp.firstChild;
          if (node) {
            if (after) container.parentNode.insertBefore(node, after);
            else container.parentNode.appendChild(node);
          }
        }
      } catch (eIns) {
        // ignore
      }

      // Populate categories.
      try {
        var sel = document.getElementById('topicCategory');
        if (sel) {
          var html = '<option value="random">ランダム</option>';
          for (var i = 0; i < TOPIC_CATEGORIES.length; i++) {
            var c = TOPIC_CATEGORIES[i];
            html += '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
          }
          sel.innerHTML = html;
          sel.value = 'random';
        }
      } catch (eCat) {
        // ignore
      }

      function updateMinorityLabel() {
        try {
          var mc = document.getElementById('minorityCount');
          var mcl = document.getElementById('minorityCountLabel');
          if (mc && mcl) mcl.textContent = String(mc.value || '1');

          var tm = document.getElementById('talkMinutes');
          var tml = document.getElementById('talkMinutesLabel');
          if (tm && tml) tml.textContent = String(tm.value || '1') + '分';
        } catch (eLbl) {
          // ignore
        }
      }
      var mcEl = document.getElementById('minorityCount');
      if (mcEl) mcEl.addEventListener('input', updateMinorityLabel);
      var tmEl = document.getElementById('talkMinutes');
      if (tmEl) tmEl.addEventListener('input', updateMinorityLabel);
      updateMinorityLabel();

      // Prefill from lobby shared settings if present.
      firebaseReady()
        .then(function () {
          return getValueOnce(lobbyPath(lobbyIdFromQuery) + '/wordwolfSettings').catch(function () {
            return null;
          });
        })
        .then(function (s0) {
          if (!s0) return;
          try {
            var mc0 = document.getElementById('minorityCount');
            var tm0 = document.getElementById('talkMinutes');
            var tc0 = document.getElementById('topicCategory');
            if (mc0 && s0.minorityCount != null) mc0.value = String(clamp(parseIntSafe(s0.minorityCount, 1), 1, 5));
            if (tm0 && s0.talkSeconds != null) {
              var mins0 = clamp(
                Math.round(clamp(parseIntSafe(s0.talkSeconds, 180), 60, 10 * 60) / 60),
                1,
                10
              );
              tm0.value = String(mins0);
            }
            if (tc0 && s0.topicCategoryId) tc0.value = String(s0.topicCategoryId || 'random');
            updateMinorityLabel();
          } catch (eSet) {
            // ignore
          }
        })
        .catch(function () {
          // ignore
        });

      clearInlineError('wwCreateError');
      stripBackNavLinks(viewEl);

      var lobbyStartBtn = document.getElementById('wwLobbyStart');
      if (!lobbyStartBtn) return;

      lobbyStartBtn.addEventListener('click', function () {
        var form;
        try {
          clearInlineError('wwCreateError');
          var mc2 = document.getElementById('minorityCount');
          var tm2 = document.getElementById('talkMinutes');
          var tc2 = document.getElementById('topicCategory');
          var minorityCount = clamp(parseIntSafe(mc2 && mc2.value, 1), 1, 5);
          var talkMinutes = clamp(parseIntSafe(tm2 && tm2.value, 3), 1, 10);
          var talkSeconds = talkMinutes * 60;
          var topicCategoryId = String((tc2 && tc2.value) || 'random');
          form = { minorityCount: minorityCount, talkSeconds: talkSeconds, topicCategoryId: topicCategoryId };
        } catch (eRead) {
          setInlineError('wwCreateError', (eRead && eRead.message) || '入力を確認してください。');
          return;
        }

        lobbyStartBtn.disabled = true;

        firebaseReady()
          .then(function () {
            return getValueOnce(lobbyPath(lobbyIdFromQuery));
          })
          .then(function (lobby) {
            if (!lobby) throw new Error('ロビーが見つかりません');

            var myMid = getOrCreateLobbyMemberId(lobbyIdFromQuery);
            var hostMid = lobby && lobby.hostMid ? String(lobby.hostMid) : '';
            var me = lobby && lobby.members && myMid ? lobby.members[myMid] : null;
            var isAllowed = String(hostMid) === String(myMid) || (me && me.isGmDevice);
            if (!isAllowed) throw new Error('この端末はホストではありません');

            var members = (lobby && lobby.members) || {};
            var order = (lobby && lobby.order) || [];
            if (!Array.isArray(order)) order = [];

            var seen = {};
            var ids = [];
            for (var i2 = 0; i2 < order.length; i2++) {
              var id = String(order[i2] || '');
              if (!id || seen[id] || !members[id]) continue;
              seen[id] = true;
              ids.push(id);
            }
            var keys = Object.keys(members);
            keys.sort();
            for (var j2 = 0; j2 < keys.length; j2++) {
              var k = String(keys[j2] || '');
              if (!k || seen[k]) continue;
              seen[k] = true;
              ids.push(k);
            }

            var hostName = (members[hostMid] && String(members[hostMid].name || '').trim()) || loadPersistedName() || 'GM';
            savePersistedName(hostName);

            var roomId = makeRoomId();
            var settings = {
              gmName: hostName,
              minorityCount: form.minorityCount,
              talkSeconds: form.talkSeconds,
              reversal: true,
              topicCategoryId: form.topicCategoryId
            };

            return createRoom(roomId, settings)
              .then(function () {
                var seq = Promise.resolve();
                for (var t = 0; t < ids.length; t++) {
                  (function (pid) {
                    seq = seq.then(function () {
                      var nm = members && members[pid] && members[pid].name ? String(members[pid].name) : '';
                      return joinPlayerInRoom(roomId, pid, nm || '-', String(pid) === String(hostMid));
                    });
                  })(ids[t]);
                }
                return seq;
              })
              .then(function () {
                setPlayerId(roomId, hostMid);
                return startGame(roomId);
              })
              .then(function (roomAfterStart) {
                if (!roomAfterStart || String(roomAfterStart.phase || '') !== 'discussion') {
                  throw new Error('参加者が3人以上必要です');
                }
                return setLobbyWordwolfSettings(lobbyIdFromQuery, {
                  minorityCount: form.minorityCount,
                  talkSeconds: form.talkSeconds,
                  topicCategoryId: form.topicCategoryId
                });
              })
              .then(function () {
                return setLobbyCurrentGame(lobbyIdFromQuery, { kind: 'wordwolf', roomId: roomId, startedAt: serverNowMs() });
              })
              .then(function () {
                var q = {};
                var v = getCacheBusterParam();
                if (v) q.v = v;
                q.room = roomId;
                q.lobby = lobbyIdFromQuery;
                q.host = '1';
                if (isTableGmDevice) {
                  q.gmdev = '1';
                  q.screen = 'ww_table';
                } else {
                  q.player = '1';
                }
                setQuery(q);
                route();
              });
          })
          .catch(function (e) {
            setInlineError('wwCreateError', (e && e.message) || '開始に失敗しました');
          })
          .finally(function () {
            lobbyStartBtn.disabled = false;
          });
      });

      return;
    }

    // Standalone-mode (legacy)
    renderCreate(viewEl);
    clearInlineError('wwCreateError');

    var createBtn = document.getElementById('createRoom');
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        var qx0 = null;
        var lobbyId0 = '';
        try {
          qx0 = parseQuery();
          lobbyId0 = qx0 && qx0.lobby ? String(qx0.lobby) : '';
        } catch (e0) {
          lobbyId0 = '';
        }

        var settings;
        try {
          clearInlineError('wwCreateError');
          settings = readCreateForm();
        } catch (e) {
          setInlineError('wwCreateError', (e && e.message) || '入力を確認してください。');
          return;
        }
        var roomId = makeRoomId();
        firebaseReady()
          .then(function () {
            return createRoom(roomId, settings);
          })
          .then(function () {
            var playerId = getOrCreatePlayerId(roomId);
            return joinPlayerInRoom(roomId, playerId, settings.gmName, true).then(function (room) {
              if (!room || !room.players || !room.players[playerId]) {
                throw new Error('ゲームマスターの参加に失敗しました');
              }
              return room;
            });
          })
          .then(function () {
            if (!lobbyId0) return;
            return setLobbyCurrentGame(lobbyId0, { kind: 'wordwolf', roomId: roomId, startedAt: serverNowMs() });
          })
          .then(function () {
            var q = {};
            var v = getCacheBusterParam();
            if (v) q.v = v;
            q.room = roomId;
            q.host = '1';
            if (lobbyId0) {
              q.player = '1';
              q.lobby = lobbyId0;
            }
            setQuery(q);
            route();
          })
          .catch(function (e) {
            renderError(viewEl, (e && e.message) || '作成に失敗しました');
          });
      });
    }
  }

  function routeJoin(roomId, isHost) {
    renderJoin(viewEl, roomId);
    clearInlineError('wwJoinError');
    stripBackNavLinks(viewEl);
    var joinBtn = document.getElementById('join');
    if (!joinBtn) return;

    // Auto-join support (used by lobby).
    try {
      var q0 = parseQuery();
      var nm0 = q0 && q0.name ? String(q0.name) : '';
      if (nm0) {
        var input0 = document.getElementById('playerName');
        if (input0) input0.value = nm0;
      }
    } catch (e0) {
      // ignore
    }

    function doJoin() {
      var form;
      try {
        clearInlineError('wwJoinError');
        form = readJoinForm();
      } catch (e) {
        setInlineError('wwJoinError', (e && e.message) || '入力を確認してください。');
        return;
      }

      var storedId = '';
      try {
        storedId = String(localStorage.getItem('ww_player_' + roomId) || '');
      } catch (e0) {
        storedId = '';
      }

      firebaseReady()
        .then(function () {
          var qx = parseQuery();
          var lobbyId = qx && qx.lobby ? String(qx.lobby) : '';
          var playerId = storedId || getOrCreatePlayerId(roomId);

          if (lobbyId) {
            var mid = getOrCreateLobbyMemberId(lobbyId);
            setPlayerId(roomId, mid);
            playerId = mid;
          }

          return joinPlayerInRoom(roomId, playerId, form.name, false).then(function (room) {
            if (!room) throw new Error('部屋が見つかりません');

            if (room.players && room.players[playerId]) return playerId;
            if (storedId && room.players && room.players[storedId]) {
              setPlayerId(roomId, storedId);
              return storedId;
            }

            if (String(room.phase || '') !== 'lobby') {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.screen = 'ww_rejoin';
              if (isHost) q.host = '1';
              if (lobbyId) q.lobby = lobbyId;
              setQuery(q);
              route();
              return '';
            }

            throw new Error('参加できません（ゲームが開始済みです）');
          });
        })
        .then(function (pid) {
          if (!pid) return;
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.player = '1';
          if (isHost) q.host = '1';
          try {
            var qx2 = parseQuery();
            if (qx2 && qx2.lobby) q.lobby = String(qx2.lobby);
          } catch (e2) {
            // ignore
          }
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '参加に失敗しました');
        });
    }

    joinBtn.addEventListener('click', doJoin);

    // If requested, auto-run once after binding.
    try {
      var q1 = parseQuery();
      if (q1 && String(q1.autojoin || '') === '1') {
        setTimeout(function () {
          doJoin();
        }, 0);
      }
    } catch (e1) {
      // ignore
    }
  }

  function routeWordwolfRejoin(roomId, isHost) {
    var unsub = null;

    firebaseReady()
      .then(function () {
        return subscribeRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          // Rejoin is intended for ongoing games.
          if (String(room.phase || '') === 'lobby') {
            var q0 = {};
            var v0 = getCacheBusterParam();
            if (v0) q0.v = v0;
            q0.room = roomId;
            q0.screen = 'join';
            if (isHost) q0.host = '1';
            try {
              var qq0 = parseQuery();
              if (qq0 && qq0.lobby) q0.lobby = String(qq0.lobby);
            } catch (e0) {
              // ignore
            }
            setQuery(q0);
            route();
            return;
          }

          renderWordwolfRejoin(viewEl, { roomId: roomId, room: room });
          clearInlineError('wwRejoinError');
          stripBackNavLinks(viewEl);

          var goNew = document.getElementById('wwGoNewJoin');
          if (goNew && !goNew.__ww_bound) {
            goNew.__ww_bound = true;
            goNew.addEventListener('click', function () {
              var q1 = {};
              var v1 = getCacheBusterParam();
              if (v1) q1.v = v1;
              q1.room = roomId;
              q1.screen = 'join';
              if (isHost) q1.host = '1';
              try {
                var qq1 = parseQuery();
                if (qq1 && qq1.lobby) q1.lobby = String(qq1.lobby);
              } catch (e1) {
                // ignore
              }
              setQuery(q1);
              route();
            });
          }

          var picks = document.querySelectorAll('.wwRejoinPick');
          for (var i = 0; i < picks.length; i++) {
            var b = picks[i];
            if (!b || b.__ww_bound) continue;
            b.__ww_bound = true;
            b.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              var pid = el ? String(el.getAttribute('data-pid') || '') : '';
              if (!pid) {
                setInlineError('wwRejoinError', '選択に失敗しました');
                return;
              }

              setPlayerId(roomId, pid);
              touchPlayer(roomId, pid).catch(function () {
                // ignore
              });

              var q2 = {};
              var v2 = getCacheBusterParam();
              if (v2) q2.v = v2;
              q2.room = roomId;
              q2.player = '1';
              var p = room && room.players ? room.players[pid] : null;
              if (isHost || (p && p.isHost)) q2.host = '1';
              try {
                var qq2 = parseQuery();
                if (qq2 && qq2.lobby) q2.lobby = String(qq2.lobby);
              } catch (e2) {
                // ignore
              }
              setQuery(q2);
              route();
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeHost(roomId) {
    var unsub = null;
    var joinUrl = makeJoinUrl(roomId);

    function drawQr() {
      return new Promise(function (resolve) {
        var canvas = document.getElementById('qr');
        var errEl = document.getElementById('qrError');
        var wrapEl = document.getElementById('qrWrap');
        if (errEl) errEl.textContent = '';

        function showAsRemoteImage() {
          if (!wrapEl) return resolve();
          var src =
            'https://api.qrserver.com/v1/create-qr-code/?size=' +
            encodeURIComponent('240x240') +
            '&data=' +
            encodeURIComponent(String(joinUrl || ''));
          try {
            wrapEl.innerHTML = '';
            var img = document.createElement('img');
            img.id = 'qrImg';
            img.alt = 'QR';
            img.referrerPolicy = 'no-referrer';
            img.onload = function () {
              if (errEl) errEl.textContent = '（外部サービスでQRを生成しています）';
              resolve();
            };
            img.onerror = function () {
              if (errEl) errEl.textContent = 'QR画像の読み込みに失敗しました（ネットワーク/フィルタの可能性）。URLコピーで参加してください。';
              resolve();
            };
            img.src = src;
            wrapEl.appendChild(img);
            return;
          } catch (e) {
            wrapEl.innerHTML = '<img id="qrImg" alt="QR" src="' + escapeHtml(src) + '" />';
            if (errEl) errEl.textContent = '（外部サービスでQRを生成しています）';
            return resolve();
          }
        }

        if (!canvas) {
          if (errEl) errEl.textContent = 'QR表示領域が見つかりません。';
          return resolve();
        }

        var qr = window.QRCode || window.qrcode || window.QR;
        if (!qr || !qr.toCanvas) {
          return showAsRemoteImage();
        }

        function showAsImage() {
          if (!qr.toDataURL || !wrapEl) return showAsRemoteImage();
          try {
            qr.toDataURL(joinUrl, { margin: 1, width: 240 }, function (err, url) {
              if (err || !url) {
                return showAsRemoteImage();
              }
              wrapEl.innerHTML = '<img id="qrImg" alt="QR" src="' + escapeHtml(url) + '" />';
              if (errEl) errEl.textContent = '（QRは画像で表示しています）';
              return resolve();
            });
          } catch (e) {
            return showAsRemoteImage();
          }
        }

        function looksBlank(c) {
          try {
            var ctx = c.getContext && c.getContext('2d');
            if (!ctx) return true;
            var w = c.width || 0;
            var h = c.height || 0;
            if (!w || !h) return true;
            // sample a few pixels; if all fully transparent or all white-ish, treat as blank
            var img = ctx.getImageData(0, 0, Math.min(16, w), Math.min(16, h)).data;
            var allZero = true;
            var allWhite = true;
            for (var i = 0; i < img.length; i += 4) {
              var r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
              if (a !== 0) allZero = false;
              if (!(a !== 0 && r > 240 && g > 240 && b > 240)) allWhite = false;
              if (!allZero && !allWhite) return false;
            }
            return allZero || allWhite;
          } catch (e) {
            // If we can't read pixels (e.g., SecurityError), treat as blank and fallback.
            return true;
          }
        }

        try {
          qr.toCanvas(canvas, joinUrl, { margin: 1, width: 240 }, function (err) {
            if (err) {
              if (errEl) errEl.textContent = 'QRの生成に失敗しました。';
              showAsRemoteImage();
              return;
            }
            if (looksBlank(canvas)) {
              showAsRemoteImage();
              return;
            }
            resolve();
          });
        } catch (e) {
          if (errEl) errEl.textContent = 'QRの生成に失敗しました。';
          showAsRemoteImage();
        }
      });
    }

    function renderWithRoom(room) {
      renderHostQr(viewEl, { roomId: roomId, joinUrl: joinUrl, room: room });
      drawQr();

      var copyBtn = document.getElementById('copyJoinUrl');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var st = document.getElementById('copyStatus');
          if (st) st.textContent = 'コピー中...';
          copyTextToClipboard(joinUrl)
            .then(function (ok) {
              if (!st) return;
              st.textContent = ok ? 'コピーしました' : 'コピーできませんでした（長押しで選択してコピーしてください）';
            })
            .catch(function () {
              if (st) st.textContent = 'コピーできませんでした（長押しで選択してコピーしてください）';
            });
        });
      }

      var startGameBtn = document.getElementById('startGame');
      if (startGameBtn)
        startGameBtn.addEventListener('click', function () {
          startGame(roomId)
            .then(function () {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.player = '1';
              q.host = '1';
              setQuery(q);
              route();
            })
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            });
        });
    }

    firebaseReady()
      .then(function () {
        return subscribeRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }
          renderWithRoom(room);
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routePlayer(roomId, isHost) {
    var playerId = getOrCreatePlayerId(roomId);
    var unsub = null;
    var timerHandle = null;
    var autoVoteRequested = false;
    var ui = { showContinueForm: false, lobbyReturnWatching: false, lobbyUnsub: null, cancelled: false };

    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    function redirectToLobby() {
      if (!lobbyId) return;
      ui.cancelled = true;
      try {
        if (unsub) unsub();
      } catch (eU0) {
        // ignore
      }
      unsub = null;
      try {
        if (timerHandle) clearInterval(timerHandle);
      } catch (eT0) {
        // ignore
      }
      timerHandle = null;
      try {
        if (ui.lobbyUnsub) ui.lobbyUnsub();
      } catch (eL0) {
        // ignore
      }
      ui.lobbyUnsub = null;

      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = isHost ? 'lobby_host' : 'lobby_player';
      setQuery(q);
      route();
    }

    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (ui.lobbyReturnWatching) return;
      ui.lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'wordwolf' || rid !== String(roomId || '')) {
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          ui.lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    function rerenderTimer(room) {
      var el = document.getElementById('timer');
      if (!el) return;
      if (!room || room.phase !== 'discussion') return;
      var endAt = room && room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
      var remain = Math.max(0, Math.floor((endAt - serverNowMs()) / 1000));
      el.textContent = formatMMSS(remain);
    }

    firebaseReady()
      .then(function () {
        return subscribeRoom(roomId, function (room) {
          if (ui.cancelled) return;
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          var player = room.players ? room.players[playerId] : null;
          renderPlayer(viewEl, { roomId: roomId, playerId: playerId, player: player, room: room, isHost: isHost, ui: ui, lobbyId: lobbyId });

          if (isHost) {
            maybeAppendHistory(roomId, room);
          }

          if ((room && room.phase) !== 'discussion') autoVoteRequested = false;

          if (timerHandle) clearInterval(timerHandle);
          timerHandle = setInterval(function () {
            if (ui.cancelled) return;
            rerenderTimer(room);
            if (!autoVoteRequested && room && room.phase === 'discussion') {
              var endAt = room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
              if (endAt && serverNowMs() >= endAt) {
                autoVoteRequested = true;
                autoStartVotingIfEnded(roomId);
              }
            }
          }, 250);

          var submitGuessBtn = document.getElementById('submitGuess');
          if (submitGuessBtn) {
            submitGuessBtn.addEventListener('click', function () {
              var el = document.getElementById('guessText');
              var guessText = String((el && el.value) || '').trim();
              if (!guessText) return;
              submitGuess(roomId, playerId, guessText).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var voteBtns = document.querySelectorAll('.voteBtn');
          for (var i = 0; i < voteBtns.length; i++) {
            (function (btn) {
              btn.addEventListener('click', function () {
                var toPlayerId = String(btn.getAttribute('data-to') || '').trim();
                if (!toPlayerId) return;
                submitVote(roomId, playerId, toPlayerId).catch(function (e) {
                  alert((e && e.message) || '失敗');
                });
              });
            })(voteBtns[i]);
          }

          var decideMinorityBtn = document.getElementById('decideMinority');
          if (decideMinorityBtn) {
            decideMinorityBtn.addEventListener('click', function () {
              decideWinner(roomId, 'minority').catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var decideMajorityBtn = document.getElementById('decideMajority');
          if (decideMajorityBtn) {
            decideMajorityBtn.addEventListener('click', function () {
              decideWinner(roomId, 'majority').catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var revealNextBtn = document.getElementById('revealNext');
          if (revealNextBtn) {
            revealNextBtn.addEventListener('click', function () {
              revealAfterVoting(roomId).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }


          // Vote reveal modal: GM advances to next phase.
          var voteRevealNext = document.getElementById('wwVoteRevealNext');
          if (voteRevealNext && !voteRevealNext.__ww_bound) {
            voteRevealNext.__ww_bound = true;
            voteRevealNext.addEventListener('click', function () {
              voteRevealNext.disabled = true;
              advanceAfterVoteReveal(roomId)
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  voteRevealNext.disabled = false;
                });
            });
          }

          // Vote reveal (tie): GM chooses whether to revote or end as minority win.
          var tieRevoteBtn = document.getElementById('wwTieRevote');
          if (tieRevoteBtn && !tieRevoteBtn.__ww_bound) {
            tieRevoteBtn.__ww_bound = true;
            tieRevoteBtn.addEventListener('click', function () {
              tieRevoteBtn.disabled = true;
              advanceAfterVoteReveal(roomId, 'revote')
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  tieRevoteBtn.disabled = false;
                });
            });
          }

          var tieMinorityBtn = document.getElementById('wwTieMinorityWin');
          if (tieMinorityBtn && !tieMinorityBtn.__ww_bound) {
            tieMinorityBtn.__ww_bound = true;
            tieMinorityBtn.addEventListener('click', function () {
              tieMinorityBtn.disabled = true;
              advanceAfterVoteReveal(roomId, 'minority')
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  tieMinorityBtn.disabled = false;
                });
            });
          }

          if (lobbyId) ensureLobbyReturnWatcher();

          var continueBtn = document.getElementById('continueGame');
          if (continueBtn) {
            continueBtn.addEventListener('click', function () {
              ui.showContinueForm = true;
              renderPlayer(viewEl, { roomId: roomId, playerId: playerId, player: player, room: room, isHost: isHost, ui: ui });

              var sel = document.getElementById('cTopicCategory');
              if (sel) {
                var html = '<option value="random">ランダム</option>';
                for (var i = 0; i < TOPIC_CATEGORIES.length; i++) {
                  html += '<option value="' + escapeHtml(TOPIC_CATEGORIES[i].id) + '">' + escapeHtml(TOPIC_CATEGORIES[i].name) + '</option>';
                }
                sel.innerHTML = html;
                var current = room && room.topic && room.topic.categoryId ? String(room.topic.categoryId) : 'random';
                sel.value = current || 'random';
              }

              function updateLabels() {
                var mc = document.getElementById('cMinorityCount');
                var mcl = document.getElementById('cMinorityCountLabel');
                if (mc && mcl) mcl.textContent = String(mc.value);
                var tm = document.getElementById('cTalkMinutes');
                var tml = document.getElementById('cTalkMinutesLabel');
                if (tm && tml) tml.textContent = String(tm.value) + '分';
              }

              var mcEl = document.getElementById('cMinorityCount');
              if (mcEl) mcEl.addEventListener('input', updateLabels);
              var tmEl = document.getElementById('cTalkMinutes');
              if (tmEl) tmEl.addEventListener('input', updateLabels);
              updateLabels();

              var cancelBtn = document.getElementById('cancelContinue');
              if (cancelBtn) {
                cancelBtn.addEventListener('click', function () {
                  ui.showContinueForm = false;
                  renderPlayer(viewEl, { roomId: roomId, playerId: playerId, player: player, room: room, isHost: isHost, ui: ui });
                });
              }

              var startBtn = document.getElementById('startContinue');
              if (startBtn) {
                startBtn.addEventListener('click', function () {
                  var mc2 = document.getElementById('cMinorityCount');
                  var tm2 = document.getElementById('cTalkMinutes');
                  var rv2 = document.getElementById('cReversal');
                  var tc2 = document.getElementById('cTopicCategory');
                  var minorityCount = clamp(parseIntSafe(mc2 && mc2.value, 1), 1, 5);
                  var talkMinutes = clamp(parseIntSafe(tm2 && tm2.value, 3), 1, 10);
                  var talkSeconds = talkMinutes * 60;
                  var reversal = ((rv2 && rv2.value) || '1') === '1';
                  var topicCategoryId = String((tc2 && tc2.value) || 'random');

                  startBtn.disabled = true;
                  restartGameWithSettings(roomId, {
                    minorityCount: minorityCount,
                    talkSeconds: talkSeconds,
                    reversal: reversal,
                    topicCategoryId: topicCategoryId
                  })
                    .then(function () {
                      ui.showContinueForm = false;
                    })
                    .catch(function (e) {
                      alert((e && e.message) || '失敗');
                    })
                    .finally(function () {
                      startBtn.disabled = false;
                    });
                });
              }
            });
          }

          var changePlayersBtn = document.getElementById('changePlayers');
          if (changePlayersBtn) {
            changePlayersBtn.addEventListener('click', function () {
              changePlayersBtn.disabled = true;
              resetRoomForPlayerChange(roomId, playerId)
                .then(function () {
                  var q = {};
                  var v = getCacheBusterParam();
                  if (v) q.v = v;
                  ui.cancelled = true;
                  try {
                    if (unsub) unsub();
                  } catch (eU1) {
                    // ignore
                  }
                  unsub = null;
                  try {
                    if (timerHandle) clearInterval(timerHandle);
                  } catch (eT1) {
                    // ignore
                  }
                  timerHandle = null;
                  try {
                    if (ui.lobbyUnsub) ui.lobbyUnsub();
                  } catch (eL1) {
                    // ignore
                  }
                  ui.lobbyUnsub = null;
                  setQuery(q);
                  route();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  changePlayersBtn.disabled = false;
                });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      if (timerHandle) clearInterval(timerHandle);
    });
  }

  function routeWordwolfTable(roomId, isHost) {
    var unsub = null;
    var timerHandle = null;
    var autoVoteRequested = false;
    var cancelled = false;

    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    function redirectToLobby() {
      if (!lobbyId) return;
      cancelled = true;
      try {
        if (unsub) unsub();
      } catch (eU0) {
        // ignore
      }
      unsub = null;
      try {
        if (timerHandle) clearInterval(timerHandle);
      } catch (eT0) {
        // ignore
      }
      timerHandle = null;

      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_host';
      q.gmdev = '1';
      setQuery(q);
      route();
    }

    function rerenderTimer(room) {
      var el = document.getElementById('wwTableTimer');
      if (!el) return;
      if (!room || room.phase !== 'discussion') return;
      var endAt = room && room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
      var remain = Math.max(0, Math.floor((endAt - serverNowMs()) / 1000));
      el.textContent = formatMMSS(remain);
    }

    firebaseReady()
      .then(function () {
        return subscribeRoom(roomId, function (room) {
          if (cancelled) return;
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          renderWordwolfTable(viewEl, { roomId: roomId, room: room, isHost: isHost, lobbyId: lobbyId });

          if ((room && room.phase) !== 'discussion') autoVoteRequested = false;
          if (timerHandle) clearInterval(timerHandle);
          timerHandle = setInterval(function () {
            if (cancelled) return;
            rerenderTimer(room);
            if (!autoVoteRequested && room && room.phase === 'discussion') {
              var endAt = room.discussion && room.discussion.endsAt ? room.discussion.endsAt : 0;
              if (endAt && serverNowMs() >= endAt) {
                autoVoteRequested = true;
                autoStartVotingIfEnded(roomId);
              }
            }
          }, 250);

          var revealBtn = document.getElementById('wwTableRevealNext');
          if (revealBtn && !revealBtn.__ww_bound) {
            revealBtn.__ww_bound = true;
            revealBtn.addEventListener('click', function () {
              revealAfterVoting(roomId).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var voteRevealNext = document.getElementById('wwTableVoteRevealNext');
          if (voteRevealNext && !voteRevealNext.__ww_bound) {
            voteRevealNext.__ww_bound = true;
            voteRevealNext.addEventListener('click', function () {
              voteRevealNext.disabled = true;
              advanceAfterVoteReveal(roomId)
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  voteRevealNext.disabled = false;
                });
            });
          }

          var tieRevoteBtn = document.getElementById('wwTableTieRevote');
          if (tieRevoteBtn && !tieRevoteBtn.__ww_bound) {
            tieRevoteBtn.__ww_bound = true;
            tieRevoteBtn.addEventListener('click', function () {
              tieRevoteBtn.disabled = true;
              advanceAfterVoteReveal(roomId, 'revote')
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  tieRevoteBtn.disabled = false;
                });
            });
          }

          var tieMinorityBtn = document.getElementById('wwTableTieMinorityWin');
          if (tieMinorityBtn && !tieMinorityBtn.__ww_bound) {
            tieMinorityBtn.__ww_bound = true;
            tieMinorityBtn.addEventListener('click', function () {
              tieMinorityBtn.disabled = true;
              advanceAfterVoteReveal(roomId, 'minority')
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  tieMinorityBtn.disabled = false;
                });
            });
          }

          var decideMinorityBtn = document.getElementById('wwTableDecideMinority');
          if (decideMinorityBtn && !decideMinorityBtn.__ww_bound) {
            decideMinorityBtn.__ww_bound = true;
            decideMinorityBtn.addEventListener('click', function () {
              decideWinner(roomId, 'minority').catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var decideMajorityBtn = document.getElementById('wwTableDecideMajority');
          if (decideMajorityBtn && !decideMajorityBtn.__ww_bound) {
            decideMajorityBtn.__ww_bound = true;
            decideMajorityBtn.addEventListener('click', function () {
              decideWinner(roomId, 'majority').catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var nextBtn = document.getElementById('wwTableNextToLobby');
          if (nextBtn && !nextBtn.__ww_bound) {
            nextBtn.__ww_bound = true;
            nextBtn.addEventListener('click', function () {
              if (!lobbyId) return;
              nextBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  return setLobbyCurrentGame(lobbyId, null);
                })
                .then(function () {
                  redirectToLobby();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  nextBtn.disabled = false;
                });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      try {
        if (timerHandle) clearInterval(timerHandle);
      } catch (e0) {
        // ignore
      }
      if (unsub) unsub();
    });
  }

  // -------------------- loveletter (UI / routes) --------------------
  function renderLoveLetterCreate(viewEl) {
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
        viewEl.classList.remove('ll-turn-actor');
        viewEl.classList.remove('ll-turn-waiting');
      }
    } catch (e) {
      // ignore
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ラブレター：部屋を作成</div>\n      <div id="llCreateError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>あなたの名前（表示用）</label>\n        <input id="llHostName" placeholder="例: たろう" />\n      </div>\n\n      <div class="row">\n        <button id="llCreateRoom" class="primary">QRを表示</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function readLoveLetterCreateForm() {
    var n = document.getElementById('llHostName');
    var name = String((n && n.value) || '').trim();
    if (!name) throw new Error('名前を入力してください。');
    return { name: name };
  }

  function renderLoveLetterJoin(viewEl, roomId) {
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('cn-myturn');
        viewEl.classList.remove('ll-turn-actor');
        viewEl.classList.remove('ll-turn-waiting');
      }
    } catch (e) {
      // ignore
    }
    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ラブレター：参加</div>\n      <div class="kv"><span class="muted">ルームID</span><b>' +
        escapeHtml(roomId) +
        '</b></div>\n\n      <div id="llJoinError" class="form-error" role="alert"></div>\n\n      <div class="field">\n        <label>名前（表示用）</label>\n        <input id="llPlayerName" placeholder="例: たろう" />\n      </div>\n\n      <div class="row">\n        <button id="llJoin" class="primary">参加する</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n    </div>\n  '
    );
  }

  function readLoveLetterJoinForm() {
    var el = document.getElementById('llPlayerName');
    var name = String((el && el.value) || '').trim();
    if (!name) throw new Error('名前を入力してください。');
    return { name: name };
  }

  function renderLoveLetterRejoin(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;
    var ps = (room && room.players) || {};
    var keys = Object.keys(ps);
    keys.sort(function (a, b) {
      var pa = ps[a] || {};
      var pb = ps[b] || {};
      return (pa.joinedAt || 0) - (pb.joinedAt || 0);
    });

    var picks = '';
    for (var i = 0; i < keys.length; i++) {
      var pid = String(keys[i] || '');
      if (!pid) continue;
      var p = ps[pid] || {};
      var nm = formatPlayerDisplayName(p) || pid;
      picks += '<button class="ghost llRejoinPick" data-pid="' + escapeHtml(pid) + '">' + escapeHtml(nm) + '</button>';
    }
    if (!picks) picks = '<div class="muted">参加者がいません。</div>';

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ラブレター：再参加</div>\n      <div class="kv"><span class="muted">ルームID</span><b>' +
        escapeHtml(roomId) +
        '</b></div>\n\n      <div id="llRejoinError" class="form-error" role="alert"></div>\n\n      <div class="muted">自分の名前を選んでください。</div>\n\n      <div class="stack">' +
        picks +
        '</div>\n\n      <div class="row">\n        <button id="llGoNewJoin" class="ghost">新しく参加（名前入力）</button>\n      </div>\n    </div>\n  '
    );
  }

  function makeLoveLetterJoinUrl(roomId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.room = roomId;
    q.screen = 'loveletter_join';
    return baseUrl() + '?' + buildQuery(q);
  }

  function llFormatCard(rank) {
    var d = llCardDef(rank);
    return d.name + '(' + d.rank + ')';
  }

  function llFormatCardList(arr) {
    if (!Array.isArray(arr) || !arr.length) return '-';
    var out = [];
    for (var i = 0; i < arr.length; i++) out.push(llFormatCard(arr[i]));
    return out.join(' / ');
  }

  function renderLoveLetterHost(viewEl, opts) {
    var roomId = opts.roomId;
    var joinUrl = opts.joinUrl;
    var room = opts.room;
    var hostPlayerId = opts.hostPlayerId;

    var playerCount = room && room.players ? Object.keys(room.players).length : 0;
    var phase = (room && room.phase) || '-';
    var canStart = phase === 'lobby' && playerCount >= 2;

    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('ll-turn-actor');
        viewEl.classList.remove('ll-turn-waiting');
      }
    } catch (e0) {
      // ignore
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ラブレター：QR配布</div>\n      <div class="muted">参加者はこのQRを読み取って参加します。</div>\n\n      <div class="center" id="qrWrap">\n        <canvas id="qr"></canvas>\n      </div>\n      <div class="muted center" id="qrError"></div>\n\n      <div class="field">\n        <label>参加URL（スマホ以外はこちら）</label>\n        <div class="code" id="joinUrlText">' +
        escapeHtml(joinUrl || '') +
        '</div>\n        <div class="row">\n          <button id="copyJoinUrl" class="ghost">コピー</button>\n        </div>\n        <div class="muted" id="copyStatus"></div>\n      </div>\n\n      <div class="kv"><span class="muted">参加状況</span><b>' +
        escapeHtml(String(playerCount)) +
        '</b></div>\n\n      <div class="row">\n        ' +
        (canStart ? '<button id="llStart" class="primary">スタート</button>' : '<button class="primary" disabled>スタート</button>') +
        '\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n\n      <div class="muted">※ スタート後、GM端末もプレイヤー画面に移動します。</div>\n    </div>\n  '
    );

    // keep host player id in DOM for route handlers if needed
    try {
      if (hostPlayerId) {
        var el = document.getElementById('view');
        if (el) el.setAttribute('data-ll-hostpid', String(hostPlayerId));
      }
    } catch (e) {
      // ignore
    }
  }

  function setLoveLetterExtraCards(roomId, extraCards) {
    var base = loveletterRoomPath(roomId);
    var nextExtras = llNormalizeExtraCards(extraCards);
    return runTxn(base, function (room) {
      if (!room) return room;
      if (room.phase !== 'lobby') return room;
      var settings = assign({}, room.settings || {}, { extraCards: nextExtras });
      return assign({}, room, { settings: settings });
    });
  }

  function renderLoveLetterExtras(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;
    var extras = llNormalizeExtraCards(room && room.settings ? room.settings.extraCards : []);

    var noneChecked = extras.length === 0;
    var hasMegane = extras.indexOf('8:megane') >= 0;
    var hasCountess = extras.indexOf('7:countess') >= 0;

    function cardPreview(cardId) {
      var d = llCardDef(cardId);
      var icon = d && d.icon ? String(d.icon) : '';
      if (icon) {
        return '<div class="ll-spectate-card" style="width:140px">' +
          '<img class="ll-card-img" alt="' + escapeHtml(d.name || '') + '" src="' + escapeHtml(icon) + '" />' +
          '</div>';
      }
      return '<div class="ll-spectate-card" style="width:140px"><div class="stack" style="height:100%;justify-content:center;align-items:center"><div class="big">' + escapeHtml(d.name || '-') + '</div></div></div>';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ラブレター：追加カード</div>\n      <div class="muted">ゲーム開始前に、山札に追加するカードを選びます（GMのみ）。</div>\n\n      <div id="llExtrasError" class="form-error" role="alert"></div>\n\n      <div class="card" style="padding:12px">\n        <div class="stack">\n          <label style="display:flex;gap:10px;align-items:center">\n            <input type="radio" name="llExtraMode" value="none" ' + (noneChecked ? 'checked' : '') + ' />\n            <div><b>追加カードなし</b></div>\n          </label>\n\n          <label style="display:flex;gap:10px;align-items:center">\n            <input type="radio" name="llExtraMode" value="add" ' + (!noneChecked ? 'checked' : '') + ' />\n            <div><b>追加カードを追加</b>（下から複数選択可）</div>\n          </label>\n\n          <div id="llExtrasList" class="stack" style="gap:12px;margin-top:6px">\n            <label style="display:flex;gap:12px;align-items:center">\n              <input type="checkbox" id="llExtraMegane" ' + (hasMegane ? 'checked' : '') + ' />\n              ' + cardPreview('8:megane') + '\n              <div>姫（眼鏡）(8) / 1枚</div>\n            </label>\n            <label style="display:flex;gap:12px;align-items:center">\n              <input type="checkbox" id="llExtraCountess" ' + (hasCountess ? 'checked' : '') + ' />\n              ' + cardPreview('7:countess') + '\n              <div>女侯爵(7) / 1枚</div>\n            </label>\n          </div>\n        </div>\n      </div>\n\n      <div class="row">\n        <button id="llExtrasStart" class="primary">この設定で開始</button>\n        <a class="btn ghost" href="./">戻る</a>\n      </div>\n\n      <div class="muted">※ 他の参加者はそのまま待機していてOKです。</div>\n    </div>\n  '
    );
  }

  function renderLoveLetterPlayer(viewEl, opts) {
    var roomId = opts.roomId;
    var playerId = opts.playerId;
    var room = opts.room;
    var player = opts.player;
    var isHost = !!opts.isHost;
    var ui = opts.ui || {};
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';

    var phase = (room && room.phase) || 'lobby';
    var ps = (room && room.players) || {};
    var r = room && room.round ? room.round : {};

    var selfName = formatPlayerDisplayName(player) || '';
    if (player && player.isHost && (phase === 'lobby' || phase === 'round_over' || phase === 'finished')) {
      selfName = formatPlayerMenuName(player);
    }

    var order = [];
    try {
      order = llListPlayerIdsByJoin(room);
    } catch (e0) {
      order = [];
    }

    var statusText = '';

    var myHand = r && r.hands && Array.isArray(r.hands[playerId]) ? r.hands[playerId] : [];
    var myElim = !!(r && r.eliminated && r.eliminated[playerId]);
    var myProt = !!(r && r.protected && r.protected[playerId]);

    var turnName = '';
    if (phase === 'playing' && r && r.currentPlayerId) {
      var tp = ps[r.currentPlayerId];
      turnName = tp ? formatPlayerDisplayName(tp) : String(r.currentPlayerId);
    }

    var isMyTurn = phase === 'playing' && String(r.currentPlayerId || '') === String(playerId || '') && !myElim;

    // Turn highlight / waiting dim on the whole view.
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.toggle('ll-turn-actor', !!isMyTurn);
        // Do not dim the whole view for eliminated players (spectate mode).
        viewEl.classList.toggle('ll-turn-waiting', phase === 'playing' && !isMyTurn && !myElim);
      }
    } catch (eTurn) {
      // ignore
    }

    if (phase === 'lobby') statusText = '待機中：GMがスタートするまでお待ちください。';
    else if (phase === 'playing') {
      if (myElim) statusText = 'あなたは脱落しました（観戦中）。';
      else if (isMyTurn) statusText = 'あなたの番です。';
      else statusText = '待機中：' + (turnName || '-') + ' の番です' + (myProt ? ' (僧侶により保護中)' : '');
    } else if (phase === 'finished') statusText = 'ゲーム終了';

    var deckLeft = r && Array.isArray(r.deck) ? r.deck.length : 0;
    var graveArr = r && Array.isArray(r.grave) ? r.grave : [];
    var graveCount = graveArr.length;
    var graveLatest = graveCount >= 2 ? String(graveArr[graveArr.length - 1] || '') : '';

    var pilesText = '山札 ' + String(deckLeft) + ' / 墓地 ' + String(graveCount);
    var pilesHtml =
      '<div class="ll-piles-box">' +
      '<div class="ll-piles-text">' +
      escapeHtml(pilesText) +
      '</div>' +
      (graveLatest
        ? '<img class="ll-piles-icon" alt="grave" src="' + escapeHtml((llCardDef(graveLatest) || {}).icon || '') + '" />'
        : '') +
      '</div>';

    function llCardImgHtml(rank) {
      var d = llCardDef(rank);
      var icon = d && d.icon ? String(d.icon) : '';
      if (icon) {
        return '<img class="ll-card-img" draggable="false" alt="' + escapeHtml(d.name || '') + '" src="' + escapeHtml(icon) + '" />';
      }
      return '<div class="stack" style="height:100%;justify-content:center;align-items:center"><div class="big">' + escapeHtml(d.name || '-') + '</div></div>';
    }

    function llCardBackImgHtml() {
      var backIcon = './assets/loveletter/Uramen.png';
      try {
        var v = getCacheBusterParam();
        if (v) backIcon += '?v=' + encodeURIComponent(String(v));
      } catch (e0) {
        // ignore
      }
      return '<img class="ll-card-img" draggable="false" alt="裏面" src="' + escapeHtml(backIcon) + '" />';
    }

    // Winners (single game)
    var resultHtml = '';
    if (phase === 'finished' && room && room.result && Array.isArray(room.result.winners)) {
      var fs = [];
      for (var fi = 0; fi < room.result.winners.length; fi++) {
        var fpid = room.result.winners[fi];
        fs.push(ps[fpid] ? formatPlayerDisplayName(ps[fpid]) : String(fpid));
      }
      resultHtml =
        '<div class="card center" style="padding:12px">' +
        '<div class="muted">勝者</div>' +
        '<div class="big">' +
        escapeHtml(fs.length ? fs.join(' / ') : '-') +
        '</div>' +
        (lobbyId
          ? '<hr />' +
            (isHost
              ? '<div class="row" style="justify-content:center;margin-top:10px">' +
                '<button id="llNextToLobby" class="primary">次へ</button>' +
                '</div>'
              : '<div class="muted" style="margin-top:10px">※ 次へ進むのはゲームマスターです。</div>')
          : isHost
            ? '<div class="row" style="justify-content:center;margin-top:10px">' +
              '<button id="llReplay" class="primary">もう一度</button>' +
              '<button id="llNextGame" class="ghost">次ゲームへ（参加者変更）</button>' +
              '<button id="llBackToLobby" class="ghost">ロビーに戻る</button>' +
              '</div>'
            : '') +
        '</div>';
    }

    // Spectate (eliminated players can see alive players' hands)
    var spectateHtml = '';
    if (phase === 'playing' && myElim) {
      var gridSp = '';
      for (var spi = 0; spi < order.length; spi++) {
        var spid = order[spi];
        if (!spid) continue;
        if (r && r.eliminated && r.eliminated[spid]) continue;
        var sh = r && r.hands && Array.isArray(r.hands[spid]) ? r.hands[spid] : [];
        if (!sh || !sh.length) continue;
        var snm = ps[spid] ? formatPlayerDisplayName(ps[spid]) : String(spid);
        var cardsHtml = '';
        for (var sj = 0; sj < sh.length && sj < 2; sj++) {
          var sr = String(sh[sj] || '');
          if (!sr) continue;
          cardsHtml += '<div class="ll-spectate-card">' + llCardImgHtml(sr) + '</div>';
        }
        if (!cardsHtml) continue;
        gridSp +=
          '<div class="ll-showdown-item">' +
          '<div class="ll-modal-name">' + escapeHtml(snm) + '</div>' +
          '<div class="ll-spectate-cards' + (sh.length >= 2 ? ' ll-spectate-cards--stack' : '') + '">' + cardsHtml + '</div>' +
          '</div>';
      }
      if (gridSp) {
        spectateHtml =
          '<div class="card" style="padding:10px">' +
          '<div class="big">観戦</div>' +
          '<div class="muted">生存者の手札</div>' +
          '<div class="ll-showdown-grid">' +
          gridSp +
          '</div>' +
          '</div>';
      }
    }

    // Hand (always show your card while waiting)
    var handHtml = '';
    if (phase === 'playing' && !myElim && Array.isArray(myHand) && myHand.length) {
      var frontIdx = parseIntSafe(ui.handFrontIndex, 0);
      if (!(frontIdx === 0 || frontIdx === 1)) frontIdx = myHand.length >= 2 ? 1 : 0;
      if (myHand.length < 2) frontIdx = 0;
      var backIdx = myHand.length >= 2 ? (frontIdx === 0 ? 1 : 0) : -1;
      var frontRank = myHand[frontIdx] ? String(myHand[frontIdx]) : '';
      var backRank = backIdx >= 0 && myHand[backIdx] ? String(myHand[backIdx]) : '';
      var must7 = llMustPlayCountess(myHand);

      handHtml =
        '<div class="ll-hand-wrap">' +
        '<div class="ll-hand" id="llHand" data-frontidx="' + escapeHtml(String(frontIdx)) + '">' +
        (backRank
          ? '<div class="ll-card ll-card-back" id="llCardBack" data-rank="' + escapeHtml(backRank) + '">' + llCardImgHtml(backRank) + '</div>'
          : '') +
        '<div class="ll-card ll-card-front" id="llCardFront" data-rank="' + escapeHtml(frontRank) + '">' +
        llCardImgHtml(frontRank) +
        '</div>' +
        '</div>' +
        (isMyTurn
          ? '<div class="muted center ll-hint">タップで前後切替 / 長押しで使用</div>'
          : '<div class="muted center ll-hint">あなたの手札</div>') +
        (isMyTurn && must7 ? '<div class="muted center">※ 女侯爵(7)を必ず使用（合計12以上）</div>' : '') +
        '</div>';
    }

    // Action modal (target/guess)
    var modalHtml = '';
    if (ui && ui.pending && ui.pending.card) {
      var pending = ui.pending;
      var pendingCard = String(pending.card);
      var pc = llCardRankStr(pendingCard);
      var needsTarget = pc === '1' || pc === '2' || pc === '3' || pc === '5' || pc === '6';
      var allowSelfTarget = pc === '5';
      var needsGuess = pc === '1';
      var compactSelectOnly = pc === '1' || pc === '5';

      var eligible = [];
      for (var pi = 0; pi < order.length; pi++) {
        var pid2 = order[pi];
        if (!pid2) continue;
        if (!allowSelfTarget && pid2 === playerId) continue;
        if (r && r.eliminated && r.eliminated[pid2]) continue;
        eligible.push(pid2);
      }

      // Auto-select when only one eligible target.
      if (needsTarget && eligible.length === 1 && !pending.target) {
        pending.target = eligible[0];
      }

      var canConfirm = true;
      if (needsGuess && !pending.guess) canConfirm = false;
      if (needsTarget && eligible.length && !pending.target) canConfirm = false;

      var targetBtns = '';
      if (needsTarget) {
        if (!eligible.length) {
          targetBtns = '<div class="muted">対象にできる相手がいません。</div>';
        } else {
          for (var ti = 0; ti < eligible.length; ti++) {
            var tid = eligible[ti];
            var tnm = ps[tid] ? formatPlayerDisplayName(ps[tid]) : tid;
            var sel = pending.target === tid;
            var prot = r && r.protected && r.protected[tid];
            targetBtns +=
              '<button class="ghost llPickTarget" data-target="' +
              escapeHtml(tid) +
              '" style="width:100%">' +
              (sel ? '✓ ' : '') +
              escapeHtml(tnm + (prot ? ' (僧侶により保護中)' : '')) +
              '</button>';
          }
        }
      }

      var guessBtns = '';
      if (needsGuess) {
        for (var gv = 2; gv <= 8; gv++) {
          var gr = String(gv);
          var gsel = pending.guess === gr;
          guessBtns +=
            '<button class="ghost llPickGuess" data-guess="' +
            escapeHtml(gr) +
            '">' +
            (gsel ? '✓ ' : '') +
            escapeHtml(llFormatCard(gr)) +
            '</button>';
        }
      }

      modalHtml =
        '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
        '<div class="ll-overlay-backdrop"></div>' +
        '<div class="ll-overlay-panel">' +
        '<div class="big ll-modal-title">' +
        escapeHtml(llCardDef(pendingCard).name + ' を使用') +
        '</div>' +
        (compactSelectOnly
          ? ''
          : '<div class="ll-action-card">' +
            llCardImgHtml(pendingCard) +
            '</div>') +
        (needsTarget ? '<div class="muted">対象</div><div class="stack">' + targetBtns + '</div>' : '') +
        (needsGuess ? '<div class="muted">推測</div><div class="ll-guess-grid">' + guessBtns + '</div>' : '') +
        '<div id="llPlayError" class="form-error" role="alert"></div>' +
        '<div class="row ll-modal-actions" style="justify-content:space-between">' +
        '<button id="llCancelPlay" class="ghost">キャンセル</button>' +
        '<button id="llConfirmPlay" class="primary" ' +
        (canConfirm ? '' : 'disabled') +
        '>使用</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    }

    // Peek modal (道化)
    if (!ui.ackInFlight && ui && ui.modal && ui.modal.type === 'peek') {
      var m = ui.modal;
      modalHtml =
        '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
        '<div class="ll-overlay-backdrop"></div>' +
        '<div class="ll-overlay-panel">' +
        '<div class="big">道化：確認</div>' +
        '<div class="ll-modal-name">' + escapeHtml(String(m.targetName || '')) + '</div>' +
        '<div class="ll-reveal-card">' + llCardImgHtml(String(m.rank || '')) + '</div>' +
        '<div class="row" style="justify-content:flex-end">' +
        '<button id="llAck" class="primary">OK</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    } else if (!ui.ackInFlight && ui && ui.modal && ui.modal.type === 'peek_wait') {
      // Show to other players while someone is peeking.
      var mw = ui.modal;
      modalHtml =
        '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
        '<div class="ll-overlay-backdrop"></div>' +
        '<div class="ll-overlay-panel">' +
        '<div class="big">道化：確認中</div>' +
        '<div class="muted">' +
        escapeHtml(String(mw.byName || '') + ' が ' + String(mw.targetName || '') + ' の手札を確認中') +
        '</div>' +
        '<div class="muted center" style="margin-top:10px">（処理が終わるまでお待ちください）</div>' +
        '</div>' +
        '</div>';
    }

    // Reveal modal (兵士/騎士/将軍交換/大臣オーバー/全員公開)
    if (!ui.ackInFlight && !modalHtml && phase === 'playing' && r && r.reveal && r.reveal.type) {
      var rv = r.reveal;
      if (rv.type === 'guard') {
        var by0 = String(rv.by || '');
        var tg0 = String(rv.target || '');
        var byName0 = ps[by0] ? formatPlayerDisplayName(ps[by0]) : by0;
        var tgName0 = ps[tg0] ? formatPlayerDisplayName(ps[tg0]) : tg0;
        var guess0 = String(rv.guess || '');
        var res0 = String(rv.result || '');
        var resText0 = res0 === 'hit' ? '該当（脱落）' : res0 === 'miss' ? '非該当' : '不明';
        if (rv.protected) resText0 = '無効（保護中）';
        modalHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="big">兵士：推測結果</div>' +
          '<div class="muted">' + escapeHtml(byName0 + ' → ' + tgName0) + '</div>' +
          '<div class="ll-reveal-card">' + llCardImgHtml(guess0) + '</div>' +
          '<div class="big center">' + escapeHtml(resText0) + '</div>' +
          '<div class="row" style="justify-content:flex-end">' +
          (String(playerId) === by0 ? '<button id="llAck" class="primary">次へ</button>' : '<div class="muted">' + escapeHtml(byName0) + ' が進めます</div>') +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (rv.type === 'knight' || rv.type === 'general_swap') {
        var by = String(rv.by || '');
        var tg = String(rv.target || '');
        var byName = ps[by] ? formatPlayerDisplayName(ps[by]) : by;
        var tgName = ps[tg] ? formatPlayerDisplayName(ps[tg]) : tg;

        if (rv.type === 'knight') {
          // Only the two involved players see the compared cards; others see a minimal "in progress" message.
          if (String(playerId) === by || String(playerId) === tg) {
            modalHtml =
              '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
              '<div class="ll-overlay-backdrop"></div>' +
              '<div class="ll-overlay-panel">' +
              '<div class="big">騎士：比較結果</div>' +
              '<div class="ll-compare-row">' +
              '<div class="ll-compare-col">' +
              '<div class="ll-modal-name">' +
              escapeHtml(byName) +
              '</div>' +
              '<div class="ll-compare-card">' +
              llCardImgHtml(String(rv.byCard || '')) +
              '</div>' +
              '</div>' +
              '<div class="ll-compare-col">' +
              '<div class="ll-modal-name">' +
              escapeHtml(tgName) +
              '</div>' +
              '<div class="ll-compare-card">' +
              llCardImgHtml(String(rv.targetCard || '')) +
              '</div>' +
              '</div>' +
              '</div>' +
              '<div class="row" style="justify-content:flex-end">' +
              (String(playerId) === by ? '<button id="llAck" class="primary">次へ</button>' : '') +
              '</div>' +
              '</div>' +
              '</div>';
          } else {
            modalHtml =
              '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
              '<div class="ll-overlay-backdrop"></div>' +
              '<div class="ll-overlay-panel">' +
              '<div class="big">騎士：勝負中</div>' +
              '<div class="muted">' + escapeHtml(byName + ' が ' + tgName + ' と勝負中') + '</div>' +
              '<div class="muted center" style="margin-top:10px">（処理が終わるまでお待ちください）</div>' +
              '</div>' +
              '</div>';
          }
        } else {
          // General swap stays private to the two involved players.
          if (String(playerId) === by || String(playerId) === tg) {
            modalHtml =
              '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
              '<div class="ll-overlay-backdrop"></div>' +
              '<div class="ll-overlay-panel">' +
              '<div class="big">将軍：手札交換</div>' +
              '<div class="ll-compare-row">' +
              '<div class="ll-compare-col">' +
              '<div class="ll-modal-name">' +
              escapeHtml(byName) +
              '</div>' +
              '<div class="ll-compare-card">' +
              llCardImgHtml(String(rv.byCard || '')) +
              '</div>' +
              '</div>' +
              '<div class="ll-compare-col">' +
              '<div class="ll-modal-name">' +
              escapeHtml(tgName) +
              '</div>' +
              '<div class="ll-compare-card">' +
              llCardImgHtml(String(rv.targetCard || '')) +
              '</div>' +
              '</div>' +
              '</div>' +
              '<div class="row" style="justify-content:flex-end">' +
              (String(playerId) === by ? '<button id="llAck" class="primary">次へ</button>' : '') +
              '</div>' +
              '</div>' +
              '</div>';
          }
        }
      } else if (rv.type === 'minister_overload') {
        var by2 = String(rv.by || '');
        if (String(playerId) === by2) {
          var drew2 = String(rv.drew || '');
          modalHtml =
            '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
            '<div class="ll-overlay-backdrop"></div>' +
            '<div class="ll-overlay-panel">' +
            '<div class="big">大臣：合計12以上</div>' +
            '<div class="ll-compare-row">' +
            '<div class="ll-compare-col">' +
            '<div class="ll-modal-name">手札</div>' +
            '<div class="ll-compare-card">' + llCardImgHtml(String(rv.had || '7')) + '</div>' +
            '</div>' +
            '<div class="ll-compare-col">' +
            '<div class="ll-modal-name">引いたカード</div>' +
            '<div class="ll-compare-card">' + (drew2 ? llCardImgHtml(drew2) : llCardBackImgHtml()) + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="row" style="justify-content:flex-end">' +
            '<button id="llAck" class="primary">脱落</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        }
      } else if (rv.type === 'showdown') {
        var hostId = String(rv.hostId || '');
        var handsMap = rv.hands || {};
        var grid = '';
        for (var sdi = 0; sdi < order.length; sdi++) {
          var pid3 = order[sdi];
          if (!pid3) continue;
          if (r && r.eliminated && r.eliminated[pid3]) continue;
          var h = handsMap && handsMap[pid3] && Array.isArray(handsMap[pid3]) ? handsMap[pid3] : (r.hands && Array.isArray(r.hands[pid3]) ? r.hands[pid3] : []);
          if (!h || !h.length) continue;
          var nm = ps[pid3] ? formatPlayerDisplayName(ps[pid3]) : String(pid3);
          grid +=
            '<div class="ll-showdown-item">' +
            '<div class="ll-modal-name">' + escapeHtml(nm) + '</div>' +
            '<div class="ll-showdown-card">' + llCardImgHtml(String(h[0] || '')) + '</div>' +
            '</div>';
        }
        modalHtml =
          '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
          '<div class="ll-overlay-backdrop"></div>' +
          '<div class="ll-overlay-panel">' +
          '<div class="big">山札切れ：全員公開</div>' +
          '<div class="ll-showdown-grid">' +
          grid +
          '</div>' +
          '<div class="row" style="justify-content:flex-end">' +
          (String(playerId) === hostId ? '<button id="llAck" class="primary">結果発表</button>' : '<div class="muted">GMが結果発表します</div>') +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (rv.type === 'wizard_discard') {
        var by3 = String(rv.by || '');
        if (String(playerId) === by3) {
          var tId = String(rv.target || '');
          var tName = ps[tId] ? formatPlayerDisplayName(ps[tId]) : tId;
          var discarded = String(rv.discarded || '');
          modalHtml =
            '<div class="ll-overlay ll-sheet" role="dialog" aria-modal="true">' +
            '<div class="ll-overlay-backdrop"></div>' +
            '<div class="ll-overlay-panel">' +
            '<div class="big">魔術師：' +
            escapeHtml(tName) +
            '</div>' +
            '<div class="ll-compare-row">' +
            '<div class="ll-compare-col">' +
            '<div class="ll-modal-name">捨て札</div>' +
            '<div class="ll-compare-card">' +
            llCardImgHtml(discarded) +
            '</div>' +
            '</div>' +
            '<div class="ll-compare-col">' +
            '<div class="ll-modal-name">引いたカード</div>' +
            '<div class="ll-compare-card">' +
            llCardBackImgHtml() +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="row" style="justify-content:flex-end">' +
            '<button id="llAck" class="primary">次へ</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        }
      }
    }

    render(
      viewEl,
      '\n    <div class="stack ll-player">\n      ' +
        '\n      <div class="big ll-player-name">' +
        escapeHtml(selfName) +
        '</div>\n\n      ' +
        pilesHtml +
        '\n\n      <div class="card ll-status-card" style="padding:10px">\n        <div class="ll-topline">\n          <div class="ll-status">' +
        escapeHtml(statusText || '') +
        '</div>\n        </div>\n      </div>\n\n      ' +
        (resultHtml || '') +
        '\n\n      ' +
        (spectateHtml || '') +
        '\n\n      ' +
        (handHtml || '') +
        '\n\n      ' +
        (modalHtml || '') +
        '\n    </div>\n  '
    );
  }

  function routeLoveLetterCreate() {
    renderLoveLetterCreate(viewEl);
    clearInlineError('llCreateError');
    var btn = document.getElementById('llCreateRoom');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var form;
      try {
        clearInlineError('llCreateError');
        form = readLoveLetterCreateForm();
      } catch (e) {
        setInlineError('llCreateError', (e && e.message) || '入力を確認してください。');
        return;
      }
      var roomId = makeRoomId();
      firebaseReady()
        .then(function () {
          return createLoveLetterRoom(roomId, {});
        })
        .then(function () {
          var playerId = getOrCreateLoveLetterPlayerId(roomId);
          return joinPlayerInLoveLetterRoom(roomId, playerId, form.name, true);
        })
        .then(function () {
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.host = '1';
          q.screen = 'loveletter_host';
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '作成に失敗しました');
        });
    });
  }

  function routeLoveLetterJoin(roomId, isHost) {
    renderLoveLetterJoin(viewEl, roomId);
    clearInlineError('llJoinError');
    stripBackNavLinks(viewEl);
    var btn = document.getElementById('llJoin');
    if (!btn) return;

    // Auto-join support (used by lobby).
    try {
      var q0 = parseQuery();
      var nm0 = q0 && q0.name ? String(q0.name) : '';
      if (nm0) {
        var input0 = document.getElementById('llPlayerName');
        if (input0) input0.value = nm0;
      }
    } catch (e0) {
      // ignore
    }

    function doJoin() {
      var form;
      try {
        clearInlineError('llJoinError');
        form = readLoveLetterJoinForm();
      } catch (e) {
        setInlineError('llJoinError', (e && e.message) || '入力を確認してください。');
        return;
      }

      // Prefer existing stored id (for rejoin) if present.
      var storedId = '';
      try {
        storedId = String(localStorage.getItem('ll_player_' + roomId) || '');
      } catch (e0) {
        storedId = '';
      }

      firebaseReady()
        .then(function () {
          var qx = parseQuery();
          var lobbyId = qx && qx.lobby ? String(qx.lobby) : '';
          var playerId = storedId || getOrCreateLoveLetterPlayerId(roomId);

          if (lobbyId) {
            var mid = getOrCreateLobbyMemberId(lobbyId);
            setLoveLetterPlayerId(roomId, mid);
            playerId = mid;
          }

          return joinPlayerInLoveLetterRoom(roomId, playerId, form.name, false).then(function (room) {
            if (!room) throw new Error('部屋が見つかりません');

            // If the game already started, joining is blocked; try to re-use the previous id.
            if (room.players && room.players[playerId]) return playerId;
            if (storedId && room.players && room.players[storedId]) {
              setLoveLetterPlayerId(roomId, storedId);
              return storedId;
            }

            // Started game -> guide to rejoin picker.
            if (String(room.phase || '') !== 'lobby') {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.screen = 'loveletter_rejoin';
              if (isHost) q.host = '1';
              if (lobbyId) q.lobby = lobbyId;
              setQuery(q);
              route();
              return '';
            }

            throw new Error('参加できません（ゲームが開始済みです）');
          });
        })
        .then(function (pid) {
          if (!pid) return;
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.screen = 'loveletter_player';
          q.player = '1';
          if (isHost) q.host = '1';
          try {
            var qx2 = parseQuery();
            if (qx2 && qx2.lobby) q.lobby = String(qx2.lobby);
          } catch (e2) {
            // ignore
          }
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '参加に失敗しました');
        });
    }

    btn.addEventListener('click', doJoin);

    try {
      var q1 = parseQuery();
      if (q1 && String(q1.autojoin || '') === '1') {
        setTimeout(function () {
          doJoin();
        }, 0);
      }
    } catch (e1) {
      // ignore
    }
  }

  function routeLoveLetterRejoin(roomId, isHost) {
    var unsub = null;

    firebaseReady()
      .then(function () {
        return subscribeLoveLetterRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          if (String(room.phase || '') === 'lobby') {
            var q0 = {};
            var v0 = getCacheBusterParam();
            if (v0) q0.v = v0;
            q0.room = roomId;
            q0.screen = 'loveletter_join';
            if (isHost) q0.host = '1';
            try {
              var qq = parseQuery();
              if (qq && qq.lobby) q0.lobby = String(qq.lobby);
            } catch (e0) {
              // ignore
            }
            setQuery(q0);
            route();
            return;
          }

          renderLoveLetterRejoin(viewEl, { roomId: roomId, room: room });
          clearInlineError('llRejoinError');
          stripBackNavLinks(viewEl);

          var goNew = document.getElementById('llGoNewJoin');
          if (goNew && !goNew.__ll_bound) {
            goNew.__ll_bound = true;
            goNew.addEventListener('click', function () {
              var q1 = {};
              var v1 = getCacheBusterParam();
              if (v1) q1.v = v1;
              q1.room = roomId;
              q1.screen = 'loveletter_join';
              if (isHost) q1.host = '1';
              try {
                var qq2 = parseQuery();
                if (qq2 && qq2.lobby) q1.lobby = String(qq2.lobby);
              } catch (e1) {
                // ignore
              }
              setQuery(q1);
              route();
            });
          }

          var picks = document.querySelectorAll('.llRejoinPick');
          for (var i = 0; i < picks.length; i++) {
            var b = picks[i];
            if (!b || b.__ll_bound) continue;
            b.__ll_bound = true;
            b.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              var pid = el ? String(el.getAttribute('data-pid') || '') : '';
              if (!pid) {
                setInlineError('llRejoinError', '選択に失敗しました');
                return;
              }
              setLoveLetterPlayerId(roomId, pid);
              touchLoveLetterPlayer(roomId, pid).catch(function () {
                // ignore
              });

              var q2 = {};
              var v2 = getCacheBusterParam();
              if (v2) q2.v = v2;
              q2.room = roomId;
              q2.screen = 'loveletter_player';
              q2.player = '1';
              var p = room && room.players ? room.players[pid] : null;
              if (isHost || (p && p.isHost)) q2.host = '1';
              try {
                var qq3 = parseQuery();
                if (qq3 && qq3.lobby) q2.lobby = String(qq3.lobby);
              } catch (e2) {
                // ignore
              }
              setQuery(q2);
              route();
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeLoveLetterHost(roomId) {
    var unsub = null;
    var joinUrl = makeLoveLetterJoinUrl(roomId);
    var hostPlayerId = getOrCreateLoveLetterPlayerId(roomId);

    function drawQr() {
      return new Promise(function (resolve) {
        var canvas = document.getElementById('qr');
        var errEl = document.getElementById('qrError');
        var wrapEl = document.getElementById('qrWrap');
        if (errEl) errEl.textContent = '';

        function showAsRemoteImage() {
          if (!wrapEl) return resolve();
          var src =
            'https://api.qrserver.com/v1/create-qr-code/?size=' +
            encodeURIComponent('240x240') +
            '&data=' +
            encodeURIComponent(String(joinUrl || ''));
          try {
            wrapEl.innerHTML = '';
            var img = document.createElement('img');
            img.id = 'qrImg';
            img.alt = 'QR';
            img.referrerPolicy = 'no-referrer';
            img.onload = function () {
              if (errEl) errEl.textContent = '（外部サービスでQRを生成しています）';
              resolve();
            };
            img.onerror = function () {
              if (errEl) errEl.textContent = 'QR画像の読み込みに失敗しました（ネットワーク/フィルタの可能性）。URLコピーで参加してください。';
              resolve();
            };
            img.src = src;
            wrapEl.appendChild(img);
            return;
          } catch (e) {
            wrapEl.innerHTML = '<img id="qrImg" alt="QR" src="' + escapeHtml(src) + '" />';
            if (errEl) errEl.textContent = '（外部サービスでQRを生成しています）';
            return resolve();
          }
        }

        if (!canvas) {
          if (errEl) errEl.textContent = 'QR表示領域が見つかりません。';
          return resolve();
        }
        var qr = window.QRCode || window.qrcode || window.QR;
        if (!qr || !qr.toCanvas) {
          return showAsRemoteImage();
        }

        function showAsImage() {
          if (!qr.toDataURL || !wrapEl) return showAsRemoteImage();
          try {
            qr.toDataURL(joinUrl, { margin: 1, width: 240 }, function (err, url) {
              if (err || !url) {
                return showAsRemoteImage();
              }
              wrapEl.innerHTML = '<img id="qrImg" alt="QR" src="' + escapeHtml(url) + '" />';
              if (errEl) errEl.textContent = '（QRは画像で表示しています）';
              return resolve();
            });
          } catch (e) {
            return showAsRemoteImage();
          }
        }

        function looksBlank(c) {
          try {
            var ctx = c.getContext && c.getContext('2d');
            if (!ctx) return true;
            var w = c.width || 0;
            var h = c.height || 0;
            if (!w || !h) return true;
            var img = ctx.getImageData(0, 0, Math.min(16, w), Math.min(16, h)).data;
            var allZero = true;
            var allWhite = true;
            for (var i = 0; i < img.length; i += 4) {
              var r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
              if (a !== 0) allZero = false;
              if (!(a !== 0 && r > 240 && g > 240 && b > 240)) allWhite = false;
              if (!allZero && !allWhite) return false;
            }
            return allZero || allWhite;
          } catch (e) {
            return true;
          }
        }

        try {
          qr.toCanvas(canvas, joinUrl, { margin: 1, width: 240 }, function (err) {
            if (err) {
              if (errEl) errEl.textContent = 'QRの生成に失敗しました。';
              showAsRemoteImage();
              return;
            }
            if (looksBlank(canvas)) {
              showAsRemoteImage();
              return;
            }
            resolve();
          });
        } catch (e) {
          if (errEl) errEl.textContent = 'QRの生成に失敗しました。';
          showAsRemoteImage();
        }
      });
    }

    function bindHostButtons(room) {
      var copyBtn = document.getElementById('copyJoinUrl');
      if (copyBtn && !copyBtn.__ll_bound) {
        copyBtn.__ll_bound = true;
        copyBtn.addEventListener('click', function () {
          var st = document.getElementById('copyStatus');
          if (st) st.textContent = 'コピー中...';
          copyTextToClipboard(joinUrl)
            .then(function (ok) {
              if (!st) return;
              st.textContent = ok ? 'コピーしました' : 'コピーできませんでした（長押しで選択してコピーしてください）';
            })
            .catch(function () {
              if (st) st.textContent = 'コピーできませんでした（長押しで選択してコピーしてください）';
            });
        });
      }

      var startBtn = document.getElementById('llStart');
      if (startBtn && !startBtn.__ll_bound) {
        startBtn.__ll_bound = true;
        startBtn.addEventListener('click', function () {
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.host = '1';
          q.player = '1';
          q.screen = 'loveletter_extras';
          setQuery(q);
          route();
        });
      }
    }

    firebaseReady()
      .then(function () {
        return subscribeLoveLetterRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }
          renderLoveLetterHost(viewEl, { roomId: roomId, joinUrl: joinUrl, room: room, hostPlayerId: hostPlayerId });
          drawQr();
          bindHostButtons(room);
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeLoveLetterExtras(roomId, isHost) {
    var unsub = null;
    var playerId = getOrCreateLoveLetterPlayerId(roomId);
    var isTableGm = false;
    try {
      var q0 = parseQuery();
      isTableGm = q0 && String(q0.gmdev || '') === '1';
    } catch (eGm0) {
      isTableGm = false;
    }

    var lobbyId = '';
    try {
      var qLobby = parseQuery();
      lobbyId = qLobby && qLobby.lobby ? String(qLobby.lobby) : '';
    } catch (eLobby0) {
      lobbyId = '';
    }

    function redirectToLobby() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_host';
      try {
        var qx = parseQuery();
        if (qx && String(qx.gmdev || '') === '1') q.gmdev = '1';
      } catch (e) {
        // ignore
      }
      setQuery(q);
      route();
    }

    var lobbyReturnWatching = false;
    var lobbyUnsub = null;
    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (lobbyReturnWatching) return;
      lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'loveletter' || rid !== String(roomId || '')) {
              try {
                if (lobbyUnsub) lobbyUnsub();
              } catch (e) {
                // ignore
              }
              lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    firebaseReady()
      .then(function () {
        if (lobbyId) ensureLobbyReturnWatcher();
        return subscribeLoveLetterRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          // Only the host player can use this screen.
          var me = room && room.players && playerId ? room.players[playerId] : null;
          if (!me || !me.isHost || !isHost) {
            var qx = {};
            var vx = getCacheBusterParam();
            if (vx) qx.v = vx;
            qx.room = roomId;
            qx.player = '1';
            if (isHost) qx.host = '1';
            try {
              var qq = parseQuery();
              if (qq && qq.lobby) qx.lobby = String(qq.lobby);
            } catch (e0) {
              // ignore
            }
            qx.screen = 'loveletter_player';
            setQuery(qx);
            route();
            return;
          }

          // If already started, skip.
          if (room.phase !== 'lobby') {
            var qy = {};
            var vy = getCacheBusterParam();
            if (vy) qy.v = vy;
            qy.room = roomId;
            qy.host = '1';
            try {
              var qq2 = parseQuery();
              if (qq2 && qq2.lobby) qy.lobby = String(qq2.lobby);
              if (qq2 && String(qq2.gmdev || '') === '1') qy.gmdev = '1';
            } catch (e1) {
              // ignore
            }
            if (!isTableGm) qy.player = '1';
            qy.screen = isTableGm ? 'loveletter_table' : 'loveletter_player';
            setQuery(qy);
            route();
            return;
          }

          renderLoveLetterExtras(viewEl, { roomId: roomId, room: room });

          function syncModeUi() {
            var mode = 'none';
            try {
              var radios = document.querySelectorAll('input[name="llExtraMode"]');
              for (var i = 0; i < radios.length; i++) {
                var r = radios[i];
                if (r && r.checked) mode = String(r.value || 'none');
              }
            } catch (e2) {
              mode = 'none';
            }
            var disabled = mode !== 'add';
            var cb1 = document.getElementById('llExtraMegane');
            var cb2 = document.getElementById('llExtraCountess');
            if (cb1) {
              cb1.disabled = disabled;
              if (disabled) cb1.checked = false;
            }
            if (cb2) {
              cb2.disabled = disabled;
              if (disabled) cb2.checked = false;
            }
          }

          try {
            var radios2 = document.querySelectorAll('input[name="llExtraMode"]');
            for (var ri = 0; ri < radios2.length; ri++) {
              (function (el) {
                if (!el || el.__ll_bound) return;
                el.__ll_bound = true;
                el.addEventListener('change', syncModeUi);
              })(radios2[ri]);
            }
          } catch (e3) {
            // ignore
          }
          syncModeUi();

          var btn = document.getElementById('llExtrasStart');
          if (btn && !btn.__ll_bound) {
            btn.__ll_bound = true;
            btn.addEventListener('click', function () {
              clearInlineError('llExtrasError');
              var mode = 'none';
              try {
                var radios3 = document.querySelectorAll('input[name="llExtraMode"]');
                for (var i3 = 0; i3 < radios3.length; i3++) {
                  var r3 = radios3[i3];
                  if (r3 && r3.checked) mode = String(r3.value || 'none');
                }
              } catch (e4) {
                mode = 'none';
              }

              var extras = [];
              if (mode === 'add') {
                var mEl = document.getElementById('llExtraMegane');
                var cEl = document.getElementById('llExtraCountess');
                if (mEl && mEl.checked) extras.push('8:megane');
                if (cEl && cEl.checked) extras.push('7:countess');
              }

              btn.disabled = true;
              setLoveLetterExtraCards(roomId, extras)
                .then(function () {
                  return startLoveLetterGame(roomId, playerId);
                })
                .then(function () {
                  var qz = {};
                  var vz = getCacheBusterParam();
                  if (vz) qz.v = vz;
                  qz.room = roomId;
                  qz.host = '1';
                  try {
                    var qq3 = parseQuery();
                    if (qq3 && qq3.lobby) qz.lobby = String(qq3.lobby);
                    if (qq3 && String(qq3.gmdev || '') === '1') qz.gmdev = '1';
                  } catch (e5) {
                    // ignore
                  }
                  if (!isTableGm) qz.player = '1';
                  qz.screen = isTableGm ? 'loveletter_table' : 'loveletter_player';
                  setQuery(qz);
                  route();
                })
                .catch(function (e6) {
                  btn.disabled = false;
                  setInlineError('llExtrasError', (e6 && e6.message) || '開始に失敗しました');
                });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeLoveLetterPlayer(roomId, isHost) {
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.add('ll-player-screen');
      }
    } catch (e0) {
      // ignore
    }

    var playerId = getOrCreateLoveLetterPlayerId(roomId);
    var unsub = null;
    var ui = { pending: null, modal: null, handFrontIndex: 1, peekDismissedKey: '', ackInFlight: false, modalScrollTop: 0, cancelled: false };
    var lastRoom = null;

    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e00) {
      lobbyId = '';
    }

    ui.lobbyReturnWatching = false;
    ui.lobbyUnsub = null;

    function redirectToLobby() {
      if (!lobbyId) return;
      ui.cancelled = true;
      try {
        if (unsub) unsub();
      } catch (eU0) {
        // ignore
      }
      unsub = null;
      try {
        if (ui && ui.lobbyUnsub) ui.lobbyUnsub();
      } catch (eL0) {
        // ignore
      }
      ui.lobbyUnsub = null;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = isHost ? 'lobby_host' : 'lobby_player';
      setQuery(q);
      route();
    }

    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (ui.lobbyReturnWatching) return;
      ui.lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'loveletter' || rid !== String(roomId || '')) {
              try {
                if (ui.lobbyUnsub) ui.lobbyUnsub();
              } catch (e) {
                // ignore
              }
              ui.lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          ui.lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    function computePeekModal(room) {
      try {
        var r = room && room.round ? room.round : null;
        if (!r || !r.peek) return null;
        var pk = r.peek;
        if (String(pk.to || '') !== String(playerId || '')) return null;
        if (!pk.until || serverNowMs() > pk.until) return null;
        var key = String(pk.to || '') + '|' + String(pk.until || '') + '|' + String(pk.target || '') + '|' + String(pk.card || '');
        if (ui.peekDismissedKey && ui.peekDismissedKey === key) return null;
        var ps = room && room.players ? room.players : {};
        var targetName = pk.target && ps[pk.target] ? formatPlayerDisplayName(ps[pk.target]) : String(pk.target || '');
        return { type: 'peek', key: key, targetName: targetName, rank: String(pk.card || '') };
      } catch (e) {
        return null;
      }
    }

    function computePeekWaitModal(room) {
      try {
        var r = room && room.round ? room.round : null;
        if (!r || !r.peek) return null;
        var pk = r.peek;
        if (!pk.until || serverNowMs() > pk.until) return null;
        // Only show to non-peekers.
        if (String(pk.to || '') === String(playerId || '')) return null;
        var ps = room && room.players ? room.players : {};
        var byName = pk.to && ps[pk.to] ? formatPlayerDisplayName(ps[pk.to]) : String(pk.to || '');
        var targetName = pk.target && ps[pk.target] ? formatPlayerDisplayName(ps[pk.target]) : String(pk.target || '');
        if (!byName && !targetName) return null;
        return { type: 'peek_wait', byName: byName, targetName: targetName };
      } catch (e) {
        return null;
      }
    }

    function renderNow(room) {
      lastRoom = room;
      // Show peek modal (道化) on top when applicable.
      if (!ui.ackInFlight && !ui.pending) {
        var pm = computePeekModal(room);
        if (pm) ui.modal = pm;
        else {
          var pmo = computePeekWaitModal(room);
          ui.modal = pmo ? pmo : null;
        }
      }

      var player = room && room.players ? room.players[playerId] : null;
      renderLoveLetterPlayer(viewEl, { roomId: roomId, playerId: playerId, player: player, room: room, isHost: isHost, ui: ui, lobbyId: lobbyId });

      // Prevent long-press image search/callout and dragging on card images.
      try {
        var imgs = document.querySelectorAll('.ll-card-img');
        for (var ii = 0; ii < imgs.length; ii++) {
          var im = imgs[ii];
          if (!im) continue;
          try {
            im.setAttribute('draggable', 'false');
          } catch (e0) {
            // ignore
          }
          if (!im.__ll_img_bound) {
            im.__ll_img_bound = true;
            im.addEventListener('contextmenu', function (ev) {
              if (ev && ev.preventDefault) ev.preventDefault();
              if (ev && ev.stopPropagation) ev.stopPropagation();
              return false;
            });
            im.addEventListener('dragstart', function (ev) {
              if (ev && ev.preventDefault) ev.preventDefault();
              if (ev && ev.stopPropagation) ev.stopPropagation();
              return false;
            });
          }
        }
      } catch (eImg) {
        // ignore
      }

      // Restore scroll position inside modal panel (prevents jumping to top on rerender).
      try {
        var panel = document.querySelector('.ll-overlay-panel');
        if (panel && ui && typeof ui.modalScrollTop === 'number') {
          panel.scrollTop = ui.modalScrollTop;
        }
      } catch (eScroll) {
        // ignore
      }

      var ackBtn = document.getElementById('llAck');
      if (ackBtn && !ackBtn.__ll_bound) {
        ackBtn.__ll_bound = true;

        var doAck = function (ev) {
          if (ui.ackInFlight) return;
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();

          if (ui.modal && ui.modal.type === 'peek' && ui.modal.key) {
            ui.peekDismissedKey = String(ui.modal.key);
          }

          ui.pending = null;
          ui.modal = null;
          ui.ackInFlight = true;

          // Close modal immediately on UI.
          renderNow(lastRoom);

          try {
            ackBtn.disabled = true;
          } catch (e1) {
            // ignore
          }

          ackLoveLetter(roomId, playerId)
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              ui.ackInFlight = false;
            });
        };

        ackBtn.addEventListener('click', doAck);
        if (typeof PointerEvent !== 'undefined') {
          ackBtn.addEventListener('pointerup', doAck);
        }
      }

      var replayBtn = document.getElementById('llReplay');
      if (replayBtn && !replayBtn.__ll_bound) {
        replayBtn.__ll_bound = true;
        replayBtn.addEventListener('click', function () {
          replayBtn.disabled = true;
          resetLoveLetterToLobby(roomId, playerId)
            .then(function () {
              return startLoveLetterGame(roomId, playerId);
            })
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              replayBtn.disabled = false;
            });
        });
      }

      // Lobby mode: GM only "next" => back to lobby.
      var nextBtn = document.getElementById('llNextToLobby');
      if (nextBtn && !nextBtn.__ll_bound) {
        nextBtn.__ll_bound = true;
        nextBtn.addEventListener('click', function () {
          if (!lobbyId) return;
          nextBtn.disabled = true;
          firebaseReady()
            .then(function () {
              var extras = [];
              try {
                extras = lastRoom && lastRoom.settings ? lastRoom.settings.extraCards : [];
              } catch (e0) {
                extras = [];
              }
              return setLobbyLoveLetterExtraCards(lobbyId, extras);
            })
            .then(function () {
              return setLobbyCurrentGame(lobbyId, null);
            })
            .then(function () {
              redirectToLobby();
            })
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              nextBtn.disabled = false;
            });
        });
      }

      var backBtn = document.getElementById('llBackToLobby');
      if (backBtn && !backBtn.__ll_bound) {
        backBtn.__ll_bound = true;
        backBtn.addEventListener('click', function () {
          if (!bbgConfirmClick(backBtn, 'ゲームを中断して\nぜんいんロビーに戻ります。', 'ロビーに戻る')) return;
          var qx = parseQuery();
          var lobbyId = qx && qx.lobby ? String(qx.lobby) : '';
          if (!lobbyId) {
            alert('ロビーIDがありません');
            return;
          }
          backBtn.disabled = true;
          firebaseReady()
            .then(function () {
              var extras = [];
              try {
                extras = lastRoom && lastRoom.settings ? lastRoom.settings.extraCards : [];
              } catch (e0) {
                extras = [];
              }
              return setLobbyLoveLetterExtraCards(lobbyId, extras);
            })
            .then(function () {
              return setLobbyCurrentGame(lobbyId, null);
            })
            .then(function () {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.lobby = lobbyId;
              q.screen = 'lobby_host';
              setQuery(q);
              route();
            })
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              backBtn.disabled = false;
            });
        });
      }

      var abortBtn = document.getElementById('llAbortToLobby');
      if (abortBtn && !abortBtn.__ll_bound) {
        abortBtn.__ll_bound = true;
        abortBtn.addEventListener('click', function () {
          if (!bbgConfirmClick(abortBtn, 'ゲームを中断して\nぜんいんロビーに戻ります。', 'ロビーに戻る')) return;
          var qx = parseQuery();
          var lobbyId = qx && qx.lobby ? String(qx.lobby) : '';
          if (!lobbyId) {
            alert('ロビーIDがありません');
            return;
          }
          abortBtn.disabled = true;
          firebaseReady()
            .then(function () {
              var extras = [];
              try {
                extras = lastRoom && lastRoom.settings ? lastRoom.settings.extraCards : [];
              } catch (e0) {
                extras = [];
              }
              return setLobbyLoveLetterExtraCards(lobbyId, extras);
            })
            .then(function () {
              return setLobbyCurrentGame(lobbyId, null);
            })
            .then(function () {
              redirectToLobby();
            })
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              abortBtn.disabled = false;
            });
        });
      }

      var nextGameBtn = document.getElementById('llNextGame');
      if (nextGameBtn && !nextGameBtn.__ll_bound) {
        nextGameBtn.__ll_bound = true;
        nextGameBtn.addEventListener('click', function () {
          nextGameBtn.disabled = true;
          resetLoveLetterToLobby(roomId, playerId)
            .then(function () {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.host = '1';
              q.screen = 'loveletter_host';
              setQuery(q);
              route();
            })
            .catch(function (e) {
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              nextGameBtn.disabled = false;
            });
        });
      }

      if (lobbyId) ensureLobbyReturnWatcher();

      var cancelBtn = document.getElementById('llCancelPlay');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          ui.pending = null;
          renderNow(lastRoom);
        });
      }

      var hand = document.getElementById('llHand');
      if (hand && !hand.__ll_bound) {
        hand.__ll_bound = true;
        hand.addEventListener('click', function (ev) {
          if (ui.pending || (ui.modal && ui.modal.type)) return;
          try {
            var r = lastRoom && lastRoom.round ? lastRoom.round : {};
            var myHand = r && r.hands && Array.isArray(r.hands[playerId]) ? r.hands[playerId] : [];
            if (!Array.isArray(myHand) || myHand.length < 2) return;
            ui.handFrontIndex = ui.handFrontIndex === 0 ? 1 : 0;
            renderNow(lastRoom);
          } catch (e) {
            // ignore
          }
        });
      }

      var front = document.getElementById('llCardFront');
      if (front && !front.__ll_bound) {
        front.__ll_bound = true;

        (function (btn) {
          var holdMs = CN_LONG_PRESS_MS;
          var timer = null;
          var longFired = false;

          function clearTimer() {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          }

          function startHold(ev) {
            if (ui.pending || (ui.modal && ui.modal.type)) return;
            try {
              var rr0 = lastRoom && lastRoom.round ? lastRoom.round : null;
              if (!rr0 || String(rr0.currentPlayerId || '') !== String(playerId || '')) return;
              if (rr0.waitFor && rr0.waitFor.type) return;
              if (rr0.eliminated && rr0.eliminated[playerId]) return;
            } catch (e0) {
              return;
            }
            if (ev && ev.button != null && ev.button !== 0) return;
            if (ev && ev.preventDefault) ev.preventDefault();
            clearTimer();
            longFired = false;

            var rank = String(btn.getAttribute('data-rank') || '');
            if (!rank) return;
            if (rank === '8') return;

            // Enforce 女侯爵(7:countess) mandatory rule on UI side too.
            try {
              var rr = lastRoom && lastRoom.round ? lastRoom.round : {};
              var myHand2 = rr && rr.hands && Array.isArray(rr.hands[playerId]) ? rr.hands[playerId] : [];
              if (llMustPlayCountess(myHand2) && rank !== '7:countess') return;
            } catch (e) {
              // ignore
            }

            timer = setTimeout(function () {
              longFired = true;
              clearTimer();
              ui.modal = null;
              ui.pending = { card: rank, target: '', guess: '' };
              renderNow(lastRoom);
            }, holdMs);
          }

          btn.addEventListener('click', function (ev) {
            // Short tap is handled by llHand click (toggle). Ignore if long-press fired.
            if (longFired) {
              longFired = false;
              if (ev && ev.preventDefault) ev.preventDefault();
              if (ev && ev.stopPropagation) ev.stopPropagation();
            }
          });

          if (typeof PointerEvent !== 'undefined') {
            btn.addEventListener('pointerdown', startHold);
            btn.addEventListener('pointerup', clearTimer);
            btn.addEventListener('pointercancel', clearTimer);
            btn.addEventListener('pointerleave', clearTimer);
          } else {
            btn.addEventListener('touchstart', startHold);
            btn.addEventListener('touchend', clearTimer);
            btn.addEventListener('touchcancel', clearTimer);

            btn.addEventListener('mousedown', startHold);
            btn.addEventListener('mouseup', clearTimer);
            btn.addEventListener('mouseleave', clearTimer);
          }

          btn.addEventListener('contextmenu', function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
          });
        })(front);
      }

      var pickTargets = document.querySelectorAll('.llPickTarget');
      for (var t = 0; t < pickTargets.length; t++) {
        pickTargets[t].addEventListener('click', function (ev) {
          try {
            var panel = document.querySelector('.ll-overlay-panel');
            ui.modalScrollTop = panel ? panel.scrollTop : 0;
          } catch (e0) {
            ui.modalScrollTop = 0;
          }
          var el = ev && ev.currentTarget ? ev.currentTarget : null;
          var tid = el ? String(el.getAttribute('data-target') || '') : '';
          if (!ui.pending) ui.pending = { card: '', target: '', guess: '' };
          ui.pending.target = tid;
          renderNow(room);
        });
      }

      var pickGuesses = document.querySelectorAll('.llPickGuess');
      for (var g = 0; g < pickGuesses.length; g++) {
        pickGuesses[g].addEventListener('click', function (ev) {
          try {
            var panel = document.querySelector('.ll-overlay-panel');
            ui.modalScrollTop = panel ? panel.scrollTop : 0;
          } catch (e1) {
            ui.modalScrollTop = 0;
          }
          var el = ev && ev.currentTarget ? ev.currentTarget : null;
          var gv = el ? String(el.getAttribute('data-guess') || '') : '';
          if (!ui.pending) ui.pending = { card: '', target: '', guess: '' };
          ui.pending.guess = gv;
          renderNow(room);
        });
      }

      var confirmBtn = document.getElementById('llConfirmPlay');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
          var errId = 'llPlayError';
          clearInlineError(errId);
          if (!ui.pending || !ui.pending.card) {
            setInlineError(errId, 'カードを選んでください。');
            return;
          }

          var card = String(ui.pending.card);
          var payload = { card: card };
          if (card === '1') {
            payload.target = String(ui.pending.target || '');
            payload.guess = String(ui.pending.guess || '');
            if (!payload.guess) {
              setInlineError(errId, '推測を選んでください。');
              return;
            }
          } else if (card === '2' || card === '3' || card === '5' || card === '6') {
            payload.target = String(ui.pending.target || '');
          }

          confirmBtn.disabled = true;
          playLoveLetterAction(roomId, playerId, payload)
            .then(function () {
              ui.pending = null;
              renderNow(lastRoom);
            })
            .catch(function () {
              setInlineError(errId, '実行に失敗しました');
            })
            .finally(function () {
              confirmBtn.disabled = false;
            });
        });
      }
    }

    firebaseReady()
      .then(function () {
        return subscribeLoveLetterRoom(roomId, function (room) {
          if (ui.cancelled) return;
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }
          renderNow(room);
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    // When the app comes back from background, force a tiny write to refresh state.
    function touchOnResume() {
      firebaseReady()
        .then(function () {
          return touchCodenamesPlayer(roomId, playerId);
        })
        .catch(function () {
          // ignore
        });
    }
    try {
      window.addEventListener('focus', touchOnResume);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) touchOnResume();
      });
    } catch (eX) {
      // ignore
    }

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      try {
        if (ui && ui.lobbyUnsub) ui.lobbyUnsub();
      } catch (e2) {
        // ignore
      }
      try {
        if (document && document.body && document.body.classList) {
          document.body.classList.remove('ll-player-screen');
        }
      } catch (e3) {
        // ignore
      }
    });
  }

  function renderLoveLetterTable(viewEl, opts) {
    var roomId = opts.roomId;
    var room = opts.room;
    var isHost = !!opts.isHost;
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';

    var phase = (room && room.phase) || 'lobby';
    var ps = (room && room.players) || {};
    var r = room && room.round ? room.round : {};

    var order = [];
    try {
      order = llListPlayerIdsByJoin(room);
    } catch (e0) {
      order = [];
    }

    var turnPid = '';
    try {
      if (phase === 'playing' && r && r.currentPlayerId) turnPid = String(r.currentPlayerId || '');
    } catch (eT0) {
      turnPid = '';
    }

    function llCardBackImgHtml() {
      var backIcon = './assets/loveletter/Uramen.png';
      try {
        var v = getCacheBusterParam();
        if (v) backIcon += '?v=' + encodeURIComponent(String(v));
      } catch (e1) {
        // ignore
      }
      return '<img class="ll-card-img" alt="裏面" src="' + escapeHtml(backIcon) + '" />';
    }

    function llCardImgHtml(rank) {
      var d = llCardDef(rank);
      var icon = d && d.icon ? String(d.icon) : '';
      if (icon) {
        return '<img class="ll-card-img" alt="' + escapeHtml(d.name || '') + '" src="' + escapeHtml(icon) + '" />';
      }
      return '<div class="stack" style="height:100%;justify-content:center;align-items:center"><div class="big">' + escapeHtml((d && d.name) || '-') + '</div></div>';
    }

    var deckLeft = r && Array.isArray(r.deck) ? r.deck.length : 0;
    var graveArr = r && Array.isArray(r.grave) ? r.grave : [];

    function pname(pid) {
      try {
        return pid && ps[pid] ? formatPlayerDisplayName(ps[pid]) : String(pid || '-');
      } catch (e) {
        return String(pid || '-');
      }
    }

    var lastPlayHtml = '';
    try {
      var lp = r && r.lastPlay ? r.lastPlay : null;
      var lpBy = lp && lp.by ? String(lp.by) : '';
      var lpTo = lp && lp.to ? String(lp.to) : '';
      var lpCard = lp && lp.card ? String(lp.card) : '';
      var lpText = lp && lp.text ? String(lp.text) : '';
      if (phase !== 'lobby' && lpBy && lpCard) {
        if (!lpText) {
          var dlp = llCardDef(lpCard);
          var cardLabel = String((dlp && dlp.name) || '-') + '(' + String((dlp && dlp.rank) || llCardRankStr(lpCard) || '-') + ')';
          lpText = lpTo ? pname(lpBy) + ' が ' + pname(lpTo) + ' へ ' + cardLabel + ' のカードを使用した。' : pname(lpBy) + ' が ' + cardLabel + ' のカードを使用した。';
        }
        lastPlayHtml = '<div class="ll-table-lastplay ll-table-lastplay-banner" aria-live="polite">' + escapeHtml(lpText) + '</div>';
      }
    } catch (eLP) {
      lastPlayHtml = '';
    }

    var centerHtml = '';
    var facedownHtml = '';
    if (phase === 'lobby') {
      centerHtml = '<div class="stack center"><div class="big">待機中</div><div class="muted">ゲーム開始をお待ちください。</div></div>';
    } else {
      var backCount = deckLeft > 0 ? Math.min(5, Math.max(2, Math.ceil(deckLeft / 3))) : 0;
      var deckStack = '';
      for (var di = 0; di < backCount; di++) {
        deckStack += '<div class="ll-table-pile-card" style="left:' + String(di * 8) + 'px;top:' + String(di * -3) + 'px">' + llCardBackImgHtml() + '</div>';
      }

      var graveCards = '';
      // The first discarded card is kept face-down and should be shown separately.
      if (graveArr && graveArr.length) {
        facedownHtml =
          '<div class="ll-table-facedown">' +
          '<div class="muted">伏せ札</div>' +
          '<div class="ll-table-facedown-card">' +
          llCardBackImgHtml() +
          '</div>' +
          '</div>';
      }

      // Show the latest 10 discarded cards (excluding the face-down first one).
      var visibleGrave = graveArr && graveArr.length > 1 ? graveArr.slice(1) : [];
      var graveCount = visibleGrave.length;
      var graveTop = graveCount ? String(visibleGrave[graveCount - 1] || '') : '';

      if (graveTop) {
        var layerCount = Math.min(4, graveCount);
        for (var gi = layerCount - 1; gi >= 1; gi--) {
          graveCards +=
            '<div class="ll-table-grave-stack-card ll-table-grave-stack-card--under" style="left:' +
            String(gi * 7) +
            'px;top:' +
            String(gi * -3) +
            'px"></div>';
        }
        graveCards += '<div class="ll-table-grave-stack-card" style="left:0px;top:0px">' + llCardImgHtml(graveTop) + '</div>';
      } else {
        graveCards = '<div class="muted">（なし）</div>';
      }

      centerHtml =
        '<div class="ll-table-center ll-table-center--ll">' +
        '<div class="ll-table-center-top">' +
        '<div class="ll-table-pile">' +
        '<div class="muted">山札</div>' +
        '<div class="ll-table-pile-count"><b>' +
        escapeHtml(String(deckLeft)) +
        '</b></div>' +
        '<div class="ll-table-pile-stack">' +
        deckStack +
        '</div>' +
        '</div>' +
        '<div class="ll-table-pile">' +
        '<div class="muted">墓地</div>' +
        '<div class="ll-table-pile-count"><b>' +
        escapeHtml(String(graveCount)) +
        '</b></div>' +
        '<div class="ll-table-grave-stack">' +
        graveCards +
        '</div>' +
        '</div>' +
        '</div>' +
        (lastPlayHtml ? '<div class="ll-table-center-bottom">' + lastPlayHtml + '</div>' : '') +
        '</div>';
    }

    var rev = null;
    var byId = '';
    var toId = '';
    var effectSoloId = '';
    try {
      rev = r && r.reveal ? r.reveal : null;
      byId = rev && rev.by ? String(rev.by) : '';
      toId = rev && rev.target ? String(rev.target) : '';
      if (byId && (!toId || String(byId) === String(toId))) {
        effectSoloId = String(byId);
      }
    } catch (eRv0) {
      rev = null;
      byId = '';
      toId = '';
      effectSoloId = '';
    }

    var seatsHtml = '';
    var n = order.length || 0;
    var radius = 42;
    for (var si = 0; si < n; si++) {
      var pid = order[si];
      if (!pid) continue;
      var p = ps[pid] || {};
      var nm = formatPlayerDisplayName(p) || String(pid);
      var angle = -90 + (360 * si) / n;
      var rad = (Math.PI / 180) * angle;
      var x = 50 + radius * Math.cos(rad);
      var y = 50 + radius * Math.sin(rad);
      var isTurnSeat = !!(turnPid && String(pid) === String(turnPid));
      var isElimSeat = !!(r && r.eliminated && r.eliminated[String(pid)]);
      var isSoloEffectSeat = !!(effectSoloId && String(pid) === String(effectSoloId));
      var isProtectedSeat = !!(phase === 'playing' && r && r.protected && r.protected[String(pid)]);
      seatsHtml +=
        '<div class="ll-seat' +
        (isTurnSeat ? ' ll-seat--turn' : '') +
        (isElimSeat ? ' ll-seat--eliminated' : '') +
        (isSoloEffectSeat ? ' ll-seat--effect' : '') +
        '" data-ll-pid="' +
        escapeHtml(String(pid)) +
        '" style="left:' +
        escapeHtml(String(x.toFixed(3))) +
        '%;top:' +
        escapeHtml(String(y.toFixed(3))) +
        '%">' +
        '<div class="ll-seat-card">' +
        '<div class="ll-seat-name">' + escapeHtml(nm) + '</div>' +
        (isProtectedSeat && !isElimSeat ? '<div class="ll-seat-sub muted">僧侶により保護中</div>' : '') +
        '</div>' +
        '</div>';
    }

    // Effect arrow is drawn from real DOM positions after rendering to avoid layout-dependent drift.
    var arrowHtml = '<svg class="ll-table-arrow" data-ll-arrow="1" preserveAspectRatio="none" aria-hidden="true"></svg>';
    var arrowIconHtml = '<div class="ll-table-arrow-icon" data-ll-arrow-icon="1" aria-hidden="true"></div>';

    var resultHtml = '';
    if (phase === 'finished' && room && room.result && Array.isArray(room.result.winners)) {
      var fs = [];
      for (var fi = 0; fi < room.result.winners.length; fi++) {
        var fpid = room.result.winners[fi];
        fs.push(ps[fpid] ? formatPlayerDisplayName(ps[fpid]) : String(fpid));
      }
      resultHtml =
        '<div class="card center" style="padding:12px">' +
        '<div class="muted">勝者</div>' +
        '<div class="big">' +
        escapeHtml(fs.length ? fs.join(' / ') : '-') +
        '</div>' +
        (lobbyId
          ? '<hr />' +
            (isHost
              ? '<div class="row" style="justify-content:center;margin-top:10px"><button id="llNextToLobby" class="primary">次へ</button></div>'
              : '<div class="muted" style="margin-top:10px">※ 次へ進むのはゲームマスターです。</div>')
          : '') +
        '</div>';
    }

    render(
      viewEl,
      '\n    <div class="stack">\n      <div class="big">ラブレター（テーブル）</div>\n      ' +
        '\n      ' +
        (phase === 'finished' ? resultHtml + '<hr />' : '') +
        '<div class="ll-table">' +
        arrowHtml +
        arrowIconHtml +
        seatsHtml +
        (facedownHtml || '') +
        '<div class="ll-table-inner">' +
        centerHtml +
        '</div>' +
        '</div>' +
        '\n    </div>\n  '
    );
  }

  function updateLoveLetterTableEffectArrow(rootEl, room, _attempted) {
    try {
      if (!rootEl) return;
      var tableEl = rootEl.querySelector ? rootEl.querySelector('.ll-table') : null;
      if (!tableEl) return;
      var svg = tableEl.querySelector ? tableEl.querySelector('svg.ll-table-arrow[data-ll-arrow="1"]') : null;
      if (!svg) return;
      var iconEl = tableEl.querySelector ? tableEl.querySelector('div.ll-table-arrow-icon[data-ll-arrow-icon="1"]') : null;

      function hideIcon() {
        try {
          if (!iconEl) return;
          iconEl.style.display = 'none';
          iconEl.innerHTML = '';
        } catch (e0) {
          // ignore
        }
      }

      function revealCardRank(rev) {
        var t = rev && rev.type ? String(rev.type) : '';
        if (t === 'guard') return '1';
        if (t === 'clown') return '2';
        if (t === 'knight') return '3';
        if (t === 'wizard_discard') return '5';
        if (t === 'general_swap') return '6';
        if (t === 'minister_overload') return '7';
        return '';
      }

      var r = room && room.round ? room.round : null;
      var rev = r && r.reveal ? r.reveal : null;
      var byId = rev && rev.by ? String(rev.by) : '';
      var toId = rev && rev.target ? String(rev.target) : '';
      var isBidirectional = !!(rev && String(rev.type || '') === 'general_swap');
      if (!byId || !toId || String(byId) === String(toId)) {
        svg.innerHTML = '';
        hideIcon();
        return;
      }

      var byEl = null;
      var toEl = null;
      var seatEls = tableEl.querySelectorAll ? tableEl.querySelectorAll('.ll-seat') : [];
      for (var i = 0; i < seatEls.length; i++) {
        var el = seatEls[i];
        var pid = '';
        try {
          pid = String(el && el.getAttribute ? el.getAttribute('data-ll-pid') : '');
        } catch (ePid) {
          pid = '';
        }
        if (!pid) continue;
        if (!byEl && pid === byId) byEl = el;
        if (!toEl && pid === toId) toEl = el;
        if (byEl && toEl) break;
      }
      if (!byEl || !toEl) {
        svg.innerHTML = '';
        hideIcon();
        return;
      }

      var tableRect = tableEl.getBoundingClientRect();
      var w = tableRect && tableRect.width ? tableRect.width : 0;
      var h = tableRect && tableRect.height ? tableRect.height : 0;
      if (!(w > 0 && h > 0)) {
        svg.innerHTML = '';
        hideIcon();
        return;
      }

      function centerOf(el) {
        var rc = el.getBoundingClientRect();
        return {
          x: (rc.left + rc.width / 2) - tableRect.left,
          y: (rc.top + rc.height / 2) - tableRect.top
        };
      }

      function seatPad(el) {
        try {
          var rc = el.getBoundingClientRect();
          var r0 = Math.max(12, Math.min(48, Math.min(rc.width, rc.height) / 2));
          return r0 + 10;
        } catch (e) {
          return 26;
        }
      }

      var p1 = centerOf(byEl);
      var p2 = centerOf(toEl);
      var dx = p2.x - p1.x;
      var dy = p2.y - p1.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (!(len > 0.0001)) {
        svg.innerHTML = '';
        hideIcon();
        return;
      }

      var ux = dx / len;
      var uy = dy / len;
      var minDim = Math.min(w, h);
      var headLen = Math.max(12, Math.min(26, minDim * 0.045));
      var headW = headLen * 0.65;

      // Shorten from both ends so arrows do not overlap player name bubbles.
      var pad1 = seatPad(byEl);
      var pad2 = seatPad(toEl);
      var sp1 = { x: p1.x + ux * pad1, y: p1.y + uy * pad1 };
      var sp2 = { x: p2.x - ux * pad2, y: p2.y - uy * pad2 };
      var sdx = sp2.x - sp1.x;
      var sdy = sp2.y - sp1.y;
      var slen = Math.sqrt(sdx * sdx + sdy * sdy);
      if (!(slen > headLen * (isBidirectional ? 2.4 : 1.6))) {
        svg.innerHTML = '';
        hideIcon();
        return;
      }

      // Arrow head at the "to" end.
      var tip2 = sp2;
      var base2 = { x: tip2.x - ux * headLen, y: tip2.y - uy * headLen };
      var px = -uy;
      var py = ux;
      var left2 = { x: base2.x + px * headW, y: base2.y + py * headW };
      var right2 = { x: base2.x - px * headW, y: base2.y - py * headW };

      // Optional arrow head at the "from" end (General swap).
      var tip1 = sp1;
      var base1 = { x: tip1.x + ux * headLen, y: tip1.y + uy * headLen };
      var left1 = { x: base1.x + px * headW, y: base1.y + py * headW };
      var right1 = { x: base1.x - px * headW, y: base1.y - py * headW };

      var lineStart = isBidirectional ? base1 : sp1;
      var lineEnd = base2;

      // Effect card icon at the middle of the arrow.
      try {
        if (iconEl) {
          var rank = revealCardRank(rev);
          var d = rank ? llCardDef(rank) : null;
          var icon = d && d.icon ? String(d.icon) : '';
          if (rank && icon) {
            // Place the icon closer to the acting player.
            var tx = lineEnd.x - lineStart.x;
            var ty = lineEnd.y - lineStart.y;
            var tpos = 0.14;
            var midX = lineStart.x + tx * tpos;
            var midY = lineStart.y + ty * tpos;
            iconEl.style.left = String(midX.toFixed(1)) + 'px';
            iconEl.style.top = String(midY.toFixed(1)) + 'px';
            iconEl.style.display = 'block';
            iconEl.innerHTML = '<img class="ll-table-effect-icon" alt="" src="' + escapeHtml(icon) + '" />';
          } else {
            hideIcon();
          }
        }
      } catch (eIcon) {
        hideIcon();
      }

      svg.setAttribute('viewBox', '0 0 ' + String(w) + ' ' + String(h));
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML =
        '<line class="ll-table-arrow-line" x1="' +
        escapeHtml(String(lineStart.x.toFixed(2))) +
        '" y1="' +
        escapeHtml(String(lineStart.y.toFixed(2))) +
        '" x2="' +
        escapeHtml(String(lineEnd.x.toFixed(2))) +
        '" y2="' +
        escapeHtml(String(lineEnd.y.toFixed(2))) +
        '" />' +
        (isBidirectional
          ? '<path class="ll-table-arrow-head" d="M ' +
            escapeHtml(String(tip1.x.toFixed(2))) +
            ' ' +
            escapeHtml(String(tip1.y.toFixed(2))) +
            ' L ' +
            escapeHtml(String(left1.x.toFixed(2))) +
            ' ' +
            escapeHtml(String(left1.y.toFixed(2))) +
            ' L ' +
            escapeHtml(String(right1.x.toFixed(2))) +
            ' ' +
            escapeHtml(String(right1.y.toFixed(2))) +
            ' Z" />'
          : '') +
        '<path class="ll-table-arrow-head" d="M ' +
        escapeHtml(String(tip2.x.toFixed(2))) +
        ' ' +
        escapeHtml(String(tip2.y.toFixed(2))) +
        ' L ' +
        escapeHtml(String(left2.x.toFixed(2))) +
        ' ' +
        escapeHtml(String(left2.y.toFixed(2))) +
        ' L ' +
        escapeHtml(String(right2.x.toFixed(2))) +
        ' ' +
        escapeHtml(String(right2.y.toFixed(2))) +
        ' Z" />';

      // One extra pass after layout settles (fonts / async measurements).
      if (!_attempted && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          try {
            updateLoveLetterTableEffectArrow(rootEl, room, true);
          } catch (e2) {
            // ignore
          }
        });
      }
    } catch (e0) {
      try {
        var tableEl2 = rootEl && rootEl.querySelector ? rootEl.querySelector('.ll-table') : null;
        var svg2 = tableEl2 && tableEl2.querySelector ? tableEl2.querySelector('svg.ll-table-arrow[data-ll-arrow="1"]') : null;
        if (svg2) svg2.innerHTML = '';
        var icon2 = tableEl2 && tableEl2.querySelector ? tableEl2.querySelector('div.ll-table-arrow-icon[data-ll-arrow-icon="1"]') : null;
        if (icon2) {
          icon2.style.display = 'none';
          icon2.innerHTML = '';
        }
      } catch (e1) {
        // ignore
      }
    }
  }

  function routeLoveLetterTable(roomId, isHost) {
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.remove('ll-player-screen');
        document.body.classList.add('ll-table-screen');
      }
    } catch (e0) {
      // ignore
    }

    if (!isHost) {
      var qx0 = {};
      var vx0 = getCacheBusterParam();
      if (vx0) qx0.v = vx0;
      qx0.room = roomId;
      qx0.player = '1';
      try {
        var qq0 = parseQuery();
        if (qq0 && qq0.lobby) qx0.lobby = String(qq0.lobby);
      } catch (e1) {
        // ignore
      }
      qx0.screen = 'loveletter_player';
      setQuery(qx0);
      route();
      return;
    }

    var unsub = null;
    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e00) {
      lobbyId = '';
    }

    function redirectToLobby() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_host';
      try {
        var qx = parseQuery();
        if (qx && String(qx.gmdev || '') === '1') q.gmdev = '1';
      } catch (e) {
        // ignore
      }
      setQuery(q);
      route();
    }

    var lobbyReturnWatching = false;
    var lobbyUnsub = null;
    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (lobbyReturnWatching) return;
      lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'loveletter' || rid !== String(roomId || '')) {
              try {
                if (lobbyUnsub) lobbyUnsub();
              } catch (e) {
                // ignore
              }
              lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    firebaseReady()
      .then(function () {
        if (lobbyId) ensureLobbyReturnWatcher();
        return subscribeLoveLetterRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          renderLoveLetterTable(viewEl, { roomId: roomId, room: room, isHost: isHost, lobbyId: lobbyId });
          updateLoveLetterTableEffectArrow(viewEl, room);

          // NOTE: cnAbortToLobby is removed (use gm participant button on player screen).

          var nextBtn = document.getElementById('llNextToLobby');
          if (nextBtn && !nextBtn.__ll_bound) {
            nextBtn.__ll_bound = true;
            nextBtn.addEventListener('click', function () {
              if (!lobbyId) return;
              nextBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  var extras = [];
                  try {
                    extras = room && room.settings ? room.settings.extraCards : [];
                  } catch (e0) {
                    extras = [];
                  }
                  return setLobbyLoveLetterExtraCards(lobbyId, extras);
                })
                .then(function () {
                  return setLobbyCurrentGame(lobbyId, null);
                })
                .then(function () {
                  redirectToLobby();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  nextBtn.disabled = false;
                });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function renderHanninTable(viewEl, opts) {
    var viewerId = opts && opts.playerId ? String(opts.playerId) : '';
    var roomId = opts.roomId;
    var room = opts.room;
    var isHost = !!opts.isHost;
    var lobbyId = opts.lobbyId ? String(opts.lobbyId) : '';

    var players = (room && room.players) || {};
    var st = (room && room.state) || {};
    var order = Array.isArray(st.order) ? st.order : [];
    var hands = (st && st.hands) || {};
    var grave = Array.isArray(st.graveyard) ? st.graveyard : [];
    var result = (st && st.result) || {};
    var turn = (st && st.turn) || { index: 0, playerId: '' };
    var phase = String((room && room.phase) || '');
    var started = !!(st && st.started);
    var pending = (st && st.pending) || null;

    function hnLastPlayText(room) {
      try {
        var st0 = room && room.state ? room.state : null;
        var lp0 = st0 && st0.lastPlay ? st0.lastPlay : null;
        var t0 = lp0 && lp0.text ? String(lp0.text || '') : '';
        if (t0) {
          if (t0 && t0[t0.length - 1] !== '。') t0 += '。';
          return t0;
        }
        // Fallback: scan the log for the latest "... を使用" line (so we don't show e.g. "勝利" lines).
        var log = st0 && Array.isArray(st0.log) ? st0.log : [];
        for (var i = (log.length || 0) - 1; i >= 0; i--) {
          var s = String(log[i] || '');
          if (!s) continue;
          if (s.indexOf(' を使用') >= 0 || s.indexOf(' をプレイ') >= 0) {
            if (s && s[s.length - 1] !== '。') s += '。';
            return s;
          }
        }
      } catch (e0) {
        // ignore
      }
      try {
        var lp = st && st.lastPlay ? st.lastPlay : null;
        var pid = lp && lp.playerId ? String(lp.playerId || '') : '';
        var cardId = lp && lp.cardId ? String(lp.cardId || '') : '';
        var pn = pid ? hnPlayerName(room, pid) : '';
        var def = cardId && HANNIN_CARD_DEFS ? HANNIN_CARD_DEFS[cardId] : null;
        var cn = def && def.name ? String(def.name || '') : (cardId || '');
        if (pn && cn) {
          var t = pn + ' が ' + cn + ' を使用';
          if (t && t[t.length - 1] !== '。') t += '。';
          return t;
        }
      } catch (e1) {
        // ignore
      }
      return '';
    }

    function hanninTableVizHtml() {
      var order0 = Array.isArray(order) ? order : [];
      var nSeats = order0.length || 0;
      if (!nSeats) return '';

      function pname(pid) {
        var p = pid && players ? players[pid] : null;
        return p ? formatPlayerDisplayName(p) : String(pid || '-');
      }

      function handCount(pid) {
        var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
        return h.length || 0;
      }

      function handBacksHtml(pid) {
        var cnt = handCount(pid);
        var out = '';
        for (var i = 0; i < 4; i++) {
          var empty = i >= cnt;
          out += '<div class="hn-sim-handback' + (empty ? ' hn-sim-handback--empty' : '') + '">' + hnCardBackImgHtml() + '</div>';
        }
        return out;
      }

      var graveHtml2 = '';
      if (!grave.length) {
        graveHtml2 = '<div class="muted">（なし）</div>';
      } else {
        var graveCount = grave.length;
        var top = String(grave[graveCount - 1] || '');
        var layerCount = Math.min(4, graveCount);
        for (var gi = layerCount - 1; gi >= 1; gi--) {
          graveHtml2 +=
            '<div class="ll-table-grave-stack-card ll-table-grave-stack-card--under" style="left:' +
            String(gi * 7) +
            'px;top:' +
            String(gi * -3) +
            'px"></div>';
        }
        graveHtml2 += '<div class="ll-table-grave-stack-card" style="left:0px;top:0px">' + hnCardImgHtml(top) + '</div>';
      }

      var lastPlay = hnLastPlayText(room);

      var lastPlayHtml = '';
      try {
        if (lastPlay) {
          lastPlayHtml = '<div class="ll-table-lastplay ll-table-lastplay-banner" aria-live="polite">' + escapeHtml(String(lastPlay || '')) + '</div>';
        }
      } catch (eLP) {
        lastPlayHtml = '';
      }

      var centerHtml =
        '<div class="ll-table-center ll-table-center--ll" style="margin-top:-18px">' +
        '<div class="ll-table-center-top">' +
        '<div class="ll-table-pile">' +
        '<div class="muted">墓地/<b>' +
        escapeHtml(String(grave.length || 0)) +
        '枚</b></div>' +
        '<div class="ll-table-grave-stack">' +
        graveHtml2 +
        '</div>' +
        '</div>' +
        '</div>' +
        (lastPlayHtml ? '<div class="ll-table-center-bottom">' + lastPlayHtml + '</div>' : '') +
        '</div>';

      var arrowHtml = '';
      var arrowIconHtml = '';
      for (var ai = 0; ai < nSeats; ai++) {
        arrowHtml += '<svg class="ll-table-arrow" data-hn-arrow="' + escapeHtml(String(ai)) + '"></svg>';
        arrowIconHtml += '<div class="ll-table-arrow-icon" data-hn-arrow-icon="' + escapeHtml(String(ai)) + '"></div>';
      }

      var seatsHtml = '';
      var radius = 42;
      var turnPid = '';
      try {
        turnPid = turn && turn.playerId ? String(turn.playerId || '') : '';
      } catch (eT0) {
        turnPid = '';
      }
      for (var si = 0; si < nSeats; si++) {
        var pid = String(order0[si] || '');
        if (!pid) continue;
        var angle = -90 + (360 * si) / nSeats;
        var rad = (Math.PI / 180) * angle;
        var x = 50 + radius * Math.cos(rad);
        var y = 50 + radius * Math.sin(rad);
        var isTurnSeat = !!(turnPid && String(pid) === String(turnPid));
        var cnt = handCount(pid);
        var plotOn = false;
        try {
          var allies0 = st && st.allies && typeof st.allies === 'object' ? st.allies : {};
          plotOn = !!(allies0 && allies0[String(pid)]);
        } catch (ePlot0) {
          plotOn = false;
        }
        seatsHtml +=
          '<div class="ll-seat' +
          (isTurnSeat ? ' ll-seat--turn' : '') +
          '" data-hn-pid="' +
          escapeHtml(String(pid)) +
          '" data-ll-pid="' +
          escapeHtml(String(pid)) +
          '" style="left:' +
          escapeHtml(String(x.toFixed(3))) +
          '%;top:' +
          escapeHtml(String(y.toFixed(3))) +
          '%">' +
          '<div class="ll-seat-card hn-sim-seat-card">' +
          '<div class="ll-seat-name">' +
          escapeHtml(pname(pid)) +
          (plotOn ? ' <span class="badge">たくらみ中</span>' : '') +
          '</div>' +
          '<div class="hn-sim-handcount muted">手札: ' +
          escapeHtml(String(cnt)) +
          '</div>' +
          '<div class="hn-sim-handbacks">' +
          handBacksHtml(pid) +
          '</div>' +
          '</div>' +
          '</div>';
      }

      return (
        '<div class="ll-table hn-table">' +
        arrowHtml +
        arrowIconHtml +
        seatsHtml +
        '<div class="ll-table-inner">' +
        centerHtml +
        '</div>' +
        '</div>'
      );
    }

    var debugIframeHtml = '';
    try {
      var isTableGmDevice = false;
      var qx = parseQuery();
      isTableGmDevice = qx && String(qx.gmdev || '') === '1';
      if (isHost && isTableGmDevice && isDevDebugSite()) {
        var dbgPid = turn && turn.playerId ? String(turn.playerId) : '';
        if (dbgPid) {
          var qd = {
            v: getCacheBusterParam(),
            screen: 'hannin_player',
            room: String(roomId || ''),
            lobby: lobbyId || '',
            player: dbgPid
          };
          var src = '?' + buildQuery(qd);
          debugIframeHtml =
            '<div class="card" style="padding:12px">' +
            '<div class="muted">（dev）デバッグ：手番プレイヤー画面</div>' +
            '<div style="margin-top:8px">' +
            '<iframe title="hannin turn debug" src="' +
            escapeHtml(src) +
            '" style="width:100%;height:520px;border:1px solid var(--line);border-radius:10px" loading="lazy"></iframe>' +
            '</div>' +
            '</div>';
        }
      }
    } catch (eDbg) {
      debugIframeHtml = '';
    }

    function cardHtml(cardId, pid, idx) {
      var id = String(cardId || '');
      var def = HANNIN_CARD_DEFS[id] || { name: id || '-', icon: '', desc: '' };
      var img = def.icon
        ? '<img src="' + escapeHtml(def.icon) + '" alt="' + escapeHtml(def.name || id) + '" style="width:42px;height:auto;border-radius:8px;border:1px solid var(--line)" />'
        : '';
      var btn = '';
      var isTurn = String(turn && turn.playerId ? turn.playerId : '') === String(pid);
      var canAct = isTurn && phase === 'playing' && (!pending || !pending.type) && (isHost || (viewerId && String(viewerId) === String(pid)));
      // Table device: only operate test players.
      try {
        var qx2 = parseQuery();
        var isTable2 = !!(qx2 && String(qx2.gmdev || '') === '1');
        if (isTable2 && isHost && !hnIsTestPlayerId(pid)) canAct = false;
      } catch (eC3) {
        // ignore
      }
      if (canAct) {
        btn =
          '<button class="ghost hnPlay" data-pid="' +
          escapeHtml(String(pid)) +
          '" data-idx="' +
          escapeHtml(String(idx)) +
          '">プレイ</button>';
      }

      var infoBtn = '';
      if (pending && pending.type === 'info') {
        var canChoose = (isHost || (viewerId && String(viewerId) === String(pid))) && pending.choices && pending.choices[String(pid)] === undefined;
        // Table device: only operate test players.
        try {
          var qx3 = parseQuery();
          var isTable3 = !!(qx3 && String(qx3.gmdev || '') === '1');
          if (isTable3 && isHost && !hnIsTestPlayerId(pid)) canChoose = false;
        } catch (eI3) {
          // ignore
        }
        if (canChoose) {
          infoBtn =
            '<button class="ghost hnInfoChoose" data-pid="' +
            escapeHtml(String(pid)) +
            '" data-idx="' +
            escapeHtml(String(idx)) +
            '">渡す</button>';
        } else if ((isHost || (viewerId && String(viewerId) === String(pid))) && pending.choices && pending.choices[String(pid)] !== undefined) {
          infoBtn = '<span class="badge">選択済</span>';
        }
      }

      var rumorBtn = '';
      if (pending && pending.type === 'rumor') {
        var canChooseRumor = (isHost || (viewerId && String(viewerId) === String(pid))) && pending.choices && pending.choices[String(pid)] === undefined;
        // Table device: only operate test players.
        try {
          var qx4 = parseQuery();
          var isTable4 = !!(qx4 && String(qx4.gmdev || '') === '1');
          if (isTable4 && isHost && !hnIsTestPlayerId(pid)) canChooseRumor = false;
        } catch (eR3) {
          // ignore
        }
        if (canChooseRumor) {
          function rightWithCards(snapshotHands, fromPid) {
            var from = String(fromPid || '');
            var startIdx = order.indexOf(from);
            if (startIdx < 0) return '';
            for (var step = 1; step < order.length; step++) {
              var cand = String(order[(startIdx + step) % order.length] || '');
              if (!cand) continue;
              var h0 = snapshotHands && Array.isArray(snapshotHands[cand]) ? snapshotHands[cand] : [];
              if (h0.length) return cand;
            }
            return '';
          }

          var rightPid = rightWithCards(hands, pid);
          var rightHand = rightPid && hands && Array.isArray(hands[rightPid]) ? hands[rightPid] : [];
          var cnt = rightHand && Array.isArray(rightHand) ? rightHand.length : 0;
          if (cnt > 0) {
            var picks = '';
            for (var rri = 0; rri < cnt; rri++) {
              picks +=
                '<button class="ghost hnRumorChoose" data-pid="' +
                escapeHtml(String(pid)) +
                '" data-idx="' +
                escapeHtml(String(rri)) +
                '">' +
                escapeHtml(String(rri + 1)) +
                '</button>';
            }
            rumorBtn = '<div class="row" style="gap:6px;flex-wrap:wrap">' + picks + '</div>';
          }
        } else if ((isHost || (viewerId && String(viewerId) === String(pid))) && pending.choices && pending.choices[String(pid)] !== undefined) {
          rumorBtn = '<span class="badge">選択済</span>';
        }
      }

      var dealBtn = '';
      if (pending && pending.type === 'deal') {
        var canChooseDeal = false;
        try {
          var isParty = String(pending.targetPid || '') === String(pid) || String(pending.actorId || '') === String(pid);
          var notChosen = !(pending.choices && pending.choices[String(pid)] !== undefined);
          canChooseDeal = !!(isParty && notChosen && (isHost || (viewerId && String(viewerId) === String(pid))));
        } catch (eDT) {
          canChooseDeal = false;
        }

        if (canChooseDeal) {
          // Table device: only operate test players.
          try {
            var qxD = parseQuery();
            var isTableD = !!(qxD && String(qxD.gmdev || '') === '1');
            if (isTableD && isHost && !hnIsTestPlayerId(pid)) canChooseDeal = false;
          } catch (eD3) {
            // ignore
          }

          if (canChooseDeal) {
            dealBtn =
              '<button class="ghost hnDealChoose" data-pid="' +
              escapeHtml(String(pid)) +
              '" data-idx="' +
              escapeHtml(String(idx)) +
              '">出す</button>';
          }
        }
      }

      return (
        '<div class="row" style="gap:10px;align-items:center;justify-content:space-between">' +
        '<div class="row" style="gap:10px;align-items:center">' +
        img +
        '<div><b>' +
        escapeHtml(def.name || id) +
        '</b></div>' +
        '</div>' +
        '<div class="row" style="gap:8px;align-items:center">' + infoBtn + rumorBtn + dealBtn + btn + '</div>' +
        '</div>'
      );
    }

    var playersHtml = '';
    for (var i = 0; i < order.length; i++) {
      var pid = String(order[i] || '');
      if (!pid) continue;
      var p = players[pid] || {};
      var nm = String(p.name || '').trim();
      if (!nm) nm = '（無名）';
      var h = hands && Array.isArray(hands[pid]) ? hands[pid] : [];
      var handHtml = '';
      var canSeeHand = isHost || (viewerId && String(viewerId) === String(pid));
      if (!canSeeHand) handHtml = '<div class="muted">（手札は非表示）</div>';
      else if (!h.length) handHtml = '<div class="muted">（手札なし）</div>';
      else {
        for (var k = 0; k < h.length; k++) {
          handHtml += '<div class="card" style="padding:10px">' + cardHtml(h[k], pid, k) + '</div>';
        }
      }

      var isTurn2 = String(turn && turn.playerId ? turn.playerId : '') === String(pid);
      playersHtml +=
        '<div class="card" style="padding:12px;' + (isTurn2 ? 'border-color:var(--text);' : '') + '">' +
        '<div class="row" style="justify-content:space-between">' +
        '<b>' +
        escapeHtml(nm) +
        '</b>' +
        (isTurn2 ? '<span class="badge">TURN</span>' : p && p.isHost ? '<span class="badge">HOST</span>' : '') +
        '</div>' +
        '<div class="stack" style="margin-top:8px">' +
        handHtml +
        '</div>' +
        '</div>';
    }
    if (!playersHtml) playersHtml = '<div class="muted">参加者がいません。</div>';

    var graveHtml = '';
    if (!grave.length) graveHtml = '<div class="muted">（なし）</div>';
    else {
      for (var g = 0; g < grave.length; g++) {
        graveHtml += '<div class="card" style="padding:10px">' + cardHtml(grave[g]) + '</div>';
      }
    }

    render(
      viewEl,
      '<div class="hn-table hn-table-only">' +
        (hanninTableVizHtml() || '<div class="muted">（表示できません）</div>') +
        (lobbyId && result && result.decidedAt
          ? '<div class="row" style="justify-content:center;margin-top:12px"><button id="hnNextToLobby" class="primary">次へ</button></div>'
          : '') +
      '</div>'
    );
  }

  function updateHanninTableEffectArrow(rootEl, room, _attempted) {
    try {
      if (!rootEl) return;
      var tableEl = rootEl.querySelector ? rootEl.querySelector('.ll-table') : null;
      if (!tableEl) return;

      var st = room && room.state ? room.state : null;
      var pending = st && st.pending ? st.pending : null;
      var order = st && Array.isArray(st.order) ? st.order : [];
      var hands = st && st.hands ? st.hands : {};
      var priv = st && st.private ? st.private : null;

      function hideIcon(iconEl) {
        try {
          if (!iconEl) return;
          iconEl.style.display = 'none';
          iconEl.innerHTML = '';
        } catch (e0) {
          // ignore
        }
      }

      function rightWithCards(fromPid) {
        var from = String(fromPid || '');
        var startIdx = order.indexOf(from);
        if (startIdx < 0) return '';
        for (var step = 1; step < order.length; step++) {
          var cand = String(order[(startIdx + step) % order.length] || '');
          if (!cand) continue;
          var h0 = hands && Array.isArray(hands[cand]) ? hands[cand] : [];
          if (h0.length) return cand;
        }
        return '';
      }

      function handCount(pid) {
        var h0 = hands && Array.isArray(hands[String(pid || '')]) ? hands[String(pid || '')] : [];
        return h0 && Array.isArray(h0) ? h0.length : 0;
      }

      var maxSlots = order.length || 0;
      var specsBySlot = new Array(maxSlots);
      for (var f0 = 0; f0 < maxSlots; f0++) specsBySlot[f0] = null;

      function setSpecByFrom(fromPid, spec) {
        var from = String(fromPid || '');
        var idx = order.indexOf(from);
        if (idx < 0) idx = 0;
        specsBySlot[idx] = spec;
      }

      var pType = pending && pending.type ? String(pending.type) : '';
      if (pType === 'deal') {
        var a = String(pending.actorId || '');
        var t = String(pending.targetPid || '');
        if (a && t && a !== t) {
          setSpecByFrom(a, { from: a, to: t, iconCard: 'deal', bidirectional: true, iconOnlyFrom: a });
        }
      } else if (pType === 'info') {
        var actorId0 = String(pending.actorId || '');
        for (var i = 0; i < order.length; i++) {
          var pid = String(order[i] || '');
          if (!pid) continue;
          if (handCount(pid) <= 0) continue; // skip empty-hand players
          // Visual direction should match rumor (clockwise/right).
          var right0 = hnRightPid(order, pid);
          if (!right0 || String(right0) === String(pid)) continue;
          specsBySlot[i] = { from: pid, to: right0, iconCard: 'info', bidirectional: false, iconOnlyFrom: actorId0 };
        }
      } else if (pType === 'rumor') {
        var actorId = String(pending.actorId || '');
        // If the actor has no remaining hand (played rumor as last card), hide arrows but still show the icon.
        try {
          if (actorId && handCount(actorId) <= 0) {
            setSpecByFrom(actorId, { from: actorId, to: actorId, iconCard: 'rumor', bidirectional: false, iconOnlyFrom: actorId, soloIcon: true });
          }
        } catch (eSolo0) {
          // ignore
        }
        for (var j = 0; j < order.length; j++) {
          var pid2 = String(order[j] || '');
          if (!pid2) continue;
          if (handCount(pid2) <= 0) continue; // skip empty-hand players
          var right = rightWithCards(pid2);
          if (!right || String(right) === String(pid2)) continue;
          var iconCard = String(pid2) === String(actorId) ? 'rumor' : '';
          specsBySlot[j] = { from: pid2, to: right, iconCard: iconCard, bidirectional: false, iconOnlyFrom: actorId };
        }
      } else {
        // Non-pending effects: show private target arrows (witness/boy).
        try {
          if (priv && typeof priv === 'object') {
            var keys = Object.keys(priv);
            var bestByFrom = {};
            for (var pk = 0; pk < keys.length; pk++) {
              var kpid = String(keys[pk] || '');
              var msg = priv[kpid] || null;
              if (!msg || !msg.type) continue;
              var type = String(msg.type || '');

              var fromPid = '';
              var toPid = '';
              var iconCard = '';

              if (type === 'witness') {
                fromPid = kpid;
                toPid = String(msg.targetPid || '');
                iconCard = 'witness';
              } else if (type === 'notice') {
                // Detective/Dog notices are broadcast to all players; use actorPid/targetPid.
                fromPid = String(msg.actorPid || '');
                toPid = String(msg.targetPid || '');
                var title = String(msg.title || '');
                if (title === '探偵') iconCard = 'detective';
                else if (title === 'いぬ') iconCard = 'dog';
                else iconCard = '';
              } else {
                continue;
              }

              if (!fromPid || !toPid || fromPid === toPid) continue;
              if (order.indexOf(fromPid) < 0) continue;
              if (order.indexOf(toPid) < 0) continue;

              var at = 0;
              try {
                at = parseIntSafe(msg.createdAt, 0);
              } catch (eAt0) {
                at = 0;
              }
              var prev = bestByFrom[fromPid] || null;
              if (!prev || at >= (prev.at || 0)) {
                bestByFrom[fromPid] = { at: at, spec: { from: fromPid, to: toPid, iconCard: iconCard, bidirectional: false, iconOnlyFrom: fromPid } };
              }
            }

            var fromKeys = Object.keys(bestByFrom);
            for (var kk = 0; kk < fromKeys.length; kk++) {
              var fp = String(fromKeys[kk] || '');
              var ent = bestByFrom[fp];
              if (!ent || !ent.spec) continue;
              setSpecByFrom(fp, ent.spec);
            }
          }
        } catch (ePriv) {
          // ignore
        }
      }

      var seatEls = tableEl.querySelectorAll ? tableEl.querySelectorAll('.ll-seat') : [];
      var seatMap = {};
      for (var si = 0; si < seatEls.length; si++) {
        var el = seatEls[si];
        var pid3 = '';
        try {
          pid3 = String(el && el.getAttribute ? (el.getAttribute('data-hn-pid') || el.getAttribute('data-ll-pid') || '') : '');
        } catch (ePid) {
          pid3 = '';
        }
        if (pid3) seatMap[pid3] = el;
      }

      var tableRect = tableEl.getBoundingClientRect();
      var w = tableRect && tableRect.width ? tableRect.width : 0;
      var h = tableRect && tableRect.height ? tableRect.height : 0;

      function centerOf(el) {
        var rc = el.getBoundingClientRect();
        return { x: (rc.left + rc.width / 2) - tableRect.left, y: (rc.top + rc.height / 2) - tableRect.top };
      }

      function seatPad(el) {
        try {
          var rc = el.getBoundingClientRect();
          var r0 = Math.max(12, Math.min(48, Math.min(rc.width, rc.height) / 2));
          return r0 + 34;
        } catch (e) {
          return 50;
        }
      }

      for (var slot = 0; slot < maxSlots; slot++) {
        var svg = tableEl.querySelector ? tableEl.querySelector('svg.ll-table-arrow[data-hn-arrow="' + String(slot) + '"]') : null;
        var iconEl = tableEl.querySelector ? tableEl.querySelector('div.ll-table-arrow-icon[data-hn-arrow-icon="' + String(slot) + '"]') : null;
        if (!svg) continue;
        if (!(w > 0 && h > 0)) {
          svg.innerHTML = '';
          hideIcon(iconEl);
          continue;
        }

        var spec = specsBySlot[slot] || null;
        if (!spec || !spec.from || !spec.to) {
          svg.innerHTML = '';
          hideIcon(iconEl);
          continue;
        }
        var fromEl = seatMap[String(spec.from)] || null;
        var toEl = seatMap[String(spec.to)] || null;
        if (!fromEl || !toEl) {
          svg.innerHTML = '';
          hideIcon(iconEl);
          continue;
        }

        // Icon-only (no arrow) mode.
        if (spec && spec.soloIcon) {
          svg.innerHTML = '';
          try {
            if (iconEl) {
              var cid0 = spec.iconCard ? String(spec.iconCard) : '';
              var def0 = cid0 && HANNIN_CARD_DEFS ? HANNIN_CARD_DEFS[cid0] : null;
              var icon0 = def0 && def0.icon ? String(def0.icon) : '';
              if (icon0) {
                var p0 = centerOf(fromEl);
                var cx = w / 2;
                var cy = h / 2;
                var dx0 = cx - p0.x;
                var dy0 = cy - p0.y;
                var len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
                var ux0 = len0 > 0.0001 ? dx0 / len0 : 0;
                var uy0 = len0 > 0.0001 ? dy0 / len0 : 0;
                var off = 28;
                iconEl.style.left = String((p0.x + ux0 * off).toFixed(1)) + 'px';
                iconEl.style.top = String((p0.y + uy0 * off).toFixed(1)) + 'px';
                iconEl.style.display = 'block';
                iconEl.innerHTML = '<img class="ll-table-effect-icon" alt="" src="' + escapeHtml(icon0) + '" />';
              } else {
                hideIcon(iconEl);
              }
            }
          } catch (eSolo) {
            hideIcon(iconEl);
          }
          continue;
        }

        var p1 = centerOf(fromEl);
        var p2 = centerOf(toEl);
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (!(len > 0.0001)) {
          svg.innerHTML = '';
          hideIcon(iconEl);
          continue;
        }

        var ux = dx / len;
        var uy = dy / len;
        var minDim = Math.min(w, h);
        var headLen = Math.max(12, Math.min(26, minDim * 0.045));
        var headW = headLen * 0.65;

        var pad1 = seatPad(fromEl);
        var pad2 = seatPad(toEl);
        var sp1 = { x: p1.x + ux * pad1, y: p1.y + uy * pad1 };
        var sp2 = { x: p2.x - ux * pad2, y: p2.y - uy * pad2 };
        var sdx = sp2.x - sp1.x;
        var sdy = sp2.y - sp1.y;
        var slen = Math.sqrt(sdx * sdx + sdy * sdy);
        var isBidirectional = !!spec.bidirectional;
        if (!(slen > headLen * (isBidirectional ? 2.4 : 1.6))) {
          svg.innerHTML = '';
          hideIcon(iconEl);
          continue;
        }

        var tip2 = sp2;
        var base2 = { x: tip2.x - ux * headLen, y: tip2.y - uy * headLen };
        var px = -uy;
        var py = ux;
        var left2 = { x: base2.x + px * headW, y: base2.y + py * headW };
        var right2 = { x: base2.x - px * headW, y: base2.y - py * headW };

        var tip1 = sp1;
        var base1 = { x: tip1.x + ux * headLen, y: tip1.y + uy * headLen };
        var left1 = { x: base1.x + px * headW, y: base1.y + py * headW };
        var right1 = { x: base1.x - px * headW, y: base1.y - py * headW };

        var lineStart = isBidirectional ? base1 : sp1;
        var lineEnd = base2;

        try {
          if (iconEl) {
            var cid = spec.iconCard ? String(spec.iconCard) : '';
            var onlyFrom = spec && spec.iconOnlyFrom ? String(spec.iconOnlyFrom || '') : '';
            if (onlyFrom && String(spec.from || '') !== onlyFrom) cid = '';
            var def = cid && HANNIN_CARD_DEFS ? HANNIN_CARD_DEFS[cid] : null;
            var icon = def && def.icon ? String(def.icon) : '';
            if (icon) {
              var tx = lineEnd.x - lineStart.x;
              var ty = lineEnd.y - lineStart.y;
              var tpos = 0.22;
              var midX = lineStart.x + tx * tpos;
              var midY = lineStart.y + ty * tpos;
              iconEl.style.left = String(midX.toFixed(1)) + 'px';
              iconEl.style.top = String(midY.toFixed(1)) + 'px';
              iconEl.style.display = 'block';
              iconEl.innerHTML = '<img class="ll-table-effect-icon" alt="" src="' + escapeHtml(icon) + '" />';
            } else {
              hideIcon(iconEl);
            }
          }
        } catch (eIcon) {
          hideIcon(iconEl);
        }

        svg.setAttribute('viewBox', '0 0 ' + String(w) + ' ' + String(h));
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.innerHTML =
          '<line class="ll-table-arrow-line" x1="' +
          escapeHtml(String(lineStart.x.toFixed(2))) +
          '" y1="' +
          escapeHtml(String(lineStart.y.toFixed(2))) +
          '" x2="' +
          escapeHtml(String(lineEnd.x.toFixed(2))) +
          '" y2="' +
          escapeHtml(String(lineEnd.y.toFixed(2))) +
          '" />' +
          (isBidirectional
            ? '<path class="ll-table-arrow-head" d="M ' +
              escapeHtml(String(tip1.x.toFixed(2))) +
              ' ' +
              escapeHtml(String(tip1.y.toFixed(2))) +
              ' L ' +
              escapeHtml(String(left1.x.toFixed(2))) +
              ' ' +
              escapeHtml(String(left1.y.toFixed(2))) +
              ' L ' +
              escapeHtml(String(right1.x.toFixed(2))) +
              ' ' +
              escapeHtml(String(right1.y.toFixed(2))) +
              ' Z" />'
            : '') +
          '<path class="ll-table-arrow-head" d="M ' +
          escapeHtml(String(tip2.x.toFixed(2))) +
          ' ' +
          escapeHtml(String(tip2.y.toFixed(2))) +
          ' L ' +
          escapeHtml(String(left2.x.toFixed(2))) +
          ' ' +
          escapeHtml(String(left2.y.toFixed(2))) +
          ' L ' +
          escapeHtml(String(right2.x.toFixed(2))) +
          ' ' +
          escapeHtml(String(right2.y.toFixed(2))) +
          ' Z" />';
      }

      if (!_attempted && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          try {
            updateHanninTableEffectArrow(rootEl, room, true);
          } catch (e2) {
            // ignore
          }
        });
      }
    } catch (e0) {
      try {
        var tableEl2 = rootEl && rootEl.querySelector ? rootEl.querySelector('.ll-table') : null;
        if (!tableEl2) return;
        var svgs = tableEl2.querySelectorAll ? tableEl2.querySelectorAll('svg.ll-table-arrow') : [];
        for (var i = 0; i < svgs.length; i++) if (svgs[i]) svgs[i].innerHTML = '';
        var icons = tableEl2.querySelectorAll ? tableEl2.querySelectorAll('div.ll-table-arrow-icon') : [];
        for (var j = 0; j < icons.length; j++) hideIcon(icons[j]);
      } catch (e1) {
        // ignore
      }
    }
  }

  function routeHanninTable(roomId, isHost) {
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.remove('ll-player-screen');
        document.body.classList.add('ll-table-screen');
      }
    } catch (e0) {
      // ignore
    }
    if (!isHost) {
      var qx0 = {};
      var vx0 = getCacheBusterParam();
      if (vx0) qx0.v = vx0;
      qx0.room = roomId;
      try {
        var qq0 = parseQuery();
        if (qq0 && qq0.lobby) qx0.lobby = String(qq0.lobby);
        if (qq0 && qq0.player) qx0.player = String(qq0.player);
      } catch (e0x) {
        // ignore
      }
      qx0.screen = 'hannin_player';
      setQuery(qx0);
      route();
      return;
    }

    var unsub = null;
    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    function redirectToLobbyHost() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_host';
      try {
        var qx = parseQuery();
        if (qx && String(qx.gmdev || '') === '1') q.gmdev = '1';
      } catch (e) {
        // ignore
      }
      setQuery(q);
      route();
    }

    var lobbyReturnWatching = false;
    var lobbyUnsub = null;
    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (lobbyReturnWatching) return;
      lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'hannin' || rid !== String(roomId || '')) {
              try {
                if (lobbyUnsub) lobbyUnsub();
              } catch (e) {
                // ignore
              }
              lobbyUnsub = null;
              redirectToLobbyHost();
            }
          });
        })
        .then(function (u2) {
          lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    var playerId = '';
    try {
      var q1 = parseQuery();
      playerId = q1 && q1.player ? String(q1.player) : '';
    } catch (eP) {
      playerId = '';
    }

    var lastRoom = null;

    firebaseReady()
      .then(function () {
        if (lobbyId) ensureLobbyReturnWatcher();
        return subscribeHanninRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }
          lastRoom = room;
          renderHanninTable(viewEl, { roomId: roomId, room: room, isHost: isHost, lobbyId: lobbyId, playerId: playerId });
          updateHanninTableEffectArrow(viewEl, room);

          // Auto-deal at game start: no distribution screen.
          try {
            var qx = parseQuery();
            var isTable = !!(qx && String(qx.gmdev || '') === '1');
            var st = room && room.state ? room.state : null;
            var order = st && Array.isArray(st.order) ? st.order : [];
            var expected = order && order.length ? order.length : 0;
            var actual = room && room.players ? Object.keys(room.players || {}).length : 0;
            var enough = expected >= 3 ? actual >= expected : actual >= 3;
            if (isHost && isTable && room && room.phase === 'lobby' && room.players && enough) {
              if (!routeHanninTable.__autoDealt) routeHanninTable.__autoDealt = {};
              var key = String(roomId || '') + '|' + String(Object.keys(room.players || {}).length);
              if (!routeHanninTable.__autoDealt[key]) {
                routeHanninTable.__autoDealt[key] = true;
                dealHanninGame(roomId).catch(function () {
                  // ignore
                });
              }
            }
          } catch (eAD) {
            // ignore
          }

          // Bind buttons (host and players)

          var abortBtn = document.getElementById('hnAbortToLobby');
          if (abortBtn && !abortBtn.__hn_bound) {
            abortBtn.__hn_bound = true;
            abortBtn.addEventListener('click', function () {
              if (!bbgConfirmClick(abortBtn, 'ゲームを中断して\nぜんいんロビーに戻ります。', 'ロビーに戻る')) return;
              if (!lobbyId) return;
              abortBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  return setLobbyCurrentGame(lobbyId, null);
                })
                .then(function () {
                  redirectToLobbyHost();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  abortBtn.disabled = false;
                });
            });
          }

          var nextBtn = document.getElementById('hnNextToLobby');
          if (nextBtn && !nextBtn.__hn_bound) {
            nextBtn.__hn_bound = true;
            nextBtn.addEventListener('click', function () {
              if (!lobbyId) return;
              nextBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  return setLobbyCurrentGame(lobbyId, null);
                })
                .then(function () {
                  redirectToLobbyHost();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  nextBtn.disabled = false;
                });
            });
          }

          // (removed) Manual deal button: auto-deal is used.

          function chooseTargetPid(room, actorPid, allowSelf, requireHasHand) {
            var players = (room && room.players) || {};
            var order = room && room.state && Array.isArray(room.state.order) ? room.state.order : Object.keys(players || {});
            var opts = [];
            for (var i = 0; i < order.length; i++) {
              var pid = String(order[i] || '');
              if (!pid) continue;
              if (!allowSelf && String(pid) === String(actorPid)) continue;
              if (requireHasHand) {
                var hh = room && room.state && room.state.hands && Array.isArray(room.state.hands[pid]) ? room.state.hands[pid] : [];
                if (!hh.length) continue;
              }
              opts.push(pid);
            }
            if (!opts.length) return '';
            var msg =
              '対象を選んでください:\n' +
              opts
                .map(function (p, idx) {
                  return String(idx + 1) + '. ' + hnPlayerName(room, p);
                })
                .join('\n');
            var s = prompt(msg, '1');
            var n = parseIntSafe(s, 0);
            if (n < 1 || n > opts.length) return '';
            return String(opts[n - 1] || '');
          }

          function chooseHiddenCardIndex(room, pid) {
            var h = room && room.state && room.state.hands && Array.isArray(room.state.hands[pid]) ? room.state.hands[pid] : [];
            if (!h.length) return -1;
            var msg = '相手の手札から選んでください（番号）: 1〜' + String(h.length);
            var s = prompt(msg, '1');
            var n = parseIntSafe(s, 0);
            if (n < 1 || n > h.length) return -1;
            return n - 1;
          }

          var playBtns = document.querySelectorAll('.hnPlay');
          for (var iB = 0; iB < playBtns.length; iB++) {
            var b = playBtns[iB];
            if (!b || b.__hn_bound) continue;
            b.__hn_bound = true;
            b.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              if (!el) return;
              var pid = String(el.getAttribute('data-pid') || '');
              var idx = parseIntSafe(el.getAttribute('data-idx'), -1);
              if (!pid || idx < 0) return;

              // Table device: only operate test players.
              try {
                var qx = parseQuery();
                var isTable = !!(qx && String(qx.gmdev || '') === '1');
                if (isTable && !hnIsTestPlayerId(pid)) return;
              } catch (eTOp) {
                // ignore
              }

              var room = lastRoom;
              var cardId = '';
              try {
                cardId = room && room.state && room.state.hands && Array.isArray(room.state.hands[pid]) ? String(room.state.hands[pid][idx] || '') : '';
              } catch (e0) {
                cardId = '';
              }

              var action = {};
              if (cardId === 'detective') {
                var t = chooseTargetPid(room, pid, false);
                if (!t) return;
                action = { targetPid: t };
              } else if (cardId === 'dog') {
                var t2 = chooseTargetPid(room, pid, false);
                if (!t2) return;
                var pick = chooseHiddenCardIndex(room, t2);
                if (pick < 0) return;
                action = { targetPid: t2, targetIndex: pick };
              } else if (cardId === 'deal') {
                var t3 = chooseTargetPid(room, pid, false, true);
                if (!t3) return;
                action = { targetPid: t3 };
              } else if (cardId === 'witness') {
                var t4 = chooseTargetPid(room, pid, false);
                if (!t4) return;
                // Show after play succeeds.
                action = { targetPid: t4 };
              } else if (cardId === 'boy') {
                action = {};
              }

              playHanninCard(roomId, pid, idx, action)
                .then(function () {
                  // Post-play private reveals
                  if (!lastRoom || !lastRoom.state) return;
                  if (cardId === 'witness') {
                    var tp = action && action.targetPid ? String(action.targetPid) : '';
                    if (!tp) return;
                    var th = lastRoom.state.hands && Array.isArray(lastRoom.state.hands[tp]) ? lastRoom.state.hands[tp] : [];
                    var names = th.map(function (id) {
                      var def = HANNIN_CARD_DEFS[String(id || '')] || { name: String(id || '-') };
                      return String(def.name || id);
                    });
                    alert('目撃者：' + hnPlayerName(lastRoom, tp) + ' の手札\n' + names.join(' / '));
                  } else if (cardId === 'boy') {
                    var order = lastRoom.state.order || [];
                    var cpid = hnFindCulpritHolder(order, lastRoom.state.hands);
                    if (cpid) alert('少年：犯人は ' + hnPlayerName(lastRoom, cpid));
                  }
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                });
            });
          }

          var infoBtns = document.querySelectorAll('.hnInfoChoose');
          for (var iI = 0; iI < infoBtns.length; iI++) {
            var bi = infoBtns[iI];
            if (!bi || bi.__hn_bound) continue;
            bi.__hn_bound = true;
            bi.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              if (!el) return;
              var pid = String(el.getAttribute('data-pid') || '');
              var idx = parseIntSafe(el.getAttribute('data-idx'), -1);
              if (!pid || idx < 0) return;
              // Table device: only operate test players.
              try {
                var qx = parseQuery();
                var isTable = !!(qx && String(qx.gmdev || '') === '1');
                if (isTable && !hnIsTestPlayerId(pid)) return;
              } catch (eTOp2) {
                // ignore
              }
              submitHanninInfoChoice(roomId, pid, idx).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var rumorBtns = document.querySelectorAll('.hnRumorChoose');
          for (var iR = 0; iR < rumorBtns.length; iR++) {
            var br = rumorBtns[iR];
            if (!br || br.__hn_bound) continue;
            br.__hn_bound = true;
            br.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              if (!el) return;
              var pid = String(el.getAttribute('data-pid') || '');
              var idx = parseIntSafe(el.getAttribute('data-idx'), -1);
              if (!pid || idx < 0) return;
              // Table device: only operate test players.
              try {
                var qx = parseQuery();
                var isTable = !!(qx && String(qx.gmdev || '') === '1');
                if (isTable && !hnIsTestPlayerId(pid)) return;
              } catch (eTOp3) {
                // ignore
              }
              submitHanninRumorChoice(roomId, pid, idx).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          var dealBtns = document.querySelectorAll('.hnDealChoose');
          for (var iD = 0; iD < dealBtns.length; iD++) {
            var bd = dealBtns[iD];
            if (!bd || bd.__hn_bound) continue;
            bd.__hn_bound = true;
            bd.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              if (!el) return;
              var pid = String(el.getAttribute('data-pid') || '');
              var idx = parseIntSafe(el.getAttribute('data-idx'), -1);
              if (!pid || idx < 0) return;
              // Table device: only operate test players.
              try {
                var qx = parseQuery();
                var isTable = !!(qx && String(qx.gmdev || '') === '1');
                if (isTable && !hnIsTestPlayerId(pid)) return;
              } catch (eTOp4) {
                // ignore
              }
              submitHanninDealChoice(roomId, pid, idx).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      try {
        if (lobbyUnsub) lobbyUnsub();
      } catch (e0) {
        // ignore
      }
    });
  }

  function routeCodenamesTable(roomId, isHost) {
    if (!isHost) {
      var qx0 = {};
      var vx0 = getCacheBusterParam();
      if (vx0) qx0.v = vx0;
      qx0.room = roomId;
      qx0.player = '1';
      try {
        var qq0 = parseQuery();
        if (qq0 && qq0.lobby) qx0.lobby = String(qq0.lobby);
      } catch (e1) {
        // ignore
      }
      qx0.screen = 'codenames_player';
      setQuery(qx0);
      route();
      return;
    }

    var unsub = null;
    var timerHandle = null;
    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    function redirectToLobby() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = 'lobby_host';
      try {
        var qx = parseQuery();
        if (qx && String(qx.gmdev || '') === '1') q.gmdev = '1';
      } catch (e) {
        // ignore
      }
      setQuery(q);
      route();
    }

    var lobbyReturnWatching = false;
    var lobbyUnsub = null;
    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (lobbyReturnWatching) return;
      lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'codenames' || rid !== String(roomId || '')) {
              try {
                if (lobbyUnsub) lobbyUnsub();
              } catch (e) {
                // ignore
              }
              lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    firebaseReady()
      .then(function () {
        if (lobbyId) ensureLobbyReturnWatcher();
        return subscribeCodenamesRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          renderCodenamesTable(viewEl, { roomId: roomId, room: room, isHost: isHost, lobbyId: lobbyId });

          function rerenderCnTimer() {
            var el = document.getElementById('cnTimer');
            if (!el) return;
            if (!room || room.phase !== 'playing') return;
            var endAt = room.turn && room.turn.endsAt ? room.turn.endsAt : 0;
            if (!endAt) {
              el.textContent = '-:--';
              return;
            }
            var remain = Math.max(0, Math.floor((endAt - serverNowMs()) / 1000));
            el.textContent = formatMMSS(remain);
          }

          if (timerHandle) clearInterval(timerHandle);
          timerHandle = setInterval(function () {
            rerenderCnTimer();
          }, 250);

          if (lobbyId) ensureLobbyReturnWatcher();

          var abortBtn = document.getElementById('cnAbortToLobby');
          if (abortBtn && !abortBtn.__cn_bound) {
            abortBtn.__cn_bound = true;
            abortBtn.addEventListener('click', function () {
              if (!bbgConfirmClick(abortBtn, 'ゲームを中断して\nぜんいんロビーに戻ります。', 'ロビーに戻る')) return;
              if (!lobbyId) return;
              abortBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  return setLobbyCurrentGame(lobbyId, null);
                })
                .then(function () {
                  redirectToLobby();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  abortBtn.disabled = false;
                });
            });
          }

          var nextBtn = document.getElementById('cnNextToLobby');
          if (nextBtn && !nextBtn.__cn_bound) {
            nextBtn.__cn_bound = true;
            nextBtn.addEventListener('click', function () {
              if (!lobbyId) return;
              nextBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  return resetCodenamesToLobby(roomId)
                    .catch(function () {
                      return null;
                    })
                    .then(function () {
                      return setLobbyCurrentGame(lobbyId, null);
                    });
                })
                .then(function () {
                  redirectToLobby();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  nextBtn.disabled = false;
                });
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      if (timerHandle) clearInterval(timerHandle);
    });
  }

  // ==================== oekaki battle (screens) ====================

  // 13色: 黒/灰/茶/赤/橙/うすだいだい/黄/黄緑/緑/水色/青/紫/ピンク
  // （白背景キャンバス前提。白は消しゴムで代用できるので入れない）
  var OEKAKI_COLORS = [
    '#111111', '#8a8a8a', '#8b5a2b', '#e5322d',
    '#f5821f', '#ffcb9a', '#f5d10c', '#8cc63f',
    '#1f9d55', '#4fc3f7', '#2158d2', '#8e44ad',
    '#f06292'
  ];

  // スタンプ（絵文字）: タップした場所に押せる。ふとさスライダーで大きさが変わる。
  // 毎回おなじだと飽きるので、ラウンドごとにこのプールからランダムで選び直す。
  var OEKAKI_STAMP_POOL = [
    '⭐', '❤️', '😀', '🐱', '🌸', '🍎', '☀️', '🌈',
    '🎈', '🐶', '🐰', '🐼', '🐸', '🐤', '🦋', '🐟',
    '🍰', '🍩', '🍓', '🍌', '🍕', '⚽', '🎵', '✨',
    '🔥', '⚡', '☁️', '🌙', '🍀', '🌻', '🎀', '👑',
    '💎', '🚗', '✈️', '🚀', '🏠', '😎', '😂', '👍',
    '🐻', '🐷', '🦁', '🐵', '🍉', '🍇', '🎃', '⛄'
  ];
  var OEKAKI_STAMP_COUNT = 8;

  // 回転後にレイアウトが確定するまでの測り直しタイミング（ms）。
  var OK_REFIT_DELAYS = [80, 260, 600, 1100];

  // 「もどす」で戻れる回数（1操作＝キャンバス1枚ぶんの控えなので持ちすぎない）。
  var OK_UNDO_MAX = 10;

  // プールから重複なしでn個ひろう。
  function pickOekakiStamps(n) {
    var pool = OEKAKI_STAMP_POOL.slice();
    var out = [];
    var k = Math.min(parseIntSafe(n, 8), pool.length);
    for (var i = 0; i < k; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  // ラウンドが変わったら引き直す（同じラウンド内では並びを固定して押し間違いを防ぐ）。
  function oekakiStampsFor(ui, roundIndex) {
    var key = 'r' + String(roundIndex);
    if (!ui.stamps || !ui.stamps.length || ui.stampsKey !== key) {
      ui.stamps = pickOekakiStamps(OEKAKI_STAMP_COUNT);
      ui.stampsKey = key;
      // 前ラウンドで選んでいたスタンプが今回いない場合はペンに戻す。
      if (ui.stamp && ui.stamps.indexOf(ui.stamp) < 0) ui.stamp = '';
    }
    return ui.stamps;
  }

  function oekakiTopicHtml(room) {
    var topic = String((room && room.round && room.round.topic) || '');
    return 'おだい「<b>' + escapeHtml(topic) + '</b>」';
  }

  // フルスクリーン描画画面のHTML。createOekakiDrawEngine がこのDOM（#okCanvas ほか）を前提にする。
  // opts: { topic, ui, roundIndex, statusText }
  function oekakiDrawFsHtml(opts) {
    var o = opts || {};
    var ui = o.ui || {};
    var roundIndex = parseIntSafe(o.roundIndex, 1);

    var paletteHtml = '';
    for (var i = 0; i < OEKAKI_COLORS.length; i++) {
      var c = OEKAKI_COLORS[i];
      paletteHtml +=
        '<button class="ok-color okColorBtn' +
        (!ui.eraser && ui.color === c ? ' sel' : '') +
        '" data-c="' +
        escapeHtml(c) +
        '" style="background:' +
        escapeHtml(c) +
        '" aria-label="いろ"></button>';
    }
    paletteHtml +=
      '<button id="okEraser" class="ok-eraser' + (ui.eraser ? ' sel' : '') + '" aria-label="けしゴム" title="けしゴム">🧽</button>';

    var stampList = oekakiStampsFor(ui, roundIndex);
    var stampHtml = '';
    for (var si = 0; si < stampList.length; si++) {
      var st = stampList[si];
      stampHtml +=
        '<button class="ok-stampbtn okStampBtn' +
        (ui.stamp === st ? ' sel' : '') +
        '" data-s="' +
        escapeHtml(st) +
        '" aria-label="スタンプ">' +
        st +
        '</button>';
    }

    return (
      '<div class="ok-fs" id="okFs">' +
      '<div class="ok-fs-top">' +
      '<div class="ok-fs-topic">おだい「<b>' +
      escapeHtml(String(o.topic || '')) +
      '</b>」</div>' +
      // 道具はキャンバスの上に重ねず、お題と同じ帯の中央にまとめる
      '<div class="ok-fs-tools">' +
      '<button id="okPaletteBtn" class="ok-fs-btn" aria-label="パレット" title="パレット">🎨</button>' +
      '<button id="okUndo" class="ok-fs-btn ok-histbtn" aria-label="もどす" title="もどす" disabled>↩︎</button>' +
      '<button id="okRedo" class="ok-fs-btn ok-histbtn" aria-label="やりなおす" title="やりなおす" disabled>↪︎</button>' +
      '</div>' +
      '<div class="ok-fs-right">' +
      '<button id="okFullscreen" class="ok-fs-btn" aria-label="ぜんがめん" title="ぜんがめん" style="display:none">⛶</button>' +
      '<button id="okDone" class="primary ok-done-btn">かんせい！</button>' +
      '<svg class="ok-ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle class="ok-ring-bg" cx="22" cy="22" r="18"></circle>' +
      '<circle class="ok-ring-fg" id="okRingFg" cx="22" cy="22" r="18"></circle>' +
      '</svg>' +
      '</div>' +
      '</div>' +
      '<div class="ok-fs-canvaswrap" id="okCanvasWrap">' +
      '<canvas id="okCanvas" width="640" height="640"></canvas>' +
      '<div id="okPenCursor" class="ok-pen-cursor" style="display:none" aria-hidden="true"></div>' +
      '<div id="okToolPanel" class="ok-tool-panel" style="display:none">' +
      '<div class="ok-palette">' +
      paletteHtml +
      '</div>' +
      '<div class="ok-stamps">' +
      stampHtml +
      '</div>' +
      '<div class="ok-pen-row">' +
      '<div class="ok-pen-head"><span class="muted ok-pen-label">ふとさ</span>' +
      '<span class="ok-pen-preview" aria-hidden="true"><i id="okPenPreviewDot"></i></span></div>' +
      '<input id="okPen" type="range" min="2" max="24" step="2" value="' +
      String(clamp(parseIntSafe(ui.penW, 6), 2, 24)) +
      '" /></div>' +
      '<button id="okClearAll" class="danger">ぜんぶ けす</button>' +
      '</div>' +
      '<div class="ok-fs-status" id="okStatus">' +
      escapeHtml(String(o.statusText || '')) +
      '</div>' +
      '<div id="okCountdown" class="ok-countdown" style="display:none"><span id="okCountdownNum" class="ok-count-num"></span></div>' +
      '</div>' +
      '</div>'
    );
  }

  function renderOekakiPlayer(viewEl, opts) {
    var room = opts.room;
    var playerId = opts.playerId;
    var isHost = !!opts.isHost;
    var isTableGmDevice = !!opts.isTableGmDevice;
    var ui = opts.ui;

    var phase = String((room && room.phase) || '');
    var players = (room && room.players) || {};
    var roundIndex = parseIntSafe(room && room.round && room.round.index, 1);
    var counts = oekakiCountSubmitted(room);
    var me = playerId ? players[playerId] : null;
    var meSubmitted = !!(me && me.image && parseIntSafe(me.round, 0) === roundIndex);
    var canDraw = !!(playerId && !isTableGmDevice && me);

    if (phase === 'drawing' && canDraw && !meSubmitted) {
      // フルスクリーン描画レイアウト（スマホ/タブレットの画面いっぱいにキャンバスを広げる）
      render(
        viewEl,
        oekakiDrawFsHtml({
          topic: String((room.round && room.round.topic) || ''),
          ui: ui,
          roundIndex: roundIndex,
          statusText: 'ていしゅつ ' + String(counts.submitted) + '/' + String(counts.total)
        })
      );
      return;
    }

    if (phase === 'drawing' || phase === 'judging') {
      var centerHtml = '';
      if (phase === 'judging') {
        // 判定中は全員の絵をギャラリー表示（ドキドキ感の演出）
        var galleryHtml = '';
        var orderJ = room && room.settings && Array.isArray(room.settings.order) ? room.settings.order : Object.keys(players);
        var gIdx = 0;
        for (var gi = 0; gi < orderJ.length; gi++) {
          var gPid = String(orderJ[gi] || '');
          if (!gPid) continue;
          var gp = players[gPid];
          if (!gp || !gp.image || parseIntSafe(gp.round, 0) !== roundIndex) continue;
          galleryHtml +=
            '<div class="ok-judge-item ok-in" style="animation-delay:' +
            String(Math.round(gIdx * 120) / 1000) +
            's"><img class="ok-judge-img" style="animation-delay:' +
            String(Math.round(gIdx * 300) / 1000) +
            's" src="' +
            escapeHtml(String(gp.image)) +
            '" alt="" /><div class="ok-judge-name">' +
            escapeHtml(String(gp.name || '')) +
            '</div></div>';
          gIdx++;
        }
        centerHtml =
          '<div class="ok-judge-icon">✏️</div>' +
          '<div class="big ok-pop">AIはんていちゅう<span class="ok-dots"><span>.</span><span>.</span><span>.</span></span></div>' +
          '<div class="muted">みんなの えを さいてんしています</div>' +
          (galleryHtml ? '<div class="ok-judge-grid">' + galleryHtml + '</div>' : '');
      } else if (meSubmitted) {
        centerHtml =
          '<div><span class="ok-stamp">ていしゅつ かんりょう！</span></div>' +
          '<div class="muted">みんなが かきおわるのを まってるよ<span class="ok-dots"><span>.</span><span>.</span><span>.</span></span></div>';
      } else {
        centerHtml = '<div class="ok-timer" id="okTimer">--:--</div>';
      }

      var myImgHtml = '';
      if (phase === 'drawing' && meSubmitted && me && me.image) {
        myImgHtml = '<img class="ok-mythumb ok-pop" src="' + escapeHtml(String(me.image)) + '" alt="じぶんのえ" />';
      }

      render(
        viewEl,
        '<div class="stack center">' +
          '<div class="ok-topic big">' +
          oekakiTopicHtml(room) +
          '</div>' +
          centerHtml +
          myImgHtml +
          '<div class="kv"><span class="muted">ていしゅつ</span><b id="okStatusCount">' +
          String(counts.submitted) +
          '/' +
          String(counts.total) +
          '</b></div>' +
          (phase === 'drawing' ? '<div class="muted">ぜんいん そろうか じかんぎれ で AIはんてい に すすみます。</div>' : '') +
          '</div>'
      );
      return;
    }

    if (phase === 'result') {
      var result = (room && room.result) || {};
      var entries = Array.isArray(result.entries) ? result.entries : [];

      var isSolo = Object.keys(players).length <= 1;
      var cards = '';
      var entryPids = {};
      for (var j = 0; j < entries.length; j++) {
        var en = entries[j] || {};
        var pid = String(en.pid || '');
        entryPids[pid] = true;
        var p = players[pid] || {};
        var img = p.image && parseIntSafe(p.round, 0) === roundIndex ? String(p.image) : '';
        var hasScore = en.score != null;
        var rank = parseIntSafe(en.rank, 0);
        cards +=
          '<div class="ok-result-card ok-in' +
          (!isSolo && hasScore && rank === 1 ? ' ok-first' : '') +
          '" style="animation-delay:' +
          String(Math.round(j * 150) / 1000) +
          's">' +
          '<div class="ok-result-head">' +
          (!isSolo && hasScore ? '<span class="ok-rank">' + (rank === 1 ? '👑 ' : '') + String(rank) + 'ばん</span>' : '') +
          '<b class="ok-result-name">' +
          escapeHtml(String(en.name || '')) +
          '</b>' +
          (hasScore
            ? '<span class="ok-score"><span class="okScoreNum" data-score="' +
              String(clamp(parseIntSafe(en.score, 0), 0, 100)) +
              '">0</span>てん</span>'
            : '') +
          '</div>' +
          (img ? '<img class="ok-result-img" src="' + escapeHtml(img) + '" alt="" />' : '<div class="muted">（がぞうなし）</div>') +
          (en.comment ? '<div class="muted ok-comment">' + escapeHtml(String(en.comment)) + '</div>' : '') +
          '</div>';
      }

      var missingNames = [];
      var orderR = room && room.settings && Array.isArray(room.settings.order) ? room.settings.order : Object.keys(players);
      for (var k = 0; k < orderR.length; k++) {
        var pidM = String(orderR[k] || '');
        if (!pidM || entryPids[pidM]) continue;
        var pm = players[pidM];
        if (!pm) continue;
        missingNames.push(String(pm.name || '（無名）'));
      }
      var missingHtml = missingNames.length
        ? '<div class="muted center">みていしゅつ: ' + escapeHtml(missingNames.join('、')) + '</div>'
        : '';

      var errorHtml = result.error ? '<div class="card ok-error">' + escapeHtml(String(result.error)) + '</div>' : '';

      var hostHtml = '';
      if (isHost) {
        var modeR = room && room.settings && room.settings.topicMode === 'custom' ? 'custom' : 'random';
        hostHtml += '<hr />';
        if (result.error) {
          hostHtml += '<div class="row"><button id="okRejudge" class="ghost">AIはんていを やりなおす</button></div>';
        }
        if (modeR === 'custom') {
          hostHtml +=
            '<div class="field"><label>つぎのおだい</label><input id="okReplayTopic" placeholder="れい: ふじさん" /></div>' +
            '<div class="row"><button id="okReplayCustom" class="primary">このおだいで もういっかい</button></div>';
        } else {
          hostHtml += '<div class="row"><button id="okReplay" class="primary">もういっかい（あたらしいおだい）</button></div>';
        }
        hostHtml += '<div class="muted">おわるときは がめん うえの タイトル（ロビーへ）を タップしてね。</div>';
        hostHtml += '<div id="okHostError" class="form-error" role="alert"></div>';
      }

      render(
        viewEl,
        '<div class="stack">' +
          '<div class="big center ok-pop">' + (isSolo ? 'さいてんけっか' : 'けっかはっぴょう！') + '</div>' +
          '<div class="muted center">' +
          oekakiTopicHtml(room) +
          '（ラウンド' +
          String(roundIndex) +
          '）</div>' +
          errorHtml +
          '<div class="ok-result-cards">' +
          cards +
          '</div>' +
          missingHtml +
          hostHtml +
          '</div>'
      );
      return;
    }

    render(viewEl, '<div class="stack center"><div class="muted">よみこみちゅう…</div></div>');
  }

  // 結果画面のスコアを0からカウントアップさせる演出
  function animateOekakiScores() {
    var nodes = document.querySelectorAll('.okScoreNum');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        if (!node || node.__ok_animated) return;
        node.__ok_animated = true;
        var target = parseIntSafe(node.getAttribute('data-score'), 0);
        var start = nowMs();
        var dur = 900;
        // requestAnimationFrame はバックグラウンドタブで止まるため setTimeout で進める
        function step() {
          var t = (nowMs() - start) / dur;
          if (t >= 1) {
            node.textContent = String(target);
            return;
          }
          node.textContent = String(Math.floor(target * t));
          setTimeout(step, 33);
        }
        try {
          setTimeout(step, 33);
        } catch (e) {
          node.textContent = String(target);
        }
      })(nodes[i]);
    }
  }

  // ==================== oekaki: 描画エンジン（共通） ====================
  // キャンバス／ツールパネル／もどす・やりなおす／回転追従／全画面 をまとめた描画UI。
  // おえかきバトル（同室モード）とリレーモードの両方から使う。
  // ui: 呼び出し側が保持する状態オブジェクト（makeOekakiDrawUi() で作る）
  // opts.onDone: 「かんせい！」を押して確認したときに呼ばれる（提出処理は呼び出し側の担当）
  function createOekakiDrawEngine(ui, opts) {
    var options = opts || {};

    function updateToolSelection() {
      var colorBtns = document.querySelectorAll('.okColorBtn');
      for (var i = 0; i < colorBtns.length; i++) {
        var b = colorBtns[i];
        if (!b) continue;
        var c = String(b.getAttribute('data-c') || '');
        // スタンプ選択中や消しゴム中は色ハイライトを消す
        if (!ui.eraser && !ui.stamp && c === ui.color) b.classList.add('sel');
        else b.classList.remove('sel');
      }
      var er = document.getElementById('okEraser');
      if (er) {
        if (ui.eraser) er.classList.add('sel');
        else er.classList.remove('sel');
      }
      var stampBtns = document.querySelectorAll('.okStampBtn');
      for (var j = 0; j < stampBtns.length; j++) {
        var sb = stampBtns[j];
        if (!sb) continue;
        var sv = String(sb.getAttribute('data-s') || '');
        if (ui.stamp && sv === ui.stamp) sb.classList.add('sel');
        else sb.classList.remove('sel');
      }
      updatePenPreview();
    }

    // いま引かれる線の太さ（画面上のCSSピクセル）。消しゴムは3倍（strokeSegと同じ）。
    function currentPenCssSize() {
      var w = clamp(parseIntSafe(ui.penW, 6), 2, 24);
      if (ui.eraser) w = w * 3;
      return w;
    }

    // 「ふとさ」スライダーの横に実寸の丸を出す（動かす前に太さが分かるように）。
    function updatePenPreview() {
      var dot = document.getElementById('okPenPreviewDot');
      if (!dot) return;
      var d = currentPenCssSize();
      dot.style.width = d + 'px';
      dot.style.height = d + 'px';
      dot.style.background = ui.eraser ? '#ffffff' : ui.color;
    }

    // 描いている最中に、これから引かれる太さの枠を指先（カーソル）に重ねて出す。
    function movePenCursor(ev) {
      var el = document.getElementById('okPenCursor');
      var wrap = document.getElementById('okCanvasWrap');
      if (!el || !wrap) return;
      // スタンプはタップした瞬間に押されるので枠は出さない。
      if (ui.stamp && !ui.eraser) {
        el.style.display = 'none';
        return;
      }
      var r = wrap.getBoundingClientRect();
      var d = currentPenCssSize();
      el.style.width = d + 'px';
      el.style.height = d + 'px';
      el.style.left = String(ev.clientX - r.left) + 'px';
      el.style.top = String(ev.clientY - r.top) + 'px';
      el.style.display = '';
    }

    function hidePenCursor() {
      var el = document.getElementById('okPenCursor');
      if (el) el.style.display = 'none';
    }

    // ---- もどす／やりなおす ----
    // 1操作ぶん（ひとふで・スタンプ1個・ぜんぶけす）ごとにキャンバスをまるごと
    // 控えておく。線をなぞり直すより単純で、消しゴムやスタンプも同じ扱いにできる。
    function okSnapshot() {
      var cv = document.getElementById('okCanvas');
      if (!cv || !cv.width || !cv.height) return null;
      try {
        var c = document.createElement('canvas');
        c.width = cv.width;
        c.height = cv.height;
        c.getContext('2d').drawImage(cv, 0, 0);
        return c;
      } catch (eSnap) {
        return null;
      }
    }

    function updateHistoryButtons() {
      var ub = document.getElementById('okUndo');
      var rb = document.getElementById('okRedo');
      if (ub) ub.disabled = !(ui.undoStack && ui.undoStack.length);
      if (rb) rb.disabled = !(ui.redoStack && ui.redoStack.length);
    }

    // 描き始める直前に呼ぶ（＝この操作の「前」の状態を積む）。
    function pushHistory() {
      var snap = okSnapshot();
      if (!snap) return;
      if (!ui.undoStack) ui.undoStack = [];
      ui.undoStack.push(snap);
      if (ui.undoStack.length > OK_UNDO_MAX) ui.undoStack.shift();
      ui.redoStack = []; // 新しく描いたらやりなおしの先は消える
      updateHistoryButtons();
    }

    function clearHistory() {
      ui.undoStack = [];
      ui.redoStack = [];
      updateHistoryButtons();
    }

    function applySnapshot(snap) {
      var cv = document.getElementById('okCanvas');
      if (!cv || !snap) return false;
      // 回転などで大きさが変わった控えは使えない
      if (snap.width !== cv.width || snap.height !== cv.height) return false;
      try {
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(snap, 0, 0);
        return true;
      } catch (eApply) {
        return false;
      }
    }

    function historyStep(fromStack, toStack) {
      if (!fromStack || !fromStack.length) return;
      var cur = okSnapshot();
      var snap = fromStack.pop();
      if (applySnapshot(snap)) {
        if (cur) toStack.push(cur);
      }
      updateHistoryButtons();
    }

    function doUndo() {
      if (!ui.undoStack || !ui.undoStack.length) return;
      if (!ui.redoStack) ui.redoStack = [];
      historyStep(ui.undoStack, ui.redoStack);
    }

    function doRedo() {
      if (!ui.redoStack || !ui.redoStack.length) return;
      if (!ui.undoStack) ui.undoStack = [];
      historyStep(ui.redoStack, ui.undoStack);
    }

    function setToolPanelVisible(show) {
      var p = document.getElementById('okToolPanel');
      if (!p) return;
      p.style.display = show ? '' : 'none';
      if (show) {
        updatePenPreview();
        hidePenCursor();
      }
    }

    // 全画面（Fullscreen API）。QR参加者はSafariで開くため、操作中に
    // ブラウザのツールバー（共有ボタン等）が出てしまう。iPadではFullscreen APIで
    // ホストの「ホーム画面に追加」と同様の全画面にし、ツールバー/共有マークを隠す。
    function okStandalone() {
      try {
        if (window.navigator && window.navigator.standalone) return true;
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      } catch (e) {
        // ignore
      }
      return false;
    }
    function okFsAvailable() {
      var el = document.documentElement;
      return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen));
    }
    function okIsFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
    function okEnterFullscreen() {
      var el = document.documentElement;
      if (!el) return;
      try {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (e) {
        // ignore
      }
    }
    // 全画面ボタンの表示可否を更新（全画面中/standalone/非対応なら隠す）。
    function updateFullscreenBtn() {
      var b = document.getElementById('okFullscreen');
      if (!b) return;
      var show = okFsAvailable() && !okStandalone() && !okIsFullscreen();
      b.style.display = show ? '' : 'none';
    }

    // アプリ内確認ダイアログ。iOSのホーム画面PWA(standalone)では
    // ネイティブの confirm() が無反応になり「かんせい」ボタンが効かない不具合が出るため、
    // DOM上の確認オーバーレイに置き換える（全環境で確実に動く）。
    function okShowConfirm(message, yesLabel, onYes) {
      var ex = document.getElementById('okConfirm');
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
      var host = document.getElementById('okFs') || document.body;
      var ov = document.createElement('div');
      ov.id = 'okConfirm';
      ov.className = 'ok-confirm';
      ov.innerHTML =
        '<div class="ok-confirm-box"><div class="ok-confirm-msg">' +
        escapeHtml(String(message || '')) +
        '</div><div class="ok-confirm-btns">' +
        '<button type="button" class="ghost" id="okConfirmNo">いいえ</button>' +
        '<button type="button" class="primary" id="okConfirmYes">' +
        escapeHtml(String(yesLabel || 'はい')) +
        '</button></div></div>';
      host.appendChild(ov);
      var close = function () {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      };
      var noBtn = document.getElementById('okConfirmNo');
      var yesBtn = document.getElementById('okConfirmYes');
      if (noBtn) noBtn.addEventListener('click', close);
      if (yesBtn)
        yesBtn.addEventListener('click', function () {
          close();
          if (onYes) onYes();
        });
      ov.addEventListener('click', function (e) {
        if (e.target === ov) close();
      });
    }

    // キャンバスの内部解像度を表示領域のアスペクト比に合わせる（長辺640）。
    // preserve=true のとき、現在の絵を保持したまま新しいサイズに描き直す
    // （縦横回転時にアスペクト比が変わっても絵を消さない・歪ませない）。
    // 表示領域から内部解像度（長辺640）を求める。表示は常にCSSで領域いっぱいに
    // 伸ばすので、この比率が実際の表示領域とズレると絵が歪んで見える。
    function okTargetSize() {
      var wrap = document.getElementById('okCanvasWrap');
      if (!wrap) return null;
      var rw = wrap.clientWidth;
      var rh = wrap.clientHeight;
      if (rw < 2 || rh < 2) return null;
      var sc = 640 / Math.max(rw, rh);
      return { w: Math.max(64, Math.round(rw * sc)), h: Math.max(64, Math.round(rh * sc)) };
    }

    // 実際に描かれている範囲（白でないピクセル）の外接矩形。まっさらなら null。
    // 回転のたびに「余白ごと」縮小コピーすると絵がどんどん小さくなるため、
    // 中身だけを取り出して置き直せるようにする。
    function okContentRect(src) {
      var w = src.width;
      var h = src.height;
      if (w < 1 || h < 1) return null;
      var data;
      try {
        data = src.getContext('2d').getImageData(0, 0, w, h).data;
      } catch (eImg) {
        return { x: 0, y: 0, w: w, h: h }; // 取れない環境では全面を対象にする
      }
      var minX = w;
      var minY = h;
      var maxX = -1;
      var maxY = -1;
      for (var y = 0; y < h; y++) {
        var base = y * w * 4;
        for (var x = 0; x < w; x++) {
          var i = base + x * 4;
          // 白背景なので、少しでも色がついていれば「描かれている」とみなす
          if (data[i] > 249 && data[i + 1] > 249 && data[i + 2] > 249) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) return null;
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    function sizeOekakiCanvas(preserve) {
      var cv = document.getElementById('okCanvas');
      var t = okTargetSize();
      if (!cv || !t) return;
      var nw = t.w;
      var nh = t.h;
      if (cv.width === nw && cv.height === nh) return; // 変化なし

      var prevW = cv.width;
      var prevH = cv.height;
      var art = null;
      var rect = null;
      if (preserve && prevW > 0 && prevH > 0) {
        try {
          rect = okContentRect(cv);
          if (rect) {
            art = document.createElement('canvas');
            art.width = rect.w;
            art.height = rect.h;
            art.getContext('2d').drawImage(cv, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
          }
        } catch (eCopy) {
          art = null;
        }
      }

      cv.width = nw; // 幅/高さ変更でキャンバスはクリアされる
      cv.height = nh;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, nw, nh);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (!preserve) ui.artScale = 1;
      clearHistory(); // 大きさが変わった控えは使えない

      if (art && rect) {
        // 縦横比が変わるので、入り切らない分だけ縮小する（歪ませない）。
        // 逆向きに回して戻したときは元の大きさまで戻す＝回転を繰り返しても
        // 絵がどんどん小さくならない。描いたときより大きくはしない。
        var grow = ui.artScale > 0 ? 1 / ui.artScale : 1;
        var s = Math.min(grow, nw / art.width, nh / art.height);
        if (!(s > 0)) s = 1;
        var dw = Math.max(1, art.width * s);
        var dh = Math.max(1, art.height * s);
        // 画面の中でどのあたりに描かれていたか（中心の相対位置）は保つ
        var cx = ((rect.x + rect.w / 2) / prevW) * nw;
        var cy = ((rect.y + rect.h / 2) / prevH) * nh;
        var dx = clamp(Math.round(cx - dw / 2), 0, Math.max(0, nw - dw));
        var dy = clamp(Math.round(cy - dh / 2), 0, Math.max(0, nh - dh));
        try {
          ctx.drawImage(art, dx, dy, dw, dh);
          ui.artScale = ui.artScale * s;
        } catch (eDraw) {
          // ignore
        }
      }
    }

    // 回転直後は端末によってレイアウトの確定が遅れ、clientWidth/Height が
    // 回転前の値のままだったり途中の値を返したりする。その値で内部解像度を
    // 決めるとCSSで引き伸ばされ「画面にフィットせず拡大されすぎ」た状態になる。
    // そこで、同じ値が2回続けて取れた（＝レイアウトが落ち着いた）ときだけ反映する。
    function okRefitTick() {
      var cv = document.getElementById('okCanvas');
      if (!cv) return;
      var t = okTargetSize();
      if (!t) return;
      var key = String(t.w) + 'x' + String(t.h);
      if (cv.width === t.w && cv.height === t.h) {
        ui.fitKey = key;
        return;
      }
      if (ui.fitKey !== key) {
        ui.fitKey = key;
        return;
      }
      sizeOekakiCanvas(true);
    }

    function clearRefitTimers() {
      if (ui.refitTimers) {
        for (var i = 0; i < ui.refitTimers.length; i++) clearTimeout(ui.refitTimers[i]);
      }
      ui.refitTimers = [];
    }

    // 回転・全画面の切替後、確定するまで何度か測り直す（サイズが合っていれば
    // 何もしないので、空振りしても害はない）。
    function scheduleOkRefit() {
      clearRefitTimers();
      for (var i = 0; i < OK_REFIT_DELAYS.length; i++) {
        ui.refitTimers.push(setTimeout(okRefitTick, OK_REFIT_DELAYS[i]));
      }
    }

    // 表示領域そのものの変化を拾う（回転イベントより確実で、全画面切替や
    // iOSのツールバー出入りにも追従する）。
    function observeOekakiWrap() {
      var wrap = document.getElementById('okCanvasWrap');
      if (!wrap || typeof window.ResizeObserver !== 'function') return;
      try {
        if (ui.resizeObs) ui.resizeObs.disconnect();
        ui.resizeObs = new window.ResizeObserver(function () {
          scheduleOkRefit();
        });
        ui.resizeObs.observe(wrap);
      } catch (eObs) {
        ui.resizeObs = null;
      }
    }

    // お絵かき画面のあいだだけ、縦横回転リサイズ対応と
    // 「描く・ボタン」以外のジェスチャー（ピンチズーム/ダブルタップズーム）を無効化する。
    // 画面を離れたら teardownOekakiGlobalHandlers() で必ず解除する（他画面のズームを妨げない）。
    function setupOekakiGlobalHandlers() {
      if (ui.globalHandlersBound) return;
      ui.globalHandlersBound = true;

      var onOkResize = function () {
        scheduleOkRefit();
      };
      // iOSのピンチズーム（gesture*）と2本指操作を無効化
      var stopGesture = function (e) {
        if (e && e.preventDefault) e.preventDefault();
      };
      var stopMultiTouch = function (e) {
        if (e && e.touches && e.touches.length > 1 && e.preventDefault) e.preventDefault();
      };
      // 全画面の出入りでボタン表示とキャンバスサイズを合わせ直す
      var onFsChange = function () {
        try {
          updateFullscreenBtn();
        } catch (eF) {
          // ignore
        }
        scheduleOkRefit();
      };

      window.addEventListener('resize', onOkResize);
      window.addEventListener('orientationchange', onOkResize);
      // iOS Safari は回転で window.resize が来ない場合があるため visualViewport も見る
      var vv = window.visualViewport || null;
      if (vv && vv.addEventListener) vv.addEventListener('resize', onOkResize);
      document.addEventListener('gesturestart', stopGesture, { passive: false });
      document.addEventListener('gesturechange', stopGesture, { passive: false });
      document.addEventListener('gestureend', stopGesture, { passive: false });
      document.addEventListener('dblclick', stopGesture, { passive: false });
      document.addEventListener('touchmove', stopMultiTouch, { passive: false });
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);

      ui.teardownGlobal = function () {
        try {
          window.removeEventListener('resize', onOkResize);
          window.removeEventListener('orientationchange', onOkResize);
          if (vv && vv.removeEventListener) vv.removeEventListener('resize', onOkResize);
          document.removeEventListener('gesturestart', stopGesture, { passive: false });
          document.removeEventListener('gesturechange', stopGesture, { passive: false });
          document.removeEventListener('gestureend', stopGesture, { passive: false });
          document.removeEventListener('dblclick', stopGesture, { passive: false });
          document.removeEventListener('touchmove', stopMultiTouch, { passive: false });
          document.removeEventListener('fullscreenchange', onFsChange);
          document.removeEventListener('webkitfullscreenchange', onFsChange);
        } catch (e) {
          // ignore
        }
        if (ui.resizeTimer) {
          clearTimeout(ui.resizeTimer);
          ui.resizeTimer = null;
        }
        clearRefitTimers();
        if (ui.resizeObs) {
          try {
            ui.resizeObs.disconnect();
          } catch (eDis) {
            // ignore
          }
          ui.resizeObs = null;
        }
        ui.globalHandlersBound = false;
        ui.teardownGlobal = null;
      };
    }

    function setupCanvasAndTools() {
      var cv = document.getElementById('okCanvas');
      if (cv && !cv.__ok_bound) {
        cv.__ok_bound = true;

        // 画面いっぱいのキャンバス（スマホ縦長/タブレット横長どちらも全面）。
        sizeOekakiCanvas(false);
        observeOekakiWrap();
        scheduleOkRefit(); // 初期表示直後にレイアウトが動く端末への保険

        var ctx = cv.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        var drawing = false;
        var last = null;

        function posFromEvent(ev) {
          var r = cv.getBoundingClientRect();
          if (!r || !r.width || !r.height) return { x: 0, y: 0 };
          return {
            x: (ev.clientX - r.left) * (cv.width / r.width),
            y: (ev.clientY - r.top) * (cv.height / r.height)
          };
        }

        function strokeSeg(a, b) {
          var r = cv.getBoundingClientRect();
          var scale = r && r.width ? cv.width / r.width : 1;
          ctx.strokeStyle = ui.eraser ? '#ffffff' : ui.color;
          var w = clamp(parseIntSafe(ui.penW, 6), 2, 24) * scale;
          if (ui.eraser) w = w * 3;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        // スタンプ（絵文字）を1回押す。大きさは「ふとさ」に連動。
        function placeStamp(pos) {
          if (!ui.stamp) return;
          var sizePx = clamp(parseIntSafe(ui.penW, 6), 2, 24) * (Math.min(cv.width, cv.height) / 90);
          sizePx = Math.max(20, Math.round(sizePx));
          ctx.save();
          ctx.font = sizePx + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          try {
            ctx.fillText(ui.stamp, pos.x, pos.y);
          } catch (eStamp) {
            // ignore
          }
          ctx.restore();
        }

        cv.addEventListener('pointerdown', function (ev) {
          if (ev.pointerType === 'mouse' && ev.button !== 0) return;
          if (ev.preventDefault) ev.preventDefault();
          // パレットが開いているときは、最初のタップは閉じるだけ（誤って点を描かない）。
          var panelEl = document.getElementById('okToolPanel');
          if (panelEl && panelEl.style.display !== 'none') {
            setToolPanelVisible(false);
            return;
          }
          setToolPanelVisible(false);
          // 最初のタッチ操作で全画面へ（タブレット等のタッチ時のみ・ユーザー操作中に限る）。
          // 一度試したら以後は自動では出さない（ユーザーが自分で解除した場合を尊重）。
          if (!ui.fsAutoTried && ev.pointerType === 'touch') {
            ui.fsAutoTried = true;
            try {
              if (!okStandalone() && okFsAvailable() && !okIsFullscreen()) okEnterFullscreen();
            } catch (eFs) {
              // ignore
            }
          }
          last = posFromEvent(ev);
          movePenCursor(ev);
          pushHistory(); // このひとふで／スタンプ1個ぶんを「もどす」対象にする
          // スタンプ選択中はタップ位置に1個押す（フリーハンドはしない）。
          if (ui.stamp && !ui.eraser) {
            ui.everDrew = true;
            placeStamp(last);
            return;
          }
          try {
            cv.setPointerCapture(ev.pointerId);
          } catch (eCap) {
            // ignore
          }
          drawing = true;
          ui.everDrew = true;
          strokeSeg(last, { x: last.x + 0.01, y: last.y + 0.01 });
        });
        cv.addEventListener('pointermove', function (ev) {
          if (!drawing) {
            // マウスは押していなくても太さが分かるように枠を追従させる。
            if (ev.pointerType === 'mouse') movePenCursor(ev);
            return;
          }
          if (ev.preventDefault) ev.preventDefault();
          var p = posFromEvent(ev);
          strokeSeg(last, p);
          last = p;
          movePenCursor(ev);
        });
        var endStroke = function () {
          drawing = false;
          last = null;
          hidePenCursor();
        };
        // 描いている最中はキャンバス外に出ても枠を消さない（pointerCapture中の
        // 境界イベントでちらつくため）。指/マウスを離したときだけ消す。
        var leaveCanvas = function () {
          if (!drawing) hidePenCursor();
        };
        cv.addEventListener('pointerup', endStroke);
        cv.addEventListener('pointercancel', endStroke);
        cv.addEventListener('pointerleave', leaveCanvas);
        cv.addEventListener('pointerout', leaveCanvas);
      }

      setupOekakiGlobalHandlers();

      var paletteBtn = document.getElementById('okPaletteBtn');
      if (paletteBtn && !paletteBtn.__ok_bound) {
        paletteBtn.__ok_bound = true;
        paletteBtn.addEventListener('click', function () {
          var p = document.getElementById('okToolPanel');
          if (!p) return;
          setToolPanelVisible(p.style.display === 'none');
        });
      }

      var undoBtn = document.getElementById('okUndo');
      if (undoBtn && !undoBtn.__ok_bound) {
        undoBtn.__ok_bound = true;
        undoBtn.addEventListener('click', function () {
          setToolPanelVisible(false);
          doUndo();
        });
      }

      var redoBtn = document.getElementById('okRedo');
      if (redoBtn && !redoBtn.__ok_bound) {
        redoBtn.__ok_bound = true;
        redoBtn.addEventListener('click', function () {
          setToolPanelVisible(false);
          doRedo();
        });
      }
      updateHistoryButtons();

      var fsBtn = document.getElementById('okFullscreen');
      if (fsBtn && !fsBtn.__ok_bound) {
        fsBtn.__ok_bound = true;
        fsBtn.addEventListener('click', function () {
          okEnterFullscreen();
        });
      }
      updateFullscreenBtn();

      var colorBtns = document.querySelectorAll('.okColorBtn');
      for (var i2 = 0; i2 < colorBtns.length; i2++) {
        var btn = colorBtns[i2];
        if (!btn || btn.__ok_bound) continue;
        btn.__ok_bound = true;
        btn.addEventListener('click', function (ev) {
          var t = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!t) return;
          ui.color = String(t.getAttribute('data-c') || OEKAKI_COLORS[0]);
          ui.eraser = false;
          ui.stamp = ''; // 色を選んだらペンに戻す
          updateToolSelection();
          setToolPanelVisible(false);
        });
      }

      var eraserBtn = document.getElementById('okEraser');
      if (eraserBtn && !eraserBtn.__ok_bound) {
        eraserBtn.__ok_bound = true;
        eraserBtn.addEventListener('click', function () {
          ui.eraser = !ui.eraser;
          ui.stamp = ''; // 消しゴムはスタンプ解除
          updateToolSelection();
          setToolPanelVisible(false);
        });
      }

      var stampBtns = document.querySelectorAll('.okStampBtn');
      for (var i3 = 0; i3 < stampBtns.length; i3++) {
        var sbtn = stampBtns[i3];
        if (!sbtn || sbtn.__ok_bound) continue;
        sbtn.__ok_bound = true;
        sbtn.addEventListener('click', function (ev) {
          var t = ev && ev.currentTarget ? ev.currentTarget : null;
          if (!t) return;
          var sv = String(t.getAttribute('data-s') || '');
          // 同じスタンプを再タップで解除（ペンに戻す）。
          ui.stamp = ui.stamp === sv ? '' : sv;
          ui.eraser = false;
          updateToolSelection();
          setToolPanelVisible(false);
        });
      }

      var penEl = document.getElementById('okPen');
      if (penEl && !penEl.__ok_bound) {
        penEl.__ok_bound = true;
        penEl.addEventListener('input', function () {
          ui.penW = clamp(parseIntSafe(penEl.value, 6), 2, 24);
          updatePenPreview();
        });
      }
      updatePenPreview();

      var clearBtn = document.getElementById('okClearAll');
      if (clearBtn && !clearBtn.__ok_bound) {
        clearBtn.__ok_bound = true;
        clearBtn.addEventListener('click', function () {
          setToolPanelVisible(false);
          okShowConfirm('ぜんぶ けしますか？', 'けす', function () {
            try {
              var cv2 = document.getElementById('okCanvas');
              var ctx2 = cv2 ? cv2.getContext('2d') : null;
              if (ctx2) {
                pushHistory(); // まちがえて消しても「もどす」で戻せるように
                ctx2.fillStyle = '#ffffff';
                ctx2.fillRect(0, 0, cv2.width, cv2.height);
                ui.artScale = 1; // まっさらに戻したので回転時の拡縮も初期化
              }
            } catch (eClr) {
              // ignore
            }
          });
        });
      }

      var doneBtn = document.getElementById('okDone');
      if (doneBtn && !doneBtn.__ok_bound) {
        doneBtn.__ok_bound = true;
        doneBtn.addEventListener('click', function () {
          setToolPanelVisible(false);
          okShowConfirm('このえで ていしゅつする？', 'ていしゅつ', function () {
            if (options.onDone) options.onDone();
          });
        });
      }
    }
    // 提出用の書き出し。端末ごとのキャンバス縦横比を保ったまま長辺480に縮小する。
    // 取得できないときは空文字を返す（呼び出し側で提出を中止する）。
    function captureImage() {
      var cv = document.getElementById('okCanvas');
      if (!cv) return '';
      try {
        var out = document.createElement('canvas');
        var sc = 480 / Math.max(cv.width, cv.height);
        if (sc > 1) sc = 1;
        out.width = Math.max(1, Math.round(cv.width * sc));
        out.height = Math.max(1, Math.round(cv.height * sc));
        var octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(cv, 0, 0, out.width, out.height);
        return out.toDataURL('image/jpeg', 0.7);
      } catch (eCap) {
        return '';
      }
    }

    return {
      setup: setupCanvasAndTools,
      capture: captureImage,
      showConfirm: okShowConfirm,
      refit: scheduleOkRefit,
      teardown: function () {
        if (ui.teardownGlobal) ui.teardownGlobal();
      }
    };
  }

  // 描画エンジンが読み書きする状態の初期値。extra で画面固有の項目を足せる。
  function makeOekakiDrawUi(extra) {
    return assign(
      {
        color: OEKAKI_COLORS[0],
        penW: 6,
        eraser: false,
        stamp: '',
        stamps: null,
        stampsKey: '',
        everDrew: false,
        renderKey: '',
        timerId: null,
        submitInFlight: false,
        globalHandlersBound: false,
        teardownGlobal: null,
        resizeTimer: null,
        refitTimers: null,
        resizeObs: null,
        undoStack: null,
        redoStack: null,
        fitKey: '',
        artScale: 1,
        fsAutoTried: false
      },
      extra || {}
    );
  }


  function routeOekakiPlayer(roomId, isHost) {
    var unsub = null;
    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    var isTableGmDevice = false;
    try {
      var qGm0 = parseQuery();
      isTableGmDevice = !!(qGm0 && String(qGm0.gmdev || '') === '1');
    } catch (eGm0) {
      isTableGmDevice = false;
    }

    var playerId = '';
    try {
      var q1 = parseQuery();
      playerId = q1 && q1.player ? String(q1.player) : '';
    } catch (eP) {
      playerId = '';
    }
    if (!playerId && !isTableGmDevice && lobbyId) {
      try {
        playerId = String(getOrCreateLobbyMemberId(lobbyId) || '');
      } catch (eMid) {
        playerId = '';
      }
    }
    // テーブルGM端末は描かない（進行状況の表示のみ）。
    if (isTableGmDevice) playerId = '';

    try {
      if (document.body && document.body.classList) document.body.classList.add('ok-player-screen');
    } catch (eCls) {
      // ignore
    }

    var lastRoom = null;
    var ui = makeOekakiDrawUi({
      judgeInFlight: false,
      judgeToken: '',
      lobbyReturnWatching: false,
      lobbyUnsub: null,
      autoJoinInFlight: false
    });

    // キャンバス・ツール一式は共通の描画エンジンに任せる。
    var draw = createOekakiDrawEngine(ui, {
      onDone: function () {
        submitNow(false);
      }
    });

    function redirectToLobby() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = isHost ? 'lobby_host' : 'lobby_player';
      try {
        var qx = parseQuery();
        if (qx && String(qx.gmdev || '') === '1') q.gmdev = '1';
      } catch (e) {
        // ignore
      }
      setQuery(q);
      route();
    }

    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (ui.lobbyReturnWatching) return;
      ui.lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'oekaki' || rid !== String(roomId || '')) {
              try {
                if (ui.lobbyUnsub) ui.lobbyUnsub();
              } catch (e) {
                // ignore
              }
              ui.lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          ui.lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    function currentRoundIndex(room) {
      return parseIntSafe(room && room.round && room.round.index, 1);
    }

    function isMeSubmitted(room) {
      if (!playerId) return false;
      var p = room && room.players ? room.players[playerId] : null;
      return !!(p && p.image && parseIntSafe(p.round, 0) === currentRoundIndex(room));
    }

    function computeRenderKey(room) {
      var c = oekakiCountSubmitted(room);
      var ri = currentRoundIndex(room);
      var phase = String((room && room.phase) || '');
      if (phase === 'drawing') {
        var canDraw = !!(playerId && !isTableGmDevice && room.players && room.players[playerId]);
        if (canDraw && !isMeSubmitted(room)) {
          // キャンバス表示中は再描画しない（描きかけの絵が消えるため）。提出数はupdateDynamicで更新。
          return 'draw|' + ri;
        }
        return 'wait|' + ri + '|' + c.submitted + '|' + c.total + '|' + (isMeSubmitted(room) ? 1 : 0);
      }
      if (phase === 'judging') return 'judge|' + ri;
      if (phase === 'result') {
        var r = (room && room.result) || {};
        return 'result|' + ri + '|' + String(r.judgedAt || 0) + '|' + (r.error ? 1 : 0);
      }
      return 'x|' + phase + '|' + ri;
    }

    function updateDynamic(room) {
      var c = oekakiCountSubmitted(room);
      var st = document.getElementById('okStatus');
      if (st) st.textContent = 'ていしゅつ ' + String(c.submitted) + '/' + String(c.total);
      var stc = document.getElementById('okStatusCount');
      if (stc) stc.textContent = String(c.submitted) + '/' + String(c.total);
    }

    // ゲーム開始時の3カウントダウン（サーバー時刻基準なので全端末で同期する）。
    // ラウンド開始時刻 = endsAt - drawSeconds*1000。それより前なら 3,2,1 を最前面に表示。
    function updateCountdown(room) {
      var el = document.getElementById('okCountdown');
      if (!el) return;
      var endsAt = parseIntSafe(room && room.round && room.round.endsAt, 0);
      var totalSec = clamp(parseIntSafe(room && room.settings && room.settings.drawSeconds, 90), 30, 600);
      var startAt = endsAt - totalSec * 1000;
      var diff = startAt - serverNowMs();
      var span = document.getElementById('okCountdownNum');
      if (!span) return;

      var S = OEKAKI_COUNT_STEP_MS;

      // mode: 'num'（大きい数字） / 'ready'（よーい…） / 'go'（かいて！・タッチ通過）
      function setNum(text, mode) {
        el.classList.toggle('ok-count-go', mode === 'go');
        el.classList.toggle('ok-count-ready', mode === 'ready');
        if (span.textContent === text) return;
        span.textContent = text;
        // 数字が変わるたびにポップアニメを再トリガー
        span.classList.remove('ok-count-pop');
        void span.offsetWidth;
        span.classList.add('ok-count-pop');
      }

      if (diff > 3 * S) {
        // 3の前に「よーい…」の間を置く（読み込み遅れをここで吸収し、3を確実に見せる）
        el.style.display = '';
        setNum('よーい…', 'ready');
      } else if (diff > 0) {
        el.style.display = '';
        setNum(String(Math.ceil(diff / S)), 'num');
      } else if (diff > -1000) {
        // スタートの瞬間: 「かいて！」を出す（タッチは通す）
        el.style.display = '';
        setNum('かいて！', 'go');
      } else {
        el.style.display = 'none';
      }
    }

    // タイマー表示更新: フルスクリーン描画中は円形リング、それ以外の画面ではテキスト。
    // 残り10秒からはキャンバス枠の赤点滅(ok-warn)も付ける。
    var OK_RING_CIRC = 113.097; // 2π×r(18)
    function updateTimerText(room) {
      var endsAt = parseIntSafe(room && room.round && room.round.endsAt, 0);
      var totalSec = clamp(parseIntSafe(room && room.settings && room.settings.drawSeconds, 90), 30, 600);
      var remainMs = Math.max(0, endsAt - serverNowMs());
      var remainSec = Math.max(0, Math.ceil(remainMs / 1000));

      var fg = document.getElementById('okRingFg');
      if (fg) {
        var frac = Math.max(0, Math.min(1, remainMs / (totalSec * 1000)));
        fg.style.strokeDashoffset = String(OK_RING_CIRC * (1 - frac));
      }

      var el = document.getElementById('okTimer');
      if (el) el.textContent = formatMMSS(remainSec);

      try {
        var fs = document.getElementById('okFs');
        if (fs) {
          if (remainSec <= 10 && remainSec > 0) fs.classList.add('ok-warn');
          else fs.classList.remove('ok-warn');
        }
      } catch (eWarn) {
        // ignore
      }
      return remainSec;
    }

    function submitNow(isAuto) {
      if (!playerId || isTableGmDevice) return;
      if (ui.submitInFlight) return;
      var room = lastRoom;
      if (!room || room.phase !== 'drawing') return;
      if (isMeSubmitted(room)) return;
      if (!(room.players && room.players[playerId])) return;
      if (isAuto && !ui.everDrew) return; // 何も描いていなければ自動提出しない（未提出扱い）
      var dataUrl = draw.capture();
      if (!dataUrl) return;
      ui.submitInFlight = true;
      oekakiSubmitImage(roomId, playerId, currentRoundIndex(room), dataUrl)
        .catch(function (e) {
          if (!isAuto) alert((e && e.message) || 'ていしゅつに しっぱいしました');
        })
        .finally(function () {
          ui.submitInFlight = false;
        });
    }

    function startJudging(fromPhase) {
      ui.judgeInFlight = true;
      ui.judgeToken = randomId(10);
      oekakiClaimJudging(roomId, ui.judgeToken, fromPhase)
        .then(function (won) {
          if (!won) return null;
          // クレーム後に最新スナップショットで判定（直前の提出を取りこぼさない）。
          return getValueOnce(oekakiRoomPath(roomId)).then(function (fresh) {
            if (!fresh || fresh.phase !== 'judging') return null;
            return oekakiRunJudge(roomId, fresh);
          });
        })
        .catch(function (e) {
          try {
            if (typeof console !== 'undefined' && console.warn) console.warn('oekaki judge failed', e);
          } catch (e2) {
            // ignore
          }
        })
        .finally(function () {
          ui.judgeInFlight = false;
        });
    }

    function maybeStartJudging(room) {
      if (!isHost) return;
      if (!room || room.phase !== 'drawing') return;
      if (ui.judgeInFlight) return;
      var c = oekakiCountSubmitted(room);
      var allSubmitted = c.total > 0 && c.submitted >= c.total;
      var endsAt = parseIntSafe(room.round && room.round.endsAt, 0);
      var timeUp = endsAt > 0 && serverNowMs() > endsAt + OEKAKI_JUDGE_GRACE_MS;
      if (!allSubmitted && !timeUp) return;
      startJudging('drawing');
    }

    function maybeRecoverJudging(room) {
      // 判定担当端末が落ちてjudgingのまま止まった場合の再クレーム。
      if (!isHost) return;
      if (!room || room.phase !== 'judging') return;
      if (ui.judgeInFlight) return;
      var t0 = parseIntSafe(room.judgingAt, 0);
      if (!t0 || serverNowMs() - t0 < 60000) return;
      startJudging('judging');
    }

    function ensureTimer() {
      if (ui.timerId) return;
      ui.timerId = setInterval(function () {
        var q2 = null;
        try {
          q2 = parseQuery();
        } catch (e) {
          q2 = null;
        }
        if (!q2 || String(q2.screen || '') !== 'oekaki_player' || String(q2.room || '') !== String(roomId || '')) {
          clearInterval(ui.timerId);
          ui.timerId = null;
          if (ui.teardownGlobal) ui.teardownGlobal();
          return;
        }
        var room = lastRoom;
        if (!room) return;
        if (room.phase === 'drawing') {
          var remainSec = updateTimerText(room);
          try {
            updateCountdown(room);
          } catch (eCd) {
            // ignore
          }
          if (remainSec <= 0) submitNow(true);
          maybeStartJudging(room);
        } else if (room.phase === 'judging') {
          maybeRecoverJudging(room);
        }
      }, 250);
    }


    function bindResultButtons(room) {
      var replayBtn = document.getElementById('okReplay');
      if (replayBtn && !replayBtn.__ok_bound) {
        replayBtn.__ok_bound = true;
        replayBtn.addEventListener('click', function () {
          replayBtn.disabled = true;
          var cur = lastRoom || room;
          var prevTopic = String((cur && cur.round && cur.round.topic) || '');
          var age = cur && cur.settings && cur.settings.topicAge ? String(cur.settings.topicAge) : 'school';
          oekakiReplay(roomId, oekakiPickTopic(age, prevTopic))
            .catch(function (e) {
              setInlineError('okHostError', (e && e.message) || '失敗しました');
            })
            .finally(function () {
              replayBtn.disabled = false;
            });
        });
      }

      var replayCustomBtn = document.getElementById('okReplayCustom');
      if (replayCustomBtn && !replayCustomBtn.__ok_bound) {
        replayCustomBtn.__ok_bound = true;
        replayCustomBtn.addEventListener('click', function () {
          var inp = document.getElementById('okReplayTopic');
          var topic = String((inp && inp.value) || '').trim();
          if (!topic) {
            setInlineError('okHostError', '次のお題を入力してください');
            return;
          }
          replayCustomBtn.disabled = true;
          oekakiReplay(roomId, topic)
            .catch(function (e) {
              setInlineError('okHostError', (e && e.message) || '失敗しました');
            })
            .finally(function () {
              replayCustomBtn.disabled = false;
            });
        });
      }

      var rejudgeBtn = document.getElementById('okRejudge');
      if (rejudgeBtn && !rejudgeBtn.__ok_bound) {
        rejudgeBtn.__ok_bound = true;
        rejudgeBtn.addEventListener('click', function () {
          rejudgeBtn.disabled = true;
          startJudging('result');
        });
      }
    }

    function renderNow(room) {
      lastRoom = room;

      try {
        if (lobbyId) ensureLobbyReturnWatcher();
      } catch (eLW) {
        // ignore
      }

      var key = computeRenderKey(room);
      if (ui.renderKey !== key) {
        ui.renderKey = key;
        renderOekakiPlayer(viewEl, {
          room: room,
          roomId: roomId,
          playerId: playerId,
          isHost: isHost,
          isTableGmDevice: isTableGmDevice,
          ui: ui
        });
        draw.setup();
        bindResultButtons(room);
        if (room.phase === 'drawing') {
          updateTimerText(room);
          try {
            updateCountdown(room);
          } catch (eCd0) {
            // ignore
          }
        }
        if (room.phase === 'result') {
          try {
            animateOekakiScores();
          } catch (eAnim) {
            // ignore
          }
        }
      } else {
        updateDynamic(room);
      }
      ensureTimer();
    }

    firebaseReady()
      .then(function () {
        return subscribeOekakiRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          // 途中参加: ルーム未登録のプレイヤーは自動で登録する。
          // 描画中なら残り時間で描け、判定中/結果なら次のラウンドから参加できる。
          var playersMap = room.players || {};
          if (playerId && !isTableGmDevice && !playersMap[playerId] && !ui.autoJoinInFlight) {
            ui.autoJoinInFlight = true;
            var namePromise = lobbyId
              ? getValueOnce(lobbyPath(lobbyId) + '/members/' + playerId + '/name').catch(function () {
                  return '';
                })
              : Promise.resolve('');
            namePromise
              .then(function (nm) {
                var nm2 = String(nm || '').trim() || loadPersistedName() || 'ゲスト';
                return joinPlayerInOekakiRoom(roomId, playerId, nm2, false);
              })
              .catch(function () {
                // 失敗時は次のスナップショットで再試行する。
                ui.autoJoinInFlight = false;
              });
          }

          renderNow(room);
          try {
            maybeStartJudging(room);
          } catch (eJ) {
            // ignore
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      if (ui.lobbyUnsub) ui.lobbyUnsub();
      if (ui.timerId) {
        clearInterval(ui.timerId);
        ui.timerId = null;
      }
      if (ui.teardownGlobal) ui.teardownGlobal();
    });
  }

  // ==================== oekaki battle relay (screens) ====================
  // 画面は2つだけ:
  //   oekaki_relay_create … ホストが設定して部屋をつくる
  //   oekaki_relay        … 対戦本体（自分のスロットと部屋の状態から表示を切り替える）
  // 部屋のURLは最後まで変わらないので、共有は「同じリンクを送り返す」だけでよい。

  var OKR_SETTINGS_LS = 'bbg_okrelay_settings_v1';

  function okrLoadSettings() {
    var raw = '';
    try {
      raw = String(localStorage.getItem(OKR_SETTINGS_LS) || '');
    } catch (e) {
      raw = '';
    }
    var o = null;
    try {
      o = raw ? JSON.parse(raw) : null;
    } catch (e2) {
      o = null;
    }
    return normalizeOekakiLobbySettings(o);
  }

  function okrSaveSettings(settings) {
    try {
      localStorage.setItem(OKR_SETTINGS_LS, JSON.stringify(normalizeOekakiLobbySettings(settings)));
    } catch (e) {
      // ignore
    }
  }

  function okrShareUrl(roomId) {
    var q = {};
    var v = getCacheBusterParam();
    if (v) q.v = v;
    q.screen = 'oekaki_relay';
    q.room = String(roomId || '');
    return baseUrl() + '?' + buildQuery(q);
  }

  // LINE等へ渡す。Web Share API があれば共有シート、無ければクリップボードへコピー。
  // ※ 必ずクリック等のユーザー操作の中から呼ぶこと（navigator.share の制約）。
  function okrShareLink(text, url, statusElId) {
    var body = String(text || '');
    var link = String(url || '');

    function setStatus(msg) {
      var el = statusElId ? document.getElementById(statusElId) : null;
      if (el) el.textContent = String(msg || '');
    }

    function fallback() {
      return copyTextToClipboard(body ? body + '\n' + link : link).then(function (ok) {
        setStatus(ok ? '✅ コピーしました。LINEなどに貼り付けて送ってください。' : 'コピーできませんでした。下のリンクを長押しでコピーしてください。');
        return ok;
      });
    }

    try {
      if (navigator && navigator.share) {
        return navigator
          .share({ title: 'おえかきバトル（リレー）', text: body, url: link })
          .then(function () {
            setStatus('');
            return true;
          })
          .catch(function (e) {
            // 共有シートを閉じただけならメッセージを出さない。
            if (e && e.name === 'AbortError') return false;
            return fallback();
          });
      }
    } catch (e) {
      // ignore
    }
    return fallback();
  }

  function okrPickTopicFor(settings, excludeTopic) {
    var s = normalizeOekakiLobbySettings(settings);
    if (s.topicMode === 'custom') return String(s.customTopic || '').trim();
    return oekakiPickTopic(s.topicAge, excludeTopic || '');
  }

  // 設定フォーム（部屋作成と再戦申し込みで共用）。
  // お題の年齢／自由記入は両方出しておき、表示の切り替えだけJSで行う（再描画で入力を失わないため）。
  function okrSettingsFieldsHtml(settings) {
    var s = normalizeOekakiLobbySettings(settings);
    var timeVals = [30, 60, 90, 120, 180, 300, 420, 600];
    var timeOptions = '';
    for (var i = 0; i < timeVals.length; i++) {
      var tv = timeVals[i];
      timeOptions +=
        '<option value="' + tv + '"' + (s.drawSeconds === tv ? ' selected' : '') + '>' + escapeHtml(oekakiFormatSeconds(tv)) + '</option>';
    }
    return (
      '<div class="field">' +
      '<label>制限時間</label>' +
      '<select id="okrDrawSecs">' +
      timeOptions +
      '</select>' +
      '</div>' +
      '<div class="field">' +
      '<label>お題</label>' +
      '<select id="okrTopicMode">' +
      '<option value="random"' + (s.topicMode === 'random' ? ' selected' : '') + '>ランダム</option>' +
      '<option value="custom"' + (s.topicMode === 'custom' ? ' selected' : '') + '>自由記入</option>' +
      '</select>' +
      '</div>' +
      '<div class="field" id="okrTopicAgeField"' + (s.topicMode === 'custom' ? ' style="display:none"' : '') + '>' +
      '<label>お題の対象年齢</label>' +
      '<select id="okrTopicAge">' +
      '<option value="kids"' + (s.topicAge === 'kids' ? ' selected' : '') + '>こども（〜6さい）</option>' +
      '<option value="school"' + (s.topicAge === 'school' ? ' selected' : '') + '>小学生</option>' +
      '<option value="adult"' + (s.topicAge === 'adult' ? ' selected' : '') + '>おとな</option>' +
      '</select>' +
      '</div>' +
      '<div class="field" id="okrCustomTopicField"' + (s.topicMode === 'custom' ? '' : ' style="display:none"') + '>' +
      '<label>お題（自由記入・2人とも同じお題を描きます）</label>' +
      '<input id="okrCustomTopic" placeholder="例: 二日酔い" value="' +
      escapeHtml(s.customTopic) +
      '" />' +
      '</div>'
    );
  }

  function okrSyncTopicFields() {
    var modeEl = document.getElementById('okrTopicMode');
    var mode = modeEl ? String(modeEl.value || 'random') : 'random';
    var ageF = document.getElementById('okrTopicAgeField');
    var cusF = document.getElementById('okrCustomTopicField');
    if (ageF) ageF.style.display = mode === 'custom' ? 'none' : '';
    if (cusF) cusF.style.display = mode === 'custom' ? '' : 'none';
  }

  function okrBindSettingsForm() {
    var modeEl = document.getElementById('okrTopicMode');
    if (modeEl && !modeEl.__okr_bound) {
      modeEl.__okr_bound = true;
      modeEl.addEventListener('change', okrSyncTopicFields);
    }
    okrSyncTopicFields();
  }

  function okrReadSettingsForm(fallback) {
    var base = normalizeOekakiLobbySettings(fallback);
    var secEl = document.getElementById('okrDrawSecs');
    var modeEl = document.getElementById('okrTopicMode');
    var ageEl = document.getElementById('okrTopicAge');
    var cusEl = document.getElementById('okrCustomTopic');
    return normalizeOekakiLobbySettings({
      drawSeconds: secEl ? parseIntSafe(secEl.value, base.drawSeconds) : base.drawSeconds,
      topicMode: modeEl ? String(modeEl.value || base.topicMode) : base.topicMode,
      topicAge: ageEl ? String(ageEl.value || base.topicAge) : base.topicAge,
      customTopic: cusEl ? String(cusEl.value || '') : base.customTopic
    });
  }

  // -------------------- relay: 部屋づくり画面 --------------------

  function renderOekakiRelayCreate(viewEl) {
    var s = okrLoadSettings();
    var keyNote = loadGeminiApiKey()
      ? ''
      : '<div class="muted">※ Gemini APIキーが未設定です。AI採点を使うには<a href="?screen=setup">せってい</a>で設定してください（未設定でも遊べますが、点数と煽りコメントは出ません）。</div>';

    render(
      viewEl,
      '<div class="stack">' +
        '<div class="okr-hero">' +
        '<div class="okr-hero-emoji">🎨⚔️</div>' +
        '<div class="okr-hero-title">おえかきバトル（リレー）</div>' +
        '<div class="okr-hero-sub">2人で同じお題を描いて、AIに採点させる投稿型バトル</div>' +
        '</div>' +
        '<div class="card okr-flow">' +
        '<div class="okr-flow-step"><span class="okr-flow-no">1</span>あなたが先に描く</div>' +
        '<div class="okr-flow-step"><span class="okr-flow-no">2</span>LINEなどでリンクを相手に渡す</div>' +
        '<div class="okr-flow-step"><span class="okr-flow-no">3</span>相手が描くと、その場でAIが採点</div>' +
        '<div class="okr-flow-step"><span class="okr-flow-no">4</span>相手から結果のリンクが返ってくる</div>' +
        '</div>' +
        '<div class="card"><div class="stack">' +
        '<div class="field"><label>あなたの名前</label><input id="okrHostName" placeholder="例: たろう" value="' +
        escapeHtml(loadPersistedName() || '') +
        '" /></div>' +
        okrSettingsFieldsHtml(s) +
        keyNote +
        '<button id="okrCreateBtn" class="primary bbg-start-btn">この設定ではじめる</button>' +
        '</div></div>' +
        '<div id="okrCreateError" class="form-error" role="alert"></div>' +
        '<div class="okr-warn card">😈 このモードのAIコメントは「勝った側をベタ褒め／負けた側をボロクソにけなす」設定です。けなされて笑える仲の相手とだけ遊んでください。</div>' +
        '<div class="center"><a class="btn ghost" href="./">ホームへ</a></div>' +
        '</div>'
    );
  }

  function routeOekakiRelayCreate() {
    renderOekakiRelayCreate(viewEl);
    okrBindSettingsForm();
    clearInlineError('okrCreateError');

    var btn = document.getElementById('okrCreateBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      clearInlineError('okrCreateError');
      var nameEl = document.getElementById('okrHostName');
      var name = String((nameEl && nameEl.value) || '').trim();
      if (!name) {
        setInlineError('okrCreateError', '名前を入力してください。');
        return;
      }
      var settings = okrReadSettingsForm(okrLoadSettings());
      var topic = okrPickTopicFor(settings, '');
      if (!topic) {
        setInlineError('okrCreateError', 'お題を入力してください。');
        return;
      }

      btn.disabled = true;
      var roomId = makeRoomId();
      firebaseReady()
        .then(function () {
          return createOekakiRelayRoom(roomId, settings, topic, name);
        })
        .then(function () {
          savePersistedName(name);
          okrSaveSettings(settings);
          okrSaveSlot(roomId, 'a');
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.screen = 'oekaki_relay';
          q.room = roomId;
          setQuery(q);
          route();
        })
        .catch(function (e) {
          btn.disabled = false;
          setInlineError('okrCreateError', (e && e.message) || '作成に失敗しました');
        });
    });
  }

  // -------------------- relay: 対戦画面 --------------------

  function okrEntriesOf(result) {
    return result && Array.isArray(result.entries) ? result.entries : [];
  }

  // 結果カード。点数がある2人ぶんなら、上位を勝者・下位を敗者として色分けする。
  function okrResultCardsHtml(room, result, mySlot, animate) {
    var entries = okrEntriesOf(result);
    var roundIndex = parseIntSafe(result && result.round, okrRoundIndex(room));
    var decided = entries.length === 2 && entries[0] && entries[1] && entries[0].score != null && entries[0].score !== entries[1].score;

    var html = '';
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i] || {};
      var slot = String(en.slot || '');
      var p = okrPlayer(room, slot) || {};
      // 前回結果（prevResult）は entries 側に絵を持っている。現ラウンドの結果は players から引く。
      var img = en.image ? String(en.image) : p.image && parseIntSafe(p.round, 0) === roundIndex ? String(p.image) : '';
      var hasScore = en.score != null;
      var isWin = decided && i === 0;
      var isLose = decided && i === entries.length - 1;
      var badge = isWin ? '<span class="okr-badge okr-badge-win">👑 WIN</span>' : isLose ? '<span class="okr-badge okr-badge-lose">💀 LOSE</span>' : '';

      html +=
        '<div class="ok-result-card okr-card' +
        (isWin ? ' okr-win' : '') +
        (isLose ? ' okr-lose' : '') +
        (animate ? ' ok-in' : '') +
        '" style="animation-delay:' +
        String(Math.round(i * 220) / 1000) +
        's">' +
        '<div class="ok-result-head">' +
        badge +
        '<b class="ok-result-name">' +
        escapeHtml(String(en.name || okrName(room, slot))) +
        (slot && slot === mySlot ? '<span class="okr-you">あなた</span>' : '') +
        '</b>' +
        (hasScore
          ? '<span class="ok-score"><span class="okScoreNum" data-score="' +
            String(clamp(parseIntSafe(en.score, 0), 0, 100)) +
            '">0</span>点</span>'
          : '') +
        '</div>' +
        (img ? '<img class="ok-result-img" src="' + escapeHtml(img) + '" alt="" />' : '<div class="muted">（画像なし）</div>') +
        (en.comment ? '<div class="okr-comment' + (isLose ? ' okr-comment-lose' : '') + '">' + escapeHtml(String(en.comment)) + '</div>' : '') +
        '</div>';
    }
    return '<div class="ok-result-cards">' + html + '</div>';
  }

  function okrVerdictHtml(result) {
    var v = String((result && result.verdict) || '').trim();
    if (!v) return '';
    return '<div class="okr-verdict ok-in">📣 ' + escapeHtml(v) + '</div>';
  }

  function okrShareBoxHtml(roomId, buttonLabel, note) {
    var url = okrShareUrl(roomId);
    return (
      '<button id="okrShareBtn" class="primary bbg-start-btn">🔗 ' + escapeHtml(String(buttonLabel || 'リンクを送る')) + '</button>' +
      '<div class="muted center" id="okrShareStatus"></div>' +
      (note ? '<div class="muted center">' + escapeHtml(String(note)) + '</div>' : '') +
      '<div class="field" style="margin:0"><label>共有リンク（コピーして貼り付けてもOK）</label>' +
      '<div class="code" id="okrShareUrlText">' +
      escapeHtml(url) +
      '</div></div>'
    );
  }

  function okrRematchSectionHtml(room, mySlot) {
    var s = normalizeOekakiLobbySettings(room && room.settings);
    var firstDrawerNote =
      mySlot === 'a'
        ? '申し込むと、あなたが先に描いて相手にリンクを渡します。'
        : '申し込むと、' + okrName(room, 'a') + ' さんが先に描きます。設定を決めるのはあなたです。';
    return (
      '<hr />' +
      '<div class="bbg-sec">🔥 再戦を申し込む</div>' +
      '<div class="muted">' +
      escapeHtml(firstDrawerNote) +
      '</div>' +
      okrSettingsFieldsHtml(s) +
      '<button id="okrRematchBtn" class="primary">この設定で再戦を申し込む</button>'
    );
  }

  function okrJudgingHtml(room) {
    var roundIndex = okrRoundIndex(room);
    var slots = ['a', 'b'];
    var gallery = '';
    for (var i = 0; i < slots.length; i++) {
      var p = okrPlayer(room, slots[i]);
      if (!p || !p.image || parseIntSafe(p.round, 0) !== roundIndex) continue;
      gallery +=
        '<div class="ok-judge-item ok-in" style="animation-delay:' +
        String(Math.round(i * 120) / 1000) +
        's"><img class="ok-judge-img" style="animation-delay:' +
        String(Math.round(i * 300) / 1000) +
        's" src="' +
        escapeHtml(String(p.image)) +
        '" alt="" /><div class="ok-judge-name">' +
        escapeHtml(okrName(room, slots[i])) +
        '</div></div>';
    }
    return (
      '<div class="stack center">' +
      '<div class="ok-judge-icon">✏️</div>' +
      '<div class="big ok-pop">AI採点中<span class="ok-dots"><span>.</span><span>.</span><span>.</span></span></div>' +
      '<div class="muted">どっちが上か、AIが決めています…</div>' +
      (gallery ? '<div class="ok-judge-grid">' + gallery + '</div>' : '') +
      '</div>'
    );
  }

  function renderOekakiRelay(viewEl, opts) {
    var room = opts.room;
    var roomId = opts.roomId;
    var slot = String(opts.slot || '');
    var view = String(opts.view || '');
    var ui = opts.ui;

    var roundIndex = okrRoundIndex(room);
    var settings = normalizeOekakiLobbySettings(room && room.settings);
    var other = okrOtherSlot(slot);
    var otherName = okrNameOrGeneric(room, other);
    var roundLabel = roundIndex > 1 ? '第' + String(roundIndex) + '戦' : '第1戦';

    if (view === 'join') {
      render(
        viewEl,
        '<div class="stack">' +
          '<div class="okr-hero">' +
          '<div class="okr-hero-emoji">⚔️</div>' +
          '<div class="okr-hero-title">おえかきバトル</div>' +
          '<div class="okr-hero-sub">' +
          escapeHtml(okrName(room, 'a')) +
          ' さんからの挑戦状</div>' +
          '</div>' +
          '<div class="card"><div class="stack">' +
          '<div class="kv"><span class="muted">制限時間</span><b>' +
          escapeHtml(oekakiFormatSeconds(settings.drawSeconds)) +
          '</b></div>' +
          '<div class="kv"><span class="muted">お題</span><b>スタート後に表示</b></div>' +
          '<div class="field"><label>あなたの名前</label><input id="okrJoinName" placeholder="例: はなこ" value="' +
          escapeHtml(loadPersistedName() || '') +
          '" /></div>' +
          '<button id="okrJoinBtn" class="primary bbg-start-btn">挑戦を受ける</button>' +
          '</div></div>' +
          '<div id="okrJoinError" class="form-error" role="alert"></div>' +
          '<div class="okr-warn card">😈 このバトルのAIコメントは「勝った側をベタ褒め／負けた側をボロクソにけなす」設定です。</div>' +
          // 別ブラウザで開き直すと端末の記録が無くなるため、席を取り戻す導線を用意しておく。
          '<div class="center"><button id="okrClaimA" class="ghost">わたしは ' +
          escapeHtml(okrName(room, 'a')) +
          '（ホスト）です</button></div>' +
          '</div>'
      );
      return;
    }

    if (view === 'viewer') {
      var viewerBody =
        room.phase === 'result'
          ? okrVerdictHtml(room.result) + okrResultCardsHtml(room, room.result, '', false)
          : '<div class="muted center">対戦中です。結果が出るまでお待ちください。</div>';
      render(
        viewEl,
        '<div class="stack">' +
          '<div class="big center">おえかきバトル（リレー）</div>' +
          '<div class="card okr-warn">この勝負はすでに2人でうまっています。この端末は観戦モードです。</div>' +
          viewerBody +
          '<hr />' +
          // 別のブラウザ（LINE内ブラウザ↔Safari など）で開き直すと席の記録が消える。
          // 本人が続きを遊べるように、どちらの席かを選び直せるようにしておく。
          '<div class="muted center">この端末が対戦者本人のものなら、席を選び直してください。</div>' +
          '<div class="row">' +
          '<button id="okrClaimA" class="ghost">' +
          escapeHtml(okrName(room, 'a')) +
          ' として続ける</button>' +
          '<button id="okrClaimB" class="ghost">' +
          escapeHtml(okrName(room, 'b')) +
          ' として続ける</button>' +
          '</div>' +
          '<div class="center"><a class="btn ghost" href="?screen=oekaki_relay_create">自分でバトルを始める</a></div>' +
          '</div>'
      );
      return;
    }

    if (view === 'draw') {
      render(
        viewEl,
        oekakiDrawFsHtml({
          topic: String((room.round && room.round.topic) || ''),
          ui: ui,
          roundIndex: roundIndex,
          statusText: roundLabel + ' / ' + okrName(room, slot)
        })
      );
      return;
    }

    if (view === 'ready' || view === 'timeup') {
      // 自分が設定した自由記入お題は本人には見えているので隠さない。
      var knowsTopic = settings.topicMode === 'custom' && String((room.settings && room.settings.setBy) || 'a') === slot;
      var prev = room.prevResult;
      var prevHtml = '';
      if (prev && !okrHasSubmitted(room, slot) && roundIndex > 1) {
        prevHtml =
          '<div class="bbg-sec">前回（第' +
          String(parseIntSafe(prev.round, roundIndex - 1)) +
          '戦）の結果</div>' +
          (prev.error ? '<div class="card ok-error">' + escapeHtml(String(prev.error)) + '</div>' : '') +
          okrVerdictHtml(prev) +
          okrResultCardsHtml(room, prev, slot, false) +
          '<hr />';
      }

      var rematchNote = '';
      if (roundIndex > 1) {
        var by = String(room.rematchBy || 'b');
        rematchNote =
          '<div class="card okr-callout">🔥 ' +
          escapeHtml(by === slot ? 'あなたが申し込んだ再戦です。' : okrName(room, okrOtherSlot(slot)) + ' さんから再戦を申し込まれています！') +
          '</div>';
      }

      var timeupHtml =
        view === 'timeup'
          ? '<div class="card ok-error">前回の持ち時間が終わってしまいました（描き終える前に画面を離れたようです）。もう一度はじめられます。</div>'
          : '';

      render(
        viewEl,
        '<div class="stack">' +
          prevHtml +
          rematchNote +
          '<div class="okr-hero">' +
          '<div class="okr-hero-emoji">✏️</div>' +
          '<div class="okr-hero-title">' +
          escapeHtml(roundLabel) +
          ' — あなたの番</div>' +
          '</div>' +
          timeupHtml +
          '<div class="card"><div class="stack">' +
          '<div class="kv"><span class="muted">制限時間</span><b>' +
          escapeHtml(oekakiFormatSeconds(settings.drawSeconds)) +
          '</b></div>' +
          '<div class="kv"><span class="muted">お題</span><b>' +
          (knowsTopic ? escapeHtml(String((room.round && room.round.topic) || '')) : 'スタート後に表示') +
          '</b></div>' +
          '<div class="muted">「はじめる」を押すと3カウントのあとタイマーが動きます。途中で画面を離れると時間だけが進むので注意！</div>' +
          '<button id="okrStartBtn" class="primary bbg-start-btn">' +
          (view === 'timeup' ? 'もう一度はじめる' : 'はじめる') +
          '</button>' +
          '</div></div>' +
          '<div id="okrError" class="form-error" role="alert"></div>' +
          '</div>'
      );
      return;
    }

    if (view === 'wait') {
      var mineSubmitted = okrHasSubmitted(room, slot);
      var myImg = '';
      var mine = okrPlayer(room, slot);
      if (mineSubmitted && mine && mine.image) {
        myImg = '<img class="ok-mythumb ok-pop" src="' + escapeHtml(String(mine.image)) + '" alt="あなたの絵" />';
      }

      if (mineSubmitted) {
        // 自分の番が終わった直後。相手にリンクを渡すのがここでの唯一の仕事。
        var seated = !!okrPlayer(room, other);
        render(
          viewEl,
          '<div class="stack center">' +
            '<div><span class="ok-stamp">かんせい！</span></div>' +
            myImg +
            '<div class="muted">' +
            (seated ? 'つぎは <b>' + escapeHtml(otherName) + '</b> さんの番です。リンクを渡してください。' : 'リンクを送って、対戦相手をよびましょう。') +
            '</div>' +
            okrShareBoxHtml(
              roomId,
              seated ? otherName + ' に挑戦状を送る' : 'リンクを送って対戦相手をよぶ',
              '相手が描き終わるとAIが採点し、結果のリンクが返ってきます。'
            ) +
            '<div class="center"><a class="btn ghost" href="./">ホームへ</a></div>' +
            '</div>'
        );
        return;
      }

      // 相手が先に描く番（再戦を申し込んだ直後など）。
      var prevR = room.prevResult;
      var prevBlock =
        prevR && roundIndex > 1
          ? '<div class="bbg-sec">前回（第' +
            String(parseIntSafe(prevR.round, roundIndex - 1)) +
            '戦）の結果</div>' +
            okrVerdictHtml(prevR) +
            okrResultCardsHtml(room, prevR, slot, false) +
            '<hr />'
          : '';
      var iAskedRematch = roundIndex > 1 && String(room.rematchBy || '') === slot;

      render(
        viewEl,
        '<div class="stack">' +
          prevBlock +
          '<div class="center stack">' +
          '<div class="big">' +
          (iAskedRematch ? '🔥 再戦を申し込みました' : '⏳ 相手の番です') +
          '</div>' +
          '<div class="muted">' +
          escapeHtml(
            iAskedRematch
              ? otherName + ' さんが先に描きます。結果と再戦の申し込みをまとめてリンクで送ってください。'
              : otherName + ' さんが描き終わるのを待っています。'
          ) +
          '</div>' +
          (iAskedRematch
            ? okrShareBoxHtml(roomId, otherName + ' に結果と再戦を送る', '相手が描き終わったら、またこのリンクが返ってきます。')
            : '') +
          '<div class="center"><a class="btn ghost" href="./">ホームへ</a></div>' +
          '</div>' +
          '</div>'
      );
      return;
    }

    if (view === 'judging') {
      render(viewEl, okrJudgingHtml(room));
      return;
    }

    if (view === 'result') {
      var result = room.result || {};
      var errorHtml = result.error ? '<div class="card ok-error">' + escapeHtml(String(result.error)) + '</div>' : '';
      var retryHtml = result.error
        ? '<div class="row"><button id="okrRejudgeBtn" class="ghost">AI採点をやり直す</button></div>'
        : '';

      render(
        viewEl,
        '<div class="stack">' +
          '<div class="big center ok-pop">' +
          escapeHtml(roundLabel) +
          ' 結果発表</div>' +
          '<div class="muted center">お題「<b>' +
          escapeHtml(String((room.round && room.round.topic) || '')) +
          '</b>」</div>' +
          errorHtml +
          retryHtml +
          okrVerdictHtml(result) +
          okrResultCardsHtml(room, result, slot, true) +
          '<hr />' +
          okrShareBoxHtml(roomId, otherName + ' に結果を送る', '相手の端末でも同じ結果が見られます。') +
          okrRematchSectionHtml(room, slot) +
          '<div id="okrError" class="form-error" role="alert"></div>' +
          '<div class="center"><a class="btn ghost" href="./">ホームへ</a></div>' +
          '</div>'
      );
      return;
    }

    render(viewEl, '<div class="stack center"><div class="muted">よみこみ中…</div></div>');
  }

  function routeOekakiRelay(roomId) {
    var unsub = null;
    var lastRoom = null;
    var slot = okrLoadSlot(roomId);

    var ui = makeOekakiDrawUi({
      view: '',
      drawingRound: 0,
      judgeInFlight: false,
      judgeToken: '',
      joinInFlight: false
    });

    var draw = createOekakiDrawEngine(ui, {
      onDone: function () {
        submitNow(false);
      }
    });

    try {
      if (document.body && document.body.classList) document.body.classList.add('ok-player-screen');
    } catch (eCls) {
      // ignore
    }

    function settingsOf(room) {
      return normalizeOekakiLobbySettings(room && room.settings);
    }

    // 表示すべき画面を決める。draw に入ったあとは同じラウンドのあいだ draw を維持する
    // （描きかけのキャンバスが再描画で消えないようにするため）。
    function computeView(room) {
      if (!room) return '';
      var roundIndex = okrRoundIndex(room);
      var stage = okrStage(room);

      if (!slot) {
        // まだ席が決まっていない端末。b が空いていれば参加画面、埋まっていれば観戦。
        return okrPlayer(room, 'b') ? 'viewer' : 'join';
      }

      if (ui.drawingRound === roundIndex && stage === slot && !okrHasSubmitted(room, slot)) return 'draw';

      if (stage === 'result') return 'result';
      if (stage === 'judging') return 'judging';
      if (stage !== slot) return 'wait';

      if (!okrHasStarted(room, slot)) return 'ready';
      // 開始済みだが時間切れで戻ってきた（描かずに画面を離れた）場合は救済画面へ。
      if (okrEndsAt(room, slot) <= serverNowMs()) return 'timeup';
      return 'draw';
    }

    function renderKeyOf(room, view) {
      var roundIndex = okrRoundIndex(room);
      if (view === 'draw') return 'draw|' + roundIndex; // キャンバス保護のため中身では変えない
      var r = room.result || {};
      return [
        view,
        roundIndex,
        okrHasSubmitted(room, 'a') ? 1 : 0,
        okrHasSubmitted(room, 'b') ? 1 : 0,
        okrPlayer(room, 'b') ? 1 : 0,
        parseIntSafe(r.judgedAt, 0),
        r.error ? 1 : 0
      ].join('|');
    }

    // ---- タイマー（自分の持ち時間。相手とは非同期なのでプレイヤーごとの endsAt を見る） ----
    var OKR_RING_CIRC = 113.097; // 2π×r(18)

    function updateTimerText(room) {
      var endsAt = okrEndsAt(room, slot);
      var totalSec = settingsOf(room).drawSeconds;
      var remainMs = Math.max(0, endsAt - serverNowMs());
      var remainSec = Math.max(0, Math.ceil(remainMs / 1000));

      var fg = document.getElementById('okRingFg');
      if (fg) {
        var frac = Math.max(0, Math.min(1, remainMs / (totalSec * 1000)));
        fg.style.strokeDashoffset = String(OKR_RING_CIRC * (1 - frac));
      }
      var el = document.getElementById('okTimer');
      if (el) el.textContent = formatMMSS(remainSec);

      try {
        var fs = document.getElementById('okFs');
        if (fs) {
          if (remainSec <= 10 && remainSec > 0) fs.classList.add('ok-warn');
          else fs.classList.remove('ok-warn');
        }
      } catch (eWarn) {
        // ignore
      }
      return remainSec;
    }

    function updateCountdown(room) {
      var el = document.getElementById('okCountdown');
      var span = document.getElementById('okCountdownNum');
      if (!el || !span) return;
      var endsAt = okrEndsAt(room, slot);
      var totalSec = settingsOf(room).drawSeconds;
      var startAt = endsAt - totalSec * 1000;
      var diff = startAt - serverNowMs();
      var S = OEKAKI_COUNT_STEP_MS;

      function setNum(text, mode) {
        el.classList.toggle('ok-count-go', mode === 'go');
        el.classList.toggle('ok-count-ready', mode === 'ready');
        if (span.textContent === text) return;
        span.textContent = text;
        span.classList.remove('ok-count-pop');
        void span.offsetWidth;
        span.classList.add('ok-count-pop');
      }

      if (diff > 3 * S) {
        el.style.display = '';
        setNum('よーい…', 'ready');
      } else if (diff > 0) {
        el.style.display = '';
        setNum(String(Math.ceil(diff / S)), 'num');
      } else if (diff > -1000) {
        el.style.display = '';
        setNum('かいて！', 'go');
      } else {
        el.style.display = 'none';
      }
    }

    // ---- 提出 ----
    function submitNow(isAuto) {
      if (!slot) return;
      if (ui.submitInFlight) return;
      var room = lastRoom;
      if (!room || room.phase !== 'drawing') return;
      if (okrHasSubmitted(room, slot)) return;
      // リレーは相手を待たせるので、時間切れなら何も描いていなくても提出して進める。
      var dataUrl = draw.capture();
      if (!dataUrl) return;
      ui.submitInFlight = true;
      okrSubmit(roomId, slot, okrRoundIndex(room), dataUrl)
        .then(function () {
          ui.drawingRound = 0;
        })
        .catch(function (e) {
          if (!isAuto) alert((e && e.message) || '提出に失敗しました');
        })
        .finally(function () {
          ui.submitInFlight = false;
        });
    }

    // ---- AI採点 ----
    function startJudging(fromPhase) {
      if (ui.judgeInFlight) return;
      ui.judgeInFlight = true;
      ui.judgeToken = randomId(10);
      okrClaimJudging(roomId, ui.judgeToken, fromPhase)
        .then(function (won) {
          if (!won) return null;
          return getValueOnce(oekakiRelayRoomPath(roomId)).then(function (fresh) {
            if (!fresh || fresh.phase !== 'judging') return null;
            return okrRunJudge(roomId, fresh);
          });
        })
        .catch(function (e) {
          try {
            if (typeof console !== 'undefined' && console.warn) console.warn('oekaki relay judge failed', e);
          } catch (e2) {
            // ignore
          }
        })
        .finally(function () {
          ui.judgeInFlight = false;
        });
    }

    // 両者提出済みなら、その場に居る端末が判定を取りに行く（通常は後攻＝bの端末）。
    function maybeJudge(room) {
      if (!room || ui.judgeInFlight) return;
      if (!slot) return; // 観戦端末は採点しない（他人のAPIキー枠を使わない）
      if (room.phase === 'drawing') {
        if (!okrHasSubmitted(room, 'a') || !okrHasSubmitted(room, 'b')) return;
        startJudging('drawing');
        return;
      }
      if (room.phase === 'judging') {
        // 判定担当が落ちたまま固まっている場合だけ引き取る。
        if (String(room.judgeToken || '') === ui.judgeToken) return;
        var t0 = parseIntSafe(room.judgingAt, 0);
        if (!t0 || serverNowMs() - t0 < OKR_JUDGE_TAKEOVER_MS) return;
        startJudging('judging');
      }
    }

    function ensureTimer() {
      if (ui.timerId) return;
      ui.timerId = setInterval(function () {
        var q2 = null;
        try {
          q2 = parseQuery();
        } catch (e) {
          q2 = null;
        }
        if (!q2 || String(q2.screen || '') !== 'oekaki_relay' || String(q2.room || '') !== String(roomId || '')) {
          clearInterval(ui.timerId);
          ui.timerId = null;
          draw.teardown();
          return;
        }
        var room = lastRoom;
        if (!room) return;
        if (ui.view === 'draw') {
          var remainSec = updateTimerText(room);
          try {
            updateCountdown(room);
          } catch (eCd) {
            // ignore
          }
          if (remainSec <= 0) submitNow(true);
        }
        maybeJudge(room);
      }, 250);
    }

    // ---- 各画面のボタン ----
    function bindButtons(room, view) {
      // 席の取り戻し（別ブラウザで開き直して localStorage の記録が消えた場合の救済）。
      function bindClaimSeat(btnId, seat) {
        var b = document.getElementById(btnId);
        if (!b || b.__okr_bound) return;
        b.__okr_bound = true;
        b.addEventListener('click', function () {
          slot = seat;
          okrSaveSlot(roomId, seat);
          ui.renderKey = '';
          if (lastRoom) renderNow(lastRoom);
        });
      }
      bindClaimSeat('okrClaimA', 'a');
      bindClaimSeat('okrClaimB', 'b');

      if (view === 'join') {
        var joinBtn = document.getElementById('okrJoinBtn');
        if (joinBtn && !joinBtn.__okr_bound) {
          joinBtn.__okr_bound = true;
          joinBtn.addEventListener('click', function () {
            if (ui.joinInFlight) return;
            clearInlineError('okrJoinError');
            var el = document.getElementById('okrJoinName');
            var nm = String((el && el.value) || '').trim();
            if (!nm) {
              setInlineError('okrJoinError', '名前を入力してください。');
              return;
            }
            ui.joinInFlight = true;
            joinBtn.disabled = true;
            var token = randomId(10);
            okrJoinChallenger(roomId, nm, token)
              .then(function (won) {
                ui.joinInFlight = false;
                joinBtn.disabled = false;
                if (!won) {
                  setInlineError('okrJoinError', 'この勝負はすでに2人でうまっています。');
                  ui.renderKey = ''; // 観戦モードへ切り替えるため再描画させる
                  if (lastRoom) renderNow(lastRoom);
                  return;
                }
                savePersistedName(nm);
                slot = 'b';
                okrSaveSlot(roomId, 'b');
                ui.renderKey = '';
                if (lastRoom) renderNow(lastRoom);
              })
              .catch(function (e) {
                ui.joinInFlight = false;
                joinBtn.disabled = false;
                setInlineError('okrJoinError', (e && e.message) || '参加に失敗しました');
              });
          });
        }
        return;
      }

      if (view === 'ready' || view === 'timeup') {
        var startBtn = document.getElementById('okrStartBtn');
        if (startBtn && !startBtn.__okr_bound) {
          startBtn.__okr_bound = true;
          startBtn.addEventListener('click', function () {
            startBtn.disabled = true;
            var cur = lastRoom || room;
            var rIdx = okrRoundIndex(cur);
            var sec = settingsOf(cur).drawSeconds;
            var fn = view === 'timeup' ? okrRestartTurn : okrStartTurn;
            fn(roomId, slot, rIdx, sec)
              .then(function () {
                // 次のスナップショットで draw 画面に切り替わる。
                ui.drawingRound = rIdx;
              })
              .catch(function (e) {
                startBtn.disabled = false;
                setInlineError('okrError', (e && e.message) || '開始に失敗しました');
              });
          });
        }
        return;
      }

      var shareBtn = document.getElementById('okrShareBtn');
      if (shareBtn && !shareBtn.__okr_bound) {
        shareBtn.__okr_bound = true;
        shareBtn.addEventListener('click', function () {
          var cur = lastRoom || room;
          var me = okrName(cur, slot);
          var topic = String((cur.round && cur.round.topic) || '');
          var text = '';
          if (cur.phase === 'result') {
            text = '【おえかきバトル】お題「' + topic + '」の結果が出たよ。見て。';
          } else if (okrRoundIndex(cur) > 1 && String(cur.rematchBy || '') === slot) {
            text = '【おえかきバトル】前回の結果はこちら。あと、再戦を申し込みました。次はそっちが先攻です。';
          } else {
            text = '【おえかきバトル】' + me + ' が描き終わりました。同じお題で勝負しよう。';
          }
          okrShareLink(text, okrShareUrl(roomId), 'okrShareStatus');
        });
      }

      var rejudgeBtn = document.getElementById('okrRejudgeBtn');
      if (rejudgeBtn && !rejudgeBtn.__okr_bound) {
        rejudgeBtn.__okr_bound = true;
        rejudgeBtn.addEventListener('click', function () {
          rejudgeBtn.disabled = true;
          startJudging('result');
        });
      }

      var rematchBtn = document.getElementById('okrRematchBtn');
      if (rematchBtn && !rematchBtn.__okr_bound) {
        rematchBtn.__okr_bound = true;
        okrBindSettingsForm();
        rematchBtn.addEventListener('click', function () {
          clearInlineError('okrError');
          var cur = lastRoom || room;
          var settings = okrReadSettingsForm(settingsOf(cur));
          var topic = okrPickTopicFor(settings, String((cur.round && cur.round.topic) || ''));
          if (!topic) {
            setInlineError('okrError', 'お題を入力してください。');
            return;
          }
          rematchBtn.disabled = true;
          okrRematch(roomId, settings, topic, slot)
            .then(function () {
              okrSaveSettings(settings);
            })
            .catch(function (e) {
              rematchBtn.disabled = false;
              setInlineError('okrError', (e && e.message) || '再戦の申し込みに失敗しました');
            });
        });
      }
    }

    function renderNow(room) {
      lastRoom = room;
      var view = computeView(room);
      ui.view = view;
      if (view === 'draw') ui.drawingRound = okrRoundIndex(room);

      var key = renderKeyOf(room, view);
      if (ui.renderKey !== key) {
        ui.renderKey = key;
        renderOekakiRelay(viewEl, { room: room, roomId: roomId, slot: slot, view: view, ui: ui });
        if (view === 'draw') {
          draw.setup();
          updateTimerText(room);
          try {
            updateCountdown(room);
          } catch (eCd0) {
            // ignore
          }
        } else {
          // 描画画面を離れたらキャンバス用のグローバルハンドラを外す（他画面のズームを妨げない）。
          draw.teardown();
        }
        bindButtons(room, view);
        if (view === 'result' || view === 'ready' || view === 'wait') {
          try {
            animateOekakiScores();
          } catch (eAnim) {
            // ignore
          }
        }
      }
      ensureTimer();
    }

    firebaseReady()
      .then(function () {
        return subscribeOekakiRelayRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, 'バトルが見つかりません（古いリンクは7日で消えます）');
            return;
          }
          renderNow(room);
          try {
            maybeJudge(room);
          } catch (eJ) {
            // ignore
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      if (ui.timerId) {
        clearInterval(ui.timerId);
        ui.timerId = null;
      }
      draw.teardown();
    });
  }

  function route() {
    try {
      if (document && document.body && document.body.classList) {
        document.body.classList.remove('ll-player-screen');
        document.body.classList.remove('ll-table-screen');
        document.body.classList.remove('gm-participant');
        document.body.classList.remove('ok-player-screen');
      }
    } catch (e0) {
      // ignore
    }

    // Clear transient view-level classes so visual state doesn't leak across screens.
    try {
      if (viewEl && viewEl.classList) {
        viewEl.classList.remove('result-win');
        viewEl.classList.remove('result-lose');
        viewEl.classList.remove('cn-turn-actor');
        viewEl.classList.remove('ll-turn-actor');
        viewEl.classList.remove('ll-turn-waiting');
      }
    } catch (eView0) {
      // ignore
    }

    var q = parseQuery();
    var screen = q.screen ? String(q.screen) : '';
    var st = getUrlState();
    var roomId = st.roomId;
    var isHost = st.isHost;
    var isPlayer = q.player === '1';
    var lobbyId = q.lobby ? String(q.lobby) : '';

    if (lobbyId) setHeaderLobbyId(lobbyId);
    else setHeaderLobbyId('');

    try {
      updateHeaderLobbyBackButton(screen, lobbyId);
    } catch (eHB) {
      // ignore
    }

    // QR参加者（制限端末）は、待機＋ゲームプレイ以外へ遷移させない
    var activeLobbyId = '';
    var restricted = false;
    try {
      activeLobbyId = loadActiveLobbyId();
      restricted = !!(activeLobbyId && isRestrictedDevice());
    } catch (eR0) {
      activeLobbyId = '';
      restricted = false;
    }

    function redirectRestrictedToLobbyPlayer() {
      var qx = {};
      var vx = getCacheBusterParam();
      if (vx) qx.v = vx;
      qx.lobby = activeLobbyId;
      qx.screen = 'lobby_player';
      setQuery(qx);
      route();
      return;
    }

    if (restricted) {
      // If URL has a different lobby, allow switching ONLY when opening the join screen.
      // This enables scanning a new lobby QR without asking users to clear site data.
      if (lobbyId && String(lobbyId) !== String(activeLobbyId)) {
        if (screen === 'lobby_join') {
          try {
            setActiveLobby(lobbyId, true);
            activeLobbyId = String(lobbyId);
          } catch (eSw) {
            // ignore
          }
        } else {
          redirectRestrictedToLobbyPlayer();
          return;
        }
      }

      // Allowed screens for restricted devices.
      var allowed = {
        lobby_player: 1,
        lobby_join: 1,
        join: 1,
        ww_rejoin: 1,
        loveletter_join: 1,
        loveletter_rejoin: 1,
        loveletter_player: 1,
        codenames_join: 1,
        codenames_player: 1,
        codenames_rejoin: 1,
        hannin_table: 1,
        hannin_player: 1,
        oekaki_player: 1,
        // リレーモードはロビー外の遊び。LINE等で届いたリンクは制限端末でも開けるようにする
        // （部屋を作る側の画面 oekaki_relay_create は下のホスト系ブロックで弾かれる）。
        oekaki_relay: 1
      };

      // Host-mode is never allowed on restricted devices (even if URL is tampered).
      if (isHost || screen === 'lobby_host' || screen === 'lobby_assign' || screen === 'lobby_login' || screen === 'lobby_create' || screen === 'create' || screen === 'setup' || screen === 'history' || screen === 'codenames_create' || screen === 'codenames_host' || screen === 'loveletter_create' || screen === 'loveletter_host' || screen === 'loveletter_extras' || screen === 'oekaki_relay_create') {
        redirectRestrictedToLobbyPlayer();
        return;
      }

      // If screen is set and not allowed, force back.
      if (screen && !allowed[screen]) {
        redirectRestrictedToLobbyPlayer();
        return;
      }

      // For lobby_join, only allow joining the active lobby.
      if (screen === 'lobby_join' && (!lobbyId || String(lobbyId) !== String(activeLobbyId))) {
        redirectRestrictedToLobbyPlayer();
        return;
      }
    }

    if (screen === 'lobby_create') return routeLobbyCreate();
    if (screen === 'lobby_login') {
      if (!lobbyId) return routeHome();
      return routeLobbyLogin(lobbyId);
    }
    if (screen === 'lobby_join') return routeLobbyJoin(lobbyId);
    if (screen === 'lobby_host') {
      if (!lobbyId) return routeHome();
      return routeLobbyHost(lobbyId);
    }
    if (screen === 'lobby_player') {
      if (!lobbyId) return routeHome();
      return routeLobbyPlayer(lobbyId);
    }
    if (screen === 'lobby_assign') {
      if (!lobbyId) return routeHome();
      return routeLobbyAssign(lobbyId);
    }

    if (screen === 'codenames_create') return routeCodenamesCreate();
    if (screen === 'loveletter_create') return routeLoveLetterCreate();

    if (screen === 'setup') return routeSetup();
    if (screen === 'history') return routeHistory();
    if (screen === 'create') return routeCreate();

    if (screen === 'loveletter_join') {
      if (!roomId) return routeHome();
      return routeLoveLetterJoin(roomId, isHost);
    }
    if (screen === 'loveletter_rejoin') {
      if (!roomId) return routeHome();
      return routeLoveLetterRejoin(roomId, isHost);
    }
    if (screen === 'loveletter_host') {
      if (!roomId) return routeHome();
      return routeLoveLetterHost(roomId);
    }
    if (screen === 'loveletter_extras') {
      if (!roomId) return routeHome();
      return routeLoveLetterExtras(roomId, isHost);
    }
    if (screen === 'loveletter_player') {
      if (!roomId) return routeHome();
      return routeLoveLetterPlayer(roomId, isHost);
    }

    if (screen === 'loveletter_table') {
      if (!roomId) return routeHome();
      return routeLoveLetterTable(roomId, isHost);
    }

    if (screen === 'loveletter_sim_table') {
      return routeLoveLetterSimTable();
    }

    if (screen === 'hannin_sim_table') {
      return routeHanninSimTable();
    }

    if (screen === 'codenames_rejoin') {
      if (!roomId) return routeHome();
      return routeCodenamesRejoin(roomId);
    }
    if (screen === 'codenames_join') {
      if (!roomId) return routeHome();
      return routeCodenamesJoin(roomId, isHost);
    }
    if (screen === 'codenames_host') {
      if (!roomId) return routeHome();
      return routeCodenamesHost(roomId);
    }
    if (screen === 'codenames_player') {
      if (!roomId) return routeHome();
      return routeCodenamesPlayer(roomId, isHost);
    }

    if (screen === 'codenames_table') {
      if (!roomId) return routeHome();
      return routeCodenamesTable(roomId, isHost);
    }
  
    if (screen === 'hannin_table') {
      if (!roomId) return routeHome();
      return routeHanninTable(roomId, isHost);
    }

    if (screen === 'hannin_player') {
      if (!roomId) return routeHome();
      return routeHanninPlayer(roomId, isHost);
    }

    if (screen === 'oekaki_player') {
      if (!roomId) return routeHome();
      return routeOekakiPlayer(roomId, isHost);
    }

    if (screen === 'oekaki_relay_create') return routeOekakiRelayCreate();

    if (screen === 'oekaki_relay') {
      if (!roomId) return routeHome();
      return routeOekakiRelay(roomId);
    }

    if (!roomId) return routeHome();

    if (screen === 'ww_rejoin') return routeWordwolfRejoin(roomId, isHost);
    if (screen === 'ww_table') return routeWordwolfTable(roomId, isHost);
    if (screen === 'join') return routeJoin(roomId, isHost);
    if (isPlayer) return routePlayer(roomId, isHost);
    if (isHost) return routeHost(roomId);

    return routeJoin(roomId, false);
  }

  function routeCodenamesCreate() {
    renderCodenamesCreate(viewEl);
    clearInlineError('cnCreateError');
    var btn = document.getElementById('cnCreateRoom');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var settings;
      try {
        clearInlineError('cnCreateError');
        settings = readCodenamesCreateForm();
      } catch (e) {
        setInlineError('cnCreateError', (e && e.message) || '入力を確認してください。');
        return;
      }

      var roomId = makeRoomId();
      firebaseReady()
        .then(function () {
          return createCodenamesRoom(roomId, settings);
        })
        .then(function () {
          var playerId = getOrCreateCodenamesPlayerId(roomId);
          return joinPlayerInCodenamesRoom(roomId, playerId, settings.name, true);
        })
        .then(function () {
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.host = '1';
          q.screen = 'codenames_host';
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '作成に失敗しました');
        });
    });
  }

  function routeCodenamesJoin(roomId, isHost) {
    renderCodenamesJoin(viewEl, roomId);
    clearInlineError('cnJoinError');
    stripBackNavLinks(viewEl);
    var btn = document.getElementById('cnJoin');
    if (!btn) return;

    // Auto-join support (used by lobby).
    try {
      var q0 = parseQuery();
      var nm0 = q0 && q0.name ? String(q0.name) : '';
      if (nm0) {
        var input0 = document.getElementById('cnPlayerName');
        if (input0) input0.value = nm0;
      }
    } catch (e0) {
      // ignore
    }

    function doJoin() {
      var form;
      try {
        clearInlineError('cnJoinError');
        form = readCodenamesJoinForm();
      } catch (e) {
        setInlineError('cnJoinError', (e && e.message) || '入力を確認してください。');
        return;
      }

      firebaseReady()
        .then(function () {
          var qx = parseQuery();
          var lobbyId = qx && qx.lobby ? String(qx.lobby) : '';
          var storedId = '';
          try {
            storedId = String(localStorage.getItem('cn_player_' + roomId) || '');
          } catch (e0) {
            storedId = '';
          }
          var playerId = storedId || getOrCreateCodenamesPlayerId(roomId);

          if (lobbyId) {
            var mid = getOrCreateLobbyMemberId(lobbyId);
            setCodenamesPlayerId(roomId, mid);
            playerId = mid;
          }

          return joinPlayerInCodenamesRoom(roomId, playerId, form.name, false)
            .then(function (room) {
              if (!room) throw new Error('部屋が見つかりません');

              if (room.players && room.players[playerId]) return playerId;
              if (storedId && room.players && room.players[storedId]) {
                setCodenamesPlayerId(roomId, storedId);
                return storedId;
              }

              if (String(room.phase || '') !== 'lobby') {
                var q = {};
                var v = getCacheBusterParam();
                if (v) q.v = v;
                q.room = roomId;
                q.screen = 'codenames_rejoin';
                if (lobbyId) q.lobby = lobbyId;
                if (isHost) q.host = '1';
                setQuery(q);
                route();
                return '';
              }

              throw new Error('参加できません（ゲームが開始済みです）');
            })
            .then(function (pid) {
              if (!lobbyId) return pid;
              return getValueOnce(lobbyPath(lobbyId) + '/codenamesAssign/' + pid)
                .catch(function () {
                  return null;
                })
                .then(function (a) {
                  if (!a) return pid;
                  var team = a && a.team ? String(a.team) : '';
                  var role = a && a.role ? String(a.role) : '';
                  if (!team && !role) return pid;
                  return setCodenamesPlayerProfile(roomId, pid, form.name, team, role).then(function () {
                    return pid;
                  });
                });
            });
        })
        .then(function (pid) {
          if (!pid) return;
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.screen = 'codenames_player';
          q.player = '1';
          if (isHost) q.host = '1';
          try {
            var qx2 = parseQuery();
            if (qx2 && qx2.lobby) q.lobby = String(qx2.lobby);
          } catch (e2) {
            // ignore
          }
          setQuery(q);
          route();
        })
        .catch(function (e) {
          renderError(viewEl, (e && e.message) || '参加に失敗しました');
        });
    }

    btn.addEventListener('click', doJoin);

    try {
      var q1 = parseQuery();
      if (q1 && String(q1.autojoin || '') === '1') {
        setTimeout(function () {
          doJoin();
        }, 0);
      }
    } catch (e1) {
      // ignore
    }
  }

  function routeCodenamesRejoin(roomId) {
    var unsub = null;

    firebaseReady()
      .then(function () {
        return subscribeCodenamesRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          // Rejoin (name picking) is intended for ongoing games.
          // If the game is still in lobby, guide users to the normal join screen.
          if (String(room.phase || '') === 'lobby') {
            var q = {};
            var v = getCacheBusterParam();
            if (v) q.v = v;
            q.room = roomId;
            q.screen = 'codenames_join';
            setQuery(q);
            route();
            return;
          }

          renderCodenamesRejoin(viewEl, { roomId: roomId, room: room });
          clearInlineError('cnRejoinError');
          stripBackNavLinks(viewEl);

          var goNew = document.getElementById('cnGoNewJoin');
          if (goNew && !goNew.__cn_bound) {
            goNew.__cn_bound = true;
            goNew.addEventListener('click', function () {
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.screen = 'codenames_join';
              setQuery(q);
              route();
            });
          }

          var picks = document.querySelectorAll('.cnRejoinPick');
          for (var i = 0; i < picks.length; i++) {
            var b = picks[i];
            if (b.__cn_bound) continue;
            b.__cn_bound = true;
            b.addEventListener('click', function (ev) {
              var el = ev && ev.currentTarget ? ev.currentTarget : null;
              var pid = el ? el.getAttribute('data-pid') : '';
              if (!pid) {
                setInlineError('cnRejoinError', '選択に失敗しました');
                return;
              }

              var p = room && room.players ? room.players[pid] : null;
              setCodenamesPlayerId(roomId, pid);
              touchCodenamesPlayer(roomId, pid).catch(function () {
                // ignore
              });

              var q2 = {};
              var v2 = getCacheBusterParam();
              if (v2) q2.v = v2;
              q2.room = roomId;
              q2.screen = 'codenames_player';
              q2.player = '1';
              if (p && p.isHost) q2.host = '1';
              setQuery(q2);
              route();
            });
          }
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeCodenamesHost(roomId) {
    var unsub = null;
    var q0 = parseQuery();
    var qrOnly = q0 && q0.qr === '1';
    var joinUrl = qrOnly ? makeCodenamesRejoinUrl(roomId) : makeCodenamesJoinUrl(roomId);
    var hostPlayerId = getOrCreateCodenamesPlayerId(roomId);
    var didLockLobby = false;

    var lobbyId = '';
    try {
      var qL = parseQuery();
      lobbyId = qL && qL.lobby ? String(qL.lobby) : '';
    } catch (eL) {
      lobbyId = '';
    }

    var lobbyReturnWatching = false;
    var lobbyUnsub = null;
    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (lobbyReturnWatching) return;
      lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'codenames' || rid !== String(roomId || '')) {
              try {
                if (lobbyUnsub) lobbyUnsub();
              } catch (e) {
                // ignore
              }
              lobbyUnsub = null;
              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.lobby = lobbyId;
              q.screen = 'lobby_host';
              setQuery(q);
              route();
            }
          });
        })
        .then(function (u2) {
          lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    function drawQr() {
      return new Promise(function (resolve) {
        var canvas = document.getElementById('qr');
        var errEl = document.getElementById('qrError');
        var wrapEl = document.getElementById('qrWrap');
        if (errEl) errEl.textContent = '';

        function showAsRemoteImage() {
          if (!wrapEl) return resolve();
          var src =
            'https://api.qrserver.com/v1/create-qr-code/?size=' +
            encodeURIComponent('240x240') +
            '&data=' +
            encodeURIComponent(String(joinUrl || ''));
          try {
            wrapEl.innerHTML = '';
            var img = document.createElement('img');
            img.id = 'qrImg';
            img.alt = 'QR';
            img.referrerPolicy = 'no-referrer';
            img.onload = function () {
              if (errEl) errEl.textContent = '（外部サービスでQRを生成しています）';
              resolve();
            };
            img.onerror = function () {
              if (errEl) errEl.textContent = 'QR画像の読み込みに失敗しました（ネットワーク/フィルタの可能性）。URLコピーで参加してください。';
              resolve();
            };
            img.src = src;
            wrapEl.appendChild(img);
            return;
          } catch (e) {
            wrapEl.innerHTML = '<img id="qrImg" alt="QR" src="' + escapeHtml(src) + '" />';
            if (errEl) errEl.textContent = '（外部サービスでQRを生成しています）';
            return resolve();
          }
        }

        if (!canvas) {
          if (errEl) errEl.textContent = 'QR表示領域が見つかりません。';
          return resolve();
        }
        var qr = window.QRCode || window.qrcode || window.QR;
        if (!qr || !qr.toCanvas) {
          return showAsRemoteImage();
        }

        function showAsImage() {
          if (!qr.toDataURL || !wrapEl) return showAsRemoteImage();
          try {
            qr.toDataURL(joinUrl, { margin: 1, width: 240 }, function (err, url) {
              if (err || !url) {
                return showAsRemoteImage();
              }
              wrapEl.innerHTML = '<img id="qrImg" alt="QR" src="' + escapeHtml(url) + '" />';
              if (errEl) errEl.textContent = '（QRは画像で表示しています）';
              return resolve();
            });
          } catch (e) {
            return showAsRemoteImage();
          }
        }

        function looksBlank(c) {
          try {
            var ctx = c.getContext && c.getContext('2d');
            if (!ctx) return true;
            var w = c.width || 0;
            var h = c.height || 0;
            if (!w || !h) return true;
            var img = ctx.getImageData(0, 0, Math.min(16, w), Math.min(16, h)).data;
            var allZero = true;
            var allWhite = true;
            for (var i = 0; i < img.length; i += 4) {
              var r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
              if (a !== 0) allZero = false;
              if (!(a !== 0 && r > 240 && g > 240 && b > 240)) allWhite = false;
              if (!allZero && !allWhite) return false;
            }
            return allZero || allWhite;
          } catch (e) {
            return true;
          }
        }

        try {
          qr.toCanvas(canvas, joinUrl, { margin: 1, width: 240 }, function (err) {
            if (err) {
              if (errEl) errEl.textContent = 'QRの生成に失敗しました。';
              showAsRemoteImage();
              return;
            }
            if (looksBlank(canvas)) {
              showAsRemoteImage();
              return;
            }
            resolve();
          });
        } catch (e) {
          if (errEl) errEl.textContent = 'QRの生成に失敗しました。';
          showAsRemoteImage();
        }
      });
    }

    function renderWithRoom(room) {
      renderCodenamesHost(viewEl, { roomId: roomId, joinUrl: joinUrl, room: room, hostPlayerId: hostPlayerId, qrOnly: qrOnly });
      if (qrOnly) drawQr();

      if (!qrOnly && !didLockLobby && room && String(room.phase || '') === 'lobby') {
        didLockLobby = true;
        lockCodenamesLobbyForTimer(roomId).catch(function () {
          // ignore
        });
      }

      var copyBtn = document.getElementById('copyJoinUrl');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var st = document.getElementById('copyStatus');
          if (st) st.textContent = 'コピー中...';
          copyTextToClipboard(joinUrl)
            .then(function (ok) {
              if (!st) return;
              st.textContent = ok ? 'コピーしました' : 'コピーできませんでした（長押しで選択してコピーしてください）';
            })
            .catch(function () {
              if (st) st.textContent = 'コピーできませんでした（長押しで選択してコピーしてください）';
            });
        });
      }

      var startBtn = document.getElementById('cnStart');
      if (startBtn && !startBtn.__cn_bound) {
        startBtn.__cn_bound = true;

        function doStart(ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
          if (startBtn.__cn_starting) return;
          startBtn.__cn_starting = true;
          startBtn.disabled = true;

          var stEl = document.getElementById('cnStartStatus');
          if (stEl) stEl.textContent = '開始処理中...';

          // Pre-check with the latest snapshot so the button being tappable never results in a silent no-op.
          var qx0 = null;
          var lobbyId0 = '';
          try {
            qx0 = parseQuery();
            lobbyId0 = qx0 && qx0.lobby ? String(qx0.lobby) : '';
          } catch (eQ0) {
            qx0 = null;
            lobbyId0 = '';
          }

          Promise.resolve()
            .then(function () {
              if (!lobbyId0) return null;
              return applyLobbyCodenamesAssignToRoom(roomId, lobbyId0);
            })
            .then(function () {
              return getValueOnce(codenamesRoomPath(roomId));
            })
            .then(function (cur) {
              var phase = (cur && cur.phase) || 'lobby';
              var counts0 = countCodenamesRoles(cur);
              var ok =
                phase === 'lobby' &&
                counts0.redSpymaster === 1 &&
                counts0.blueSpymaster === 1 &&
                counts0.redOperative >= 1 &&
                counts0.blueOperative >= 1;
              if (!ok) {
                throw new Error(
                  '開始条件未達: 赤スパイマスター=' +
                    counts0.redSpymaster +
                    ' / 青スパイマスター=' +
                    counts0.blueSpymaster +
                    ' / 赤諜報員=' +
                    counts0.redOperative +
                    ' / 青諜報員=' +
                    counts0.blueOperative
                );
              }
              return startCodenamesGame(roomId);
            })
            .then(function (room2) {
              if (stEl) stEl.textContent = '';

              if (!room2 || String(room2.phase || '') !== 'playing') {
                var counts = countCodenamesRoles(room2);
                throw new Error(
                  'ゲームを開始できませんでした。\n' +
                    '赤スパイマスター=' +
                    counts.redSpymaster +
                    ' / 青スパイマスター=' +
                    counts.blueSpymaster +
                    ' / 赤諜報員=' +
                    counts.redOperative +
                    ' / 青諜報員=' +
                    counts.blueOperative
                );
              }

              var q = {};
              var v = getCacheBusterParam();
              if (v) q.v = v;
              q.room = roomId;
              q.host = '1';
              try {
                var qx = parseQuery();
                if (qx && qx.lobby) q.lobby = String(qx.lobby);
                if (qx && String(qx.gmdev || '') === '1') {
                  q.gmdev = '1';
                  q.screen = 'codenames_table';
                } else {
                  q.player = '1';
                  q.screen = 'codenames_player';
                }
              } catch (e0) {
                q.player = '1';
                q.screen = 'codenames_player';
              }
              setQuery(q);
              route();
            })
            .catch(function (e) {
              if (stEl) stEl.textContent = '';
              alert((e && e.message) || '失敗');
            })
            .finally(function () {
              startBtn.__cn_starting = false;
              startBtn.disabled = false;
            });
        }

        // Some mobile browsers can miss click; bind pointer/touch as well.
        startBtn.addEventListener('click', doStart);
        if (typeof PointerEvent !== 'undefined') {
          startBtn.addEventListener('pointerdown', doStart);
        } else {
          startBtn.addEventListener('touchstart', doStart, { passive: false });
        }
      }

      var normalVals = [60, 90, 120, 150];
      var bonusVals = [30, 60, 90, 120];

      function updateTimerLabels() {
        var nEl = document.getElementById('cnTimerNormal');
        var bEl = document.getElementById('cnTimerBonus');
        var nl = document.getElementById('cnTimerNormalLabel');
        var bl = document.getElementById('cnTimerBonusLabel');
        var ni = clamp(parseIntSafe(nEl && nEl.value, 0), 0, 3);
        var bi = clamp(parseIntSafe(bEl && bEl.value, 0), 0, 3);
        if (nl) nl.textContent = formatMMSS(normalVals[ni] || 60);
        if (bl) bl.textContent = formatMMSS(bonusVals[bi] || 30);
      }

      var nSlider = document.getElementById('cnTimerNormal');
      var bSlider = document.getElementById('cnTimerBonus');
      if (nSlider && !nSlider.__cn_bound) {
        nSlider.__cn_bound = true;
        nSlider.addEventListener('input', updateTimerLabels);
        nSlider.addEventListener('change', function () {
          var ni = clamp(parseIntSafe(nSlider.value, 0), 0, 3);
          var bi = clamp(parseIntSafe(bSlider && bSlider.value, 0), 0, 3);
          setCodenamesTimerSettings(roomId, normalVals[ni], bonusVals[bi]).catch(function () {
            // ignore
          });
        });
      }
      if (bSlider && !bSlider.__cn_bound) {
        bSlider.__cn_bound = true;
        bSlider.addEventListener('input', updateTimerLabels);
        bSlider.addEventListener('change', function () {
          var ni = clamp(parseIntSafe(nSlider && nSlider.value, 0), 0, 3);
          var bi = clamp(parseIntSafe(bSlider.value, 0), 0, 3);
          setCodenamesTimerSettings(roomId, normalVals[ni], bonusVals[bi]).catch(function () {
            // ignore
          });
        });
      }
      updateTimerLabels();

      var backBtn = document.getElementById('cnBackToGame');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          var q = {};
          var v = getCacheBusterParam();
          if (v) q.v = v;
          q.room = roomId;
          q.host = '1';
          q.player = '1';
          q.screen = 'codenames_player';
          setQuery(q);
          route();
        });
      }

      var gmSave = document.getElementById('cnGmSave');
      if (gmSave && !gmSave.__cn_bound) {
        gmSave.__cn_bound = true;
        gmSave.addEventListener('click', function () {
          var st = document.getElementById('cnGmStatus');
          if (st) st.textContent = '保存中...';
          clearInlineError('cnGmError');
          var nameEl = document.getElementById('cnGmName');
          var teamEl = document.getElementById('cnGmTeam');
          var roleEl = document.getElementById('cnGmRole');
          var nm = String((nameEl && nameEl.value) || '').trim();
          var tm = String((teamEl && teamEl.value) || '');
          var rl = String((roleEl && roleEl.value) || '');
          if (!nm) {
            if (st) st.textContent = '';
            setInlineError('cnGmError', '名前を入力してください。');
            return;
          }
          if (!tm) {
            if (st) st.textContent = '';
            setInlineError('cnGmError', 'チームを選んでください。');
            return;
          }
          if (!rl) {
            if (st) st.textContent = '';
            setInlineError('cnGmError', '役職を選んでください。');
            return;
          }
          setCodenamesPlayerProfile(roomId, hostPlayerId, nm, tm, rl)
            .then(function () {
              if (st) st.textContent = '保存しました';
            })
            .catch(function (e) {
              if (st) st.textContent = '保存できませんでした';
              setInlineError('cnGmError', (e && e.message) || '保存に失敗しました');
            });
        });
      }
    }

    firebaseReady()
      .then(function () {
        if (lobbyId) ensureLobbyReturnWatcher();
        return subscribeCodenamesRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }
          if (lobbyId) ensureLobbyReturnWatcher();
          renderWithRoom(room);
        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
    });
  }

  function routeCodenamesPlayer(roomId, isHost) {
    var playerId = getOrCreateCodenamesPlayerId(roomId);
    var unsub = null;
    var timerHandle = null;
    var ui = { lobbyReturnWatching: false, lobbyUnsub: null };

    var lobbyId = '';
    try {
      var q0 = parseQuery();
      lobbyId = q0 && q0.lobby ? String(q0.lobby) : '';
    } catch (e0) {
      lobbyId = '';
    }

    function redirectToLobby() {
      if (!lobbyId) return;
      var q = {};
      var v = getCacheBusterParam();
      if (v) q.v = v;
      q.lobby = lobbyId;
      q.screen = isHost ? 'lobby_host' : 'lobby_player';
      setQuery(q);
      route();
    }

    function ensureLobbyReturnWatcher() {
      if (!lobbyId) return;
      if (ui.lobbyReturnWatching) return;
      ui.lobbyReturnWatching = true;
      firebaseReady()
        .then(function () {
          return subscribeLobby(lobbyId, function (lobby) {
            var cg = (lobby && lobby.currentGame) || null;
            var kind = cg && cg.kind ? String(cg.kind) : '';
            var rid = cg && cg.roomId ? String(cg.roomId) : '';
            if (!cg || kind !== 'codenames' || rid !== String(roomId || '')) {
              try {
                if (ui.lobbyUnsub) ui.lobbyUnsub();
              } catch (e) {
                // ignore
              }
              ui.lobbyUnsub = null;
              redirectToLobby();
            }
          });
        })
        .then(function (u2) {
          ui.lobbyUnsub = u2;
        })
        .catch(function () {
          // ignore
        });
    }

    firebaseReady()
      .then(function () {
        if (lobbyId) ensureLobbyReturnWatcher();
        return subscribeCodenamesRoom(roomId, function (room) {
          if (!room) {
            renderError(viewEl, '部屋が見つかりません');
            return;
          }

          var player = room.players ? room.players[playerId] : null;
          renderCodenamesPlayer(viewEl, { roomId: roomId, playerId: playerId, room: room, player: player, isHost: isHost, lobbyId: lobbyId });

          if (lobbyId) ensureLobbyReturnWatcher();

          function rerenderCnTimer() {
            var el = document.getElementById('cnTimer');
            if (!el) return;
            if (!room || room.phase !== 'playing') return;
            var endAt = room.turn && room.turn.endsAt ? room.turn.endsAt : 0;
            if (!endAt) {
              el.textContent = '-:--';
              return;
            }
            var remain = Math.max(0, Math.floor((endAt - serverNowMs()) / 1000));
            el.textContent = formatMMSS(remain);
          }

          if (timerHandle) clearInterval(timerHandle);
          timerHandle = setInterval(function () {
            rerenderCnTimer();
          }, 250);

          var saveBtn = document.getElementById('cnSavePrefs');
          if (saveBtn && !saveBtn.__cn_bound) {
            saveBtn.__cn_bound = true;
            saveBtn.addEventListener('click', function () {
              var teamSel = document.getElementById('cnTeam');
              var roleSel = document.getElementById('cnRole');
              var team = String((teamSel && teamSel.value) || '');
              var role = String((roleSel && roleSel.value) || '');
              clearInlineError('cnPrefsError');
              if (!team || !role) {
                setInlineError('cnPrefsError', 'チームと役職を選んでください。');
                return;
              }
              setCodenamesPlayerPrefs(roomId, playerId, team, role).catch(function (e) {
                setInlineError('cnPrefsError', (e && e.message) || '保存に失敗しました');
              });
            });
          }

          // NOTE: タイマー設定/スタートはテーブル用の設定画面（codenames_host）側に集約。

          var contBtn = document.getElementById('cnContinue');
          if (contBtn && !contBtn.__cn_bound) {
            contBtn.__cn_bound = true;
            contBtn.addEventListener('click', function () {
              resetCodenamesToLobby(roomId).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          // Lobby mode: GM only "next" => back to lobby.
          var nextBtn = document.getElementById('cnNextToLobby');
          if (nextBtn && !nextBtn.__cn_bound) {
            nextBtn.__cn_bound = true;
            nextBtn.addEventListener('click', function () {
              if (!lobbyId) return;
              nextBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  // Reset room state so rejoin/restart won't stick to timer/settings.
                  return resetCodenamesToLobby(roomId)
                    .catch(function () {
                      return null;
                    })
                    .then(function () {
                      return setLobbyCurrentGame(lobbyId, null);
                    });
                })
                .then(function () {
                  redirectToLobby();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  nextBtn.disabled = false;
                });
            });
          }

          var backBtn = document.getElementById('cnBackToLobby');
          if (backBtn && !backBtn.__cn_bound) {
            backBtn.__cn_bound = true;
            backBtn.addEventListener('click', function () {
              if (!bbgConfirmClick(backBtn, 'ゲームを中断して\nぜんいんロビーに戻ります。', 'ロビーに戻る')) return;
              var qx = parseQuery();
              var lobbyId = qx && qx.lobby ? String(qx.lobby) : '';
              if (!lobbyId) {
                alert('ロビーIDがありません');
                return;
              }
              backBtn.disabled = true;
              firebaseReady()
                .then(function () {
                  return setLobbyCurrentGame(lobbyId, null);
                })
                .then(function () {
                  var q = {};
                  var v = getCacheBusterParam();
                  if (v) q.v = v;
                  q.lobby = lobbyId;
                  q.screen = 'lobby_host';
                  setQuery(q);
                  route();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                })
                .finally(function () {
                  backBtn.disabled = false;
                });
            });
          }

          var changeBtn = document.getElementById('cnChangePlayers');
          if (changeBtn && !changeBtn.__cn_bound) {
            changeBtn.__cn_bound = true;
            changeBtn.addEventListener('click', function () {
              resetCodenamesForNewPlayers(roomId, playerId)
                .then(function () {
                  var q = {};
                  var v = getCacheBusterParam();
                  if (v) q.v = v;
                  q.room = roomId;
                  q.host = '1';
                  q.screen = 'codenames_host';
                  setQuery(q);
                  route();
                })
                .catch(function (e) {
                  alert((e && e.message) || '失敗');
                });
            });
          }


          var clueBtn = document.getElementById('cnSubmitClue');
          if (clueBtn && !clueBtn.__cn_bound) {
            clueBtn.__cn_bound = true;
            clueBtn.addEventListener('click', function () {
              var wEl = document.getElementById('cnClueWord');
              var nEl = document.getElementById('cnClueNum');
              var w = String((wEl && wEl.value) || '').trim();
              var n = parseIntSafe(nEl && nEl.value, 0);
              clearInlineError('cnClueError');
              if (!w) {
                setInlineError('cnClueError', 'ヒントを入力してください。');
                return;
              }
              if (n == null || isNaN(n) || n < 0) {
                setInlineError('cnClueError', '数（0以上）を入力してください。');
                return;
              }
              submitCodenamesClue(roomId, playerId, w, n).catch(function (e) {
                setInlineError('cnClueError', (e && e.message) || '送信に失敗しました');
              });
            });
          }

          var endBtn = document.getElementById('cnEndTurn');
          if (endBtn && !endBtn.__cn_bound) {
            endBtn.__cn_bound = true;
            endBtn.addEventListener('click', function () {
              endCodenamesTurn(roomId).catch(function (e) {
                alert((e && e.message) || '失敗');
              });
            });
          }

          function confirmPick(idx) {
            if (idx == null) return;
            revealCodenamesCard(roomId, playerId, idx).catch(function (e) {
              alert((e && e.message) || '失敗');
            });
          }

          var pickBtns = document.querySelectorAll('.cnPick');
          for (var i = 0; i < pickBtns.length; i++) {
            var b = pickBtns[i];
            if (b.__cn_bound) continue;
            b.__cn_bound = true;

            (function (btn) {
              var holdMs = CN_LONG_PRESS_MS;
              var timer = null;
              var longFired = false;

              function clearTimer() {
                if (timer) {
                  clearTimeout(timer);
                  timer = null;
                }
              }

              function getIdxFromEvent(ev) {
                var el = ev && ev.currentTarget ? ev.currentTarget : btn;
                if (!el) return null;
                return el.getAttribute('data-idx');
              }

              btn.addEventListener('click', function (ev) {
                // Short tap: pending toggle. If long-press fired, ignore the click.
                if (longFired) {
                  longFired = false;
                  if (ev && ev.preventDefault) ev.preventDefault();
                  if (ev && ev.stopPropagation) ev.stopPropagation();
                  return;
                }
                if (ev && ev.preventDefault) ev.preventDefault();
                var idx = getIdxFromEvent(ev);
                toggleCodenamesPending(roomId, playerId, idx).catch(function (e) {
                  alert((e && e.message) || '失敗');
                });
              });

              if (typeof PointerEvent !== 'undefined') {
                btn.addEventListener('pointerdown', function (ev) {
                  // Only primary button / touch
                  if (ev && ev.button != null && ev.button !== 0) return;
                  if (ev && ev.preventDefault) ev.preventDefault();
                  clearTimer();
                  longFired = false;
                  var idx = getIdxFromEvent(ev);
                  timer = setTimeout(function () {
                    longFired = true;
                    clearTimer();
                    confirmPick(idx);
                  }, holdMs);
                });
                btn.addEventListener('pointerup', clearTimer);
                btn.addEventListener('pointercancel', clearTimer);
                btn.addEventListener('pointerleave', clearTimer);
              } else {
                btn.addEventListener('touchstart', function (ev) {
                  if (ev && ev.preventDefault) ev.preventDefault();
                  clearTimer();
                  longFired = false;
                  var idx = getIdxFromEvent(ev);
                  timer = setTimeout(function () {
                    longFired = true;
                    clearTimer();
                    confirmPick(idx);
                  }, holdMs);
                });
                btn.addEventListener('touchend', clearTimer);
                btn.addEventListener('touchcancel', clearTimer);

                btn.addEventListener('mousedown', function (ev) {
                  if (ev && ev.button != null && ev.button !== 0) return;
                  clearTimer();
                  longFired = false;
                  var idx = getIdxFromEvent(ev);
                  timer = setTimeout(function () {
                    longFired = true;
                    clearTimer();
                    confirmPick(idx);
                  }, holdMs);
                });
                btn.addEventListener('mouseup', clearTimer);
                btn.addEventListener('mouseleave', clearTimer);
              }

              btn.addEventListener('contextmenu', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
              });
            })(b);
          }

        });
      })
      .then(function (u) {
        unsub = u;
      })
      .catch(function (e) {
        renderError(viewEl, (e && e.message) || 'Firebase接続に失敗しました');
      });

    // When the app comes back from background, force a tiny write to refresh state.
    function touchOnResume() {
      firebaseReady()
        .then(function () {
          return touchLoveLetterPlayer(roomId, playerId);
        })
        .catch(function () {
          // ignore
        });
    }
    try {
      window.addEventListener('focus', touchOnResume);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) touchOnResume();
      });
    } catch (eX) {
      // ignore
    }

    window.addEventListener('popstate', function () {
      if (unsub) unsub();
      try {
        if (ui && ui.lobbyUnsub) ui.lobbyUnsub();
      } catch (e) {
        // ignore
      }
      if (timerHandle) clearInterval(timerHandle);
    });
  }

  function setupRulesButton() {
    // ルール説明は一旦非表示（要件）。
    // ボタンがDOMに残っていても操作できないようにする。
    var btn = null;
    try {
      btn = document.getElementById('rulesBtn');
    } catch (e) {
      btn = null;
    }
    if (!btn) return;
    try {
      btn.style.display = 'none';
      btn.disabled = true;
      btn.setAttribute('aria-hidden', 'true');
      btn.setAttribute('tabindex', '-1');
    } catch (e2) {
      // ignore
    }
  }

  // boot
  try {
    viewEl = qs('#view');
    setupRulesButton();
    // --- Version string (use bundled asset cache-buster) ---
    var bundledV = '';
    try {
      bundledV = String(getBundledAssetVersion() || '');
    } catch (eV0) {
      bundledV = '';
    }
    var versionString = bundledV ? 'v' + bundledV : '';
    var versionEl = document.getElementById('versionString');
    if (versionEl) {
      versionEl.textContent = versionString;
      versionEl.title = bundledV ? 'Assets: ' + bundledV : '';
    }
    var buildInfoEl = document.querySelector('#buildInfo');
    if (buildInfoEl) {
      // Save vertical space.
      buildInfoEl.style.display = 'none';
    }

    window.addEventListener('popstate', function () {
      route();
    });

    try {
      ensureUrlHasCacheBuster();
    } catch (e1) {
      // Some environments can throw on history.pushState; ignore and continue.
      try {
        if (typeof console !== 'undefined' && console && console.warn) console.warn('ensureUrlHasCacheBuster failed', e1);
      } catch (e2) {
        // ignore
      }
    }

    // 古いルームを自動削除（バックグラウンドで実行、失敗しても無視）
    try {
      cleanupOldRooms();
    } catch (eCleanup) {
      // ignore
    }

    // おえかきバトル: 共有リンク/QR(#gkey=...)からGeminiキーを取り込む
    try {
      importGeminiKeyFromHash();
    } catch (eGkImport) {
      // ignore
    }

    // キーをDBと同期（PWA等の別ストレージ環境でも自動復元、保有端末からは自動バックアップ）
    try {
      ensureGeminiKeyLoaded()
        .then(function (k) {
          if (k) return syncGeminiKeyToDb(k);
          return null;
        })
        .catch(function () {
          // ignore
        });
    } catch (eGkSync) {
      // ignore
    }

    try {
      route();
    } catch (e3) {
      try {
        if (typeof console !== 'undefined' && console && console.error) console.error('route failed', e3);
      } catch (e4) {
        // ignore
      }
      var v2 = document.getElementById('view');
      if (v2) {
        v2.innerHTML =
          '<div class="stack"><div class="badge">エラー</div><div class="big">表示できません</div><div class="muted">詳細: ' +
          escapeHtml((e3 && e3.message) || String(e3)) +
          '</div></div>';
      }
    }
  } catch (e) {
    try {
      if (typeof console !== 'undefined' && console && console.error) console.error('boot failed', e);
    } catch (e5) {
      // ignore
    }
    var el = document.getElementById('view');
    if (el) {
      el.innerHTML =
        '<div class="stack"><div class="badge">エラー</div><div class="big">起動できません</div><div class="muted">この端末のブラウザが古い可能性があります。</div><div class="muted">詳細: ' +
        escapeHtml((e && e.message) || String(e)) +
        '</div></div>';
    }
  }
})();
