// Offline phrasebook: the essentials for each language on the route, with
// native script (big, to show someone), a pronunciation guide (Hepburn
// romaji / Hanyu pinyin / Jyutping) and the English. Bundled, so it works
// with no signal. Mainland China uses Mandarin in simplified characters;
// Hong Kong uses Cantonese in traditional characters.
//
// Written carefully but not yet checked by a native speaker — worth a
// once-over by one before the trip.

export type LangKey = 'ja' | 'zh' | 'yue';

export const LANGUAGES: {
  key: LangKey;
  name: string;
  where: string;
  /** BCP-47 tag for text-to-speech. */
  speech: string;
  /** Name of the pronunciation guide. */
  guide: string;
  country: 'japan' | 'china' | 'hongKong';
}[] = [
  { key: 'ja', name: 'Japanese', where: 'Japan', speech: 'ja-JP', guide: 'Romaji', country: 'japan' },
  { key: 'zh', name: 'Mandarin', where: 'Mainland China', speech: 'zh-CN', guide: 'Pinyin', country: 'china' },
  { key: 'yue', name: 'Cantonese', where: 'Hong Kong', speech: 'zh-HK', guide: 'Jyutping', country: 'hongKong' },
];

export type Say = { text: string; say: string };
export type Phrase = { id: string; en: string } & Record<LangKey, Say>;

export const CATEGORIES = ['Basics', 'Getting around', 'Food & drink', 'Shopping', 'Help'] as const;
export type Category = (typeof CATEGORIES)[number];

const p = (id: string, en: string, ja: [string, string], zh: [string, string], yue: [string, string]): Phrase => ({
  id,
  en,
  ja: { text: ja[0], say: ja[1] },
  zh: { text: zh[0], say: zh[1] },
  yue: { text: yue[0], say: yue[1] },
});

