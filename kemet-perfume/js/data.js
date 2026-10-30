/*
 * KEMET — site data.
 *
 * To add a perfume: fill in one of the slots in `perfumes` below. Every field
 * set to null is hidden or shown as "coming soon"; a slot whose `name` is null
 * is drawn as an empty placeholder card.
 *
 * Text fields are { ar, en } pairs. `price` is a number (EGP). `image` is a
 * path such as "assets/karnak.webp".
 */
window.KEMET = {
  whatsapp: {
    number: "201098641454", // wa.me format: country code + number, digits only
    display: "+20 10 98641454",
  },

  perfumes: [
    {
      id: 1,
      name: null,
      family: null, // e.g. { ar: "شرقي", en: "Oriental" }
      description: null,
      notes: null, // { top: {ar,en}, heart: {ar,en}, base: {ar,en} }
      size: null, // e.g. "50 ml"
      price: null,
      image: null,
    },
    { id: 2, name: null, family: null, description: null, notes: null, size: null, price: null, image: null },
    { id: 3, name: null, family: null, description: null, notes: null, size: null, price: null, image: null },
    { id: 4, name: null, family: null, description: null, notes: null, size: null, price: null, image: null },
    { id: 5, name: null, family: null, description: null, notes: null, size: null, price: null, image: null },
    { id: 6, name: null, family: null, description: null, notes: null, size: null, price: null, image: null },
  ],

  i18n: {
    ar: {
      "nav.collection": "المجموعة",
      "nav.story": "الحكاية",
      "nav.contact": "تواصل معنا",
      "lang.switch": "English",
      "cta.whatsapp": "تواصل واتساب",

      "hero.eyebrow": "إكستريت دو بارفان",
      "hero.title": "روح قديمة، عطر عصري",
      "hero.text":
        "كيميت — الاسم الذي أطلقه المصريون القدماء على أرضهم. عطور فاخرة مستوحاة من جوهر حضارة عمرها آلاف السنين.",
      "hero.primary": "اكتشف المجموعة",
      "hero.secondary": "اطلب عبر واتساب",
      "hero.badge": "جوهر الحضارة القديمة",

      "collection.eyebrow": "المجموعة",
      "collection.title": "عطور كيميت",
      "collection.text": "العطور قيد الإضافة. تابعنا قريباً، أو راسلنا على واتساب لمعرفة أحدث الإصدارات.",
      "card.soon": "قريباً",
      "card.soonName": "عطر جديد",
      "card.soonText": "التفاصيل قيد الإضافة",
      "card.ask": "اسأل على واتساب",
      "card.order": "اطلب الآن",
      "card.askPrice": "اسأل عن السعر",
      "card.notes.top": "الافتتاحية",
      "card.notes.heart": "القلب",
      "card.notes.base": "القاعدة",

      "story.eyebrow": "الحكاية",
      "story.title": "كيميت.. الأرض السوداء",
      "story.p1":
        "«كيميت» هو الاسم الذي عرفت به مصر القديمة نفسها: الأرض السوداء الخصبة التي صنعها النيل. من هنا بدأت الحضارة، ومن هنا بدأت حكايتنا.",
      "story.p2":
        "نستلهم من المعابد والأعمدة والشمس على الذهب، ونحوّل هذا الإرث إلى عطور تُلبس اليوم: عمق شرقي بروح عصرية، في زجاجة وعلبة تليق بالملوك.",
      "story.tag": "روح قديمة · عطر عصري",

      "brand.eyebrow": "هوية كيميت",
      "brand.title": "الجعران والشمس",
      "brand.text":
        "الجعران رمز التجدد، وقرص الشمس رمز الخلود. اجتمعا في شعارنا ليحكيا ما نصنعه: عطر يبقى في الذاكرة.",
      "brand.f1.t": "إلهام فرعوني",
      "brand.f1.d": "نقوش وذهب وظلال المعابد في كل تفصيلة.",
      "brand.f2.t": "تغليف فاخر",
      "brand.f2.d": "علبة تُفتح كأنها بوابة معبد، تحمي الزجاجة وتعلن عنها.",
      "brand.f3.t": "طلب سهل",
      "brand.f3.d": "اطلب وتابع مباشرة على واتساب بدون تعقيد.",

      "contact.eyebrow": "تواصل معنا",
      "contact.title": "جاهز لتجربة كيميت؟",
      "contact.text": "راسلنا على واتساب لمعرفة المتوفر من العطور والأسعار وطرق التوصيل.",
      "contact.button": "ابدأ المحادثة على واتساب",
      "contact.number": "رقم التواصل",

      "footer.rights": "جميع الحقوق محفوظة",
      "wa.generic": "مرحباً كيميت، أريد الاستفسار عن العطور المتاحة.",
      "wa.product": "مرحباً كيميت، أريد طلب عطر: ",
      "wa.productInfo": "مرحباً كيميت، أريد الاستفسار عن عطر: ",
    },

    en: {
      "nav.collection": "Collection",
      "nav.story": "Story",
      "nav.contact": "Contact",
      "lang.switch": "العربية",
      "cta.whatsapp": "WhatsApp us",

      "hero.eyebrow": "Extrait de Parfum",
      "hero.title": "Ancient Soul, Modern Scent",
      "hero.text":
        "Kemet — the name ancient Egyptians gave their land. Luxury fragrances inspired by the essence of a civilization thousands of years old.",
      "hero.primary": "Explore the collection",
      "hero.secondary": "Order on WhatsApp",
      "hero.badge": "The essence of ancient civilization",

      "collection.eyebrow": "The Collection",
      "collection.title": "Kemet Fragrances",
      "collection.text": "Our fragrances are being added. Check back soon, or message us on WhatsApp for the latest releases.",
      "card.soon": "Coming soon",
      "card.soonName": "New fragrance",
      "card.soonText": "Details are being added",
      "card.ask": "Ask on WhatsApp",
      "card.order": "Order now",
      "card.askPrice": "Ask for price",
      "card.notes.top": "Top",
      "card.notes.heart": "Heart",
      "card.notes.base": "Base",

      "story.eyebrow": "Our Story",
      "story.title": "Kemet — The Black Land",
      "story.p1":
        "“Kemet” is the name ancient Egypt gave itself: the fertile black land shaped by the Nile. Civilization began there, and so did our story.",
      "story.p2":
        "We draw on temples, columns and sunlight on gold, and turn that heritage into fragrances made to be worn today: oriental depth with a modern spirit, in a bottle and box fit for kings.",
      "story.tag": "Ancient Soul · Modern Scent",

      "brand.eyebrow": "The Kemet Identity",
      "brand.title": "The Scarab & The Sun",
      "brand.text":
        "The scarab stands for renewal and the sun disc for eternity. Together in our mark, they say what we make: a scent that stays in memory.",
      "brand.f1.t": "Pharaonic inspiration",
      "brand.f1.d": "Carvings, gold and temple shadows in every detail.",
      "brand.f2.t": "Luxury packaging",
      "brand.f2.d": "A box that opens like a temple gate, protecting the bottle and announcing it.",
      "brand.f3.t": "Easy ordering",
      "brand.f3.d": "Order and follow up directly on WhatsApp, no fuss.",

      "contact.eyebrow": "Contact",
      "contact.title": "Ready to experience Kemet?",
      "contact.text": "Message us on WhatsApp for what's available, prices and delivery options.",
      "contact.button": "Start a WhatsApp chat",
      "contact.number": "Contact number",

      "footer.rights": "All rights reserved",
      "wa.generic": "Hello Kemet, I'd like to ask about the available fragrances.",
      "wa.product": "Hello Kemet, I'd like to order: ",
      "wa.productInfo": "Hello Kemet, I'd like to ask about: ",
    },
  },
};
