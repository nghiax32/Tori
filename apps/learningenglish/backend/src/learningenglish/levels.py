"""Trình độ của từ, theo thang CEFR rút gọn: A2 (cơ bản), B1 (trung cấp), B2 (nâng cao).

Mặc định: từ đời sống hằng ngày là B1, từ đọc tin tức là B2; các danh sách dưới đây ghi đè mặc định
(từ cơ bản, từ đời sống khó, từ tin tức dễ). Phân loại theo kinh nghiệm, không lấy từ nguồn CEFR chính thức.
"""

from learningenglish.topics import EVERYDAY, TOPIC_GROUP, TOPIC_OF

LEVELS: list[tuple[str, str]] = [("A2", "Cơ bản"), ("B1", "Trung cấp"), ("B2", "Nâng cao")]

# Từ cơ bản (mọi chủ đề)
_A2: set[str] = {
 "bowl", "menu", "order", "salty", "snack", "sour", "spicy", "spoon", "sweet", "thirsty", "juice", "meal",
 "pork", "beef", "full", "tasty", "bill", "chopsticks", "fried rice", "seafood", "shrimp", "crab",
 "iced coffee", "street food", "cash", "cheap", "expensive", "size", "wallet", "customer", "price", "pay",
 "bag", "basket", "spend", "sale", "try on", "shopping list", "plastic bag", "change", "park", "turn",
 "helmet", "petrol", "traffic light", "ride", "passenger", "on foot", "traffic jam", "metro", "book",
 "passport", "flight", "map", "trip", "tourist", "boat", "luggage", "single room", "double room", "backpack",
 "visa", "bedroom", "bathroom", "living room", "key", "fridge", "pillow", "blanket", "roof", "curtain",
 "shelf", "drawer", "flat", "neighbour", "rent", "washing machine", "air conditioner", "light switch",
 "doorbell", "noisy", "messy", "tidy", "cousin", "twin", "wedding", "invite", "introduce", "best friend",
 "boyfriend", "girlfriend", "married", "single", "adult", "teenager", "grandchild", "nephew", "niece", "date",
 "stranger", "roommate", "headache", "fever", "cough", "cold", "flu", "sore throat", "toothache",
 "stomachache", "back pain", "sleepy", "weight", "shoulder", "knee", "neck", "finger", "toe", "tooth",
 "tongue", "lip", "heart", "blood", "bone", "chest", "stomach", "pharmacy", "tablet", "runny nose", "dizzy",
 "get better", "heel", "thumb", "wrist", "elbow", "ankle", "eyebrow", "weekend", "noon", "daily", "soon",
 "already", "calendar", "cancel", "on time", "weekday", "in a hurry", "on the way", "the day after tomorrow",
 "century", "angry", "bored", "scared", "excited", "kind", "funny", "lonely", "nervous", "proud", "shy",
 "lazy", "polite", "surprised", "brave", "upset", "calm", "hobby", "sing", "dance", "swimming", "guitar",
 "picnic", "karaoke", "travel", "video game", "yoga", "art", "concert", "gym", "fishing", "camping",
 "cycling", "go out", "chess", "puzzle", "relax", "paint", "password", "battery", "download", "app", "screen",
 "laptop", "keyboard", "mouse", "Wi-Fi", "text", "video call", "smartphone", "website", "emoji", "charger",
 "selfie", "delete", "share", "post", "follow", "account", "group chat", "dress", "skirt", "jacket", "coat",
 "jeans", "socks", "cap", "belt", "uniform", "glasses", "scarf", "raincoat", "slippers", "sneakers", "ao dai",
 "button", "suit", "curly", "straight", "homework", "exam", "pass", "fail", "subject", "classmate",
 "dictionary", "mistake", "textbook", "classroom", "pupil", "university", "course", "look up", "meeting",
 "boss", "salary", "office", "day off", "printer", "reply", "file", "lunch break", "meeting room",
 "interview", "ATM", "PIN", "form", "sign", "address", "credit card", "bank account", "QR code", "fill in",
 "ID card", "team", "player", "win", "lose", "football", "basketball", "tennis", "volleyball", "badminton",
 "goal", "score", "fan", "final", "jog", "medal", "sunny", "cloudy", "rainy", "windy", "warm", "cool", "snow",
 "wind", "umbrella", "sunshine", "rainy season", "dry season", "season", "temperature", "chef", "dentist",
 "driver", "farmer", "nurse", "pilot", "waiter", "police officer", "engineer", "worker", "manager", "baker",
 "cleaner", "pet", "puppy", "kitten", "chicken", "cow", "horse", "rabbit", "duck", "pig", "goat", "monkey",
 "elephant", "tiger", "zoo", "butterfly", "bee", "ant", "spider", "snake", "mosquito", "frog", "goldfish",
 "turtle", "tail", "wing", "feed", "pan", "pot", "knife", "fork", "plate", "mug", "oven", "sink", "sugar",
 "noodles", "pepper", "garlic", "fresh", "taste", "smell", "mix", "napkin", "tray", "kettle", "rice cooker",
 "microwave", "tofu", "chilli", "post office", "library", "museum", "playground", "supermarket", "bus stop",
 "airport", "train station", "bus station", "village", "bakery", "bookshop", "hair salon", "police station",
 "swimming pool", "city centre", "corner", "entrance", "exit", "lift", "stairs", "floor", "nearby",
 "opposite", "night market", "crowded", "cinema", "actor", "actress", "singer", "band", "ticket", "famous",
 "news", "newspaper", "magazine", "comedy", "cartoon", "horror", "channel", "headphones", "live", "playlist",
 "borrow", "lend", "carry", "catch", "miss", "forget", "remember", "lock", "return", "explain", "choose",
 "prefer", "hope", "wait", "arrive", "leave", "stay", "fix", "break", "drop", "put on", "take off", "turn on",
 "wake up", "get up", "look for", "call back", "check", "laugh", "cry", "hug", "bring", "send", "receive",
 "hold", "push", "pull", "climb", "jump", "sit down", "stand up", "lie down", "try", "look like",
 "take a photo", "hurt", "wave", "smile", "guess", "come back", "go back", "get off", "get on", "clean up",
 "agree", "worry", "save", "hurry", "dangerous", "safe", "quiet", "comfortable", "dirty", "empty", "heavy",
 "tiny", "wide", "deep", "soft", "wet", "dry", "bright", "dark", "loud", "modern", "useful", "boring",
 "amazing", "terrible", "strange", "special", "simple", "friendly", "busy", "free", "broken", "clean",
 "healthy", "popular", "asleep", "awake", "alone", "ready", "late", "early", "correct", "wrong", "cute",
 "beautiful", "ugly", "delicious", "important", "closed", "huge", "narrow", "missing", "excuse me",
 "no problem", "of course", "see you", "good luck", "congratulations", "nice to meet you", "you're welcome",
 "take care", "how much is it", "just a moment", "have a nice day", "same here", "what's wrong",
 "that's right", "I see", "never mind", "sounds good", "let me know", "long time no see", "what's up",
 "cheers", "I'm not sure", "sorry to bother you", "no worries", "emergency", "ambulance", "accident", "help",
 "police", "fire alarm", "thief", "steal", "lost", "careful", "danger", "storm", "smoke", "fall", "burn",
 "safety", "flower", "leaf", "lake", "river", "mountain", "beach", "island", "sky", "moon", "star", "rainbow",
 "sunrise", "sunset", "forest", "hill", "sand", "rock", "pond", "water", "plant", "grow", "seed", "birthday",
 "gift", "party", "guest", "holiday", "Christmas", "candle", "wish", "visit", "lunar new year", "lucky money",
 "fireworks", "festival", "Valentine's Day", "Women's Day", "Teachers' Day", "Mid-Autumn Festival",
 "banh chung", "mooncake", "lantern", "midnight", "surprise", "bride", "groom", "hammer", "scissors", "glue",
 "tape", "rope", "ladder", "light bulb", "broom", "bucket", "wood", "nail", "saw", "torch", "tap", "shampoo",
 "soap", "toothbrush", "toothpaste", "towel", "shower", "mirror", "comb", "bath", "sunscreen", "tissue",
 "rest", "nap", "brush your teeth", "wash your hair", "perfume", "skin", "make-up", "razor", "hairdryer",
 "half", "double", "dozen", "kilo", "gram", "litre", "metre", "kilometre", "centimetre", "height", "count",
 "total", "percent", "a few", "a lot of", "a couple of", "enough", "extra", "pair", "piece", "bottle",
 "packet", "twice", "once", "second", "minute", "hour", "number", "weigh", "length", "width", "mango",
 "banana", "papaya", "pineapple", "watermelon", "coconut", "tomato", "potato", "carrot", "onion", "cabbage",
 "cucumber", "corn", "mushroom", "pumpkin", "lettuce", "lime", "avocado", "sweet potato", "spring onion",
 "durian", "dragon fruit", "lychee", "longan", "jackfruit", "guava", "grapefruit", "peanut", "eggplant",
 "poor", "rich", "million", "billion", "cost", "war", "peace", "vote", "president",
}

