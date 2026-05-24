import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const START_GOLD = 1650;
const MAX_REP = 5;
const TABS = ['Silah','Savunma','Hareket','Destek','Ekip','Garaj','Görev'];
const statNames = {fireRes:'Ateş Koruması', water:'Su Gücü', electricRes:'Elektrik Koruması', chemRes:'Kimyasal Koruma', bioRes:'Biyo Koruma', armor:'Zırh', pierce:'Zırh Delme', speed:'Hız', control:'Kontrol', radar:'Radar', energy:'Enerji', damage:'Hasar', shield:'Kalkan', repair:'Tamir', morale:'Moral', cyberRes:'Siber Koruma'};
const emptyStats = Object.fromEntries(Object.keys(statNames).map(k=>[k,0]));

function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function rng(seed){ const x = Math.sin(seed * 999.123) * 10000; return x - Math.floor(x); }
function stars(n){ const f=Math.floor(n); return '★'.repeat(f)+'☆'.repeat(5-f); }
function sellPrice(p){ return Math.floor((p?.cost||0)*0.5); }
function StarRating({value}){ const f=Math.floor(value); return <span className="stars" title="Yıldız = İtibar / kalite">{[0,1,2,3,4].map(i=><span key={i} className={i<f?'full':'empty'}>★</span>)}</span>; }
function cleanName(v){ return String(v||'Kıvılcım').replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ ]/g,'').trim().split(' ')[0] || 'Kıvılcım'; }
function useSound(){
  return (kind='click')=>{
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext; if(!Ctx) return;
      const ctx = new Ctx(); const osc=ctx.createOscillator(); const gain=ctx.createGain();
      const tones={click:380,buy:620,bad:150,good:760,win:920,lose:110,spark:520};
      osc.frequency.value=tones[kind]||360; osc.type=kind==='bad'||kind==='lose'?'sawtooth':'triangle';
      gain.gain.setValueAtTime(0.0001,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.08,ctx.currentTime+0.015); gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.16);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+0.18);
    }catch{}
  }
}

const STORY_MUSIC_SCREENS = new Set(['opening','directRevenge','leaveStory','returnRevenge','tutorial','levelStory','jobOffer']);
function musicFileFor(screen, battle, done, storyIndex=0, level=1, badMemory=false){
  if(screen==='battle') return done ? (battle?.won ? '/audio/victory.mp3' : '/audio/defeat.mp3') : '/audio/battle.mp3';
  if(screen==='splash' || screen==='company' || screen==='introChoice') return '/audio/menu.mp3';
  if(screen==='build' || screen==='nameRobot') return '/audio/workshop.mp3';
  if(screen==='champion') return '/audio/endings/champion.mp3';
  if(screen==='badEnd') return '/audio/endings/bad-end.mp3';
  if(screen==='employeeEnd') return '/audio/endings/employee-end.mp3';
  if(screen==='credits') return '/audio/endings/credits.mp3';
  if(screen==='employeeCredits') return '/audio/endings/employee-credits.mp3';
  // Bölüm başına tek müzik sistemi.
  // opening-1 hariç: ilk mezuniyet sahnesi özel, opening-2 ve sonrası aynı opening.mp3 ile kesintisiz devam eder.
  if(screen==='opening') {
    if(badMemory) return '/audio/story/comeback.mp3';
    return storyIndex===0 ? '/audio/story/opening-1.mp3' : '/audio/story/opening.mp3';
  }
  if(screen==='directRevenge') return '/audio/story/direct-revenge.mp3';
  if(screen==='leaveStory') return '/audio/story/leave.mp3';
  if(screen==='returnRevenge') return '/audio/story/return.mp3';
  if(screen==='tutorial') return '/audio/story/tutorial.mp3';
  if(screen==='levelStory') return `/audio/story/level-${level}.mp3`;
  if(screen==='jobOffer') return '/audio/story/job-offer.mp3';
  return '/audio/story.mp3';
}
function musicFallbackFor(screen, battle, done){
  if(screen==='battle') return done ? (battle?.won ? '/audio/victory.mp3' : '/audio/defeat.mp3') : '/audio/battle.mp3';
  if(screen==='champion') return '/audio/victory.mp3';
  if(screen==='badEnd') return '/audio/defeat.mp3';
  if(screen==='employeeEnd' || screen==='credits' || screen==='employeeCredits' || screen==='jobOffer') return '/audio/ending.mp3';
  if(screen==='splash' || screen==='company' || screen==='introChoice') return '/audio/menu.mp3';
  if(screen==='build' || screen==='nameRobot') return '/audio/workshop.mp3';
  return '/audio/story.mp3';
}

