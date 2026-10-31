// BinBuddy - classifies a waste item from the PHOTO ONLY. No API key, no dropdown.
// Categories: Recycle, Paper Waste, Compost, E-Waste, Solid Waste (general household rubbish).
// 1) Preferred: MobileNet AI model (local ./model folder first, then online sources).
// 2) Fallback: if the model cannot be loaded, the photo's own pixel colors are
//    analysed on-device for a rough estimate. Either way the answer comes from the image.

const imgEl = document.getElementById('imagePreview');
const box = document.getElementById('resultBox');
const cat = document.getElementById('categoryText');
const inst = document.getElementById('instructionText');

// ---------- Sorting rules (matched as WHOLE WORDS against model labels) ----------
// Earlier rules win when a label matches more than one. Anything unmatched = Solid Waste.
const RULES = [
  { cat: 'Hazardous Waste', words: ['barrel', 'cask', 'gasmask', 'gas mask', 'respirator', 'gas helmet', 'oil filter', 'radioactive',
                                'hair spray', 'lighter'] },
  { cat: 'E-Waste',     words: ['cellular telephone', 'cellular phone', 'cellphone', 'mobile phone', 'telephone', 'phone',
                                'laptop', 'notebook computer', 'desktop computer', 'hand-held computer', 'computer',
                                'monitor', 'crt screen', 'television', 'keyboard', 'computer mouse', 'ipod',
                                'remote control', 'printer', 'cartridge', 'modem', 'hard disc', 'hard drive',
                                'joystick', 'projector', 'speaker', 'headphone', 'earphone', 'battery', 'charger',
                                'cassette player', 'tape player', 'cd player', 'camera', 'radio', 'microphone',
                                'digital watch', 'digital clock', 'microwave', 'toaster', 'refrigerator',
                                'dishwasher', 'washing machine', 'vacuum', 'space heater', 'electric fan',
                                'hair dryer', 'hair drier', 'blow dryer', 'power drill', 'photocopier'] },
  { cat: 'Solid Waste', words: ['plastic bag', 'diaper', 'sock', 'sandal', 'shoe', 'trash can', 'garbage can',
                                'dustbin', 'wastebin', 'trash', 'garbage', 'rubbish', 'toilet tissue',
                                'paper towel', 'can opener', 'tin opener', 'band aid', 'flip-flop', 'loafer', 'clog',
                                'boot', 'jersey', 't-shirt', 'jean', 'sweatshirt', 'cardigan', 'dishrag', 'broom',
                                'mop', 'umbrella', 'ballpoint', 'rubber eraser', 'toothbrush', 'beer glass', 'goblet'] },
  { cat: 'Paper Waste', words: ['newspaper', 'paper', 'envelope', 'carton', 'cardboard', 'book jacket', 'comic book',
                                'binder', 'menu', 'crossword', 'jigsaw puzzle'] },
  { cat: 'Compost',     words: ['banana', 'orange', 'lemon', 'apple', 'strawberry', 'pineapple',
                                'broccoli', 'cabbage', 'cucumber', 'mushroom', 'corn', 'pizza',
                                'bagel', 'pretzel', 'zucchini', 'bell pepper', 'cauliflower',
                                'artichoke', 'fig', 'pomegranate', 'jackfruit',
                                'granny smith', 'squash', 'acorn', 'daisy', 'hay', 'bolete', 'agaric',
                                'cheeseburger', 'hotdog', 'hot dog', 'burrito', 'guacamole', 'mashed potato',
                                'french loaf', 'dough', 'meat loaf', 'carbonara', 'potpie'] },
  { cat: 'Recycle',     words: ['bottle', 'jug', 'can', 'jar', 'packet', 'cup', 'tin', 'bucket', 'soap dispenser', 'lotion', 'sunscreen'] },
];
RULES.forEach(rule => {
  rule.patterns = rule.words.map(w => new RegExp('\\b' + w + 's?\\b', 'i'));
});