# Từ đời sống nhưng khó
_B2: set[str] = {
 "haggle", "overpriced", "warranty", "cashback", "return policy", "itinerary", "layover", "overbooked",
 "snorkelling", "heritage", "acquaintance", "spouse", "insomnia", "sprain", "swollen", "fortnight",
 "stubborn", "moody", "pessimistic", "grumpy", "heartbroken", "binge-watch", "unsubscribe", "tuition",
 "enrol", "probation", "workload", "multitask", "minutes", "notice", "instalment", "invoice", "overdue",
 "injury time", "drizzle", "downpour", "cold snap", "hail", "civil servant", "hatch", "tame", "leash",
 "ladle", "grater", "put off", "fertiliser", "mow", "altar", "incense", "good fortune", "pliers", "commute",
 "detour", "overtake", "carpool", "tow", "dent", "pedestrian",
}

# Từ tin tức nhưng dễ, hay gặp
_B1: set[str] = {
 "budget", "debt", "economy", "export", "import", "income", "insurance", "profit", "benefit", "demand",
 "supply", "growth", "loss", "wage", "pension", "real estate", "investor", "stock market", "share price",
 "startup", "economic", "financial", "wealth", "expense", "luxury", "affordable", "consumer", "fund",
 "interest rate", "contract", "factory", "skill", "training", "deal", "strike", "union", "CEO", "partnership",
 "priority", "strategy", "unemployment", "agenda", "device", "compete", "cooperate", "promote", "represent",
 "resign", "workforce", "profitable", "automation", "manufacturing", "environment", "pollution", "forecast",
 "disaster", "flood", "typhoon", "wildfire", "plastic", "recycling", "wildlife", "solar", "wind power",
 "coal", "air quality", "climate change", "global warming", "sea level", "renewable", "resource", "evacuate",
 "smog", "vaccine", "victim", "healthcare", "hospital", "disease", "pandemic", "infection", "treatment",
 "elderly", "homeless", "charity", "donate", "population", "birth rate", "education", "mental health",
 "poverty", "recover", "outbreak", "election", "law", "court", "judge", "trial", "guilty", "innocent",
 "arrest", "prison", "sentence", "crime", "criminal", "ban", "permit", "government", "candidate", "campaign",
 "citizen", "official", "minister", "prime minister", "policy", "evidence", "fraud", "embassy", "democracy",
 "penalty", "poll", "witness", "suspect", "investigate", "require", "parliament", "majority", "attack",
 "bomb", "missile", "soldier", "weapon", "border", "enemy", "terrorist", "kidnap", "riot", "aid", "military",
 "protest", "refugee", "threat", "crisis", "conflict", "troops", "ceasefire", "drone", "ally", "civilian",
 "hostage", "dispute", "tension", "announce", "confirm", "warn", "admit", "accuse", "debate", "statement",
 "rumour", "opinion", "point out", "respond", "comment", "mention", "discuss", "doubt", "claim", "deny",
 "identify", "ignore", "predict", "publish", "reject", "reveal", "concern", "aware", "desire", "estimate",
 "emphasise", "criticise", "insist", "quote", "improve", "increase", "decrease", "develop", "progress",
 "speed up", "slow down", "continue", "resume", "upgrade", "rise", "succeed", "failure", "achieve", "adapt",
 "adjust", "challenge", "collapse", "delay", "prevent", "reduce", "release", "trend", "impact", "launch",
 "expand", "maintain", "overcome", "recovery", "available", "serious", "major", "minor", "rapid", "sudden",
 "steady", "current", "former", "recent", "local", "national", "international", "private", "public",
 "typical", "traditional", "foreign", "independent", "urgent", "global", "likely", "despite", "obvious",
 "essential", "genuine", "annual", "crucial", "domestic", "overall", "range", "peak", "potential",
}


def level_of(word: str) -> str:
    if word in _A2:
        return "A2"
    if word in _B2:
        return "B2"
    if word in _B1:
        return "B1"
    return "B1" if TOPIC_GROUP.get(TOPIC_OF.get(word, ""), EVERYDAY) == EVERYDAY else "B2"
