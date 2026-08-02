/* legendary.bloomfield.pack.js
 * Registers 45 pre-cut one-shot WAVs as a single pack, matching the
 * app's existing registerSamplePack() convention (see app-732.html ~line 65).
 * Each WAV is its own "note" in the map, triggered as a one-shot (loop:false)
 * rather than pitch-mapped across a keyboard range.
 *
 * Host this file (and the 45 WAVs it references) at:
 *   https://cdn.jsdelivr.net/gh/trickishxsham/samplepacks@main/legendary.bloomfield.pack.js
 *   https://cdn.jsdelivr.net/gh/trickishxsham/samplepacks@main/legendary.bloomfield/legendary.bloomfield.NNN.wav
 *
 * NOTE: this fetches each wav at registration time and inlines it as base64,
 * matching what registerSamplePack expects (audioB64). If you'd rather ship
 * pure base64 with zero runtime fetches (fully offline-safe like your other
 * packs), run this once locally, capture the resulting object, and paste the
 * base64 strings directly into a static registerSamplePack({...}) call instead.
 */
(function(){
  var BASE = 'https://cdn.jsdelivr.net/gh/trickishxsham/samplepacks@main/legendary.bloomfield/';
  var COUNT = 45;

  function pad3(n){ return String(n).padStart(3,'0'); }

  function toBase64(arrayBuffer){
    var bytes = new Uint8Array(arrayBuffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function buildMapAndRegister(){
    var map = [];
    var audioB64 = null; // single-blob convention needs ONE buffer; see note below

    // Since registerSamplePack's map assumes one shared audio buffer sliced by
    // start/end times, and these are 45 SEPARATE files, we instead register
    // each file as its OWN mini-pack sharing one id prefix. This keeps them
    // fully compatible with the existing pack list UI without touching app.html.
    for (var i = 1; i <= COUNT; i++){
      (function(i){
        var url = BASE + 'legendary.bloomfield.' + pad3(i) + '.wav';
        fetch(url).then(function(r){ return r.arrayBuffer(); }).then(function(buf){
          var b64 = toBase64(buf);
          registerSamplePack({
            id: 'legendary.bloomfield.' + pad3(i),
            name: 'Legendary Bloomfield ' + pad3(i),
            aRef: 440,
            map: [{ rootMidi: 64, start: 0, end: 999, loop: false }], // one-shot, full file
            audioB64: b64
          });
        }).catch(function(){ /* skip missing/broken file, stay offline-safe */ });
      })(i);
    }
  }

  buildMapAndRegister();
})();
