/**
 * Multilingual location & city names for Indian cities and states.
 * Guarantees that city names (like Chennai, Delhi, Mumbai) and states
 * translate into the user's selected language instead of showing raw English.
 */

type LangCode = string;

interface CityTranslations {
  hi: string;
  ta?: string;
  te?: string;
  bn?: string;
  mr?: string;
  gu?: string;
  kn?: string;
  ml?: string;
  pa?: string;
  or?: string;
  ur?: string;
  as?: string;
}

const DISTRICT_WORDS: Record<string, string> = {
  hi: "जिला",
  ta: "மாவட்டம்",
  te: "జిల్లా",
  bn: "জেলা",
  mr: "जिल्हा",
  gu: "જિલ્લો",
  kn: "ಜಿಲ್ಲೆ",
  ml: "ജില്ല",
  pa: "ਜ਼ਿਲ੍ਹਾ",
  or: "ଜିଲ୍ଲା",
  ur: "ضلع",
  as: "জিলা",
};

const CITY_DICT: Record<string, CityTranslations> = {
  chennai: {
    hi: "चेन्नई",
    ta: "சென்னை",
    te: "చెన్నై",
    bn: "চেন্নাই",
    mr: "चेन्नई",
    gu: "ચેન્નાઈ",
    kn: "ಚೆನ್ನೈ",
    ml: "ചെന്നൈ",
    pa: "ਚੇਨਈ",
    or: "ଚେନ୍ନାଇ",
    ur: "چنئی",
    as: "চেন্নাই",
  },
  delhi: {
    hi: "दिल्ली",
    ta: "தில்லி",
    te: "ఢిల్లీ",
    bn: "দিল্লি",
    mr: "दिल्ली",
    gu: "દિલ્હી",
    kn: "ದೆಹಲಿ",
    ml: "ഡൽഹി",
    pa: "ਦਿੱਲੀ",
    or: "ଦିଲ୍ଲୀ",
    ur: "دہلی",
    as: "দিল্লী",
  },
  mumbai: {
    hi: "मुंबई",
    ta: "மும்பை",
    te: "ముంబై",
    bn: "মুম্বই",
    mr: "मुंबई",
    gu: "મુંબઈ",
    kn: "ಮುಂಬೈ",
    ml: "മുംബൈ",
    pa: "ਮੁੰਬਈ",
    or: "ମୁମ୍ବାଇ",
    ur: "ممبئی",
    as: "মুম্বাই",
  },
  bengaluru: {
    hi: "बेंगलुरु",
    ta: "பெங்களூரு",
    te: "బెంగళూరు",
    bn: "বেঙ্গালুরু",
    mr: "बंगळुरू",
    gu: "બેંગલુરુ",
    kn: "ಬೆಂಗಳೂರು",
    ml: "ബംഗളൂരു",
    pa: "ਬੈਂਗਲੁਰੂ",
    or: "ବେଙ୍ଗାଲୁରୁ",
    ur: "بنگلور",
    as: "বেংগালুৰু",
  },
  bangalore: {
    hi: "बेंगलुरु",
    ta: "பெங்களூரு",
    te: "బెంగళూరు",
    bn: "বেঙ্গালুরু",
    mr: "बंगळुरू",
    gu: "બેંગલુરુ",
    kn: "ಬೆಂಗಳೂರು",
    ml: "ബംഗളൂരു",
    pa: "ਬੈਂਗਲੁਰੂ",
  },
  kolkata: {
    hi: "कोलकाता",
    ta: "கொல்கத்தா",
    te: "కోల్‌కతా",
    bn: "কলকাতা",
    mr: "कोलकाता",
    gu: "કોલકાતા",
    kn: "ಕೋಲ್ಕತ್ತಾ",
    ml: "കൊൽക്കത്ത",
    pa: "ਕੋਲਕਾਤਾ",
    or: "କୋଲକାତା",
    ur: "کولکتہ",
    as: "কলকাতা",
  },
  hyderabad: {
    hi: "हैदराबाद",
    ta: "ஹைதராபாத்",
    te: "హైదరాబాద్",
    bn: "হায়দ্রাবাদ",
    mr: "हैदराबाद",
    gu: "હૈદરાબાદ",
    kn: "ಹೈದರಾಬಾದ್",
    ml: "ഹൈദരാബാദ്",
    pa: "ਹੈਦਰਾਬਾਦ",
    or: "ହାଇଦ୍ରାବାଦ",
    ur: "حیدرآباد",
  },
  ahmedabad: {
    hi: "अहमदाबाद",
    ta: "அகமதாபாத்",
    te: "అహ్మదాబాద్",
    bn: "আহমেদাবাদ",
    mr: "अहमदाबाद",
    gu: "અમદાવાદ",
    kn: "ಅಹಮದಾಬಾದ್",
    ml: "അഹമ്മദാബാദ്",
    pa: "ਅਹਿਮਦਾਬਾਦ",
  },
  pune: {
    hi: "पुणे",
    ta: "புனே",
    te: "పూణే",
    bn: "পুনে",
    mr: "पुणे",
    gu: "પુણે",
    kn: "ಪುಣೆ",
    ml: "പുണെ",
    pa: "ਪੁਣੇ",
  },
  jaipur: {
    hi: "जयपुर",
    ta: "ஜெய்ப்பூர்",
    te: "జైపూర్",
    bn: "জয়পুর",
    mr: "जयपूर",
    gu: "જયપુર",
    kn: "ಜೈಪುರ",
    ml: "ജയ്പൂർ",
    pa: "ਜੈਪੁਰ",
  },
  lucknow: {
    hi: "लखनऊ",
    ta: "லக்னோ",
    te: "లక్నో",
    bn: "লখনউ",
    mr: "लखनौ",
    gu: "લખનૌ",
    kn: "ಲಕ್ನೋ",
    ml: "ലഖ്‌നൗ",
    pa: "ਲਖਨਊ",
  },
  nagpur: {
    hi: "नागपुर",
    ta: "நாக்பூர்",
    te: "నాగ్‌పూర్",
    bn: "নাগপুর",
    mr: "नागपूर",
    gu: "નાગપુર",
    kn: "ನಾಗಪುರ",
    ml: "നാഗ്പൂർ",
    pa: "ਨਾਗਪੁਰ",
  },
  patna: {
    hi: "पटना",
    ta: "பாட்னா",
    te: "పాట్నా",
    bn: "পাটনা",
    mr: "पाटणा",
    gu: "પટના",
    kn: "ಪಾಟ್ನಾ",
    ml: "പട്ന",
    pa: "ਪਟਨਾ",
  },
  bhopal: {
    hi: "भोपाल",
    ta: "போபால்",
    te: "భోపాల్",
    bn: "ভোপাল",
    mr: "भोपाळ",
    gu: "ભોપાલ",
    kn: "ಭೋಪಾಲ್",
    ml: "ഭോപ്പാൽ",
    pa: "ਭੋਪਾਲ",
  },
  chandigarh: {
    hi: "चंडीगढ़",
    ta: "சண்டிகர்",
    te: "చండీగఢ్",
    bn: "চণ্ডীগড়",
    mr: "चंदिगढ",
    gu: "ચંદીગઢ",
    kn: "ಚಂಡೀಗಢ",
    ml: "ചണ്ഡീഗഡ്",
    pa: "ਚੰਡੀਗੜ੍ਹ",
  },
  kochi: {
    hi: "कोच्चि",
    ta: "கொச்சி",
    te: "కొచ్చి",
    bn: "কোচি",
    mr: "कोची",
    gu: "કોચી",
    kn: "ಕೊಚ್ಚಿ",
    ml: "കൊച്ചി",
    pa: "ਕੋਚੀ",
  },
  coimbatore: {
    hi: "कोयंबटूर",
    ta: "கோயம்புத்தூர்",
    te: "కోయంబత్తూరు",
    bn: "কোয়েম্বাটোর",
    mr: "कोइम्बतूर",
    gu: "કોઇમ્બતૂર",
    kn: "ಕೊಯಮತ್ತೂರು",
    ml: "കോയമ്പത്തൂർ",
  },
  madurai: {
    hi: "मदुरै",
    ta: "மதுரை",
    te: "మదురై",
    bn: "মাদুরাই",
    mr: "मदुराई",
    gu: "મદુરાઇ",
    kn: "ಮಧುರೈ",
    ml: "മധുരൈ",
  },
  thiruvananthapuram: {
    hi: "तिरुवनंतपुरम",
    ta: "திருவனந்தபுரம்",
    te: "తిరువనంతపురం",
    bn: "তিরুবনন্তপুরম",
    mr: "तिरुवनंतपुरम",
    gu: "તિરુવનંતપુરમ",
    kn: "ತಿರುವನಂತಪುರಂ",
    ml: "തിരുവനന്തപുരം",
  },
  guwahati: {
    hi: "गुवाहाटी",
    ta: "குவஹாத்தி",
    te: "గౌహతి",
    bn: "গুয়াহাটি",
    mr: "गुवाहाटी",
    as: "গুৱাহাটী",
  },
  visakhapatnam: {
    hi: "विशाखापट्टनम",
    ta: "விசாகப்பட்டினம்",
    te: "విశాఖపట్నం",
    bn: "বিশাখাপত্তনম",
    mr: "विशाखापट्टणम",
    kn: "ವಿಶಾಖಪಟ್ಟಣಂ",
  },
  varanasi: {
    hi: "वाराणसी",
    ta: "வாரணாசி",
    te: "వారణాసి",
    bn: "বারাণসী",
    mr: "वाराणसी",
    gu: "વારાણસી",
  },
  amritsar: {
    hi: "अमृतसर",
    ta: "அமிர்தசரஸ்",
    te: "అమృతసర్",
    bn: "অমৃতসর",
    pa: "ਅੰਮ੍ਰਿਤਸਰ",
  },
  indore: {
    hi: "इंदौर",
    ta: "இந்தூர்",
    te: "ఇండోర్",
    mr: "इंदूर",
    gu: "ઇન્દોર",
  },
  surat: {
    hi: "सूरत",
    ta: "சூரத்",
    te: "సూరత్",
    gu: "સુરત",
  },
  kanpur: {
    hi: "कानपुर",
    ta: "கான்பூர்",
    te: "కాన్పూర్",
  },
  shimla: {
    hi: "शिमला",
    ta: "சிம்லா",
    te: "సిమ్లా",
    pa: "ਸ਼ਿਮਲਾ",
  },
  dehradun: {
    hi: "देहरादून",
    ta: "டேராடூன்",
    te: "డెహ్రాడూన్",
  },
  srinagar: {
    hi: "श्रीनगर",
    ta: "ஸ்ரீநகர்",
    te: "శ్రీనగర్",
    ur: "سری نگر",
  },
  bhubaneswar: {
    hi: "भुवनेश्वर",
    ta: "புவனேஸ்வர்",
    te: "భువనేశ్వర్",
    bn: "ভুবনেশ্বর",
    or: "ଭୁବନେଶ୍ୱର",
  },
  ranchi: {
    hi: "राँची",
    ta: "ராஞ்சி",
    te: "రాంచీ",
    bn: "রাঁচি",
  },
  raipur: {
    hi: "रायपुर",
    ta: "ராய்ப்பூர்",
    te: "రాయ్‌పూర్",
  },
};