function useMp3Music(enabled, screen, battle, done, storyIndex=0, level=1, badMemory=false){
  const audioRef = useRef(null);
  const currentSrcRef = useRef('');
  const failedSrcRef = useRef(new Set());

  useEffect(()=>{
    if(!audioRef.current){
      const audio = new Audio();
      audio.loop = true;
      audio.volume = 0.45;
      audio.preload = 'auto';
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    const wantedSrc = musicFileFor(screen, battle, done, storyIndex, level, badMemory);
    const fallbackSrc = musicFallbackFor(screen, battle, done);
    const nextSrc = failedSrcRef.current.has(wantedSrc) ? fallbackSrc : wantedSrc;

    const tryPlay = () => {
      if(!enabled) return;
      if(audio.paused) audio.play().catch(()=>{});
    };

    audio.onerror = ()=>{
      const failed = currentSrcRef.current;
      if(failed) failedSrcRef.current.add(failed);
      if(failed !== fallbackSrc){
        currentSrcRef.current = fallbackSrc;
        audio.pause();
        audio.src = fallbackSrc;
        audio.currentTime = 0;
        tryPlay();
      }
    };

    // Önemli: Aynı müzik dosyası zaten çalıyorsa tekrar src atama.
    // Böylece opening-2 -> opening-3 gibi geçişlerde müzik kesilmeden devam eder.
    if(currentSrcRef.current !== nextSrc){
      currentSrcRef.current = nextSrc;
      audio.pause();
      audio.src = nextSrc;
      audio.currentTime = 0;
    }

    if(!enabled){
      audio.pause();
    }else{
      tryPlay();
    }

    window.__vsRobotMusicPlay = tryPlay;
    window.addEventListener('unlock-vsrobot-music', tryPlay);
    window.addEventListener('pointerdown', tryPlay);
    window.addEventListener('keydown', tryPlay);
    window.addEventListener('touchstart', tryPlay);
    return ()=>{
      window.removeEventListener('unlock-vsrobot-music', tryPlay);
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
      window.removeEventListener('touchstart', tryPlay);
    };
  }, [enabled, screen, done, battle?.won, storyIndex, level, badMemory]);

  useEffect(()=>()=>{
    audioRef.current?.pause();
  }, []);
}


const introStory = [
  {emoji:'🎓🧳', art:'diplomaRoad', title:'Tebrikler, mezun oldun', text:'Diplomanı eline almıştın. Önünde mis gibi bir gelecek, güzel bir iş, kuracağın yuva… Her şey hazırdı. Ama önce seni sanayinin isiyle pasıyla, nasırlı elleriyle büyüten anne babanın elini öpmek için memlekete dönmen gerekiyordu.'},
  {emoji:'😢🏠', art:'motherDoor', title:'Kapıda annen vardı', text:'Mahalle sokağına girdiğinde içine bir huzursuzluk çöktü. Eve yaklaştın; annen kapının eşiğinde, tozun toprağın içinde feryat figan ağlıyordu. Çantanı yere fırlatıp diz çöktün: “Anne! Ne oldu? Ne oldu anlatsana!?”'},
  {emoji:'💔😭', art:'motherCry', title:'O söz her şeyi yıktı', text:'Annen hıçkıra hıçkıra boynuna sarıldı. Sesi bütün mahalleyi yaktı: “Evladım… Yiğidim… Babanı vurdular oğlum… Garajı bastılar… bastılar!” O an ayaklarının altından zemin çekildi.'},
  {emoji:'🌧️🏚️', art:'garageRain', title:'Yağmurun altında garaja koştun', text:'Koşa koşa mahallenin sonundaki eski garaja gittin. Yağmur deli gibi yağıyordu. Kapının üstündeki paslı, boyası dökülmüş tabela gözünü deldi: “Usta Kemal Sanayi.” Elin titreyerek kapıyı ittirdin.'},
  {emoji:'🩸👨‍🔧', art:'fatherFinal', title:'Baban hâlâ nefes alıyordu', text:'İçerisi darmadağındı. Yılların emeği, çizimler, aletler yerde çiğnenmişti. Baban tezgâhın dibinde kanlar içinde, yarı baygın yatıyordu. Başını kucağına aldın: “Baba! Baba ne oldu, uyan!” O da gözlerini zorlukla aralayıp gömleğine yapıştı.'},
  {emoji:'📄🎟️', art:'ticketVow', title:'Son isteği', text:'Baban son nefesiyle fısıldadı: “Çaldılar oğlum… Her şeyimi çaldılar. O MegaCore ömrümü verdiğim projemi gasp etti. Ustalarımı kaçırdılar. Adımı, şerefimi sildiler…” Sonra cebinden kenarı kanlı bir kâğıt çıkarıp avucuna bastırdı: Robot Savaşları Katılım Bileti. “Şerefimizi kurtar oğlum… O katilleri kendi arenalarında yerle bir et…” dedi ve gözlerinin önünde son nefesini verdi.'},
  {emoji:'🕯️🤖', art:'funeralRobot', title:'Cenazeden sonra garaja döndün', text:'O gece yine garajdaydın. Gözlerinde hırstan ve nefretten başka bir şey kalmamıştı. Köşedeki brandayı bir hamlede çekip yere attın. Karşında babanın bitiremediği, saf çelikten devasa robot duruyordu. İşte tam orada karar verme vakti geldi.'}
];

const directRevengeStory = [
  {emoji:'🔴🤖', art:'redButton', title:'Kırmızı düğme', text:'Robotun göğsündeki büyük kırmızı düğmeye bastın. Mavi ışık yandı. Hoparlörden babanın kendi elleriyle kaydettiği o neşeli, mekanik ses yayıldı: “Hoş geldin Kemal Usta! Bugün ne yapıyoruz?”'},
  {emoji:'🥀🔥', art:'tearWipe', title:'Cevabın hazırdı', text:'Gözünden akan o son damla yaşı elinin tersiyle sildin. Dişlerini sıka sıka robota baktın: “Kemal Usta yok artık… Ama onun yarım bıraktığı işi tamamlayacak oğlu burada!”'},
  {emoji:'🌃⚡', art:'blackout', title:'Garaj karardı, içindeki ateş büyüdü', text:'Garajın şalterini indirdin. İçerisi karanlığa gömüldü ama içindeki intikam ateşi artık bütün şehri aydınlatacak kadar büyüktü. O an korku bitti; geriye sadece hesap kaldı.'},
  {emoji:'👊🏢', art:'revengeRoad', title:'Yol belli oldu', text:'Bilet cebindeydi. Babanın notu yüreğindeydi. Kararını vermiştin: Bekle MegaCore… ben geliyorum!'}
];

const leaveStory = [
  {emoji:'', art:'whiteExit', theme:'whiteScene', title:'BAZEN ŞEREFSİZ OLDUĞUNU, SADECE SEN BİLİRSİN', text:'Bazı hayaller yarım kalır; babamın robot hobisi var diye ben ölmek zorunda mıyım? İşim var gücüm var, bir de evlenirim, kendime yeni bir sayfa açarım. “Üzülme oğlum,” derim. “Senin dedeni robotlar aldı. Bir de MegaCore yani… onlarla uğraşanın çocuğu olmaz.” Allah rahmet eylesin baba. Ben İstanbul’a dönüyorum.'},
  {emoji:'', art:'istanbul', theme:'blueScene', title:"İSTANBUL'A HOŞ GELDİNİZ", text:'Şehir seni ışıklarıyla yuttu. Kalabalık, gürültü, plaza camları… Memleketin pas kokusu bir anda çok uzakta kaldı.'},
  {emoji:'', art:'producer', theme:'blackScene producerScene', title:'Yapımcı: Enes Bektaş', text:'Bazen hikâye bitti sanarsın. Ama Enes\'in vizyonunu işte orada anlarsın.'},
  {emoji:'', art:'twentyYears', theme:'blackScene', title:'20 YIL SONRA', text:'Yıllar geçti. Sen de değiştin.'},
  {emoji:'🏙️⚙️', art:'engineerRise', title:'Artık çok güçlüsün', text:'İstanbul seni yutmadı; seni biledi. Üst düzey bir mühendis oldun. Büyük projeler yönettin, ağır makineler tasarladın, adını zirveye yazdırdın. Herkes sana saygı duyuyor. Ama geceleri bir defter, paslı bir tabela ve yerde yatan baban hep aklına geliyor. Artık hazırsın. Bu kez ne toy bir delikanlısın ne de öfkesine yenilen bir çocuk. Bu kez intikam için gerçekten güçlüsün.'}
];

const returnRevengeStory = [
  {emoji:'🚆🏚️', art:'returnGarage', title:'Memlekete geri döndün', text:'Yıllar sonra garaja geri döndün. Gözlerinde hırstan ve nefretten başka hiçbir şey kalmamıştı. Köşedeki brandayı hırsla çekip fırlattın. Karşında babanın bitiremediği, saf çelikten devasa robot duruyordu.'},
  {emoji:'🔴🤖', art:'redButton', title:'Kırmızı düğmeye bastın', text:'Robotun göğsündeki büyük kırmızı düğmeye bastın. Mavi ışık yandı ve hoparlörden babanın kendi elleriyle kaydettiği o neşeli, mekanik ses yankılandı: “Hoş geldin Kemal Usta! Bugün ne yapıyoruz?”'},
  {emoji:'🥀🔥', art:'tearWipe', title:'Bu kez gözün daha sertti', text:'Gözünden akan o son damla yaşı elinin tersiyle sildin. Dişlerini sıka sıka robota baktın: “Kemal Usta yok artık… Ama onun yarım bıraktığı işi tamamlayacak oğlu burada!”'},
  {emoji:'🌃⚡', art:'blackout', title:'İçindeki ateş hazırdı', text:'Garajın şalterini indirdin. Garaj karanlığa gömüldü ama içindeki intikam ateşi artık tüm şehri aydınlatacak kadar büyüktü.'},
  {emoji:'👊🏢', art:'revengeRoad', title:'Son söz', text:'Bekle MegaCore, ben geliyorum!'}
];

const comebackStory = [
  {emoji:'🏚️🌧️', title:'İkinci defa aynı kapıdasın', text:'Bir kez denedin. MegaCore’u yıkamadın. Garajın tabelası indi, herkes konuştu, ekranlarda adını çevirdiler. Ama insan bazen yere düşünce biter sanır; asıl o zaman başlar.'},
  {emoji:'📓💔', title:'Defter hâlâ sende', text:'Babanın defterini satmadın. Son sayfayı cebinde taşıdın. “Onlar güçlü olabilir evlat,” yazıyordu. “Ama güçlü olan her zaman haklı değildir. Yenildiysen utanma. Aynı hatayı bir daha yaparsan utan.”'},
  {emoji:'👑🔥', title:'MegaCore seni hatırlıyor', text:'Bu kez seni hafife almıyorlar. İlk maçtan bile daha sert rakip gönderecekler. Çünkü senin tekrar ayağa kalkmandan korkuyorlar. Korkmaları iyiye işaret.'}
];

const jobOfferStory = [
  {emoji:'👑📄', title:'MegaCore’dan teklif', text:'Finalden sonra salon boşalırken siyah takım elbiseli biri geldi. Elinde parlak bir sözleşme vardı. “Bizimle çalış,” dedi. “Garajı unut. Babanın adını dosyada yaşatırız. Sana maaş, laboratuvar, güvenli hayat veririz.”'},
  {emoji:'📓🕯️', title:'Cebindeki not', text:'Tam kalemi tutacakken cebindeki kâğıt eline geldi. Babanın son notuydu: “Bir gün çok yorulursan kolay yolu teklif edecekler. Kolay yol bazen temiz görünür ama insanın içini kirletir.”'},
  {emoji:'⚖️🤖', title:'Karar senin', text:'Kabul edersen MegaCore’un bir çalışanı olarak rahat yaşarsın ama o not aklından hiç çıkmaz. Reddedersen MegaCore ilk leveldan daha güçlü rakip gönderir. Bu kez savaş daha sert başlar.'}
];

const tutorialPages = [
  {title:'MegaCore seni bitirmek istiyor', text:'Seni bu ligden gönderip şirketini iflas ettirmek isteyen bir şirket var: MegaCore.'},
  {title:'10 rakip robot', text:'Seni yenmek için giderek güçlenen tam 10 tane rakip robot gönderecekler.'},
  {title:'Önce analiz et', text:'Ekip üyelerinle rakip robotu analiz et, zayıf yönlerini keşfet.'},
  {title:'Her robotun açığı vardır', text:'Her robotun güçlü ve zayıf yönleri vardır.'},
  {title:'Karşı hamleyi bul', text:'Mesela ateş özelliğiyle öne çıkan bir robot, suya karşı zayıftır.'},
  {title:'İlk rakip böyle', text:'İlk rakip robot tam da öyle!'},
  {title:'Arena kapışması', text:'Savaş arenasında ürettiğiniz robotlar kapıştırılır. Üstün taraf kazanır.'},
  {title:'Dikkatli ol', text:'Ancak dikkat et! Eğer rakip robotu yanlış analiz edersen arenada seni şaşırtabilir. Şimdi oyuna başla.'}
];

const levelStories = {
  1:[
    {emoji:'🔥🏟️', title:'İlk maç: Alevci geliyor', text:'MegaCore ilk rakibi bilerek ateş robotu seçti. “Garaj çocuğu ilk turda yanar,” diyorlar. Babanın defterindeki ilk sayfa aklında: Ateşi kasla değil, suyla ve akılla söndür.'},
    {emoji:'💧📓', title:'Defterde kırmızıyla çizili not', text:'Mina raporu masaya koydu: “Ana saldırı kesin alev. Ben 1 yıldızım, her şeyi bilemem ama bunu görüyorum. Su Topu tak. Soğutma da iyi olur.” Bu maç oyunun ilk dersi: doğru karşılık.'}
  ],
  2:[
    {emoji:'⚡🏢', title:'MegaCore’un gülüşü azaldı', text:'İlk galibiyet onların moralini bozdu. Toplantı odasında “Bu çocuk şanslıydı,” dediler. Sonra elektrik robotunu hazırladılar. Metal gövdeyi yakalarsa sistemini kilitleyecek.'},
    {emoji:'👂📻', title:'Koridordan gelen fısıltı', text:'Eski bir MegaCore çalışanı haber yolladı: “Sizi izliyorlar. Kurduğunuz robota göre son dakika parça ekleyebilirler.” Artık rapor beklenen şeyi söyler; sürpriz arenada patlar.'}
  ],
  3:[
    {emoji:'🛡️📰', title:'Gazeteler küçük garajı yazdı', text:'Mahalle bakkalı kupürü cama astı: “Kıvılcım Garajı ayakta.” MegaCore bu kez ağır zırhlı bir makine gönderdi. Seni ezip hikâyeyi burada kapatmak istiyorlar.'},
    {emoji:'🔩👴', title:'Yaşlı usta geri döndü', text:'Babanla eskiden çalışan bir usta kapıya geldi. “Kemal Usta bana bir gün ekmek verdi. Bugün borcumu ödemeye geldim,” dedi. Garaj artık bir aileye dönüşüyordu.'}
  ],
  4:[
    {emoji:'💨🌫️', title:'Hızlı robot tuzağı', text:'MegaCore senin ağır silah seveceğini düşünüyor. Bu yüzden hızlı bir robot çıkardı. Çok yüklenirsen etrafında döner. Bu maçta hedef almak, yakalamak ve kontrol etmek önemli.'},
    {emoji:'👧📊', title:'Gözlemci masaya eğildi', text:'Ekibindeki gözlemci raporu masaya koydu: “Bu ligde göz yanıltırlar. Benim seviyem yetmezse rakip bizi kandırır.” Kızmadın. Çünkü bu garajda hata saklanmaz; düzeltilir.'}
  ],
  5:[
    {emoji:'🔴🎥', title:'Yayın başladı', text:'Artık maçlarını canlı veriyorlar. MegaCore lazer robotu hazırladı. Tek çizgide yakmak istiyorlar. Kalkan, hareket ve enerji dengesi olmadan bu maç can yakar.'},
    {emoji:'🕯️💔', title:'Boş koltuk', text:'Maçtan önce babanın koltuğuna baktın. Bir an sanki “Öfkeni direksiyona koyma evlat, planını koy,” dedi. İçindeki ateş yandı ama elin sakinleşti.'}
  ],
  6:[
    {emoji:'🧪☣️', title:'Kirli maç', text:'MegaCore kimyasal saldırıya geçti. Pas, asit, zehirli buhar… Kazanamazlarsa bozacaklar. Kimyagerlerin ve koruma kaplamalarının zamanı geldi.'},
    {emoji:'🧪🤝', title:'Laboratuvar kapısı', text:'Genç bir kimyager “Baban üniversitede bana sahip çıkmıştı,” dedi. Parası yoktu ama bilgisi vardı. MegaCore para topluyordu; sen iyiliklerin geri dönüşünü.'}
  ],
  7:[
    {emoji:'🦠🌿', title:'Görünmeyen saldırı', text:'Bu kez biyolojik spor kullanan bir robot var. Sensörleri kirletir, filtreleri tıkar, karar mekanizmasını bozar. Çocuk oyuncağı gibi durur ama sinsi vurur.'},
    {emoji:'🧬👨‍🔬', title:'Biyoloğun sözü', text:'Biyolog Mert küçük bir filtre bıraktı: “Canlı sistemleri anlamayan robot yapamaz. Baban bunu bilirdi.” Garaj sadece demir değil, bilim öğreniyordu.'}
  ],
  8:[
    {emoji:'🚀🏟️', title:'Roket gecesi', text:'MegaCore ilk saniyede seni bitirmek istiyor. Füze robotu hızlı vurur, panik yaptırır. Kalkan ve kaçış motoru olmayan robot burada dağılır.'},
    {emoji:'📊⚙️', title:'Simülasyon sabahı', text:'Veri analisti Nil ekran başında kaldı: “Tek doğru kurulum yok. Ama kötü kurulum çok. Aşırı saldırı, sıfır savunma, düşük enerji… MegaCore bunları affetmez.”'}
  ],
  9:[
    {emoji:'👻🌑', title:'Finalden önce karanlık', text:'Hayalet robot görünmeden vurmak için geliyor. Bu maçta radar ve kontrol çok değerli. MegaCore seni korkutmak için ışıkları bile kısacak.'},
    {emoji:'🧒🔥', title:'Çocuğun resmi', text:'Küçük bir çocuk sana resim verdi. Sen, robotun ve baban yan yana çizilmişti. Altında “Bizim garaj kazanacak” yazıyordu. Bazı parçalar altınla alınmaz.'}
  ],
  10:[
    {emoji:'👑⚫', title:'Son Emir', text:'MegaCore CEO’su ilk kez tribüne indi. Çünkü bu artık robot maçı değil; yıllarca ezilen garajların davası. Son robot her sınıftan saldırı taşıyor.'},
    {emoji:'📓💔', title:'Defterin son sayfası', text:'Mina defteri açtı. Arka kapakta babanın notu vardı: “Onları yok et derken kalbini karart demedim. Öyle yen ki, bir daha hiçbir çocuğun hayaline el uzatamasınlar.”'},
    {emoji:'🕯️🤖', title:'Son söz', text:'Arena sessizleşti. Robotun yürürken metal sesi garajın eski sesine benzedi. Baban burada olsaydı belki hiçbir şey demezdi. Sadece omzuna dokunurdu. Bu maç onun son isteği için.'}
  ]
};

const enemies = [
  {type:'Alevci', icon:'🔥', attack:'fire', weapon:'Alev Hortumu', weak:'water', weakText:'Su saldırısı ve soğutma', threshold:63, hp:92, power:54, expected:['Yakın mesafe alev','Isı hasarı','Yavaş gövde']},
  {type:'Voltajcı', icon:'⚡', attack:'electric', weapon:'Zincir Şok', weak:'electricRes', weakText:'Kauçuk yalıtım / enerji kalkanı', threshold:70, hp:100, power:62, expected:['Elektrik şoku','Sistem kilidi','Metal hedef sever']},
  {type:'Titan', icon:'🛡️', attack:'slam', weapon:'Ağır Ezme', weak:'pierce', weakText:'Zırh delme / matkap / raylı top', threshold:76, hp:120, power:66, expected:['Ağır zırh','Yavaş ama sert','Fiziksel baskı']},
  {type:'Ninja', icon:'💨', attack:'dash', weapon:'Hızlı Pençe', weak:'control', weakText:'Radar, ağ ve kontrol', threshold:82, hp:96, power:71, expected:['Çok hızlı','Yakın saldırı','Hedef şaşırtma']},
  {type:'Prizma', icon:'🔴', attack:'laser', weapon:'Lazer Kesici', weak:'shield', weakText:'Kalkan ve hareket', threshold:88, hp:110, power:77, expected:['Uzak lazer','Yüksek enerji','Hassas nişan']},
  {type:'Asitçi', icon:'🧪', attack:'acid', weapon:'Asit Buharı', weak:'chemRes', weakText:'Kimyasal kaplama / nötralizan', threshold:94, hp:114, power:82, expected:['Asit bulutu','Zırh eritme','Pas hasarı']},
  {type:'Sporcu', icon:'🦠', attack:'bio', weapon:'Biyo Spor', weak:'bioRes', weakText:'Biyo filtre / enzim temizleyici', threshold:100, hp:118, power:87, expected:['Sensör kirletme','Biyo bulut','Kontrol bozma']},
  {type:'Roketçi', icon:'🚀', attack:'missile', weapon:'Mini Füze', weak:'shield', weakText:'Enerji kalkanı / kaçış motoru', threshold:107, hp:126, power:94, expected:['Patlayıcı salvo','Hızlı açılış','Kalkan test eder']},
  {type:'Hayalet', icon:'👻', attack:'ghost', weapon:'Gizli Darbe', weak:'radar', weakText:'Radar ve kontrol', threshold:115, hp:132, power:101, expected:['Görünmez yaklaşım','Ani darbe','Hedef kaybettirme']},
  {type:'Kum Fırtınası', icon:'🌪️', attack:'sand', weapon:'Kum Körletici', weak:'radar', weakText:'Radar / duman yönetimi / kontrol', threshold:105, hp:124, power:91, expected:['Sensör körletme','Zemin bozma','Kontrol azaltma']},
  {type:'Mıknatıs', icon:'🧲', attack:'magnet', weapon:'Manyetik Çekme', weak:'control', weakText:'Denge, kızak ve kontrol', threshold:109, hp:130, power:95, expected:['Çekip savurma','Metal cezalandırma','Pozisyon bozma']},
  {type:'Buzkıran', icon:'🧊', attack:'ice', weapon:'Donma Spreyi', weak:'fireRes', weakText:'Isı yönetimi / hız / soğutma dengesi', threshold:111, hp:128, power:97, expected:['Hareket dondurma','Yavaşlatma','Enerji tüketimi artırma']},
  {type:'Hacker', icon:'💻', attack:'hack', weapon:'Kara Kod Saldırısı', weak:'cyberRes', weakText:'Güvenlik duvarı, manuel kontrol ve frekans bozucu', threshold:118, hp:122, power:106, expected:['Sisteme sızma','Kontrol kilidi','Bir anda maçı bitirme riski']},
  {type:'Glitch', icon:'🧿', attack:'glitch', weapon:'Ekran Körlemesi', weak:'radar', weakText:'Radar, veri analizi ve kontrol', threshold:116, hp:126, power:103, expected:['Sahte hedef','Sensör yanıltma','Sinyal bozma']},
  {type:'PsikoBot', icon:'😵', attack:'psycho', weapon:'Panik Yayını', weak:'morale', weakText:'Moral koçu, zihin kalkanı ve panik sönümleyici', threshold:116, hp:122, power:105, expected:['Sahte anons','Panik etkisi','Operatörü şaşırtma']},
  {type:'Provokatör', icon:'📣', attack:'taunt', weapon:'Alay Hoparlörü', weak:'pr', weakText:'PR savunması, moral ve odak sistemi', threshold:113, hp:120, power:100, expected:['Alaycı yayın','İtibar baskısı','Karar geciktirme']},
  {type:'Karabasan', icon:'🌑', attack:'fear', weapon:'Karanlık Alan', weak:'focus', weakText:'Odak çipi, moral ve radar', threshold:121, hp:128, power:108, expected:['Işık söndürme','Korku efekti','Hedef kaybettirme']},
  {type:'Kuklacı', icon:'🧵', attack:'controlHijack', weapon:'Kumanda Kapma', weak:'cyberRes', weakText:'Güvenlik duvarı, manuel kontrol ve kara kod kapanı', threshold:123, hp:126, power:110, expected:['Kumanda ele geçirme','Sahte komut','Ani kilit']},
  {type:'Sürü Robotu', icon:'🐝', attack:'swarm', weapon:'Mini Drone Sürüsü', weak:'area', weakText:'Alan etkili savunma, duman, EMP ve mini savunma tareti', threshold:119, hp:134, power:107, expected:['Çoklu hedef','Sensör kalabalığı','Yavaş yıpratma']},
  {type:'Son Emir', icon:'👑', attack:'boss', weapon:'Hibrit Sistem', weak:'balance', weakText:'Dengeli kurulum', threshold:128, hp:155, power:115, expected:['Hibrit saldırı','Son dakika karşı parça','Yüksek dayanıklılık']}
];

function getEnemy(level, seed, company, robotName){
  const c=cleanName(company), r=cleanName(robotName);
  if(level===1) return {...enemies[0], name:`🔥 ${r} Söndürücü-01`, level};
  const pool = enemies.slice(1, enemies.length-1).filter((_,i)=> i <= level+5 && i >= Math.max(0, level-5));
  const base = level===10 ? enemies[enemies.length-1] : pool[Math.floor(rng(seed+level*7)*pool.length)];
  const names=[`Anti-${r}`,`${c} Kırıcı`,`Garaj Avcısı-${level}`,`${r} Avcısı`,`MegaCore ${base.type} Prototipi`,`${base.type} X-${Math.floor(rng(seed+42)*90+10)}`];
  const difficulty = level>=10 ? 36 : level>=9 ? 28 : level>=7 ? 20 : level>=5 ? 14 : level*2;
  return {...base, name:`${base.icon} ${level===10?'MegaCore Son Emir':names[Math.floor(rng(seed+level*13)*names.length)]}`, level, threshold:base.threshold+difficulty, hp:base.hp+level*8, power:base.power+level*5};
}

const scouts = [
  {id:'scout1', role:'Gözlemci', icon:'🔎', name:'Mina', stars:1, cost:0, wrong:.30, desc:'Başlangıç gözlemcisi. Bedava gelir; bazen tahmini yanlış çıkar.'},
  {id:'scout2', role:'Gözlemci', icon:'🕵️', name:'Sokak İzci', stars:3, cost:1850, wrong:.12, desc:'Sokaktan bilgi toplar. Beklenen saldırıyı ve birkaç riski daha net okur.'},
  {id:'scout5', role:'Gözlemci', icon:'👁️', name:'Efsane Göz', stars:5, cost:9200, wrong:0, desc:'En iyi gözlemci. Rakibin gerçek zayıflığını ve nasıl saldırman gerektiğini söyler.'},
];
const staff = [
  ...scouts,
  {id:'eng1', role:'Mühendis', icon:'🧰', name:'Acemi Mühendis Rıza', stars:1, cost:700, fail:.18, unlock:['drill','armorPlate'], desc:'Basit mekanik ve savunma parçaları açar. Ucuzdur ama hata riski vardır.'},
  {id:'eng2', role:'Mühendis', icon:'⚙️', name:'Baş Mühendis Leyla', stars:4, cost:3900, fail:.04, unlock:['rail','servo','nano','shockAbsorber'], desc:'İleri mekanik parçaları ve sağlam hareket sistemlerini güvenli üretir.'},
  {id:'eng3', role:'Mühendis', icon:'🏗️', name:'Zırh Uzmanı Nermin', stars:5, cost:6100, fail:.015, unlock:['mirror','antiMissile','smartArmor'], desc:'Üst seviye savunma, füze karşılayıcı ve akıllı zırh üretir.'},
  {id:'chem0', role:'Kimyager', icon:'🧫', name:'Laborant Ece', stars:1, cost:650, fail:.20, unlock:['smoke','coat'], desc:'Ucuz duman ve basit kimyasal kaplama açar; bazen oranı tutturamaz.'},
  {id:'chem1', role:'Kimyager', icon:'🧪', name:'Kimyager Can', stars:3, cost:1600, fail:.10, unlock:['acid','foam','neutralizer'], desc:'Kimyasal saldırı ve korunma parçalarını daha güvenilir üretir.'},
  {id:'chem3', role:'Kimyager', icon:'🔥', name:'Yanma Uzmanı Orhan', stars:5, cost:5200, fail:.02, unlock:['fireGel','coolant'], desc:'Ateş jeli, soğutucu jel ve ısı yönetiminde ustadır.'},
  {id:'bio0', role:'Biyolog', icon:'🌱', name:'Stajyer Biyolog Selin', stars:1, cost:720, fail:.18, unlock:['bioLure'], desc:'Basit biyolojik yem ve filtre denemeleri açar; yanlış doz riski vardır.'},
  {id:'bio1', role:'Biyolog', icon:'🧬', name:'Biyolog Mert', stars:3, cost:2100, fail:.09, unlock:['spore','biofilter','enzyme'], desc:'Biyolojik saldırı ve korunma parçalarını açar.'},
  {id:'bio2', role:'Biyolog', icon:'🧫', name:'Genetikçi Aras', stars:5, cost:5700, fail:.02, unlock:['neuroSpore','adaptiveFilter'], desc:'Gelişmiş biyolojik saldırı ve adaptif savunma filtreleri üretir.'},
];

const parts = [
  {id:'starterCore', tab:'Savunma', name:'Hurda Gövde', icon:'🥫', cost:0, slot:'core', stats:{armor:8, energy:6}, tags:['basic'], desc:'Ücretsiz temel gövde. Oyunu tıkamaz ama tek başına yetmez.'},
  {id:'starterWheel', tab:'Hareket', name:'Eski Tekerlek', icon:'🛞', cost:0, slot:'feet', stats:{speed:8, control:3}, tags:['basic'], desc:'Ücretsiz hareket. İlk kurulum için hayat kurtarır.'},
  {id:'water', tab:'Silah', name:'Basınçlı Su Topu', icon:'💧', cost:210, slot:'arm', stats:{water:42, damage:10, energy:-4}, tags:['attack','counter:fire','weak:fire'], desc:'Level 1’in ana dersi. Alev saldırısına karşı en doğru cevap.'},
  {id:'foam', tab:'Silah', name:'Yangın Köpüğü', icon:'🧯', cost:310, slot:'arm', need:'foam', stats:{water:25, fireRes:18, chemRes:8}, tags:['counter:fire','counter:acid'], desc:'Profesör kimyager açar. Ateşi boğar, asidi de azaltır.'},
  {id:'shock', tab:'Silah', name:'Elektrik Şoku', icon:'⚡', cost:220, stats:{damage:20, control:8, energy:-7}, tags:['attack'], desc:'Korumasız robotlara iyi, ama elektrik rakibine karşı risklidir.'},
  {id:'drill', tab:'Silah', name:'Matkap Kol', icon:'🔩', cost:290, need:'drill', stats:{pierce:35, damage:16, speed:-4}, tags:['weak:slam','attack'], desc:'Mühendis üretir. Ağır zırha karşı.'},
  {id:'acid', tab:'Silah', name:'Asit Püskürtücü', icon:'🧪', cost:340, need:'acid', stats:{damage:16, pierce:16}, tags:['weak:slam','attack','chemical'], desc:'Kimyager üretir. Zırhı zamanla eritir.'},
  {id:'rail', tab:'Silah', name:'Raylı Top', icon:'🎯', cost:420, need:'rail', stats:{pierce:30, damage:30, energy:-12}, tags:['weak:slam','attack'], desc:'Baş mühendis üretir. Uzak mesafe delici vuruş.'},
  {id:'spore', tab:'Silah', name:'Biyo Spor Bulutu', icon:'🦠', cost:380, need:'spore', stats:{damage:10, control:18}, tags:['attack','bio'], desc:'Biyolog üretir. Sensör ve karar sistemini bozar.'},
  {id:'heat', tab:'Savunma', name:'Isı Zırhı', icon:'🟥', cost:230, stats:{fireRes:38, armor:12, speed:-3}, tags:['counter:fire'], desc:'Alev ve lazer ısısını azaltır.'},
  {id:'rubber', tab:'Savunma', name:'Kauçuk Yalıtım', icon:'🟨', cost:240, stats:{electricRes:42, armor:7}, tags:['counter:electric'], desc:'Elektrik saldırısına karşı doğru savunma.'},
  {id:'shield', tab:'Savunma', name:'Enerji Kalkanı', icon:'🛡️', cost:350, stats:{shield:38, armor:10, energy:-12}, tags:['counter:laser','counter:missile','counter:boss'], desc:'Lazer, füze ve boss darbelerine karşı.'},
  {id:'coat', tab:'Savunma', name:'Kimyasal Kaplama', icon:'🟩', cost:310, need:'coat', stats:{chemRes:42, armor:10}, tags:['counter:acid'], desc:'Asit ve pası gövdeden kaydırır.'},
  {id:'biofilter', tab:'Savunma', name:'Biyo Filtre', icon:'😷', cost:330, need:'biofilter', stats:{bioRes:45, radar:4}, tags:['counter:bio'], desc:'Biyo spor ve kirli buhara karşı.'},
  {id:'wheel', tab:'Hareket', name:'Hızlı Tekerlek', icon:'⚙️', cost:190, stats:{speed:34, control:8, armor:-3}, tags:['mobility'], desc:'Hızlı ama kırılgan.'},
  {id:'track', tab:'Hareket', name:'Palet Sistemi', icon:'⛓️', cost:230, stats:{armor:12, control:22, speed:6}, tags:['mobility','counter:slam'], desc:'Dengeli ve sağlam hareket.'},
  {id:'dash', tab:'Hareket', name:'Yan Kaçış Motoru', icon:'💨', cost:285, stats:{speed:28, control:12, energy:-8}, tags:['counter:laser','counter:missile','mobility'], desc:'Lazer ve füze çizgisinden çıkar.'},
  {id:'servo', tab:'Hareket', name:'Servo Bacak', icon:'🦿', cost:360, need:'servo', stats:{speed:22, control:30, energy:-6}, tags:['counter:dash','mobility'], desc:'Hızlı rakibin açısını kapatır.'},
  {id:'stabilizer', tab:'Hareket', name:'Denge Kızakları', icon:'🛷', cost:150, need:'stabilizer', stats:{control:22, speed:8}, tags:['counter:dash','counter:slam','counter:magnet'], desc:'Mekanikçi açar. Kayma ve savrulmaya karşı.'},
  {id:'cool', tab:'Destek', name:'Aktif Soğutma', icon:'❄️', cost:220, stats:{fireRes:28, energy:14}, tags:['counter:fire','support'], desc:'Ateş maçında su topunun en iyi arkadaşı.'},
  {id:'radar', tab:'Destek', name:'360° Radar', icon:'📡', cost:270, stats:{radar:42, control:6, energy:-5}, tags:['counter:ghost','counter:dash','counter:sand','support'], desc:'Gizli ve hızlı robotları yakalar.'},
  {id:'battery', tab:'Destek', name:'Yedek Batarya', icon:'🔋', cost:190, stats:{energy:42, speed:-2}, tags:['support'], desc:'Fazla modülün enerji açığını kapatır.'},
  {id:'repair', tab:'Destek', name:'Oto Tamir Kiti', icon:'🩹', cost:350, need:'cheapRepair', stats:{repair:32, armor:5, energy:-7}, tags:['support'], desc:'Maç içinde hasarı toparlar.'},
  {id:'neutralizer', tab:'Destek', name:'Nötralizan Sprey', icon:'🧼', cost:360, need:'neutralizer', stats:{chemRes:26, bioRes:12, repair:8}, tags:['counter:acid','support'], desc:'Asit ve kirli bulutu temizler.'},
  {id:'enzyme', tab:'Destek', name:'Enzim Temizleyici', icon:'🧬', cost:340, need:'enzyme', stats:{bioRes:28, chemRes:15, repair:8}, tags:['counter:bio','support'], desc:'Spor ve asit kalıntısını temizler.'},
  {id:'nano', tab:'Destek', name:'Nano Usta Kutusu', icon:'✨', cost:650, need:'nano', stats:{repair:36, energy:18, armor:14}, tags:['support'], desc:'Final seviyesi destek.'},
  {id:'armorPlate', tab:'Savunma', name:'Kompozit Zırh Plakası', icon:'🧱', cost:260, need:'armorPlate', stats:{armor:34, chemRes:8, speed:-4}, tags:['counter:slam','counter:boss'], desc:'Mühendis üretir. Sert darbeyi emer ama robotu biraz yavaşlatır.'},
  {id:'shockAbsorber', tab:'Savunma', name:'Darbe Emici Süspansiyon', icon:'🌀', cost:230, need:'shockAbsorber', stats:{armor:15, control:18}, tags:['counter:slam','counter:dash','counter:magnet'], desc:'Ezme ve hızlı çarpma hamlelerini yumuşatır.'},
  {id:'mirror', tab:'Savunma', name:'Aynalı Isı Kaplama', icon:'🪞', cost:390, need:'mirror', stats:{shield:18, fireRes:16, armor:8}, tags:['counter:laser','counter:fire'], desc:'Lazer ve ısıyı yansıtır. Zırh uzmanı üretir.'},
  {id:'antiMissile', tab:'Savunma', name:'Mini Savunma Tareti', icon:'🛰️', cost:460, need:'antiMissile', stats:{shield:26, radar:18, energy:-9}, tags:['counter:missile'], desc:'Füzeleri havada karşılamaya çalışır.'},
  {id:'smartArmor', tab:'Savunma', name:'Akıllı Zırh', icon:'🔷', cost:620, need:'smartArmor', stats:{armor:26, shield:18, energy:8}, tags:['counter:boss','counter:laser','counter:slam'], desc:'Final seviyesinde farklı tehditlere uyum sağlar.'},
  {id:'smoke', tab:'Destek', name:'Duman Perdesi', icon:'🌫️', cost:210, need:'smoke', stats:{control:14, radar:10, energy:-3}, tags:['counter:laser','counter:ghost','support'], desc:'Rakibin görüşünü bozar. Ucuz ama doğru yerde değerli.'},
  {id:'fireGel', tab:'Silah', name:'Ateş Jeli', icon:'🔥', cost:360, need:'fireGel', stats:{damage:32, energy:-8}, tags:['attack','weak:bio'], desc:'Biyolojik ve hafif gövdeli robotlara karşı yakıcı baskı.'},
  {id:'coolant', tab:'Destek', name:'Soğutucu Jel', icon:'🧊', cost:300, need:'coolant', stats:{fireRes:34, energy:10, repair:5}, tags:['counter:fire','counter:laser','counter:ice','support'], desc:'Aşırı ısınmayı bastırır, lazer maçlarında da işe yarar.'},
  {id:'bioLure', tab:'Destek', name:'Biyo Yem Kapsülü', icon:'🌿', cost:180, need:'bioLure', stats:{bioRes:18, control:6}, tags:['counter:bio','support'], desc:'Biyolojik sporları ana sensörlerden uzaklaştırır.'},
  {id:'neuroSpore', tab:'Silah', name:'Nöro Spor İğnesi', icon:'🧬', cost:520, need:'neuroSpore', stats:{damage:18, control:28, energy:-6}, tags:['attack','bio','weak:dash'], desc:'Hızlı robotların karar ritmini bozar.'},
  {id:'adaptiveFilter', tab:'Savunma', name:'Adaptif Biyo Filtre', icon:'🧿', cost:520, need:'adaptiveFilter', stats:{bioRes:42, chemRes:18, repair:8}, tags:['counter:bio','counter:acid'], desc:'Biyo ve kimyasal tehditlere karşı pahalı ama güçlü filtre.'},
  {id:'scrapPatch', tab:'Destek', name:'Hurda Yama Seti', icon:'🪛', cost:90, need:'scrapPatch', stats:{repair:12, armor:6}, tags:['support'], desc:'Çok ucuz toparlama parçası. Zor ekonomide nefes aldırır.'},
  {id:'quickSwap', tab:'Destek', name:'Hızlı Sök-Tak Rayı', icon:'🔁', cost:280, need:'quickSwap', stats:{control:10, repair:10}, tags:['support'], desc:'Parça düzenini daha güvenli hale getirir.'},
  {id:'net', tab:'Silah', name:'Ağ Fırlatıcı', icon:'🕸️', cost:260, stats:{control:34, damage:4, energy:-4}, tags:['counter:dash','weak:dash','attack'], desc:'Hızlı rakibi durdurur. Hasarı düşük ama stratejik değeri yüksek.'},
  {id:'emp', tab:'Silah', name:'EMP Patlaması', icon:'📴', cost:410, need:'simLab', stats:{control:25, damage:15, energy:-16}, tags:['counter:electric','counter:ghost','attack'], desc:'Elektronik ve gizlilik sistemlerini kısa süreli bozar.'},
  {id:'jammer', tab:'Destek', name:'Frekans Bozucu', icon:'📶', cost:330, need:'counterPlan', stats:{radar:18, control:22, energy:-7}, tags:['counter:ghost','counter:missile','support'], desc:'Gizli hedef ve füze kilidini bozar.'},
  {id:'firewall', tab:'Savunma', name:'Güvenlik Duvarı', icon:'🧱', cost:320, need:'basicFirewall', stats:{cyberRes:42, shield:8, energy:-5}, tags:['counter:hack','counter:glitch'], desc:'Hacker robotlara karşı ilk ciddi savunma. Yoksa maç bir anda kopabilir.'},
  {id:'manual', tab:'Destek', name:'Manuel Kontrol Kolu', icon:'🕹️', cost:260, need:'manualOverride', stats:{cyberRes:26, control:18}, tags:['counter:hack','support'], desc:'Sistem kilitlense bile robotu elle toparlar.'},
  {id:'spoof', tab:'Silah', name:'Sahte Sinyal Bombası', icon:'📡', cost:390, need:'spoof', stats:{cyberRes:18, control:22, damage:8, energy:-8}, tags:['counter:hack','weak:glitch','attack'], desc:'Rakibin yazılımını sahte hedefe koşturur.'},
  {id:'antiHack', tab:'Destek', name:'Kara Kod Kapanı', icon:'🕳️', cost:620, need:'antiHack', stats:{cyberRes:55, radar:14, control:12, energy:-10}, tags:['counter:hack','counter:glitch','counter:controlHijack','support'], desc:'Siber Usta açar. Hack yiyince saldırıyı rakibe geri çevirebilir.'},
  {id:'panicDamper', tab:'Destek', name:'Panik Sönümleyici', icon:'🧘', cost:330, need:'morale', stats:{morale:34, control:8}, tags:['counter:psycho','counter:fear','support'], desc:'Psikolojik saldırılarda robotun panik protokolünü kapatır.'},
  {id:'mindShield', tab:'Savunma', name:'Zihin Kalkanı', icon:'🧠', cost:410, need:'focus', stats:{morale:42, shield:10, energy:-6}, tags:['counter:psycho','counter:taunt','counter:fear'], desc:'Alay, korku ve panik yayınlarına karşı özel koruma.'},
  {id:'truthSpeaker', tab:'Destek', name:'Gerçek Anons Sistemi', icon:'📢', cost:280, need:'smallPr', stats:{morale:22, control:8}, tags:['counter:taunt','support'], desc:'Rakibin alay yayınını kendi garaj anonsunla bastırır.'},
  {id:'focusChip', tab:'Destek', name:'Odak Çipi', icon:'🎯', cost:370, need:'focus', stats:{morale:26, radar:18, control:10, energy:-4}, tags:['counter:fear','counter:ghost','support'], desc:'Karanlık ve baskı altında robotu hedefe kilitler.'},
  {id:'miniFlak', tab:'Savunma', name:'Mini Sürü Savar', icon:'🧨', cost:430, need:'antiMissile', stats:{shield:18, control:24, radar:12, energy:-8}, tags:['counter:swarm','counter:missile'], desc:'Mini drone sürülerine ve füzelere karşı alan savunması.'},
  {id:'holoTrap', tab:'Silah', name:'Hologram Tuzak', icon:'🎭', cost:390, need:'counterPlan', stats:{control:28, radar:12, energy:-7}, tags:['counter:dash','counter:ghost','counter:swarm','attack'], desc:'Rakibi sahte hedefe koşturur, hızlı ve gizli rakipleri şaşırtır.'},
];

function totalStats(list){ const s={...emptyStats}; list.forEach(p=>Object.entries(p.stats).forEach(([k,v])=>s[k]=(s[k]||0)+v)); return s; }
const freeRemovedRoleUnlocks = ['cheapRepair','stabilizer','quickSwap','scrapPatch','simLab','counterPlan','smallPr','focus','morale','basicFirewall','manualOverride','spoof','antiHack'];
function effectiveUnlockSet(owned){
  const unlocks = new Set(freeRemovedRoleUnlocks);
  const bestStarsByRole = {};
  owned.forEach(o=>{
    if(!o.role) return;
    bestStarsByRole[o.role] = Math.max(bestStarsByRole[o.role] || 0, o.stars || 0);
    (o.unlock||[]).forEach(u=>unlocks.add(u));
  });
  // Daha kıdemli üye alınca aynı meslekteki alt seviye üyelerin açtığı tüm parçalar da açılmış sayılır.
  staff.forEach(s=>{
    if(bestStarsByRole[s.role] && (s.stars||0) <= bestStarsByRole[s.role]){
      (s.unlock||[]).forEach(u=>unlocks.add(u));
    }
  });
  return unlocks;
}
function hasUnlock(owned, need){ return !need || effectiveUnlockSet(owned).has(need); }
function activeStaff(owned){
  const byRole={};
  owned.forEach(o=>{
    if(!o.role) return;
    const current = byRole[o.role];
    if(!current || o.stars>current.stars || (o.stars===current.stars && (o.cost||0)>(current.cost||0))){
      byRole[o.role] = {...o};
    }
  });
  const allUnlocks = effectiveUnlockSet(owned);
  return Object.values(byRole).map(o=>({
    ...o,
    unlock: Array.from(new Set([...(o.unlock||[]), ...Array.from(allUnlocks).filter(u=>staff.some(s=>s.role===o.role && s.unlock?.includes(u) && s.stars<=o.stars))])),
    inherited:true
  }));
}
function activeHas(owned, unlock){ return effectiveUnlockSet(owned).has(unlock); }
function bestScout(owned){ return activeStaff(owned).filter(o=>o.role==='Gözlemci').sort((a,b)=>b.stars-a.stars)[0] || scouts[0]; }
function discount(cost, rep){ const rate = Math.max(0.55, 1 - (rep-1)*0.10); return Math.round(cost * rate); }
function staffSections(){ return ['Gözlemci','Mühendis','Kimyager','Biyolog']; }


function legendaryAttackAdvice(enemy){
  const map={
    fire:{buy:['Basınçlı Su Topu','Aktif Soğutma','Isı Zırhı'], plan:'Ateş hamlesini suyla bastır. Isı yükselirse soğutma devreye girsin. Saldırıya ateşle cevap verme.'},
    electric:{buy:['Kauçuk Yalıtım','Kalkan Modülü','Yedek Batarya'], plan:'Elektriği gövdeye sokma. Önce yalıtım, sonra kalkanla ilk şoku kes. Metal ağırlığına güvenme.'},
    dash:{buy:['360° Radar','Ağ Fırlatıcı','Servo Bacak'], plan:'Radar hızlı pençenin yönünü okur. Ağ Fırlatıcı rakibi yavaşlatır. Servo Bacak kaçış açısını kapatır.'},
    laser:{buy:['Aynalı Isı Kaplama','Duman Perdesi','Yan Kaçış Motoru'], plan:'Lazer çizgisinde sabit durma. Aynalı kaplama ışını kırar, duman hedefi bozar, yan kaçış motoru vuruş hattından çıkarır.'},
    acid:{buy:['Kimyasal Kaplama','Nötralizan Sprey','Oto Tamir Kiti'], plan:'Asit zırhı zamanla eritir. Kaplama ile tutunmasını azalt, nötralizanla temizle, tamir kitiyle sızıntıyı toparla.'},
    bio:{buy:['Adaptif Biyo Filtre','Enzim Temizleyici','Biyo Yem Kapsülü'], plan:'Biyolojik spor sensörleri kirletir. Filtre ana sistemi korur, enzim kalıntıyı temizler, yem kapsülü saldırıyı üstüne çeker.'},
    hack:{buy:['Güvenlik Duvarı','Manuel Kontrol Kolu','Kara Kod Kapanı'], plan:'Hack gelirse robot bir anda kilitlenir. Güvenlik Duvarı ilk saldırıyı keser, manuel kontrol robotu ayakta tutar, Kara Kod Kapanı saldırıyı geri çevirebilir.'},
    glitch:{buy:['360° Radar','Frekans Bozucu','Sahte Sinyal Bombası'], plan:'Glitch robot hedef şaşırtır. Radar gerçek konumu arar, frekans bozucu paraziti keser, sahte sinyal rakibi yanlış hedefe yollar.'},
    psycho:{buy:['Panik Sönümleyici','Zihin Kalkanı','Gerçek Anons Sistemi'], plan:'Bu rakip robottan önce kafanı bozar. Panik cezasını kapat, zihin kalkanıyla baskıyı azalt, anonsla alay yayınını bastır.'},
    taunt:{buy:['Gerçek Anons Sistemi','Zihin Kalkanı','Panik Sönümleyici'], plan:'Alay hoparlörünü sustur. Moral düşerse robot kararları gecikir. Anons sistemi ve zihin kalkanı bu yüzden önemli.'},
    fear:{buy:['Odak Çipi','360° Radar','Zihin Kalkanı'], plan:'Korku alanı robotun yönünü bozar. Odak Çipi hedefi kilitler, radar alanı okur, zihin kalkanı panik dalgasını azaltır.'},
    swarm:{buy:['Mini Sürü Savar','Hologram Tuzak','Ağ Fırlatıcı'], plan:'Tek büyük hedef arama. Sürü Savar küçük droneları temizler, hologram tuzak sürüyü dağıtır, ağ alan kontrolü kurar.'},
    controlHijack:{buy:['Manuel Kontrol Kolu','Kara Kod Kapanı','Güvenlik Duvarı'], plan:'Kumanda kapılırsa maç biter. Manuel kontrolü hazır tut, siber korumayı yükselt, Kara Kod Kapanı varsa saldırıyı geri çevir.'},
    missile:{buy:['Mini Savunma Tareti','Kalkan Modülü','Yan Kaçış Motoru'], plan:'Füzeyi gövdeyle karşılama. Taret havada vurur, kalkan patlamayı azaltır, yan kaçış motoru kilidi bozar.'},
    ghost:{buy:['360° Radar','Duman Perdesi','Frekans Bozucu'], plan:'Görmediğin rakibe kör saldırma. Radar konum verir, duman ve frekans bozucu rakibin gizlilik avantajını düşürür.'},
    slam:{buy:['Kompozit Zırh Plakası','Darbe Emici Süspansiyon','Palet Sistemi'], plan:'Ezme saldırısına hafif gövdeyle çıkma. Kompozit zırh darbeyi tutar, süspansiyon şoku emer, palet robotu yerde tutar.'},
    magnet:{buy:['Denge Kızakları','Darbe Emici Süspansiyon','Servo Bacak'], plan:'Mıknatıs seni arenada savurmak ister. Denge kızakları tutunur, süspansiyon çekişi yumuşatır, servo bacak pozisyon aldırır.'},
    ice:{buy:['Soğutucu Jel','Yan Kaçış Motoru','Palet Sistemi'], plan:'Buz eklemleri kilitler. Soğutucu jel ısı dengesini korur, hareket parçaları donmadan pozisyon değiştirir.'},
    boss:{buy:['Akıllı Zırh','Güvenlik Duvarı','360° Radar','Aktif Soğutma','Yedek Batarya','Basınçlı Su Topu','Asit Püskürtücü','Aynalı Isı Kaplama','Oto Tamir Kiti'], plan:'Son Emir tek numara yapmaz; karışık vurur. 9 parça sınırında dengeli kur: Akıllı Zırh ana savunma, Güvenlik Duvarı hack riskini keser, Radar sürprizi okur, Soğutma + Su ateşi söndürür, Yedek Batarya enerjiyi taşır, Asit zırhı eritir, Aynalı Kaplama lazeri kırar, Oto Tamir son bölümde robotu ayakta tutar. Sadece saldırı doldurma; finali denge kazanır.'}
  };
  const data = map[enemy.attack] || {buy:['Rakibin zayıflığına uygun karşı parça','Bir savunma parçası','Bir hareket/destek parçası'], plan:`Bu rakibe karşı raporda yazan zayıflığı hedefle: ${enemy.weakText || 'doğru karşı parçayı seç'}.`};
  return `AL: ${data.buy.join(' + ')}. YAP: ${data.plan}`;
}

function scoutReport(enemy, scout, seed, level){
  const wrong = level>1 && rng(seed+21) < scout.wrong;
  const fakeWeak = ['water','electricRes','pierce','control','shield','chemRes','bioRes','radar','cyberRes'][Math.floor(rng(seed+33)*8)];
  const weak = wrong ? fakeWeak : enemy.weak;
  const hiddenHints = ['Son dakika savunma takabilir', 'Saldırı sonrası zemin bozabilir', 'İkinci fazda hızlanabilir', 'Enerji kalkanı saklıyor olabilir'];
  const hidden = hiddenHints[Math.floor(rng(seed+77)*hiddenHints.length)];
  let certainty = 'Zayıf rapor. Tahmin yanlış çıkabilir.';
  let weakText = 'Zayıflık bilinmiyor. Sadece ana saldırı görüldü.';
  let detail = ['Ana saldırı: '+enemy.weapon];
  if(scout.stars>=2){
    certainty = wrong ? 'Sokak raporu: bazı bilgiler kulaktan dolma olabilir.' : 'Sokak raporu: beklenen saldırı ve bir tahmin var.';
    weakText = wrong ? 'Tahmin: '+weakToText(fakeWeak) : 'Tahmin: '+weakToText(enemy.weak);
    detail.push('Beklenen özellik: '+enemy.expected.slice(0,2).join(' / '));
  }
  if(scout.stars>=3){
    certainty = wrong ? 'Drone raporu karışık. MegaCore iz bırakmamış olabilir.' : 'Drone raporu güvenilir; yine de gizli parça olabilir.';
    detail.push('Olası risk: '+enemy.expected[2]);
  }
  if(scout.stars>=4){
    detail.push('Gizli parça ipucu: '+hidden);
    certainty = wrong ? 'Uydu görüntüsü net değil; küçük yanılma riski var.' : 'Uydu raporu güçlü. Gizli parçaya dair ipucu yakalandı.';
  }
  if(scout.stars>=5){
    certainty = 'Kesin zayıflık tespiti. Efsane Göz sadece neye zayıf olduğunu değil, nasıl saldırman gerektiğini de söylüyor.';
    weakText = enemy.weakText;
    detail.push('Kesin zayıflık: '+enemy.weakText);
    detail.push('Saldırı planı: '+legendaryAttackAdvice(enemy));
  }
  const advice = scout.stars>=5 ? legendaryAttackAdvice(enemy) : '';
  return { wrong, attack: enemy.attack, weapon: enemy.weapon, expected: enemy.expected, weak, weakText, certainty, detail, scoutStars: scout.stars, advice };
}


function partHasCounter(part, attack){
  if(!part || !attack) return false;
  const tags = part.tags || [];
  // Ana kural: parça etiketinde karşılık varsa doğrudan doğru hamledir.
  if(tags.includes(`counter:${attack}`)) return true;
  // Kademeli ve akıllı karşı hamleler: tek parça da işe yarasın, kombo sadece bonus versin.
  if(attack==='dash' && (part.id==='radar' || part.id==='net' || part.id==='servo' || part.id==='stabilizer' || (part.stats?.radar||0)>=25 || (part.stats?.control||0)>=25)) return true;
  if((attack==='ghost' || attack==='sand' || attack==='glitch') && ((part.stats?.radar||0)>=25 || part.id==='jammer' || part.id==='smoke')) return true;
  if(attack==='missile' && ((part.stats?.shield||0)>=25 || part.id==='dash' || part.id==='antiMissile')) return true;
  if(attack==='hack' && ((part.stats?.cyberRes||0)>=25 || part.id==='manual' || part.id==='firewall' || part.id==='antiHack')) return true;
  if(attack==='fire' && ((part.stats?.water||0)>=25 || (part.stats?.fireRes||0)>=25 || part.id==='water' || part.id==='cool')) return true;
  if(attack==='electric' && ((part.stats?.electricRes||0)>=25 || part.id==='rubber' || part.id==='shield')) return true;
  if(attack==='acid' && ((part.stats?.chemRes||0)>=25 || part.id==='coat' || part.id==='neutralizer')) return true;
  if(attack==='bio' && ((part.stats?.bioRes||0)>=25 || part.id==='biofilter' || part.id==='enzyme')) return true;
  if(attack==='laser' && ((part.stats?.shield||0)>=25 || part.id==='mirror' || part.id==='dash' || part.id==='smoke')) return true;
  if(attack==='slam' && ((part.stats?.armor||0)>=28 || part.id==='track' || part.id==='shockAbsorber' || part.id==='armorPlate')) return true;
  if(attack==='magnet' && ((part.stats?.control||0)>=25 || part.id==='stabilizer' || part.id==='track')) return true;
  if(attack==='ice' && ((part.stats?.fireRes||0)>=25 || part.id==='coolant' || part.id==='dash')) return true;
  if((attack==='psycho' || attack==='taunt' || attack==='fear') && ((part.stats?.morale||0)>=20 || part.id==='mindShield' || part.id==='panicDamper' || part.id==='truthSpeaker' || part.id==='focusChip' || part.id==='radar')) return true;
  if(attack==='controlHijack' && ((part.stats?.cyberRes||0)>=25 || part.id==='manual' || part.id==='firewall' || part.id==='antiHack')) return true;
  if(attack==='swarm' && (part.id==='antiMissile' || part.id==='emp' || part.id==='smoke' || part.id==='miniFlak' || (part.stats?.shield||0)>=25 || (part.stats?.control||0)>=25)) return true;
  return false;
}

function weakToText(weak){
  const map={
    water:'su saldırısı ve soğutma',
    electricRes:'kauçuk yalıtım veya enerji kalkanı',
    pierce:'zırh delme, matkap veya raylı top',
    control:'radar, ağ veya kontrol',
    shield:'kalkan ve hareket',
    chemRes:'kimyasal kaplama veya nötralizan',
    bioRes:'biyo filtre veya enzim temizleyici',
    radar:'radar ve kontrol',
    fireRes:'ısı yönetimi ve hız',
    cyberRes:'güvenlik duvarı veya manuel kontrol',
    morale:'moral koçu, zihin kalkanı veya panik sönümleyici',
    pr:'PR savunması ve sakin anons',
    focus:'odak çipi, moral ve radar',
    area:'alan etkili savunma, EMP veya mini taret',
    balance:'dengeli kurulum'
  };
  return map[weak] || 'uygun karşı parça';
}

function buildCounterScore(list, enemy){
  const stats = totalStats(list);
  let score = 0;
  list.forEach(p=>{
    if(partHasCounter(p, enemy.attack)) score += 28 + (p.cost>0?8:0);
    if(p.tags?.includes(`weak:${enemy.attack}`)) score += 16;
  });
  // Hamle-karşı hamle sistemi kademeli çalışır: tek doğru parça da işe yarar, kombo sadece güçlendirir.
  if(enemy.attack==='dash') score += Math.min(30, stats.radar*.55) + Math.min(24, stats.control*.45) + Math.min(12, stats.speed*.25);
  if(enemy.attack==='ghost' || enemy.attack==='sand' || enemy.attack==='glitch') score += Math.min(32, stats.radar*.65) + Math.min(16, stats.control*.30);
  if(enemy.attack==='missile') score += Math.min(30, stats.shield*.55) + Math.min(18, stats.speed*.30) + Math.min(10, stats.radar*.20);
  if(enemy.attack==='hack' || enemy.attack==='controlHijack') score += Math.min(38, stats.cyberRes*.75) + Math.min(14, stats.control*.25);
  if(['psycho','taunt','fear'].includes(enemy.attack)) score += Math.min(36, (stats.morale||0)*.8) + Math.min(16, stats.radar*.25) + Math.min(14, stats.control*.25);
  if(enemy.attack==='swarm') score += Math.min(28, stats.shield*.45) + Math.min(22, stats.control*.45) + Math.min(18, stats.radar*.25);
  return Math.round(score);
}
function counterCandidates(list, enemy){
  return list.filter(p=>partHasCounter(p, enemy.attack));
}
function counterAdvice(enemy){
  if(enemy.attack==='dash') return `Radar tek başına Hızlı Pençe'nin geliş yönünü okur ve karşı hamleyi başlatır; ağ ve kontrol parçaları sadece ekstra güç verir.`;
  if(enemy.attack==='ghost') return 'Radar gizli yaklaşımı yakalar; kontrol desteği rakibi kaçırmaz.';
  if(enemy.attack==='sand') return 'Radar ve kontrol, kum körletmesine rağmen hedefi elde tutar.';
  if(enemy.attack==='glitch') return 'Radar, veri analizi ve kontrol sahte hedefleri ayıklar.';
  if(enemy.attack==='missile') return 'Kalkan, kaçış motoru ve radar füze baskısını azaltır.';
  if(enemy.attack==='hack' || enemy.attack==='controlHijack') return 'Güvenlik duvarı ve manuel kontrol, rakibin robotu kilitleme planını keser.';
  if(enemy.attack==='psycho') return 'Moral ve zihin savunması panik yayınını susturur; yoksa robot yanlış hamle yapar.';
  if(enemy.attack==='taunt') return 'PR savunması ve moral parçaları alay yayınını boşa düşürür.';
  if(enemy.attack==='fear') return 'Odak, moral ve radar karanlık alanda robotu ayakta tutar.';
  if(enemy.attack==='swarm') return 'Alan savunması, duman, EMP veya mini taret sürüyü dağıtır.';
  return `Bu hamlenin doğru karşılığı: ${enemy.weakText||'uygun savunma'}.`;
}
function usedWeakPoint(partsList, enemy, stats, offense){
  const weakParts = partsList.filter(p=>p.tags?.includes(`weak:${enemy.attack}`) || (enemy.weak==='water'&&p.id==='water') || (enemy.weak==='pierce'&&(p.id==='drill'||p.id==='rail'||p.id==='acid')));
  if(weakParts.length || offense>=28) return true;
  if(enemy.weak==='control' && (stats.radar>=25 || stats.control>=25)) return true;
  if(enemy.weak==='radar' && stats.radar>=25) return true;
  if(enemy.attack==='dash' && (stats.radar>=25 || stats.control>=25)) return true;
  if((enemy.attack==='hack'||enemy.attack==='controlHijack') && stats.cyberRes>=25) return true;
  if(['psycho','taunt','fear'].includes(enemy.attack) && ((stats.morale||0)>=20 || stats.radar>=25)) return true;
  if(enemy.attack==='swarm' && (stats.shield>=25 || stats.control>=25 || stats.radar>=25)) return true;
  return false;
}
function attackScore(list, enemy, stats){
  let score = 0;
  if(enemy.weak==='water') score += stats.water*1.2;
  if(enemy.weak==='electricRes') score += stats.electricRes*.9 + stats.shield*.35;
  if(enemy.weak==='pierce') score += stats.pierce*1.25 + stats.damage*.25;
  if(enemy.weak==='control') score += stats.control*.95 + stats.radar*.65;
  if(enemy.weak==='shield') score += stats.shield*.9 + stats.speed*.45;
  if(enemy.weak==='chemRes') score += stats.chemRes*.95 + stats.repair*.35;
  if(enemy.weak==='bioRes') score += stats.bioRes*.95 + stats.repair*.35;
  if(enemy.weak==='radar') score += stats.radar*1.1 + stats.control*.45;
  if(enemy.weak==='fireRes') score += stats.fireRes*.9 + stats.speed*.35;
  if(enemy.weak==='cyberRes') score += stats.cyberRes*1.15 + stats.control*.45 + stats.radar*.25;
  if(enemy.weak==='morale') score += (stats.morale||0)*1.1 + stats.control*.35 + stats.radar*.25;
  if(enemy.weak==='pr') score += (stats.morale||0)*.8 + stats.shield*.25 + stats.control*.25;
  if(enemy.weak==='focus') score += (stats.morale||0)*.9 + stats.radar*.55 + stats.control*.35;
  if(enemy.weak==='area') score += stats.shield*.55 + stats.control*.75 + stats.radar*.25;
  if(enemy.weak==='balance') score += Math.min(18,stats.armor*.2)+Math.min(18,stats.damage*.25)+Math.min(18,stats.shield*.25)+Math.min(18,stats.repair*.25)+Math.min(18,stats.energy*.25);
  return score;
}
function surprise(enemy, partsList, stats, level, seed){
  if(level===1) return null;
  const attackCount = partsList.filter(p=>p.tab==='Silah' && p.cost>0).length;
  const options = [
    {icon:'🟡💧', name:'BEKLENMEDİK OLAY!', text:'Rakip son anda suyu dağıtan bir kaplama açtı. Demek ki senin planı az çok okumuşlar!', cond:stats.water>35, delta:-13},
    {icon:'🟡🛡️', name:'BEKLENMEDİK OLAY!', text:'Rakip garip bir frekans bastı. Kalkan bir an titredi; bu hamleyi raporda görmemiştik!', cond:stats.shield>35, delta:-11},
    {icon:'🟡🧲', name:'BEKLENMEDİK OLAY!', text:'Zeminde beklenmedik manyetik çizgiler yandı. Hız planın bir anda bozuldu!', cond:stats.speed>35, delta:-10},
    {icon:'🟡🎭', name:'BEKLENMEDİK OLAY!', text:'Rakip zayıf görünen tarafını kapatmış. Kısacası MegaCore çaktırmadan dersine çalışmış!', cond:true, delta:-7},
    {icon:'🟡⚙️', name:'BEKLENMEDİK OLAY!', text:'Robotunda çok silah var ama hepsi aynı anda konuşunca sistem karıştı. Fazla yük bu kez ters tepti!', cond:attackCount>3, delta:-16},
  ];
  const candidates = options.filter(o=>o.cond);
  return candidates[Math.floor(rng(seed+level*91)*candidates.length)];
}
function luckEvent(seed, level, owned){
  const active = activeStaff(owned);
  const analyst = active.some(o=>o.unlock?.includes('analysis'));
  const roll = rng(seed+level*71);
  if(roll<0.16) return {icon:'🍀', name:'Tribün enerjisi', text:'Garajın adı duyulunca robotun moral protokolü hızlandı.', delta:8};
  if(roll<0.30) return {icon:'🔩', name:'Gevşek vida', text:'Sert dönüşte bir bağlantı gevşedi.', delta: analyst ? -3 : -8};
  if(roll<0.43) return {icon:'⚡', name:'Kısa kıvılcım', text:'Arena zemini beklenmedik parazit üretti.', delta: analyst ? -2 : -7};
  if(roll<0.55) return {icon:'🧠', name:'Usta dokunuşu', text:'Babanın defterindeki ayar tam zamanında işe yaradı.', delta:6};
  return {icon:'🎲', name:'Temiz maç', text:'Şans bu kez oyunu çok değiştirmedi.', delta:0};
}
function staffRisk(seed, owned){
  const risks=[];
  activeStaff(owned).forEach((o,i)=>{
    if(o.fail && rng(seed+i*17) < o.fail){
      risks.push({icon:'⚠️', name:`${o.name} hatası`, text:`${o.role} ekibinden küçük bir hata geldi. Ucuz ekip bazen böyle çuvallar.`, delta: o.stars<=2 ? -8 : -4});
    }
  });
  return risks.slice(0,2);
}
function robotPersonality(partsList){
  const atk=partsList.filter(p=>p.tab==='Silah').length, def=partsList.filter(p=>p.tab==='Savunma').length, mov=partsList.filter(p=>p.tab==='Hareket').length, sup=partsList.filter(p=>p.tab==='Destek').length;
  if(atk>=4) return {name:'Öfkeli', bonus:-4, text:'Çok saldırgan. Vurur ama çabuk yorulur.'};
  if(def>=3 && sup>=2) return {name:'Sabırlı', bonus:7, text:'Yavaş ama dayanıklı. Uzun maçları sever.'};
  if(mov>=2 && atk>=2) return {name:'Atik', bonus:5, text:'Pozisyon almayı sever. Hızlı rakiplere karşı iyi.'};
  if(atk>=1&&def>=1&&mov>=1&&sup>=1) return {name:'Dengeli', bonus:9, text:'Babanın defterindeki gibi: ne eksik, ne fazla.'};
  return {name:'Hurda Ruhlu', bonus:0, text:'Basit ama inatçı.'};
}
function comboBonuses(partsList){
  const ids=partsList.map(p=>p.id);
  const has=(...xs)=>xs.every(x=>ids.includes(x));
  const out=[];
  if(has('water','cool')) out.push({icon:'💧❄️', name:'Buhar Bastırma Kombosu', text:'Su Topu ile Aktif Soğutma birlikte çalıştı. Ateşin havası söndü.', delta:14});
  if(has('radar','net')) out.push({icon:'📡🕸️', name:'Kesin Yakalama Kombosu', text:'Radar hedefi buldu, ağ fırlatıcı kaçış yolunu kapattı.', delta:13});
  if(has('shield','battery')) out.push({icon:'🛡️🔋', name:'Uzun Savunma Kombosu', text:'Kalkan bataryadan beslendi. Kritik darbeyi yedi ama çökmüyor.', delta:12});
  if(has('acid','coat')) out.push({icon:'🧪🟩', name:'Kimyasal Usta Kombosu', text:'Asit saldırısı ve kimyasal kaplama aynı plana bağlandı.', delta:11});
  if(has('biofilter','enzyme')) out.push({icon:'😷🧬', name:'Temiz Devre Kombosu', text:'Biyo filtre yakaladı, enzim temizleyici sistemi açık tuttu.', delta:11});
  return out;
}
function durabilityPenalty(partsList, durability){
  const worn=partsList.filter(p=>(durability[p.id]??100)<45 && p.cost>0);
  if(!worn.length) return null;
  return {icon:'🧰', name:'Yıpranmış parça', text:`${worn.slice(0,2).map(p=>p.name).join(' ve ')} yıpranmış. Tamir etmeden arenaya çıkmak riskli.`, delta:-Math.min(18, worn.length*7)};
}
function makeBattle(partsList, enemy, level, seed, robotName, owned, report, opts={}){
  const stats=totalStats(partsList);
  const active = activeStaff(owned);
  const events=[]; const add=(tone,icon,title,text,delta=0)=>events.push({tone,icon,title,text,delta});
  const counter = buildCounterScore(partsList, enemy);
  const offense = attackScore(partsList, enemy, stats);
  const attackCount = partsList.filter(p=>p.tab==='Silah'&&p.cost>0).length;
  const defCount = partsList.filter(p=>p.tab==='Savunma').length;
  const moveCount = partsList.filter(p=>p.tab==='Hareket').length;
  const supportCount = partsList.filter(p=>p.tab==='Destek').length;
  let score = 22 + counter + offense + stats.armor*.25 + stats.energy*.25 + stats.repair*.35 + (opts.garageLevel||1)*3;
  const personality = robotPersonality(partsList); score += personality.bonus;
  add('neutral','🔔','Demir kapılar kapandı',`${robotName} ve ${enemy.name} altıgen arenaya çıktı. Robot karakteri: ${personality.name}. ${personality.text}`,personality.bonus);
  comboBonuses(partsList).forEach(c=>{ add('good',c.icon,c.name,c.text,c.delta); score += c.delta; });
  const worn = durabilityPenalty(partsList, opts.durability||{}); if(worn){ add('bad', worn.icon, worn.name, worn.text, worn.delta); score += worn.delta; }
  add('bad', enemy.icon, `${enemy.name} hamle yaptı`, `${enemy.weapon} devreye girdi. Rakip ilk baskıyı kurdu.`, -enemy.power/10);
  if(['psycho','taunt','fear'].includes(enemy.attack)){
    const flavor = enemy.attack==='psycho' ? 'Hoparlörden babanın sesini taklit eden kirli bir kayıt çaldılar. Robotun karar sistemi bir an titredi.' : enemy.attack==='taunt' ? 'Rakip tribün ekranlarına alaycı mesajlar bastı. Ama doğru moral sistemi varsa bu laflar duvara çarpar.' : 'Arena ışıkları söndü, rakip gölge gibi üstüne geldi. Radar ve odak yoksa robot panikler.';
    add('surprise','🧠','Psikolojik baskı', flavor, -10);
    score -= 10;
  }
  if(enemy.attack==='swarm'){ add('surprise','🐝','Sürü dağıldı', 'Rakip tek robot gibi görünüyordu ama gövdesinden mini dronelar çıktı. Alan savunması olmayan kurulum burada zorlanır.', -9); score -= 9; }
  if(enemy.attack==='hack' && stats.cyberRes<22 && !partsList.some(p=>p.id==='manual')){
    add('bad','💻','Kara kod içeri sızdı',`Rakip yazılım kapısından girdi. ${robotName} bir an dondu; hack savunması yoksa maç burada kopar. Doğru cevap: ${enemy.weakText}.`, -38);
    score -= 38;
  }
  const counters = counterCandidates(partsList, enemy);
  const hasUsefulCounter = counters.length || (enemy.attack==='dash' && (stats.radar>=25 || stats.control>=25)) || (['ghost','sand','glitch'].includes(enemy.attack) && stats.radar>=25) || (enemy.attack==='hack' && stats.cyberRes>=25);
  if(hasUsefulCounter){
    const names = counters.length ? counters.slice(0,2).map(p=>`${p.icon} ${p.name}`).join(' + ') : 'mevcut sensör ve kontrol sistemi';
    add('good','✅','Karşı hamle tuttu',`${robotName}, ${names} ile baskıyı kesti. ${counterAdvice(enemy)}`, Math.round(counter));
  } else {
    add('bad','❌','Karşı hamle eksik',`${robotName} bu saldırıya net cevap veremedi. ${counterAdvice(enemy)}`, -24);
    score -= 24;
  }
  if(usedWeakPoint(partsList, enemy, stats, offense)) add('good','🎯','Plan işe yaradı',`${robotName} rakibin açığını doğru okudu. Tam kombo olmasa bile seçtiğin parça bu hamlede gerçekten işe yaradı.`, Math.round(offense));
  else { add('bad','🧩','Plan zayıf kaldı',`Rakibin açığı vardı ama kurulum bunu yeterince hedeflemedi. Tek başına ham güç yetmedi.`, -16); score-=16; }
  const sp = surprise(enemy, partsList, stats, level, seed);
  if(sp){ const reduced = active.some(o=>o.unlock?.includes('analysis')) ? Math.ceil(sp.delta/2) : sp.delta; add('surprise',sp.icon,sp.name,sp.text,reduced); score += reduced; }
  const luck = luckEvent(seed, level, owned); add(luck.delta>=0?'good':'bad',luck.icon,`Şans: ${luck.name}`,luck.text,luck.delta); score += luck.delta;
  staffRisk(seed+101, owned).forEach(r=>{ add('bad',r.icon,r.name,r.text,r.delta); score += r.delta; });
  if(report.wrong && level>1){ add('bad','🔎','Yanlış gözlem bedeli',`${bestScout(owned).name} rakibi tam okuyamadı. Raporun bir kısmı yanıltıcıydı. Daha iyi gözlemci gerçek zayıflığı söyler.`, -10); score-=10; }
  if(attackCount>3){ const d=(attackCount-3)*14; add('bad','🏋️','Aşırı saldırı yükü',`Çok fazla saldırı sistemi robotu ağırlaştırdı. Silah sayısı arttı ama akıl azaldı.`, -d); score-=d; }
  if(defCount===0){ add('bad','🛡️','Savunmasız kurulum',`Savunma yoksa doğru anda karşı hamle yapmak zorlaşır.`, -18); score-=18; }
  if(moveCount===0 && level>1){ add('bad','🛞','Hareket planı eksik',`Robot pozisyon alamadı. Savaş sadece vurmak değildir.`, -14); score-=14; }
  if(supportCount>0) { add('good','🔧','Destek sistemi çalıştı',`Destek parçaları maç boyunca küçük avantajlar topladı.`, 8); score+=8; }
  if(active.some(o=>o.unlock?.includes('tactic')) && attackCount>=1 && defCount>=1 && moveCount>=1){ add('good','♟️','Taktisyen bonusu',`Dengeli kurulum taktik planla birleşti.`, 10); score+=10; }
  if(active.some(o=>o.unlock?.includes('morale'))){ add('good','❤️','Moral bonusu',`Ekip panik yapmadı. ${robotName} daha kararlı yürüdü.`, 5); score+=5; }
  if(enemy.easyMode || opts.easyMode){ add('good','🍀','İstanbul dönüşü avantajı',`Yıllar sonra daha güçlü döndün. Tecrüben ve yüksek bütçen sana ciddi avantaj veriyor; ama yanlış kurulum yaparsan MegaCore yine seni yakalayabilir.`, 28); score += 28; }
  score=Math.round(clamp(score,0,260));
  const finalThreshold = enemy.type==='Son Emir' ? 115 : (enemy.easyMode || opts.easyMode ? Math.max(28, enemy.threshold - 18) : enemy.threshold + (opts.megaPower||0)*4 + (level>=9?8:0));
  const won=score>=finalThreshold;
  add(won?'good':'bad', won?'🏆':'💔', won?'Son hamle: Zafer':'Son hamle: Düşüş', won?`${robotName} doğru anda bastırdı. MegaCore robotu sustu.`:`${robotName} ayakta kalmaya çalıştı ama kurulum bu rakibe yetmedi.`, won?18:-12);
  const over = score - finalThreshold;
  const pr = active.some(o=>o.unlock?.includes('pr')) ? 1.2 : 1;
  const morale = active.some(o=>o.unlock?.includes('morale')) ? .12 : 0;
  const repGain = won ? Math.max(.5, +(0.5 + Math.max(0, over)*0.015*pr).toFixed(2)) : +Math.max(-0.55, (-0.28 + over*0.006 + morale)).toFixed(2);
  const sponsorBonus = active.some(o=>o.unlock?.includes('goldDeal')) ? 1.15 : active.some(o=>o.unlock?.includes('sponsor')) ? 1.08 : 1;
  const dealBonus = (won && opts.sponsorDeal) ? opts.sponsorDeal.bonus : 0;
  const dealPenalty = (!won && opts.sponsorDeal) ? opts.sponsorDeal.penalty : 0;
  const baseWin = 300 + level*95 + Math.max(0,over)*4;
  const consolation = opts.sponsorDeal ? Math.round(80 + level*12 - dealPenalty) : 80 + level*12;
  const reward = won ? Math.round(baseWin * sponsorBonus + dealBonus) : consolation;
  const finalRepGain = !won && opts.sponsorDeal ? +(repGain-0.08).toFixed(2) : repGain;
  return {events, score, threshold:finalThreshold, won, over, repGain:finalRepGain, reward, luck, dealPenalty};
}

function Header({company,gold,rep,level}){ return <header className="top"><b>🏚️ {company||'Garaj'}</b><span>Level {level}/10</span><span>💰 {gold}</span><span className="repPill" title="Yıldız = İtibar"><StarRating value={rep}/> İtibar: {rep.toFixed(2)}/5</span><button className="audioToggle" onClick={()=>window.dispatchEvent(new Event('toggle-music'))}>🎵 Müzik Aç/Kapat</button></header> }
function Toast({text}){ return text ? <div className="toast">{text}</div> : null; }
function StoryArt({art,emoji}){
  const groups = {
    diplomaRoad:['🎓','🧳','🛣️'], motherDoor:['🏠','😢','🤲'], motherCry:['😭','💔','🏘️'], garageRain:['🌧️','🏚️','⚡'],
    fatherFinal:['👨‍🔧','🩸','📄'], ticketVow:['🎟️','📄','👑'], funeralRobot:['🕯️','🤖','🛠️'], redButton:['🤖','🔴','✨'],
    tearWipe:['🥀','🔥','🤖'], blackout:['💡','🌃','⚡'], revengeRoad:['🏢','👊','🔥'], whiteExit:['🚪','🧳'],
    istanbul:['🌉','🏙️','🚕'], producer:['🎬'], twentyYears:['⏳'], engineerRise:['💼','⚙️','🏙️'], returnGarage:['🚆','🏚️','🤖'], default:[emoji||'📖']
  };
  const items = groups[art] || groups.default;
  return <div className={`storyArt ${art||'default'}`}>
    {items.map((it,i)=><span key={i} className={`artItem i${i+1}`}>{it}</span>)}
    {art==='diplomaRoad' && <div className="openingFx confettiBurst" aria-hidden>{['🎉','🎊','🥳','✨','🎈','🎇','🎉','🎊'].map((it,i)=><span key={i} className={`fx e${i+1}`}>{it}</span>)}</div>}
    {art==='motherDoor' && <div className="openingFx lightningBW" aria-hidden><span className="flashLayer"/><span className="bolt b1">⚡</span><span className="bolt b2">⚡</span></div>}
    {art==='garageRain' && <div className="openingFx footstepsRain" aria-hidden>{Array.from({length:8}).map((_,i)=><span key={i} className={`step s${i+1}`}>👣</span>)}</div>}
    {art==='fatherFinal' && <div className="openingFx lightningRed" aria-hidden><span className="flashLayer"/><span className="bolt b1">⚡</span><span className="bolt b2">⚡</span></div>}
    {art==='whiteExit' && <div className="openingFx laughRoam" aria-hidden>{['🤣','😂','😆','😹','🤣','😂','😆','😹'].map((it,i)=><span key={i} className={`laugh l${i+1}`}>{it}</span>)}</div>}
  </div>;
}
function StoryScreen({kind, pages, index, next, header, skip, finalLabel, finalAction}){
  const p=pages[index];
  const isLast=index>=pages.length-1;
  const primaryAction=isLast?(finalAction||next):next;
  const primaryLabel=isLast?(finalLabel||'🔥 Devam Et'):'➡️ İlerle';
  return <main className={`page storyPage ${p.theme||''}`}>{header}<section className={`storyBox ${p.theme||''}`}><StoryArt art={p.art} emoji={p.emoji}/>{p.emoji?<div className="storyIcon small">{p.emoji}</div>:null}<p className="eyebrow">{kind} · {index+1}/{pages.length}</p><h1>{p.title}</h1>{p.text?<p>{p.text}</p>:null}<div className="dots">{pages.map((_,i)=><i key={i} className={i<=index?'on':''}/>)}</div><div className="storyActions"><button onClick={primaryAction}>{primaryLabel}</button>{skip&&<button className="ghostBtn" onClick={skip}>⏭️ Tutorialı Atla</button>}</div></section></main>
}
function PartCard({p, selected, owned, soldLocked, gold, level, onToggle, onSell, durability=100}){
  const isFree = p.cost===0;
  const priceText = isFree ? 'Bedava' : owned ? `+${sellPrice(p)} 💰` : `${p.cost} 💰`;
  const stateText = selected ? 'Takılı' : owned ? 'Sökülürse satılır' : soldLocked ? 'Bu hazırlıkta satıldı' : 'Satın al';
  const disabled = soldLocked || (!owned && gold<p.cost);
  return (
    <button className={`part ${selected?'active':''} ${owned&&!selected?'stored':''} ${soldLocked?'soldLocked':''} ${level===1&&p.id==='water'&&!selected?'pulse':''}`} disabled={disabled} onClick={()=>onToggle(p)}>
      <div><span>{p.icon}</span><b>{priceText}</b></div>
      <h3>{p.name}</h3>
      <p>{p.desc}</p>
      {owned&&<small className={durability<45?'durability warn':'durability'}>🔧 Sağlık: {durability}%</small>}
      <small>{stateText} · {Object.keys(p.stats).filter(k=>p.stats[k]>0).map(k=>statNames[k]).join(' · ')}</small>
      {selected && !isFree && <em className="sellBtn" onClick={(e)=>onSell(p,e)}>Sök/Sat: +{sellPrice(p)} 💰</em>}
    </button>
  );
}


function BattleArena({battle,step,advance,finish,enemy,robotName,done}){ const e=battle.events[step]; return <div className="battleGrid"><div className="arenaCard"><div className="scoreLine"><span>{robotName}</span><b>{battle.score} / {battle.threshold}</b><span>{enemy.name}</span></div><div className={`hex ${e.tone}`}><div className="bot player">🤖<small>{robotName}</small></div><div className={`bigFx ${e.tone}`}>{e.icon}</div><div className="bot enemy">{enemy.icon}<small>{enemy.type}</small></div><div className="laserLine" /></div><div className={`eventBanner ${e.tone}`}><h2>{e.title}</h2><p>{e.text}</p><b>{e.delta>0?`+${e.delta}`:e.delta<0?e.delta:'0'} etki</b></div><div className="battleBtns"><button onClick={advance} disabled={done}>Sonraki Hamle</button><button onClick={finish} disabled={done}>Savaşı Anında Bitir</button></div></div><aside className="moveLog"><h3>Hamleler</h3>{battle.events.slice(0, step+1).map((m,i)=><div key={i} className={`move ${m.tone} ${i===step?'active':''}`}><span>{i+1}. {m.icon}</span><p>{m.title}</p><small>{m.delta>0?`+${m.delta}`:m.delta}</small></div>)}{step<battle.events.length-1&&<div className="move hiddenMove"><span>?. ❔</span><p>Sıradaki hamle henüz belli değil.</p><small>gizli</small></div>}</aside></div> }


function StatBar({label,value}){
  const pct = Math.min(100, Math.abs(value)*2.1);
  return <div className="bar"><small>{label}</small><span><b className={value<0?'neg':''} style={{width:`${pct}%`}} /></span><em>{value>0?`+${value}`:value}</em></div>;
}

function EnemyPanel({enemy,report,open,setOpen}){
  return <div className="enemyBox">
    <button onClick={()=>setOpen(!open)}>{open?'📕 Rakip Raporunu Kapat':'📘 Rakip Raporunu Aç'}</button>
    {open&&<>
      <h2>{enemy.icon} {enemy.name}</h2>
      <p><b>Beklenen saldırı:</b> {report?.weapon || enemy.weapon}</p>
      <p><b>Rapor:</b> {report?.certainty || 'Rapor hazırlanıyor.'}</p>
      <p><b>Zayıflık:</b> {report?.weakText || 'Bilinmiyor.'}</p>
      {report?.advice&&<div className="legendAdvice"><b>👁️ Efsane Göz net çözüm:</b><p>{report.advice}</p><small>Bu rapor tam çözüm mantığıyla yazılır: önce alınacak parçaları, sonra savaşta nasıl işleyeceğini söyler.</small></div>}
      {(report?.detail||[]).filter(d=>!String(d).startsWith('Saldırı planı:')).map((d,i)=><p key={i}>• {d}</p>)}
      {report?.wrong&&<p className="warn">⚠️ Bu gözlemci yanılmış olabilir. Arenada sürpriz çıkabilir.</p>}
    </>}
  </div>;
}

function StaffShop({owned,rep,gold,buy}){
  const active = activeStaff(owned);
  return <div className="staffWrap">
    {staffSections().map(role=>{
      const list = staff.filter(s=>s.role===role).sort((a,b)=>a.stars-b.stars || a.cost-b.cost);
      if(!list.length) return null;
      const activeMember = active.find(a=>a.role===role);
      return <section className="staffSection" key={role}>
        <h2>{role}</h2>
        <div className="staffGrid">
          {list.map(s=>{
            const has = owned.some(o=>o.id===s.id);
            const isActive = activeMember?.id===s.id;
            const price = discount(s.cost,rep);
            const isWorse = activeMember && activeMember.stars>s.stars;
            return <button key={s.id} className={`staffCard ${has?'owned':''}`} disabled={has || gold<price || isWorse} onClick={()=>buy(s,price)}>
              <div><span>{s.icon}</span><b>{s.name}</b></div>
              <p><StarRating value={s.stars}/> · {s.desc}</p>
              <small>{has ? (isActive?'Aktif · bonuslar birleşti':'Pasif · bonusu aktif üyeye aktarıldı') : isWorse ? 'Daha iyisi ekipte var' : `${price} 💰`}</small>
            </button>
          })}
        </div>
      </section>
    })}
  </div>;
}

function GaragePanel({garageLevel,gold,upgradeGarage,repairAll,durability,ownedPartIds}){
  const damaged = ownedPartIds.filter(id=>(durability[id]??100)<100);
  const repairCost = Math.round(damaged.reduce((sum,id)=>sum+(100-(durability[id]??100))*1.6,0));
  const upgradeCost = 900 + garageLevel*850;
  return <div className="garagePanel">
    <h2>🏚️ Garaj Yönetimi</h2>
    <div className="garageCards">
      <div><h3>🔧 Toplu Tamir</h3><p>{damaged.length ? `${damaged.length} parça yıpranmış. Tamir ücreti: ${repairCost} altın.` : 'Tüm parçalar sağlam görünüyor.'}</p><button disabled={!damaged.length || gold<repairCost} onClick={repairAll}>Tamir Et ({repairCost} 💰)</button></div>
      <div><h3>⬆️ Garajı Büyüt</h3><p>Seviye {garageLevel}. Daha büyük garaj daha iyi hazırlık, daha çok güven ve daha az tıkanma demek.</p><button disabled={garageLevel>=4 || gold<upgradeCost} onClick={upgradeGarage}>Garajı Büyüt ({upgradeCost} 💰)</button></div>
      <div><h3>🧒 Mahalle Desteği</h3><p>Çocuklarla bağın arttıkça maçlardan sonra kumbara desteği gelir. Bu garaj sadece senin değil, mahallenin umudu.</p></div>
    </div>
  </div>;
}

function MissionPanel({sponsorDeal,acceptSponsor,level,lossCount,robotName,company,megaMorale,megaPower,childBond,kidAid}){
  const bonus = 260+level*90;
  const penalty = Math.round(120+level*55);
  return <div className="missionPanel">
    <div className="news urgent"><h2>📰 MegaCore Haberleri</h2>{lossCount>0?<p>Son yenilgi hâlâ manşette: MegaCore yayınları “{robotName} baskıyı kaldıramadı” diye dönüyor. {company} garajı kazanırsa bu lafı susturacak; kaybederse haber daha da büyür.</p>:<p>MegaCore şimdilik seni küçümsüyor. İlk büyük hatalarını arenada bekliyorlar.</p>}<p className="tiny">MegaCore moral: {megaMorale.toFixed(1)}/5 · güç: {megaPower}</p></div>
    <div className="garageCards">
      <div><h3>🤝 Sponsor Anlaşması</h3><p>{sponsorDeal ? sponsorDeal.text : `Bu levelı kazanırsan ekstra +${bonus} altın. Kaybedersen -${penalty} altın ceza ve itibar kaybı.`}</p><button disabled={!!sponsorDeal} onClick={acceptSponsor}>{sponsorDeal?'Anlaşma Aktif':'Anlaşmayı Al'}</button></div>
      <div><h3>🧒 Çocukların Kumbara Gücü</h3><p>Bağ: {childBond.toFixed(1)}/5. Kazanırsan çocuklar sana yaklaşık +{kidAid} altın getirebilir.</p></div>
      <div><h3>📘 Kombo Defteri</h3><p>Su Topu + Aktif Soğutma ateşi boğar. Radar + Ağ hızlı rakibi yakalar. Kalkan + Batarya uzun savunma kurar.</p></div>
      <div><h3>🤖 Robot Kişiliği</h3><p>Çok saldırı öfkeli, çok savunma sabırlı, dengeli kurulum usta işi görünür. Kişilik savaş anlatımını etkiler.</p></div>
    </div>
  </div>;
}

function App(){
  const play=useSound();
  const [musicOn,setMusicOn]=useState(true);
  const [screen,setScreen]=useState('splash'); const [storyIndex,setStoryIndex]=useState(0); const [tutorialIndex,setTutorialIndex]=useState(0);
  const [company,setCompany]=useState(''); const [companyInput,setCompanyInput]=useState('');
  const [robotName,setRobotName]=useState(''); const [robotInput,setRobotInput]=useState('');
  const [level,setLevel]=useState(1); const [gold,setGold]=useState(START_GOLD); const [rep,setRep]=useState(1); const [seed,setSeed]=useState(12345);
  const [owned,setOwned]=useState([scouts[0]]); const [ownedPartIds,setOwnedPartIds]=useState(['starterCore','starterWheel']); const [selected,setSelected]=useState(['starterCore','starterWheel']); const [soldLocks,setSoldLocks]=useState([]); const [tab,setTab]=useState('Silah');
  const [battle,setBattle]=useState(null); const [step,setStep]=useState(0); const [paid,setPaid]=useState(false); const [toast,setToast]=useState(''); const [reportOpen,setReportOpen]=useState(true);
  const [garageLevel,setGarageLevel]=useState(1); const [durability,setDurability]=useState({starterCore:100,starterWheel:100}); const [sponsorDeal,setSponsorDeal]=useState(null);
  const [megaMorale,setMegaMorale]=useState(1); const [megaPower,setMegaPower]=useState(0); const [badMemory,setBadMemory]=useState(false); const [lossCount,setLossCount]=useState(0); const [newsSeenLoss,setNewsSeenLoss]=useState(0); const [childBond,setChildBond]=useState(0); const [hardStart,setHardStart]=useState(false); const [easyMode,setEasyMode]=useState(false);
  const warn=(t,k='bad')=>{ setToast(t); play(k); setTimeout(()=>setToast(''),2300); };
  const enemy=useMemo(()=>{ const base=getEnemy(level,seed,company,robotName||'Kıvılcım'); const easyCut=easyMode?20:0; return {...base, threshold: Math.max(28, base.threshold + megaPower*5 + (hardStart&&level===1?18:0) - easyCut), power: Math.max(12, base.power + megaPower*4 + (hardStart&&level===1?12:0) - (easyMode?12:0)), megaMorale, hardStart, easyMode}; },[level,seed,company,robotName,megaPower,megaMorale, easyMode]);
  const scout=useMemo(()=>bestScout(owned),[owned]);
  const report=useMemo(()=>scoutReport(enemy,scout,seed+level*53,level),[enemy,scout,seed,level]);
  const selectedParts=useMemo(()=>selected.map(id=>parts.find(p=>p.id===id)).filter(Boolean),[selected]);
  const stats=useMemo(()=>totalStats(selectedParts),[selectedParts]);
  const availableParts=useMemo(()=>parts.filter(p=>p.tab===tab && hasUnlock(owned,p.need)),[tab,owned]);
  const locked=useMemo(()=>parts.filter(p=>p.tab===tab && !hasUnlock(owned,p.need)).length,[tab,owned]);
  const done=battle && step>=battle.events.length-1;
  const levelOneReady = level!==1 || selected.includes('water');
  const canEnterArena = selectedParts.length>=2 && levelOneReady && !!robotName.trim();
  const kidAidAmount = () => childBond>0 ? Math.round(childBond * (35 + level*12)) : 0;

  useMp3Music(musicOn, screen, battle, done, screen==='tutorial'?tutorialIndex:storyIndex, level, badMemory);
  useEffect(()=>{
    const f=()=>setMusicOn(m=>!m);
    window.addEventListener('toggle-music', f);
    return ()=>window.removeEventListener('toggle-music', f);
  },[]);

  useEffect(()=>{
    if(screen==='battle' && done && battle && !paid){
      applyResult();
    }
  }, [screen, done, battle, paid]);

  function nextOpening(){ const pages=badMemory?comebackStory:introStory; if(storyIndex<pages.length-1) setStoryIndex(i=>i+1); else { setStoryIndex(0); setScreen(badMemory?'company':'introChoice'); } play('click'); }
  function nextDirectRevenge(){ if(storyIndex<directRevengeStory.length-1) setStoryIndex(i=>i+1); else { setStoryIndex(0); setScreen('company'); } play('click'); }
  function chooseRevenge(){ setStoryIndex(0); setScreen('directRevenge'); play('good'); }
  function chooseLeave(){ setEasyMode(true); setGold(9999); setRep(4.5); setChildBond(5); setMegaPower(-4); setMegaMorale(1); setStoryIndex(0); setScreen('leaveStory'); play('bad'); }
  function goReturnRevenge(){ setEasyMode(true); setGold(9000); setRep(4.2); setChildBond(5); setMegaMorale(1); setMegaPower(0); setStoryIndex(0); setScreen('returnRevenge'); play('good'); }
  function nextReturnRevenge(){ if(storyIndex<returnRevengeStory.length-1) setStoryIndex(i=>i+1); else { setStoryIndex(0); setScreen('company'); } play('click'); }
  function startCompany(){
    const raw=companyInput.trim();
    if(!raw) return warn('Şirket adı yazmadan garaj açılamaz.');
    const norm=raw.toLocaleLowerCase('tr-TR').replace(/\s+/g,' ');
    const compact=norm.replace(/\s+/g,'');
    if(compact==='enesrobotics'){
      setCompanyInput('');
      return warn('Senin kendine ait bir fikrin yok mu? MegaCore sana bakıp kahkaha atıyor. İsmi değiştirmen lazım.');
    }
    if(norm.includes('robotics')){
      setCompanyInput('');
      return warn(`Ne yapıyon? Enes değilse ${raw} olsun mu diyorsun yani? MegaCore'u bu zihniyetle çürütemezsin!!`);
    }
    if(norm==='kemal usta sanayi'){
      setCompany(raw);
      setScreen('kemalEnd');
      play('win');
      return;
    }
    const hasItibar = norm.includes('itibar');
    const hasPara = norm.includes('para');
    if(hasItibar) setRep(5);
    if(hasPara) setGold(100000);
    setCompany(raw);
    setScreen('tutorial');
    if(hasItibar && hasPara) warn('Gizli güç açıldı: 5 yıldız itibar ve 100000 altın!', 'win');
    else if(hasItibar) warn('Gizli güç açıldı: itibar 5 yıldız!', 'win');
    else if(hasPara) warn('Gizli güç açıldı: 100000 altın!', 'win');
    else play('good');
  }
  function nextTutorial(){ if(tutorialIndex<tutorialPages.length-1) setTutorialIndex(i=>i+1); else setScreen('nameRobot'); play('click'); }
  function saveRobot(){ if(!robotInput.trim()) return warn('Robotuna isim vermeden onaylayamazsın. Arenada bu isim anons edilecek.'); setRobotName(robotInput.trim()); setStoryIndex(0); setScreen('levelStory'); play('good'); }
  function goBuild(){ setStoryIndex(0); setBattle(null); setStep(0); setScreen('build'); play('click'); }
  function nextLevelStory(){ const pages=levelStories[level]||[]; if(!pages.length) return goBuild(); if(storyIndex<pages.length-1) { setStoryIndex(i=>i+1); play('click'); } else goBuild(); }
  function chooseTab(t){
    setTab(t);
    if(t==='Görev') setNewsSeenLoss(lossCount);
  }
  function startFromSplash(){
    setMusicOn(true);
    window.dispatchEvent(new Event('unlock-vsrobot-music'));
    if(window.__vsRobotMusicPlay) window.__vsRobotMusicPlay();
    setScreen('opening');
    setTimeout(()=>window.dispatchEvent(new Event('unlock-vsrobot-music')), 80);
    play('good');
  }

  function buyStaff(s,price){ if(owned.some(o=>o.id===s.id)) return; if(gold<price) return warn('Altın yetmiyor.'); setOwned(o=>[...o,s]); setGold(g=>g-price); warn(`${s.name} ekibe katıldı.`, 'buy'); }
  function togglePart(p){
    const isSelected=selected.includes(p.id); const isOwned=ownedPartIds.includes(p.id); const isSold=soldLocks.includes(p.id);
    if(isSelected){
      if(level===1 && p.id==='water') return warn('Level 1 dersinde Basınçlı Su Topu satılamaz. Ateş robotuna karşı bu parça şart.', 'bad');
      if(p.cost===0) return warn('Temel parçalar robotun ayakta kalması için sökülemez.','bad');
      const sell=sellPrice(p);
      setSelected(a=>a.filter(id=>id!==p.id));
      setOwnedPartIds(a=>a.filter(id=>id!==p.id));
      setDurability(d=>{ const n={...d}; delete n[p.id]; return n; });
      setSoldLocks(a=>Array.from(new Set([...a,p.id])));
      setGold(g=>g+sell);
      warn(`${p.name} söküldü ve yarı fiyatına satıldı: +${sell} altın. Depo yok; kararın önemli.`, 'buy');
      return;
    }
    if(isSold) return warn('Bu parçayı az önce sattın. Aynı hazırlıkta tekrar alıp satmaya izin yok; paran erimesin diye kilitledim.');
    if(selected.length>=9) return warn('Maksimum 9 parça takabilirsin. Daha fazlası robotu kullanılamaz yapar.');
    if(isOwned){
      // Eski sürümden kalan depodaki parça varsa ücretsiz takılmasına izin ver, ama yeni satın alımlarda depo oluşmaz.
      setSelected(a=>[...a,p.id]); warn(`${p.name} eski depodan takıldı. Bundan sonra sökersen yarı fiyatına satılır.`, 'click'); return;
    }
    if(gold<p.cost) return warn('Altın yetmiyor. Takılı parçayı sökersen yarı fiyatına satılır; depo sistemi yok.');
    setOwnedPartIds(a=>[...a,p.id]); setSelected(a=>[...a,p.id]); setDurability(d=>({...d,[p.id]:100})); setGold(g=>g-p.cost); warn(`${p.name} satın alındı ve robota takıldı. Sökersen alış fiyatının yarısına satılır.`, 'buy');
  }
  function sellPart(p,e){
    e.stopPropagation();
    if(level===1 && p.id==='water') return warn('Level 1 dersinde Basınçlı Su Topu satılamaz. Önce ateşi suyla durdurmayı öğreniyoruz.');
    if(p.cost===0) return warn('Ücretsiz temel parçalar satılamaz.');
    if(!ownedPartIds.includes(p.id)) return;
    const sell=sellPrice(p);
    setSelected(a=>a.filter(id=>id!==p.id));
    setOwnedPartIds(a=>a.filter(id=>id!==p.id));
    setDurability(d=>{ const n={...d}; delete n[p.id]; return n; });
    setSoldLocks(a=>Array.from(new Set([...a,p.id])));
    setGold(g=>g+sell);
    warn(`${p.name} söküldü ve satıldı: +${sell} altın. Aynı hazırlıkta tekrar alınamaz.`, 'buy');
  }
  function clearBuild(){
    const keepWater = level===1 && selected.includes('water');
    const paid = selectedParts.filter(p=>p.cost>0 && !(keepWater && p.id==='water'));
    const refund = paid.reduce((sum,p)=>sum+sellPrice(p),0);
    if(paid.length){
      setGold(g=>g+refund);
      setOwnedPartIds(ids=>ids.filter(id=>id==='starterCore'||id==='starterWheel'||(keepWater&&id==='water')||!paid.some(p=>p.id===id)));
      setSoldLocks(a=>Array.from(new Set([...a,...paid.map(p=>p.id)])));
      setDurability(d=>{ const n={...d}; paid.forEach(p=>delete n[p.id]); return n; });
    }
    setSelected(keepWater?['starterCore','starterWheel','water']:['starterCore','starterWheel']); warn(paid.length?`Takılı ücretli parçalar sökülüp yarı fiyatına satıldı: +${refund} altın.${keepWater?' Su Topu ders parçası olduğu için kaldı.':''}`:(keepWater?'Ders parçası Su Topu kaldı.':'Sadece temel parçalar kaldı.'), 'click');
  }
  function repairAll(){
    const damaged=ownedPartIds.filter(id=>(durability[id]??100)<100);
    const cost=Math.round(damaged.reduce((sum,id)=>sum+(100-(durability[id]??100))*1.6,0));
    if(!damaged.length) return warn('Tamir edilecek parça yok.', 'click');
    if(gold<cost) return warn(`Tamir için ${cost} altın lazım.`);
    setGold(g=>g-cost); setDurability(d=>{ const n={...d}; damaged.forEach(id=>n[id]=100); return n; }); warn(`Garaj tamiri tamamlandı: -${cost} altın.`, 'buy');
  }
  function upgradeGarage(){
    const cost=900 + garageLevel*850;
    if(garageLevel>=4) return warn('Garaj şimdilik maksimum seviyede.', 'click');
    if(gold<cost) return warn(`Garaj yükseltmesi için ${cost} altın lazım.`);
    setGold(g=>g-cost); setGarageLevel(l=>l+1); warn('Garaj büyüdü. Tamir, simülasyon ve hazırlık kalitesi arttı.', 'good');
  }
  function acceptSponsor(){
    if(sponsorDeal) return warn('Zaten aktif sponsor görevin var.', 'click');
    const bonus=260+level*90;
    const penalty=Math.round(120+level*55);
    setSponsorDeal({bonus,penalty,text:`Kazanırsan ekstra +${bonus} altın. Kaybedersen sözleşme cezası -${penalty} altın ve biraz itibar kaybı.`});
    warn('Sponsor görevi alındı. Kazanırsan bonus, kaybedersen ceza var.', 'buy');
  }
  function autoLevel1(){
    if(level!==1) return;
    const id='water';
    if(selected.includes(id)) return warn('Basınçlı Su Topu zaten takılı. Şimdi Arenaya Çık butonu ile savaşa girebilirsin.', 'click');
    if(soldLocks.includes(id)) return warn('Bu hazırlıkta Su Topunu satmışsın. Parçaları Sök veya yeni hazırlıkla tekrar dene.');
    const p=parts.find(x=>x.id===id);
    if(!p) return warn('Basınçlı Su Topu bulunamadı.');
    if(ownedPartIds.includes(id)){
      setSelected(s=>Array.from(new Set([...s,'starterCore','starterWheel',id])));
      setTab('Silah');
      warn('Ders uygulandı: sadece Basınçlı Su Topu takıldı. Şimdi Arenaya Çık!', 'buy');
      return;
    }
    if(gold<p.cost) return warn(`Basınçlı Su Topu için ${p.cost} altın lazım.`);
    setOwnedPartIds(a=>Array.from(new Set([...a,id])));
    setSelected(s=>Array.from(new Set([...s,'starterCore','starterWheel',id])));
    setGold(g=>g-p.cost);
    setTab('Silah');
    warn('Ders uygulandı: sadece Basınçlı Su Topu takıldı. Şimdi Arenaya Çık!', 'buy');
  }
  function startBattle(){
    if(!robotName.trim()) return warn('Robot adı olmadan savaş olmaz.');
    if(selectedParts.length<2) return warn('En az 2 parça gerekir. Ücretsiz gövde ve tekerlek var.');
    if(level===1 && !selected.includes('water')) {
      setTab('Silah');
      return warn('Önce Basınçlı Su Topu tak. Bu maçın dersi: ateşe suyla cevap vermek.');
    }
    try{
      const b=makeBattle(selectedParts,enemy,level,seed+selected.length*41,robotName,owned,report,{garageLevel,durability,sponsorDeal,megaPower,easyMode});
      if(!b || !Array.isArray(b.events) || !b.events.length) throw new Error('Savaş planı oluşturulamadı');
      setBattle(b);
      setStep(0);
      setPaid(false);
      setScreen('battle');
      play('click');
    }catch(err){
      console.error('Savaş motoru hatası:', err);
      const fallbackCounter = selectedParts.some(p=>partHasCounter(p, enemy.attack)) || (enemy.attack==='dash' && selectedParts.some(p=>p.id==='radar')); 
      const fallbackEvents = [
        {tone:'neutral', icon:'🔔', title:'Arena kapısı açıldı', text:`${robotName} ve ${enemy.name} arenaya çıktı. Hakem maçı başlattı.`, delta:0},
        {tone:'bad', icon:enemy.icon||'🤖', title:`${enemy.name} hamle yaptı`, text:`Rakip ${enemy.weapon||'ana saldırısını'} kullandı. Baskı bir anda arttı.`, delta:-8},
        fallbackCounter
          ? {tone:'good', icon:'💧', title:'Karşı hamle tuttu', text:`${robotName} doğru karşı parçayla cevap verdi. Bu hamlenin karşılığı sende vardı: ${enemy.attack==='dash'?'360° Radar hızlı pençenin yönünü okudu.':(enemy.weakText||'uygun savunma')}.`, delta:34}
          : {tone:'bad', icon:'❌', title:'Karşı hamle eksik', text:`${robotName} bu saldırıya net cevap veremedi. Doğru karşılık: ${enemy.weakText||'uygun savunma'}.`, delta:-22},
        {tone:fallbackCounter?'good':'bad', icon:fallbackCounter?'🏆':'💔', title:fallbackCounter?'Son hamle: Zafer':'Son hamle: Düşüş', text:fallbackCounter?`${robotName} ilk dersi geçti. Ateşe akılla cevap verdin.`:`Kurulum bu rakibe yetmedi. Atölyeye dönüp daha doğru parça seçmelisin.`, delta:fallbackCounter?18:-12}
      ];
      const fallbackScore = fallbackCounter ? 86 : 42;
      const threshold = enemy.threshold || 63;
      setBattle({events:fallbackEvents, score:fallbackScore, threshold, won:fallbackScore>=threshold, over:fallbackScore-threshold, repGain:fallbackScore>=threshold?0.5:-0.28, reward:fallbackScore>=threshold?420:80, luck:{name:'Temiz maç',delta:0}, dealPenalty:0});
      setStep(0);
      setPaid(false);
      setScreen('battle');
      play('click');
    }
  }
  function advance(){ if(!battle||done) return; setStep(s=>Math.min(s+1,battle.events.length-1)); play(battle.events[Math.min(step+1,battle.events.length-1)].tone==='bad'?'bad':'click'); }
  function finish(){ if(!battle) return; setStep(battle.events.length-1); play(battle.won?'win':'lose'); }
  function applyResult(){ if(!battle||paid) return; const revengeBonus=(battle.won&&lossCount>0)?180 + Math.min(620, lossCount*140 + level*35):0; const kids = kidAidAmount(); setGold(g=>Math.max(0,g+battle.reward+revengeBonus+kids)); setRep(r=>clamp(+(r+battle.repGain).toFixed(2),0,MAX_REP)); if(kids>0) warn(`Mahalle çocukları kumbaradan +${kids} altın getirdi.`, 'good'); else if(revengeBonus) warn(`MegaCore manşeti sustu. Rövanş primi +${revengeBonus} altın!`,'good'); setPaid(true); }
  function afterBattleNext(){
    const nextRep=clamp(+(rep+(battle?.repGain||0)).toFixed(2),0,MAX_REP);
    applyResult(); setSoldLocks([]);
    setDurability(d=>{ const n={...d}; selected.forEach(id=>{ if(id.startsWith('starter')) return; n[id]=clamp((n[id]??100) - (battle?.won?8:16) - Math.floor(rng(seed+id.length)*8), 10, 100); }); return n; });
    if(sponsorDeal) setSponsorDeal(null);
    if(nextRep<=0){ setBadMemory(true); setScreen('badEnd'); return; }
    if(!battle.won){
      setChildBond(b=>clamp(+(b-0.35).toFixed(2),0,5));
      setLossCount(c=>c+1);
      setMegaMorale(m=>clamp(+(m+0.25).toFixed(2),1,5)); setMegaPower(p=>Math.min(6,p+1));
      setSeed(s=>s+777+Math.floor(rng(Date.now()%9999)*333)); setBattle(null); setStep(0); setScreen('build'); warn('MegaCore güç kazandı ve yeni rakip gönderdi. Aynı savaşı tekrar etmeyeceksin.','click'); return;
    }
    setMegaMorale(m=>clamp(+(m-0.10).toFixed(2),1,5)); setMegaPower(p=>Math.max(0,p-1)); setChildBond(b=>clamp(+(b+0.55).toFixed(2),0,5));
    if(level>=10){ setStoryIndex(0); setScreen('champion'); return; }
    setLevel(l=>l+1); setSeed(s=>s+517+level*23); setBattle(null); setStep(0); setStoryIndex(0); setTab('Silah'); setScreen('levelStory');
  }

  function acceptMegaCoreJob(){
    setScreen('employeeEnd');
    play('bad');
  }
  function rejectMegaCoreJob(){
    setBadMemory(true);
    setHardStart(true);
    setLevel(1);
    setGold(Math.max(gold, 1350));
    setRep(r=>clamp(Math.max(r,1.2),0,MAX_REP));
    setMegaMorale(3.2);
    setMegaPower(4);
    setLossCount(c=>Math.max(c,1));
    setSeed(Date.now()%99999 + 9090);
    setSelected(['starterCore','starterWheel']);
    setOwnedPartIds(ids=>Array.from(new Set([...ids,'starterCore','starterWheel'])));
    setStoryIndex(0);
    setBattle(null);
    setStep(0);
    setScreen('levelStory');
    warn('MegaCore teklifini reddettin. İlk maçtan güçlü rakip gönderecekler.', 'good');
  }

  function restart(){ setScreen('opening'); setStoryIndex(0); setTutorialIndex(0); setCompany(''); setCompanyInput(''); setRobotName(''); setRobotInput(''); setLevel(1); setGold(START_GOLD); setRep(1); setSeed(Date.now()%99999); setOwned([scouts[0]]); setOwnedPartIds(['starterCore','starterWheel']); setSelected(['starterCore','starterWheel']); setSoldLocks([]); setBattle(null); setGarageLevel(1); setDurability({starterCore:100,starterWheel:100}); setSponsorDeal(null); setMegaMorale(badMemory?1.55:1); setMegaPower(badMemory?2:0); setLossCount(badMemory?1:0); setNewsSeenLoss(0); setChildBond(0); setHardStart(!!badMemory); setEasyMode(false); }

  if(screen==='splash') return <main className="splashStart"><div className="robotStream" aria-hidden>{Array.from({length:10}).map((_,i)=><span key={i} className={`r${i+1}`}>🤖</span>)}</div><section><div className="titleDance"><h1>vs. <span className="robotWord">R<span className="eyeLetter" aria-label="o"><span className="eyeBall"><i className="lid top"></i><i className="pupil"></i><i className="lid bottom"></i></span></span>b<span className="eyeLetter" aria-label="o"><span className="eyeBall delay"><i className="lid top"></i><i className="pupil"></i><i className="lid bottom"></i></span></span>t</span></h1></div><div className="splashButtons"><button className="startBtnGlow" onClick={startFromSplash}>▶️ Başlat</button><button className="audioToggle splashToggle" onClick={()=>{setMusicOn(m=>!m); setTimeout(()=>window.dispatchEvent(new Event('unlock-vsrobot-music')), 30);}}>🎵 Müzik {musicOn?'Kapat':'Aç'}</button></div></section></main>;
  if(screen==='opening') { const pages=badMemory?comebackStory:introStory; return <StoryScreen kind={badMemory?'Yeniden Başlangıç':'Başlangıç Hikayesi'} pages={pages} index={storyIndex} next={nextOpening} finalLabel={badMemory?'🚪 Garaja Geç':'⚖️ Karar Ver'} finalAction={badMemory?()=>{setStoryIndex(0); setScreen('company');}:()=>{setStoryIndex(0); setScreen('introChoice');}} />; }
  if(screen==='introChoice') return <main className="page storyPage"><section className="storyBox choiceBox"><StoryArt art="funeralRobot" emoji="🕯️🤖"/><p className="eyebrow">Karar Anı</p><h1>Şimdi ne yapacaksın?</h1><p>Bir yol kolay. Bir yol ağır. Biri seni şehir hayatına geri götürür. Diğeri seni babanın bıraktığı hesaplaşmanın tam ortasına salar.</p><div className="choiceActions"><button className="ghostBtn bigChoice" onClick={chooseLeave}>🏙️ VAZGEÇ, ŞEHRE GERİ DÖN</button><button className="bigChoice" onClick={chooseRevenge}>🔥 KAL VE İNTİKAMINI AL</button></div></section></main>;
  if(screen==='directRevenge') return <StoryScreen kind="İntikam Yolu" pages={directRevengeStory} index={storyIndex} next={nextDirectRevenge} finalLabel="🚪 Garaja Geç" finalAction={()=>{setStoryIndex(0); setScreen('company');}} />;
  if(screen==='leaveStory') return <StoryScreen kind="Mezuniyet Sonrası" pages={leaveStory} index={storyIndex} next={()=>setStoryIndex(i=>Math.min(i+1, leaveStory.length-1))} finalLabel="🚆 İNTİKAM İÇİN MEMLEKETE GİT" finalAction={goReturnRevenge} />;
  if(screen==='returnRevenge') return <StoryScreen kind="Geç Gelen İntikam" pages={returnRevengeStory} index={storyIndex} next={nextReturnRevenge} finalLabel="🚪 Garaja Geç" finalAction={()=>{setStoryIndex(0); setScreen('company');}} />;
  if(screen==='kemalEnd') return <main className="kemalEnd"><section className="kemalCard"><h1>Kemal Usta Sanayi demek ha?...</h1><p>Babanın ruhu işte bu tabelada saklıydı.</p><p>Sen bu tabelayı yazarak babanın ölümsüz ruhunu tekrar garaja bağladın.</p><p>MegaCore böyle bir şeyi ilk defa görüyor.</p><p>Babanın ruhuyla ters düşmemek için sana bir daha hiç bulaşmayacaklarına söz veriyorlar.</p><h2>OYUN BİTTİ</h2><small>Yapımcı: Enes Bektaş</small><button onClick={restart}>🔁 Baştan Başla</button></section></main>;
  if(screen==='company') return <main className="start"><Toast text={toast}/><div className="startCard"><p className="eyebrow">Kıvılcım Ligi</p><h1>Garajın tabelasını yeniden yak.</h1><p>Babanın soyadını, kendi hayalini veya mahallede duyulmasını istediğin adı yaz. MegaCore bu adı küçümseyecek. Sen bu adı arenada büyüteceksin.</p><input value={companyInput} onChange={e=>setCompanyInput(e.target.value)} placeholder="Şirket adı: Enes Robotics"/><button disabled={!companyInput.trim()} onClick={startCompany}>🚪 Garajı Aç</button><small>⭐ Yıldız = İtibar · Başlangıç: 1 yıldız</small></div><div className="heroBot"><span>🤖</span><b>VS</b><span>👑</span></div></main>;
  if(screen==='tutorial'){ return <StoryScreen kind="Tutorial" pages={tutorialPages} index={tutorialIndex} next={nextTutorial} skip={()=>{setTutorialIndex(0); setScreen('nameRobot'); play('click')}} header={<Header company={company} gold={gold} rep={rep} level={level}/>} />; }
  if(screen==='nameRobot') return <main className="page storyPage"><Header company={company} gold={gold} rep={rep} level={level} megaMorale={megaMorale}/><Toast text={toast}/><section className="storyBox"><div className="storyIcon">🤖✨</div><p className="eyebrow">Level 1 Öncesi</p><h1>Robotuna isim ver.</h1><p>Arenada “bizim robot” diye anons edilmeyecek. Bu metal yığınının bir adı olacak. Babanın son isteğini taşıyan ad.</p><input className="bigInput" value={robotInput} onChange={e=>setRobotInput(e.target.value)} placeholder="Robot adı: Kıvılcım"/><button disabled={!robotInput.trim()} onClick={saveRobot}>🔥 İsmi Onayla</button></section></main>;
  if(screen==='levelStory') return <StoryScreen kind={`Level ${level} Öncesi Hikaye`} pages={levelStories[level]||[{emoji:'🏚️🤖', title:'Atölyeye dön', text:'Garaj hazır. Şimdi robotunu kurma zamanı.'}]} index={storyIndex} next={nextLevelStory} finalLabel={storyIndex >= ((levelStories[level]||[]).length-1) ? '🚪 Garaja Geç' : undefined} finalAction={storyIndex >= ((levelStories[level]||[]).length-1) ? goBuild : undefined} header={<Header company={company} gold={gold} rep={rep} level={level} megaMorale={megaMorale}/>} />;
  if(screen==='build') return <main className="page workshop"><Header company={company} gold={gold} rep={rep} level={level} megaMorale={megaMorale}/><Toast text={toast}/><section className="workGrid"><div className="workLeft"><div className="workTitle"><div><p className="eyebrow">Atölye · {robotName}</p><h1>{enemy.name} için kurulum yap</h1><p>En iyi gözlemci: {scout.icon} {scout.name} · <StarRating value={scout.stars}/> · ⭐ itibar yükseldikçe ekip fiyatları düşer.</p></div></div><div className="lesson">{level===1?'💧 Level 1 dersi: Silah sekmesinden Basınçlı Su Topu ekle. Ateşin karşılığı sudur.':'🧠 Rakip robotun özelliklerine göre robotunu oluştur.'}</div><div className="tabs">{TABS.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>chooseTab(t)}>{t}{t==='Görev'&&lossCount>newsSeenLoss?<span className="tabBadge">!</span>:null}</button>)}</div>{tab==='Ekip'?<StaffShop owned={owned} rep={rep} gold={gold} buy={buyStaff}/>:tab==='Garaj'?<GaragePanel garageLevel={garageLevel} gold={gold} upgradeGarage={upgradeGarage} repairAll={repairAll} durability={durability} ownedPartIds={ownedPartIds}/>:tab==='Görev'?<MissionPanel sponsorDeal={sponsorDeal} acceptSponsor={acceptSponsor} level={level} lossCount={lossCount} robotName={robotName} company={company} megaMorale={megaMorale} megaPower={megaPower} childBond={childBond} kidAid={kidAidAmount()}/>:<><div className="partsGrid">{availableParts.map(p=><PartCard key={p.id} p={p} selected={selected.includes(p.id)} owned={ownedPartIds.includes(p.id)} soldLocked={soldLocks.includes(p.id)} gold={gold} level={level} onToggle={togglePart} onSell={sellPart} durability={durability[p.id]??100}/>)}</div>{locked>0&&<p className="locked">🔒 Bu sekmede {locked} özel parça kilitli. Ekipten ilgili uzmanları aldıkça bu sayı azalır; hepsi açılınca bu uyarı kaybolur.</p>}</>}</div><aside className="rightPanel"><EnemyPanel enemy={enemy} report={report} open={reportOpen} setOpen={setReportOpen}/><div className="panelCard"><h2>📊 Hazırlık</h2><p>Garaj: <b>Sv. {garageLevel}</b> · Kişilik: <b>{robotPersonality(selectedParts).name}</b></p><p>Parça: <b>{selectedParts.length}/9</b> · Silah: <b>{selectedParts.filter(p=>p.tab==='Silah').length}</b> · Savunma: <b>{selectedParts.filter(p=>p.tab==='Savunma').length}</b> · Hareket: <b>{selectedParts.filter(p=>p.tab==='Hareket').length}</b></p><div className="stats">{Object.entries(stats).filter(([,v])=>v!==0).slice(0,11).map(([k,v])=><StatBar key={k} label={statNames[k]} value={v}/>)}</div><div className="actions vertical"><button type="button" onClick={level===1?autoLevel1:()=>setSelected(s=>Array.from(new Set([...s,'starterCore','starterWheel'])))}>🆘 {level===1?'Dersi Uygula':'Temeli Tak'}</button><button type="button" className="danger" onClick={clearBuild}>↩️ Parçaları Sök</button>{level===1&&!selected.includes('water')?<div className="readyHint">💧 Basınçlı Su Topu takılınca Arenaya Çık butonu açılır.</div>:<button type="button" className={`battleBtn ${level===1&&selected.includes('water')?'pulse':''}`} onClick={startBattle} disabled={!canEnterArena}>⚔️ Arenaya Çık</button>}</div></div></aside></section></main>;
  if(screen==='battle'&&battle){ const finished=done; return <main className="page battlePage"><Header company={company} gold={gold} rep={rep} level={level} megaMorale={megaMorale}/><BattleArena battle={battle} step={step} advance={advance} finish={finish} enemy={enemy} robotName={robotName} done={done}/>{finished&&<div className="resultOverlay"><div className={`resultCard ${battle.won?'good':'bad'}`}><h1>{battle.won?'🏆 Zafer':'💔 Yenilgi'}</h1><p>Başarı skoru: <b>{battle.score}</b> · Gerekli skor: <b>{battle.threshold}</b> · Fark: <b>{battle.over>0?`+${battle.over}`:battle.over}</b></p><p>💰 Altın: <b>{(battle.reward + ((battle.won&&lossCount>0)?180 + Math.min(620, lossCount*140 + level*35):0) + kidAidAmount())>=0?`+${battle.reward + ((battle.won&&lossCount>0)?180 + Math.min(620, lossCount*140 + level*35):0) + kidAidAmount()}`:battle.reward}</b> · ⭐ İtibar: <b>{battle.repGain>0?`+${battle.repGain}`:battle.repGain}</b></p>{battle.dealPenalty>0&&<p className="warn">Sponsor cezası uygulandı: -{battle.dealPenalty} altınlık anlaşma zararı.</p>}{!battle.won&&<div className="taunts"><h3>📣 Alaycı tribün yorumları</h3><p>“{robotName} daha garajdan çıkamamış!”</p><p>“MegaCore buna antrenman maçı der!”</p><p>“Ama çocukta yürek var, bir daha denerse başka olur.”</p></div>}<button onClick={afterBattleNext}>{battle.won?(level>=10?'Finali Oku':'Sonraki Hikaye'):'Yeni Rakiple Atölyeye Dön'}</button></div></div>}</main> }


  if(screen==='champion') return <main className="champ"><div className="finalStory"><h1>🏆 MegaCore sustu. Garaj konuştu.</h1><p>Son Emir yere düştüğünde arena bir an sessiz kaldı. Sonra en arka sıradan bir çocuk bağırdı: “Kemal Usta’nın oğlu kazandı!” O ses büyüdü, tribünlere yayıldı, ekranlardan sokaklara taştı.</p><p>Sen kupayı kaldırmadın. Önce babanın defterini açtın. Son sayfadaki not artık titremiyordu: “Onları yok et derken nefret et demedim. Onları öyle yen ki, kimse bir daha küçük bir garajı küçük görmesin.”</p><p>Mina ağlıyordu. Ustalar birbirine sarılıyordu. MegaCore tabelasının ışığı sönerken, sizin paslı garajın lambası bütün mahalleyi aydınlatıyordu.</p><blockquote>Babanın adını temizledin, artık o garajı yüreğinde şerefinle taşı.</blockquote><button onClick={()=>setScreen('credits')}>🎬 Oyunu Bitir</button></div></main>;

  if(screen==='credits') return <main className="creditsEnd"><div><h1>Yapımcı: Enes Bektaş</h1><p>MegaCore vs. Usta Kemal Sanayi</p></div></main>;

  if(screen==='jobOffer') return <main className="champ"><div className="finalStory offerBox"><StoryScreen kind="MegaCore Teklifi" pages={jobOfferStory} index={storyIndex} next={()=>{ if(storyIndex<jobOfferStory.length-1) setStoryIndex(i=>i+1); else setStoryIndex(jobOfferStory.length-1); play('click'); }} />{storyIndex>=jobOfferStory.length-1&&<div className="offerActions"><button onClick={acceptMegaCoreJob}>👔 Teklifi Kabul Et</button><button className="danger" onClick={rejectMegaCoreJob}>🔥 Reddet, Garaja Dön</button></div>}</div></main>;
  if(screen==='employeeEnd') return <main className="champ employeeEnding"><div className="finalStory"><h1>👔 Sessiz Son: Maaş kartı, paslı defter</h1><p>MegaCore laboratuvarı tertemizdi. Masan vardı, maaşın vardı, kimse sana gülmüyordu. Ama her akşam camdaki yansımanda babanın eski garaj lambasını görüyordun.</p><p>Onların çalışanı oldun. Hayatın kolaylaştı. Fakat cebindeki not hiç susmadı: “Kolay yol insanı bazen hayatta tutar, bazen de kendinden uzaklaştırır.”</p><blockquote>Babanın defteri kapanmadı. Sadece çekmeceye kondu.</blockquote><button onClick={()=>setScreen('employeeCredits')}>🎬 Oyunu Bitir</button></div></main>;

  if(screen==='employeeCredits') return <main className="creditsEnd"><div><h1>Yapımcı: Enes Bektaş</h1><p>Bazen en mantıklısı rahat bir hayattır.</p></div></main>;

  if(screen==='badEnd') return <main className="champ badEnding"><div className="finalStory"><h1>🏚️ Kötü Son: Garajın tabelası indi</h1><p>İtibar sıfıra düşünce kapıya kimse gelmedi. Sponsorlar telefonu açmadı. Parçacılar veresiye defterini kapattı. Sonunda babanın garajını satmak zorunda kaldın.</p><p>MegaCore bunu büyük ekranda yayınladı: “Küçük garaj devri bitti.” Onların morali arttı, gücü büyüdü. Ama babanın defteri hâlâ sende.</p><p>Gece garajın boş duvarına bakarken siyah bir araba yanaştı. MegaCore bu kez rakip göndermedi; elinde sözleşmeyle geldi. Onlar senin yeniden başlamanı değil, pes edip onların içine karışmanı istiyor.</p><blockquote>Bazen en ağır yenilgi arenada değil, insanın kolay yolu seçtiği anda gelir.</blockquote><button onClick={()=>{setStoryIndex(0); setScreen('jobOffer'); play('click')}}>👑 MegaCore'un Teklifini Dinle</button></div></main>;
  return <main className="champ"><div className="finalStory"><h1>🏆 MegaCore sustu. Garaj konuştu.</h1><p>Son Emir yere düştüğünde arena bir an sessiz kaldı. Sonra en arka sıradan bir çocuk bağırdı: “Kemal Usta’nın oğlu kazandı!” O ses büyüdü, tribünlere yayıldı, ekranlardan sokaklara taştı.</p><p>Sen kupayı kaldırmadın. Önce babanın defterini açtın. Son sayfadaki not artık titremiyordu: “Onları yok et derken nefret et demedim. Onları öyle yen ki, kimse bir daha küçük bir garajı küçük görmesin.”</p><p>Mina ağlıyordu. Ustalar birbirine sarılıyordu. MegaCore tabelasının ışığı sönerken, sizin paslı garajın lambası bütün mahalleyi aydınlatıyordu.</p><blockquote>Babanın adını temizledin, artık o garajı yüreğinde şerefinle taşı.</blockquote><button onClick={()=>setScreen('credits')}>🎬 Oyunu Bitir</button></div></main>;
}

createRoot(document.getElementById('root')).render(<App/>);
