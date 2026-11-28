// Demo app: the small helpers the page and the data panel share (#151).

/**
 * Create an element with an optional class and text content. Text is always
 * set as text, never as markup: file and column names come from the user.
 * @param {string} tag Element tag name.
 * @param {?string} [className] Class attribute to set when non-empty.
 * @param {string} [text] Text content to set when provided.
 * @returns {HTMLElement} The detached element.
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A count with its noun, pluralised: "1 file", "3 files".
 * @param {number} count The count.
 * @param {string} noun The singular noun.
 * @returns {string} The phrase.
 */
export const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * A sentence that ends in one full stop, whether or not what it was made of
 * already ended in one: a reason quoted from somewhere else may or may not.
 * @param {string} text The sentence.
 * @returns {string} The sentence, ending in one full stop.
 */
export const oneStop = (text) => `${String(text).replace(/[.\s]+$/, '')}.`;
