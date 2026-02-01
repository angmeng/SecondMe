/**
 * Stopwords Configuration
 * Common English words filtered out during keyword extraction
 *
 * These words are too common to be meaningful for topic detection.
 * The list can be extended or replaced for different locales.
 */

/**
 * English stopwords - articles, pronouns, prepositions, conjunctions, etc.
 */
export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  // Articles
  'a', 'an', 'the',
  // Demonstratives
  'this', 'that', 'these', 'those',
  // Personal pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  // Possessive pronouns
  'my', 'your', 'his', 'its', 'our', 'their',
  'mine', 'yours', 'ours', 'theirs',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  // Be verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  // Have verbs
  'have', 'has', 'had', 'having',
  // Do verbs
  'do', 'does', 'did', 'doing',
  // Modal verbs
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  // Common verbs
  'get', 'got', 'make', 'made', 'go', 'going', 'went', 'gone',
  'know', 'knew', 'think', 'thought', 'see', 'saw', 'want', 'wanted',
  'say', 'said', 'take', 'took', 'come', 'came', 'give', 'gave',
  // Adverbs
  'just', 'also', 'now', 'then', 'here', 'there', 'when', 'where', 'why', 'how',
  'very', 'really', 'actually', 'probably', 'maybe', 'always', 'never',
  'still', 'already', 'even', 'only', 'well', 'too', 'much', 'more',
  // Common adjectives
  'good', 'great', 'nice', 'bad', 'new', 'old', 'big', 'small',
  'other', 'same', 'different', 'first', 'last', 'next',
  // Question words
  'what', 'which', 'who', 'whom', 'whose',
  // Informal/conversational
  'yeah', 'yes', 'yep', 'no', 'nope', 'okay', 'ok', 'sure', 'thanks',
  'hey', 'hello', 'hi', 'bye', 'lol', 'haha', 'wow', 'cool', 'right',
  // Time words (too generic)
  'today', 'tomorrow', 'yesterday', 'time', 'day', 'week', 'month', 'year',
  // Contractions (without apostrophes)
  'let', 'dont', 'didnt', 'doesnt', 'wont', 'cant', 'isnt', 'arent',
  'wasnt', 'werent', 'havent', 'hasnt', 'hadnt', 'wouldnt', 'couldnt', 'shouldnt',
  'im', 'ive', 'id', 'ill', 'youre', 'youve', 'youd', 'youll',
  'hes', 'shes', 'its', 'were', 'theyve', 'theyd', 'theyll',
  // Indefinite pronouns
  'something', 'anything', 'nothing', 'everything',
  'someone', 'anyone', 'everyone', 'nobody',
  // Quantifiers
  'some', 'any', 'all', 'many', 'few', 'most', 'several', 'each', 'every',
  // Misc
  'thing', 'things', 'stuff', 'lot', 'way', 'back', 'people', 'one', 'two',
]);

/**
 * Default stopwords set (English)
 * Can be replaced with locale-specific sets
 */
export const DEFAULT_STOPWORDS = ENGLISH_STOPWORDS;

/**
 * Check if a word is a stopword
 */
export function isStopword(word: string): boolean {
  return DEFAULT_STOPWORDS.has(word.toLowerCase());
}

/**
 * Filter stopwords from a list of words
 */
export function filterStopwords(words: string[]): string[] {
  return words.filter((word) => !isStopword(word));
}
