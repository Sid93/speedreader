// Curated list of common, easy-to-recognize English words used for drills.
// Kept short enough to glance at a single fixation; no proper nouns or rare words.
export const DRILL_WORDS = [
  "about","above","across","after","again","against","along","always","among","around",
  "basic","beach","beauty","become","before","begin","below","between","birth","board",
  "book","break","bright","bring","build","business","carry","center","change","child",
  "circle","class","clear","close","coast","color","common","company","consider","country",
  "course","create","cross","culture","daily","dance","decade","decide","decline","deep",
  "design","detail","develop","direct","discuss","doctor","double","dream","drive","during",
  "early","earth","east","edge","effect","effort","either","electric","energy","enjoy",
  "enough","enter","entire","equal","escape","event","every","example","expect","family",
  "famous","father","feature","feeling","field","figure","finish","first","floor","flower",
  "follow","force","forest","forget","forward","friend","future","garden","general","gentle",
  "global","gold","grand","grass","green","ground","group","grow","guide","happy",
  "health","heart","heavy","history","honor","house","human","hundred","husband","image",
  "impact","improve","include","indeed","inside","instead","intend","interest","invest","island",
  "journey","justice","keep","kitchen","labor","language","large","laugh","learn","legal",
  "level","light","listen","little","local","lucky","major","market","matter","memory",
  "middle","million","minute","modern","moment","money","month","mother","mountain","music",
  "nation","natural","nature","nearly","never","night","normal","north","notice","number",
  "ocean","office","often","order","other","owner","paper","parent","party","people",
  "period","person","picture","plant","player","please","point","police","policy","political",
  "popular","positive","possible","power","practice","prepare","present","president","pretty","prevent",
  "price","print","private","probably","problem","produce","product","program","project","promise",
  "proper","protect","provide","public","purpose","quality","question","quickly","quiet","radio",
  "rather","reach","reading","ready","really","reason","recall","record","reduce","reflect",
  "remain","remember","report","result","return","review","river","safety","scene","school",
  "science","season","second","secret","section","seem","serious","service","seven","several",
  "share","short","should","simple","since","single","sister","situation","small","social",
  "society","someone","sometimes","sound","south","space","special","speak","speech","spirit",
  "spring","square","stable","stage","stand","start","station","statue","still","stone",
  "story","straight","strange","street","strong","student","study","style","subject","success",
  "sudden","summer","support","surface","surprise","system","table","teacher","thank","their",
  "thing","think","third","thought","through","throw","today","together","toward","travel",
  "trouble","truly","trust","truth","unique","until","useful","value","voice","watch",
  "water","weather","window","winter","within","without","wonder","world","worry","young",
];

// Shorter words render predictably in narrow drill stages.
const SHORT_DRILL_WORDS = DRILL_WORDS.filter((w) => w.length <= 6);

export function pickRandom(n: number, rnd: () => number = Math.random): string[] {
  const out: string[] = [];
  const used = new Set<number>();
  while (out.length < n) {
    const i = Math.floor(rnd() * SHORT_DRILL_WORDS.length);
    if (!used.has(i)) { used.add(i); out.push(SHORT_DRILL_WORDS[i]!); }
  }
  return out;
}
