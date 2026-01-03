require("dotenv").config();
const express = require("express");
const compression = require("compression");
const hlsRouter = require("./endpoints/BuildHLS");
const get_movie_infoRouter = require("./endpoints/GetMovieInfo");
const getMoviesRouter = require("./endpoints/GetMovies");
const getMovieDetailsRouter = require("./endpoints/GetMovieDetails");
const getQueueRouter = require("./endpoints/GetQueue");
const updateQueueRouter = require("./endpoints/UpdateQueue");
const deleteMovieRouter = require("./endpoints/DeleteMovie");
const path = require("path");
const cors = require("cors");
const uploadMovieRouter = require("./endpoints/UploadMovie");

// ...existing code...

// --- BEGIN: SSE progress endpoint (unauthenticated) ---
// (moved below, after app is declared)
// --- END: SSE progress endpoint ---
const getAllTitlesRouter = require("./endpoints/GetAllTitles");
const rouletteRouter = require("./endpoints/Roulette");
const smartSearchRouter = require("./endpoints/SmartSearch");
const { initDatabase } = require("./utils/database");
const authMiddleware = require("./utils/authMiddleware");

const app = express();
const PORT = 8080;

// Enable gzip compression for API responses (helps Fire TV bandwidth)
app.use(compression());

// Increase body size limits for video uploads (10GB max)
app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ limit: '10gb', extended: true }));

// Dynamic CORS: allow localhost:3000 plus any origin in env ALLOWED_ORIGINS (comma-separated).
const allowedFromEnv = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : [];
const defaultAllowed = ["http://localhost:8080", "http://127.0.0.1:8080", "http://192.168.88.4:8080"];
const allowList = [...new Set([...defaultAllowed, ...allowedFromEnv])];

app.use(cors({
  origin: function(origin, cb) {
    // Allow requests with no origin (mobile apps, curl) or if origin is in list.
    if (!origin || allowList.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  credentials: true,
}));

// Explicit OPTIONS handling (should be covered by cors, but being safe):
app.options('*', cors());



const clientBuildPath = path.join(__dirname, "./client/build");


// Serve static React build
app.use(express.static(clientBuildPath));

// Serve React app for any route not handled by API (for React Router support)
app.get('*', (req, res, next) => {
  // If the request starts with an API or static asset path, skip to next handler
  if (req.path.startsWith('/api') || req.path.startsWith('/get_') || req.path.startsWith('/update_') || req.path.startsWith('/upload_') || req.path.startsWith('/delete_') || req.path.startsWith('/roulette') || req.path.startsWith('/hls') || req.path.startsWith('/play') || req.path.startsWith('/public') || req.path.startsWith('/basic')) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});


// Protect all API endpoints with basic auth
// Remove auth for /upload_movie/progress/:filename SSE endpoint
app.use(["/get_movie_info", "/get_movies", "/get_movie_details", "/get_queue", "/update_queue", "/upload_movie", "/delete_movie", "/get_all_titles", "/roulette", "/api", smartSearchRouter], (req, res, next) => {
  if (req.path.startsWith('/upload_movie/progress/')) return next();
  return authMiddleware(req, res, next);
});

app.use("/", hlsRouter);
app.use("/get_movie_info", get_movie_infoRouter);
app.use("/get_movies", getMoviesRouter);
app.use("/get_movie_details", getMovieDetailsRouter);
app.use("/get_queue", getQueueRouter);
app.use("/update_queue", updateQueueRouter);
app.use("/upload_movie", uploadMovieRouter);
app.use("/delete_movie", deleteMovieRouter);
app.use("/get_all_titles", getAllTitlesRouter);
app.use("/roulette", rouletteRouter);
app.use(smartSearchRouter);

// Simple request logging for upload debugging
app.use((req, res, next) => {
  if (req.path.startsWith('/upload_movie')) {
    console.log(`[UPLOAD_DEBUG] ${req.method} ${req.originalUrl}`);
  }
  next();
});


const BASE_DIR = process.env.MOVIES_DIR || "/Volumes/External/Streaming/movies/"

// Serve the simple test page
app.use(express.static("public", {
  setHeaders: (res, p) => {
    if (p.endsWith(".m3u8")) res.setHeader("Content-Type","application/vnd.apple.mpegurl");
    if (p.endsWith(".ts"))   res.setHeader("Content-Type","video/mp2t");
  }
}));


app.use('/hls', express.static(BASE_DIR));

app.get("/basic", (req, res) => {
  res.send("Hello, world!");
});

const baseUrl = process.env.BASE_URL;
const hlsDir = process.env.HLS_DIR;


// Serve the video player page
app.get('/play/:title', (req, res) => {
  const title = req.params.title
  const playlistPath = `${baseUrl}${hlsDir}/${encodeURIComponent(title)}_hls/playlist.m3u8`;
  console.log('Serving player for:', playlistPath);
  res.json({
    title,
    playlistPath,
  });
});




// Start server after database is initialized
async function startServer() {
  try {
    await initDatabase();
    console.log('[Server] Database initialized');
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log("API listening on 8080");
    });

    // Increase server timeout to 30 minutes for large uploads
    server.timeout = 1800000;
    server.keepAliveTimeout = 1800000;
    server.headersTimeout = 1810000;
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

startServer();

