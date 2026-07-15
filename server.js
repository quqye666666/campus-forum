const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.send('OK minitest'));
app.get('/', (req, res) => res.send('Hello from test'));

process.on('uncaughtException', (err) => {
  console.error('FATAL:', err.stack || err.message);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('TEST SERVER OK port=' + PORT);
});
