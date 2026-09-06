import type { PatientLanguage } from "./patient-flow";

const english = {
  brand: "MediKiosk",
  serviceName: "Digital Clinical History",
  homeLabel: "MediKiosk home",
  welcomeTitle: "Tell us about your health before you meet the doctor.",
  welcomeDescription: "We will ask a few simple questions to help prepare your visit.",
  start: "Start",
  needHelp: "Need help?",
  chooseLanguage: "Choose your language",
  chooseLanguageSecondary: "Select a language",
  languageEnglish: "English",
  languageHindi: "हिंदी",
  languageBengali: "বাংলা",
  languageTelugu: "తెలుగు",
  languageTamil: "தமிழ்",
  languageMarathi: "मराठी",
  englishHint: "Continue in English",
  hindiHint: "हिंदी में जारी रखें",
  bengaliHint: "বাংলায় চালিয়ে যান",
  teluguHint: "తెలుగులో కొనసాగించండి",
  tamilHint: "தமிழில் தொடரவும்",
  marathiHint: "मराठीत सुरू ठेवा",
  consentTitle: "Before we begin",
  consentIntro: "We will collect some information before your consultation.",
  consentPointOne: "This helps your doctor prepare for your visit.",
  consentPointTwo: "You can ask for help at any time.",
  consentPointThree: "Your information will be handled carefully for this consultation.",
  consentAgree: "I Agree & Continue",
  consentBack: "Go back",
  consentReadMore: "Read more",
  consentDetails: "By continuing, you agree that MediKiosk may collect the information you provide to help prepare your clinical consultation. Approved service and privacy wording can be added here later.",
  consentDeclined: "Please choose “I Agree & Continue” to continue.",
  startTitle: "You are ready to begin.",
  startDescription: "Your answers will help the doctor understand what you want to discuss.",
  startNote: "The next part of your visit will be added in the next phase.",
  languageStep: "Language",
  consentStep: "Consent",
  startStep: "Start",
  progressLabel: "Onboarding progress",
  helpTitle: "Need help?",
  helpDescription: "Please ask a member of staff for assistance. Voice assistance will be available in a future phase.",
  close: "Close",
  languageSaved: "Language selected",
  loading: "Loading MediKiosk…",
  errorTitle: "Something went wrong.",
  errorDescription: "Please try again or ask a member of staff for help.",
  tryAgain: "Try again",
} as const;

export type TranslationKey = keyof typeof english;
export type TranslationDictionary = Record<TranslationKey, string>;

const sharedLanguageLabels = {
  languageEnglish: "English",
  languageHindi: "हिंदी",
  languageBengali: "বাংলা",
  languageTelugu: "తెలుగు",
  languageTamil: "தமிழ்",
  languageMarathi: "मराठी",
};