const STATE_DICT: Record<string, CityTranslations> = {
  "tamil nadu": {
    hi: "तमिलनाडु",
    ta: "தமிழ்நாடு",
    te: "తమిళనాడు",
    bn: "তামিলনাড়ু",
    mr: "तमिळनाडू",
    gu: "તમિલનાડુ",
    kn: "ತಮಿಳುನಾಡು",
    ml: "തമിഴ്‌നാട്",
    pa: "ਤਮਿਲਨਾਡੂ",
    or: "ତାମିଲନାଡୁ",
    ur: "تمل ناڈو",
    as: "তামিলনাডু",
  },
  maharashtra: {
    hi: "महाराष्ट्र",
    ta: "மகாராஷ்டிரா",
    te: "మహారాష్ట్ర",
    bn: "মহারাষ্ট্র",
    mr: "महाराष्ट्र",
    gu: "મહારાષ્ટ્ર",
    kn: "ಮಹಾರಾಷ್ಟ್ರ",
    ml: "മഹാരാഷ്ട്ര",
    pa: "ਮਹਾਰਾਸ਼ਟਰ",
    or: "ମହାରାଷ୍ଟ୍ର",
    ur: "مہاراشٹر",
  },
  karnataka: {
    hi: "कर्नाटक",
    ta: "கர்நாடகா",
    te: "కర్ణాటక",
    bn: "কর্ণাটক",
    mr: "कर्नाटक",
    gu: "કર્ણાટક",
    kn: "ಕರ್ನಾಟಕ",
    ml: "കർണാടക",
    pa: "ਕਰਨਾਟਕ",
    or: "କର୍ଣ୍ଣାଟକ",
  },
  kerala: {
    hi: "केरल",
    ta: "கேரளா",
    te: "కేరళ",
    bn: "কেরল",
    mr: "केरळ",
    gu: "કેરળ",
    kn: "ಕೇರಳ",
    ml: "കേരളം",
    pa: "ਕੇਰਲ",
    or: "କେରଳ",
  },
  "andhra pradesh": {
    hi: "आंध्र प्रदेश",
    ta: "ஆந்திரப் பிரதேசம்",
    te: "ఆంధ్రప్రదేశ్",
    bn: "অন্ধ্রপ্রদেশ",
    mr: "आंध्र प्रदेश",
    gu: "આંધ્ર પ્રદેશ",
    kn: "ಆಂಧ್ರಪ್ರದೇಶ",
    ml: "ആന്ധ്രാപ്രദേശ്",
  },
  telangana: {
    hi: "तेलंगाना",
    ta: "தெலங்கானா",
    te: "తెలంగాణ",
    bn: "তেলেঙ্গানা",
    mr: "तेलंगणा",
    gu: "તેલંગાણા",
    kn: "ತೆಲಂಗಾಣ",
    ml: "തെലങ്കാന",
  },
  "west bengal": {
    hi: "पश्चिम बंगाल",
    ta: "மேற்கு வங்காளம்",
    te: "పశ్చిమ బెంగాల్",
    bn: "পশ্চিমবঙ্গ",
    mr: "पश्चिम बंगाल",
    gu: "પશ્ચિમ બંગાળ",
    kn: "ಪಶ್ಚಿಮ ಬಂಗಾಳ",
    ml: "പശ്ചിമ ബംഗാൾ",
  },
  "uttar pradesh": {
    hi: "उत्तर प्रदेश",
    ta: "உத்தரப் பிரதேசம்",
    te: "ఉత్తర ప్రదేశ్",
    bn: "উত্তরপ্রদেশ",
    mr: "उत्तर प्रदेश",
    gu: "ઉત્તર પ્રદેશ",
    kn: "ಉತ್ತರ ಪ್ರದೇಶ",
    ml: "ഉത്തർപ്രദേശ്",
  },
  "madhya pradesh": {
    hi: "मध्य प्रदेश",
    ta: "மத்தியப் பிரதேசம்",
    te: "మధ్యప్రదేశ్",
    bn: "মধ্যপ্রদেশ",
    mr: "मध्य प्रदेश",
    gu: "મધ્ય પ્રદેશ",
    kn: "ಮಧ್ಯಪ್ರದೇಶ",
    ml: "മധ്യപ്രദേശ്",
  },
  rajasthan: {
    hi: "राजस्थान",
    ta: "ராஜஸ்தான்",
    te: "రాజస్థాన్",
    bn: "রাজস্থান",
    mr: "राजस्थान",
    gu: "રાજસ્થાન",
    kn: "ರಾಜಸ್ಥಾನ",
    ml: "രാജസ്ഥാൻ",
  },
  gujarat: {
    hi: "गुजरात",
    ta: "குஜராத்",
    te: "గుజరాత్",
    bn: "গুজরাট",
    mr: "गुजरात",
    gu: "ગુજરાત",
    kn: "ಗುಜರಾತ್",
    ml: "ഗുജറാത്ത്",
  },
  punjab: {
    hi: "पंजाब",
    ta: "பஞ்சாப்",
    te: "పంజాబ్",
    bn: "পাঞ্জাব",
    mr: "पंजाब",
    gu: "પંજાબ",
    kn: "ಪಂಜಾಬ್",
    ml: "പഞ്ചാബ്",
    pa: "ਪੰਜਾਬ",
  },
  haryana: {
    hi: "हरियाणा",
    ta: "ஹரியானா",
    te: "హర్యానా",
    bn: "হরিয়ানা",
    mr: "हरियाणा",
    gu: "હરિયાણા",
  },
  bihar: {
    hi: "बिहार",
    ta: "பீகார்",
    te: "బీహార్",
    bn: "বিহার",
    mr: "बिहार",
    gu: "બિહાર",
  },
  odisha: {
    hi: "ओडिशा",
    ta: "ஒடிசா",
    te: "ఒడిశా",
    bn: "ওড়িশা",
    mr: "ओडिशा",
    or: "ଓଡ଼ିଶା",
  },
  assam: {
    hi: "असम",
    ta: "அசாம்",
    te: "అస్సాం",
    bn: "অসম",
    mr: "आसाम",
    as: "অসম",
  },
  delhi: {
    hi: "दिल्ली",
    ta: "தில்லி",
    te: "ఢిల్లీ",
    bn: "দিল্লি",
    mr: "दिल्ली",
    gu: "દિલ્હી",
  },
  india: {
    hi: "भारत",
    ta: "இந்தியா",
    te: "భారతదేశం",
    bn: "ভারত",
    mr: "भारत",
    gu: "ભારત",
    kn: "ಭಾರತ",
    ml: "ഇന്ത്യ",
    pa: "ਭਾਰਤ",
    or: "ଭାରତ",
    ur: "بھارت",
    as: "ভাৰত",
  },
};

