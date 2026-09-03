import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchMarineTrafficAis } from './src/server/marinetraffic.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API Endpoint to fetch MarineTraffic AIS live stream securely
app.get('/api/marinetraffic/vessels', async (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : 21.8;
    const lon = req.query.lon ? parseFloat(req.query.lon) : 88.1;
    const zoom = req.query.zoom ? parseInt(req.query.zoom, 10) : 11;
    const timespan = req.query.timespan ? parseInt(req.query.timespan, 10) : 60;

    const data = await fetchMarineTrafficAis(lat, lon, zoom, timespan);
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
});

// Serve static frontend assets in production
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SpillTrace] Server running securely on port ${PORT}`);
});
