import type { BodyRegion, PatientLanguage } from "./patient-flow";

export interface VoiceParsedAnatomy {
  matchedRegions: BodyRegion[];
  matchedSubregions: Record<string, string[]>;
  rawTranscript: string;
  isMatched: boolean;
}

interface KeywordRule {
  region: BodyRegion;
  subregion?: string;
  keywords: string[];
}

const KEYWORD_RULES_BY_LANG: Record<PatientLanguage, KeywordRule[]> = {
  en: [
    // Subregions first for specificity
    { region: "back", subregion: "subregionLowerBack", keywords: ["lower back", "lumbar", "lumber"] },
    { region: "back", subregion: "subregionUpperBack", keywords: ["upper back"] },
    { region: "back", subregion: "subregionMidBack", keywords: ["middle back", "mid back"] },
    { region: "abdomen", subregion: "subregionUpperAbdomen", keywords: ["upper abdomen", "upper stomach"] },
    { region: "abdomen", subregion: "subregionLowerAbdomen", keywords: ["lower abdomen", "lower stomach"] },
    { region: "head", subregion: "subregionThroat", keywords: ["throat", "mouth"] },
    { region: "head", subregion: "subregionNeck", keywords: ["neck"] },
    { region: "head", subregion: "subregionEye", keywords: ["eye", "eyes"] },
    { region: "head", subregion: "subregionEar", keywords: ["ear", "ears"] },
    { region: "arm", subregion: "subregionShoulder", keywords: ["shoulder", "shoulders"] },
    { region: "arm", subregion: "subregionElbow", keywords: ["elbow", "elbows"] },
    { region: "arm", subregion: "subregionWristHand", keywords: ["wrist", "wrists", "hand", "hands", "finger", "fingers"] },
    { region: "leg", subregion: "subregionKnee", keywords: ["knee", "knees"] },
    { region: "leg", subregion: "subregionAnkleFoot", keywords: ["ankle", "ankles", "foot", "feet", "toe", "toes", "heel"] },
    { region: "leg", subregion: "subregionThigh", keywords: ["thigh", "thighs", "hip", "hips"] },

    // Primary regions
    { region: "head", keywords: ["head", "headache", "forehead", "face", "scalp", "jaw", "temple"] },
    { region: "chest", keywords: ["chest", "heart", "breast", "ribs", "rib", "lungs", "lung"] },
    { region: "abdomen", keywords: ["abdomen", "stomach", "belly", "tummy", "pet", "navel", "pelvis", "pelvic", "groin", "gut"] },
    { region: "back", keywords: ["back", "spine", "kamar", "waist", "backbone"] },
    { region: "arm", keywords: ["arm", "arms", "forearm", "bicep", "tricep"] },
    { region: "leg", keywords: ["leg", "legs", "calf", "calves", "shin"] },
    { region: "skin", keywords: ["skin", "rash", "itching", "itch", "allergy", "hives", "boil"] },
    { region: "other", keywords: ["whole body", "full body", "all over", "everywhere", "general", "other area", "other"] },
  ],

  hi: [
    // Subregions & common Hindi terms
    { region: "back", subregion: "subregionLowerBack", keywords: ["कमर के निचले हिस्से", "निचली कमर", "लोअर बैक"] },
    { region: "back", subregion: "subregionUpperBack", keywords: ["ऊपरी पीठ", "ऊपर की पीठ"] },
    { region: "abdomen", subregion: "subregionUpperAbdomen", keywords: ["ऊपरी पेट", "पेट का ऊपरी हिस्सा"] },
    { region: "head", subregion: "subregionThroat", keywords: ["गला", "गले में", "मुंह", "कंठ"] },
    { region: "head", subregion: "subregionNeck", keywords: ["गर्दन", "गर्दन में"] },
    { region: "head", subregion: "subregionEye", keywords: ["आंख", "आँख", "आँखें", "आंखें"] },
    { region: "head", subregion: "subregionEar", keywords: ["कान", "कानों"] },
    { region: "arm", subregion: "subregionShoulder", keywords: ["कंधा", "कंधे", "कंधों"] },
    { region: "arm", subregion: "subregionElbow", keywords: ["कोहनी"] },
    { region: "arm", subregion: "subregionWristHand", keywords: ["कलाई", "उंगली", "उंगलियां", "हथेली"] },
    { region: "leg", subregion: "subregionKnee", keywords: ["घुटना", "घुटने", "घुटनों"] },
    { region: "leg", subregion: "subregionAnkleFoot", keywords: ["टखना", "एड़ी", "पैर का पंजा"] },
    { region: "leg", subregion: "subregionThigh", keywords: ["जांघ", "जांघें", "कूल्हा"] },

    // Primary regions & colloquial terms
    { region: "head", keywords: ["सिर", "सर", "सिर दर्द", "सर दर्द", "चेहरा", "माथा", "खोपड़ी", "head"] },
    { region: "chest", keywords: ["छाती", "सीना", "छाती में दर्द", "हार्ट", "फेफड़े", "पसलियां", "chest"] },
    { region: "abdomen", keywords: ["पेट", "पेट दर्द", "पेट में दर्द", "नाभि", "कोख", "पेल्विस", "stomach", "abdomen", "pet", "pet dard"] },
    { region: "back", keywords: ["पीठ", "कमर", "कमर दर्द", "रीढ़", "रीढ़ की हड्डी", "पीठ दर्द", "back", "kamar", "kamar dard"] },
    { region: "arm", keywords: ["हाथ", "हाथों", "बांह", "बाजू", "arm", "hand", "haath"] },
    { region: "leg", keywords: ["पैर", "पैरों", "टांग", "टांगों", "पिंडली", "leg", "legs", "foot", "pair"] },
    { region: "skin", keywords: ["त्वचा", "चमड़ी", "खुजली", "चकत्ते", "दाने", "खारिश", "एलर्जी", "skin", "rash"] },
    { region: "other", keywords: ["पूरा शरीर", "सारे शरीर", "हर जगह", "अन्य", "पूरे शरीर में", "whole body"] },
  ],

  bn: [
    { region: "head", subregion: "subregionThroat", keywords: ["গলা", "মুখ"] },
    { region: "head", subregion: "subregionNeck", keywords: ["ঘাড়", "ঘাড়"] },
    { region: "head", subregion: "subregionEye", keywords: ["চোখ"] },
    { region: "head", subregion: "subregionEar", keywords: ["কান"] },
    { region: "arm", subregion: "subregionShoulder", keywords: ["কাঁধ"] },
    { region: "leg", subregion: "subregionKnee", keywords: ["হাঁটু"] },

    { region: "head", keywords: ["মাথা", "মাথা ব্যথা", "কপাল", "মুখমণ্ডল", "head"] },
    { region: "chest", keywords: ["বুক", "ছাতি", "বুকে ব্যথা", "হৃদপিণ্ড", "chest"] },
    { region: "abdomen", keywords: ["পেট", "তলপেট", "নাভি", "পেট ব্যথা", "পেটে ব্যথা", "stomach", "abdomen"] },
    { region: "back", keywords: ["পিঠ", "কোমর", "মেরুদণ্ড", "কোমর ব্যথা", "পিঠে ব্যথা", "back"] },
    { region: "arm", keywords: ["হাত", "বাহু", "কব্জি", "আঙুল", "arm", "hand"] },
    { region: "leg", keywords: ["পা", "উরু", "গোড়ালি", "পায়ের পাতা", "leg", "foot"] },
    { region: "skin", keywords: ["চামড়া", "ত্বক", "চুলকানি", "র‍্যাশ", "অ্যালার্জি", "skin"] },
    { region: "other", keywords: ["পুরো শরীর", "সারা শরীর", "অন্যান্য", "whole body"] },
  ],

  te: [
    { region: "head", subregion: "subregionThroat", keywords: ["గొంతు", "నోరు"] },
    { region: "head", subregion: "subregionNeck", keywords: ["మెడ"] },
    { region: "head", subregion: "subregionEye", keywords: ["కన్ను", "కళ్ళు"] },
    { region: "head", subregion: "subregionEar", keywords: ["చెవి"] },
    { region: "arm", subregion: "subregionShoulder", keywords: ["భుజం"] },
    { region: "leg", subregion: "subregionKnee", keywords: ["మోకాలు"] },

    { region: "head", keywords: ["తల", "తల నొప్పి", "ముఖం", "నుదురు", "head"] },
    { region: "chest", keywords: ["ఛాతీ", "గుండె", "రొమ్ము", "ఛాతీ నొప్పి", "chest"] },
    { region: "abdomen", keywords: ["పొట్ట", "కడుపు", "కడుపు నొప్పి", "బొడ్డు", "stomach", "abdomen"] },
    { region: "back", keywords: ["వీపు", "నడుము", "వెన్ను", "నడుము నొప్పి", "వెన్నెముక", "back"] },
    { region: "arm", keywords: ["చేయి", "చేతులు", "మణికట్టు", "వేళ్లు", "arm", "hand"] },
    { region: "leg", keywords: ["కాలు", "కాళ్ళు", "తొడ", "చీలమండ", "పాదాలు", "leg", "foot"] },
    { region: "skin", keywords: ["చర్మం", "దురద", "దద్దుర్లు", "అలెర్జీ", "skin"] },
    { region: "other", keywords: ["మొత్తం శరీరం", "శరీరమంతా", "ఇతర", "whole body"] },
  ],

  ta: [
    { region: "head", subregion: "subregionThroat", keywords: ["தொண்டை", "வாய்"] },
    { region: "head", subregion: "subregionNeck", keywords: ["கழுத்து"] },
    { region: "head", subregion: "subregionEye", keywords: ["கண்", "கண்கள்"] },
    { region: "head", subregion: "subregionEar", keywords: ["காது"] },
    { region: "arm", subregion: "subregionShoulder", keywords: ["தோள்பட்டை"] },
    { region: "leg", subregion: "subregionKnee", keywords: ["முழங்கால்"] },

    { region: "head", keywords: ["தலை", "தலைவலி", "முகம்", "நெற்றி", "head"] },
    { region: "chest", keywords: ["மார்பு", "நெஞ்சு", "இதயம்", "மார்பு வலி", "chest", "nenju"] },
    { region: "abdomen", keywords: ["வயிறு", "வயிற்று வலி", "தொப்புள்", "அடிவயிறு", "stomach", "abdomen", "vayiru"] },
    { region: "back", keywords: ["முதுகு", "இடுப்பு", "முதுகெலும்பு", "இடுப்பு வலி", "முதுகு வலி", "back"] },
    { region: "arm", keywords: ["கை", "கைகள்", "முழங்கை", "மணிக்கட்டு", "விரல்கள்", "arm", "hand"] },
    { region: "leg", keywords: ["கால்", "கால்கள்", "தொடை", "கணுக்கால்", "பாதம்", "leg", "foot"] },
    { region: "skin", keywords: ["தோல்", "அரிப்பு", "தடிப்புகள்", "ஒவ்வாமை", "skin"] },
    { region: "other", keywords: ["முழு உடல்", "உடல் முழுவதும்", "மற்றவை", "whole body"] },
  ],

  mr: [
    { region: "head", subregion: "subregionThroat", keywords: ["घसा", "तोंड"] },
    { region: "head", subregion: "subregionNeck", keywords: ["मान"] },
    { region: "head", subregion: "subregionEye", keywords: ["डोळे"] },
    { region: "head", subregion: "subregionEar", keywords: ["कान"] },
    { region: "arm", subregion: "subregionShoulder", keywords: ["खांदा"] },
    { region: "leg", subregion: "subregionKnee", keywords: ["गुडघा"] },

    { region: "head", keywords: ["डोके", "डोकेदुखी", "चेहरा", "कपाळ", "head"] },
    { region: "chest", keywords: ["छाती", "हृदय", "छातीत दुखणे", "chest"] },
    { region: "abdomen", keywords: ["पोट", "पोटदुखी", "नाभी", "पोटात", "stomach", "abdomen"] },
    { region: "back", keywords: ["पाठ", "कंबर", "पाठीचा कणा", "कंबरदुखी", "पाठदुखी", "back"] },
    { region: "arm", keywords: ["हात", "मनगट", "बोटे", "arm", "hand"] },
    { region: "leg", keywords: ["पाय", "मांडी", "घोटा", "पाऊल", "leg", "foot"] },
    { region: "skin", keywords: ["त्वचा", "खाज", "पुरळ", "अ‍ॅलर्जी", "skin"] },
    { region: "other", keywords: ["संपूर्ण शरीर", "सर्व शरीर", "इतर", "whole body"] },
  ],
};