/**
 * Translates an Indian place name (city, district, or state) into the target language.
 * Falls back to Hindi if specific target language mapping is not yet present,
 * avoiding English text leaking when a non-English language is active.
 */
export function translateLocationName(rawName: string | null | undefined, lang: string = "en"): string {
  if (!rawName) return "";
  if (lang === "en") return rawName;

  const targetLang = lang.toLowerCase();

  // If the string contains commas (e.g. "Chennai, Chennai district, Tamil Nadu")
  if (rawName.includes(",")) {
    return rawName
      .split(",")
      .map((part) => translateSinglePlace(part.trim(), targetLang))
      .filter(Boolean)
      .join(", ");
  }

  return translateSinglePlace(rawName.trim(), targetLang);
}

function translateSinglePlace(part: string, lang: string): string {
  if (!part) return "";

  // Check if it's "X district"
  const districtMatch = part.match(/^(.*?)\s+district$/i);
  if (districtMatch) {
    const baseCity = districtMatch[1].trim();
    const transCity = translateSinglePlace(baseCity, lang);
    const distWord = DISTRICT_WORDS[lang] ?? DISTRICT_WORDS.hi;
    return `${transCity} ${distWord}`;
  }

  const cleanKey = part.toLowerCase();

  // Check City Dict
  if (CITY_DICT[cleanKey]) {
    const entry = CITY_DICT[cleanKey];
    return (entry as any)[lang] ?? entry.hi ?? part;
  }

  // Check State Dict
  if (STATE_DICT[cleanKey]) {
    const entry = STATE_DICT[cleanKey];
    return (entry as any)[lang] ?? entry.hi ?? part;
  }

  return part;
}
