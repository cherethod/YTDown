const assert = require('assert');
const { extractVideoId } = require('./logic');

const id = 'dQw4w9WgXcQ';
const validCases = [
  `https://www.youtube.com/watch?v=${id}`,
  `https://youtu.be/${id}?si=tracking`,
  `https://youtube.com/shorts/${id}`,
  `https://m.youtube.com/watch?v=${id}&feature=share`,
  `youtube.com/embed/${id}`,
  `https://www.youtube.com/live/${id}?feature=shared`
];

validCases.forEach((url) => assert.strictEqual(extractVideoId(url), id, url));
['', 'hola', 'https://example.com/watch?v=' + id, 'https://youtube.com/watch?v=bad'].forEach((url) => {
  assert.strictEqual(extractVideoId(url), null, url);
});

console.log(`Validación correcta: ${validCases.length} formatos admitidos y 4 casos inválidos.`);
