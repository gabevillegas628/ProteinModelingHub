import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import routes from './routes/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: isProduction ? false : 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// API Routes - mounted at /modeling/api for subdirectory deployment
app.use('/modeling/api', routes);

// Health check
app.get('/modeling/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (isProduction) {
  const publicPath = path.join(__dirname, '..', 'public');

  // Serve static assets under /modeling path
  app.use('/modeling', express.static(publicPath));

  // Handle SPA routing - serve index.html for all /modeling routes that aren't API
  app.get('/modeling/*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // Redirect root /modeling to /modeling/ for consistency
  app.get('/modeling', (req, res) => {
    res.redirect('/modeling/');
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (isProduction) {
    console.log('Serving frontend from public folder');
  }
});