// Default advice per category (neutral, safe for any item).
const TIPS = {
  'Recycle':     'Empty and rinse it, then place it in the dry-recyclables bin. Check your local rules for caps and labels.',
  'Paper Waste': 'Keep it dry and clean, flatten it, and put it with paper recyclables. Wet, greasy or waxed paper cannot be recycled.',
  'Compost':     'Remove any stickers or packaging, chop large pieces to speed it up, and add it to the compost or green-waste bin.',
  'E-Waste':     'Never put it in regular trash. Take it to a certified e-waste collection point or a manufacturer or retailer take-back program.',
  'Solid Waste': 'Put it in the general household waste bin, or reuse or donate it if it is still usable.',
  'Hazardous Waste': 'Do NOT touch, open or put it in any household bin. Keep people and pets away. If it carries a radioactive or chemical hazard symbol, stay back and call the emergency number (112 in India) or your local hazardous-waste authority.',
};
const ICONS = { 'Recycle': '♻️', 'Paper Waste': '📰', 'Compost': '🍏', 'E-Waste': '🔌', 'Solid Waste': '🗑️', 'Hazardous Waste': '☢️' };
const CSS_CLASSES = {
  'Recycle': 'bg-recycle', 'Paper Waste': 'bg-paper-waste', 'Compost': 'bg-compost',
  'E-Waste': 'bg-e-waste', 'Solid Waste': 'bg-solid-waste', 'Hazardous Waste': 'bg-hazardous-waste',
};