/**
 * Deterministically parses spoken transcript into canonical body regions and subregions.
 * No inference or generative LLM calls. Pure keyword matching.
 */
export function parseAnatomyVoice(
  transcript: string,
  language: PatientLanguage = "en"
): VoiceParsedAnatomy {
  const normalized = transcript.toLowerCase().trim();
  if (!normalized) {
    return {
      matchedRegions: [],
      matchedSubregions: {},
      rawTranscript: transcript,
      isMatched: false,
    };
  }

  const rules = KEYWORD_RULES_BY_LANG[language] || KEYWORD_RULES_BY_LANG.en;
  // Also include English rules for mixed-language speech (e.g. speaking "chest" during Hindi session)
  const allRules = language === "en" ? rules : [...rules, ...KEYWORD_RULES_BY_LANG.en];

  const matchedRegionsSet = new Set<BodyRegion>();
  const matchedSubregions: Record<string, string[]> = {};

  for (const rule of allRules) {
    for (const kw of rule.keywords) {
      // Use boundary-safe search or substring check for non-latin scripts
      const regex = new RegExp(`(^|\\s|[.,!?;:])${escapeRegExp(kw)}($|\\s|[.,!?;:])`, "iu");
      if (regex.test(normalized) || normalized.includes(kw.toLowerCase())) {
        matchedRegionsSet.add(rule.region);
        if (rule.subregion) {
          if (!matchedSubregions[rule.region]) {
            matchedSubregions[rule.region] = [];
          }
          if (!matchedSubregions[rule.region].includes(rule.subregion)) {
            matchedSubregions[rule.region].push(rule.subregion);
          }
        }
        break; // Matched this rule, continue to next rule
      }
    }
  }

  const matchedRegions = Array.from(matchedRegionsSet);

  return {
    matchedRegions,
    matchedSubregions,
    rawTranscript: transcript,
    isMatched: matchedRegions.length > 0,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getLocaleForLanguage(lang: PatientLanguage): string {
  switch (lang) {
    case "hi":
      return "hi-IN";
    case "bn":
      return "bn-IN";
    case "te":
      return "te-IN";
    case "ta":
      return "ta-IN";
    case "mr":
      return "mr-IN";
    case "en":
    default:
      return "en-IN";
  }
}
