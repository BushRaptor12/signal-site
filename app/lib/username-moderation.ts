const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "beacon",
  "editor",
  "help",
  "moderator",
  "mod",
  "newsroom",
  "owner",
  "readthebeacon",
  "signal",
  "staff",
  "support",
  "sysadmin",
  "system",
  "thebeacon",
] as const;

const BANNED_USERNAME_TERMS = [
  "anus",
  "bitch",
  "blowjob",
  "boner",
  "buttplug",
  "childporn",
  "clit",
  "cock",
  "cocksucker",
  "coon",
  "cum",
  "cunt",
  "dick",
  "dildo",
  "fag",
  "faggot",
  "fuck",
  "goatse",
  "hitler",
  "humping",
  "jerkoff",
  "jizz",
  "kkk",
  "kunt",
  "motherfucker",
  "nazi",
  "nigger",
  "nigga",
  "penis",
  "porn",
  "pussy",
  "rape",
  "rapist",
  "schlong",
  "sex",
  "shit",
  "slut",
  "spic",
  "tits",
  "twat",
  "vagina",
  "whore",
] as const;

const REVIEW_USERNAME_TERMS = [
  "anchor",
  "breaking",
  "ceo",
  "editorial",
  "fbi",
  "governor",
  "journalist",
  "mayor",
  "official",
  "police",
  "president",
  "press",
  "reporter",
  "senator",
  "sheriff",
  "whitehouse",
] as const;

function compactUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanUsername(value: string) {
  return value.trim().toLowerCase();
}

export function getUsernameModerationError(username: string) {
  const cleaned = cleanUsername(username);
  const compact = compactUsername(username);

  if (!cleaned) {
    return "Username is required.";
  }

  for (const reserved of RESERVED_USERNAMES) {
    if (cleaned === reserved || compact === compactUsername(reserved)) {
      return "That username is reserved. Please choose another one.";
    }
  }

  for (const bannedTerm of BANNED_USERNAME_TERMS) {
    if (compact.includes(compactUsername(bannedTerm))) {
      return "Please choose a different username.";
    }
  }

  return null;
}

export function getUsernameReviewReason(username: string) {
  const cleaned = cleanUsername(username);
  const compact = compactUsername(username);
  if (!cleaned || !compact) return null;

  for (const term of REVIEW_USERNAME_TERMS) {
    if (compact.includes(compactUsername(term))) {
      return `contains review term "${term}"`;
    }
  }

  return null;
}