// Item-specific advice. Used when the AI model names the item.
const ITEM_TIPS = [
  // --- Hazardous waste (radioactive, chemical, contaminated) ---
  { words: ['barrel', 'cask', 'radioactive'],
                                          tip: 'Do NOT open, touch or move drums or barrels of unknown contents. If marked radioactive or chemical, keep everyone away and call the emergency number (112 in India) or the hazardous-waste authority. Never put it in any bin.' },
  { words: ['gasmask', 'gas mask', 'respirator', 'gas helmet'],
                                          tip: 'Used masks and filters may be contaminated. Seal them in a bag and take them to a hazardous-waste collection point. Do not put them in household bins.' },
  { words: ['oil filter'],                tip: 'Drain the used oil, then take the filter and oil to an auto shop or hazardous-waste collection point. Never pour oil down a drain or bin it.' },
  { words: ['hair spray'],                tip: 'Aerosol cans can explode if crushed or burned. Use it up completely. If it still has product or pressure, take it to a hazardous-waste collection point. Only fully empty cans go in dry recycling.' },
  { words: ['lighter'],                   tip: 'Never put a lighter with fuel in the bin or recycling, since the gas can ignite or explode in a garbage truck. Use it up, or take it to a hazardous-waste collection point.' },
  // --- Electronic waste (E-Waste) ---
  { words: ['cellular telephone', 'cellular phone', 'cellphone', 'mobile phone', 'telephone', 'phone', 'ipod'],
                                          tip: 'Back up and erase your data, and remove the SIM and memory card. Hand it to a certified e-waste collector or a take-back program. Never bin it, because damaged lithium batteries can start fires.' },
  { words: ['laptop', 'notebook computer', 'desktop computer', 'hand-held computer', 'computer', 'monitor', 'crt screen', 'television', 'keyboard', 'computer mouse', 'hard disc', 'hard drive'],
                                          tip: 'Back up your files and wipe the data (factory reset). Donate it if it still works, or give it to a certified e-waste recycler. Never put it in regular trash.' },
  { words: ['printer', 'cartridge'],      tip: 'Return empty ink or toner cartridges to the manufacturer take-back program or a refill shop. Leftover ink and toner pollute if thrown away. Take old printers to an e-waste collection point.' },
  { words: ['remote control', 'modem', 'joystick', 'projector', 'speaker', 'headphone', 'earphone', 'cassette player', 'charger', 'battery'],
                                          tip: 'Remove any batteries first and keep them separate. Take the device to an e-waste collection point. Never put it in regular trash.' },
  { words: ['camera', 'radio', 'microphone', 'tape player', 'cd player', 'digital watch', 'digital clock', 'photocopier'],
                                          tip: 'Remove the batteries and memory card, and wipe any stored data. Donate it if it works, otherwise take it to an e-waste collection point. Never put it in regular trash.' },
  { words: ['microwave', 'toaster', 'refrigerator', 'dishwasher', 'washing machine', 'vacuum', 'space heater', 'electric fan', 'hair dryer', 'hair drier', 'blow dryer', 'power drill'],
                                          tip: 'Appliances contain metals, wiring and sometimes gases or oils. Repair or donate if it works. Otherwise use a retailer exchange or a certified e-waste or scrap collector. Never leave it in regular trash.' },
  // Must come BEFORE the generic paper tip below.
  { words: ['paper towel'],               tip: 'Used paper towels are usually soiled, so put them in general household waste. Clean, dry ones can go in compost if your program accepts them.' },
  // --- Paper waste ---
  { words: ['newspaper'],                 tip: 'Keep newspapers dry, stack them and tie them in a bundle. Leave out plastic bags and wrappers.' },
  { words: ['carton', 'cardboard'],       tip: 'Remove tape and packing, then flatten the box and keep it dry. Greasy or food-soiled cardboard, such as a pizza box base, cannot be recycled.' },
  { words: ['envelope', 'paper', 'book jacket', 'comic book', 'binder', 'menu', 'crossword', 'jigsaw puzzle'],
                                          tip: 'Office and plain paper is recyclable. Remove staples and plastic windows if you can, and keep it dry and clean. Bag shredded paper separately.' },
  // --- Solid waste (general household rubbish) ---
  { words: ['trash can', 'garbage can', 'dustbin', 'wastebin', 'trash', 'garbage', 'rubbish'],
                                          tip: 'Bag it, tie it, and put it in the general household waste bin. Separate recyclables, food scraps and e-waste first.' },
  { words: ['toilet tissue'],             tip: 'Used tissue goes in general household waste. Do not recycle it.' },
  { words: ['shoe', 'sandal'],            tip: 'Still wearable? Donate or repair them. Otherwise put them in general household waste. Some brands run take-back programs.' },
  { words: ['jersey', 't-shirt', 'jean', 'sweatshirt', 'cardigan', 'boot', 'loafer', 'clog', 'flip-flop'],
                                          tip: 'Wearable? Donate, resell or repair it. Worn-out textiles can go to a clothing-recycling bin if one exists nearby, otherwise general household waste.' },
  { words: ['can opener', 'tin opener', 'broom', 'mop', 'dishrag', 'umbrella', 'ballpoint', 'rubber eraser', 'toothbrush'],
                                          tip: 'Mixed materials make this hard to recycle. Reuse or donate it if it still works, otherwise put it in general household waste. Scrap-metal collectors may take metal parts.' },
  { words: ['band aid'],                  tip: 'Used bandages go in general household waste. Wrap them first, and never put them in recycling.' },
  { words: ['beer glass', 'goblet'],      tip: 'Drinking glasses cannot be recycled with bottles and jars. Reuse or donate them. If broken, wrap the pieces in thick paper and label it before putting it in general waste.' },
  { words: ['sock'],                      tip: 'Donate if still wearable, or reuse as cleaning rags. Otherwise general household waste.' },
  { words: ['plastic bag'],               tip: 'Reuse it first. Thin plastic bags jam recycling machines, so keep them out of the recycling bin.' },
  { words: ['diaper'],                    tip: 'Wrap it up and put it in general household waste. Never in recycling or compost.' },
  // --- Recycle (plastic, glass, metal) ---
  { words: ['bottle'],                    tip: 'Empty and rinse it, then put the cap back on. Flatten plastic bottles to save space.' },
  { words: ['jug'],                       tip: 'Empty and rinse it, and keep the cap on before recycling.' },
  { words: ['jar'],                       tip: 'Empty and rinse it. Remove the lid and recycle it separately.' },
  { words: ['can', 'tin'],                tip: 'Rinse it out and crush it to save space. You can leave the label on.' },
  { words: ['bucket'],                    tip: 'Empty and rinse it. Rigid plastic buckets are often recyclable, but reuse it first because it lasts for years.' },
  { words: ['soap dispenser', 'lotion', 'sunscreen'],
                                          tip: 'Empty it and rinse it, then recycle the bottle. Remove the pump if your local rules require it. Squeeze tubes are usually general household waste.' },
  { words: ['cup'],                       tip: 'Empty it first. Paper cups often have a plastic lining, so check local rules before recycling.' },
  { words: ['packet'],                    tip: 'Only recycle it if it is clean paper or card. Foil-lined snack packets go in general household waste.' },
  // --- Compost ---
  { words: ['banana', 'orange', 'lemon', 'apple', 'strawberry', 'pineapple', 'jackfruit', 'pomegranate', 'fig', 'granny smith'],
                                          tip: 'Fruit scraps compost well. Chop large pieces to speed it up, and remove any stickers.' },
  { words: ['broccoli', 'cabbage', 'cucumber', 'mushroom', 'corn', 'zucchini', 'bell pepper', 'cauliflower', 'artichoke', 'squash', 'bolete', 'agaric'],
                                          tip: 'Vegetable scraps compost well. Chop large pieces to speed it up.' },
  { words: ['pizza', 'bagel', 'pretzel'], tip: 'Food leftovers can be composted. Remove all packaging first, and avoid very oily food.' },
  { words: ['cheeseburger', 'hotdog', 'hot dog', 'burrito', 'guacamole', 'mashed potato', 'french loaf', 'dough', 'meat loaf', 'carbonara', 'potpie'],
                                          tip: 'Cooked food waste goes in your municipal food-waste or green bin. Avoid home compost piles for meat, dairy and oily food, because they attract pests. Remove all packaging first.' },
  { words: ['acorn', 'daisy', 'hay'],     tip: 'Garden waste such as leaves, flowers and straw is great for compost or the green-waste bin. Keep out any plastic ties or pots.' },
];
ITEM_TIPS.forEach(t => {
  t.patterns = t.words.map(w => new RegExp('\\b' + w + 's?\\b', 'i'));
});