export const PHRASES: Record<Category, Phrase[]> = {
  Basics: [
    p('hello', 'Hello', ['こんにちは', 'konnichiwa'], ['你好', 'nǐ hǎo'], ['你好', 'nei5 hou2']),
    p('morning', 'Good morning', ['おはようございます', 'ohayō gozaimasu'], ['早上好', 'zǎoshang hǎo'], ['早晨', 'zou2 san4']),
    p('thanks', 'Thank you', ['ありがとうございます', 'arigatō gozaimasu'], ['谢谢', 'xièxie'], ['唔該', 'm4 goi1']),
    p('excuse', 'Excuse me / sorry', ['すみません', 'sumimasen'], ['不好意思', 'bù hǎo yìsi'], ['唔好意思', 'm4 hou2 ji3 si1']),
    p('yes', 'Yes', ['はい', 'hai'], ['是的', 'shì de'], ['係', 'hai6']),
    p('no', 'No', ['いいえ', 'iie'], ['不是', 'bú shì'], ['唔係', 'm4 hai6']),
    p('please', 'Please (when asking for something)', ['お願いします', 'onegaishimasu'], ['请', 'qǐng'], ['唔該', 'm4 goi1']),
    p('english', 'Do you speak English?', ['英語を話せますか？', 'eigo o hanasemasu ka?'], ['你会说英语吗？', 'nǐ huì shuō yīngyǔ ma?'], ['你識唔識講英文？', 'nei5 sik1 m4 sik1 gong2 jing1 man2?']),
    p('understand', 'I don’t understand', ['わかりません', 'wakarimasen'], ['我听不懂', 'wǒ tīng bù dǒng'], ['我唔明', 'ngo5 m4 ming4']),
    p('photo', 'Could you take a photo of us?', ['写真を撮っていただけますか？', 'shashin o totte itadakemasu ka?'], ['可以帮我们拍张照吗？', 'kěyǐ bāng wǒmen pāi zhāng zhào ma?'], ['可唔可以幫我哋影張相？', 'ho2 m4 ho2 ji5 bong1 ngo5 dei6 jing2 zoeng1 soeng2?']),
    p('bye', 'Goodbye', ['さようなら', 'sayōnara'], ['再见', 'zàijiàn'], ['拜拜', 'baai1 baai3']),
  ],
  'Getting around': [
    p('toilet', 'Where is the toilet?', ['トイレはどこですか？', 'toire wa doko desu ka?'], ['洗手间在哪里？', 'xǐshǒujiān zài nǎlǐ?'], ['洗手間喺邊度？', 'sai2 sau2 gaan1 hai2 bin1 dou6?']),
    p('station', 'Where is the station?', ['駅はどこですか？', 'eki wa doko desu ka?'], ['地铁站在哪里？', 'dìtiě zhàn zài nǎlǐ?'], ['港鐵站喺邊度？', 'gong2 tit3 zaam6 hai2 bin1 dou6?']),
    p('exit', 'Where is the exit?', ['出口はどこですか？', 'deguchi wa doko desu ka?'], ['出口在哪里？', 'chūkǒu zài nǎlǐ?'], ['出口喺邊度？', 'ceot1 hau2 hai2 bin1 dou6?']),
    p('address', 'Please take me to this address', ['この住所までお願いします', 'kono jūsho made onegaishimasu'], ['请带我去这个地址', 'qǐng dài wǒ qù zhège dìzhǐ'], ['唔該去呢個地址', 'm4 goi1 heoi3 ni1 go3 dei6 zi2']),
    p('stop', 'Please stop here', ['ここで止めてください', 'koko de tomete kudasai'], ['请在这里停', 'qǐng zài zhèlǐ tíng'], ['唔該呢度停', 'm4 goi1 ni1 dou6 ting4']),
    p('lost', 'I’m lost', ['道に迷いました', 'michi ni mayoimashita'], ['我迷路了', 'wǒ mílù le'], ['我蕩失路', 'ngo5 dong6 sat1 lou6']),
  ],
  'Food & drink': [
    p('this', 'This one, please', ['これをください', 'kore o kudasai'], ['我要这个', 'wǒ yào zhège'], ['唔該，我要呢個', 'm4 goi1, ngo5 jiu3 ni1 go3']),
    p('water', 'Water, please', ['お水をください', 'omizu o kudasai'], ['请给我一杯水', 'qǐng gěi wǒ yì bēi shuǐ'], ['唔該畀杯水我', 'm4 goi1 bei2 bui1 seoi2 ngo5']),
    p('bill', 'The bill, please', ['お会計お願いします', 'okaikei onegaishimasu'], ['买单', 'mǎidān'], ['唔該埋單', 'm4 goi1 maai4 daan1']),
    p('notspicy', 'Not spicy, please', ['辛くしないでください', 'karaku shinaide kudasai'], ['不要辣', 'bú yào là'], ['唔要辣', 'm4 jiu3 laat6']),
    p('vegetarian', 'I’m vegetarian', ['ベジタリアンです', 'bejitarian desu'], ['我吃素', 'wǒ chī sù'], ['我食齋', 'ngo5 sik6 zaai1']),
    p('nuts', 'I’m allergic to nuts', ['ナッツアレルギーがあります', 'nattsu arerugī ga arimasu'], ['我对坚果过敏', 'wǒ duì jiānguǒ guòmǐn'], ['我對果仁敏感', 'ngo5 deoi3 gwo2 jan4 man5 gam2']),
    p('delicious', 'Delicious!', ['おいしい！', 'oishii!'], ['好吃！', 'hǎochī!'], ['好好食！', 'hou2 hou2 sik6!']),
  ],
  Shopping: [
    p('howmuch', 'How much is this?', ['これはいくらですか？', 'kore wa ikura desu ka?'], ['这个多少钱？', 'zhège duōshao qián?'], ['呢個幾多錢？', 'ni1 go3 gei2 do1 cin2?']),
    p('card', 'Can I pay by card?', ['カードで払えますか？', 'kādo de haraemasu ka?'], ['可以刷卡吗？', 'kěyǐ shuākǎ ma?'], ['可唔可以碌卡？', 'ho2 m4 ho2 ji5 luk1 kaat1?']),
    p('mobilepay', 'Can I pay with my phone?', ['スマホで払えますか？', 'sumaho de haraemasu ka?'], ['可以用支付宝吗？', 'kěyǐ yòng Zhīfùbǎo ma?'], ['可唔可以用八達通？', 'ho2 m4 ho2 ji5 jung6 baat3 daat6 tung1?']),
    p('cheaper', 'Can it be a bit cheaper?', ['少し安くなりますか？', 'sukoshi yasuku narimasu ka?'], ['可以便宜一点吗？', 'kěyǐ piányi yìdiǎn ma?'], ['可唔可以平啲？', 'ho2 m4 ho2 ji5 peng4 di1?']),
    p('justlooking', 'Just looking, thanks', ['見ているだけです', 'mite iru dake desu'], ['我只是看看', 'wǒ zhǐshì kànkan'], ['我睇吓啫', 'ngo5 tai2 haa5 ze1']),
  ],
  Help: [
    p('help', 'Help!', ['助けて！', 'tasukete!'], ['救命！', 'jiùmìng!'], ['救命！', 'gau3 meng6!']),
    p('doctor', 'Please call a doctor', ['医者を呼んでください', 'isha o yonde kudasai'], ['请叫医生', 'qǐng jiào yīshēng'], ['唔該叫醫生', 'm4 goi1 giu3 ji1 sang1']),
    p('ambulance', 'Please call an ambulance', ['救急車を呼んでください', 'kyūkyūsha o yonde kudasai'], ['请叫救护车', 'qǐng jiào jiùhùchē'], ['唔該叫白車', 'm4 goi1 giu3 baak6 ce1']),
    p('police', 'Please call the police', ['警察を呼んでください', 'keisatsu o yonde kudasai'], ['请叫警察', 'qǐng jiào jǐngchá'], ['唔該報警', 'm4 goi1 bou3 ging2']),
    p('pharmacy', 'Where is a pharmacy?', ['薬局はどこですか？', 'yakkyoku wa doko desu ka?'], ['药店在哪里？', 'yàodiàn zài nǎlǐ?'], ['藥房喺邊度？', 'joek6 fong4 hai2 bin1 dou6?']),
  ],
};

/** Emergency numbers, shown with the Help phrases. */
export const EMERGENCY: Record<LangKey, string> = {
  ja: 'Police 110 · Ambulance & fire 119',
  zh: 'Police 110 · Ambulance 120 · Fire 119',
  yue: 'Police, ambulance & fire 999',
};
