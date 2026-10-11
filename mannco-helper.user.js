// ==UserScript==
// @name         Mannco Helper
// @namespace    https://mannco.store/
// @version      1.7
// @description  Mannco.store helper for TF2: prices in keys (editable key price) and backpack.tf buttons (stats with unusual effect, item history).
// @homepageURL  https://github.com/KozakNewton/mannco-helper
// @supportURL   https://github.com/KozakNewton/mannco-helper/issues
// @updateURL    https://raw.githubusercontent.com/KozakNewton/mannco-helper/main/mannco-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/KozakNewton/mannco-helper/main/mannco-helper.user.js
// @match        https://mannco.store/*
// @match        https://*.mannco.store/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULT_KEY_PRICE = 2.20; // USD – uprav si v panelu na stránce
  // celý textový uzel je cena: "$46.93", "$ 7,600.00", "US$12.00" (\s zahrnuje i nbsp)
  const PRICE_RE = /^\s*(?:US)?\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*$/;
  const NUM_RE = /^\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*$/;

  let keyPrice = parseFloat(GM_getValue('keyPrice', DEFAULT_KEY_PRICE));
  if (!(keyPrice > 0)) keyPrice = DEFAULT_KEY_PRICE;

  console.log('[mannco-keys] script loaded, key price = $' + keyPrice);

  // ---------- styl štítků (globální) ----------
  const style = document.createElement('style');
  style.textContent = `
    .mk-keys {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 193, 7, 0.18);
      color: #ffc107;
      font-size: 0.85em;
      font-weight: 600;
      white-space: nowrap;
    }
    .mk-bp {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 5;
      padding: 1px 6px;
      background: rgba(20, 20, 26, 0.85);
      border: 1px solid #5a8dee;
      border-radius: 4px;
      color: #5a8dee;
      font-size: 0.8em;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
    }
    .mk-bp:hover { background: #5a8dee; color: #fff; }
  `;
  document.documentElement.appendChild(style);

  // ---------- panel (shadow DOM, připojený k <html>, aby ho stránka nesmazala) ----------
  const host = document.createElement('div');
  host.id = 'mk-host';
  host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .panel {
        background: #1e1e24; color: #eee; border: 1px solid #444; border-radius: 8px;
        padding: 8px 10px; font: 13px/1.3 sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.5);
        display: flex; align-items: center; gap: 6px;
      }
      input {
        width: 70px; padding: 3px 5px; background: #2b2b33; color: #fff;
        border: 1px solid #555; border-radius: 4px;
      }
      button {
        padding: 3px 9px; background: #ffc107; color: #000; border: 0;
        border-radius: 4px; cursor: pointer; font-weight: 600;
      }
      .ok { color: #6f6; opacity: 0; transition: opacity .3s; }
      .ok.show { opacity: 1; }
    </style>
    <div class="panel">
      <span>🔑 1 key = $</span>
      <input type="number" step="0.01" min="0.01" id="in">
      <button id="save">Save</button>
      <span class="ok" id="ok">✓</span>
    </div>
  `;
  const input = shadow.getElementById('in');
  const ok = shadow.getElementById('ok');
  input.value = keyPrice.toFixed(2);

  function save() {
    const v = parseFloat(String(input.value).replace(',', '.'));
    if (!(v > 0)) return;
    keyPrice = v;
    GM_setValue('keyPrice', v);
    updateAll();
    ok.classList.add('show');
    setTimeout(() => ok.classList.remove('show'), 1200);
  }
  shadow.getElementById('save').addEventListener('click', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  function ensurePanel() {
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (!style.isConnected) document.documentElement.appendChild(style);
  }

  // ---------- přepočet ----------
  function format(usd) {
    return (usd / keyPrice).toFixed(2) + ' keys';
  }

  function updateAll() {
    document.querySelectorAll('.mk-keys').forEach((el) => {
      el.textContent = format(parseFloat(el.dataset.usd));
    });
  }

  // ---------- which game does a price belong to? (keys only make sense for TF2 = appid 440) ----------
  const PATH_GAMES = [
    [/^\/(?:tf2|tf)(?:\/|$)/, '440'],
    [/^\/(?:cs2|csgo)(?:\/|$)/, '730'],
    [/^\/rust(?:\/|$)/, '252490'],
    [/^\/dota(?:2)?(?:\/|$)/, '570'],
  ];

  // home page sections: "Latest Counter Strike 2 skins", "Latest Team Fortress 2 skins" ...
  const GAME_NAME_RE = [
    [/counter[\s-]*strike|\bcs\s?2\b|\bcs:?go\b/i, '730'],
    [/team\s*fortress|\btf\s?2\b/i, '440'],
    [/\brust\b/i, '252490'],
    [/\bdota\b/i, '570'],
  ];
  let homeHeadings = [];
  const isHome = () => location.pathname === '/';

  function findHomeHeadings() {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t || t.length > 60) continue;
      const el = n.parentElement;
      if (!el || el.closest('.mk-keys, .mk-bp, script, style, nav, header, footer')) continue;
      const a = el.closest('a');
      const isHeading = el.closest('h1,h2,h3,h4,h5,h6,[role="heading"]') ||
        (a && /^(?:https?:\/\/[^/]+)?\/(?:cs2|csgo|tf2|rust|dota)\/?$/i.test(a.getAttribute('href') || ''));
      if (!isHeading) continue;
      for (const [re, id] of GAME_NAME_RE) {
        if (re.test(t)) { out.push({ el, id }); break; }
      }
    }
    return out;
  }

  function hasMultiplePrices(el) {
    let count = 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue;
      if (t.length <= 25 && PRICE_RE.test(t) && ++count > 1) return true;
    }
    return false;
  }

  function gameIdFor(node) {
    const start = node.nodeType === 1 ? node : node.parentElement;
    if (!start) return null;
    const idOf = (a) => {
      const m = /\/item\/(\d+)-/.exec(a.getAttribute('href') || '');
      return m ? m[1] : null;
    };
    // 1) the price sits inside an item link  (/item/440-..., /item/730-...)
    const own = start.closest('a[href*="/item/"]');
    if (own && idOf(own)) return idOf(own);
    // 2) the card contains item link(s) next to the price (all of the same game)
    let el = start;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      if (hasMultiplePrices(el)) break;   // this is already a container of several cards
      const ids = new Set();
      el.querySelectorAll('a[href*="/item/"]').forEach((a) => {
        const id = idOf(a);
        if (id) ids.add(id);
      });
      if (ids.size === 1) return [...ids][0];
      if (ids.size > 1) break;
      el = el.parentElement;
    }
    // 3) home page: the nearest section heading above the price
    if (homeHeadings.length) {
      let g = null;
      for (const h of homeHeadings) {
        if (node.compareDocumentPosition(h.el) & Node.DOCUMENT_POSITION_PRECEDING) g = h.id;
      }
      if (g) return g;
    }
    // 4) the page itself belongs to one game
    const m = /^\/item\/(\d+)-/.exec(location.pathname);
    if (m) return m[1];
    for (const [re, id] of PATH_GAMES) if (re.test(location.pathname)) return id;
    return null;
  }

  // keys are shown for TF2 only; where the game is unknown they are shown too (cart, balance ...),
  // except on the home page, where everything must be positively identified as TF2
  const isTf2OrUnknown = (node) => {
    const g = gameIdFor(node);
    if (!g) return !isHome();
    return g === '440';
  };

  function parseUsd(intPart, decPart) {
    return parseFloat(intPart.replace(/,/g, '') + (decPart || ''));
  }

  function attach(anchorNode, usd) {
    const next = anchorNode.nextSibling;
    if (next && next.nodeType === 1 && next.classList.contains('mk-keys')) {
      // už existuje – jen aktualizuj, pokud se cena změnila
      if (parseFloat(next.dataset.usd) !== usd) {
        next.dataset.usd = usd;
        next.textContent = format(usd);
      }
      return;
    }
    const span = document.createElement('span');
    span.className = 'mk-keys';
    span.dataset.usd = usd;
    span.textContent = format(usd);
    anchorNode.parentNode.insertBefore(span, anchorNode.nextSibling);

  }

  // backpack.tf button in the top-left corner of every item card
  function ensureBp(card) {
    if (card.querySelector(':scope > .mk-bp')) return;
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    const bp = document.createElement('span');
    bp.className = 'mk-bp';
    bp.textContent = 'BP';
    bp.title = 'Open on backpack.tf';
    bp.addEventListener('click', (e) => {
      e.preventDefault();   // the card itself is a link to Mannco
      e.stopPropagation();
      const url = buildBackpackUrl(card);
      console.log('[mannco-keys] BP click:', parseCard(card), '->', url);
      if (url) window.open(url, '_blank', 'noopener');
    });
    card.appendChild(bp);
  }

  // ---------- backpack.tf ----------
  const QUALITY_PREFIXES = ['Unusual', 'Strange', 'Vintage', 'Genuine', "Collector's", 'Haunted', 'Self-Made', 'Community', 'Valve'];

  // Unusual effect name -> backpack.tf particle ID (source: schema.autobot.tf, generated 2026-10-03)
  const EFFECT_DATA = `1 Particle 1|2 Flying Bits|3 Nemesis Burst|4 Community Sparkle|5 Holy Glow|6 Green Confetti|7 Purple Confetti|8 Haunted Ghosts|9 Green Energy|10 Purple Energy|11 Circling TF Logo|12 Massed Flies|13 Burning Flames|14 Scorching Flames|15 Searing Plasma|16 Vivid Plasma|17 Sunbeams|18 Circling Peace Sign|19 Circling Heart|20 Map Stamps|28 Genteel Smoke|29 Stormy Storm|30 Blizzardy Storm|31 Nuts n' Bolts|32 Orbiting Planets|33 Orbiting Fire|34 Bubbling|35 Smoking|36 Steaming|37 Flaming Lantern|38 Cloudy Moon|39 Cauldron Bubbles|40 Eerie Orbiting Fire|43 Knifestorm|44 Misty Skull|45 Harvest Moon|46 It's a Secret to Everybody|47 Stormy 13th Hour|56 Kill-a-Watt|57 Terror-Watt|58 Cloud 9|59 Aces High|60 Dead Presidents|61 Miami Nights|62 Disco Beat Down|63 Phosphorous|64 Sulphurous|65 Memory Leak|66 Overclocked|67 Electrostatic|68 Power Surge|69 Anti-Freeze|70 Time Warp|71 Green Black Hole|72 Roboactive|73 Arcana|74 Spellbound|75 Chiroptera Venenata|76 Poisoned Shadows|77 Something Burning This Way Comes|78 Hellfire|79 Darkblaze|80 Demonflame|81 Bonzo the All-Gnawing|82 Amaranthine|83 Stare from Beyond|84 The Ooze|85 Ghastly Ghosts Jr|86 Haunted Phantasm Jr|87 Frostbite|88 Molten Mallard|89 Morning Glory|90 Death at Dusk|91 Abduction|92 Atomic|93 Subatomic|94 Electric Hat Protector|95 Magnetic Hat Protector|96 Voltaic Hat Protector|97 Galactic Codex|98 Ancient Codex|99 Nebula|100 Death by Disco|101 It's a Mystery to Everyone|102 It's a Puzzle to Me|103 Ether Trail|104 Nether Trail|105 Ancient Eldritch|106 Eldritch Flame|107 Neutron Star|108 Tesla Coil|109 Starstorm Insomnia|110 Starstorm Slumber|111 Brain Drain|112 Open Mind|113 Head of Steam|114 Galactic Gateway|115 The Eldritch Opening|116 The Dark Doorway|117 Ring of Fire|118 Vicious Circle|119 White Lightning|120 Omniscient Orb|121 Clairvoyance|122 Fifth Dimension|123 Vicious Vortex|124 Menacing Miasma|125 Abyssal Aura|126 Wicked Wood|127 Ghastly Grove|128 Mystical Medley|129 Ethereal Essence|130 Twisted Radiance|131 Violet Vortex|132 Verdant Vortex|133 Valiant Vortex|134 Sparkling Lights|135 Frozen Icefall|136 Fragmented Gluons|137 Fragmented Quarks|138 Fragmented Photons|139 Defragmenting Reality|141 Fragmenting Reality|142 Refragmenting Reality|143 Snowfallen|144 Snowblinded|145 Pyroland Daydream|147 Verdatica|148 Aromatica|149 Chromatica|150 Prismatica|151 Bee Swarm|152 Frisky Fireflies|153 Smoldering Spirits|154 Wandering Wisps|155 Kaleidoscope|156 Green Giggler|157 Laugh-O-Lantern|158 Plum Prankster|159 Pyroland Nightmare|160 Gravelly Ghoul|161 Vexed Volcanics|162 Gourdian Angel|163 Pumpkin Party|164 Frozen Fractals|165 Lavender Landfall|166 Special Snowfall|167 Divine Desire|168 Distant Dream|169 Violent Wintertide|170 Blighted Snowstorm|171 Pale Nimbus|172 Genus Plasmos|173 Serenus Lumen|174 Ventum Maris|175 Mirthful Mistletoe|177 Resonation|178 Aggradation|179 Lucidation|180 Stunning|181 Ardentum Saturnalis|182 Fragrancium Elementalis|183 Reverium Irregularis|185 Perennial Petals|186 Flavorsome Sunset|187 Raspberry Bloom|188 Iridescence|189 Tempered Thorns|190 Devilish Diablo|191 Severed Serration|192 Shrieking Shades|193 Restless Wraiths|195 Infernal Wraith|196 Phantom Crown|197 Ancient Specter|198 Viridescent Peeper|199 Eyes of Molten|200 Ominous Stare|201 Pumpkin Moon|202 Frantic Spooker|203 Frightened Poltergeist|204 Energetic Haunter|205 Smissmas Tree|206 Hospitable Festivity|207 Condescending Embrace|209 Sparkling Spruce|210 Glittering Juniper|211 Prismatic Pine|212 Spiraling Lights|213 Twisting Lights|214 Stardust Pathway|215 Flurry Rush|216 Spark of Smissmas|218 Polar Forecast|219 Shining Stag|220 Holiday Horns|221 Ardent Antlers|223 Festive Lights|224 Crustacean Sensation|226 Frosted Decadence|228 Sprinkled Delights|229 Terrestrial Favor|230 Tropical Thrill|231 Flourishing Passion|232 Dazzling Fireworks|233 Blazing Fireworks|234 Shimmering Fireworks|235 Twinkling Fireworks|236 Sparkling Fireworks|237 Glowing Fireworks|238 Glimmering Fireworks|239 Flying Lights|241 Limelight|242 Shining Star|243 Cold Cosmos|244 Refracting Fractals|245 Startrance|247 Starlush|248 Starfire|249 Stardust|250 Contagious Eruption|251 Daydream Eruption|252 Volcanic Eruption|253 Divine Sunlight|254 Audiophile|255 Soundwave|256 Synesthesia|257 Haunted Kraken|258 Eerie Kraken|259 Soulful Slice|260 Horsemann's Hack|261 Haunted Forever!|263 Forever and Forever!|264 Cursed Forever!|265 Moth Plague|266 Malevolent Monoculi|267 Haunted Wick|269 Wicked Wick|270 Spectral Wick|271 Musical Maelstrom|272 Verdant Virtuoso|273 Silver Serenade|274 Cosmic Constellations|276 Dazzling Constellations|277 Tainted Frost|278 Starlight Haze|279 Hard Carry|281 Jellyfish Field|283 Jellyfish Hunter|284 Jellyfish Jam|285 Global Clusters|286 Celestial Starburst|287 Sylicone Succiduous|288 Sakura Smoke Bomb|289 Treasure Trove|290 Bubble Breeze|291 Fireflies|292 Mountain Halo|293 Celestial Summit|294 Stellar Ascent|295 Sapped|297 Hellspawned Horns|299 Demonic Impaler|300 Revenant's Rack|301 Sixth Sense|303 Amygdala|304 The Bone Zone|305 Arachne's Web|306 Acidic Climate|307 Otherworldly Weather|308 Nightmarish Storm|309 Icestruck|311 Goldstruck|312 Radiant Rivalry|314 Radiant Legacy|315 Frosty Flavours|317 Mint Frost|318 North Star|320 Prettiest Star|321 Festive Falling Star|322 Lunar Lights|324 Fairy Lights|325 Natural Lights|327 Loyalist's Coronet|329 Knight's Prideful Spirit|330 Baron's Cherished Chaplet|331 Lure of the Deep|333 Violent Viridian|334 Magenta Monstrum|335 Rainbow Reverie|336 Cuban Smoke|337 Melting Mohawk|339 Scorched Scalp|340 Ignited Crest|341 Rare Shine|342 Distant Drift|344 Warp Drive|345 Overdrive|346 Butterfly Season|348 Psycho-Delic|349 Bewitching Bugs|350 Spectral Fire|351 Galactic Flame|352 Revived Recharge|353 Undead Electricity|354 Frankencharged|355 Phantom Plague|356 Haunting Haze|357 Vicious Vampires|358 Ravenous Ravens|359 Delightful Doves|360 Searing Stove|362 Über Blaze|364 Sizzling|365 Crystal Crown|367 Halcyon Halo|368 Ghosts of Smissmas Time|369 Aurora Skies|370 Shining Bokeh|371 Playful Aurora|372 Frisky Morning|373 Drunkard|374 Blades of Betrayal|376 Death's Daggers|377 Fully Charged|379 Overcharged|380 Piercing Headache|381 Decimating Wind|382 Ocean Swirl|384 Toxic Swirl|385 Candle Flame|387 Sizzling Aroma|389 Toxic Aroma|390 Current Conductor|392 Sandy|393 Chromatic Blaze|394 Frostfire|395 Spectrum Inferno|396 Calm Snowfall|397 Team Recognition|399 Old Hire|401 Analog Fortress|402 Winter Whiteout|403 Midnight Frostfall|404 Twilight Snowfall|405 Cryogenic|407 Umbral Lights|408 Polar Prism|409 Solar Singed|410 Floral Growth|412 Stellar Orbit|413 Blissful Butterflies|415 Wispful Wings|416 Flor de Muerto|418 Autumn Breeze|419 Spirit Swirl|420 Ghost Swirl|421 Fable Feathers|423 Fable Quills|424 Grudge n' Drudge|425 Boil n' Toil|426 Screaming Soul|427 Screeching Soul|428 Shrieking Soul|701 Hot|702 Isotope|703 Cool|704 Energy Orb|3001 Showstopper|3003 Holy Grail|3004 '72|3005 Fountain of Delight|3006 Screaming Tiger|3007 Skill Gotten Gains|3008 Midnight Whirlwind|3009 Silver Cyclone|3010 Mega Strike|3011 Haunted Phantasm|3012 Ghastly Ghosts|3013 Hellish Inferno|3014 Spectral Swirl|3015 Infernal Flames|3016 Infernal Smoke|3017 Acidic Bubbles of Envy|3018 Flammable Bubbles of Attraction|3019 Poisonous Bubbles of Regret|3020 Roaring Rockets|3021 Spooky Night|3022 Ominous Night|3023 Bewitched|3024 Accursed|3025 Enchanted|3026 Static Mist|3027 Eerie Lightning|3028 Terrifying Thunder|3029 Jarate Shock|3030 Nether Void|3031 Good-Hearted Goodies|3032 Wintery Wisp|3033 Arctic Aurora|3034 Winter Spirit|3035 Festive Spirit|3036 Magical Spirit|3037 Spectral Escort|3038 Astral Presence|3039 Arcane Assistance|3041 Emerald Allurement|3042 Pyrophoric Personality|3043 Spellbound Aspect|3044 Static Shock|3045 Veno Shock|3046 Toxic Terrors|3047 Arachnid Assault|3048 Creepy Crawlies|3049 Delightful Star|3050 Frosted Star|3051 Apotheosis|3052 Ascension|3053 Reindoonicorn Rancher|3055 Twinkling Lights|3056 Shimmering Lights|3059 Spectral Shackles|3060 Cursed Confinement|3061 Cavalier de Carte|3063 Hollow Flourish|3064 Magic Shuffle|3065 Vigorous Pulse|3066 Thundering Spirit|3067 Galvanic Defiance|3068 Wispy Halos|3069 Nether Wisps|3070 Aurora Borealis|3071 Aurora Australis|3072 Aurora Polaris|3073 Amethyst Winds|3074 Golden Gusts|3075 Smissmas Swirls|3077 Minty Cypress|3078 Pristine Pine|3079 Sparkly Spruce|3081 Festive Fever|3083 Golden Glimmer|3084 Frosty Silver|3085 Glamorous Dazzle|3087 Sublime Snowstorm|3088 Marigold Ritual|3090 Pungent Poison|3091 Blazed Brew|3092 Mysterious Mixture|3093 Linguistic Deviation|3094 Aurelian Seal|3095 Runic Imprisonment|3097 Prismatic Haze|3098 Rising Ritual|3100 Bloody Grip|3102 Toxic Grip|3103 Infernal Grip|3104 Death Grip|3105 Charged Arcane|3106 Thunderous Rage|3107 Convulsive Fiery|3108 Festivized Formation|3110 Twirling Spirits|3111 Squash n' Twist|3112 Midnight Sparklers|3113 Boundless Blizzard|3114 Solar Scorched|3115 Deepsea Rave|3117 Blooming Beacon|3118 Beaming Beacon|3119 Blazing Beacon|3120 Floppin' Frenzy|3121 Pastel Trance|3123 Wildflower Meadows|3124 Deep-Sea Devourer|3125 Eldritch Horror|3126 Autumn Leaves|3127 Dead Man's Party|3128 Potion Explosion|3129 Haunted Cremation|3130 Cremation|3131 Snowfall|3132 Galactic Connection|3134 Dark Twilight|3135 Eldritch Rift|3136 Selfless Sensation|3137 Distant Desire|3138 Glamorous Glance|3139 Permafrost Essence|3141 Arctic Delight|3142 Winning Spirit|3143 Petal Prance|3145 Dragonflies' Embrace|3147 Dragonflies' Nature|3148 Dragonflies' Lucent|3149 Electrocution|3151 Distress Signal|3153 Carioca's Call|3154 Fiesta Royale|3156 Grand Jubilee|3157 Elemental|3159 Godlike|3160 Teamwork Valorance|3162 Legacy Logo|3163 Desert Wind|3164 Monsoon Season|3165 Bountiful Riches|3167 Luxurious Lover|3168 Amatory|3170 Electrum|3171 Sakura Blessings|3173 Violent Violets|3174 Power Pressure|3176 Magnifying Momentum|3177 Charging Catalyst|3178 Amplifying Aura|3179 Mystic Fusion|3180 Obnoxious Confetti|3181 Lovable Confetti|3182 Confetti Celebration|3183 Heavy Rain|3184 Pumpkin Patch|3185 Snowy Day|3186 Snowy Spirit|3188 Lavender Sensation|3189 Verdant Phenomenon|3190 Award Winning|3192 Operatic Triumph|3193 Tangled Lights|3194 Seamine|3196 Iconic Outline|3198 Subtle Silhouette|3199 Ocean Reef|3200 Lost Signal|3201 Summer Wave|3202 Shark Attack|3203 Hazardous Gas|3204 Phantasmal Fog|3205 Haunted Mist|3206 Split Malice|3208 Void Crawlers|3209 Fossil Fueled|3210 Tar Pit|3211 Morbidly Beast|3213 Snow Dome|3215 Scorching Sensation|3216 Burning Sensation|3217 Galactic Dust|3218 Galactic Cloud|3219 Aurora Aura|3221 Northern Nights|3222 Chilling Mist|3223 Circuit Break|3224 Wheat Field|3225 Luminous Drift|3227 Luminous Shift|3228 Showtime Spotlights|3229 Deep Dive|3230 Electric Impulse|3232 Primordial Ooze|3233 Geiger Breaker|3234 Sulfuric Acid|3235 Shroud of Darkness|3236 Gradient Gale|3238 Amethyst Gale|3239 Gamma Rays|3241 Meltdown|3242 Radioactive`;

  const normEffect = (s) =>
    String(s).toLowerCase().replace(/[\u2018\u2019`]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

  const EFFECT_IDS = {};
  EFFECT_DATA.split('|').forEach((entry) => {
    const i = entry.indexOf(' ');
    EFFECT_IDS[normEffect(entry.slice(i + 1))] = entry.slice(0, i);
  });

  // ---------- reading the item from a card ----------
  // unify unicode dashes / quotes / nbsp so names always match backpack.tf
  const normText = (s) => String(s || '')
    .replace(/[   ]/g, ' ')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // "Floral Growth Unusual Chief Executor" -> { effect: "Floral Growth", rest: "Unusual Chief Executor" }
  function splitEffect(post) {
    const tokens = post.split(' ');
    for (let k = Math.min(6, tokens.length); k >= 1; k--) {
      const cand = tokens.slice(0, k).join(' ');
      if (EFFECT_IDS[normEffect(cand)]) return { effect: cand, rest: tokens.slice(k).join(' ') };
    }
    return { effect: post, rest: '' };
  }

  function cardTexts(card) {
    const out = [];
    const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.parentElement.closest('.mk-keys, .mk-bp, .mk-hist, script, style')) continue;
      const t = normText(n.nodeValue);
      if (t) out.push(t);
    }
    card.querySelectorAll('img[alt]').forEach((img) => {
      const t = normText(img.alt);
      if (t) out.push(t);
    });
    return out;
  }

  // texts that are not part of the item name (prices, fees, quantity, discount ...)
  const UI_TEXT = /discount|quantity|set your price|after fees|\bfees?\b|\$|%|^[x×]\s*\d*$|^[\d.,\s]+$/i;

  function parseCard(card) {
    let effect = null;
    let starPending = false;
    const counts = new Map();
    const add = (s) => { s = normText(s); if (s) counts.set(s, (counts.get(s) || 0) + 1); };

    const handleStarText = (before, post) => {
      const sp = splitEffect(post);
      if (!effect && sp.effect) effect = sp.effect;
      add(before + ' ' + sp.rest);          // item name in the same text node (if any)
    };

    for (const t of cardTexts(card)) {
      if (starPending) {                    // "★" was alone in its own node, effect follows
        starPending = false;
        handleStarText('', t);
        continue;
      }
      const star = t.indexOf('★');
      if (star !== -1) {
        const post = t.slice(star + 1).trim();
        const before = t.slice(0, star).trim();
        if (!post) { starPending = true; add(before); continue; }
        handleStarText(before, post);
        continue;
      }
      if (UI_TEXT.test(t)) continue;
      add(t);
    }
    if (!counts.size) return { name: null, effect };
    // the name is usually repeated (image alt + title) -> most frequent, then longest
    const name = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    return { name, effect };
  }

  // ---------- backpack.tf stats URL ----------
  const WEAR_RE = /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle Scarred)\)\s*$/i;
  const WEAPONS = [
    'Scattergun', 'Pistol', 'Shotgun', 'Rocket Launcher', 'Bat', 'Flame Thrower', 'Fire Axe',
    'Grenade Launcher', 'Stickybomb Launcher', 'Bottle', 'Minigun', 'Fists', 'Medi Gun',
    'Syringe Gun', 'Bonesaw', 'Sniper Rifle', 'SMG', 'Kukri', 'Revolver', 'Knife', 'Wrench', 'Shovel',
  ].sort((a, b) => b.length - a.length);

  function buildBackpackUrl(card) {
    const info = parseCard(card);
    let name = info.name;
    if (!name) {
      console.warn('[mannco-keys] could not read item name from card', card);
      return null;
    }
    let craftable = 'Craftable';
    let quality = 'Unique';
    const found = [];
    let changed = true;
    while (changed) {
      changed = false;
      if (/^Uncraftable\s+/i.test(name)) {
        craftable = 'Non-Craftable';
        name = name.replace(/^Uncraftable\s+/i, '');
        changed = true;
      }
      for (const q of QUALITY_PREFIXES) {
        if (name.startsWith(q + ' ')) {
          found.push(q);
          name = name.slice(q.length + 1);
          changed = true;
          break;
        }
      }
    }
    if (found.includes('Unusual')) quality = 'Unusual';
    else if (found.length) quality = found[0];

    // killstreak kits: normalise the weapon-specific ones to the "Professional Killstreak <Weapon> Kit" form
    let km = /^(Professional |Specialized )?Killstreak Kit( Fabricator)?\s*[-:]?\s*(.+)$/i.exec(name);
    if (km && !/^Fabricator$/i.test(km[3])) {
      name = (km[1] || '') + 'Killstreak ' + km[3].trim() + ' Kit' + (km[2] || '');
    } else if ((km = /^(.+?) (Professional |Specialized )?Killstreak Kit( Fabricator)?$/i.exec(name)) &&
               !/^(Professional|Specialized)$/i.test(km[1])) {
      name = (km[2] || '') + 'Killstreak ' + km[1].trim() + ' Kit' + (km[3] || '');
    }

    // weapon skins / war paints: backpack.tf uses "Skin | Weapon (Wear)" with quality Decorated Weapon
    const wm = WEAR_RE.exec(name);
    if (wm) {
      const wear = wm[1].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace('Field-tested', 'Field-Tested').replace('Well-worn', 'Well-Worn');
      let base = name.replace(WEAR_RE, '').replace(/\b(?:Professional |Specialized )?Killstreak /i, '').trim();
      for (const wp of WEAPONS) {
        if (base.endsWith(' ' + wp)) {
          base = base.slice(0, -(wp.length + 1)) + ' | ' + wp;
          break;
        }
      }
      name = base + ' (' + wear + ')';
      if (quality !== 'Unusual') quality = 'Decorated Weapon';
    }

    let url = 'https://backpack.tf/stats/' + encodeURIComponent(quality) + '/' +
      encodeURIComponent(name) + '/Tradable/' + craftable;

    // Unusuals: add the effect ID so the link goes to that exact effect
    if (quality === 'Unusual') {
      const id = info.effect && EFFECT_IDS[normEffect(info.effect)];
      if (id) url += '/' + id;
      else console.warn('[mannco-keys] unknown unusual effect:', info.effect);
    }
    return url;
  }

  // ---------- backpack.tf item history button (Items list on item pages) ----------
  const HISTORY_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>';

  const ID_PATTERNS = [
    /440_2_(\d{5,})/,                              // steamcommunity.com/.../inventory#440_2_<assetid>
    /[?&]assetid=(\d{5,})/i,
    /asset[_-]?id["'=:\s]+(\d{5,})/i,              // data-assetid="123", "assetId": 123
    /tf_econ_item_preview[^"'<>]*?A(\d{5,})D/i,    // steam://rungame/440/.../+tf_econ_item_preview S..A<assetid>D..
    /A(\d{8,})D\d+/,
  ];

  function extractId(str) {
    if (!str) return null;
    for (const re of ID_PATTERNS) {
      const m = re.exec(str);
      if (m) return m[1];
    }
    return null;
  }

  // text nodes "View on Steam" -> outermost element that contains just that text (= the button)
  function findViewButtons(scope) {
    const out = [];
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeValue.trim().toLowerCase() !== 'view on steam') continue;
      let el = n.parentElement;
      if (!el || el.closest('.mk-hist')) continue;
      while (
        el.parentElement && el.parentElement !== document.body &&
        el.parentElement.textContent.trim().toLowerCase() === 'view on steam'
      ) el = el.parentElement;
      out.push(el);
    }
    return out;
  }

  function rowOf(el) {
    const row = el.closest('tr, [role="row"], li');
    if (row) return row;
    let node = el;
    for (let i = 0; i < 6 && node.parentElement && node.parentElement !== document.body; i++) {
      if (findViewButtons(node.parentElement).length > 1) break;
      node = node.parentElement;
    }
    return node;
  }

  // fallback: click the original "View on Steam" button with window.open hooked and read the URL
  function captureViaClick(btn) {
    return new Promise((resolve) => {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const orig = w.open;
      let captured = null;
      w.open = function (url) { captured = String(url || ''); return null; };
      try { btn.click(); } catch (e) { /* ignore */ }
      setTimeout(() => { w.open = orig; resolve(captured); }, 200);
    });
  }

  async function openHistory(histBtn) {
    const row = rowOf(histBtn);
    let id = extractId(row.outerHTML);
    if (!id) {
      const orig = findViewButtons(row)[0];
      if (orig && !orig.closest('a[href]')) id = extractId(await captureViaClick(orig));
    }
    if (!id) {
      console.warn('[mannco-keys] could not find the item ID in this row', row);
      const label = histBtn.__mkLabel;
      if (label) {
        const old = label.nodeValue;
        label.nodeValue = 'ID not found';
        setTimeout(() => { label.nodeValue = old; }, 2000);
      }
      return;
    }
    window.open('https://backpack.tf/item/' + id, '_blank', 'noopener');
  }

  function ensureHistoryButtons() {
    // only on TF2 item pages (/item/440-...), nowhere else (trades, inventory, other games)
    if (!/^\/item\/440-/.test(location.pathname)) {
      document.querySelectorAll('.mk-hist').forEach((b) => b.remove());
      return;
    }
    findViewButtons(document.body).forEach((orig) => {
      const parent = orig.parentElement;
      if (!parent || parent.querySelector(':scope > .mk-hist')) return;

      const clone = orig.cloneNode(true);   // same look as the neighbouring buttons
      clone.classList.add('mk-hist');
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
      ['href', 'target', 'onclick', 'download'].forEach((a) => clone.removeAttribute(a));
      clone.style.cursor = 'pointer';
      clone.title = 'Item history on backpack.tf';

      // label
      const w = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) {
        if (t.nodeValue.trim().toLowerCase() === 'view on steam') {
          t.nodeValue = 'BP History';
          clone.__mkLabel = t;
          break;
        }
      }

      // icon
      const oldSvg = clone.querySelector('svg');
      if (oldSvg) {
        const tmp = document.createElement('div');
        tmp.innerHTML = HISTORY_ICON;
        const svg = tmp.firstChild;
        ['class', 'width', 'height', 'style'].forEach((a) => {
          if (oldSvg.hasAttribute(a)) svg.setAttribute(a, oldSvg.getAttribute(a));
        });
        oldSvg.replaceWith(svg);
      }

      clone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openHistory(clone);
      }, true);

      parent.appendChild(clone);   // last button in the Action column
    });
  }

  function scan() {
    if (!document.body) return;
    ensurePanel();
    observer.disconnect();
    try {
      homeHeadings = isHome() ? findHomeHeadings() : [];
      document.querySelectorAll('.mk-keys').forEach((el) => {
        if (!isTf2OrUnknown(el)) el.remove();
      });
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') {
            return NodeFilter.FILTER_REJECT;
          }
          if (p.classList.contains('mk-keys')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      for (const node of nodes) {
        const text = node.nodeValue;
        if (!text || text.length > 25) continue;

        // případ A: "$46.93" v jednom textovém uzlu
        let m = PRICE_RE.exec(text);
        if (m) {
          const usd = parseUsd(m[1], m[2]);
          if (usd > 0 && isTf2OrUnknown(node)) attach(node, usd);
          continue;
        }

        // případ B: "$" a číslo jsou odděleně (např. <span>$</span><span>46.93</span>)
        m = NUM_RE.exec(text);
        if (m && m[2]) {
          const el = node.parentElement;
          const prevNode = node.previousSibling;
          const prevEl = el.previousSibling;
          const prevText =
            (prevNode && prevNode.textContent) || (prevEl && prevEl.textContent) || '';
          if (prevText.trim() === '$') {
            const usd = parseUsd(m[1], m[2]);
            if (usd > 0 && isTf2OrUnknown(node)) {
              // vlož za číslo (pokud je číslo jediný obsah elementu, za element)
              const target = el.childNodes.length === 1 && el.tagName !== 'A' ? el : node;
              attach(target, usd);
            }
          }
        }
      }
      document.querySelectorAll('.mk-bp').forEach((b) => {
        const a = b.parentElement;
        if (!a || !/\/item\/440-/.test(a.getAttribute('href') || '')) b.remove();
      });
      document.querySelectorAll('a[href*="/item/440-"]').forEach(ensureBp);
      ensureHistoryButtons();
    } finally {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 200);
  });

  scan();
  // pojistka: stránka je SPA a může vše překreslit i bez zachycené změny
  setInterval(scan, 1500);
})();
