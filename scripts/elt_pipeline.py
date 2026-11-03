import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "mymoviedb.csv"
PUBLIC = ROOT / "public"
DATA = PUBLIC / "data"


def rating_category(value: float) -> str:
    if pd.isna(value):
        return "Unrated"
    if value < 5:
        return "Poor"
    if value < 7:
        return "Average"
    if value < 8:
        return "Good"
    return "Excellent"


def popularity_category(value: float) -> str:
    if pd.isna(value):
        return "Unknown"
    if value < 20:
        return "Low"
    if value < 40:
        return "Medium"
    if value < 100:
        return "High"
    return "Blockbuster"


def load_extract() -> pd.DataFrame:
    return pd.read_csv(SOURCE, engine="python", on_bad_lines="skip")


def transform_extract(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.rename(columns={
        "Release_Date": "release_date",
        "Title": "title",
        "Overview": "overview",
        "Popularity": "popularity",
        "Vote_Count": "vote_count",
        "Vote_Average": "vote_average",
        "Original_Language": "language",
        "Genre": "genre",
        "Poster_Url": "poster_url",
    }).copy()

    df["release_date"] = pd.to_datetime(df["release_date"], errors="coerce")
    for column in ("popularity", "vote_count", "vote_average"):
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=["title", "release_date", "vote_average", "popularity"])
    df = df.drop_duplicates(subset=["title", "release_date"])
    df["release_year"] = df["release_date"].dt.year.astype("Int64")
    df["title"] = df["title"].astype(str).str.strip()
    df["overview"] = df["overview"].fillna("").astype(str).str.strip()
    df["language"] = df["language"].fillna("Unknown").astype(str).str.strip()
    df["genre"] = df["genre"].fillna("Unknown").astype(str).str.strip()
    df["poster_url"] = df["poster_url"].fillna("").astype(str).str.strip()
    df["vote_count"] = df["vote_count"].fillna(0).astype(int)
    df["rating_category"] = df["vote_average"].map(rating_category)
    df["popularity_category"] = df["popularity"].map(popularity_category)
    return df.sort_values(["popularity", "vote_average"], ascending=False).reset_index(drop=True)


def genre_rows(df: pd.DataFrame) -> list[dict]:
    groups = defaultdict(list)
    counts = Counter()
    for _, row in df.iterrows():
        for genre in [item.strip() for item in str(row["genre"]).split(",") if item.strip()]:
            groups[genre].append((float(row["vote_average"]), float(row["popularity"])))
            counts[genre] += 1
    return [
        {
            "genre": genre,
            "count": count,
            "average_rating": round(sum(r for r, _ in values) / count, 2),
            "average_popularity": round(sum(p for _, p in values) / count, 2),
        }
        for genre, (count, values) in sorted(
            ((genre, (counts[genre], values)) for genre, values in groups.items()),
            key=lambda item: item[1][0],
            reverse=True,
        )
    ]


def count_series(values: pd.Series, field_name: str, limit: int | None = None) -> list[dict]:
    rows = [
        {field_name: str(key), "count": int(value)}
        for key, value in values.value_counts(dropna=False).items()
        if str(key).strip()
    ]
    return rows[:limit] if limit else rows


def analyze(df: pd.DataFrame) -> dict:
    genres = genre_rows(df)
    years = (
        df.dropna(subset=["release_year"])
        .groupby("release_year", as_index=False)
        .agg(count=("title", "size"), average_rating=("vote_average", "mean"))
        .sort_values("release_year")
    )
    year_rows = [
        {"year": int(row.release_year), "count": int(row.count), "average_rating": round(float(row.average_rating), 2)}
        for row in years.itertuples(index=False)
        if pd.notna(row.release_year)
    ]
    rating = df["vote_average"]
    popularity = df["popularity"]
    top_movies = [
        {
            "title": row.title,
            "release_year": int(row.release_year) if pd.notna(row.release_year) else None,
            "popularity": round(float(row.popularity), 2),
            "vote_average": round(float(row.vote_average), 2),
            "vote_count": int(row.vote_count),
            "language": row.language,
            "genre": row.genre,
            "poster_url": row.poster_url,
            "rating_category": row.rating_category,
        }
        for row in df.head(80).itertuples(index=False)
    ]
    bins = list(range(0, 11))
    histogram = [
        {"range": f"{value}-{value + 1}", "count": int(((rating >= value) & (rating < value + 1)).sum())}
        for value in bins
    ]
    return {
        "summary": {
            "movie_count": int(len(df)),
            "average_rating": round(float(rating.mean()), 2),
            "median_rating": round(float(rating.median()), 2),
            "average_popularity": round(float(popularity.mean()), 2),
            "total_votes": int(df["vote_count"].sum()),
            "languages": int(df["language"].nunique()),
            "genres": int(len(genres)),
            "date_min": df["release_date"].min().strftime("%Y-%m-%d"),
            "date_max": df["release_date"].max().strftime("%Y-%m-%d"),
            "rating_stddev": round(float(rating.std()), 2),
            "popularity_rating_correlation": round(float(df[["popularity", "vote_average"]].corr().iloc[0, 1]), 3),
            "rating_quartiles": [round(float(value), 2) for value in rating.quantile([0.25, 0.5, 0.75]).tolist()],
        },
        "rating_categories": count_series(df["rating_category"], "category"),
        "popularity_categories": count_series(df["popularity_category"], "category"),
        "languages": count_series(df["language"], "language", 12),
        "genres": genres[:20],
        "years": year_rows,
        "rating_distribution": histogram,
        "top_movies": top_movies,
    }


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    raw = load_extract()
    df = transform_extract(raw)

    df.to_csv(DATA / "movies_clean.csv", index=False, quoting=csv.QUOTE_MINIMAL)
    analytics = analyze(df)
    with (DATA / "analytics.json").open("w", encoding="utf-8") as file:
        json.dump(analytics, file, ensure_ascii=False, indent=2)

    catalog = [
        {
            "title": row.title,
            "release_date": row.release_date.strftime("%Y-%m-%d"),
            "release_year": int(row.release_year),
            "overview": row.overview,
            "popularity": round(float(row.popularity), 2),
            "vote_count": int(row.vote_count),
            "vote_average": round(float(row.vote_average), 2),
            "language": row.language,
            "genre": row.genre,
            "poster_url": row.poster_url,
            "rating_category": row.rating_category,
            "popularity_category": row.popularity_category,
        }
        for row in df.itertuples(index=False)
    ]
    with (DATA / "movies.json").open("w", encoding="utf-8") as file:
        json.dump(catalog, file, ensure_ascii=False)

    print(f"ELT complete: {len(raw)} raw rows -> {len(df)} clean movies")
    print(f"Saved analytics and catalog to {DATA}")


if __name__ == "__main__":
    main()
