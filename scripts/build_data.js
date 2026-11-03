const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "mymoviedb.csv");
const DATA = path.join(ROOT, "public", "data");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function ratingCategory(value) {
  if (!Number.isFinite(value)) return "Unrated";
  if (value < 5) return "Poor";
  if (value < 7) return "Average";
  if (value < 8) return "Good";
  return "Excellent";
}

function popularityCategory(value) {
  if (!Number.isFinite(value)) return "Unknown";
  if (value < 20) return "Low";
  if (value < 40) return "Medium";
  if (value < 100) return "High";
  return "Blockbuster";
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function countSeries(items, fieldName, limit) {
  const counts = new Map();
  for (const item of items) {
    const key = String(item[fieldName] || "").trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([key, count]) => ({ [fieldName === "category" ? "category" : fieldName]: key, count }))
    .sort((a, b) => b.count - a.count);
  return limit ? rows.slice(0, limit) : rows;
}

const csvRows = parseCsv(fs.readFileSync(SOURCE, "utf8"));
const headers = csvRows.shift().map((header) => header.trim());
const seen = new Set();
const movies = [];

for (const values of csvRows) {
  const row = Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));
  const title = row.Title || "";
  const popularity = Number.parseFloat(row.Popularity);
  const voteAverage = Number.parseFloat(row.Vote_Average);
  const releaseDate = new Date(`${row.Release_Date}T00:00:00Z`);
  if (!title || !Number.isFinite(releaseDate.getTime()) || !Number.isFinite(voteAverage) || !Number.isFinite(popularity)) continue;

  const key = `${title}|${row.Release_Date}`;
  if (seen.has(key)) continue;
  seen.add(key);

  movies.push({
    title,
    release_date: row.Release_Date,
    release_year: releaseDate.getUTCFullYear(),
    overview: row.Overview || "",
    popularity,
    vote_count: Number.parseInt(row.Vote_Count, 10) || 0,
    vote_average: voteAverage,
    language: row.Original_Language || "Unknown",
    genre: row.Genre || "Unknown",
    poster_url: row.Poster_Url || "",
    rating_category: ratingCategory(voteAverage),
    popularity_category: popularityCategory(popularity),
  });
}

movies.sort((a, b) => b.popularity - a.popularity || b.vote_average - a.vote_average);

const genreMap = new Map();
for (const movie of movies) {
  for (const genre of movie.genre.split(",").map((value) => value.trim()).filter(Boolean)) {
    if (!genreMap.has(genre)) genreMap.set(genre, []);
    genreMap.get(genre).push(movie);
  }
}
const genres = [...genreMap.entries()].map(([genre, items]) => ({
  genre,
  count: items.length,
  average_rating: Number((items.reduce((sum, item) => sum + item.vote_average, 0) / items.length).toFixed(2)),
  average_popularity: Number((items.reduce((sum, item) => sum + item.popularity, 0) / items.length).toFixed(2)),
})).sort((a, b) => b.count - a.count).slice(0, 20);

const yearMap = new Map();
for (const movie of movies) {
  if (!yearMap.has(movie.release_year)) yearMap.set(movie.release_year, []);
  yearMap.get(movie.release_year).push(movie);
}
const years = [...yearMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, items]) => ({
  year,
  count: items.length,
  average_rating: Number((items.reduce((sum, item) => sum + item.vote_average, 0) / items.length).toFixed(2)),
}));

const ratings = movies.map((movie) => movie.vote_average);
const popularities = movies.map((movie) => movie.popularity);
const ratingMean = ratings.reduce((sum, value) => sum + value, 0) / (ratings.length || 1);
const popularityMean = popularities.reduce((sum, value) => sum + value, 0) / (popularities.length || 1);
const ratingStddev = Math.sqrt(ratings.reduce((sum, value) => sum + (value - ratingMean) ** 2, 0) / (ratings.length || 1));

function quartile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)))];
}
const sortedRatings = [...ratings].sort((a, b) => a - b);

const analytics = {
  summary: {
    movie_count: movies.length,
    average_rating: Number(ratingMean.toFixed(2)),
    median_rating: Number(median(ratings).toFixed(2)),
    average_popularity: Number(popularityMean.toFixed(2)),
    total_votes: movies.reduce((sum, movie) => sum + movie.vote_count, 0),
    languages: new Set(movies.map((movie) => movie.language)).size,
    genres: genreMap.size,
    date_min: movies.reduce((min, movie) => movie.release_date < min ? movie.release_date : min, movies[0]?.release_date || ""),
    date_max: movies.reduce((max, movie) => movie.release_date > max ? movie.release_date : max, movies[0]?.release_date || ""),
    rating_stddev: Number(ratingStddev.toFixed(2)),
    rating_quartiles: [quartile(sortedRatings, 0.25), quartile(sortedRatings, 0.5), quartile(sortedRatings, 0.75)].map((value) => Number(value.toFixed(2))),
    popularity_rating_correlation: 0,
  },
  rating_categories: countSeries(movies, "rating_category"),
  popularity_categories: countSeries(movies, "popularity_category"),
  languages: countSeries(movies, "language", 12),
  genres,
  years,
  rating_distribution: Array.from({ length: 10 }, (_, value) => ({
    range: `${value}-${value + 1}`,
    count: ratings.filter((rating) => rating >= value && rating < value + 1).length,
  })),
  top_movies: movies.slice(0, 80).map((movie) => ({
    title: movie.title,
    release_year: movie.release_year,
    popularity: movie.popularity,
    vote_average: movie.vote_average,
    vote_count: movie.vote_count,
    language: movie.language,
    genre: movie.genre,
    poster_url: movie.poster_url,
    rating_category: movie.rating_category,
  })),
};

fs.mkdirSync(DATA, { recursive: true });
const cleanRows = [
  Object.keys(movies[0] || {}).join(","),
  ...movies.map((movie) => Object.values(movie).map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")),
];
fs.writeFileSync(path.join(DATA, "movies_clean.csv"), cleanRows.join("\n"), "utf8");
fs.writeFileSync(path.join(DATA, "movies.json"), JSON.stringify(movies), "utf8");
fs.writeFileSync(path.join(DATA, "analytics.json"), JSON.stringify(analytics, null, 2), "utf8");
console.log(`ELT complete: ${csvRows.length + 1} raw rows -> ${movies.length} clean movies`);