function pickTip(category, label) {
  if (label) {
    for (const t of ITEM_TIPS) {
      if (t.patterns.some(re => re.test(label))) return t.tip;
    }
  }
  return TIPS[category];
}

// ---------- UI helpers ----------
function showResult(category, label) {
  box.style.display = 'block';
  box.className = 'result-card ' + CSS_CLASSES[category];
  cat.innerText = ICONS[category] + ' Category: ' + category;
  inst.innerHTML = '<strong>Action:</strong> ' + pickTip(category, label);
}

function showLoading() {
  box.style.display = 'block';
  box.className = 'result-card bg-loading';
  cat.innerText = '🔄 Analyzing item...';
  inst.innerHTML = '';
}

// ---------- Color-analysis fallback (reads the photo's pixels) ----------
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else                h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}

// data = RGBA pixel array (like canvas getImageData().data)
// Color analysis can only tell Compost / Recycle / Solid Waste apart.
function classifyPixels(data) {
  let organic = 0, clear = 0, blue = 0, dark = 0, yellow = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;            // skip transparent pixels
    const px = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    n++;
    if (px.v < 0.25) { dark++; continue; }
    if (px.h >= 40 && px.h <= 70 && px.s > 0.6 && px.v > 0.6) yellow++;        // hazard-sign yellow
    if (px.s > 0.35 && (px.h < 70 || (px.h >= 70 && px.h < 170))) organic++;   // red/orange/yellow/green
    else if (px.s < 0.2 && px.v > 0.5) clear++;                                 // white / clear / silver
    else if (px.h >= 180 && px.h < 260 && px.s > 0.25) blue++;                  // blue plastics / cans
  }
  if (n === 0) return { category: 'Solid Waste', organic: 0, recycle: 0, dark: 0 };
  const o = organic / n, rcy = (clear + blue) / n, dk = dark / n, yl = yellow / n;
  // Share of food-like / clear colors among the NON-black pixels only, so scraps on dark soil still count.
  const lit = n - dark;
  const oLit = lit > 0 ? organic / lit : 0;
  const rLit = lit > 0 ? (clear + blue) / lit : 0;
  let category = 'Solid Waste';
  // Safety first: lots of hazard-sign yellow plus black markings => treat as hazardous (drums, warning signs).
  // This can also trigger on very yellow items with dark parts; it errs on the side of caution.
  if (yl >= 0.30 && dk >= 0.06) category = 'Hazardous Waste';
  // Clearly food-like colors among the lit pixels => compost (checked first so scraps on dark soil still count).
  else if (lit >= 0.15 * n && oLit > 0.35 && oLit >= rLit) category = 'Compost';
  // Lots of dark glass/black plastic (screens, casings, circuit boards) without mostly food-like colors => likely electronics.
  // Green circuit boards and small colored parts are tolerated. Capped at 80% so a fully black photo is not guessed as electronics.
  else if (dk >= 0.25 && dk <= 0.80 && oLit < 0.30) category = 'E-Waste';
  else if (rcy > 0.30) category = 'Recycle';
  return { category: category, organic: o, recycle: rcy, dark: dk };
}

