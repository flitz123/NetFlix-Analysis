# CineScope Movie Intelligence

CineScope is a Vercel-ready movie analytics dashboard built from `mymoviedb.csv`.

## Features

- Reproducible ELT pipeline with malformed-row handling, normalization, deduplication, and categorization
- Clean movie catalog and analytical JSON exports
- Rating, popularity, genre, language, year, and distribution analysis
- Searchable, sortable, and filterable catalog
- Movie detail modal and CSV download
- Responsive desktop and mobile interface

## Run locally

```powershell
npm run build
npm run dev
```

Then open `http://localhost:4173`.

## Deploy to Vercel

1. Import this Git repository in Vercel.
2. Use the repository root as the project directory.
3. Set the build command to `npm run build`.
4. Set the output directory to `public`.
5. Deploy.
