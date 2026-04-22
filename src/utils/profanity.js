import filter from "leo-profanity";

/**
 * Checks if a string contains profanity or slurs
 * @param {string} text 
 * @returns {boolean} True if clean, false if profane
 */
export const isClean = (text) => {
  if (!text) return true;
  return !filter.check(text);
};