function analyzeColors(img) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  return classifyPixels(ctx.getImageData(0, 0, size, size).data);
}

function showColorFallback() {
  try {
    const r = analyzeColors(imgEl);
    showResult(r.category);
    inst.innerHTML += '<br><br><em>Note: the AI model could not load, so this is only a rough estimate from the photo\'s colors. Check your internet connection or the browser console (F12) for details.</em>';
  } catch (err) {
    console.error(err);
    box.style.display = 'block';
    box.className = 'result-card bg-solid-waste';
    cat.innerText = '⚠️ Could not read this photo. Try a different image.';
    inst.innerHTML = '';
  }
}

// ---------- Model loading (local copy first, then 3 online sources; never throws) ----------
const MODEL_TIMEOUT_MS = 25000;
const MODEL_OPTIONS = [
  { version: 1, alpha: 1.0, modelUrl: 'model/model.json' },  // local copy in ./model (fastest, works offline)
  { version: 1, alpha: 1.0  },  // downloads from storage.googleapis.com
  { version: 2, alpha: 1.0  },  // default source
  { version: 1, alpha: 0.25 },  // smallest, last resort
];

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Model download timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let modelPromise = null;

async function loadModel() {
  if (typeof tf === 'undefined' || typeof mobilenet === 'undefined') {
    console.warn('TensorFlow/MobileNet scripts did not load.');
    return null;
  }
  try {
    await tf.setBackend('webgl');
    await tf.ready();
  } catch (e) {
    try {
      await tf.setBackend('cpu');
      await tf.ready();
    } catch (e2) {
      console.warn('Could not start a TensorFlow backend', e2);
      return null;
    }
  }
  for (const opts of MODEL_OPTIONS) {
    try {
      return await withTimeout(mobilenet.load(opts), MODEL_TIMEOUT_MS);
    } catch (err) {
      console.warn('Model source failed:', opts, err);
    }
  }
  return null;
}

// ---------- Main flow ----------
document.getElementById('imageLoader').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  imgEl.onload = analyzeWaste;
  imgEl.src = URL.createObjectURL(file);
  imgEl.style.display = 'block';
});

async function analyzeWaste() {
  showLoading();
  try {
    if (!modelPromise) modelPromise = loadModel();
    const model = await modelPromise;
    if (!model) {
      modelPromise = null; // retry the AI model on the next upload
      showColorFallback();
      return;
    }

    const predictions = await model.classify(imgEl, 5);

    let category = 'Solid Waste';
    let matchedLabel = predictions[0].className;
    outer: for (const p of predictions) {
      for (const rule of RULES) {
        if (rule.patterns.some(re => re.test(p.className))) {
          category = rule.cat;
          matchedLabel = p.className;
          break outer;
        }
      }
    }

    showResult(category, matchedLabel);
  } catch (err) {
    console.error(err);
    modelPromise = null;
    showColorFallback();
  }
}