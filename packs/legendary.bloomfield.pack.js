/* legendary.bloomfield.pack.js
 * Map pack: 45 individually-hosted WAVs on GitHub. Each is its own note,
 * chromatic, starting at E2 (MIDI 40) for file 001.
 *
 * MEMORY-SAFE DESIGN (fixes a startup OOM crash from an earlier version):
 *  - At page load, only the WAV headers are read (44 bytes worth of info)
 *    to compute durations for the note map. No audio is decoded yet, so
 *    startup cost is tiny even though there are 45 files.
 *  - Raw bytes ARE cached in IndexedDB at this stage (cheap, no decode).
 *  - The pack shows up immediately as ONE entry, "45 notes", zero
 *    heavy work done automatically.
 *  - The actual decode + concatenate into one buffer only happens the
 *    FIRST TIME you click LOAD on this pack, and does so one file at a
 *    time (not all 45 in memory simultaneously) to keep peak memory low.
 *  - After that first LOAD, the merged blob URL is cached in memory for
 *    the rest of the session, so subsequent LOADs are instant.
 */
(function(){
  var BASE = 'https://cdn.jsdelivr.net/gh/trickishxsham/samplepacks@main/legendary.bloomfield/';
  var COUNT = 45;
  var BASE_MIDI = 40; // E2 — file 001 maps here, ascending chromatically
  var PACK_VERSION = 1; // bump if you replace the WAVs on GitHub, forces re-fetch
  var DB_NAME = 'improvs2_samplepacks';
  var STORE = 'wavs';
  var PACK_ID = 'legendary.bloomfield';

  function pad3(n){ return String(n).padStart(3,'0'); }
  function cacheKey(i){ return PACK_ID+'.v'+PACK_VERSION+'.'+pad3(i); }

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
  function fetchOneCached(i){
    var key = cacheKey(i);
    return dbGet(key).then(function(cached){
      if(cached) return cached;
      var url = BASE + PACK_ID + '.' + pad3(i) + '.wav';
      return fetch(url).then(function(r){
        if(!r.ok) throw new Error('http '+r.status);
        return r.arrayBuffer();
      }).then(function(ab){ dbSet(key, ab); return ab; });
    });
  }

  // --- Parse just enough of a WAV header to get duration, no decode needed ---
  function parseWavHeader(ab){
    var view = new DataView(ab);
    var numChannels = view.getUint16(22, true);
    var sampleRate = view.getUint32(24, true);
    var bitsPerSample = view.getUint16(34, true);
    // find 'data' chunk (may not always be at byte 36 if extra fmt fields exist)
    var offset = 12;
    var dataSize = ab.byteLength - 44;
    while(offset < ab.byteLength - 8){
      var id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
      var size = view.getUint32(offset+4, true);
      if(id === 'data'){ dataSize = size; break; }
      offset += 8 + size + (size % 2);
    }
    var bytesPerSample = bitsPerSample/8;
    var frameCount = dataSize / (bytesPerSample * numChannels);
    var duration = frameCount / sampleRate;
    return { numChannels: numChannels, sampleRate: sampleRate, duration: duration };
  }

  // --- Minimal 16-bit PCM WAV encoder ---
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

  var packEntry = null;
  var builtWavUrl = null;
  var building = false;

  // --- Cheap startup pass: headers only, no AudioContext, no decode ---
  async function registerLightweight(){
    var map = [], t = 0;
    for(var i=1; i<=COUNT; i++){
      try{
        var ab = await fetchOneCached(i);
        var info = parseWavHeader(ab);
        map.push({ rootMidi: BASE_MIDI+(i-1), start: +t.toFixed(3), end: +(t+info.duration).toFixed(3), loop:false });
        t += info.duration;
      }catch(e){ /* skip a bad/missing file */ }
    }
    if(!map.length) return;
    packEntry = { id: PACK_ID, name: 'Legendary Bloomfield', aRef: 440, map: map };
    registerSamplePack(packEntry);
  }

  // --- Heavy pass: sequential decode + merge, only runs once, on demand ---
  async function buildMergedAudio(onProgress){
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = new AC();

    // pass 1: decode each sequentially just to get exact per-file duration/format
    var durations = [], numChan = 2, sampleRate = 44100;
    for(var i=1; i<=COUNT; i++){
      try{
        var ab = await fetchOneCached(i);
        var buf = await ac.decodeAudioData(ab.slice(0));
        durations.push(buf.duration);
        numChan = Math.max(numChan, buf.numberOfChannels);
        sampleRate = buf.sampleRate;
      }catch(e){ durations.push(0); }
      if(onProgress) onProgress(i, COUNT);
    }
    var total = durations.reduce(function(a,b){return a+b;}, 0);
    var merged = ac.createBuffer(numChan, Math.ceil(total*sampleRate), sampleRate);

    // pass 2: decode again one at a time, write straight into merged buffer, discard immediately
    var writeOffset = 0;
    for(var i=1; i<=COUNT; i++){
      try{
        var ab2 = await fetchOneCached(i);
        var buf2 = await ac.decodeAudioData(ab2.slice(0));
        for(var c=0; c<numChan; c++){
          var src = buf2.getChannelData(Math.min(c, buf2.numberOfChannels-1));
          merged.getChannelData(c).set(src, writeOffset);
        }
        writeOffset += buf2.length;
      }catch(e){ /* skip */ }
    }

    var blob = bufferToWav(merged);
    return URL.createObjectURL(blob);
  }

  // --- Intercept LOAD click for this pack, build lazily on first click ---
  document.addEventListener('click', function(e){
    var target = e.target.closest && e.target.closest('[data-loadext="'+PACK_ID+'"]');
    if(!target) return;
    if(builtWavUrl){ packEntry.wavUrl = builtWavUrl; return; } // already built — let normal handler run
    if(building){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    building = true;
    var st = document.getElementById('sampStatus');
    if(st) st.textContent = 'building Legendary Bloomfield (first load only)…';
    buildMergedAudio(function(done, total){
      if(st) st.textContent = 'building Legendary Bloomfield… '+done+'/'+total;
    }).then(function(url){
      builtWavUrl = url;
      packEntry.wavUrl = url;
      building = false;
      target.click(); // re-dispatch — this time builtWavUrl is set, falls through to normal handler
    }).catch(function(err){
      building = false;
      if(st) st.textContent = 'Legendary Bloomfield build failed: '+(err&&err.message||'').slice(0,40);
    });
  }, true); // capture phase — runs before the app's own bubble-phase LOAD handler

  registerLightweight();
})();
