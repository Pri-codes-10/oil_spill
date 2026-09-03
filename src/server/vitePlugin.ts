import { Plugin } from 'vite';
import { fetchMarineTrafficAis } from './marinetraffic';
import url from 'url';
import dotenv from 'dotenv';

// Ensure .env is loaded
dotenv.config();

export function marineTrafficApiPlugin(): Plugin {
  return {
    name: 'marinetraffic-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/marinetraffic/vessels') && !req.url?.startsWith('/api/marinetraffic/ais')) {
          return next();
        }

        try {
          const parsedUrl = url.parse(req.url, true);
          const query = parsedUrl.query;

          const lat = query.lat ? parseFloat(query.lat as string) : 21.8;
          const lon = query.lon ? parseFloat(query.lon as string) : 88.1;
          const zoom = query.zoom ? parseInt(query.zoom as string, 10) : 11;
          const timespan = query.timespan ? parseInt(query.timespan as string, 10) : 60;

          const data = await fetchMarineTrafficAis(lat, lon, zoom, timespan);

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.statusCode = 200;
          res.end(JSON.stringify(data));
        } catch (error: any) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({
            success: false,
            error: error.message || 'Internal server error fetching MarineTraffic data'
          }));
        }
      });
    }
  };
}
