/* legendary.bloomfield.pack.js
 * Map pack: 45 individually-hosted WAVs on GitHub, referenced by URL.
 * Each is its own note, chromatic, starting at E2 (MIDI 40) for file 001.
 *
 * Caching: raw bytes for each of the 45 files are stored in IndexedDB after
 * the FIRST successful fetch. Every load after that — including reopening
 * the app or upgrading to a new app-NNN build — reads from IndexedDB and
 * makes ZERO network requests. Bump PACK_VERSION below if you ever replace
 * the underlying WAV files and need to force a re-fetch.
 */
(function(){
  var BASE = 'https://cdn.jsdelivr.net/gh/trickishxsham/samplepacks@main/legendary.bloomfield/';
  var COUNT = 45;
  var BASE_MIDI = 40; // E2 — file 001 maps here, ascending chromatically
  var PACK_VERSION = 1; // bump this if you replace the WAVs on GitHub
  var DB_NAME = 'improvs2_samplepacks';
  var STORE = 'wavs';

  function pad3(n){ return String(n).padStart(3,'0'); }
  function cacheKey(i){ return 'legendary.bloomfield.v'+PACK_VERSION+'.'+pad3(i); }

  function openDb(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore(STORE); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }
  function dbGet(key){
    return openDb().then(function(db){
      return new Promise(function(resolve){
        var tx = db.transaction(STORE,'readonly');
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function(){ resolve(r.result || null); };
        r.onerror = function(){ resolve(null); };
      });
    });
  }
  function dbSet(key, arrayBuffer){
    return openDb().then(function(db){
      return new Promise(function(resolve){
        var tx = db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(arrayBuffer, key);
        tx.oncomplete = function(){ resolve(true); };
        tx.onerror = function(){ resolve(false); };
      });
    });
  }

  // fetch one file — IndexedDB cache first, network only on a cache miss
  function fetchOne(i){
    var key = cacheKey(i);
    return dbGet(key).then(function(cached){
      if(cached) return cached;
      var url = BASE + 'legendary.bloomfield.' + pad3(i) + '.wav';
      return fetch(url).then(function(r){
        if(!r.ok) throw new Error('http '+r.status);
        return r.arrayBuffer();
      }).then(function(ab){
        dbSet(key, ab); // fire-and-forget cache write
        return ab;
      });
    });
  }

  // --- Minimal 16-bit PCM WAV encoder (mirrors app's own export format) ---
  function bufferToWav(buffer){
    var numChan = buffer.numberOfChannels, sampleRate = buffer.sampleRate;
    var bytesPerSample = 2, blockAlign = numChan * bytesPerSample;
    var dataLength = buffer.length * blockAlign;
    var ab = new ArrayBuffer(44 + dataLength);
    var view = new DataView(ab);
    function writeStr(o,s){ for(var i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); }
    writeStr(0,'RIFF'); view.setUint32(4, 36+dataLength, true); writeStr(8,'WAVE');
    writeStr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,numChan,true); view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*blockAlign,true); view.setUint16(32,blockAlign,true);
    view.setUint16(34,16,true); writeStr(36,'data'); view.setUint32(40,dataLength,true);
    var chans = []; for(var c=0;c<numChan;c++) chans.push(buffer.getChannelData(c));
    var off = 44;
    for(var i=0;i<buffer.length;i++){
      for(var c=0;c<numChan;c++){
        var s = Math.max(-1, Math.min(1, chans[c][i]));
        s = s < 0 ? s*0x8000 : s*0x7FFF;
        view.setInt16(off, s, true); off += 2;
      }
    }
    return new Blob([ab], { type:'audio/wav' });
  }

  async function build(){
    try{
      var AC = window.AudioContext || window.webkitAudioContext;
      var ac = new AC();

      // fetch (IndexedDB cache-first) + decode all 45, in order
      var buffers = new Array(COUNT);
      await Promise.all(Array.from({length:COUNT}, function(_,idx){
        var i = idx+1;
        return fetchOne(i)
          .then(function(ab){ return ac.decodeAudioData(ab.slice(0)); })
          .then(function(buf){ buffers[idx] = buf; })
          .catch(function(e){ buffers[idx] = null; /* skip a bad/missing file */ });
      }));

      // build map + total length, skipping any that failed
      var map = [], t = 0, numChan = 2, sampleRate = 44100;
      for(var idx=0; idx<COUNT; idx++){
        var buf = buffers[idx]; if(!buf) continue;
        numChan = Math.max(numChan, buf.numberOfChannels);
        sampleRate = buf.sampleRate;
        map.push({ rootMidi: BASE_MIDI+idx, start: +t.toFixed(3), end: +(t+buf.duration).toFixed(3), loop:false });
        t += buf.duration;
      }
      if(!map.length) return; // nothing loaded, bail silently

      // concatenate into one merged AudioBuffer
      var merged = ac.createBuffer(numChan, Math.ceil(t*sampleRate), sampleRate);
      var writeOffset = 0;
      for(var idx=0; idx<COUNT; idx++){
        var buf = buffers[idx]; if(!buf) continue;
        for(var c=0; c<numChan; c++){
          var src = buf.getChannelData(Math.min(c, buf.numberOfChannels-1));
          merged.getChannelData(c).set(src, writeOffset);
        }
        writeOffset += buf.length;
      }

      var blob = bufferToWav(merged);
      var blobUrl = URL.createObjectURL(blob);

      registerSamplePack({
        id: 'legendary.bloomfield',
        name: 'Legendary Bloomfield',
        aRef: 440,
        map: map,
        wavUrl: blobUrl
      });
    }catch(e){ /* fail silent — offline-safe, matches app convention */ }
  }

  build();
})();