export const translations: Record<PatientLanguage, TranslationDictionary> = {
  en: english,
  hi: {
    ...english,
    serviceName: "डिजिटल क्लिनिकल हिस्ट्री",
    welcomeTitle: "डॉक्टर से मिलने से पहले हमें अपने स्वास्थ्य के बारे में बताएं।",
    welcomeDescription: "आपकी मुलाकात की तैयारी में मदद के लिए हम कुछ आसान सवाल पूछेंगे।",
    start: "शुरू करें", needHelp: "मदद चाहिए?", chooseLanguage: "अपनी भाषा चुनें", chooseLanguageSecondary: "अपनी भाषा चुनें",
    ...sharedLanguageLabels, homeLabel: "MediKiosk का मुख्य पृष्ठ", englishHint: "अंग्रेज़ी में जारी रखें", hindiHint: "हिंदी में जारी रखें", bengaliHint: "बंगाली में जारी रखें", teluguHint: "तेलुगु में जारी रखें", tamilHint: "तमिल में जारी रखें", marathiHint: "मराठी में जारी रखें",
    consentTitle: "शुरू करने से पहले", consentIntro: "आपकी मुलाकात से पहले हम कुछ जानकारी लेंगे।", consentPointOne: "इससे डॉक्टर आपकी मुलाकात के लिए तैयारी कर सकेंगे।", consentPointTwo: "आप कभी भी मदद मांग सकते हैं।", consentPointThree: "आपकी जानकारी इस मुलाकात के लिए सावधानी से संभाली जाएगी।", consentAgree: "मैं सहमत हूं और आगे बढ़ना चाहता/चाहती हूं", consentBack: "वापस जाएं", consentReadMore: "और पढ़ें", consentDetails: "आगे बढ़ने पर आप सहमत हैं कि MediKiosk आपकी दी हुई जानकारी को आपकी क्लिनिकल मुलाकात की तैयारी में मदद के लिए ले सकता है। स्वीकृत सेवा और गोपनीयता की भाषा बाद में यहां जोड़ी जा सकती है।", consentDeclined: "आगे बढ़ने के लिए कृपया “मैं सहमत हूं और आगे बढ़ना चाहता/चाहती हूं” चुनें।",
    startTitle: "आप शुरू करने के लिए तैयार हैं।", startDescription: "आपके जवाब डॉक्टर को यह समझने में मदद करेंगे कि आप किन बातों पर चर्चा करना चाहते हैं।", startNote: "आपकी मुलाकात का अगला हिस्सा अगले चरण में जोड़ा जाएगा।", languageStep: "भाषा", consentStep: "सहमति", startStep: "शुरू", progressLabel: "शुरुआत की प्रगति", helpTitle: "मदद चाहिए?", helpDescription: "कृपया सहायता के लिए स्टाफ के किसी सदस्य से पूछें। आवाज़ की सहायता अगले चरण में उपलब्ध होगी।", close: "बंद करें", languageSaved: "भाषा चुनी गई", loading: "MediKiosk लोड हो रहा है…", errorTitle: "कुछ गलत हो गया।", errorDescription: "कृपया फिर कोशिश करें या स्टाफ के किसी सदस्य से मदद मांगें।", tryAgain: "फिर कोशिश करें",
  },
  bn: {
    ...english,
    serviceName: "ডিজিটাল ক্লিনিক্যাল ইতিহাস", welcomeTitle: "ডাক্তারের সঙ্গে দেখা করার আগে আপনার স্বাস্থ্য সম্পর্কে আমাদের বলুন।", welcomeDescription: "আপনার সাক্ষাতের প্রস্তুতিতে সাহায্য করার জন্য আমরা কয়েকটি সহজ প্রশ্ন করব।", start: "শুরু করুন", needHelp: "সাহায্য দরকার?", chooseLanguage: "আপনার ভাষা বেছে নিন", chooseLanguageSecondary: "আপনার ভাষা নির্বাচন করুন",
    ...sharedLanguageLabels, homeLabel: "MediKiosk মূল পৃষ্ঠা", englishHint: "ইংরেজিতে চালিয়ে যান", hindiHint: "হিন্দিতে চালিয়ে যান", bengaliHint: "বাংলায় চালিয়ে যান", teluguHint: "তেলুগুতে চালিয়ে যান", tamilHint: "তামিলে চালিয়ে যান", marathiHint: "মারাঠিতে চালিয়ে যান",
    consentTitle: "শুরু করার আগে", consentIntro: "আপনার পরামর্শের আগে আমরা কিছু তথ্য সংগ্রহ করব।", consentPointOne: "এতে ডাক্তার আপনার সাক্ষাতের জন্য প্রস্তুতি নিতে পারবেন।", consentPointTwo: "আপনি যেকোনো সময় সাহায্য চাইতে পারেন।", consentPointThree: "এই সাক্ষাতের জন্য আপনার তথ্য যত্ন সহকারে রাখা হবে।", consentAgree: "আমি সম্মত, এগিয়ে যান", consentBack: "ফিরে যান", consentReadMore: "আরও পড়ুন", consentDetails: "এগিয়ে গেলে আপনি সম্মতি দিচ্ছেন যে MediKiosk আপনার দেওয়া তথ্য ক্লিনিক্যাল পরামর্শের প্রস্তুতিতে ব্যবহার করতে পারে। অনুমোদিত পরিষেবা ও গোপনীয়তার ভাষা পরে এখানে যোগ করা যাবে।", consentDeclined: "এগিয়ে যেতে অনুগ্রহ করে “আমি সম্মত, এগিয়ে যান” নির্বাচন করুন।",
    startTitle: "আপনি শুরু করার জন্য প্রস্তুত।", startDescription: "আপনার উত্তর ডাক্তারকে আপনি কোন বিষয় নিয়ে আলোচনা করতে চান তা বুঝতে সাহায্য করবে।", startNote: "আপনার সাক্ষাতের পরের অংশ পরবর্তী ধাপে যোগ করা হবে।", languageStep: "ভাষা", consentStep: "সম্মতি", startStep: "শুরু", progressLabel: "শুরুর অগ্রগতি", helpTitle: "সাহায্য দরকার?", helpDescription: "সাহায্যের জন্য অনুগ্রহ করে স্টাফের কোনো সদস্যকে বলুন। কণ্ঠস্বরের সহায়তা পরবর্তী ধাপে পাওয়া যাবে।", close: "বন্ধ করুন", languageSaved: "ভাষা নির্বাচিত হয়েছে", loading: "MediKiosk লোড হচ্ছে…", errorTitle: "কিছু সমস্যা হয়েছে।", errorDescription: "অনুগ্রহ করে আবার চেষ্টা করুন অথবা স্টাফের সাহায্য নিন।", tryAgain: "আবার চেষ্টা করুন",
  },
  te: {
    ...english,
    serviceName: "డిజిటల్ క్లినికల్ చరిత్ర", welcomeTitle: "డాక్టర్‌ను కలవడానికి ముందు మీ ఆరోగ్యం గురించి మాకు చెప్పండి.", welcomeDescription: "మీ సందర్శనకు సిద్ధం కావడంలో సహాయపడేందుకు మేము కొన్ని సులభమైన ప్రశ్నలు అడుగుతాము.", start: "ప్రారంభించండి", needHelp: "సహాయం కావాలా?", chooseLanguage: "మీ భాషను ఎంచుకోండి", chooseLanguageSecondary: "మీ భాషను ఎంచుకోండి",
    ...sharedLanguageLabels, homeLabel: "MediKiosk హోమ్", englishHint: "ఆంగ్లంలో కొనసాగించండి", hindiHint: "హిందీలో కొనసాగించండి", bengaliHint: "బెంగాలీలో కొనసాగించండి", teluguHint: "తెలుగులో కొనసాగించండి", tamilHint: "తమిళంలో కొనసాగించండి", marathiHint: "మరాఠీలో కొనసాగించండి",
    consentTitle: "ప్రారంభించే ముందు", consentIntro: "మీ సంప్రదింపుకు ముందు మేము కొంత సమాచారాన్ని సేకరిస్తాము.", consentPointOne: "ఇది మీ సందర్శనకు సిద్ధం కావడానికి డాక్టర్‌కు సహాయపడుతుంది.", consentPointTwo: "మీరు ఎప్పుడైనా సహాయం అడగవచ్చు.", consentPointThree: "ఈ సంప్రదింపుకు మీ సమాచారం జాగ్రత్తగా నిర్వహించబడుతుంది.", consentAgree: "నేను అంగీకరిస్తున్నాను, కొనసాగించండి", consentBack: "వెనక్కి వెళ్ళండి", consentReadMore: "మరింత చదవండి", consentDetails: "కొనసాగించడం ద్వారా, మీ క్లినికల్ సంప్రదింపును సిద్ధం చేయడానికి మీరు అందించే సమాచారాన్ని MediKiosk సేకరించవచ్చని మీరు అంగీకరిస్తున్నారు. ఆమోదించిన సేవ మరియు గోప్యతా పదాలను తరువాత ఇక్కడ చేర్చవచ్చు.", consentDeclined: "కొనసాగించడానికి దయచేసి “నేను అంగీకరిస్తున్నాను, కొనసాగించండి” ఎంచుకోండి.",
    startTitle: "మీరు ప్రారంభించడానికి సిద్ధంగా ఉన్నారు.", startDescription: "మీరు చర్చించాలనుకుంటున్న విషయాలను డాక్టర్ అర్థం చేసుకోవడానికి మీ సమాధానాలు సహాయపడతాయి.", startNote: "మీ సందర్శనలోని తదుపరి భాగం తరువాతి దశలో చేర్చబడుతుంది.", languageStep: "భాష", consentStep: "సమ్మతి", startStep: "ప్రారంభం", progressLabel: "ప్రారంభ పురోగతి", helpTitle: "సహాయం కావాలా?", helpDescription: "సహాయం కోసం దయచేసి సిబ్బంది సభ్యుడిని అడగండి. వాయిస్ సహాయం తరువాతి దశలో అందుబాటులో ఉంటుంది.", close: "మూసివేయండి", languageSaved: "భాష ఎంచుకోబడింది", loading: "MediKiosk లోడ్ అవుతోంది…", errorTitle: "ఏదో తప్పు జరిగింది.", errorDescription: "దయచేసి మళ్లీ ప్రయత్నించండి లేదా సిబ్బంది సహాయం అడగండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
  },
  ta: {
    ...english,
    serviceName: "டிஜிட்டல் மருத்துவ வரலாறு", welcomeTitle: "மருத்துவரை சந்திப்பதற்கு முன் உங்கள் உடல்நலம் பற்றி எங்களிடம் கூறுங்கள்.", welcomeDescription: "உங்கள் வருகைக்கு தயாராக உதவ சில எளிய கேள்விகளைக் கேட்போம்.", start: "தொடங்குங்கள்", needHelp: "உதவி வேண்டுமா?", chooseLanguage: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்", chooseLanguageSecondary: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்",
    ...sharedLanguageLabels, homeLabel: "MediKiosk முகப்பு", englishHint: "ஆங்கிலத்தில் தொடரவும்", hindiHint: "இந்தியில் தொடரவும்", bengaliHint: "வங்காளத்தில் தொடரவும்", teluguHint: "தெலுங்கில் தொடரவும்", tamilHint: "தமிழில் தொடரவும்", marathiHint: "மராத்தியில் தொடரவும்",
    consentTitle: "தொடங்குவதற்கு முன்", consentIntro: "உங்கள் ஆலோசனைக்கு முன் சில தகவல்களைச் சேகரிப்போம்.", consentPointOne: "இது உங்கள் வருகைக்கு மருத்துவர் தயாராக உதவும்.", consentPointTwo: "நீங்கள் எப்போது வேண்டுமானாலும் உதவி கேட்கலாம்.", consentPointThree: "இந்த ஆலோசனைக்காக உங்கள் தகவல் கவனமாக கையாளப்படும்.", consentAgree: "நான் ஒப்புக்கொள்கிறேன், தொடரவும்", consentBack: "பின்செல்லவும்", consentReadMore: "மேலும் படிக்கவும்", consentDetails: "தொடர்வதன் மூலம், உங்கள் மருத்துவ ஆலோசனையைத் தயாரிக்க நீங்கள் வழங்கும் தகவலை MediKiosk சேகரிக்கலாம் என்பதை ஒப்புக்கொள்கிறீர்கள். அங்கீகரிக்கப்பட்ட சேவை மற்றும் தனியுரிமை உரை பின்னர் இங்கே சேர்க்கப்படும்.", consentDeclined: "தொடர “நான் ஒப்புக்கொள்கிறேன், தொடரவும்” என்பதைத் தேர்ந்தெடுக்கவும்.",
    startTitle: "நீங்கள் தொடங்கத் தயாராக உள்ளீர்கள்.", startDescription: "நீங்கள் விவாதிக்க விரும்புவதை மருத்துவர் புரிந்துகொள்ள உங்கள் பதில்கள் உதவும்.", startNote: "உங்கள் வருகையின் அடுத்த பகுதி அடுத்த கட்டத்தில் சேர்க்கப்படும்.", languageStep: "மொழி", consentStep: "ஒப்புதல்", startStep: "தொடக்கம்", progressLabel: "தொடக்க முன்னேற்றம்", helpTitle: "உதவி வேண்டுமா?", helpDescription: "உதவிக்கு பணியாளர் ஒருவரிடம் கேளுங்கள். குரல் உதவி அடுத்த கட்டத்தில் கிடைக்கும்.", close: "மூடவும்", languageSaved: "மொழி தேர்ந்தெடுக்கப்பட்டது", loading: "MediKiosk ஏற்றப்படுகிறது…", errorTitle: "ஏதோ தவறு ஏற்பட்டது.", errorDescription: "மீண்டும் முயற்சிக்கவும் அல்லது பணியாளரிடம் உதவி கேட்கவும்.", tryAgain: "மீண்டும் முயற்சிக்கவும்",
  },
  mr: {
    ...english,
    serviceName: "डिजिटल क्लिनिकल इतिहास", welcomeTitle: "डॉक्टरांना भेटण्यापूर्वी आपल्या आरोग्याबद्दल आम्हाला सांगा.", welcomeDescription: "आपल्या भेटीची तयारी करण्यासाठी आम्ही काही सोपे प्रश्न विचारू.", start: "सुरू करा", needHelp: "मदत हवी आहे?", chooseLanguage: "तुमची भाषा निवडा", chooseLanguageSecondary: "तुमची भाषा निवडा",
    ...sharedLanguageLabels, homeLabel: "MediKiosk मुख्य पृष्ठ", englishHint: "इंग्रजीमध्ये पुढे जा", hindiHint: "हिंदीमध्ये पुढे जा", bengaliHint: "बंगालीमध्ये पुढे जा", teluguHint: "तेलुगूमध्ये पुढे जा", tamilHint: "तमिळमध्ये पुढे जा", marathiHint: "मराठीमध्ये पुढे जा",
    consentTitle: "सुरुवात करण्यापूर्वी", consentIntro: "आपल्या सल्लामसलतीपूर्वी आम्ही काही माहिती घेऊ.", consentPointOne: "यामुळे डॉक्टरांना आपल्या भेटीची तयारी करण्यास मदत होईल.", consentPointTwo: "आपण कधीही मदत मागू शकता.", consentPointThree: "या सल्लामसलतीसाठी आपली माहिती काळजीपूर्वक हाताळली जाईल.", consentAgree: "मी सहमत आहे आणि पुढे जा", consentBack: "मागे जा", consentReadMore: "अधिक वाचा", consentDetails: "पुढे गेल्यावर, आपल्या क्लिनिकल सल्लामसलतीची तयारी करण्यासाठी आपण दिलेली माहिती MediKiosk गोळा करू शकते यास आपण सहमती देता. मंजूर सेवा आणि गोपनीयता मजकूर नंतर येथे जोडला जाईल.", consentDeclined: "पुढे जाण्यासाठी कृपया “मी सहमत आहे आणि पुढे जा” निवडा.",
    startTitle: "आपण सुरुवात करण्यास तयार आहात.", startDescription: "आपण कोणत्या विषयांवर चर्चा करू इच्छिता हे डॉक्टरांना समजण्यास आपली उत्तरे मदत करतील.", startNote: "आपल्या भेटीचा पुढील भाग पुढील टप्प्यात जोडला जाईल.", languageStep: "भाषा", consentStep: "संमती", startStep: "सुरुवात", progressLabel: "सुरुवातीची प्रगती", helpTitle: "मदत हवी आहे?", helpDescription: "मदतीसाठी कृपया कर्मचाऱ्याला विचारा. आवाजाची मदत पुढील टप्प्यात उपलब्ध होईल.", close: "बंद करा", languageSaved: "भाषा निवडली आहे", loading: "MediKiosk लोड होत आहे…", errorTitle: "काहीतरी चूक झाली.", errorDescription: "कृपया पुन्हा प्रयत्न करा किंवा कर्मचाऱ्याची मदत घ्या.", tryAgain: "पुन्हा प्रयत्न करा",
  },
};

export function getTranslation(language: PatientLanguage, key: TranslationKey): string {
  return translations[language][key];
}

export function getMissingTranslationKeys(language: PatientLanguage): TranslationKey[] {
  return Object.keys(english).filter((key) => !translations[language][key as TranslationKey]) as TranslationKey[];
}
